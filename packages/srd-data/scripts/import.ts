// P2-3 to P3-4: loads the SRD data into the database (srd_weapons, srd_armor, srd_species, srd_classes,
// srd_backgrounds, srd_spells, srd_monsters). Run from the repo root:
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
  monsterSchema,
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
const monsters = monsterSchema.array().parse(read('monsters.json'));

const isJwt = (key: string) => key.split('.').length === 3;

/** Stops before any request when the key cannot write: only a service role or secret key can load the SRD tables. */
function checkServiceKey(key: string) {
  const wrong = (what: string) =>
    new Error(`SRD_IMPORT_SERVICE_KEY is ${what}. Use the service role or secret key from the project's API settings.`);
  if (key.startsWith('sb_publishable_')) throw wrong('the publishable key');
  if (key.startsWith('sb_secret_')) return;
  if (!isJwt(key)) throw wrong('not a Supabase API key');
  let role: unknown;
  try {
    role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role;
  } catch {
    throw wrong('not a Supabase API key');
  }
  if (role !== 'service_role') throw wrong(`the ${String(role)} key`);
}

function target(): { url: string; key: string } {
  const url = process.env.SRD_IMPORT_URL;
  const key = process.env.SRD_IMPORT_SERVICE_KEY;
  if (url || key) {
    if (!url || !key) throw new Error('Set both SRD_IMPORT_URL and SRD_IMPORT_SERVICE_KEY, or neither');
    checkServiceKey(key.trim());
    return { url, key: key.trim() };
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
      // a secret key (sb_secret_...) is not a JWT, so it goes in apikey alone
      ...(isJwt(key) ? { Authorization: `Bearer ${key}` } : {}),
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
await upsert(
  'srd_monsters',
  monsters.map(m => ({
    id: m.id,
    name: m.name,
    source: m.source,
    challenge_value: m.challengeValue,
    creature_type: m.creatureType,
    data: m,
  })),
);
console.log(`Loaded into ${new URL(url).host}.`);
