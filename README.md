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
packages/rules-engine/    D&D 2024 rules (P1): core odds, bonus dice, effects, item requirements, terrain;
                          armour class, weapon profiles and coins (P2-3); class progression, hit points,
                          background ability scores (P2-4)
packages/srd-data/        SRD 5.2.1 data as zod-checked JSON, made from the SRD text: equipment (P2-3), classes,
                          species and backgrounds to level 3 (P2-4)
supabase/
  migrations/             0000 extensions, 0001 profiles, 0002 core schema and row level security, 0003 regions, 0004 rolls, 0005 characters, 0006 map tools, 0007 entities, 0008 roll security, 0009 SRD equipment, 0010 SRD classes, species, backgrounds, 0011 SRD spells
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
| `pnpm db:test`                               | pgTAP row level security suite (253 assertions)                    |
| `pnpm db:test:mutations`                     | Removes each protection in turn; all 37 must be caught             |
| `pnpm db:seed:dev <email>`                   | Gives that local player account Brannoc (P1-7 golden fixture)      |
| `pnpm db:types`                              | Regenerates `apps/web/src/types/database.ts` from the local schema |
| `pnpm db:push`                               | Applies new migrations to the linked hosted project                |
| `pnpm functions:serve`                       | Runs the roll Edge Function on the local stack (needs Docker)      |
| `pnpm test:functions` / `functions:check`    | Deno tests, type check and lint for the Edge Functions             |
| `pnpm engine:sync` / `engine:check`          | Copies the rules engine into the Edge Functions / checks the copy  |
| `pnpm srd:import`                            | Loads the SRD data (equipment, classes, ...) into the local DB     |

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

## SRD equipment: weapons, armour and coins (P2-3)

Only SRD 5.2.1 content (CC-BY-4.0) is bundled, and none of it is typed in from memory:

- `packages/srd-data/source` holds the SRD's own table text (the Weapons, Armor and Coin Values tables and the
  attribution statement), copied from the official PDF. `src/convert.ts` turns it into `data/*.json`;
  `pnpm -C packages/srd-data build` (part of `pnpm build`) fails if a record is invalid under the zod schemas in
  `src/schemas.ts` or differs from what the source text gives. Every record has `id`, `name` and
  `source: 'srd-5.2'`; the Properties and Armor Class columns are kept as printed, for checking by eye.
- `0009_srd_equipment.sql` adds `srd_weapons` and `srd_armor`: readable by any signed-in user, writable by no one
  but the service role. `pnpm srd:import` loads them (local stack by default; for a hosted project set
  `SRD_IMPORT_URL` and `SRD_IMPORT_SERVICE_KEY`). Running it again updates the rows in place.
- The rules engine adds `armorClass` (light armour adds Dexterity, medium up to +2, heavy none, a shield +2 with
  training; a Strength score below the armour's costs 10 feet of speed through the P1-3 requirement rules; stealth
  disadvantage as a note), `weaponProfile` (Finesse takes the better of Strength and Dexterity, other ranged weapons
  Dexterity, other melee weapons Strength even when thrown; versatile two-handed damage, reach, range, mastery, and
  disadvantage for a Heavy weapon below 13) and coins (`totalInCopper`, `canAfford`, `makeChange`, `pay`,
  `formatPurse`; electrum is in the SRD, so it is in, but change is given without it unless asked).
- `/dev/srd` (development only) lists every record in the SRD's own layout with its source tag.
- The attribution statement is in `ATTRIBUTION.md` and in the footer of every page (`App.test.tsx` checks each route).

## SRD classes, species and backgrounds, levels 1 to 3 (P2-4)

Classes were added one at a time, each checked against the SRD before the next. All twelve are done: **Barbarian**, **Bard**, **Cleric**, **Druid**, **Fighter**, **Monk**, **Paladin**, **Ranger**, **Rogue**, **Sorcerer**, **Warlock**, **Wizard**. The nine species and the four backgrounds are done too, which completes P2-4.

