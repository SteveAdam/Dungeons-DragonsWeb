#!/usr/bin/env node
// pnpm db:types: regenerates apps/web/src/types/database.ts from the local database. The file is replaced only
// when generation succeeds, so a stopped Docker or database can never leave an error message in its place.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const OUT = 'apps/web/src/types/database.ts';
const r = spawnSync('pnpm exec supabase gen types typescript --local --schema public', {
  shell: true,
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
});
if (r.status !== 0 || !r.stdout.includes('export type Database')) {
  console.error(`Type generation failed; ${OUT} was left as it was.`);
  console.error((r.stderr || r.stdout).trim().split('\n').slice(-5).join('\n'));
  process.exit(1);
}
writeFileSync(OUT, r.stdout);
console.log(`Wrote ${OUT}`);
