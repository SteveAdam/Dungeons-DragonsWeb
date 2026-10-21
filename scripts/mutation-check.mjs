#!/usr/bin/env node
// Mutation check for the row level security suite: proves the tests fail when a protection is removed.
//
// For each mutation it copies supabase/tests/database/rls.test.sql, injects broken SQL at the line marked
// "@mutation-point", runs that copy, and checks that the tests guarding that protection (T1 to T18) fail.
// Other tests may fail too: removing a write protection lets earlier tests change data, which breaks later ones.
// The broken SQL runs inside the test's own transaction, which is rolled back, so your real policies are
// never touched and there is nothing to restore.
//
//   pnpm db:test:mutations
//
// Needs the local stack running (pnpm db:start). MUTATION_RUNNER can replace the command; {file} is the test file.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const SUITE = 'supabase/tests/database/rls.test.sql';
const TMP_DIR = 'supabase/tests-mutations';
const MARKER = '-- @mutation-point';
const MARKER_LINE = /^-- @mutation-point.*$/m;
const RUNNER = process.env.MUTATION_RUNNER ?? 'pnpm exec supabase test db "{file}"';

// `fails` lists the tests that must fail when the protection is removed.
const MUTATIONS = [
  {
    name: 'pin_secrets policy removed (ticket)',
    why: 'with no policy the table denies everyone, so the DM loses access',
    sql: `drop policy "dm only pin secrets" on pin_secrets;`,
    fails: ['T10'],
  },
  {
    name: 'row level security switched off on pin_secrets',
    why: 'players and strangers could read DM notes',
    sql: `alter table pin_secrets disable row level security;`,
    fails: ['T2', 'T6'],
  },
  {
    name: 'hidden-pin filter removed (ticket)',
    why: 'players could read pins the DM has not revealed',
    sql: `drop policy "read pins" on pins;
create policy "read pins" on pins for select using (is_dm(map_campaign(map_id)) or is_member(map_campaign(map_id)));`,
    fails: ['T1'],
  },
  {
    name: "map policy checks only the map's own flag",
    why: 'a sub-map under a hidden pin would be readable',
    sql: `drop policy "read maps" on maps;
create policy "read maps" on maps for select using (is_dm(campaign_id) or (is_member(campaign_id) and visible_to_players));`,
    fails: ['T3'],
  },
  {
    name: 'map visibility checks only one level up (the original draft)',
    why: 'a map two levels under a hidden pin would be readable',
    sql: `create or replace function map_is_revealed(m uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select mp.visible_to_players and (mp.parent_pin_id is null or coalesce((select visible_to_players from pins where id = mp.parent_pin_id), false)) from maps mp where mp.id = m), false) $$;`,
    fails: ['T13'],
  },
  {
    name: 'page visibility filter removed',
    why: 'players could read hidden pages',
    sql: `drop policy "read pages" on pages;
create policy "read pages" on pages for select using (is_dm(campaign_id) or is_member(campaign_id));`,
    fails: ['T4'],
  },
  {
    name: 'link visibility filter removed',
    why: 'players could see links that expose hidden pins',
    sql: `drop policy "read links" on links;
create policy "read links" on links for select using (is_dm(campaign_id) or is_member(campaign_id));`,
    fails: ['T5'],
  },
  {
    name: 'folders readable by members',
    why: "players would see the DM's filing system",
    sql: `create policy "read folders" on folders for select using (is_member(campaign_id));`,
    fails: ['T7'],
  },
  {
    name: 'any member can write pins',
    why: 'players could add, change and delete pins (and read hidden ones)',
    sql: `drop policy "dm writes pins" on pins;
create policy "dm writes pins" on pins for all using (is_member(map_campaign(map_id))) with check (is_member(map_campaign(map_id)));`,
    fails: ['T1', 'T7'],
  },
  {
    name: 'any member can write members',
    why: 'a player could make themselves a DM',
    sql: `drop policy "dm manages members" on members;
create policy "dm manages members" on members for all using (is_member(campaign_id)) with check (is_member(campaign_id));`,
    fails: ['T8'],
  },
  {
    name: 'invite code readable by members',
    why: 'players would see the DM-only invite code',
    sql: `drop policy "dm only campaign secrets" on campaign_secrets;
create policy "dm only campaign secrets" on campaign_secrets for select using (is_member(campaign_id));`,
    fails: ['T2'],
  },
  {
    name: 'map images readable by anyone in the bucket',
    why: 'players and strangers could read the image of a hidden map',
    sql: `drop policy "maps: read what the map policy lets you read" on storage.objects;
create policy "maps: read what the map policy lets you read" on storage.objects for select to authenticated using (bucket_id = 'maps');`,
    fails: ['T6', 'T11', 'T13'],
  },
  {
    name: 'profiles readable by everyone',
    why: "strangers could read each other's profiles",
    sql: `drop policy "read profiles of fellow members" on profiles;
create policy "read profiles of fellow members" on profiles for select to authenticated using (true);`,
    fails: ['T12'],
  },
  {
    name: 'orphan-sub-map trigger removed',
    why: 'deleting a hidden pin would publish its sub-map',
    sql: `drop trigger pins_hide_orphaned_submaps_trg on pins;`,
    fails: ['T14'],
  },
  {
    name: 'image-folder constraint removed',
    why: "a map could point at another campaign's image",
    sql: `alter table maps drop constraint maps_image_in_campaign_folder;`,
    fails: ['T15'],
  },
  {
    name: 'last-DM trigger removed',
    why: 'a campaign could be left with no DM',
    sql: `drop trigger members_keep_a_dm_trg on members;`,
    fails: ['T16'],
  },
  {
    name: 'hidden-region filter removed',
    why: 'players could read weather zones the DM has not revealed, or zones on hidden maps',
    sql: `drop policy "read regions" on regions;
create policy "read regions" on regions for select using (is_dm(map_campaign(map_id)) or is_member(map_campaign(map_id)));`,
    fails: ['T18'],
  },
  {
    name: 'any member can write regions',
    why: 'players could add, change and delete weather zones',
    sql: `drop policy "dm writes regions" on regions;
create policy "dm writes regions" on regions for all using (is_member(map_campaign(map_id))) with check (is_member(map_campaign(map_id)));`,
    fails: ['T18'],
  },
  {
    name: 'helper function opened to signed-out visitors',
    why: 'visitors could call is_dm over the REST API',
    sql: `grant execute on function is_dm(uuid) to anon;`,
    fails: ['T16'],
  },
];

