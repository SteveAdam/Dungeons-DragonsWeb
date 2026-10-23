// P2-7: items, the pack and transfers. Reads follow row level security (a player gets their characters' items and
// the party's); every change goes through the database functions, which keep the attunement and armour limits
// and record each move in item_transfers.
import {
  ITEM_KINDS,
  type AbilityScores,
  type Effect,
  type InventoryItem,
  type ItemDefinition,
  type ItemKind,
} from '@dnd-manager/rules-engine';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import type { Json } from '../types/database';
import { effectDurationSchema } from './characterSchema';
import { DataError, toDataError } from './errors';

export type ItemOwnerType = 'character' | 'party' | 'world';
export const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'] as const;
export type Rarity = (typeof RARITIES)[number];

/** An item as the app shows it: what the engine needs, plus who has it and what it is worth. */
export interface Item extends InventoryItem {
  campaignId: string;
  srdRef: string | null;
  valueCp: number;
  rarity: Rarity | null;
  bound: boolean;
  ownerType: ItemOwnerType;
  ownerId: string | null;
  /** The stored rules could not be read; the item is listed with none. */
  damaged: boolean;
}

export type TransferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface Transfer {
  id: string;
  itemId: string | null;
  itemName: string;
  fromType: ItemOwnerType;
  fromId: string | null;
  fromName: string;
  toType: ItemOwnerType;
  toId: string | null;
  toName: string;
  quantity: number;
  status: TransferStatus;
  createdAt: string;
  resolvedAt: string | null;
}

/** A party member as the Give dialog needs them: whose scores and effects decide who can use an item. */
export interface RosterMember {
  id: string;
  name: string;
  baseScores: AbilityScores;
  effects: Effect[];
}

// THE RULES AN ITEM CARRIES ------------------------------------------------------

const ability = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);
const requirementSchema = z.object({
  stat: ability,
  min: z.number().int().min(1).max(30),
  onUnmet: z.enum(['lock', 'speed_penalty']),
  penaltyFt: z.number().int().min(0).optional(),
});
export const itemDefinitionSchema = z.object({
  weapon: z
    .object({
      category: z.enum(['simple', 'martial']),
      kind: z.enum(['melee', 'ranged']),
      damage: z.object({ dice: z.string().regex(/^(\d+d\d+|\d+)$/), type: z.string().min(1) }),
      properties: z.array(
        z.enum(['ammunition', 'finesse', 'heavy', 'light', 'loading', 'reach', 'thrown', 'two-handed', 'versatile']),
      ),
      versatileDice: z.string().optional(),
      range: z.object({ normal: z.number().int().positive(), long: z.number().int().positive() }).optional(),
      ammunition: z.string().optional(),
      mastery: z.enum(['cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex']),
    })
    .optional(),
  armor: z
    .object({
      category: z.enum(['light', 'medium', 'heavy', 'shield']),
      baseAc: z.number().int().min(0).max(30),
      strength: z.number().int().min(1).max(30).nullable(),
      stealthDisadvantage: z.boolean(),
    })
    .optional(),
  magicBonus: z.number().int().min(-5).max(5).optional(),
  requirements: z.array(requirementSchema).optional(),
  effects: z
    .array(
      z.object({
        stat: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha', 'speed', 'ac']),
        mode: z.enum(['add', 'set', 'set_at_least']),
        value: z.number().int().min(-100).max(100),
      }),
    )
    .optional(),
  description: z.string().max(4000).optional(),
}) satisfies z.ZodType<ItemDefinition>;

// READING -----------------------------------------------------------------------------

const ITEM_COLUMNS =
  'entity_id, campaign_id, srd_ref, kind, definition, weight, value_cp, rarity, requires_attunement, bound, quantity, owner_type, owner_id, equipped, attuned, entities(name)';

interface ItemRow {
  entity_id: string;
  campaign_id: string;
  srd_ref: string | null;
  kind: string;
  definition: Json;
  weight: number | null;
  value_cp: number;
  rarity: string | null;
  requires_attunement: boolean;
  bound: boolean;
  quantity: number;
  owner_type: string;
  owner_id: string | null;
  equipped: boolean;
  attuned: boolean;
  entities: { name: string } | null;
}

