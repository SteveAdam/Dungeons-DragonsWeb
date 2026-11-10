// P3-6: a DM's own library entries (0023_custom_content.sql). DM only: row level security returns nothing to players.
import {
  CUSTOM_KINDS,
  normaliseDefinition,
  validateCustomDefinition,
  type CustomKind,
  type Definition,
} from '@dnd-manager/rules-engine';
import { supabase } from '../lib/supabase';
import type { Json } from '../types/database';
import { DataError, toDataError } from './errors';

export interface CustomEntry {
  id: string;
  campaignId: string;
  kind: CustomKind;
  name: string;
  /** The SRD id it was cloned from, or null when it started from a template. */
  parentRef: string | null;
  definition: Definition;
  /** Uses mechanics the engine cannot calculate. */
  textOnly: boolean;
}

export interface CustomDraft {
  id?: string;
  campaignId: string;
  kind: CustomKind;
  name: string;
  parentRef: string | null;
  definition: Definition;
}

/** How a region's monster reference or an item's source points at an entry. */
export const customRef = (id: string) => `custom:${id}`;

const COLUMNS = 'id, campaign_id, kind, name, parent_ref, definition';

interface Row {
  id: string;
  campaign_id: string;
  kind: string;
  name: string;
  parent_ref: string | null;
  definition: Json;
}

function toEntry(r: Row): CustomEntry | null {
  const kind = r.kind as CustomKind;
  const check = CUSTOM_KINDS.includes(kind) ? validateCustomDefinition(kind, r.definition) : null;
  if (!check || check.errors.length > 0) {
    console.warn(`Custom entry ${r.name} cannot be read and is not shown: ${check?.errors.join('; ') ?? r.kind}`);
    return null;
  }
  return {
    id: r.id,
    campaignId: r.campaign_id,
    kind,
    name: r.name,
    parentRef: r.parent_ref,
    definition: r.definition as Definition,
    textOnly: check.textOnly,
  };
}

/** The campaign's custom entries, by name. */
export async function listCustomContent(campaignId: string): Promise<CustomEntry[]> {
  const { data, error } = await supabase
    .from('custom_content')
    .select(COLUMNS)
    .eq('campaign_id', campaignId)
    .order('name');
  if (error) throw toDataError(error);
  return ((data ?? []) as Row[]).flatMap(r => toEntry(r) ?? []);
}

/** Adds or updates an entry. Warnings never stop this; only a definition that has no valid shape does. */
export async function saveCustomContent(draft: CustomDraft): Promise<CustomEntry> {
  const name = draft.name.trim();
  if (name.length < 1 || name.length > 120) throw new DataError('validation', 'Give it a name of 1 to 120 characters.');
  const definition = normaliseDefinition(draft.kind, draft.definition);
  const { errors } = validateCustomDefinition(draft.kind, definition);
  if (errors.length > 0) throw new DataError('validation', errors[0]);

  const row = {
    campaign_id: draft.campaignId,
    kind: draft.kind,
    name,
    parent_ref: draft.parentRef,
    definition: definition as unknown as NonNullable<Json>,
  };
  const { data, error } = await (draft.id
    ? supabase.from('custom_content').update(row).eq('id', draft.id).select(COLUMNS).single()
    : supabase.from('custom_content').insert(row).select(COLUMNS).single());
  if (error?.code === '23505') {
    throw new DataError('validation', `This campaign already has a ${draft.kind} called ${name}.`);
  }
  if (error) throw toDataError(error);
  const entry = toEntry(data as Row);
  if (!entry) throw new DataError('validation');
  return entry;
}

/** Deletes an entry, unless a region or an item still uses it. */
export async function deleteCustomContent(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_custom_content', { p_id: id });
  // the database says what is using it
  if (error?.code === '23503') throw new DataError('validation', error.message);
  if (error) throw toDataError(error);
}
