import { supabase } from '../lib/supabase';
import { DataError, toDataError } from './errors';

export interface MapSummary {
  id: string;
  name: string;
  imagePath: string;
  visibleToPlayers: boolean;
  createdAt: string;
}

export interface CampaignMap extends MapSummary {
  campaignId: string;
  width: number;
  height: number;
  fogMode: 'shared' | 'per_group';
  parentPinId: string | null;
  tools: MapTools;
}

/** The DM's settings for measuring, the compass and the grid (0006_map_tools.sql). */
export interface MapTools {
  /** How far the map's full width spans, in `scaleUnit`; null until the DM sets it. */
  scaleWidth: number | null;
  scaleUnit: 'mi' | 'ft';
  /** The direction of north, in degrees clockwise from the top of the image. */
  northDegrees: number;
  /** Grid square size in `scaleUnit`; null for no grid. */
  gridSize: number | null;
}

interface MapRow {
  id: string;
  campaign_id: string;
  name: string;
  image_path: string;
  width: number;
  height: number;
  visible_to_players: boolean;
  fog_mode: string;
  parent_pin_id: string | null;
  created_at: string;
  scale_width: number | null;
  scale_unit: string;
  north_degrees: number;
  grid_size: number | null;
}

const SUMMARY_COLUMNS = 'id, name, image_path, visible_to_players, created_at';
const MAP_COLUMNS =
  'id, campaign_id, name, image_path, width, height, visible_to_players, fog_mode, parent_pin_id, created_at, scale_width, scale_unit, north_degrees, grid_size';

const toSummary = (
  r: Pick<MapRow, 'id' | 'name' | 'image_path' | 'visible_to_players' | 'created_at'>,
): MapSummary => ({
  id: r.id,
  name: r.name,
  imagePath: r.image_path,
  visibleToPlayers: r.visible_to_players,
  createdAt: r.created_at,
});

const toMap = (r: MapRow): CampaignMap => ({
  ...toSummary(r),
  campaignId: r.campaign_id,
  width: r.width,
  height: r.height,
  fogMode: r.fog_mode === 'per_group' ? 'per_group' : 'shared',
  parentPinId: r.parent_pin_id,
  tools: {
    scaleWidth: r.scale_width == null ? null : Number(r.scale_width),
    scaleUnit: r.scale_unit === 'ft' ? 'ft' : 'mi',
    northDegrees: r.north_degrees ?? 0,
    gridSize: r.grid_size == null ? null : Number(r.grid_size),
  },
});

/**
 * Top-level maps of a campaign (sub-maps hang off pins). With includeHidden false the request itself asks
 * only for visible maps, so "preview as player" never fetches hidden data. Players are filtered by the
 * database either way.
 */
export async function listMaps(campaignId: string, options: { includeHidden: boolean }): Promise<MapSummary[]> {
  let query = supabase.from('maps').select(SUMMARY_COLUMNS).eq('campaign_id', campaignId).is('parent_pin_id', null);
  if (!options.includeHidden) query = query.eq('visible_to_players', true);

  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) throw toDataError(error);
  return ((data ?? []) as MapRow[]).map(toSummary);
}

/** One map. Without includeHidden a hidden map is not even requested: it comes back as not-found. */
export async function getMap(mapId: string, options: { includeHidden: boolean }): Promise<CampaignMap> {
  let query = supabase.from('maps').select(MAP_COLUMNS).eq('id', mapId);
  if (!options.includeHidden) query = query.eq('visible_to_players', true);
  const { data, error } = await query.maybeSingle();
  if (error) throw toDataError(error);
  if (!data)
    throw new DataError('not-found', 'We could not find that map. It may be hidden, or it may have been removed.');
  return toMap(data as MapRow);
}

export interface NewMap {
  name: string;
  imagePath: string;
  width: number;
  height: number;
  visibleToPlayers: boolean;
  /** Set to put this map beneath a pin (a sub-map). The pin must be on a map in the same campaign. */
  parentPinId?: string | null;
}

/** DMs only. The image must already be uploaded (see lib/storage). */
export async function createMap(campaignId: string, map: NewMap): Promise<CampaignMap> {
  const name = map.name.trim();
  if (name.length < 1 || name.length > 120) {
    throw new DataError('validation', 'Give the map a name of 1 to 120 characters.');
  }
  const { data, error } = await supabase
    .from('maps')
    .insert({
      campaign_id: campaignId,
      name,
      image_path: map.imagePath,
      width: map.width,
      height: map.height,
      visible_to_players: map.visibleToPlayers,
      ...(map.parentPinId ? { parent_pin_id: map.parentPinId } : {}),
    })
    .select(MAP_COLUMNS)
    .single();
  if (error) throw toDataError(error);
  return toMap(data as MapRow);
}

