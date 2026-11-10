-- P3-8: weather zones on maps, and the days that have been fixed: a DM's override, or the history of what players saw.
-- A day with no row is worked out by the rules engine from the zone, the day and the season.
create table public.weather_zones (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  map_id uuid not null references public.maps (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  center_x double precision not null,
  center_y double precision not null,
  radius double precision not null check (radius > 0),
  climate text not null check (climate in ('arid', 'temperate', 'boreal', 'tropical', 'arctic', 'coastal', 'mountain')),
  color text not null default '#3d6a5d' check (color ~ '^#[0-9a-fA-F]{6}$'),
  -- players see only a weather icon, unless the DM shows them the circle as well
  show_border boolean not null default false,
  created_at timestamptz not null default now()
);
create index weather_zones_map_idx on public.weather_zones (map_id);
create index weather_zones_campaign_idx on public.weather_zones (campaign_id);

create function public.weather_zones_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from maps where id = new.map_id and campaign_id = new.campaign_id) then
    raise exception 'That map belongs to another campaign' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger weather_zones_check_trg before insert or update of map_id, campaign_id on public.weather_zones
  for each row execute function public.weather_zones_check();

create table public.weather_days (
  zone_id uuid not null references public.weather_zones (id) on delete cascade,
  day integer not null check (day >= 1),
  condition text not null check (condition in ('clear', 'partly_cloudy', 'overcast', 'fog', 'drizzle', 'rain', 'storm',
                                               'snow', 'blizzard', 'sleet', 'hail', 'dust_wind')),
  temperature text not null check (temperature in ('freezing', 'cold', 'cool', 'mild', 'warm', 'hot', 'scorching')),
  wind text not null check (wind in ('calm', 'breeze', 'strong', 'gale')),
  overridden boolean not null default false,
  note text not null default '' check (char_length(note) <= 500),
  primary key (zone_id, day)
);

-- A day belongs to its zone's campaign, without going through the zone's own read rules.
create function public.weather_zone_campaign(z uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select campaign_id from weather_zones where id = z
$$;

alter table public.weather_zones enable row level security;
alter table public.weather_days enable row level security;

create policy "dm manages weather zones" on public.weather_zones for all to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));
-- the maps read policy applies inside this check, so a hidden map keeps its zones hidden too
create policy "members read weather zones on visible maps" on public.weather_zones for select to authenticated
  using (is_member(campaign_id) and exists (select 1 from maps m where m.id = map_id and m.visible_to_players));

create policy "dm manages weather days" on public.weather_days for all to authenticated
  using (is_dm(weather_zone_campaign(zone_id))) with check (is_dm(weather_zone_campaign(zone_id)));
create policy "members read weather days of zones they can see" on public.weather_days for select to authenticated
  using (exists (select 1 from weather_zones z where z.id = zone_id));

revoke all on public.weather_zones from anon;
revoke all on public.weather_days from anon;
revoke execute on function public.weather_zone_campaign(uuid) from public, anon;
grant execute on function public.weather_zone_campaign(uuid) to authenticated;
