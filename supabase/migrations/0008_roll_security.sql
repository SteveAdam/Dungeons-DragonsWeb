-- =====================================================================
-- 0008 (ticket P2-2): the server computes the roll bonus. Closes the Phase 1 trust boundary.
--
-- Until now the browser sent the bonus to roll_d20, so a player could edit the request and roll +30. From here:
--   * roll_d20 is open to the service role only. Rolls go through the Edge Function `roll`
--     (supabase/functions/roll), which works the bonus out from the stored character with the rules engine and
--     then calls roll_d20 with the service role, naming the caller as p_actor.
--   * The character sheet, conditions and exhaustion can only be changed by a DM (or the service role). If a
--     player could still edit their own sheet, a Strength of 30 would be a server-computed +10, and the server
--     computing the bonus would mean nothing. Players stop creating characters directly too: the creation
--     wizard (P2-9) goes through its own server function.
--   * campaigns.game_seconds is the in-game clock that effect durations are measured against (the clock UI comes
--     with P2-8). Effects that were timed against real time (Phase 1) are converted to it.
-- =====================================================================

-- GAME CLOCK -----------------------------------------------------------

alter table public.campaigns
  add column game_seconds bigint not null default 0 check (game_seconds >= 0);

-- Phase 1 timed effects against real time (seconds since 1970). The clock now starts at 0, so an effect that
-- had an hour left now ends at 3600, and one that already ran out ends at 0 (over at once).
update public.effects
set duration = jsonb_build_object(
  'kind', 'until',
  'atSeconds', greatest(0, (duration ->> 'atSeconds')::bigint - extract(epoch from now())::bigint)
)
where duration ->> 'kind' = 'until' and (duration ->> 'atSeconds')::bigint > 1000000000;

-- CONDITIONS ON THE CHARACTER ------------------------------------------
-- The server resolves advantage and disadvantage only from what it knows, so the conditions live in the
-- database (set by the DM), not in the request.

alter table public.characters
  add column conditions text[] not null default '{}' check (conditions <@ array[
    'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed',
    'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'
  ]::text[]),
  add column exhaustion int not null default 0 check (exhaustion between 0 and 6);

-- ROLLS RECORD HOW THE BONUS WAS MADE ----------------------------------

-- [{ "label": "Strength", "value": 3 }, { "label": "Proficiency", "value": 3 }]; null for older rolls
alter table public.rolls
  add column bonus_breakdown jsonb check (bonus_breakdown is null or jsonb_typeof(bonus_breakdown) = 'array');

-- ONLY A DM CHANGES THE SHEET ------------------------------------------

-- auth.uid() is null only for the database owner and the service role (seeding, server functions).
create or replace function public.characters_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  by_player boolean := auth.uid() is not null and not is_dm(new.campaign_id);
begin
  if tg_op = 'UPDATE' and (new.owner_id is distinct from old.owner_id or new.campaign_id is distinct from old.campaign_id) then
    raise exception 'A character keeps its owner and its campaign';
  end if;
  if not exists (select 1 from members where campaign_id = new.campaign_id and user_id = new.owner_id) then
    raise exception 'A character''s owner must be a member of its campaign';
  end if;
  if by_player and ((tg_op = 'INSERT' and new.xp <> 0) or (tg_op = 'UPDATE' and new.xp is distinct from old.xp)) then
    raise exception 'Only the DM can change XP';
  end if;
  if by_player and tg_op = 'UPDATE' and (
    new.sheet is distinct from old.sheet
    or new.conditions is distinct from old.conditions
    or new.exhaustion is distinct from old.exhaustion
  ) then
    raise exception 'Only the DM can change a character sheet';
  end if;
  return new;
end $$;

drop policy "members create their own characters" on public.characters;
create policy "dms create characters" on public.characters for insert to authenticated
  with check (is_dm(campaign_id));

-- ROLL_D20, FOR THE SERVICE ROLE ONLY ----------------------------------
-- The service role has no auth.uid(), so the Edge Function names the person rolling (p_actor), after checking
-- their token. Every check below is about p_actor. The bonus must add up to its breakdown, so the log always
-- shows where each point came from.

drop function public.roll_d20(uuid, uuid, text, text, int, int, text, boolean);

create function public.roll_d20(
  p_actor uuid, p_campaign uuid, p_character uuid, p_kind text, p_label text, p_bonus int, p_target int,
  p_mode text, p_hidden boolean default false, p_breakdown jsonb default null
) returns public.rolls
language plpgsql volatile security definer set search_path = public as $$
declare
  actor_is_dm boolean;
  dice int[];
  o record;
  result public.rolls;
begin
  if p_actor is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not exists (select 1 from members where campaign_id = p_campaign and user_id = p_actor) then
    raise exception 'Only members of this campaign can roll here' using errcode = '42501';
  end if;
  actor_is_dm := exists (select 1 from members where campaign_id = p_campaign and user_id = p_actor and role = 'dm');
  if coalesce(p_hidden, false) and not actor_is_dm then
    raise exception 'Only the DM can make a hidden roll' using errcode = '42501';
  end if;
  -- a character must be in this campaign, and be yours unless you are the DM
  if p_character is not null and not exists (
    select 1 from characters
    where id = p_character and campaign_id = p_campaign and (owner_id = p_actor or actor_is_dm)
  ) then
    raise exception 'You can only roll for your own character' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('normal', 'advantage', 'disadvantage') then
    raise exception 'The roll mode must be normal, advantage or disadvantage' using errcode = '22023';
  end if;
  if p_breakdown is not null and (
    jsonb_typeof(p_breakdown) <> 'array'
    or (select coalesce(sum((part ->> 'value')::int), 0) from jsonb_array_elements(p_breakdown) part) <> p_bonus
  ) then
    raise exception 'The bonus must add up to its breakdown' using errcode = '22023';
  end if;
  -- at most 30 rolls a minute per person; PT429 makes the API answer 429 Too Many Requests
  if (select count(*) from rolls where rolled_by = p_actor and created_at > now() - interval '60 seconds') >= 30 then
    raise exception 'Too many rolls in the last minute. Wait a moment and roll again.' using errcode = 'PT429';
  end if;

  dice := case when p_mode = 'normal' then array[d20()] else array[d20(), d20()] end;
  o := roll_outcome(p_kind, p_mode, dice, p_bonus, p_target);

  insert into rolls (campaign_id, character_id, rolled_by, kind, label, bonus, bonus_breakdown, target, mode, dice,
                     kept, total, success, crit, fumble, hidden)
  values (p_campaign, p_character, p_actor, p_kind, p_label, p_bonus, p_breakdown, p_target, p_mode, dice,
          o.kept, o.total, o.success, o.crit, o.fumble, coalesce(p_hidden, false))
  returning * into result;
  return result;
end $$;

revoke execute on function public.roll_d20(uuid, uuid, uuid, text, text, int, int, text, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.roll_d20(uuid, uuid, uuid, text, text, int, int, text, boolean, jsonb)
  to service_role;
