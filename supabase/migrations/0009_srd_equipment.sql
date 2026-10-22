-- =====================================================================
-- 0009 (ticket P2-3): SRD 5.2.1 weapons and armour, read-only.
--
-- The rows come from packages/srd-data (converted from the SRD's own tables) and are loaded with
-- `pnpm srd:import`, which uses the service role. Any signed-in user can read them; nobody else can write them:
-- there are no write policies, and the write grants are revoked as well.
--
-- This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast
-- LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons
-- Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
-- =====================================================================

create table public.srd_weapons (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null unique,
  source text not null check (source = 'srd-5.2'),
  category text not null check (category in ('simple', 'martial')),
  kind text not null check (kind in ('melee', 'ranged')),
  -- the whole record, as in packages/srd-data/data/weapons.json
  data jsonb not null check (jsonb_typeof(data) = 'object' and data ->> 'id' = id)
);

create table public.srd_armor (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null unique,
  source text not null check (source = 'srd-5.2'),
  category text not null check (category in ('light', 'medium', 'heavy', 'shield')),
  -- the whole record, as in packages/srd-data/data/armor.json
  data jsonb not null check (jsonb_typeof(data) = 'object' and data ->> 'id' = id)
);

alter table public.srd_weapons enable row level security;
alter table public.srd_armor enable row level security;

create policy "signed-in users read srd weapons" on public.srd_weapons for select to authenticated using (true);
create policy "signed-in users read srd armor" on public.srd_armor for select to authenticated using (true);

revoke insert, update, delete, truncate on public.srd_weapons, public.srd_armor from anon, authenticated;
