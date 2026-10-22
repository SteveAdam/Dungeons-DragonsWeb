-- =====================================================================
-- 0011 (ticket P2-5): SRD 5.2.1 spells, read-only.
--
-- Same pattern as 0009 and 0010: the rows come from packages/srd-data and are loaded with `pnpm srd:import`
-- (service role). Any signed-in user can read them; nobody else can write them. The level has its own column so a
-- spell list can be filtered by level without reading the JSON.
--
-- This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast
-- LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons
-- Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
-- =====================================================================

create table public.srd_spells (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null unique,
  source text not null check (source = 'srd-5.2'),
  level int not null check (level between 0 and 9),
  -- the whole record, as in packages/srd-data/data/spells.json
  data jsonb not null check (jsonb_typeof(data) = 'object' and data ->> 'id' = id and (data ->> 'level')::int = level)
);
create index srd_spells_level_idx on public.srd_spells (level, name);

alter table public.srd_spells enable row level security;
create policy "signed-in users read srd spells" on public.srd_spells for select to authenticated using (true);
revoke insert, update, delete, truncate on public.srd_spells from anon, authenticated;
