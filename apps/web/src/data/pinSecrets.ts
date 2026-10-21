// DM notes live in their own table (pin_secrets) that only DMs can read. Call these only in DM mode: a player,
// or a DM previewing as one, must never request them.
import { supabase } from '../lib/supabase';
import { toDataError } from './errors';

/** The DM notes for a pin ('' when there are none yet). */
export async function getPinNotes(pinId: string): Promise<string> {
  const { data, error } = await supabase.from('pin_secrets').select('dm_notes').eq('pin_id', pinId).maybeSingle();
  if (error) throw toDataError(error);
  return (data as { dm_notes: string } | null)?.dm_notes ?? '';
}

/** Saves the DM notes for a pin, creating the row the first time. */
export async function savePinNotes(pinId: string, notes: string): Promise<string> {
  const { data, error } = await supabase
    .from('pin_secrets')
    .upsert({ pin_id: pinId, dm_notes: notes }, { onConflict: 'pin_id' })
    .select('dm_notes')
    .single();
  if (error) throw toDataError(error);
  return (data as { dm_notes: string }).dm_notes;
}
