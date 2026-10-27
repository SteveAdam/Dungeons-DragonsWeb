// What lives in a region (P3-2, 0019_region_content.sql): creatures, folk, finds, shops and interactables, their
// DM notes, and the random encounter roll. DM only: players never request any of this (they get masked rows from
// a function in P3-3), so every caller asks only while DM mode is on.
import {
  CONTENT_KINDS,
  DEFAULT_SPAWN_RULE,
  DISCOVERY_STATES,
  SKILL_KEYS,
  validateSpawnRule,
  type ContentKind,
  type DiscoveryState,
  type SkillKey,
  type SpawnRule,
} from '@dnd-manager/rules-engine';
import { supabase } from '../lib/supabase';
import type { Json } from '../types/database';
import { DataError, toDataError } from './errors';

export interface StockLine {
  itemRef: string;
  priceCp: number;
}

export interface RegionContent {
  id: string;
  regionId: string;
  kind: ContentKind;
  name: string;
  /** An NPC or item from the registry. */
  entityId: string | null;
  /** An SRD or custom monster id (free text until the monster library exists). */
  monsterRef: string | null;
  description: string;
  quantity: number | null;
  /** Shops only. */
  stock: StockLine[];
  state: DiscoveryState;
  hintText: string | null;
  discoveryDc: number | null;
  discoverySkill: SkillKey;
  spawnRule: SpawnRule;
  sortOrder: number;
}

/** What the entry form edits. */
export type ContentDraft = Omit<RegionContent, 'id' | 'regionId' | 'sortOrder'>;

export const emptyDraft = (kind: ContentKind): ContentDraft => ({
  kind,
  name: '',
  entityId: null,
  monsterRef: null,
  description: '',
  quantity: null,
  stock: [],
  state: kind === 'folk' || kind === 'shop' ? 'noticed' : 'hidden',
  hintText: null,
  discoveryDc: null,
  discoverySkill: 'perception',
  spawnRule: DEFAULT_SPAWN_RULE,
});

interface ContentRow {
  id: string;
  region_id: string;
  kind: string;
  name: string;
  entity_id: string | null;
  monster_ref: string | null;
  details: Json;
  state: string;
  hint_text: string | null;
  discovery_dc: number | null;
  discovery_skill: string;
  spawn_rule: Json;
  sort_order: number;
}

const COLUMNS =
  'id, region_id, kind, name, entity_id, monster_ref, details, state, hint_text, discovery_dc, discovery_skill, spawn_rule, sort_order';

function toContent(r: ContentRow): RegionContent {
  const details = (r.details ?? {}) as { description?: string; quantity?: number; stock?: StockLine[] };
  const rule = (r.spawn_rule ?? {}) as Partial<SpawnRule>;
  return {
    id: r.id,
    regionId: r.region_id,
    kind: (CONTENT_KINDS as readonly string[]).includes(r.kind) ? (r.kind as ContentKind) : 'find',
    name: r.name,
    entityId: r.entity_id,
    monsterRef: r.monster_ref,
    description: details.description ?? '',
    quantity: typeof details.quantity === 'number' ? details.quantity : null,
    stock: Array.isArray(details.stock) ? details.stock : [],
    state: (DISCOVERY_STATES as readonly string[]).includes(r.state) ? (r.state as DiscoveryState) : 'hidden',
    hintText: r.hint_text,
    discoveryDc: r.discovery_dc,
    discoverySkill: (SKILL_KEYS as string[]).includes(r.discovery_skill)
      ? (r.discovery_skill as SkillKey)
      : 'perception',
    spawnRule: { ...DEFAULT_SPAWN_RULE, ...rule, count: { ...DEFAULT_SPAWN_RULE.count, ...rule.count } },
    sortOrder: r.sort_order,
  };
}

/** Checks a draft against the database's rules and returns the columns to write. Throws a plain-words error. */
export function contentToRow(draft: ContentDraft) {
  const fail = (message: string): never => {
    throw new DataError('validation', message);
  };
  const name = draft.name.trim();
  if (name.length < 1 || name.length > 120) fail('Give the entry a name of 1 to 120 characters.');
  const monsterRef = draft.monsterRef?.trim() || null;
  if (monsterRef && monsterRef.length > 120) fail('The monster reference is at most 120 characters.');
  const hintText = draft.hintText?.trim() || null;
  if (hintText && hintText.length > 300) fail('The hint is at most 300 characters.');
  if (
    draft.discoveryDc !== null &&
    !(Number.isInteger(draft.discoveryDc) && draft.discoveryDc >= 1 && draft.discoveryDc <= 40)
  ) {
    fail('The discovery DC is a whole number from 1 to 40.');
  }
  if (draft.description.length > 4000) fail('The description is at most 4,000 characters.');
  if (draft.quantity !== null && !(Number.isFinite(draft.quantity) && draft.quantity >= 0)) {
    fail('The quantity cannot be negative.');
  }
  const ruleErrors = validateSpawnRule(draft.spawnRule);
  if (ruleErrors.length > 0) fail(ruleErrors[0]);
  const stock = draft.kind === 'shop' ? draft.stock.map(s => ({ itemRef: s.itemRef.trim(), priceCp: s.priceCp })) : [];
  for (const line of stock) {
    if (line.itemRef.length < 1 || line.itemRef.length > 120)
      fail('Every stock line needs an item of 1 to 120 characters.');
    if (!(Number.isInteger(line.priceCp) && line.priceCp >= 0)) fail('Prices are whole copper pieces, 0 or more.');
  }
  const details: Record<string, unknown> = {};
  if (draft.description.trim()) details.description = draft.description.trim();
  if (draft.quantity !== null) details.quantity = draft.quantity;
  if (stock.length > 0) details.stock = stock;
  return {
    kind: draft.kind,
    name,
    entity_id: draft.entityId,
    monster_ref: monsterRef,
    details: details as NonNullable<Json>,
    state: draft.state,
    hint_text: hintText,
    discovery_dc: draft.discoveryDc,
    discovery_skill: draft.discoverySkill,
    spawn_rule: draft.spawnRule as unknown as NonNullable<Json>,
  };
}