function toItem(r: ItemRow): Item {
  const definition = itemDefinitionSchema.safeParse(r.definition);
  return {
    id: r.entity_id,
    campaignId: r.campaign_id,
    name: r.entities?.name ?? 'Unnamed item',
    kind: ((ITEM_KINDS as readonly string[]).includes(r.kind) ? r.kind : 'gear') as ItemKind,
    definition: definition.success ? definition.data : {},
    damaged: !definition.success,
    weight: r.weight === null ? null : Number(r.weight),
    quantity: r.quantity,
    requiresAttunement: r.requires_attunement,
    equipped: r.equipped,
    attuned: r.attuned,
    srdRef: r.srd_ref,
    valueCp: r.value_cp,
    rarity: (RARITIES as readonly string[]).includes(r.rarity ?? '') ? (r.rarity as Rarity) : null,
    bound: r.bound,
    ownerType: r.owner_type as ItemOwnerType,
    ownerId: r.owner_id,
  };
}

const byName = (a: Item, b: Item) => a.name.localeCompare(b.name);

/** Every item the viewer may read in a campaign: their characters' and the party's, or all of them for the DM. */
export async function listItems(campaignId: string): Promise<Item[]> {
  const { data, error } = await supabase.from('items').select(ITEM_COLUMNS).eq('campaign_id', campaignId);
  if (error) throw toDataError(error);
  return ((data ?? []) as unknown as ItemRow[]).map(toItem).sort(byName);
}

/** What a character carries. */
export async function listCharacterItems(characterId: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from('items')
    .select(ITEM_COLUMNS)
    .eq('owner_type', 'character')
    .eq('owner_id', characterId);
  if (error) throw toDataError(error);
  return ((data ?? []) as unknown as ItemRow[]).map(toItem).sort(byName);
}

/** The transfers the viewer may read (offers to or from their characters; all for the DM), newest first. */
export async function listTransfers(campaignId: string): Promise<Transfer[]> {
  const { data, error } = await supabase
    .from('item_transfers')
    .select(
      'id, item_id, item_name, from_type, from_id, from_name, to_type, to_id, to_name, quantity, status, created_at, resolved_at',
    )
    .eq('campaign_id', campaignId)
    .order('seq', { ascending: false })
    .limit(200);
  if (error) throw toDataError(error);
  return (data ?? []).map(t => ({
    id: t.id,
    itemId: t.item_id,
    itemName: t.item_name,
    fromType: t.from_type as ItemOwnerType,
    fromId: t.from_id,
    fromName: t.from_name,
    toType: t.to_type as ItemOwnerType,
    toId: t.to_id,
    toName: t.to_name,
    quantity: t.quantity,
    status: t.status as TransferStatus,
    createdAt: t.created_at,
    resolvedAt: t.resolved_at,
  }));
}

const scoresSchema = z.object({
  str: z.number(),
  dex: z.number(),
  con: z.number(),
  int: z.number(),
  wis: z.number(),
  cha: z.number(),
});
const rosterEffectSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.string(),
  stat: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']),
  mode: z.enum(['add', 'set', 'set_at_least']),
  value: z.number(),
  duration: effectDurationSchema,
});

/** The official Party's members with their scores and ability effects, for "who can use this". */
export async function getPartyRoster(campaignId: string): Promise<RosterMember[]> {
  const { data, error } = await supabase.rpc('party_roster', { p_campaign: campaignId });
  if (error) throw toDataError(error);
  return (data ?? []).flatMap(r => {
    const scores = scoresSchema.safeParse(r.ability_scores);
    if (!scores.success) return [];
    const effects = z.array(rosterEffectSchema).safeParse(r.effects);
    return [
      {
        id: r.character_id,
        name: r.name,
        baseScores: scores.data,
        effects: effects.success ? effects.data : [],
      },
    ];
  });
}

export interface ItemSecret {
  dmNotes: string;
  hiddenEffect: string;
}

/** DM only. */
export async function getItemSecret(itemId: string): Promise<ItemSecret> {
  const { data, error } = await supabase
    .from('item_secrets')
    .select('dm_notes, hidden_effect')
    .eq('item_id', itemId)
    .maybeSingle();
  if (error) throw toDataError(error);
  return { dmNotes: data?.dm_notes ?? '', hiddenEffect: data?.hidden_effect ?? '' };
}

// CHANGING ---------------------------------------------------------------------------------

