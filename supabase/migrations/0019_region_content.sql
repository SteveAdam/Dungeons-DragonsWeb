-- =====================================================================
-- 0019: what lives in a region (P3-2, REG-1, REG-2, REG-3, REG-5). Creatures, folk, finds, shops and
-- interactables, each with how discovered it is, a discovery check, and a spawn rule; DM notes apart; DM-only
-- spawn pins on the map; and a random encounter roll drawn from a secure source and logged.
--   * Everything here is DM only for now. Players will get masked rows through functions in P3-3.
--   * campaigns.settings.daylightStartHour and daylightEndHour (default 6 and 18) set when day is, for the
--     day/night rule. The hour is (game_seconds / 3600) mod 24.
-- =====================================================================

-- A spawn rule: { mode: 'always' | 'chance' | 'time', chance: 0-100, timeOfDay: 'day' | 'night' | 'any',
-- count: { min, max } } with 0 <= min <= max <= 100.
create function public.spawn_rule_ok(r jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(r) = 'object'
     and (select count(*) from jsonb_object_keys(r) k where k not in ('mode', 'chance', 'timeOfDay', 'count')) = 0
     and r ->> 'mode' in ('always', 'chance', 'time')
     and jsonb_typeof(r -> 'chance') = 'number' and (r ->> 'chance')::numeric between 0 and 100
     and (r ->> 'chance')::numeric = trunc((r ->> 'chance')::numeric)
     and r ->> 'timeOfDay' in ('day', 'night', 'any')
     and jsonb_typeof(r -> 'count') = 'object'
     and jsonb_typeof(r -> 'count' -> 'min') = 'number' and jsonb_typeof(r -> 'count' -> 'max') = 'number'
     and (r -> 'count' ->> 'min')::numeric = trunc((r -> 'count' ->> 'min')::numeric)
     and (r -> 'count' ->> 'max')::numeric = trunc((r -> 'count' ->> 'max')::numeric)
     and (r -> 'count' ->> 'min')::int between 0 and 100
     and (r -> 'count' ->> 'max')::int between (r -> 'count' ->> 'min')::int and 100
$$;

-- Details: a description, a quantity, and for shops a stock list of { itemRef, priceCp }.
create function public.content_details_ok(d jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(d) = 'object'
     and (select count(*) from jsonb_object_keys(d) k where k not in ('description', 'quantity', 'stock')) = 0
     and (d -> 'description' is null or (jsonb_typeof(d -> 'description') = 'string' and char_length(d ->> 'description') <= 4000))
     and (d -> 'quantity' is null or (jsonb_typeof(d -> 'quantity') = 'number' and (d ->> 'quantity')::numeric between 0 and 100000))
     and (d -> 'stock' is null or (
       jsonb_typeof(d -> 'stock') = 'array' and jsonb_array_length(d -> 'stock') <= 100
       and not exists (
         select 1 from jsonb_array_elements(d -> 'stock') s
         where jsonb_typeof(s) <> 'object'
            or jsonb_typeof(s -> 'itemRef') <> 'string' or char_length(s ->> 'itemRef') not between 1 and 120
            or jsonb_typeof(s -> 'priceCp') <> 'number' or (s ->> 'priceCp')::numeric < 0
            or (s ->> 'priceCp')::numeric <> trunc((s ->> 'priceCp')::numeric)
            or (select count(*) from jsonb_object_keys(s) k where k not in ('itemRef', 'priceCp')) > 0
       )))
$$;

create table public.region_content (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions (id) on delete cascade,
  kind text not null check (kind in ('creature', 'folk', 'find', 'shop', 'interactable')),
  name text not null check (char_length(name) between 1 and 120),
  entity_id uuid references public.entities (id) on delete set null,
  -- an SRD or custom monster id; the monster library comes later, so this is free text for now
  monster_ref text check (char_length(monster_ref) between 1 and 120),
  details jsonb not null default '{}'::jsonb check (content_details_ok(details)),
  state text not null default 'hidden' check (state in ('hidden', 'hinted', 'noticed', 'found')),
  hint_text text check (char_length(hint_text) between 1 and 300),
  discovery_dc int check (discovery_dc between 1 and 40),
  discovery_skill text not null default 'perception' check (discovery_skill in (
    'acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation',
    'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleightOfHand',
    'stealth', 'survival'
  )),
  spawn_rule jsonb not null default '{"mode":"always","chance":100,"timeOfDay":"any","count":{"min":1,"max":1}}'::jsonb
    check (spawn_rule_ok(spawn_rule)),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index region_content_region_idx on public.region_content (region_id, kind, sort_order);
create index region_content_entity_idx on public.region_content (entity_id);

create table public.region_content_secrets (
  content_id uuid primary key references public.region_content (id) on delete cascade,
  dm_notes text not null default '' check (char_length(dm_notes) <= 4000)
);

create table public.spawn_pins (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps (id) on delete cascade,
  x double precision not null check (x >= 0),
  y double precision not null check (y >= 0),
  kind text not null default 'creature' check (kind in ('creature', 'find', 'interactable', 'trap')),
  label text not null default '' check (char_length(label) <= 120),
  content_id uuid references public.region_content (id) on delete set null,
  created_at timestamptz not null default now()
);
create index spawn_pins_map_idx on public.spawn_pins (map_id);
create index spawn_pins_content_idx on public.spawn_pins (content_id);

-- The roll log: one row per roll, with what triggered. Region and names are copied, so the log needs nothing
-- else to stay readable and nothing ever has to change in it.
create table public.encounter_rolls (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  region_id uuid not null,
  region_name text not null,
  rolled_by uuid not null,
  game_seconds bigint not null,
  hour int not null check (hour between 0 and 23),
  is_day boolean not null,
  results jsonb not null,
  created_at timestamptz not null default now()
);
create index encounter_rolls_campaign_idx on public.encounter_rolls (campaign_id, created_at desc);
create trigger encounter_rolls_append_only_trg before update or delete on public.encounter_rolls
  for each row execute function public.log_append_only();

create function public.content_campaign(c uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select region_campaign(region_id) from region_content where id = c
$$;

-- Links stay inside the campaign: the entity must be an NPC or item of the region's campaign, and a spawn pin
-- may point only at content of its own campaign.
create function public.region_content_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.entity_id is not null and not exists (
    select 1 from entities
    where id = new.entity_id and campaign_id = region_campaign(new.region_id) and type in ('npc', 'item')
  ) then
    raise exception 'The linked entry must be an NPC or item of this campaign' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger region_content_check_trg before insert or update of entity_id, region_id on public.region_content
  for each row execute function public.region_content_check();

create function public.spawn_pins_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.content_id is not null and content_campaign(new.content_id) is distinct from map_campaign(new.map_id) then
    raise exception 'A spawn pin can link only to region content of its own campaign' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger spawn_pins_check_trg before insert or update of content_id, map_id on public.spawn_pins
  for each row execute function public.spawn_pins_check();

-- ROW LEVEL SECURITY: DM only, all four tables ------------------------------------------
alter table public.region_content enable row level security;
alter table public.region_content_secrets enable row level security;
alter table public.spawn_pins enable row level security;
alter table public.encounter_rolls enable row level security;

create policy "dm only region content" on public.region_content for all to authenticated
  using (is_dm(region_campaign(region_id))) with check (is_dm(region_campaign(region_id)));
create policy "dm only region content secrets" on public.region_content_secrets for all to authenticated
  using (is_dm(content_campaign(content_id))) with check (is_dm(content_campaign(content_id)));
create policy "dm only spawn pins" on public.spawn_pins for all to authenticated
  using (is_dm(map_campaign(map_id))) with check (is_dm(map_campaign(map_id)));
-- written only by roll_random_encounter
create policy "dm reads encounter rolls" on public.encounter_rolls for select to authenticated
  using (is_dm(campaign_id));

-- THE ROLL ------------------------------------------------------------------------------

-- Is this hour daytime, for daylight hours start (inclusive) to end (exclusive)? A start after the end wraps
-- past midnight; equal hours mean it is never day.
create function public.is_daytime(hour int, day_start int, day_end int) returns boolean
language sql immutable set search_path = public as $$
  select case when day_start <= day_end then hour >= day_start and hour < day_end
              else hour >= day_start or hour < day_end end
$$;

-- One spawn rule evaluated once: how many appear (0 when it does not trigger). The dice come from roll_die
-- (pgcrypto bytes with rejection sampling), never random().
--   * timeOfDay day or night must match, whatever the mode.
--   * 'always' and 'time' trigger; 'chance' triggers when a d100 roll (1-100) is at or below the chance.
--   * the count is chosen evenly from min to max.
create function public.evaluate_spawn(rule jsonb, daytime boolean) returns int
language plpgsql volatile set search_path = public as $$
declare
  lo int := (rule -> 'count' ->> 'min')::int;
  hi int := (rule -> 'count' ->> 'max')::int;
begin
  if (rule ->> 'timeOfDay' = 'day' and not daytime) or (rule ->> 'timeOfDay' = 'night' and daytime) then
    return 0;
  end if;
  if rule ->> 'mode' = 'chance' and roll_die(100) > (rule ->> 'chance')::int then
    return 0;
  end if;
  if hi = lo then
    return lo;
  end if;
  return lo + roll_die(hi - lo + 1) - 1;
end $$;

-- DM only: rolls the region's creature entries against the game clock and logs the result.
-- Returns { rollId, hour, isDay, results: [{ contentId, name, monsterRef, count }] }.
create function public.roll_random_encounter(p_region uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c uuid := region_campaign(p_region);
  secs bigint;
  st jsonb;
  h int;
  day boolean;
  e record;
  n int;
  results jsonb := '[]'::jsonb;
  roll_id uuid;
begin
  if c is null then
    raise exception 'We could not find that region' using errcode = '42501';
  end if;
  perform require_dm(c);
  select game_seconds, settings into secs, st from campaigns where id = c;
  h := ((secs / 3600) % 24)::int;
  day := is_daytime(h, coalesce((st ->> 'daylightStartHour')::int, 6), coalesce((st ->> 'daylightEndHour')::int, 18));
  for e in
    select id, name, monster_ref, spawn_rule from region_content
    where region_id = p_region and kind = 'creature' order by sort_order, created_at
  loop
    n := evaluate_spawn(e.spawn_rule, day);
    if n > 0 then
      results := results || jsonb_build_object('contentId', e.id, 'name', e.name, 'monsterRef', e.monster_ref, 'count', n);
    end if;
  end loop;
  insert into encounter_rolls (campaign_id, region_id, region_name, rolled_by, game_seconds, hour, is_day, results)
  values (c, p_region, (select name from regions where id = p_region), auth.uid(), secs, h, day, results)
  returning id into roll_id;
  return jsonb_build_object('rollId', roll_id, 'hour', h, 'isDay', day, 'results', results);
end $$;

-- DM only: the daylight hours (0-23) used by the day/night rule.
create function public.set_daylight_hours(p_campaign uuid, p_start int, p_end int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_dm(p_campaign);
  if p_start not between 0 and 23 or p_end not between 0 and 23 then
    raise exception 'Daylight hours are whole hours from 0 to 23' using errcode = '22023';
  end if;
  update campaigns
  set settings = settings || jsonb_build_object('daylightStartHour', p_start, 'daylightEndHour', p_end)
  where id = p_campaign;
end $$;

revoke execute on function
  public.spawn_rule_ok(jsonb), public.content_details_ok(jsonb), public.content_campaign(uuid),
  public.region_content_check(), public.spawn_pins_check(), public.is_daytime(int, int, int),
  public.evaluate_spawn(jsonb, boolean), public.roll_random_encounter(uuid), public.set_daylight_hours(uuid, int, int)
from public, anon, authenticated;
grant execute on function
  public.spawn_rule_ok(jsonb), public.content_details_ok(jsonb), public.content_campaign(uuid),
  public.is_daytime(int, int, int), public.roll_random_encounter(uuid), public.set_daylight_hours(uuid, int, int)
to authenticated;
