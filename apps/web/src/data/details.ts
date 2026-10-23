// P2-11: the Details tab. The owner (and the DM) edit it directly; the database checks every field's limit.
import { supabase } from '../lib/supabase';
import type { Json } from '../types/database';
import { toDataError } from './errors';

/** Each field and the most characters it may hold (the same limits as public.details_ok). */
export const DETAIL_LIMITS = {
  age: 40,
  height: 40,
  weight: 40,
  eyes: 40,
  skin: 40,
  hair: 40,
  alignment: 40,
  languages: 500,
  personalityTraits: 1000,
  ideals: 1000,
  bonds: 1000,
  flaws: 1000,
  appearance: 4000,
  backstory: 8000,
  allies: 4000,
  treasure: 4000,
} as const;
export type DetailField = keyof typeof DETAIL_LIMITS;

/** The built-in symbols a character can pick (uploads come later). */
export const SYMBOLS = [
  'shield',
  'sword',
  'crown',
  'skull',
  'flame',
  'moon',
  'sun',
  'star',
  'feather',
  'leaf',
  'anchor',
  'book',
  'gem',
  'key',
  'mountain',
  'paw',
] as const;
export type CharacterSymbol = (typeof SYMBOLS)[number];

export type CharacterDetailsData = Partial<Record<DetailField, string>> & { symbol?: CharacterSymbol };

/** The character's details ({} before anything is written). */
export async function getDetails(characterId: string): Promise<CharacterDetailsData> {
  const { data, error } = await supabase
    .from('character_details')
    .select('data')
    .eq('character_id', characterId)
    .maybeSingle();
  if (error) throw toDataError(error);
  const d = (data?.data ?? {}) as Record<string, unknown>;
  const out: CharacterDetailsData = {};
  for (const k of Object.keys(DETAIL_LIMITS) as DetailField[]) {
    const v = d[k];
    if (typeof v === 'string') out[k] = v;
  }
  if ((SYMBOLS as readonly unknown[]).includes(d.symbol)) out.symbol = d.symbol as CharacterSymbol;
  return out;
}

export async function saveDetails(characterId: string, campaignId: string, data: CharacterDetailsData): Promise<void> {
  const { error } = await supabase.from('character_details').upsert({
    character_id: characterId,
    campaign_id: campaignId,
    data: data as NonNullable<Json>,
    updated_at: new Date().toISOString(),
  });
  if (error) throw toDataError(error);
}
