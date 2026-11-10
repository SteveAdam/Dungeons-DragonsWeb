-- =====================================================================
-- 0021 (ticket P3-4): SRD 5.2.1 monsters, read-only.
--
-- Same pattern as 0009 to 0011: the rows come from packages/srd-data and are loaded with `pnpm srd:import` (service
-- role). Any signed-in user can read them; nobody else can write them. The Challenge Rating and creature type have
-- their own columns so the library can filter without reading the JSON.
--
-- This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast
-- LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons
-- Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
-- =====================================================================

create table public.srd_monsters (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null unique,
  source text not null check (source = 'srd-5.2'),
  -- the numeric value of the rating: 0.25 for "1/4"
  challenge_value numeric not null check (challenge_value >= 0),
  creature_type text not null,
  -- the whole record, as in packages/srd-data/data/monsters.json
  data jsonb not null check (jsonb_typeof(data) = 'object' and data ->> 'id' = id)
);
create index srd_monsters_challenge_idx on public.srd_monsters (challenge_value, name);

alter table public.srd_monsters enable row level security;
create policy "signed-in users read srd monsters" on public.srd_monsters for select to authenticated using (true);
revoke insert, update, delete, truncate on public.srd_monsters from anon, authenticated;
