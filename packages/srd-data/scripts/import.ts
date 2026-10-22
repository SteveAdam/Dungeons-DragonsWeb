// P2-3 to P2-5: loads the SRD data into the database (srd_weapons, srd_armor, srd_species, srd_classes,
// srd_backgrounds, srd_spells). Run from the repo root:
//
//   pnpm srd:import
//
// By default it loads the local stack (pnpm db:start). For a hosted project, set SRD_IMPORT_URL and
// SRD_IMPORT_SERVICE_KEY (the project's service role key); it never guesses a hosted project. Running it again
// updates the rows in place, so it is safe to repeat.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  armorSchema,
  backgroundSchema,
  classSchema,
  speciesSchema,
  spellSchema,
  weaponSchema,
} from '../src/schemas.ts';

const read = (file: string) => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8'));
const weapons = weaponSchema.array().parse(read('weapons.json'));
const armor = armorSchema.array().parse(read('armor.json'));
const species = speciesSchema.array().parse(read('species.json'));
const classes = classSchema.array().parse(read('classes.json'));
const backgrounds = backgroundSchema.array().parse(read('backgrounds.json'));
const spells = spellSchema.array().parse(read('spells.json'));

function target(): { url: string; key: string } {
  const url = process.env.SRD_IMPORT_URL;
  const key = process.env.SRD_IMPORT_SERVICE_KEY;
  if (url || key) {
    if (!url || !key) throw new Error('Set both SRD_IMPORT_URL and SRD_IMPORT_SERVICE_KEY, or neither');
    return { url, key };
  }
  const env = Object.fromEntries(
    execSync('pnpm exec supabase status -o env', { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(line => line.includes('='))
      .map(line => {
        const i = line.indexOf('=');
        return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')];
      }),
  );
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.API_URL ?? '')) {
    throw new Error('The local stack is not running (pnpm db:start)');
  }
  return { url: env.API_URL, key: env.SERVICE_ROLE_KEY };
}

const { url, key } = target();

async function upsert(table: string, rows: object[]) {
  if (!rows.length) {
    console.log(`${table}: nothing to load yet`);
    return;
  }
  const r = await fetch(`${url}/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
  console.log(`${table}: ${rows.length} rows loaded`);
}

await upsert(
  'srd_weapons',
  weapons.map(w => ({ id: w.id, name: w.name, source: w.source, category: w.category, kind: w.kind, data: w })),
);
await upsert(
  'srd_armor',
  armor.map(a => ({ id: a.id, name: a.name, source: a.source, category: a.category, data: a })),
);
const named = (r: { id: string; name: string; source: string }) => ({
  id: r.id,
  name: r.name,
  source: r.source,
  data: r,
});
await upsert('srd_species', species.map(named));
await upsert('srd_classes', classes.map(named));
await upsert('srd_backgrounds', backgrounds.map(named));
await upsert(
  'srd_spells',
  spells.map(s => ({ id: s.id, name: s.name, source: s.source, level: s.level, data: s })),
);
console.log(`Loaded into ${new URL(url).host}.`);
