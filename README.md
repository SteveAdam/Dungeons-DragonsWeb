# DM Manager

A campaign manager for D&D 5e: DMs run campaigns with maps, pins and notes, and players see only what the DM reveals.

## Layout

```
apps/web/                 React + TypeScript + Vite app
  src/components/ui       parchment UI kit (P0-3); every component has a CSS Module and a test
  src/styles/tokens.css   the only file with colour values (pnpm check:tokens)
  src/auth                Supabase sign-in: Discord and email (P0-4)
  src/data                the only code that queries Supabase (enforced by ESLint)
  src/lib/storage         the only code that touches map images (P0-9; enforced by ESLint)
  src/hooks               TanStack Query hooks over src/data
  src/types/database.ts   generated from the schema (pnpm db:types)
packages/rules-engine/    D&D 2024 rules (P1): core odds, bonus dice, effects, item requirements, terrain
supabase/
  migrations/             0000 extensions, 0001 profiles, 0002 core schema and row level security, 0003 regions, 0004 rolls
  tests/database/         pgTAP suite for every policy
scripts/                  mutation check (RLS suite) and token check (CSS)
docs/                     design notes, including the P0-5 schema review
```

## Setup

Needs Node 24, pnpm 12 and Docker Desktop (running, for the local database).

```bash
pnpm install
pnpm db:start                           # local Supabase; prints the API URL and anon key
cp apps/web/.env.example apps/web/.env  # paste the URL and key in
pnpm dev                                # http://localhost:5173
```

## Scripts (run from the repo root)

| Command                                      | What it does                                                       |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm dev`                                   | Starts the web app                                                 |
| `pnpm lint` / `typecheck` / `test` / `build` | Runs in every package                                              |
| `pnpm format` / `format:check`               | Prettier for the whole repo                                        |
| `pnpm check:tokens`                          | Fails if a CSS file other than `tokens.css` contains a hex colour  |
| `pnpm db:start` / `db:stop`                  | Starts or stops the local Supabase stack                           |
| `pnpm db:reset`                              | Rebuilds the local database from `migrations/` and `seed.sql`      |
| `pnpm db:test`                               | pgTAP row level security suite (150 assertions)                    |
| `pnpm db:test:mutations`                     | Removes each protection in turn; all 22 must be caught             |
| `pnpm db:types`                              | Regenerates `apps/web/src/types/database.ts` from the local schema |
| `pnpm db:push`                               | Applies new migrations to the linked hosted project                |

## Hosted Supabase projects

We use two hosted projects: **development** (shared testing) and **production** (real players). Both are built only
from `supabase/migrations`. Never change tables in the dashboard: add a migration and push it.

1. **Create each project.** In the Supabase dashboard choose New project, name it `dm-manager-dev` or `dm-manager-prod`,
   pick a region near your players, and save the database password in your password manager.
2. **Find the URL and key.** Project Settings → API (or Connect): copy the Project URL and the anon key (newer projects
   call it the publishable key). Put them in `apps/web/.env` for local use, and in your hosting provider's environment
   settings for deployed builds. Never commit them.
3. **Link and push.** The CLI links one project at a time. The project ref is the part of the URL before
   `.supabase.co`.

   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <dev-project-ref>   # asks for that project's database password
   pnpm db:push                                             # applies any migrations the project does not have yet
   ```

   To work on production, run `supabase link` again with the production ref, push, then link back to development.
   Always push to development first.

4. **Set the auth URLs.** Authentication → URL Configuration: set the Site URL to the deployed app, and add
   `http://localhost:5173/**` to the redirect URLs on the development project.

Dashboard-only steps (cannot be done from the repo): creating the projects, saving their database passwords, the auth
URL settings above, the Discord provider below, and the email confirmation choice (Authentication → Sign In /
Providers → Email).

## Discord sign-in

We ask Discord for the `identify` scope (name, avatar) and `guilds` (server list), and never for message access.
Supabase also always adds `email`, which it needs to create the account.

1. Go to https://discord.com/developers/applications, choose New Application, and name it "DnD Manager".
2. Open OAuth2. Under Redirects add the Supabase auth callback URL:
   - hosted: `https://<project-ref>.supabase.co/auth/v1/callback` (one per hosted project)
   - local: `http://127.0.0.1:54321/auth/v1/callback`
3. Copy the Client ID, then reset and copy the Client Secret.
4. **Hosted:** Supabase dashboard → Authentication → Sign In / Providers → Discord: switch it on and paste the client
   ID and secret.
5. **Local:** copy `supabase/.env.example` to `supabase/.env`, fill in both values, set `enabled = true` under
   `[auth.external.discord]` in `supabase/config.toml`, then run `pnpm db:stop` and `pnpm db:start`.

## Theme

Parchment and ink on a dark desk. All colours are CSS variables in `apps/web/src/styles/tokens.css`. Fonts are
self-hosted through `@fontsource`, all OFL, one per role: UnifrakturCook (blackletter) for the app's name, Grenze for D&D
headings, Uncial Antiqua for links, tabs, buttons, tags, dates and labels, and IM Fell English for body text.
The D&D logo itself is a Wizards of the Coast trademark and is not used. In development, `/theme` shows
every component and both display settings ("Reduce texture" and "Plain font"). Both settings are also in the header's
Display menu, are saved in localStorage and are applied as `data-` attributes on `<html>`.

Contrast (WCAG 2.1; body text needs 4.5:1):