async function call<T>(fn: () => PromiseLike<{ data: T; error: { code: string; message: string } | null }>) {
  const { data, error } = await fn();
  if (!error) return data;
  // the functions' own messages ("Only one shield can be carried at a time…") are written for people
  if (error.code === '22023' || error.code === 'P0001') throw new DataError('validation', error.message);
  throw toDataError(error);
}

export interface NewItem {
  campaignId: string;
  name: string;
  kind: ItemKind;
  definition: ItemDefinition;
  ownerType: ItemOwnerType;
  ownerId: string | null;
  quantity: number;
  weight: number | null;
  valueCp: number;
  rarity: Rarity | null;
  requiresAttunement: boolean;
  bound: boolean;
  srdRef: string | null;
}

/** DM only. */
export const createItem = (i: NewItem) =>
  call(() =>
    supabase.rpc('create_item', {
      p_campaign: i.campaignId,
      p_name: i.name,
      p_kind: i.kind,
      p_definition: i.definition as Json,
      p_owner_type: i.ownerType,
      // null for the world (the generated type does not know the column is nullable)
      p_owner_id: i.ownerId as string,
      p_quantity: i.quantity,
      p_weight: i.weight ?? undefined,
      p_value_cp: i.valueCp,
      p_rarity: i.rarity ?? undefined,
      p_requires_attunement: i.requiresAttunement,
      p_bound: i.bound,
      p_srd_ref: i.srdRef ?? undefined,
    }),
  );

export interface ItemRules {
  kind: ItemKind;
  definition: ItemDefinition;
  requiresAttunement: boolean;
  bound: boolean;
  rarity: Rarity | null;
  weight: number | null;
  valueCp: number;
}

/** DM only: an item's rules (the database keeps the limits; owners change only through moves). */
export async function updateItemRules(itemId: string, r: ItemRules): Promise<void> {
  const { data, error } = await supabase
    .from('items')
    .update({
      kind: r.kind,
      definition: r.definition as NonNullable<Json>,
      requires_attunement: r.requiresAttunement,
      // an item that no longer needs attunement cannot stay attuned
      ...(r.requiresAttunement ? {} : { attuned: false }),
      bound: r.bound,
      rarity: r.rarity,
      weight: r.weight,
      value_cp: r.valueCp,
    })
    .eq('entity_id', itemId)
    .select('entity_id');
  if (error) {
    if (error.code === 'P0001' || error.code === '23514') throw new DataError('validation', error.message);
    throw toDataError(error);
  }
  if (!data || data.length === 0) throw new DataError('forbidden');
}

/** DM only. */
export async function saveItemSecret(itemId: string, s: ItemSecret): Promise<void> {
  const { error } = await supabase
    .from('item_secrets')
    .upsert({ item_id: itemId, dm_notes: s.dmNotes, hidden_effect: s.hiddenEffect });
  if (error) throw toDataError(error);
}

export const equipItem = (itemId: string, on: boolean) =>
  call(() => supabase.rpc(on ? 'equip_item' : 'unequip_item', { p_item: itemId })).then(() => undefined);

export const attuneItem = (itemId: string, on: boolean) =>
  call(() => supabase.rpc(on ? 'attune_item' : 'unattune_item', { p_item: itemId })).then(() => undefined);

/** Nothing moves until the recipient accepts. */
export const offerTransfer = (itemId: string, toCharacterId: string, quantity: number) =>
  call(() =>
    supabase.rpc('offer_transfer', { p_item: itemId, p_to_character: toCharacterId, p_quantity: quantity }),
  ).then(() => undefined);

export const acceptTransfer = (transferId: string) =>
  call(() => supabase.rpc('accept_transfer', { p_transfer: transferId })).then(() => undefined);
export const declineTransfer = (transferId: string) =>
  call(() => supabase.rpc('decline_transfer', { p_transfer: transferId })).then(() => undefined);
export const cancelTransfer = (transferId: string) =>
  call(() => supabase.rpc('cancel_transfer', { p_transfer: transferId })).then(() => undefined);

/** DM only: moves an item (or part of a stack) at once. */
export const forceMoveItem = (itemId: string, toType: ItemOwnerType, toId: string | null, quantity: number) =>
  call(() =>
    supabase.rpc('force_move_item', {
      p_item: itemId,
      p_to_type: toType,
      p_to_id: toId as string,
      p_quantity: quantity,
    }),
  ).then(() => undefined);
