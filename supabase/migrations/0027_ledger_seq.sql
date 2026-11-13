-- The hosted project's ledger table has no `seq` column: it was created from an early draft of 0012, and `db push`
-- only compares migration names, so it reported the database as up to date. The Party screens order the ledger by
-- `seq`, so loading it failed with "the database is missing part of this feature".
--
-- This brings any such database in line with 0012 and does nothing to one that already matches (like a fresh local
-- stack). Existing rows are numbered in the order the table holds them, which for an append-only table is the order
-- they were written in.
alter table public.ledger add column if not exists seq bigint generated always as identity;

-- the index name may also be taken by an older shape of the index
drop index if exists public.ledger_campaign_idx;
create index ledger_campaign_idx on public.ledger (campaign_id, seq desc);