| Pair                    | Ratio | Result                                      |
| ----------------------- | ----- | ------------------------------------------- |
| ink on paper            | 11.68 | pass                                        |
| ink-faded on paper      | 4.91  | pass                                        |
| paper on wax-red        | 6.22  | pass                                        |
| verdigris on paper      | 4.56  | pass after darkening `#3E6B5E` to `#3D6A5D` |
| ink-faded on paper-aged | 4.12  | fails: never used for text                  |
| gold-dark on paper      | 3.63  | borders only (non-text needs 3:1)           |

## Map images (P0-9)

Map images live in the private `maps` bucket at `<campaign id>/<file>`. Only `apps/web/src/lib/storage` reads or
writes them: use `mapImageStore` (`upload`, `getUrl`, `remove`). ESLint fails if any other file uses
`supabase.storage` or imports `@supabase/storage-js`, so moving images to another object store (for example
Cloudflare R2) means writing one new `MapImageStore` implementation.

- Uploads accept PNG, JPG, WebP and SVG up to 25 MB, and the dimensions are read in the browser.
- For raster images wider than 4000 px, `downscaleOffer` returns the message and target size to show the user;
  `downscaleImage` does the shrinking. SVGs are never offered a downscale, since they are drawn at any size.
- Signed URLs last one hour and are reused until five minutes before they expire.
- DMs can read every file in their campaign's folder. Players can read an image only when they can read the map
  that uses it.
- `createFakeMapImageStore()` is an in-memory version for tests.

## Map view (P0-8)

`/campaigns/<id>/maps/<map id>`: a Leaflet map (`react-leaflet`, CRS.Simple) with the image from a signed URL.

- Pins are stored in image pixels with y from the top. `src/lib/mapCoordinates.ts` is the only place that converts
  to Leaflet coordinates.
- Pins are wax seals with an icon per type (location, character, faction, lore). Hidden pins are dashed and faded,
  and only reach the browser in DM mode. Markers can be focused with Tab and opened with Enter or Space.
- DMs upload maps on the hub's Maps tab, add pins ("Add pin", then click the map; new pins start hidden), and edit
  them in the side panel (a bottom sheet on phones). DM notes are read and written only through `pin_secrets`, and
  only in DM mode.
- With DM mode off, a DM's requests are the same as a player's: no hidden map, no hidden pin, no DM notes.
- The map fills its frame edge to edge: the frame spans the full width, and the image covers it (anything
  taller than the screen is a pan away; panning stops at the map's edges). It refills when the panel opens or the
  window resizes, unless you have zoomed or dragged the map yourself. Zooming out stops at the whole map.
- **Maps beneath pins.** A DM can add a map beneath a location pin ("Add a map beneath this pin" in its panel).
  Such pins carry a layers badge. Their panel shows "Enter ‹map›", and a double-click on the pin enters directly.
  The breadcrumb follows the nesting (campaign › world › kingdom › town). Hiding a pin hides everything beneath
  it (enforced by row level security), and deleting it keeps its map as a separate hidden map.
- **Moving pins.** In DM mode, drag a pin, or type its X and Y in the panel. The move shows at once and is
  rolled back if saving fails.
- **Regions (terrain and weather).** "Add region", then click the centre and the edge: a circle with its own
  terrain (17 kinds, each with a hand-drawn fill from `index.html`) and its own weather today, so the desert can bake
  while the boreal forest gets snow. Drag the weather token in the middle to move it, and the gold handle on the
  edge to resize it. The panel shows the travel distance per day and the weather's game effects (from
  `packages/rules-engine/src/environment.ts`, paraphrasing the SRD 5.2), and "Roll weather" picks weather the terrain
  usually sees. New regions start hidden; players see revealed regions on maps they can see (table `regions`,
  `0003_regions.sql`, tests T18). Everyone can hide the layer with "Show regions and weather". Circles are the first
  shape; `shape` leaves room for the polygons of MAP-4.

Licences: `react-leaflet` uses the Hippocratic License 2.1 (an ethical-use licence, not OSI open source); Leaflet is
BSD-2-Clause; icons are lucide (ISC).

## Dice and the roll log (P1-5)

Every d20 is rolled on the server by `roll_d20` (`0004_rolls.sql`), with pgcrypto's `gen_random_bytes` and rejection
sampling, never `random()`. In Phase 1 the bonus and target come from the client and are stored with the roll, so
the DM can see them. The log is append-only: there are no write policies, and a trigger refuses any update, delete
or truncate, even by the database owner (deleting a whole campaign still removes its rolls). Hidden rolls are for
the DM only, each person can roll at most 30 times a minute (the API answers 429), and new rolls arrive live
through Supabase realtime. The client side is `apps/web/src/data/rolls.ts` (`rollD20`, `listRecentRolls`,
`subscribeToRolls`).

## Odds popup (P1-6)

`apps/web/src/components/odds/OddsPopup.tsx` shows the chance to succeed for a check, save or attack: the reasons for
advantage and disadvantage (cancelled ones struck through), bonus dice such as Bless, the critical hit chance for
attacks, and the server roll with the kept die highlighted. Every number comes from the rules engine. It is a card next
to the button on wide screens and a bottom sheet under 600 px; Escape closes it and focus returns where it was. The
server rolls only the d20 in Phase 1, so with bonus dice the result may say "roll Bless and add it". In development,
`/dev/odds` tries it with a pretend roll or a real one through `roll_d20` (choose a campaign; the roll log updates).

## Rules content licence

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC,
available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0
International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

The conditions in `packages/rules-engine/src/conditions.ts` follow the SRD 5.2.1 Rules Glossary; their
descriptions are our own wording.
