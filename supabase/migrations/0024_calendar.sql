-- P3-7: each campaign's own calendar, world events, an absolute in-game day on pages, and setting the clock to a date.
-- The calendar only says how a day is written: dates are stored as absolute days (day 1 is game_seconds 0).
create table public.calendars (
  campaign_id uuid primary key references public.campaigns (id) on delete cascade,
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.calendars enable row level security;
create policy "members read the calendar" on public.calendars for select to authenticated
  using (is_member(campaign_id));
create policy "dm writes the calendar" on public.calendars for all to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));
revoke all on public.calendars from anon;

-- NOTES AND SESSION LOGS ------------------------------------------------------------

alter table public.pages add column ingame_day integer check (ingame_day >= 1);

-- ingame_date is the old free text: kept so nothing is lost, and shown read-only beside its Convert button
create function public.pages_legacy_date_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.ingame_date is distinct from old.ingame_date then
    raise exception 'The old in-game date text is read-only: set ingame_day instead' using errcode = '22023';
  end if;
  return new;
end $$;

create trigger pages_legacy_date_guard_trg before update of ingame_date on public.pages
  for each row execute function public.pages_legacy_date_guard();

-- WORLD EVENTS ----------------------------------------------------------------------

create table public.world_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  day integer not null check (day >= 1),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  visible_to_players boolean not null default false,
  entity_id uuid references public.entities (id) on delete set null,
  created_at timestamptz not null default now()
);
create index world_events_campaign_idx on public.world_events (campaign_id, day);

create function public.world_events_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.entity_id is not null
     and not exists (select 1 from entities where id = new.entity_id and campaign_id = new.campaign_id) then
    raise exception 'That entry belongs to another campaign' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger world_events_check_trg before insert or update of entity_id, campaign_id on public.world_events
  for each row execute function public.world_events_check();

alter table public.world_events enable row level security;
create policy "dm manages world events" on public.world_events for all to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));
create policy "members read visible world events" on public.world_events for select to authenticated
  using (visible_to_players and is_member(campaign_id));
revoke all on public.world_events from anon;

-- SETTING THE CLOCK TO A DATE -------------------------------------------------------

-- The log used to allow forward moves only; a confirmed rewind is written to it as well.
alter table public.game_clock_events drop constraint game_clock_events_check;
alter table public.game_clock_events add constraint game_clock_events_moves
  check (to_seconds <> from_seconds and to_seconds >= 0);

-- DM only: puts the clock at this absolute day and time. Going back needs p_confirm_rewind, and is logged as a rewind.
-- Unlike advance_clock this has no 365-day limit, since a calendar's first date can be centuries before today.
create function public.set_game_date(
  p_campaign uuid, p_day integer, p_seconds_into_day integer default 0, p_reason text default '',
  p_confirm_rewind boolean default false
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  was bigint;
  target bigint;
  why text := left(btrim(coalesce(p_reason, '')), 180);
begin
  perform require_dm(p_campaign);
  if p_day is null or p_day < 1 then
    raise exception 'Choose a day from day 1 on' using errcode = '22023';
  end if;
  if p_seconds_into_day is null or p_seconds_into_day < 0 or p_seconds_into_day >= 86400 then
    raise exception 'The time of day must be within the day' using errcode = '22023';
  end if;
  target := (p_day::bigint - 1) * 86400 + p_seconds_into_day;
  select game_seconds into was from campaigns where id = p_campaign for update;
  if target = was then
    return was;
  end if;
  if target < was and not coalesce(p_confirm_rewind, false) then
    raise exception 'That date is in the past. Confirm the rewind to move the clock back.' using errcode = 'PT409';
  end if;
  perform set_config('app.clock_move', 'on', true);
  update campaigns set game_seconds = target where id = p_campaign;
  perform set_config('app.clock_move', '', true);
  insert into game_clock_events (campaign_id, from_seconds, to_seconds, reason)
  values (p_campaign, was, target, case when target < was then 'Rewind: ' || why else why end);
  return target;
end $$;

revoke execute on function public.set_game_date(uuid, integer, integer, text, boolean) from public, anon;
grant execute on function public.set_game_date(uuid, integer, integer, text, boolean) to authenticated;
