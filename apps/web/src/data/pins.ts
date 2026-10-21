import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import { DataError, toDataError } from './errors';

export const PIN_TYPES = ['location', 'character', 'faction', 'lore'] as const;
export type PinType = (typeof PIN_TYPES)[number];

/** The same rules as the database (0002_core_schema.sql), checked first so the user gets a plain message. */
export const PIN_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
export const PIN_SIZE = { min: 16, max: 80 } as const;
export const DEFAULT_PIN_COLOR = '#8E2A22';

/** A pin, in image pixels: x from the left edge, y from the top edge. DM notes are not here (pinSecrets). */
export interface Pin {
  id: string;
  mapId: string;
  type: PinType;
  title: string;
  x: number;
  y: number;
  color: string;
  size: number;
  visibleToPlayers: boolean;
  description: string;
  history: string;
  traits: string[];
  tags: string[];
  musicUrl: string | null;
}

export type PinChanges = Partial<Omit<Pin, 'id' | 'mapId'>>;

interface PinRow {
  id: string;
  map_id: string;
  type: string;
  title: string;
  x: number;
  y: number;
  color: string;
  size: number;
  visible_to_players: boolean;
  description: string;
  history: string;
  traits: string[] | null;
  tags: string[] | null;
  music_url: string | null;
}

const COLUMNS =
  'id, map_id, type, title, x, y, color, size, visible_to_players, description, history, traits, tags, music_url';

const toPin = (r: PinRow): Pin => ({
  id: r.id,
  mapId: r.map_id,
  type: (PIN_TYPES as readonly string[]).includes(r.type) ? (r.type as PinType) : 'location',
  title: r.title,
  x: r.x,
  y: r.y,
  color: r.color,
  size: r.size,
  visibleToPlayers: r.visible_to_players,
  description: r.description,
  history: r.history,
  traits: r.traits ?? [],
  tags: r.tags ?? [],
  musicUrl: r.music_url,
});

/** Checks changes against the database's rules and returns them cleaned up (trimmed, lists de-blanked). */
export function validatePinChanges(changes: PinChanges): PinChanges {
  const clean: PinChanges = { ...changes };
  if (clean.title !== undefined) {
    clean.title = clean.title.trim();
    if (clean.title.length < 1 || clean.title.length > 120) {
      throw new DataError('validation', 'Give the pin a title of 1 to 120 characters.');
    }
  }
  if (clean.type !== undefined && !PIN_TYPES.includes(clean.type)) {
    throw new DataError('validation', 'Choose a pin type: location, character, faction or lore.');
  }
  if (clean.color !== undefined && !PIN_COLOR_PATTERN.test(clean.color)) {
    throw new DataError('validation', 'The colour must look like #8E2A22: a # and six hex digits.');
  }
  if (
    clean.size !== undefined &&
    (!Number.isInteger(clean.size) || clean.size < PIN_SIZE.min || clean.size > PIN_SIZE.max)
  ) {
    throw new DataError('validation', `The size must be a whole number from ${PIN_SIZE.min} to ${PIN_SIZE.max}.`);
  }
  for (const axis of ['x', 'y'] as const) {
    const value = clean[axis];
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new DataError('validation', 'The position must be a number of pixels from the left (X) and top (Y) edges.');
    }
    if (value !== undefined) clean[axis] = Math.round(value);
  }
  if (clean.musicUrl !== undefined) {
    const url = clean.musicUrl?.trim() ?? '';
    if (url && !/^https:\/\/\S+$/i.test(url)) {
      throw new DataError('validation', 'The music link must be a full https:// address.');
    }
    clean.musicUrl = url || null;
  }
  for (const list of ['traits', 'tags'] as const) {
    if (clean[list] !== undefined) clean[list] = clean[list]!.map(v => v.trim()).filter(Boolean);
  }
  return clean;
}

type PinUpdate = Database['public']['Tables']['pins']['Update'];

function toRow(changes: PinChanges): PinUpdate {
  const row: Record<string, unknown> = {};
  const map: Record<keyof PinChanges, string> = {
    type: 'type',
    title: 'title',
    x: 'x',
    y: 'y',
    color: 'color',
    size: 'size',
    visibleToPlayers: 'visible_to_players',
    description: 'description',
    history: 'history',
    traits: 'traits',
    tags: 'tags',
    musicUrl: 'music_url',
  };
  for (const [key, column] of Object.entries(map) as [keyof PinChanges, string][]) {
    if (changes[key] !== undefined) row[column] = changes[key];
  }
  return row as PinUpdate;
}

/**
 * The pins on a map. With includeHidden false the request asks only for visible pins, so a player (or a DM
 * previewing as one) never receives a hidden pin. Players are also filtered by row level security.
 */
export async function listPins(mapId: string, options: { includeHidden: boolean }): Promise<Pin[]> {
  let query = supabase.from('pins').select(COLUMNS).eq('map_id', mapId);
  if (!options.includeHidden) query = query.eq('visible_to_players', true);
  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) throw toDataError(error);
  return ((data ?? []) as PinRow[]).map(toPin);
}

/** DMs only. A new pin starts hidden, so nothing is revealed by accident. */
export async function createPin(mapId: string, at: { x: number; y: number }, type: PinType = 'location'): Promise<Pin> {
  const { data, error } = await supabase
    .from('pins')
    .insert({
      map_id: mapId,
      type,
      title: 'New pin',
      x: Math.round(at.x),
      y: Math.round(at.y),
      visible_to_players: false,
    })
    .select(COLUMNS)
    .single();
  if (error) throw toDataError(error);
  return toPin(data as PinRow);
}

/** DMs only. */
export async function updatePin(pinId: string, changes: PinChanges): Promise<Pin> {
  const row = toRow(validatePinChanges(changes));
  const { data, error } = await supabase.from('pins').update(row).eq('id', pinId).select(COLUMNS).maybeSingle();
  if (error) throw toDataError(error);
  if (!data) throw new DataError('forbidden'); // row level security hides rows instead of refusing
  return toPin(data as PinRow);
}

/** DMs only. Its DM notes and links go with it (on delete cascade). */
export async function deletePin(pinId: string): Promise<void> {
  const { data, error } = await supabase.from('pins').delete().eq('id', pinId).select('id');
  if (error) throw toDataError(error);
  if (!data || data.length === 0) throw new DataError('forbidden');
}
