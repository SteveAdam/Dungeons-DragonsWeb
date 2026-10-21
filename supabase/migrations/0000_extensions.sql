-- =====================================================================
-- P0-2: extensions.
--
-- We enable only what the schema needs, and right now that is nothing beyond what
-- Postgres and Supabase already provide:
--   * gen_random_uuid() (every primary key) is built into Postgres 13 and later,
--     so pgcrypto and uuid-ossp are not needed.
--   * pgtap (the row level security tests) is created by the test file itself inside
--     its own transaction, so it never ships to the hosted databases.
-- Add an extension here, with a line saying why, only when a migration needs it.
-- =====================================================================

do $$
begin
  if current_setting('server_version_num')::int < 130000 then
    raise exception 'Postgres 13 or later is required (gen_random_uuid is built in from 13)';
  end if;
end $$;
