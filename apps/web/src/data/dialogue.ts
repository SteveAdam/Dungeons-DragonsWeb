// P4-6: the NPC dialogue tool. The DM's prepared lines, NPC profiles and every check request are the DM's alone; a
// player reads only the logged lines their group heard, and their own check requests through my_check_requests
// (which leaves out a DC the DM hid). Saying a line or offering a check goes through say_line / offer_check, which tell
// exactly the targeted players. A check is answered through the roll function, which takes everything from the
// request. See migration 0032.
import type { RollModeReason, RollMode } from '@dnd-manager/rules-engine';
import { supabase } from '../lib/supabase';
import type { Json } from '../types/database';
import { DataError, toDataError } from './errors';
import { functionError, toRoll, type RollRow } from './rolls';

export type Disposition = 'friendly' | 'indifferent' | 'hostile';
export const DISPOSITIONS: readonly Disposition[] = ['friendly', 'indifferent', 'hostile'];
export type OptionKind = 'say' | 'check' | 'end';

export const LINE_MAX = 2000;
export const OPTION_LABEL_MAX = 120;
export const OPTIONS_MAX = 6;

/** A response option as the DM writes it. */
export interface DialogueOption {
  label: string;
  kind: OptionKind;
  check?: { skill: string; dc: number; showOdds: boolean };
}

/** A response option as players are shown it: a check option names its request, and its DC only if shown. */
export interface ShownOption {
  label: string;
  kind: OptionKind;
  requestId?: string;
  check?: { skill: string; dc?: number; showOdds: boolean };
}

export interface DialogueLine {
  id: string;
  npcId: string;
  text: string;
  tag: string;
  condition: unknown;
  options: DialogueOption[];
  sortOrder: number;
}

export interface LogEntry {
  id: string;
  npcId: string;
  text: string;
  options: ShownOption[];
  groupIds: string[];
  saidAt: string;
}

export interface NpcProfile {
  disposition: Disposition;
  locationPinId: string | null;
}

export interface CheckAnswer {
  characterId: string;
  roll: RollRow;
}

/** A check request as the DM sees it, with the answers so far. */
export interface CheckRequest {
  id: string;
  characterIds: string[];
  key: string;
  kind: 'check' | 'save';
  dc: number;
  mode: RollMode;
  reason: string | null;
  showOdds: boolean;
  prompt: string;
  status: 'open' | 'closed';
  npcId: string | null;
  createdAt: string;
  answers: CheckAnswer[];
}

/** A check request as a player sees it: only their characters, the DC only if shown, and who has answered. */
export interface MyCheckRequest {
  id: string;
  characterIds: string[];
  key: string;
  kind: 'check' | 'save';
  dc: number | null;
  mode: RollMode;
  reason: string | null;
  showOdds: boolean;
  prompt: string;
  status: 'open' | 'closed';
  npcId: string | null;
  createdAt: string;
  answered: string[];
}

/** The server's preview of a requested check. The chance is null when the DM hid the odds. */
export interface RequestPreview {
  label: string;
  bonus: number;
  bonusBreakdown: { label: string; value: number }[];
  mode: RollMode;
  reasons: RollModeReason[];
  chance: number | null;
  critChance: number;
  autoFail: string | null;
  notes: string[];
}

const dispositionOf = (d: unknown): Disposition => (d === 'friendly' || d === 'hostile' ? d : 'indifferent');
const modeOf = (m: unknown): RollMode => (m === 'advantage' || m === 'disadvantage' ? m : 'normal');
const optionsOf = <T>(raw: unknown): T[] => (Array.isArray(raw) ? (raw as T[]) : []);

// PROFILES AND PREPARED LINES (DM) ---------------------------------------------------

export async function getNpcProfile(npcId: string): Promise<NpcProfile | null> {
  const { data, error } = await supabase
    .from('npc_profiles')
    .select('disposition, location_pin_id')
    .eq('entity_id', npcId)
    .maybeSingle();
  if (error) throw toDataError(error);
  return data ? { disposition: dispositionOf(data.disposition), locationPinId: data.location_pin_id } : null;
}

export async function setDisposition(campaignId: string, npcId: string, disposition: Disposition): Promise<void> {
  const { error } = await supabase
    .from('npc_profiles')
    .upsert({ entity_id: npcId, campaign_id: campaignId, disposition }, { onConflict: 'entity_id' });
  if (error) throw toDataError(error);
}

