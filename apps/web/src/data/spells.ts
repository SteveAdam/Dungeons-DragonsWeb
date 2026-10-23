// P2-11: a caster's spell slots, concentration and prepared spells, and the DM's simple long rest. Every change
// goes through a database function (cast_spell, break_concentration, set_prepared_spells, simple_long_rest),
// which checks the class rules and keeps the cast and rest logs.
import { supabase } from '../lib/supabase';
import { DataError, toDataError } from './errors';

export interface SpellState {
  /** Spent slots by spell level; index 0 is level 1. */
  slotsUsed: number[];
  concentration: { spell: string; slotLevel: number | null; sinceSeconds: number } | null;
  /** Whether the prepared list may change now (the campaign's "after a rest" rule). */
  prepareOpen: boolean;
}

const EMPTY: SpellState = { slotsUsed: Array(9).fill(0), concentration: null, prepareOpen: true };

interface StateRow {
  slots_used: number[];
  concentration: unknown;
  prepare_open: boolean;
}
const toState = (r: StateRow): SpellState => {
  const c = r.concentration as { spell?: unknown; slotLevel?: unknown; sinceSeconds?: unknown } | null;
  return {
    slotsUsed: r.slots_used.slice(0, 9),
    concentration:
      c && typeof c.spell === 'string'
        ? {
            spell: c.spell,
            slotLevel: typeof c.slotLevel === 'number' ? c.slotLevel : null,
            sinceSeconds: Number(c.sinceSeconds ?? 0),
          }
        : null,
    prepareOpen: r.prepare_open,
  };
};

/** The character's spell state; before the first cast there is none, which reads as fresh. */
export async function getSpellState(characterId: string): Promise<SpellState> {
  const { data, error } = await supabase
    .from('character_spell_state')
    .select('slots_used, concentration, prepare_open')
    .eq('character_id', characterId)
    .maybeSingle();
  if (error) throw toDataError(error);
  return data ? toState(data) : EMPTY;
}

async function rpc<T>(fn: () => PromiseLike<{ data: T; error: { code: string; message: string } | null }>) {
  const { data, error } = await fn();
  if (!error) return data;
  // the functions' own messages ("No level 2 spell slot left") are written for people
  if (error.code === '22023') throw new DataError('validation', error.message);
  throw toDataError(error);
}

/** Casts a cantrip, a prepared spell with a slot of `slotLevel`, or a ritual (no slot). */
export const castSpell = (characterId: string, spell: string, slotLevel: number | null, ritual = false) =>
  rpc(() =>
    supabase.rpc('cast_spell', {
      p_character: characterId,
      p_spell: spell,
      // null for a cantrip or a ritual (the generated type does not know the argument may be null)
      p_slot_level: slotLevel as number,
      p_ritual: ritual,
    }),
  ).then(row => toState(row as unknown as StateRow));

export const breakConcentration = (characterId: string) =>
  rpc(() => supabase.rpc('break_concentration', { p_character: characterId })).then(row =>
    toState(row as unknown as StateRow),
  );

/** The new prepared list (levelled spells). */
export const setPreparedSpells = (characterId: string, prepared: string[]) =>
  rpc(() => supabase.rpc('set_prepared_spells', { p_character: characterId, p_prepared: prepared })).then(
    () => undefined,
  );

/** DM only: the simple long rest for one character. */
export const simpleLongRest = (characterId: string) =>
  rpc(() => supabase.rpc('simple_long_rest', { p_character: characterId })).then(() => undefined);

/** DM only: the simple long rest for every member of the Party. Returns how many rested. */
export const simpleLongRestParty = (campaignId: string) =>
  rpc(() => supabase.rpc('simple_long_rest_party', { p_campaign: campaignId })).then(n => Number(n));