/** DMs only: show the map to players, or hide it again. */
export async function setMapVisible(mapId: string, visible: boolean): Promise<CampaignMap> {
  const { data, error } = await supabase
    .from('maps')
    .update({ visible_to_players: visible })
    .eq('id', mapId)
    .select(MAP_COLUMNS)
    .maybeSingle();
  if (error) throw toDataError(error);
  if (!data) throw new DataError('forbidden');
  return toMap(data as MapRow);
}

/** DMs only. Checks the values first so the user gets a plain message. */
export async function setMapTools(mapId: string, tools: MapTools): Promise<CampaignMap> {
  if (tools.scaleWidth !== null && !(Number.isFinite(tools.scaleWidth) && tools.scaleWidth > 0)) {
    throw new DataError('validation', 'The map width must be a distance above zero.');
  }
  if (tools.gridSize !== null && !(Number.isFinite(tools.gridSize) && tools.gridSize > 0)) {
    throw new DataError('validation', 'The grid size must be a distance above zero.');
  }
  if (!Number.isInteger(tools.northDegrees) || tools.northDegrees < 0 || tools.northDegrees > 359) {
    throw new DataError('validation', 'North must be a whole number of degrees from 0 to 359.');
  }
  const { data, error } = await supabase
    .from('maps')
    .update({
      scale_width: tools.scaleWidth,
      scale_unit: tools.scaleUnit,
      north_degrees: tools.northDegrees,
      grid_size: tools.gridSize,
    })
    .eq('id', mapId)
    .select(MAP_COLUMNS)
    .maybeSingle();
  if (error) throw toDataError(error);
  if (!data) throw new DataError('forbidden');
  return toMap(data as MapRow);
}

/** A map that hangs beneath a pin. */
export interface SubMap extends MapSummary {
  parentPinId: string;
}

/**
 * The maps beneath the given pins, keyed by pin. With includeHidden false the request asks only for visible
 * maps (players are also filtered by row level security, which hides a map whose parent pin is hidden).
 */
export async function listSubMaps(pinIds: string[], options: { includeHidden: boolean }): Promise<Map<string, SubMap>> {
  const byPin = new Map<string, SubMap>();
  if (pinIds.length === 0) return byPin;
  let query = supabase
    .from('maps')
    .select('id, name, image_path, visible_to_players, created_at, parent_pin_id')
    .in('parent_pin_id', pinIds);
  if (!options.includeHidden) query = query.eq('visible_to_players', true);
  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) throw toDataError(error);
  for (const row of (data ?? []) as MapRow[]) {
    // one map per pin: if a DM somehow made two, the first one wins
    if (row.parent_pin_id && !byPin.has(row.parent_pin_id)) {
      byPin.set(row.parent_pin_id, { ...toSummary(row), parentPinId: row.parent_pin_id });
    }
  }
  return byPin;
}

/** One step up the breadcrumb: a map above the current one, reached through one of its pins. */
export interface MapTrailStep {
  mapId: string;
  name: string;
}

/**
 * The maps above this one, top first (world, region, town…). Stops at the top, at a map the caller cannot see,
 * or after 12 steps. Without includeHidden it never requests a hidden map or pin.
 */
export async function getMapTrail(
  map: Pick<CampaignMap, 'parentPinId'>,
  options: { includeHidden: boolean },
): Promise<MapTrailStep[]> {
  const trail: MapTrailStep[] = [];
  let parentPinId = map.parentPinId;
  for (let depth = 0; parentPinId && depth < 12; depth++) {
    let pinQuery = supabase.from('pins').select('map_id').eq('id', parentPinId);
    if (!options.includeHidden) pinQuery = pinQuery.eq('visible_to_players', true);
    const { data: pin, error: pinError } = await pinQuery.maybeSingle();
    if (pinError) throw toDataError(pinError);
    if (!pin) break;

    let mapQuery = supabase
      .from('maps')
      .select('id, name, parent_pin_id')
      .eq('id', (pin as { map_id: string }).map_id);
    if (!options.includeHidden) mapQuery = mapQuery.eq('visible_to_players', true);
    const { data: parent, error: mapError } = await mapQuery.maybeSingle();
    if (mapError) throw toDataError(mapError);
    if (!parent) break;
    const row = parent as Pick<MapRow, 'id' | 'name' | 'parent_pin_id'>;
    trail.unshift({ mapId: row.id, name: row.name });
    parentPinId = row.parent_pin_id;
  }
  return trail;
}