interface LineRow {
  id: string;
  npc_entity_id: string;
  text: string;
  tag: string;
  condition: unknown;
  options: unknown;
  sort_order: number;
}

const toLine = (r: LineRow): DialogueLine => ({
  id: r.id,
  npcId: r.npc_entity_id,
  text: r.text,
  tag: r.tag,
  condition: r.condition ?? null,
  options: optionsOf<DialogueOption>(r.options),
  sortOrder: r.sort_order,
});

const LINE_COLUMNS = 'id, npc_entity_id, text, tag, condition, options, sort_order';

export async function listLines(npcId: string): Promise<DialogueLine[]> {
  const { data, error } = await supabase
    .from('dialogue_lines')
    .select(LINE_COLUMNS)
    .eq('npc_entity_id', npcId)
    .order('sort_order')
    .order('created_at');
  if (error) throw toDataError(error);
  return ((data ?? []) as LineRow[]).map(toLine);
}

export interface LineDraft {
  text: string;
  tag: string;
  condition: unknown;
  options: DialogueOption[];
}

function checkDraft(d: LineDraft) {
  if (!d.text.trim()) throw new DataError('validation', 'Write the line first.');
  if (d.text.length > LINE_MAX) throw new DataError('validation', 'A line can be at most 2,000 characters.');
  if (d.options.length > OPTIONS_MAX) throw new DataError('validation', 'A line can have at most 6 options.');
  if (d.options.some(o => !o.label.trim())) throw new DataError('validation', 'Every option needs a label.');
}

const draftRow = (d: LineDraft) => ({
  text: d.text.trim(),
  tag: d.tag.trim().slice(0, 40),
  condition: (d.condition ?? null) as Json,
  options: d.options.map(o => ({ ...o, label: o.label.trim() })) as unknown as NonNullable<Json>,
});

export async function createLine(campaignId: string, npcId: string, draft: LineDraft): Promise<DialogueLine> {
  checkDraft(draft);
  const { data, error } = await supabase
    .from('dialogue_lines')
    .insert({ ...draftRow(draft), npc_entity_id: npcId, campaign_id: campaignId })
    .select(LINE_COLUMNS)
    .single();
  if (error) throw toDataError(error);
  return toLine(data as LineRow);
}

export async function updateLine(lineId: string, draft: LineDraft): Promise<void> {
  checkDraft(draft);
  const { error } = await supabase.from('dialogue_lines').update(draftRow(draft)).eq('id', lineId);
  if (error) throw toDataError(error);
}

export async function deleteLine(lineId: string): Promise<void> {
  const { error } = await supabase.from('dialogue_lines').delete().eq('id', lineId);
  if (error) throw toDataError(error);
}

// SAYING AND THE LOG -------------------------------------------------------------------

export interface SayInput {
  npcId: string;
  text: string;
  options: DialogueOption[];
  groupIds: string[];
  saveToNpc: boolean;
  saveToLog: boolean;
}

export interface SayResult {
  lineKey: string;
  logId: string | null;
  lineId: string | null;
  requestIds: string[];
}

export async function sayLine(input: SayInput): Promise<SayResult> {
  checkDraft({ text: input.text, tag: '', condition: null, options: input.options });
  if (input.groupIds.length === 0) throw new DataError('validation', 'Choose who hears it.');
  const { data, error } = await supabase.rpc('say_line', {
    p_npc: input.npcId,
    p_text: input.text,
    p_options: input.options as unknown as Json,
    p_group_ids: input.groupIds,
    p_save_to_npc: input.saveToNpc,
    p_save_to_log: input.saveToLog,
  });
  if (error) {
    if (error.code === '22023') throw new DataError('validation', error.message);
    throw toDataError(error);
  }
  const d = (data ?? {}) as Partial<SayResult>;
  return { lineKey: d.lineKey ?? '', logId: d.logId ?? null, lineId: d.lineId ?? null, requestIds: d.requestIds ?? [] };
}

/** The logged lines the viewer may read (a DM: all; a player: those their group heard), newest first. */
export async function listLog(campaignId: string, npcId?: string): Promise<LogEntry[]> {
  let query = supabase
    .from('dialogue_log')
    .select('id, npc_entity_id, text, options, group_ids, said_at')
    .eq('campaign_id', campaignId)
    .order('said_at', { ascending: false })
    .limit(100);
  if (npcId) query = query.eq('npc_entity_id', npcId);
  const { data, error } = await query;
  if (error) throw toDataError(error);
  return (data ?? []).map(r => ({
    id: r.id,
    npcId: r.npc_entity_id,
    text: r.text,
    options: optionsOf<ShownOption>(r.options),
    groupIds: r.group_ids,
    saidAt: r.said_at,
  }));
}

