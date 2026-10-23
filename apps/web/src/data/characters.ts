import type { CharacterSheet, Effect } from '@dnd-manager/rules-engine';
import { supabase } from '../lib/supabase';
import type { Database, Json } from '../types/database';
import { characterSheetSchema, effectDurationSchema } from './characterSchema';
import { DataError, toDataError } from './errors';

/** A stored character: the sheet (validated) with XP and the applied level from their columns, which only a DM changes. */
export interface Character {
  id: string;
  campaignId: string;
  ownerId: string;
  name: string;
  sheet: CharacterSheet;
  createdAt: string;
}

export interface CharacterSummary {
  id: string;
  campaignId: string;
  ownerId: string;
  name: string;
  xp: number;
  /** The level the sheet is built to; levels above it that XP has reached are pending (P2-6). */
  levelApplied: number;
}

type CharacterRow = Database['public']['Tables']['characters']['Row'];
type EffectRow = Database['public']['Tables']['effects']['Row'];

function toCharacter(r: CharacterRow): Character {
  // the xp and level_applied columns are the truth (the DM-only guard protects them); the sheet's copies are ignored
  const parsed = characterSheetSchema.safeParse({
    ...(r.sheet as object),
    name: r.name,
    xp: r.xp,
    levelApplied: r.level_applied,
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new DataError(
      'validation',
      `This character sheet is damaged (${first.path.join('.') || 'sheet'}: ${first.message}).`,
    );
  }
  return {
    id: r.id,
    campaignId: r.campaign_id,
    ownerId: r.owner_id,
    name: r.name,
    sheet: parsed.data,
    createdAt: r.created_at,
  };
}

function toEffect(r: EffectRow): Effect {
  const duration = effectDurationSchema.safeParse(r.duration);
  return {
    id: r.id,
    name: r.name,
    source: r.source,
    stat: r.stat as Effect['stat'],
    mode: r.mode as Effect['mode'],
    value: r.value,
    duration: duration.success ? duration.data : { kind: 'permanent' },
    ...(r.concentration ? { concentration: true } : {}),
  };
}

/** One character. Row level security returns nothing for someone else's character, so that reads as not found. */
export async function getCharacter(characterId: string): Promise<Character> {
  const { data, error } = await supabase.from('characters').select('*').eq('id', characterId).maybeSingle();
  if (error) throw toDataError(error);
  if (!data) throw new DataError('not-found', 'We could not find that character, or it is not yours to see.');
  return toCharacter(data);
}

/** The characters the viewer may see in a campaign: their own, or every one for the DM. */
export async function listCharacters(campaignId: string): Promise<CharacterSummary[]> {
  const { data, error } = await supabase
    .from('characters')
    .select('id, campaign_id, owner_id, name, xp, level_applied')
    .eq('campaign_id', campaignId)
    .order('name');
  if (error) throw toDataError(error);
  return (data ?? []).map(r => ({
    id: r.id,
    campaignId: r.campaign_id,
    ownerId: r.owner_id,
    name: r.name,
    xp: r.xp,
    levelApplied: r.level_applied,
  }));
}

/** The effects on a character (the owner and the DM can read them). */
export async function listEffects(characterId: string): Promise<Effect[]> {
  const { data, error } = await supabase
    .from('effects')
    .select('*')
    .eq('character_id', characterId)
    .order('created_at');
  if (error) throw toDataError(error);
  return (data ?? []).map(toEffect);
}

/** DM only: the hidden details of effects, by effect id. Call it only in DM mode. */
export async function getEffectSecrets(effectIds: string[]): Promise<Map<string, string>> {
  if (effectIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('effect_secrets')
    .select('effect_id, hidden_detail')
    .in('effect_id', effectIds);
  if (error) throw toDataError(error);
  return new Map((data ?? []).map(r => [r.effect_id, r.hidden_detail]));
}

/** DM only. */
export async function removeEffect(effectId: string): Promise<void> {
  const { data, error } = await supabase.from('effects').delete().eq('id', effectId).select('id');
  if (error) throw toDataError(error);
  if (!data || data.length === 0) throw new DataError('forbidden');
}

/** How long a new effect lasts: as stored, or "for" a number of seconds from the clock's present moment. */
export type EffectDurationInput = Effect['duration'] | { kind: 'for'; seconds: number };

export interface NewEffect extends Omit<Effect, 'id' | 'duration'> {
  duration: EffectDurationInput;
  /** Shown to DMs only (stored in effect_secrets); empty for none. */
  hiddenDetail: string;
}

/**
 * DM only (P2-8): puts an effect on a character with apply_effect, which counts a "for" duration from the clock
 * as the server sees it and writes the hidden detail where only DMs can read it.
 */
export async function applyEffect(characterId: string, e: NewEffect): Promise<Effect> {
  const { data, error } = await supabase.rpc('apply_effect', {
    p_character: characterId,
    p_name: e.name,
    p_source: e.source,
    p_stat: e.stat,
    p_mode: e.mode,
    p_value: e.value,
    p_duration: e.duration as unknown as NonNullable<Json>,
    p_concentration: e.concentration ?? false,
    p_hidden_detail: e.hiddenDetail,
  });
  if (error) {
    if (error.code === '22023' || error.code === '23514') throw new DataError('validation', error.message);
    throw toDataError(error);
  }
  return toEffect(data as EffectRow);
}
