-- =====================================================================
-- 0003: regions on a map. Each region has its own terrain and weather, so a desert can bake while the boreal
-- forest beside it gets snow on the same day. Regions are circles for now; `shape` leaves room for the
-- polygons of MAP-4 later. Positions are in image pixels with y from the top, like pins.
-- =====================================================================

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  shape text not null default 'circle' check (shape in ('circle')),
  cx double precision not null check (cx >= 0),
  cy double precision not null check (cy >= 0),
  radius double precision not null check (radius > 0),
  terrain text not null default 'grassland' check (terrain in (
    'arctic', 'tundra', 'boreal_forest', 'temperate_forest', 'jungle', 'grassland', 'farmland', 'hills',
    'mountains', 'desert', 'badlands', 'swamp', 'coast', 'sea', 'volcanic', 'underdark', 'urban'
  )),
  weather text not null default 'clear' check (weather in (
    'clear', 'overcast', 'fog', 'rain', 'heavy_rain', 'thunderstorm', 'snow', 'blizzard', 'hail',
    'sandstorm', 'strong_wind', 'extreme_heat', 'extreme_cold'
  )),
  description text not null default '',
  -- hidden until the DM reveals it, like pins and maps
  visible_to_players boolean not null default false,
  created_at timestamptz not null default now()
);
create index regions_map_idx on public.regions (map_id);

alter table public.regions enable row level security;

-- Players see a revealed region on a map they can see; DMs see and write every region in their campaigns.
create policy "read regions" on public.regions for select to authenticated
  using (is_dm(map_campaign(map_id))
         or (is_member(map_campaign(map_id)) and visible_to_players and map_is_revealed(map_id)));
create policy "dm writes regions" on public.regions for all to authenticated
  using (is_dm(map_campaign(map_id))) with check (is_dm(map_campaign(map_id)));
