# DM Manager

A campaign manager for D&D 5e: DMs run campaigns with maps, pins and notes, and players see only what the DM reveals.

## Layout

```
apps/web/            React + Vite app (campaign hub, sign-in, character sheet demo at /sheet)
  src/components/ui  parchment UI kit (P0-3)
  src/auth           sign-in and session (P0-4)
  src/data           the only code that talks to Supabase (enforced by ESLint)
  src/hooks          TanStack Query hooks over src/data
supabase/
  migrations/        0001 profiles (P0-4), 0002 core schema and row level security (P0-5)
  tests/database/    pgTAP suite for every policy (P0-6)
scripts/
  mutation-check.mjs breaks each protection on purpose and checks the suite notices
```

## Getting started

Needs Node 24, pnpm and Docker Desktop (running).

```bash
pnpm install
pnpm db:start                         # local Supabase; prints the API URL and anon key
cp apps/web/.env.example apps/web/.env  # paste the anon key in
pnpm dev
```

## Checks

| Command | What it runs |
| --- | --- |
| `pnpm test` | Vitest: rules, data layer, hooks, screens |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | ESLint, TypeScript, production build |
| `pnpm db:reset` | Re-applies migrations and seed to the local database |
| `pnpm db:test` | pgTAP row level security suite (91 assertions) |
| `pnpm db:test:mutations` | Removes each protection in turn; all 16 must be caught |
