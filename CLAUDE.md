# CLAUDE.md

Notes for Claude Code working in this repository.

## Layout

- `apps/web` — the React app (Vite, Vitest). Only `src/data`, `src/lib` and `src/auth` may import the Supabase client.
- `packages/rules-engine`, `packages/srd-data` — game rules and SRD content (Vitest).
- `supabase/migrations` — schema and row-level security; tested by `supabase/tests/database/rls.test.sql`.
- `supabase/functions` — Deno edge functions (`roll`, `create-character`, `apply-level-up`).
- `e2e/tests` — Playwright specs.

## Code navigation & testing with Graphify

Graphify repository: `SteveAdam/Dungeons-DragonsWeb`

### Before reading code

- Find a definition: `graphify_find <name>`. Ask how something works: `query_graph` (try `skeleton=true` first, it is cheaper).
- Find which files matter for a task: `graphify_rank_files "<question>"`, then open only the top files.
- Freshness: every result carries a `commitSha`. If it is not `git rev-parse HEAD`, run
  `git diff --name-only <commitSha> HEAD` and read those files directly instead of trusting the graph for them.

### Before changing a symbol

- Run `graphify_impact <symbol> include_risk=true`. List any `untested_hotspots` in the PR description.
- For a file-level change: `graphify_file_neighbors <file>` shows what imports it.

### Choosing which tests to run

1. For each changed file, run `graphify_tests_for <file>`. Count only entries under `tests`; entries under `weak` are not real links. The graph follows calls at most two hops, so an empty result means "no direct test", not "untested".
2. Run those first: `pnpm -C apps/web exec vitest run <test files>`
3. Then run the suite for the area you changed:
   - `apps/web/**` → `pnpm -C apps/web test`
   - `packages/rules-engine/**` → `pnpm -C packages/rules-engine test` (and `pnpm engine:check`)
   - `packages/srd-data/**` → `pnpm -C packages/srd-data test`
   - `supabase/migrations/**` → `pnpm db:test` (needs `pnpm db:start`)
   - `supabase/functions/**` → `pnpm test:functions` and `pnpm functions:check`
   - realtime, fog, pings, handouts, messages, groups → also the matching spec in `e2e/tests/` (`pnpm test:e2e -- <spec>`)
4. Before pushing: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`.

### When adding code

- Put a `*.test.ts(x)` next to new modules. Data-layer tests mock `../lib/supabase` and use `src/test/fakeQuery.ts`
  (see `src/data/members.test.ts`); realtime tests use `src/test/fakeRealtime.ts`.
- After writing the test, run `graphify_tests_for` again and check it shows a `call_direct` link.

### Known gaps (graph at `c54ac5d`)

No direct unit tests yet for: `hooks/useRealtime.ts` (9 dependents), `hooks/useLiveCampaign.ts`, `hooks/useFog.ts`,
`state/mapMode.ts`. Add tests there before larger changes.
