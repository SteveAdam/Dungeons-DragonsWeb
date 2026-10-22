-- =====================================================================
-- 0010 (ticket P2-4): SRD 5.2.1 species, classes and backgrounds (levels 1 to 3), read-only.
--
-- Same pattern as 0009: the rows come from packages/srd-data and are loaded with `pnpm srd:import` (service
-- role). Any signed-in user can read them; nobody else can write them.
--
-- This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast
-- LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons
-- Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
-- =====================================================================

create table public.srd_species (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null unique,
  source text not null check (source = 'srd-5.2'),
  -- the whole record, as in packages/srd-data/data/species.json
  data jsonb not null check (jsonb_typeof(data) = 'object' and data ->> 'id' = id)
);

create table public.srd_classes (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null unique,
  source text not null check (source = 'srd-5.2'),
  -- the whole record, as in packages/srd-data/data/classes.json
  data jsonb not null check (jsonb_typeof(data) = 'object' and data ->> 'id' = id)
);

create table public.srd_backgrounds (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null unique,
  source text not null check (source = 'srd-5.2'),
  -- the whole record, as in packages/srd-data/data/backgrounds.json
  data jsonb not null check (jsonb_typeof(data) = 'object' and data ->> 'id' = id)
);

alter table public.srd_species enable row level security;
alter table public.srd_classes enable row level security;
alter table public.srd_backgrounds enable row level security;

create policy "signed-in users read srd species" on public.srd_species for select to authenticated using (true);
create policy "signed-in users read srd classes" on public.srd_classes for select to authenticated using (true);
create policy "signed-in users read srd backgrounds" on public.srd_backgrounds for select to authenticated
  using (true);

revoke insert, update, delete, truncate on public.srd_species, public.srd_classes, public.srd_backgrounds
  from anon, authenticated;