/** The content of these regions, in the DM's order. DM only. */
export async function listRegionContent(regionIds: string[]): Promise<RegionContent[]> {
  if (regionIds.length === 0) return [];
  const { data, error } = await supabase
    .from('region_content')
    .select(COLUMNS)
    .in('region_id', regionIds)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw toDataError(error);
  return ((data ?? []) as ContentRow[]).map(toContent);
}

const passOnRefusal = (error: unknown): never => {
  const e = error as { code?: string; message?: string };
  if (e.code === '22023' && e.message) throw new DataError('validation', `${e.message}.`);
  throw toDataError(error);
};

async function saveNotes(contentId: string, notes: string) {
  if (notes.length > 4000) throw new DataError('validation', 'DM notes are at most 4,000 characters.');
  const { error } = await supabase.from('region_content_secrets').upsert({ content_id: contentId, dm_notes: notes });
  if (error) throw toDataError(error);
}

/** DM only. New entries go to the end of their region. */
export async function createContent(regionId: string, draft: ContentDraft, dmNotes: string): Promise<RegionContent> {
  const row = contentToRow(draft);
  const { data, error } = await supabase
    .from('region_content')
    .insert({ ...row, region_id: regionId, sort_order: Date.now() % 2_000_000_000 })
    .select(COLUMNS)
    .single();
  if (error) passOnRefusal(error);
  const created = toContent(data as ContentRow);
  if (dmNotes.trim()) await saveNotes(created.id, dmNotes);
  return created;
}

/** DM only. */
export async function updateContent(contentId: string, draft: ContentDraft, dmNotes: string): Promise<RegionContent> {
  const { data, error } = await supabase
    .from('region_content')
    .update(contentToRow(draft))
    .eq('id', contentId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) passOnRefusal(error);
  if (!data) throw new DataError('forbidden');
  await saveNotes(contentId, dmNotes);
  return toContent(data as ContentRow);
}

/** DM only. Spawn pins that pointed at it stay, unlinked. */
export async function deleteContent(contentId: string): Promise<void> {
  const { data, error } = await supabase.from('region_content').delete().eq('id', contentId).select('id');
  if (error) throw toDataError(error);
  if (!data || data.length === 0) throw new DataError('forbidden');
}

/** DM only: the notes of one entry ('' when there are none). */
export async function getContentNotes(contentId: string): Promise<string> {
  const { data, error } = await supabase
    .from('region_content_secrets')
    .select('dm_notes')
    .eq('content_id', contentId)
    .maybeSingle();
  if (error) throw toDataError(error);
  return (data as { dm_notes: string } | null)?.dm_notes ?? '';
}

export interface EncounterResult {
  contentId: string;
  name: string;
  monsterRef: string | null;
  count: number;
}

export interface EncounterRoll {
  rollId: string;
  hour: number;
  isDay: boolean;
  results: EncounterResult[];
}

/** DM only: rolls the region's creatures on the server (secure dice, game-clock hour) and logs it. */
export async function rollRandomEncounter(regionId: string): Promise<EncounterRoll> {
  const { data, error } = await supabase.rpc('roll_random_encounter', { p_region: regionId });
  if (error) throw toDataError(error);
  return data as unknown as EncounterRoll;
}

/** The roll as one line for the session log: "Mourning Wood, 23:00 (night): Thornwolf pack × 2". */
export function encounterLogLine(regionName: string, roll: EncounterRoll): string {
  const when = `${String(roll.hour).padStart(2, '0')}:00 (${roll.isDay ? 'day' : 'night'})`;
  const what = roll.results.length === 0 ? 'no encounter' : roll.results.map(r => `${r.name} × ${r.count}`).join(', ');
  return `Random encounter in ${regionName}, ${when}: ${what}`;
}

/** DM only: the daylight hours used by the day/night rule (campaigns.settings). */
export async function setDaylightHours(campaignId: string, start: number, end: number): Promise<void> {
  const { error } = await supabase.rpc('set_daylight_hours', { p_campaign: campaignId, p_start: start, p_end: end });
  if (error) passOnRefusal(error);
}
