// Spawn pins (P3-2): DM-only markers for where creatures, finds, interactables and traps sit on a map, optionally
// linked to a region content entry. Players never request them, and row level security refuses them anyway.
import { SPAWN_PIN_KINDS, type SpawnPinKind } from '@dnd-manager/rules-engine';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import { DataError, toDataError } from './errors';

export interface SpawnPin {
  id: string;
  mapId: string;
  x: number;
  y: number;
  kind: SpawnPinKind;
  label: string;
  contentId: string | null;
}

export type SpawnPinChanges = Partial<Pick<SpawnPin, 'x' | 'y' | 'kind' | 'label' | 'contentId'>>;

interface SpawnPinRow {
  id: string;
  map_id: string;
  x: number;
  y: number;
  kind: string;
  label: string;
  content_id: string | null;
}

const COLUMNS = 'id, map_id, x, y, kind, label, content_id';

const toSpawnPin = (r: SpawnPinRow): SpawnPin => ({
  id: r.id,
  mapId: r.map_id,
  x: r.x,
  y: r.y,
  kind: (SPAWN_PIN_KINDS as readonly string[]).includes(r.kind) ? (r.kind as SpawnPinKind) : 'creature',
  label: r.label,
  contentId: r.content_id,
});

type SpawnPinUpdate = Database['public']['Tables']['spawn_pins']['Update'];

function toRow(changes: SpawnPinChanges): SpawnPinUpdate {
  const row: SpawnPinUpdate = {};
  for (const axis of ['x', 'y'] as const) {
    const v = changes[axis];
    if (v === undefined) continue;
    if (!Number.isFinite(v) || v < 0) throw new DataError('validation', 'The position must be on the map.');
    row[axis] = Math.round(v);
  }
  if (changes.kind !== undefined) row.kind = changes.kind;
  if (changes.label !== undefined) {
    const label = changes.label.trim();
    if (label.length > 120) throw new DataError('validation', 'The label is at most 120 characters.');
    row.label = label;
  }
  if (changes.contentId !== undefined) row.content_id = changes.contentId;
  return row;
}

/** DM only. */
export async function listSpawnPins(mapId: string): Promise<SpawnPin[]> {
  const { data, error } = await supabase
    .from('spawn_pins')
    .select(COLUMNS)
    .eq('map_id', mapId)
    .order('created_at', { ascending: true });
  if (error) throw toDataError(error);
  return ((data ?? []) as SpawnPinRow[]).map(toSpawnPin);
}

/** DM only. */
export async function createSpawnPin(
  mapId: string,
  at: { x: number; y: number },
  kind: SpawnPinKind,
): Promise<SpawnPin> {
  const { data, error } = await supabase
    .from('spawn_pins')
    .insert({ map_id: mapId, ...toRow({ ...at, kind }) } as { map_id: string; x: number; y: number })
    .select(COLUMNS)
    .single();
  if (error) throw toDataError(error);
  return toSpawnPin(data as SpawnPinRow);
}

/** DM only. */
export async function updateSpawnPin(id: string, changes: SpawnPinChanges): Promise<SpawnPin> {
  const { data, error } = await supabase
    .from('spawn_pins')
    .update(toRow(changes))
    .eq('id', id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) {
    const e = error as { code?: string; message?: string };
    if (e.code === '22023' && e.message) throw new DataError('validation', `${e.message}.`);
    throw toDataError(error);
  }
  if (!data) throw new DataError('forbidden');
  return toSpawnPin(data as SpawnPinRow);
}

/** DM only. */
export async function deleteSpawnPin(id: string): Promise<void> {
  const { data, error } = await supabase.from('spawn_pins').delete().eq('id', id).select('id');
  if (error) throw toDataError(error);
  if (!data || data.length === 0) throw new DataError('forbidden');
}
