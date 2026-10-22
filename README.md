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
  migrations/             0000 extensions, 0001 profiles, 0002 core schema and row level security, 0003 regions, 0004 rolls, 0005 characters, 0006 map tools, 0007 entities
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
| `pnpm db:test`                               | pgTAP row level security suite (229 assertions)                    |
| `pnpm db:test:mutations`                     | Removes each protection in turn; all 34 must be caught             |
| `pnpm db:seed:dev <email>`                   | Gives that local player account Brannoc (P1-7 golden fixture)      |
| `pnpm db:types`                              | Regenerates `apps/web/src/types/database.ts` from the local schema |
| `pnpm db:push`                               | Applies new migrations to the linked hosted project                |
| `pnpm functions:serve`                       | Runs the roll Edge Function on the local stack (needs Docker)      |
| `pnpm test:functions` / `functions:check`    | Deno tests, type check and lint for the Edge Functions             |
| `pnpm engine:sync` / `engine:check`          | Copies the rules engine into the Edge Functions / checks the copy  |

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

- **Map tools.** The DM sets each map's scale (its width in miles or feet), which way is north and an optional
  grid in Map settings (`0006_map_tools.sql`). Anyone can measure a route: the distance, and for maps in miles the
  travel time at a Slow, Normal or Fast pace, where each zone the route crosses caps the pace at its SRD terrain's
  maximum (forest Normal, swamp and mountain Slow; open sea is left to the vessel). Layers switch pins, zones, grid
  and the compass rose on and off, with a legend of the terrains and weather on show; Find a pin jumps to a pin.

## Dice and the roll log (P1-5)

Every d20 is rolled on the server by `roll_d20` (`0004_rolls.sql`), with pgcrypto's `gen_random_bytes` and rejection
sampling, never `random()`. Since P2-2 the bonus is worked out on the server too (see below); the target comes from
the roller and is stored with the roll. The log is append-only: there are no write policies, and a trigger refuses any update, delete
or truncate, even by the database owner (deleting a whole campaign still removes its rolls). Hidden rolls are for
the DM only, each person can roll at most 30 times a minute (the API answers 429), and new rolls arrive live
through Supabase realtime. The client side is `apps/web/src/data/rolls.ts` (`previewRoll`, `rollForCharacter`,
`listRecentRolls`, `subscribeToRolls`).

## Server-computed roll bonus (P2-2)

A player can no longer roll with a bonus of their own choosing. Every roll goes through the Edge Function
`supabase/functions/roll` (`0008_roll_security.sql` closes the rest):

- `preview` and `roll` take `{ campaignId, characterId, kind, key, target }`. The function checks the caller's token,
  loads the character, its effects, its conditions and exhaustion, and the campaign's game clock, and computes the
  bonus, its breakdown, the roll mode and the odds with `computeSheet`. A `bonus` or `advantage` in the request is
  never read. Only a DM may set the mode (or make a hidden roll). The owner or a DM may roll; anyone else gets 403.
- `roll_d20` is executable by the service role only; the function calls it naming the roller (`p_actor`), and it
  refuses a bonus that does not add up to its breakdown, which is stored with the roll (`rolls.bonus_breakdown`).
- Only a DM (or a server function) changes a character's sheet, conditions or exhaustion, and players no longer insert
  characters directly (the creation wizard, P2-9, gets its own function). Otherwise a player could set Strength 30
  and the server would honestly compute +10.
- `campaigns.game_seconds` is the game clock effects are measured against, on the server and on the sheet (the clock
  UI is P2-8). It starts at 0; Phase 1 effects timed in real time were converted to it.
- The odds popup shows the server's preview, so what the player sees is what the server rolls with.
- **One engine, two runtimes.** Deno needs `.ts` on relative imports and deploys only what is inside
  `supabase/functions`, so `scripts/sync-engine.mjs` copies `packages/rules-engine/src` (tests left out) into
  `supabase/functions/_shared/rules-engine`, adding the extensions. Run `pnpm engine:sync` after changing the engine;
  CI fails (`pnpm engine:check`) if the copy is stale. Deno itself is a pinned dev dependency (`deno` on npm).
- Locally: `pnpm db:start`, then `pnpm functions:serve` (the app calls `/functions/v1/roll`). Tests:
  `pnpm test:functions`. Deploy to the hosted project: `pnpm exec supabase functions deploy roll` (after
  `pnpm db:push`).

## Odds popup (P1-6)

`apps/web/src/components/odds/OddsPopup.tsx` shows the chance to succeed for a check, save or attack: the reasons for
advantage and disadvantage (cancelled ones struck through), bonus dice such as Bless, the critical hit chance for
attacks, and the server roll with the kept die highlighted. Every number comes from the rules engine. It is a card next
to the button on wide screens and a bottom sheet under 600 px; Escape closes it and focus returns where it was. The
server rolls only the d20, so with bonus dice the result may say "roll Bless and add it". In development, `/dev/odds`
tries it with a pretend roll in memory (real rolls come only from a character's sheet since P2-2).

## Characters and the Sheet tab (P1-7)

`/campaigns/<id>/characters/<character id>` (or the hub's Characters tab) shows the read-only Sheet tab. Every
number comes from `computeSheet` in the rules engine; a test (`apps/web/src/noRulesMaths.test.ts`) fails if a component
or page computes a modifier, proficiency bonus or odds itself. Tapping a save, skill or attack opens the odds popup
with the DC or armour class typed above the lists ("Ask your DM"; empty means DC 15 or AC 13), shows the server's
preview, and rolls through the roll function for that character.

- Players read only their own characters and effects; the DM reads all. Only the DM changes the sheet and XP (P2-2),
  so level-ups are the DM's call. Effects are applied by the DM, and `effect_secrets` (hidden details)
  never reach players.
- The sheet is stored as JSON and validated with zod in `apps/web/src/data/characterSchema.ts` (the rules engine stays
  free of dependencies).
- Effects are timed on the campaign's game clock (`game_seconds`, P2-2), which stands still until the DM moves it.
- Development: `pnpm db:seed:dev <player email>` gives a local player Brannoc; a DM in DM mode can switch the Potion of
  Hill Giant Strength on from the sheet to watch Strength become 21 and the greatsword unlock.

## The Codex: entities, folders and relationships (P2-1)

The hub's Codex tab (`/campaigns/<id>/entities`) is the registry of every named thing: NPCs, locations, items,
factions, lore, player characters, the party and sessions (`0007_entities.sql`).

- The DM files entities in folders (any mix of types, nested freely) by dragging them, or with the keyboard-friendly
  "Move to…" lists. Deleting a folder moves its contents up one level; no entity is deleted with it.
- Names are unique in a campaign, ignoring case, so a wiki link such as `[[Port Vellum]]` always means one entity.
- A relationship has a label for each side ("owns" / "is owned by") and reads correctly from both ends. The same
  relationship cannot be stored twice, even the other way round; two entities can have several different ones.
- New entities start hidden. Players see a flat, searchable list of revealed entities, and a relationship only when
  it is not hidden and both ends are revealed. Every write goes through DM-only database functions.
- A manual two-account test is in `docs/p2-1-manual-test.md`.

## Rules content licence

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC,
available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0
International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

The conditions in `packages/rules-engine/src/conditions.ts` follow the SRD 5.2.1 Rules Glossary; their
descriptions are our own wording.
