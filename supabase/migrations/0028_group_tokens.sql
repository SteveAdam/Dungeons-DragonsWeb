-- =====================================================================
-- 0028: party group tokens on the map, the spotlight and the "N inside" counts (P4-2).
--   * party_groups gain x and y (image pixels, both or neither): where the group's token stands on its map. Moving a
--     group to another map clears them, so a token is never drawn at a spot that belongs to a different map.
--   * By default a player reads only their own group. With campaigns.settings.shareGroupPositions on, they also read
--     the other groups' name, colour, place and member count (never their members, hit points or discoveries: those
--     tables keep their own policies).
--   * campaign_spotlight is the one group the DM has put in the spotlight. Players never read the table; they call
--     get_spotlight, which says only what the banner needs, so a group's place is shown only because the DM chose to.
--   * group_entrance_counts(map) says how many characters stand beneath each pin or region of a map that has a map
--     of its own, counting every map further down. It follows the same visibility as the tokens.
-- =====================================================================

alter table public.party_groups
  add column x double precision,
  add column y double precision,
  add constraint party_groups_position_check check ((x is null) = (y is null) and (x is null or (x >= 0 and y >= 0)));

-- A group that goes to another map leaves its old spot behind, unless the same change gives it a new one.
create function public.party_groups_clear_position() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.map_id is distinct from old.map_id and new.x is not distinct from old.x and new.y is not distinct from old.y then
    new.x := null;
    new.y := null;
  end if;
  return new;
end $$;
create trigger party_groups_clear_position_trg before update of map_id on public.party_groups
  for each row execute function public.party_groups_clear_position();

create function public.group_positions_shared(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select settings ->> 'shareGroupPositions' = 'true' from campaigns where id = c), false)
$$;

drop policy "read own groups" on public.party_groups;
create policy "read visible groups" on public.party_groups for select to authenticated
  using (is_dm(campaign_id) or in_group(id) or (is_member(campaign_id) and group_positions_shared(campaign_id)));

-- how many characters a group has, whoever asks: a computed column, so a player can be shown a count for a group whose
-- members they cannot read
create function public.group_member_count(g public.party_groups) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from party_group_members where group_id = g.id
$$;

-- THE SPOTLIGHT ---------------------------------------------------------------------------------

create table public.campaign_spotlight (
  campaign_id uuid primary key references public.campaigns (id) on delete cascade,
  group_id uuid references public.party_groups (id) on delete set null,
  summary text not null default '' check (char_length(summary) <= 200),
  updated_at timestamptz not null default now()
);
alter table public.campaign_spotlight enable row level security;
create policy "dm reads the spotlight" on public.campaign_spotlight for select to authenticated
  using (is_dm(campaign_id));
revoke all on public.campaign_spotlight from anon;

-- DM only. A null group takes the spotlight away.
create function public.set_spotlight(p_campaign uuid, p_group uuid, p_summary text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_dm(p_campaign) then
    raise exception 'Only the DM can do that' using errcode = '42501';
  end if;
  if p_group is not null and group_campaign(p_group) is distinct from p_campaign then
    raise exception 'That group is not in this campaign' using errcode = '22023';
  end if;
  if char_length(coalesce(p_summary, '')) > 200 then
    raise exception 'The summary can be up to 200 characters' using errcode = '22023';
  end if;
  insert into campaign_spotlight (campaign_id, group_id, summary, updated_at)
    values (p_campaign, p_group, case when p_group is null then '' else btrim(coalesce(p_summary, '')) end, now())
  on conflict (campaign_id) do update
    set group_id = excluded.group_id, summary = excluded.summary, updated_at = excluded.updated_at;
end $$;

-- Who has the spotlight, for the banner: the group's name, where it is and the DM's line. No row means nobody does.
create function public.get_spotlight(p_campaign uuid)
returns table (group_id uuid, group_name text, place text, summary text, mine boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_member(p_campaign) then
    raise exception 'Only a member can do that' using errcode = '42501';
  end if;
  return query
    select g.id, g.name,
           coalesce((select r.name from regions r where r.id = g.region_id),
                    (select m.name from maps m where m.id = g.map_id),
                    'an unknown place'),
           s.summary, in_group(g.id)
    from campaign_spotlight s join party_groups g on g.id = s.group_id
    where s.campaign_id = p_campaign;
end $$;

-- ENTRANCES AND WHO IS BENEATH THEM --------------------------------------------------------------------

-- For each pin or region of p_map that has a map beneath it: the characters in groups standing on that map or any map
-- below it. A player is counted only the groups they may see, and only entrances they may see.
create function public.group_entrance_counts(p_map uuid)
returns table (kind text, entrance_id uuid, members integer)
language plpgsql stable security definer set search_path = public as $$
declare
  c uuid := map_campaign(p_map);
begin
  if c is null or auth.uid() is null or not is_member(c) then
    raise exception 'Only a member can do that' using errcode = '42501';
  end if;
  if not is_dm(c) and not map_is_revealed(p_map) then
    return;
  end if;
  return query
    with recursive chain (gid, mid, depth, ekind, eid, emap, evisible) as (
      select g.id, g.map_id, 0, null::text, null::uuid, null::uuid, true
      from party_groups g where g.campaign_id = c and g.map_id is not null
      union all
      select ch.gid, e.map_id, ch.depth + 1, e.kind, e.id, e.map_id, e.visible
      from chain ch
      join maps m on m.id = ch.mid
      cross join lateral (
        select 'pin'::text as kind, pn.id, pn.map_id, pn.visible_to_players as visible from pins pn where pn.id = m.parent_pin_id
        union all
        select 'region'::text, rg.id, rg.map_id, rg.visible_to_players from regions rg where rg.id = m.parent_region_id
      ) e
      where ch.depth < 20
    )
    select ch.ekind, ch.eid, sum((select count(*) from party_group_members pm where pm.group_id = ch.gid))::integer
    from chain ch
    where ch.emap = p_map and ch.ekind is not null
      and (is_dm(c) or ch.evisible)
      and (is_dm(c) or in_group(ch.gid) or group_positions_shared(c))
    group by ch.ekind, ch.eid
    having sum((select count(*) from party_group_members pm where pm.group_id = ch.gid)) > 0;
end $$;

revoke execute on function public.group_positions_shared(uuid), public.group_member_count(public.party_groups),
  public.set_spotlight(uuid, uuid, text), public.get_spotlight(uuid), public.group_entrance_counts(uuid)
  from public, anon;
grant execute on function public.group_positions_shared(uuid), public.group_member_count(public.party_groups),
  public.set_spotlight(uuid, uuid, text), public.get_spotlight(uuid), public.group_entrance_counts(uuid)
  to authenticated;
