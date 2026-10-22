// P2-4: SRD classes and species as imported into the database (srd_classes, srd_species, loaded by pnpm srd:import).
// Each row's data is checked with the same zod schema the data package uses, so a damaged row is reported, not shown.
import { classSchema, speciesSchema, type SrdClass, type SrdSpecies } from '@dnd-manager/srd-data';
import type { ZodTypeAny, z } from 'zod';
import { supabase } from '../lib/supabase';
import { DataError, toDataError } from './errors';

async function listSrd<S extends ZodTypeAny>(table: 'srd_classes' | 'srd_species', schema: S, what: string) {
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
