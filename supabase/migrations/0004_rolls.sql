-- =====================================================================
-- 0004 (ticket P1-5): server-side d20 rolls and an append-only roll log.
--
-- TRUST BOUNDARY
-- In Phase 1 the dice are rolled on the server, but the bonus and the target number are supplied by the client
-- and stored with the roll so the DM can see them. From Phase 2 the server will compute the bonus from the
-- stored character.
--
-- The die itself is never the client's: public.d20() draws from pgcrypto's gen_random_bytes with rejection
-- sampling, and rolls can only be created by public.roll_d20(). Nobody can edit or delete a roll afterwards,
-- not even the database owner: a trigger refuses it (only deleting the whole campaign removes its rolls).
-- =====================================================================

-- gen_random_bytes, a cryptographically strong source (random() is predictable and must not be used for dice)
create extension if not exists pgcrypto with schema extensions;

create table public.rolls (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- the characters table arrives with P1-7, which adds the foreign key
  character_id uuid,
  rolled_by uuid not null default auth.uid() references auth.users (id),
  kind text not null check (kind in ('check', 'save', 'attack', 'damage', 'initiative', 'death_save', 'other')),
  label text not null check (char_length(label) between 1 and 80),
  bonus int not null check (bonus between -20 and 40),
  target int,
  mode text not null check (mode in ('normal', 'advantage', 'disadvantage')),
  -- the d20 results: one for a normal roll, two for advantage or disadvantage
  dice int[] not null check (
    cardinality(dice) = case when mode = 'normal' then 1 else 2 end
    and 1 <= all (dice) and 20 >= all (dice)
  ),
  kept int not null check (kept between 1 and 20),
  total int not null,
  success boolean,
  crit boolean not null default false,
  fumble boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index rolls_campaign_created_idx on public.rolls (campaign_id, created_at desc);
create index rolls_rate_limit_idx on public.rolls (rolled_by, created_at desc);

-- ROW LEVEL SECURITY: read only. There are no insert, update or delete policies for any role.
alter table public.rolls enable row level security;
create policy "read rolls" on public.rolls for select to authenticated
  using (is_dm(campaign_id) or (is_member(campaign_id) and not hidden));
revoke insert, update, delete, truncate on public.rolls from anon, authenticated;

-- The log is append-only, even for privileged roles. Deleting the whole campaign is the one exception: by the
-- time its cascade reaches the rolls, the campaign row is already gone.
create function public.rolls_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from campaigns where id = old.campaign_id) then
    return old;
  end if;
  raise exception 'The roll log is append-only: rolls cannot be changed or deleted';
end $$;
create trigger rolls_append_only_trg before update or delete on public.rolls
  for each row execute function public.rolls_append_only();

create function public.rolls_no_truncate() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'The roll log is append-only: rolls cannot be changed or deleted';
end $$;
create trigger rolls_no_truncate_trg before truncate on public.rolls
  for each statement execute function public.rolls_no_truncate();

-- One fair d20. A random byte is 0-255; only 0-239 are kept (240 = 12 x 20), so every face has exactly
-- 12 of the 240 accepted values. Bytes 240-255 are thrown away and drawn again.
create function public.d20() returns int
language plpgsql volatile set search_path = public, extensions as $$
declare b int;
begin
  loop
    b := get_byte(extensions.gen_random_bytes(1), 0);
    if b < 240 then
      return b % 20 + 1;
    end if;
  end loop;
end $$;

-- The rules for a roll, kept apart from the randomness so they can be tested with chosen dice.
-- Attack rolls: a natural 20 hits and is a critical hit, a natural 1 misses and is a fumble. Every other roll
-- succeeds only when the total meets the target: no automatic success or failure on 20 or 1. No target, no
-- verdict (success is null).
create function public.roll_outcome(
  p_kind text, p_mode text, p_dice int[], p_bonus int, p_target int,
  out kept int, out total int, out success boolean, out crit boolean, out fumble boolean
)
language plpgsql immutable set search_path = public as $$
begin
  kept := case p_mode
    when 'advantage' then greatest(p_dice[1], p_dice[2])
    when 'disadvantage' then least(p_dice[1], p_dice[2])
    else p_dice[1]
  end;
  total := kept + p_bonus;
  crit := p_kind = 'attack' and kept = 20;
  fumble := p_kind = 'attack' and kept = 1;
  success := case
    when p_target is null then null
    when crit then true
    when fumble then false
    else total >= p_target
  end;
end $$;

create function public.roll_d20(
  p_campaign uuid, p_character uuid, p_kind text, p_label text, p_bonus int, p_target int, p_mode text,
  p_hidden boolean default false
) returns public.rolls
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  dice int[];
  o record;
  result public.rolls;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not is_member(p_campaign) then
    raise exception 'Only members of this campaign can roll here' using errcode = '42501';
  end if;
  if coalesce(p_hidden, false) and not is_dm(p_campaign) then
    raise exception 'Only the DM can make a hidden roll' using errcode = '42501';
  end if;
  -- Characters arrive with P1-7, which replaces this check with "the character is yours, or you are the DM".
  -- Until then only a DM may roll for a character.
  if p_character is not null and not is_dm(p_campaign) then
    raise exception 'You can only roll for your own character' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('normal', 'advantage', 'disadvantage') then
    raise exception 'The roll mode must be normal, advantage or disadvantage' using errcode = '22023';
  end if;
  -- at most 30 rolls a minute per person; PT429 makes the API answer 429 Too Many Requests
  if (select count(*) from rolls where rolled_by = me and created_at > now() - interval '60 seconds') >= 30 then
    raise exception 'Too many rolls in the last minute. Wait a moment and roll again.' using errcode = 'PT429';
  end if;

  dice := case when p_mode = 'normal' then array[d20()] else array[d20(), d20()] end;
  o := roll_outcome(p_kind, p_mode, dice, p_bonus, p_target);

  insert into rolls (campaign_id, character_id, rolled_by, kind, label, bonus, target, mode, dice, kept, total,
                     success, crit, fumble, hidden)
  values (p_campaign, p_character, me, p_kind, p_label, p_bonus, p_target, p_mode, dice, o.kept, o.total,
          o.success, o.crit, o.fumble, coalesce(p_hidden, false))
  returning * into result;
  return result;
end $$;

-- Only roll_d20 is open to signed-in users. The die and the trigger functions are never called directly.
revoke execute on function public.d20(), public.rolls_append_only(), public.rolls_no_truncate()
  from public, anon, authenticated;
revoke execute on function public.roll_outcome(text, text, int[], int, int) from public, anon;
grant execute on function public.roll_outcome(text, text, int[], int, int) to authenticated;
revoke execute on function public.roll_d20(uuid, uuid, text, text, int, int, text, boolean) from public, anon;
grant execute on function public.roll_d20(uuid, uuid, text, text, int, int, text, boolean) to authenticated;

-- Members receive new rolls live; realtime applies the select policy above, so hidden rolls reach only DMs.
alter publication supabase_realtime add table public.rolls;
