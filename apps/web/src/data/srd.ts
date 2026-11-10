// P2-4 to P3-5: SRD classes, species, backgrounds, spells, monsters and equipment as imported into the database
// (srd_classes and so on, loaded by pnpm srd:import).
// Each row's data is checked with the same zod schema the data package uses, so a damaged row is reported, not shown.
import {
  armorSchema,
  backgroundSchema,
  classSchema,
  monsterSchema,
  speciesSchema,
  spellSchema,
  weaponSchema,
  type SrdArmor,
  type SrdBackground,
  type SrdClass,
  type SrdMonster,
  type SrdSpecies,
  type SrdSpell,
  type SrdWeapon,
} from '@dnd-manager/srd-data/schemas';
import type { ZodTypeAny, z } from 'zod';
import { supabase } from '../lib/supabase';
import { DataError, toDataError } from './errors';

async function listSrd<S extends ZodTypeAny>(
  table:
    'srd_classes' | 'srd_species' | 'srd_backgrounds' | 'srd_spells' | 'srd_monsters' | 'srd_weapons' | 'srd_armor',
  schema: S,
  what: string,
) {
  const { data, error } = await supabase.from(table).select('id, data').order('name');
  if (error) throw toDataError(error);
  return (data ?? []).map((row): z.infer<S> => {
    const parsed = schema.safeParse(row.data);
    if (!parsed.success) {
      throw new DataError(
        'validation',
        `The imported ${what} ${row.id} does not match the SRD data (run pnpm srd:import).`,
      );
    }
    return parsed.data;
  });
}

/** Every imported SRD class, by name. Empty until `pnpm srd:import` has run. */
export const listSrdClasses = (): Promise<SrdClass[]> => listSrd('srd_classes', classSchema, 'class');

/** Every imported SRD species, by name. Empty until `pnpm srd:import` has run. */
export const listSrdSpecies = (): Promise<SrdSpecies[]> => listSrd('srd_species', speciesSchema, 'species');

/** Every imported SRD background, by name. Empty until `pnpm srd:import` has run. */
export const listSrdBackgrounds = (): Promise<SrdBackground[]> =>
  listSrd('srd_backgrounds', backgroundSchema, 'background');

/** Every imported SRD spell, by name. Empty until `pnpm srd:import` has run. */
export const listSrdSpells = (): Promise<SrdSpell[]> => listSrd('srd_spells', spellSchema, 'spell');

/** Every imported SRD monster, by name. Empty until `pnpm srd:import` has run. */
export const listSrdMonsters = (): Promise<SrdMonster[]> => listSrd('srd_monsters', monsterSchema, 'monster');

/** Every imported SRD weapon, by name. Empty until `pnpm srd:import` has run. */
export const listSrdWeapons = (): Promise<SrdWeapon[]> => listSrd('srd_weapons', weaponSchema, 'weapon');

/** Every imported SRD armour and shield, by name. Empty until `pnpm srd:import` has run. */
export const listSrdArmor = (): Promise<SrdArmor[]> => listSrd('srd_armor', armorSchema, 'armour');
