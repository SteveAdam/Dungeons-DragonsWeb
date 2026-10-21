import type { RollMode } from '@dnd-manager/rules-engine';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import { DataError, toDataError } from './errors';

export const ROLL_KINDS = ['check', 'save', 'attack', 'damage', 'initiative', 'death_save', 'other'] as const;
export type RollKindName = (typeof ROLL_KINDS)[number];

/** A row of the roll log. The dice were rolled on the server; bonus and target came from the client (Phase 1). */
export interface RollRow {
  id: string;
  campaignId: string;
  characterId: string | null;
  rolledBy: string;
  kind: RollKindName;
  label: string;
  bonus: number;
  target: number | null;
  mode: RollMode;
  /** The d20 results: one for a normal roll, two with advantage or disadvantage. */
  dice: number[];
  kept: number;
  total: number;
  /** null when there was no target. */
  success: boolean | null;
  crit: boolean;
  fumble: boolean;
  hidden: boolean;
  createdAt: string;
}

export interface RollParams {
  campaignId: string;
  characterId?: string | null;
  kind: RollKindName;
  label: string;
  bonus: number;
  target?: number | null;
  mode: RollMode;
  /** DMs only: a roll players never see. */
  hidden?: boolean;
}

type Row = Database['public']['Tables']['rolls']['Row'];

const toRoll = (r: Row): RollRow => ({
  id: r.id,
  campaignId: r.campaign_id,
  characterId: r.character_id,
  rolledBy: r.rolled_by,
  kind: r.kind as RollKindName,
  label: r.label,
  bonus: r.bonus,
  target: r.target,
  mode: r.mode as RollMode,
  dice: r.dice,
  kept: r.kept,
  total: r.total,
  success: r.success,
  crit: r.crit,
  fumble: r.fumble,
  hidden: r.hidden,
  createdAt: r.created_at,
});

/** Rolls a d20 on the server (roll_d20) and returns the logged roll. At most 30 rolls a minute per person. */
export async function rollD20(params: RollParams): Promise<RollRow> {
  const label = params.label.trim();
  if (label.length < 1 || label.length > 80) {
    throw new DataError('validation', 'Name the roll in 1 to 80 characters.');
  }
  if (!Number.isInteger(params.bonus) || params.bonus < -20 || params.bonus > 40) {
    throw new DataError('validation', 'The bonus must be a whole number from -20 to +40.');
  }
  const { data, error } = await supabase.rpc('roll_d20', {
    p_campaign: params.campaignId,
    // the generated types say these two are never null, but the function accepts null for "no character/target"
    p_character: (params.characterId ?? null) as string,
    p_kind: params.kind,
    p_label: label,
    p_bonus: params.bonus,
    p_target: (params.target ?? null) as number,
    p_mode: params.mode,
    p_hidden: params.hidden ?? false,
  });
  if (error) throw toDataError(error);
  return toRoll(data as Row);
}

/** The newest rolls in a campaign, newest first. Row level security leaves out hidden rolls for players. */
export async function listRecentRolls(campaignId: string, limit = 20): Promise<RollRow[]> {
  const { data, error } = await supabase
    .from('rolls')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw toDataError(error);
  return ((data ?? []) as Row[]).map(toRoll);
}

/**
 * Calls back with every new roll in the campaign that the viewer may read (realtime applies the same row level
 * security, so players never receive hidden rolls). Returns the function that stops listening.
 */
export function subscribeToRolls(campaignId: string, onRoll: (roll: RollRow) => void): () => void {
  const channel = supabase
    .channel(`rolls:${campaignId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'rolls', filter: `campaign_id=eq.${campaignId}` },
      payload => onRoll(toRoll(payload.new as Row)),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
