// The entity registry (P2-1): entities, their folders and their relationships. Reads go straight to the
// tables (row level security filters them); every write goes through the DM-only database functions.
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import { DataError, toDataError } from './errors';

export const ENTITY_TYPES = ['npc', 'location', 'item', 'faction', 'lore', 'player', 'party', 'session'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  npc: 'NPC',
  location: 'Location',
  item: 'Item',
  faction: 'Faction',
  lore: 'Lore',
  player: 'Player character',
  party: 'Party',
  session: 'Session',
};

export interface Entity {
  id: string;
  campaignId: string;
  type: EntityType;
  name: string;
  folderId: string | null;
  visibleToPlayers: boolean;
  sortOrder: number;
}

export interface EntityFolder {
  id: string;
  campaignId: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
}

export interface EntityLink {
  id: string;
  aId: string;
  bId: string;
  /** How it reads from a's side ("owns"), and from b's side ("is owned by"). */
  labelAb: string;
  labelBa: string;
  hidden: boolean;
}

type EntityRow = Database['public']['Tables']['entities']['Row'];
type FolderRow = Database['public']['Tables']['entity_folders']['Row'];
type LinkRow = Database['public']['Tables']['entity_links']['Row'];

const toEntity = (r: EntityRow): Entity => ({
  id: r.id,
  campaignId: r.campaign_id,
  type: r.type as EntityType,
  name: r.name,
  folderId: r.folder_id,
  visibleToPlayers: r.visible_to_players,
  sortOrder: r.sort_order,
});
const toFolder = (r: FolderRow): EntityFolder => ({
  id: r.id,
  campaignId: r.campaign_id,
  parentId: r.parent_id,
  name: r.name,
  sortOrder: r.sort_order,
});
const toLink = (r: LinkRow): EntityLink => ({
  id: r.id,
  aId: r.a_id,
  bId: r.b_id,
  labelAb: r.label_ab,
  labelBa: r.label_ba,
  hidden: r.hidden,
});

/** Names and labels are checked here first, so the user gets a plain message instead of a database error. */
function cleanText(value: string, what: string, max: number): string {
  const v = value.trim();
  if (v.length < 1 || v.length > max) throw new DataError('validation', `Give the ${what} 1 to ${max} characters.`);
  return v;
}

/** A unique-name clash reads better than "duplicate key". */
function nameClash(error: unknown, message: string): never {
  const e = error as { code?: string };
  if (e?.code === '23505') throw new DataError('validation', message);
  throw toDataError(error);
}

// READS -------------------------------------------------------------------------------------------------

/** Entities of a campaign. With includeHidden false the request asks only for visible ones (players, or a DM
 * previewing as one); row level security filters players anyway. */
export async function listEntities(campaignId: string, options: { includeHidden: boolean }): Promise<Entity[]> {
  let query = supabase.from('entities').select('*').eq('campaign_id', campaignId);
  if (!options.includeHidden) query = query.eq('visible_to_players', true);
  const { data, error } = await query.order('sort_order').order('name');
  if (error) throw toDataError(error);
  return (data ?? []).map(toEntity);
}

/** DMs only (players are given no folders yet). */
export async function listFolders(campaignId: string): Promise<EntityFolder[]> {
  const { data, error } = await supabase
    .from('entity_folders')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('sort_order')
    .order('name');
  if (error) throw toDataError(error);
  return (data ?? []).map(toFolder);
}

/** Relationships of a campaign. Without includeHidden, hidden links are not asked for. */
export async function listLinks(campaignId: string, options: { includeHidden: boolean }): Promise<EntityLink[]> {
  let query = supabase.from('entity_links').select('*').eq('campaign_id', campaignId);
  if (!options.includeHidden) query = query.eq('hidden', false);
  const { data, error } = await query.order('created_at');
  if (error) throw toDataError(error);
  return (data ?? []).map(toLink);
}

// WRITES (DM only) ------------------------------------------------------------------------------------------

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw error;
  return data as T;
}

export async function createEntity(
  campaignId: string,
  input: { type: EntityType; name: string; folderId?: string | null; visible?: boolean },
): Promise<Entity> {
  const name = cleanText(input.name, 'entity a name of', 120);
  try {
    return toEntity(
      await call<EntityRow>('create_entity', {
        p_campaign: campaignId,
        p_type: input.type,
        p_name: name,
        p_folder: input.folderId ?? null,
        p_visible: input.visible ?? false,
      }),
    );
  } catch (e) {
    nameClash(e, `There is already an entity called "${name}" in this campaign.`);
  }
}

