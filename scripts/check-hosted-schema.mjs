#!/usr/bin/env node
// pnpm db:check-hosted: after a `db push`, checks that the project in apps/web/.env really has every table and column
// the app expects. `db push` compares migration names only, so a table made from an older draft of a migration passes
// it unnoticed and then fails in the app ("the database is missing part of this feature").
//
// It asks the API for every column of every table in the generated types, as the signed-out role with limit 0, so no
// data is read. A table or column that is not there is named. Functions and policies are not checked (the signed-out
// role cannot see them): the local pgTAP suite covers those.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const envText = (() => {
  try {
    return readFileSync(root + 'apps/web/.env', 'utf8');
  } catch {
    console.error('apps/web/.env not found: it holds the address of the project to check.');
    process.exit(2);
  }
})();
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('apps/web/.env needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
  process.exit(2);
}

const types = readFileSync(root + 'apps/web/src/types/database.ts', 'utf8');
const tablesPart = types.slice(types.indexOf('Tables: {'), types.indexOf('Views: {'));
const tables = [...tablesPart.matchAll(/"([a-z_0-9]+)": \{\s+Row: \{\s+([^}]*?)\s+\}\s+ComputedFields/g)].map(m => [
  m[1],
  [...m[2].matchAll(/"([a-z_0-9]+)"\??:/g)].map(c => c[1]),
]);
if (tables.length === 0) {
  console.error('No tables found in apps/web/src/types/database.ts: run pnpm db:types.');
  process.exit(2);
}

const ask = async (table, columns) => {
  const r = await fetch(`${url}/rest/v1/${table}?select=${columns.join(',')}&limit=0`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return (await r.json().catch(() => null))?.code;
};

console.log(`Checking ${tables.length} tables on ${new URL(url).hostname.replace(/^[^.]+/, '<project>')}`);
let problems = 0;
for (const [table, columns] of tables) {
  const code = await ask(table, columns);
  // 42501 (permission denied) only comes after every column has been found
  if (!code || code === '42501') continue;
  problems++;
  if (code === 'PGRST205') {
    console.log(`  missing table   ${table}`);
    continue;
  }
  const missing = [];
  for (const c of columns) {
    const one = await ask(table, [c]);
    if (one && one !== '42501') missing.push(c);
  }
  console.log(`  missing columns ${table}: ${missing.join(', ') || `(${code})`}`);
}
console.log(
  problems
    ? `${problems} table(s) differ: write a migration that adds what is missing.`
    : 'Every table and column is there.',
);
process.exit(problems ? 1 : 0);