- Each class's SRD pages are kept in `packages/srd-data/source/classes` twice: `<id>.flow.txt` (`pdftotext`, which
  keeps paragraphs whole) for the Core Traits table and the feature text, and `<id>.raw.txt` (`pdftotext -raw`, one
  row per line) for the class table. `src/convertClass.ts` turns them into `data/classes.json`: hit die, primary
  abilities, saves, skill choices, weapon and armour training, starting equipment, the level 1 to 3 rows of the class
  table with their extra columns, every feature's text in the SRD's words, and the subclass to level 3. The build
  fails if a feature in the table has no text, or a described feature is missing from the table.
- Species come from `source/species.*.txt` (`src/convertSpecies.ts`): creature type, size and speed, and every trait
  in the SRD's words, with the Draconic Ancestors, Elven Lineages and Fiendish Legacies tables read as rows.
  `src/speciesSources.ts` names each species' traits (so trait lines are not confused with option lines such as
  "Forest Gnome.") and decides their mechanics.
- Backgrounds come from the Background Descriptions (`src/convertBackgrounds.ts`): the three abilities, the Origin
  feat with its text from "Feats", two skills, the tool, and the equipment choice. `applyBackground` in the engine
  takes a background record as it is.
- `src/classSources.ts` says which pages hold a class, names its table's extra columns, and decides for every level
  1 to 3 feature whether it has game mechanics (it can also name the tables inside a feature, such as Life
  Domain Spells or Wild Shape's Beast Shapes, which are then read as rows from the raw text and removed from the
  feature's text) and the sidebar boxes that land inside a feature's text, which are moved to the class's
  `sidebars`) the app does not run yet (`mechanics: 'later'`). Those are listed in
  `docs/features-pending.md`, generated with the data.
- `0010_srd_characters.sql` adds `srd_species`, `srd_classes` and `srd_backgrounds` (read-only, like 0009);
  `pnpm srd:import` loads them.
