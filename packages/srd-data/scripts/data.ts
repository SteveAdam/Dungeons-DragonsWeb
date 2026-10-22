// P2-3: builds and checks the SRD data.
//
//   node scripts/data.ts           convert ../source into ../data (run after changing the source text)
//   node scripts/data.ts --check   fail unless every record is valid and the JSON is exactly what the source gives
//
// `pnpm build` runs the check, so CI fails on an invalid or hand-edited record.
import { readFileSync, writeFileSync } from 'node:fs';
import { convertArmor, convertCurrency, convertWeapons } from '../src/convert.ts';
import { armorSchema, currencySchema, weaponSchema } from '../src/schemas.ts';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const check = process.argv.includes('--check');

const sets = [
  { file: 'data/weapons.json', records: convertWeapons(read('source/weapons.txt')), schema: weaponSchema.array() },
  { file: 'data/armor.json', records: convertArmor(read('source/armor.txt')), schema: armorSchema.array() },
  { file: 'data/currency.json', records: convertCurrency(read('source/coins.txt')), schema: currencySchema },
];

let failed = false;
for (const { file, records, schema } of sets) {
  const parsed = schema.safeParse(records);
  if (!parsed.success) {
    failed = true;
    console.error(`${file}: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    continue;
  }
  const json = `${JSON.stringify(records, null, 2)}\n`;
  const count = Array.isArray(records) ? `${records.length} records` : 'valid';
  if (check) {
    if (read(file) !== json) {
      failed = true;
      console.error(`${file} does not match the SRD source text. Run pnpm -C packages/srd-data convert.`);
    } else console.log(`${file}: ${count}, matches the source`);
  } else {
    writeFileSync(new URL(file, root), json);
    console.log(`${file}: ${count}`);
  }
}
const ids = sets.flatMap(s =>
  Array.isArray(s.records) ? s.records.map(r => `${s.file}:${(r as { id: string }).id}`) : [],
);
if (new Set(ids).size !== ids.length) {
  failed = true;
  console.error('Two records share an id');
}
if (failed) process.exit(1);