export async function renameEntity(entityId: string, name: string): Promise<Entity> {
  const clean = cleanText(name, 'entity a name of', 120);
  try {
    return toEntity(await call<EntityRow>('rename_entity', { p_entity: entityId, p_name: clean }));
  } catch (e) {
    nameClash(e, `There is already an entity called "${clean}" in this campaign.`);
  }
}

export async function deleteEntity(entityId: string): Promise<void> {
  try {
    await call('delete_entity', { p_entity: entityId });
  } catch (e) {
    throw toDataError(e);
  }
}

/** Puts an entity in a folder, or at the top level with folderId null. */
export async function moveEntity(entityId: string, folderId: string | null): Promise<Entity> {
  try {
    return toEntity(await call<EntityRow>('move_entity', { p_entity: entityId, p_folder: folderId }));
  } catch (e) {
    throw toDataError(e);
  }
}

export async function setEntityVisibility(entityId: string, visible: boolean): Promise<Entity> {
  try {
    return toEntity(await call<EntityRow>('set_entity_visibility', { p_entity: entityId, p_visible: visible }));
  } catch (e) {
    throw toDataError(e);
  }
}

export async function createFolder(campaignId: string, name: string, parentId: string | null): Promise<EntityFolder> {
  const clean = cleanText(name, 'folder a name of', 120);
  try {
    return toFolder(
      await call<FolderRow>('create_folder', { p_campaign: campaignId, p_name: clean, p_parent: parentId }),
    );
  } catch (e) {
    throw toDataError(e);
  }
}

export async function renameFolder(folderId: string, name: string): Promise<EntityFolder> {
  const clean = cleanText(name, 'folder a name of', 120);
  try {
    return toFolder(await call<FolderRow>('rename_folder', { p_folder: folderId, p_name: clean }));
  } catch (e) {
    throw toDataError(e);
  }
}

/** Moves a folder into another folder, or to the top level with parentId null. */
export async function moveFolder(folderId: string, parentId: string | null): Promise<EntityFolder> {
  try {
    return toFolder(await call<FolderRow>('move_folder', { p_folder: folderId, p_parent: parentId }));
  } catch (e) {
    const err = e as { message?: string };
    if (err?.message?.includes('inside itself')) {
      throw new DataError('validation', 'A folder cannot go inside itself or one of its own subfolders.');
    }
    throw toDataError(e);
  }
}

/** Deletes a folder; everything in it moves up one level. No entity is deleted. */
export async function deleteFolder(folderId: string): Promise<void> {
  try {
    await call('delete_folder', { p_folder: folderId });
  } catch (e) {
    throw toDataError(e);
  }
}

export async function addLink(input: {
  fromId: string;
  toId: string;
  /** How it reads from the first entity's side ("owns")... */
  label: string;
  /** ...and from the second's ("is owned by"). */
  reverseLabel: string;
  hidden: boolean;
}): Promise<EntityLink> {
  if (input.fromId === input.toId) throw new DataError('validation', 'An entity cannot be related to itself.');
  const labelAb = cleanText(input.label, 'relationship a label of', 80);
  const labelBa = cleanText(input.reverseLabel, 'other side a label of', 80);
  try {
    return toLink(
      await call<LinkRow>('add_link', {
        p_a: input.fromId,
        p_b: input.toId,
        p_label_ab: labelAb,
        p_label_ba: labelBa,
        p_hidden: input.hidden,
      }),
    );
  } catch (e) {
    nameClash(e, 'That relationship already exists between these two.');
  }
}

export async function removeLink(linkId: string): Promise<void> {
  try {
    await call('remove_link', { p_link: linkId });
  } catch (e) {
    throw toDataError(e);
  }
}

/** Hides a relationship from players, or reveals it. */
export async function setLinkHidden(linkId: string, hidden: boolean): Promise<EntityLink> {
  try {
    return toLink(await call<LinkRow>('reveal_link', { p_link: linkId, p_hidden: hidden }));
  } catch (e) {
    throw toDataError(e);
  }
}
