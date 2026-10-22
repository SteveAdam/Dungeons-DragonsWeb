// P2-3, P2-4: builds and checks the SRD data, and docs/features-pending.md (features whose mechanics come later).
//
//   node scripts/data.ts           convert ../source into ../data (run after changing the source text)
//   node scripts/data.ts --check   fail unless every record is valid and every file is exactly what the source gives
//
// `pnpm build` runs the check, so CI fails on an invalid or hand-edited record.
import { readFileSync, writeFileSync } from 'node:fs';
import type { ZodTypeAny } from 'zod';
import { CLASS_SOURCES } from '../src/classSources.ts';
import { convertArmor, convertCurrency, convertWeapons } from '../src/convert.ts';
import { convertClass } from '../src/convertClass.ts';
import { convertSpecies } from '../src/convertSpecies.ts';
import { featuresPending } from '../src/featuresPending.ts';
import { SPECIES_SOURCES } from '../src/speciesSources.ts';
import {
  armorSchema,
  backgroundSchema,
  classSchema,
  currencySchema,
  speciesSchema,
  weaponSchema,
} from '../src/schemas.ts';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const check = process.argv.includes('--check');

const sets: { file: string; records: unknown; schema: ZodTypeAny }[] = [
  { file: 'data/weapons.json', records: convertWeapons(read('source/weapons.txt')), schema: weaponSchema.array() },
  { file: 'data/armor.json', records: convertArmor(read('source/armor.txt')), schema: armorSchema.array() },
  { file: 'data/currency.json', records: convertCurrency(read('source/coins.txt')), schema: currencySchema },
  {
    file: 'data/classes.json',
    records: CLASS_SOURCES.map(c =>
      convertClass(c, read(`source/classes/${c.id}.flow.txt`), read(`source/classes/${c.id}.raw.txt`)),
    ),
    schema: classSchema.array(),
  },
  {
    file: 'data/species.json',
    records: convertSpecies(
      SPECIES_SOURCES,
      read('source/species.raw.txt'),
      read('source/species.flow.txt'),
      read('source/species.layout.txt'),
    ),
    schema: speciesSchema.array(),
  },
  // backgrounds arrive in the last P2-4 batch
  { file: 'data/backgrounds.json', records: [], schema: backgroundSchema.array() },
];

let failed = false;
const outputs: { file: string; text: string; count: string }[] = [];
for (const { file, records, schema } of sets) {
  const parsed = schema.safeParse(records);
  if (!parsed.success) {
    failed = true;
    console.error(`${file}: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    continue;
  }
  const count = Array.isArray(records) ? `${records.length} records` : 'valid';
  outputs.push({ file, text: `${JSON.stringify(records, null, 2)}\n`, count });
}
if (!failed) {
  const classes = classSchema.array().parse(sets.find(s => s.file === 'data/classes.json')!.records);
  const species = speciesSchema.array().parse(sets.find(s => s.file === 'data/species.json')!.records);
  outputs.push({
    file: '../../docs/features-pending.md',
    text: featuresPending(classes, species),
    count: 'generated',
  });
}

for (const { file, text, count } of outputs) {
  if (check) {
    let current = '';
    try {
      current = read(file);
    } catch {
      // a missing file is reported as out of date below
    }
    if (current !== text) {
      failed = true;
      console.error(`${file} does not match the SRD source text. Run pnpm -C packages/srd-data convert.`);
    } else console.log(`${file}: ${count}, matches the source`);
  } else {
    writeFileSync(new URL(file, root), text);
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
