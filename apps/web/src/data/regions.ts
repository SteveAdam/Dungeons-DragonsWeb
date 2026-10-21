import { isTerrain, isWeather, type Terrain, type Weather } from '@dnd-manager/rules-engine';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import { DataError, toDataError } from './errors';

/**
 * A region of a map with its own terrain and weather, drawn as a circle. Positions are in image pixels like
 * pins: cx from the left edge, cy from the top edge, radius in pixels.
 */
export interface Region {
  id: string;
  mapId: string;
  name: string;
  cx: number;
  cy: number;
  radius: number;
  terrain: Terrain;
  weather: Weather;
  description: string;
  visibleToPlayers: boolean;
}

export type RegionChanges = Partial<Omit<Region, 'id' | 'mapId'>>;

/** The smallest circle worth drawing, in image pixels; the database only insists on more than zero. */
export const MIN_REGION_RADIUS = 8;

interface RegionRow {
  id: string;
  map_id: string;
  name: string;
  cx: number;
  cy: number;
  radius: number;
  terrain: string;
  weather: string;
  description: string;
  visible_to_players: boolean;
}

const COLUMNS = 'id, map_id, name, cx, cy, radius, terrain, weather, description, visible_to_players';

const toRegion = (r: RegionRow): Region => ({
  id: r.id,
  mapId: r.map_id,
  name: r.name,
  cx: r.cx,
  cy: r.cy,
  radius: r.radius,
  terrain: isTerrain(r.terrain) ? r.terrain : 'grassland',
  weather: isWeather(r.weather) ? r.weather : 'clear',
  description: r.description,
  visibleToPlayers: r.visible_to_players,
});

/** Checks changes against the database's rules (0003_regions.sql) and returns them cleaned up. */
export function validateRegionChanges(changes: RegionChanges): RegionChanges {
  const clean: RegionChanges = { ...changes };
  if (clean.name !== undefined) {
    clean.name = clean.name.trim();
    if (clean.name.length < 1 || clean.name.length > 120) {
      throw new DataError('validation', 'Give the region a name of 1 to 120 characters.');
    }
  }
  if (clean.terrain !== undefined && !isTerrain(clean.terrain)) {
    throw new DataError('validation', 'Choose a terrain from the list.');
  }
  if (clean.weather !== undefined && !isWeather(clean.weather)) {
    throw new DataError('validation', 'Choose the weather from the list.');
  }
  for (const axis of ['cx', 'cy'] as const) {
    const value = clean[axis];
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new DataError('validation', 'The centre must be a number of pixels from the left and top edges.');
    }
    if (value !== undefined) clean[axis] = Math.round(value);
  }
  if (clean.radius !== undefined) {
    if (!Number.isFinite(clean.radius) || clean.radius < MIN_REGION_RADIUS) {
      throw new DataError('validation', `The radius must be at least ${MIN_REGION_RADIUS} pixels.`);
    }
    clean.radius = Math.round(clean.radius);
  }
  return clean;
}

type RegionUpdate = Database['public']['Tables']['regions']['Update'];

function toRow(changes: RegionChanges): RegionUpdate {
  const row: Record<string, unknown> = {};
  const map: Record<keyof RegionChanges, string> = {
    name: 'name',
    cx: 'cx',
    cy: 'cy',
    radius: 'radius',
    terrain: 'terrain',
    weather: 'weather',
    description: 'description',
    visibleToPlayers: 'visible_to_players',
  };
  for (const [key, column] of Object.entries(map) as [keyof RegionChanges, string][]) {
    if (changes[key] !== undefined) row[column] = changes[key];
  }
  return row as RegionUpdate;
}

/**
 * The regions of a map. With includeHidden false only revealed regions are asked for, so a player (or a DM
 * previewing as one) never receives a hidden one. Players are also filtered by row level security.
 */
export async function listRegions(mapId: string, options: { includeHidden: boolean }): Promise<Region[]> {
  let query = supabase.from('regions').select(COLUMNS).eq('map_id', mapId);
  if (!options.includeHidden) query = query.eq('visible_to_players', true);
  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) throw toDataError(error);
  return ((data ?? []) as RegionRow[]).map(toRegion);
}

/** DMs only. A new region starts hidden, like a new pin. */
export async function createRegion(
  mapId: string,
  circle: { cx: number; cy: number; radius: number },
  terrain: Terrain = 'grassland',
): Promise<Region> {
  const clean = validateRegionChanges(circle);
  const { data, error } = await supabase
    .from('regions')
    .insert({
      map_id: mapId,
      name: 'New region',
      cx: clean.cx!,
      cy: clean.cy!,
      radius: clean.radius!,
      terrain,
      weather: 'clear',
      visible_to_players: false,
    })
    .select(COLUMNS)
    .single();
  if (error) throw toDataError(error);
  return toRegion(data as RegionRow);
}

/** DMs only. */
export async function updateRegion(regionId: string, changes: RegionChanges): Promise<Region> {
  const row = toRow(validateRegionChanges(changes));
  const { data, error } = await supabase.from('regions').update(row).eq('id', regionId).select(COLUMNS).maybeSingle();
  if (error) throw toDataError(error);
  if (!data) throw new DataError('forbidden'); // row level security hides rows instead of refusing
  return toRegion(data as RegionRow);
}

/** DMs only. */
export async function deleteRegion(regionId: string): Promise<void> {
  const { data, error } = await supabase.from('regions').delete().eq('id', regionId).select('id');
  if (error) throw toDataError(error);
  if (!data || data.length === 0) throw new DataError('forbidden');
}