// CHECKS -----------------------------------------------------------------------------

export interface OfferInput {
  campaignId: string;
  characterIds: string[];
  key: string;
  kind: 'check' | 'save';
  dc: number;
  mode: RollMode;
  reason: string;
  showOdds: boolean;
  prompt: string;
  npcId: string | null;
}

export async function offerCheck(input: OfferInput): Promise<string> {
  if (input.characterIds.length === 0) throw new DataError('validation', 'Choose who makes the check.');
  if (!input.prompt.trim()) throw new DataError('validation', 'Say what the check is for.');
  if (input.mode !== 'normal' && !input.reason.trim()) {
    throw new DataError('validation', `Say why the roll has ${input.mode}.`);
  }
  const { data, error } = await supabase.rpc('offer_check', {
    p_campaign: input.campaignId,
    p_character_ids: input.characterIds,
    p_key: input.key,
    p_kind: input.kind,
    p_dc: input.dc,
    p_mode: input.mode,
    p_reason: input.reason,
    p_show_odds: input.showOdds,
    p_prompt: input.prompt.trim(),
    p_npc: input.npcId as string,
  });
  if (error) {
    if (error.code === '22023' || error.code === '23514') throw new DataError('validation', error.message);
    throw toDataError(error);
  }
  return data as string;
}

export async function closeCheck(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('close_check', { p_request: requestId });
  if (error) throw toDataError(error);
}

/** DM: the campaign's latest check requests (or one NPC's), with every answer and its roll. */
export async function listRequests(campaignId: string, npcId?: string): Promise<CheckRequest[]> {
  let query = supabase
    .from('check_requests')
    .select(
      'id, character_ids, skill_or_ability, kind, dc, mode, reason, show_odds, prompt, status, npc_entity_id, created_at, check_answers(character_id, rolls(*))',
    )
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (npcId) query = query.eq('npc_entity_id', npcId);
  const { data, error } = await query;
  if (error) throw toDataError(error);
  return (data ?? []).map(r => ({
    id: r.id,
    characterIds: r.character_ids,
    key: r.skill_or_ability,
    kind: r.kind === 'save' ? 'save' : 'check',
    dc: r.dc,
    mode: modeOf(r.mode),
    reason: r.reason,
    showOdds: r.show_odds,
    prompt: r.prompt,
    status: r.status === 'open' ? 'open' : 'closed',
    npcId: r.npc_entity_id,
    createdAt: r.created_at,
    answers: (r.check_answers ?? [])
      .filter(a => a.rolls)
      .map(a => ({ characterId: a.character_id, roll: toRoll(a.rolls as never) })),
  }));
}

/** Player: their check requests (open ones by default). */
export async function listMyRequests(campaignId: string, openOnly = true): Promise<MyCheckRequest[]> {
  const { data, error } = await supabase.rpc('my_check_requests', { p_campaign: campaignId, p_open_only: openOnly });
  if (error) throw toDataError(error);
  return (data ?? []).map(r => ({
    id: r.id,
    characterIds: r.character_ids ?? [],
    key: r.skill_or_ability,
    kind: r.kind === 'save' ? 'save' : 'check',
    dc: r.dc ?? null,
    mode: modeOf(r.mode),
    reason: r.reason,
    showOdds: r.show_odds,
    prompt: r.prompt,
    status: r.status === 'open' ? 'open' : 'closed',
    npcId: r.npc_entity_id,
    createdAt: r.created_at,
    answered: r.answered ?? [],
  }));
}

async function callRequest<T>(action: 'preview' | 'roll', campaignId: string, characterId: string, requestId: string) {
  const { data, error } = await supabase.functions.invoke('roll', {
    body: { action, campaignId, characterId, requestId },
  });
  if (error) throw await functionError(error);
  return data as T;
}

/** The server's odds for answering a request: the request, not the browser, decides skill, DC and mode. */
export const previewRequest = (campaignId: string, characterId: string, requestId: string) =>
  callRequest<RequestPreview>('preview', campaignId, characterId, requestId);

/** Answers a request: one roll per character, logged and linked to the request. */
export async function answerRequest(campaignId: string, characterId: string, requestId: string): Promise<RollRow> {
  const row = await callRequest<Parameters<typeof toRoll>[0]>('roll', campaignId, characterId, requestId);
  return toRoll(row);
}