- The engine adds `classProgression(class, level, subclass?)`, `hitPointsAtLevel1` (die maximum plus Constitution),
  `hitPointsGain` (half the die plus 1, or a roll, plus Constitution; at least 1) and `applyBackground` (+2 and +1,
  or +1 to all three of the background's abilities; none above 20).
- `/dev/classes` (development only) reads the imported classes, species and backgrounds from the database, a tab
  for each class and one each for species and backgrounds.

## Spells and spellcasting (P2-5)

Spells were imported in batches by level, each checked against the SRD before the next. All are in: the 27 cantrips,
the 57 level 1, 57 level 2 and 42 level 3 spells, and Greater Restoration and Regenerate for the library mockups (185
in all; Cure Wounds, Lesser Restoration and Revivify came with their levels).

- `packages/srd-data/source/spells.*.txt` is the whole Spell Descriptions chapter; `src/convertSpells.ts` reads all
  339 spells (level, school, class list, casting time, range, components with any cost and whether it is consumed,
  duration, Concentration, Ritual, the text and the higher-level or Cantrip Upgrade text), and
  `src/spellSources.ts` says which batches ship. Mechanics (a spell attack, one saving throw, one kind of damage or
  healing, how they grow with slot level or character level) are recorded only where the text states them plainly;
  otherwise the spell is text only. Raw text prints a few things away from their spell: stat blocks (Otherworldly
  Steed and others) are attached to the spell that says it uses them, and a line printed at the top of an earlier
  page goes back to the spell whose text stops mid-sentence.
- `0011_srd_spells.sql` adds `srd_spells`, read-only like the other SRD tables; `pnpm srd:import` loads it.
- The rules engine adds `spellSaveDc` and `spellAttackBonus`, `slotsFor` (from the class table, Pact Magic
  included), `castSpell` (needs a free slot of the spell's level or higher; upcast dice), `cantripDamageDice`
  (levels 5, 11 and 17), Concentration (`startConcentration`, `loseConcentration`, `concentrationSaveDc`: 10 or
  half the damage, at most 30, as the SRD says), `preparedLimit` and `canPrepare`, `castAsRitual` (Ritual tag
  only; 10 minutes longer; no slot) and `spellbookCopy` (2 hours and 50 GP per level; 1 hour and 10 GP to copy your
  own).
- `/dev/classes` has a Spells tab listing the imported spells by level, with the mechanics read from each.

## The Party, XP and coins (P2-6)

Levels are automatic: a character's level is `levelFromXp(xp)`. `characters.level_applied` is the level the sheet
has been built to; when XP has gone past it, level-ups are pending. The sheet's numbers (and the roll function's
bonuses) stay at the applied level, and the Sheet tab shows a _Level up available_ badge (the level-up flow is
P2-10).

- `0012_party_ledger.sql` adds `parties` (every campaign gets one official Party, an entity of type `party`, made
  with the campaign), `party_members` (new characters join the official Party unless
  `campaigns.settings.autoJoinParty` is false), `wallets` (copper, silver, gold and platinum; never negative) and
  `ledger`, which is append-only for every role. The ledger is written by triggers on `characters.xp` and on
  wallets, so every change is in it, whichever way it was made, and the totals always equal its sum.
- DM-only functions: `award_xp` (to the Party it is shared evenly among the members, and a note row records the
  remainder, which nobody gets), `award_coins`, `split_party_gold` (coin by coin; what does not divide stays in the
  pool) and `withdraw_from_party`. Players call `deposit_to_party` from their own character's wallet.
- Players read their own wallets, the party pool and the ledger rows about their characters and the Party; DMs
  read everything. Nobody writes wallets, the ledger or XP directly except the DM (XP set directly is recorded as
  _XP set directly_).
- Existing data is carried over: each campaign gets its Party, each character a wallet, a place in the Party, an
  applied level matching its XP, and an opening _XP before the ledger_ entry.
- The hub's **Party** tab: the DM sees members with level and XP progress, the pool and every purse, the award
  forms, the split button and the ledger with filters; a player sees their own characters and purses, the pool
  (read-only) and a deposit form. `pnpm db:seed:dev <email> <name>` seeds a second, level 1 character for testing.
- Manual test with two players: [docs/p2-6-manual-test.md](docs/p2-6-manual-test.md).

## Items, the pack and transfers (P2-7)

- `0013_items.sql` adds `items` (each an entity of type `item`, so the Codex lists it with folders and
  relationships), `item_secrets` (DM only: notes and a hidden effect, which is a note until the DM writes it into
  the item's rules) and `item_transfers` (offers and the history, with names kept as they were).
- A trigger keeps the rules: attuned only when the item needs attunement, at most three attuned items, one body
  armour and one shield equipped per character, only weapons, armour, shields and magic items equipped. Owners
  change only inside the functions, so every move is recorded; a moved item is no longer worn.
- Functions: `create_item` (DM: an SRD clone or from scratch, placed with a character, the Party or the world),
  `offer_transfer` / `accept_transfer` / `decline_transfer` / `cancel_transfer` (ownership moves only on accept;
  bound items cannot be offered; giving part of a stack splits it, the new stack named "Arrows (2)" because entity
  names are unique), `force_move_item` (DM, at once), `equip_item`, `unequip_item`, `attune_item`,
  `unattune_item`, and `party_roster` (the Party's ability scores and effects, for the Give dialog's "who can use
  it").
- Players read their characters' items and the Party's; transfers are read by the two sides and the DM.
- The rules engine's `computeSheet` takes the character's items: the equipped armour and shield make the armour
  class, the equipped weapons the attacks (with requirement locks), and items that are working (equipped, and
  attuned when they need it) add their effects as permanent effects named after the item. `carriedWeight` is for
  display. The roll function loads the items too, so server bonuses match the sheet. A sheet may record
  `weaponProficiencies`; without it (Phase 1 sheets), item weapons count as proficient.
- Existing characters' Phase 1 armour, shield and weapons become equipped items, matched to the SRD records by name.
- The character's **Pack** tab (`/campaigns/<id>/characters/<id>/pack`): carried items with locks, equip and attune
  switches, the Give dialog, the inbox of offers, the party inventory and the transfer history; in DM mode, creating
  items and editing their rules, secrets and owner. `pnpm db:seed:dev` gives new characters Brannoc's gear.
- Manual test with two players: [docs/p2-7-manual-test.md](docs/p2-7-manual-test.md).

## The game clock and the DM effects tool (P2-8)

- `0014_clock_effects.sql`: the DM moves `campaigns.game_seconds` only with `advance_clock(campaign, seconds,
reason)`, which writes to `game_clock_events` (append-only for every role). A direct change to the clock is
  refused, so the log is complete. `campaigns` is in the realtime publication, so open screens hear the new time.
  (The local stack runs without the realtime container, so locally only the DM's own screen updates at once;
  others catch up on their next fetch.)
- `apply_effect` puts an effect on a character in one step: "for N seconds" is counted from the clock as the server
  sees it, and a hidden detail goes to `effect_secrets`, which only DMs read. Ending an effect early deletes it.
- The DM's **Game clock** (hub and character page, DM mode) shows "Day N, hh:mm" (day = game_seconds / 86400 + 1;
  the calendar is Phase 3) with +10 minutes, +1 hour, +8 hours, +1 day, and a custom amount with a reason.
- The Sheet tab's **Apply an effect** form (DM mode) takes name, source, stat, add / set / set at least, value,
  duration (minutes or hours from now, rounds, until a short or long rest, permanent), concentration and the hidden
  detail, with presets for the Potion of Hill Giant Strength and "+2 armour class for 10 minutes". It replaces the
  development-only potion switch. Effects show as chips with the time left; when the clock passes an effect's end
  it disappears, worked out from `game_seconds` by the rules engine, not by a timer. Rounds-based effects wait for
  combat (a later phase); advancing the clock does not count them down.

## Character creation wizard (P2-9)

- **Rules in one place.** `packages/rules-engine/src/creation.ts` holds the level 1 creation rules from the SRD's
  "Character Creation": the standard array, point buy (27 points, scores 8 to 15, costs 0 to 9), rolling (4d6 drop
  the lowest, six times), background increases (+2/+1 or +1 to each of its three abilities, none above 20), skills
  from the class list (not the background's), equipment options A/B/C read from the SRD text, cantrips and level 1
  spells within the class table's counts (a Wizard's spellbook of six, prepared from it), and alignment. The wizard
  checks each step with it, and the server checks everything again. It is plain TypeScript, not a zod schema, so
  the engine stays free of dependencies (the earlier decision); `readCreationChoices` does the shape check a schema
  would. The real-data tests are in `packages/srd-data/src/creation.test.ts`.
- **The Edge Function `create-character`** (`supabase/functions/create-character`) reads the payload's shape, checks
  every choice against the SRD rows in the database, checks rolled scores against the player's own unused ability
  roll, builds the sheet and starting kit itself (hit points: the Hit Point Die's maximum plus the Constitution
  modifier), works it out with `computeSheet`, and calls `create_character_from_wizard`. Any numbers the client
  sends are ignored. Deploy it with the roll function (`supabase functions deploy create-character`).
- `0015_character_creation.sql`: `roll_ability_scores` (server dice, logged in the roll log as `ability_roll`, rate
  limited; refused while an earlier ability roll in the campaign is unused, so a refresh cannot re-roll), the
  generic `roll_die` and `roll_pool(count, sides)`, `character_drafts` (one per player per campaign, owner only),
  and `create_character_from_wizard` (service role only): the character at level 1, its `player` entity, starting
  items (equipped armour, shield and the weapons the class is trained with), starting gold in the ledger, the
  ability roll marked used and the draft cleared, in one transaction; 0012's triggers add the wallet and the Party
  place.
- **The wizard** (`/campaigns/<id>/characters/new`, linked from the Characters tab): name and species, class,
  background, ability scores, skills, equipment, spells, details, review. One step per screen with a progress
  ribbon; you cannot move on with choices that break the rules; the draft is saved at every step and right after a
  roll. The review shows the sheet `computeSheet` makes of what the server will build.
- Species traits with their own choices (Human Skillful, Elf lineages, Dragonborn ancestry and so on) are recorded
  as text only for now, as listed in `docs/features-pending.md`; the size choice is kept.

## Levelling up (P2-10)

- **Rules in one place.** `packages/rules-engine/src/levelup.ts`: `levelUpPlan` (what the next level brings: the
  class features, a subclass choice where the class table has a "… Subclass" feature, an Ability Score Improvement
  where it has one, new cantrips and prepared spells from the table's columns, a Wizard's two spellbook spells, and
  the spell slots), `levelUpProblems` (no pending level, choices for the wrong level, a missing subclass, a roll
  outside the die, a score above 20, feats while the campaign does not allow them, spells off the list or above the
  slot levels) and `applyLevelUp`. Hit points: the average (half the die plus 1) or the server's roll, plus the
  Constitution modifier, at least 1; a higher Constitution modifier raises the earlier levels too. Real-data tests
  for a Fighter, a Wizard and a Cleric from 1 to 3 are in `packages/srd-data/src/levelup.test.ts`.
- **Content stops at level 3** (the SRD class data in the app covers levels 1 to 3): for level 4 and up the flow
  says "Content for this level is not available yet" and offers no way to apply it.
- **The Edge Function `apply-level-up`** checks that a level is pending and the choices are for it, uses its own
  record of the Hit Point Die roll (once a level is rolled for, that roll is the gain), builds the new sheet and
  works it out with `computeSheet`, then calls `apply_level_up_from_function`. Deploy it with the other functions
  (`supabase functions deploy apply-level-up`).
- `0016_level_up.sql`: `roll_hit_die` (the owner's or the DM's server roll of the Hit Point Die, logged as `hit_die`,
  once per character and level), `level_up_events` (the audit log, append-only for every role, read by the owner
  and the DM) and `apply_level_up_from_function` (service role only), which writes the sheet, `level_applied` and
  the audit row together and refuses a level that has been applied meanwhile. `campaigns.settings.optionalFeats`
  is the optional feat rule (off unless set); the DM switches it in the hub. The SRD feat list comes later.
- **The flow** (`/campaigns/<id>/characters/<id>/level-up`, from the sheet's _Level up_ link): hit points, new
  features and subclass, ability scores, spells, review and apply. Several pending levels are applied one at a time,
  in order. Maximum hit points and the proficiency bonus change only when a level is applied.
- The web app's sheet schema now keeps the creation and level-up fields (spells, subclass, weapon training, size,
  origin feat, tool, details); before this, reading a sheet dropped them, so the sheet page treated every weapon as
  proficient.

## Spells, details and the simple long rest (P2-11)

- **Spells tab** (casters only; a Fighter has none). The header's spellcasting ability, save DC and spell attack
  come from `computeSheet` (new `spellcasting` on the computed sheet; casters record `spellcastingAbility`, set at
  creation and filled in for existing characters by 0017). Slots are dots (filled = spent) from the class table and
  the stored spell state. Cantrips and prepared spells are listed by level with their casting time, range,
  duration, save DC, damage or healing (upcast and cantrip scaling from the engine). **Cast** spends the chosen slot
  (an upcast chooser appears when a higher slot is free), **As a ritual** spends none, and spell attacks open the
  odds popup: the roll function now takes `spell:<name>` attack keys and uses the spell attack bonus. A
  concentration banner shows the spell, **Break concentration**, and the save DC for a given amount of damage.
  Preparing: toggles within the class limit (a Wizard's from the spellbook), with a message at the limit.
- **Details tab**: age, height, weight, eyes, skin, hair, appearance, backstory, allies and organisations,
  treasure, personality traits, ideals, bonds, flaws, alignment, languages and a symbol from built-in icons; each
  field has a limit, text stays plain text, and changes save themselves a moment after typing stops.
- **Simple long rest** (DM mode: on the character page for one character, on the Party tab for the whole Party), a
  stand-in until Phase 6. It follows SRD 5.2.1's Long Rest: all hit points and **all** spent Hit Point Dice back
  (the ticket said half; that was the 2014 rule, and 5.2.1 says "all spent Hit Point Dice"), Exhaustion down by 1,
  every spell slot back, concentration ends, and effects lasting until a rest end. The engine's `longRest` is the
  reference for it.
- `0017_spells_details_rest.sql`: `character_spell_state` (spent slots, concentration, whether the prepared list
  may change; no direct writes), `spell_casts` and `rest_events` (append-only logs), `character_details` (owner and
  DM write; limits checked by `details_ok`; seeded from the creation wizard's sheet), and the functions
  `cast_spell`, `break_concentration`, `set_prepared_spells`, `simple_long_rest`, `simple_long_rest_party`. The
  campaign setting `prepareAfterRestOnly` (on unless set false; the DM switches it in the hub) lets prepared spells
  change only between a long rest and the next spell cast with a slot. The character guard now lets these functions
  write a player's sheet (the `app.sheet_write` flag) while direct writes stay the DM's.
- The web app's sheet schema has a compile-time check that it lists every field of the stored sheet; zod drops
  unlisted fields, which is how P2-9's fields and then `spellcastingAbility` went missing on reading.

## End-to-end test (P2-12)

`e2e/` is a Playwright test of the whole of Phase 2 with three browser contexts, a DM and two players, against
the local stack. It runs as one test with named steps:

1. the DM creates a campaign and both players join with the invite code;
2. player A makes a level 1 Fighter and player B a level 1 Wizard through the creation wizard;
3. the DM awards XP to the Party and both characters show "Level up available";
4. both players complete both level-ups (hit points 31 and 20, the Wizard's slots 4 and 2);
5. the Greatsword of the Drowned is locked, unlocked by the Potion of Hill Giant Strength, and locked again
   61 minutes later on the game clock;
6. a scroll offered by A moves to B only when B accepts;
7. an Athletics roll through the odds popup stores the server's bonus, and a forged bonus is ignored;
8. direct API calls with each player's token cannot read the other's character, wallet or ledger, item or
   effect secrets, or hidden entities, and cannot change XP, the applied level, wallets or rolls;
9. the DM links entities and files one in a folder; players see only visible entities and links.

Run it with the local stack up, the SRD imported (the test imports it) and the Edge Functions served:

```bash
pnpm db:start
```

```bash
pnpm functions:serve
```

```bash
pnpm test:e2e
```

The first run needs the browser: `pnpm -C e2e exec playwright install chromium`. Each run makes fresh accounts
(`e2e-…@example.test`) in the local database, starts its own dev server on port 5174 pointed at the local stack,
and refuses to run against anything that is not local. It takes about three minutes. Weakening a policy fails
step 8 (shown with item secrets made readable to members: "A reads item secrets"). `pnpm format` touches every
file, and `functions:serve` restarts when files change, so wait for it to come back before running the test.
CI runs it in the `e2e` job on a fresh stack and keeps the report and trace when it fails.

## Rules content licence

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC,
available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0
International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

The conditions in `packages/rules-engine/src/conditions.ts` follow the SRD 5.2.1 Rules Glossary; their
descriptions are our own wording.
