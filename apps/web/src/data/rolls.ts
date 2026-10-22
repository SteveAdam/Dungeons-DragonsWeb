import type { RollMode, RollModeReason } from '@dnd-manager/rules-engine';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import { DataError, toDataError } from './errors';

export const ROLL_KINDS = ['check', 'save', 'attack', 'damage', 'initiative', 'death_save', 'other'] as const;
export type RollKindName = (typeof ROLL_KINDS)[number];

/** A row of the roll log. The dice and (since P2-2) the bonus come from the server; the target from the roller. */
export interface RollRow {
  id: string;
  campaignId: string;
  characterId: string | null;
  rolledBy: string;
  kind: RollKindName;
  label: string;
  bonus: number;
  /** Where the bonus came from; null for rolls made before P2-2. */
  bonusBreakdown: { label: string; value: number }[] | null;
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

/** A roll for a character. The server works out the bonus; nothing here can change it. */
export interface CharacterRollRequest {
  campaignId: string;
  characterId: string;
  kind: 'check' | 'save' | 'attack';
  /** A skill key ('athletics'), an ability key ('str') or a weapon id. */
  key: string;
  /** The DC, or the armour class for an attack. */
  target: number;
  /** DMs only: the server ignores a player's mode. */
  mode?: RollMode;
  /** DMs only: a roll players never see. */
  hidden?: boolean;
}

/** What the server will use for the roll: the bonus and its parts, the mode and why, and the odds. */
export interface RollPreview {
  label: string;
  bonus: number;
  bonusBreakdown: { label: string; value: number }[];
  mode: RollMode;
  reasons: RollModeReason[];
  /** The chance to meet the target, 0 to 1. */
  chance: number;
  critChance: number;
  /** Set when a condition makes the roll fail whatever the dice say. */
  autoFail: string | null;
  notes: string[];
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
  bonusBreakdown: (r.bonus_breakdown as RollRow['bonusBreakdown']) ?? null,
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

/**
 * Turns a failed call to the roll function into a DataError, keeping the server's own explanation (for example
 * "You can only roll for your own character" or "cannot use the Greatsword yet: Strength 17 needed").
 */
async function functionError(error: unknown): Promise<DataError> {
  const e = (error ?? {}) as { name?: string; context?: Response };
  if (e.name === 'FunctionsHttpError' && e.context) {
    const status = e.context.status;
    const message = await e.context
      .json()
      .then((body: { error?: unknown }) => (typeof body?.error === 'string' ? body.error : undefined))
      .catch(() => undefined);
    if (status === 401) return new DataError('signed-out');
    if (status === 429) return new DataError('rate-limited');
    if (status === 403) return new DataError('forbidden', message);
    if (status === 404 && !message) return new DataError('unknown', DICE_SERVER_DOWN);
    if ([400, 404, 409, 422].includes(status)) return new DataError('validation', message);
    return new DataError('unknown');
  }
  if (e.name === 'FunctionsRelayError' || e.name === 'FunctionsFetchError') {
    return new DataError('unknown', DICE_SERVER_DOWN);
  }
  return toDataError(error);
}
const DICE_SERVER_DOWN = 'The dice server is not answering. Try again in a moment.';

async function callRoll<T>(action: 'preview' | 'roll', request: CharacterRollRequest): Promise<T> {
  const { data, error } = await supabase.functions.invoke('roll', { body: { action, ...request } });
  if (error) throw await functionError(error);
  return data as T;
}

/** The odds the server will use for this roll: what the player sees is what the server rolls with. */
export function previewRoll(request: CharacterRollRequest): Promise<RollPreview> {
  return callRoll<RollPreview>('preview', request);
}

/**
 * Rolls for a character through the roll Edge Function, which computes the bonus from the stored sheet, effects
 * and conditions, rolls the d20 and logs it. At most 30 rolls a minute per person.
 */
export async function rollForCharacter(request: CharacterRollRequest): Promise<RollRow> {
  return toRoll(await callRoll<Row>('roll', request));
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
