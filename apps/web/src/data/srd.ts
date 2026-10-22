// P2-4: SRD classes as imported into the database (srd_classes, loaded by pnpm srd:import). Each row's data is
// checked with the same zod schema the data package uses, so a damaged row is reported, not shown.
import { classSchema, type SrdClass } from '@dnd-manager/srd-data';
import { supabase } from '../lib/supabase';
import { DataError, toDataError } from './errors';

/** Every imported SRD class, by name. Empty until `pnpm srd:import` has run. */
export async function listSrdClasses(): Promise<SrdClass[]> {
  const { data, error } = await supabase.from('srd_classes').select('id, data').order('name');
  if (error) throw toDataError(error);
  return (data ?? []).map(row => {
    const parsed = classSchema.safeParse(row.data);
    if (!parsed.success) {
      throw new DataError(
        'validation',
        `The imported class ${row.id} does not match the SRD data (run pnpm srd:import).`,
      );
    }
    return parsed.data;
  });
}
