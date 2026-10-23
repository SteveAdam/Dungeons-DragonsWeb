-- =====================================================================
-- 0016 (ticket P2-10): the level-up flow.
--
--   * A rolled hit point gain is a server roll of the character's Hit Point Die (roll_hit_die), logged in the roll
--     log as 'hit_die' with the level it is for in `target`. One unused roll per character and level: a player
--     cannot roll again until the level is applied.
--   * level_up_events is the audit log of applied levels (append-only, like the roll log): from and to level, the
--     choices, the hit points gained and the roll used.
--   * apply_level_up_from_function writes the new sheet and level_applied and the audit row in one step. Only the
--     service role calls it: the apply-level-up Edge Function checks the choices and builds the sheet first.
--   * campaigns.settings.optionalFeats (absent means false) says whether players may take a feat instead of an
--     Ability Score Improvement. The SRD feat list comes later.
-- =====================================================================

-- HIT POINT DIE ROLLS ------------------------------------------------------------------

alter table public.rolls drop constraint rolls_kind_check;
alter table public.rolls add constraint rolls_kind_check
  check (kind in ('check', 'save', 'attack', 'damage', 'initiative', 'death_save', 'other', 'ability_roll', 'hit_die'));
alter table public.rolls drop constraint rolls_dice_check;
alter table public.rolls add constraint rolls_dice_check check (
  case kind
    when 'ability_roll' then cardinality(dice) = 24 and 1 <= all (dice) and 6 >= all (dice)
    when 'hit_die' then cardinality(dice) = 1 and 1 <= all (dice) and 12 >= all (dice)
    else cardinality(dice) = case when mode = 'normal' then 1 else 2 end and 1 <= all (dice) and 20 >= all (dice)
  end
);

create table public.level_up_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- no foreign key: the log outlives the character, and is never changed
  character_id uuid not null,
  from_level int not null check (from_level between 1 and 19),
  to_level int not null check (to_level = from_level + 1),
  choices jsonb not null check (jsonb_typeof(choices) = 'object'),
  hp_gain int not null check (hp_gain >= 1),
  roll_id uuid,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index level_up_events_character_idx on public.level_up_events (character_id, to_level);
create unique index level_up_events_roll_key on public.level_up_events (roll_id) where roll_id is not null;

create function public.level_up_events_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from campaigns where id = old.campaign_id) then
    return old;
  end if;
  raise exception 'The level-up log is append-only: entries cannot be changed or deleted';
end $$;
create trigger level_up_events_append_only_trg before update or delete on public.level_up_events
  for each row execute function public.level_up_events_append_only();

alter table public.level_up_events enable row level security;
create policy "read level ups" on public.level_up_events for select to authenticated
  using (is_dm(campaign_id) or owns_character(character_id));
revoke insert, update, delete on public.level_up_events from anon, authenticated;

-- The XP needed for each level (SRD Character Advancement), for checking a pending level in the database.
create function public.level_from_xp(xp int) returns int
language sql immutable set search_path = public as $$
  select 1 + count(*)::int from unnest(array[300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000,
                                            120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]) t
  where xp >= t
$$;

-- The character's unused Hit Point Die roll for a level, if any.
create function public.unused_hit_die_roll(p_character uuid, p_level int) returns public.rolls
language sql stable security definer set search_path = public as $$
  select r.* from rolls r
  where r.character_id = p_character and r.kind = 'hit_die' and r.target = p_level
    and not exists (select 1 from level_up_events e where e.roll_id = r.id)
  order by r.created_at desc
  limit 1
$$;

-- The owner (or the DM) rolls the character's Hit Point Die for the next level, which must be pending.
create function public.roll_hit_die(p_character uuid) returns public.rolls
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  ch characters;
  next_level int;
  sides int;
  die int;
  result rolls;
begin
  select * into ch from characters where id = p_character;
  if me is null or ch.id is null or not (ch.owner_id = me or is_dm(ch.campaign_id)) then
    raise exception 'You can only roll for your own character' using errcode = '42501';
  end if;
  next_level := ch.level_applied + 1;
  if level_from_xp(ch.xp) < next_level then
    raise exception 'No level-up is waiting: the character needs more XP' using errcode = '22023';
  end if;
  if (unused_hit_die_roll(p_character, next_level)).id is not null then
    raise exception 'You have already rolled for this level: use that roll' using errcode = '22023';
  end if;
  sides := case ch.sheet -> 'hitDice' ->> 'die' when 'd6' then 6 when 'd8' then 8 when 'd10' then 10 when 'd12' then 12 end;
  if sides is null then
    raise exception 'This sheet has no Hit Point Die to roll' using errcode = '22023';
  end if;
  if (select count(*) from rolls where rolled_by = me and created_at > now() - interval '60 seconds') >= 30 then
    raise exception 'Too many rolls in the last minute. Wait a moment and roll again.' using errcode = 'PT429';
  end if;
  die := roll_die(sides);
  insert into rolls (campaign_id, character_id, rolled_by, kind, label, bonus, target, mode, dice, kept, total)
  values (ch.campaign_id, p_character, me, 'hit_die', format('Hit points for level %s (d%s)', next_level, sides), 0,
          next_level, 'normal', array[die], die, die)
  returning * into result;
  return result;
end $$;

-- For the apply-level-up Edge Function (service role) only, after it has checked the choices and built the sheet.
-- The level must still be the one the function checked (p_from), so two level-ups sent at once cannot both apply.
create function public.apply_level_up_from_function(
  p_actor uuid, p_character uuid, p_from int, p_sheet jsonb, p_choices jsonb, p_hp_gain int, p_roll uuid default null
) returns public.level_up_events
language plpgsql security definer set search_path = public as $$
declare
  ch characters;
  result level_up_events;
begin
  select * into ch from characters where id = p_character for update;
  if ch.id is null or not (ch.owner_id = p_actor or exists (
    select 1 from members where campaign_id = ch.campaign_id and user_id = p_actor and role = 'dm'
  )) then
    raise exception 'You can only level up your own character' using errcode = '42501';
  end if;
  if ch.level_applied <> p_from then
    raise exception 'The character is no longer at level %: reload and try again', p_from using errcode = '22023';
  end if;
  if level_from_xp(ch.xp) <= p_from then
    raise exception 'No level-up is waiting: the character needs more XP' using errcode = '22023';
  end if;
  if p_roll is not null and (unused_hit_die_roll(p_character, p_from + 1)).id is distinct from p_roll then
    raise exception 'That hit point roll is not this level''s unused roll' using errcode = '22023';
  end if;
  update characters
     set sheet = p_sheet - 'name' - 'xp' - 'levelApplied', level_applied = p_from + 1
   where id = p_character;
  insert into level_up_events (campaign_id, character_id, from_level, to_level, choices, hp_gain, roll_id, created_by)
  values (ch.campaign_id, p_character, p_from, p_from + 1, p_choices, p_hp_gain, p_roll, p_actor)
  returning * into result;
  return result;
end $$;

revoke execute on function
  public.level_up_events_append_only(), public.level_from_xp(int), public.unused_hit_die_roll(uuid, int),
  public.roll_hit_die(uuid), public.apply_level_up_from_function(uuid, uuid, int, jsonb, jsonb, int, uuid)
from public, anon, authenticated;
grant execute on function public.roll_hit_die(uuid) to authenticated;
grant execute on function public.apply_level_up_from_function(uuid, uuid, int, jsonb, jsonb, int, uuid),
  public.unused_hit_die_roll(uuid, int) to service_role;