function runFile(path) {
  const cmd = RUNNER.replace('{file}', path);
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const failed = new Set([...out.matchAll(/Failed test \d+: "(T\d+):/g)].map(m => m[1]));
  return { ok: r.status === 0, failed, out };
}

const suite = readFileSync(SUITE, 'utf8');
if (!MARKER_LINE.test(suite)) {
  console.error(`Marker "${MARKER}" not found in ${SUITE}`);
  process.exit(2);
}

function main() {
  mkdirSync(TMP_DIR, { recursive: true });

  const baseFile = `${TMP_DIR}/baseline.test.sql`;
  writeFileSync(baseFile, suite);
  const base = runFile(baseFile);
  if (!base.ok) {
    console.error(
      'The unmodified suite does not pass, so the mutation check cannot run. Fix that first (pnpm db:test).',
    );
    console.error(base.out.split('\n').slice(-15).join('\n'));
    return 2;
  }
  console.log('baseline: suite passes\n');

  let bad = 0;
  MUTATIONS.forEach((m, i) => {
    const file = `${TMP_DIR}/m${String(i + 1).padStart(2, '0')}.test.sql`;
    writeFileSync(
      file,
      suite.replace(MARKER_LINE, () => `${MARKER}\n${m.sql}`),
    );
    const r = runFile(file);
    const want = [...m.fails].sort();
    const got = [...r.failed].sort();
    const missing = want.filter(t => !r.failed.has(t));
    const extra = got.filter(t => !m.fails.includes(t));
    const caught = !r.ok && missing.length === 0;
    if (!caught) bad++;
    console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${m.name}`);
    console.log(`         ${m.why}`);
    console.log(
      `         must fail: ${want.join(', ')}${extra.length ? `   also failed (knock-on): ${extra.join(', ')}` : ''}${missing.length ? `   DID NOT FAIL: ${missing.join(', ')}` : ''}`,
    );
    if (!caught && r.ok) console.log('         the suite still PASSED with this protection removed: add a test for it');
    if (!caught && !r.ok && got.length === 0)
      console.log(
        `         the runner failed without naming a test (is the SQL valid?): ${r.out.trim().split('\n').slice(-3).join(' | ')}`,
      );
  });

  console.log(`\n${MUTATIONS.length - bad} of ${MUTATIONS.length} mutations caught`);
  return bad ? 1 : 0;
}

// process.exit would skip `finally`, so the exit code is returned and used last.
let code = 2;
try {
  code = main();
} finally {
  rmSync(TMP_DIR, { recursive: true, force: true });
}
process.exit(code);
