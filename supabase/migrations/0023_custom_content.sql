-- P3-6: a DM's own spells, monsters, weapons, armour and items. DMs only: players meet them through what the DM
-- places (a monster in a region, an item on a character), never through this table.
create table public.custom_content (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  kind text not null check (kind in ('spell', 'monster', 'weapon', 'armor', 'item')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- the SRD id it was cloned from; null for an entry started from a template
  parent_ref text check (char_length(parent_ref) between 1 and 120),
  definition jsonb not null default '{}' check (jsonb_typeof(definition) = 'object'),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, kind, name)
);

create function public.custom_content_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger custom_content_touch_trg before update on public.custom_content
  for each row execute function public.custom_content_touch();

alter table public.custom_content enable row level security;

create policy "dm reads custom content" on public.custom_content for select to authenticated
  using (is_dm(campaign_id));
create policy "dm adds custom content" on public.custom_content for insert to authenticated
  with check (is_dm(campaign_id));
create policy "dm changes custom content" on public.custom_content for update to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));

-- deleting goes through delete_custom_content, which refuses an entry still in use
revoke all on public.custom_content from anon;
revoke delete on public.custom_content from authenticated;

-- A monster placed in a region is 'custom:<id>' in region_content.monster_ref; an item made from an entry is the same
-- in items.srd_ref.
create function public.delete_custom_content(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c uuid;
  ref text := 'custom:' || p_id;
begin
  select campaign_id into c from custom_content where id = p_id;
  if c is null then
    raise exception 'We could not find that entry' using errcode = '42501';
  end if;
  perform require_dm(c);
  if exists (select 1 from region_content where monster_ref = ref) then
    raise exception 'This entry is placed in a region. Remove it from the region first.' using errcode = '23503';
  end if;
  if exists (select 1 from items where srd_ref = ref) then
    raise exception 'An item was made from this entry. Remove the item first.' using errcode = '23503';
  end if;
  delete from custom_content where id = p_id;
end $$;

revoke execute on function public.delete_custom_content(uuid) from public, anon;
grant execute on function public.delete_custom_content(uuid) to authenticated;
