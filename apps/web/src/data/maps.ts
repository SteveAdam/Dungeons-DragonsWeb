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
  /** P4-3: fog of war is on for this map (off until the DM turns it on). */
  fogEnabled: boolean;
  /** The pin this map hangs beneath (a detail map), or null. A map has at most one parent: a pin or a region. */
  parentPinId: string | null;
  /** The region this map hangs beneath, or null. */
  parentRegionId: string | null;
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
  fog_enabled: boolean;
  parent_pin_id: string | null;
  parent_region_id: string | null;
  created_at: string;
  scale_width: number | null;
  scale_unit: string;
  north_degrees: number;
  grid_size: number | null;
}

const SUMMARY_COLUMNS = 'id, name, image_path, visible_to_players, created_at';
const MAP_COLUMNS =
  'id, campaign_id, name, image_path, width, height, visible_to_players, fog_mode, fog_enabled, parent_pin_id, parent_region_id, created_at, scale_width, scale_unit, north_degrees, grid_size';

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
  fogEnabled: r.fog_enabled === true,
  parentPinId: r.parent_pin_id,
  parentRegionId: r.parent_region_id,
  tools: {
    scaleWidth: r.scale_width == null ? null : Number(r.scale_width),
    scaleUnit: r.scale_unit === 'ft' ? 'ft' : 'mi',
    northDegrees: r.north_degrees ?? 0,
    gridSize: r.grid_size == null ? null : Number(r.grid_size),
  },
});

/**
 * Top-level maps of a campaign (detail maps hang beneath pins and regions). With includeHidden false the request itself asks
 * only for visible maps, so "preview as player" never fetches hidden data. Players are filtered by the
 * database either way.
 */
export async function listMaps(campaignId: string, options: { includeHidden: boolean }): Promise<MapSummary[]> {
  let query = supabase
    .from('maps')
    .select(SUMMARY_COLUMNS)
    .eq('campaign_id', campaignId)
    .is('parent_pin_id', null)
    .is('parent_region_id', null);
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
  /** Set to put this map beneath a pin (a detail map). The pin must be on a map in the same campaign. */
  parentPinId?: string | null;
  /** Or beneath a region. Never both. */
  parentRegionId?: string | null;
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
      ...(map.parentRegionId ? { parent_region_id: map.parentRegionId } : {}),
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

/** DMs only (P4-3): turns fog of war on or off for a map, and whether it is shared or kept per party group. */
export async function setMapFog(
  mapId: string,
  fog: { enabled: boolean; mode: CampaignMap['fogMode'] },
): Promise<CampaignMap> {
  const { data, error } = await supabase
    .from('maps')
    .update({ fog_enabled: fog.enabled, fog_mode: fog.mode })
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

/** A map that hangs beneath a pin or a region (a detail map). */
export interface SubMap extends MapSummary {
  parentPinId: string | null;
  parentRegionId: string | null;
}

export interface SubMaps {
  byPin: Map<string, SubMap>;
  byRegion: Map<string, SubMap>;
}

const SUB_MAP_COLUMNS = 'id, name, image_path, visible_to_players, created_at, parent_pin_id, parent_region_id';

/**
 * The maps beneath the given pins and regions, keyed by parent. With includeHidden false the requests ask only
 * for visible maps (players are also filtered by row level security, which hides a map while anything above it
 * is hidden).
 */
export async function listSubMaps(
  parents: { pinIds: string[]; regionIds: string[] },
  options: { includeHidden: boolean },
): Promise<SubMaps> {
  const result: SubMaps = { byPin: new Map(), byRegion: new Map() };
  const lists = [
    { column: 'parent_pin_id', ids: parents.pinIds, into: result.byPin },
    { column: 'parent_region_id', ids: parents.regionIds, into: result.byRegion },
  ] as const;
  for (const { column, ids, into } of lists) {
    if (ids.length === 0) continue;
    let query = supabase.from('maps').select(SUB_MAP_COLUMNS).in(column, ids);
    if (!options.includeHidden) query = query.eq('visible_to_players', true);
    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) throw toDataError(error);
    for (const row of (data ?? []) as MapRow[]) {
      const parent = row[column];
      // one map per parent: if a DM somehow made two, the first one wins
      if (parent && !into.has(parent)) {
        into.set(parent, { ...toSummary(row), parentPinId: row.parent_pin_id, parentRegionId: row.parent_region_id });
      }
    }
  }
  return result;
}

/** One step up the breadcrumb: a map above the current one. */
export interface MapTrailStep {
  mapId: string;
  name: string;
}

/**
 * The maps above this one, top first (world, region, town…), from map_ancestors in the database. Without
 * includeHidden the database answers as it would for a player, so a DM previewing never receives a hidden name.
 */
export async function getMapTrail(
  map: Pick<CampaignMap, 'id' | 'parentPinId' | 'parentRegionId'>,
  options: { includeHidden: boolean },
): Promise<MapTrailStep[]> {
  if (!map.parentPinId && !map.parentRegionId) return [];
  const { data, error } = await supabase.rpc('map_ancestors', { p_map: map.id, as_player: !options.includeHidden });
  if (error) throw toDataError(error);
  return [...(data ?? [])].sort((a, b) => b.depth - a.depth).map(row => ({ mapId: row.map_id, name: row.name }));
}

/** A map of the campaign as the "Link detail map" picker lists it (DMs only). */
export interface LinkableMap extends MapSummary {
  parentPinId: string | null;
  parentRegionId: string | null;
}

/** Every map of a campaign, top-level or not, by name. DMs only. */
export async function listAllMaps(campaignId: string): Promise<LinkableMap[]> {
  const { data, error } = await supabase
    .from('maps')
    .select(SUB_MAP_COLUMNS)
    .eq('campaign_id', campaignId)
    .order('name', { ascending: true });
  if (error) throw toDataError(error);
  return ((data ?? []) as MapRow[]).map(r => ({
    ...toSummary(r),
    parentPinId: r.parent_pin_id,
    parentRegionId: r.parent_region_id,
  }));
}

export type MapParent = { kind: 'pin' | 'region'; id: string };

/**
 * DMs only: hang a map beneath a pin or region, or (parent null) make it a top-level map again. The database
 * refuses a link that would put a map beneath itself, and keeps a map hidden when players could not see it before.
 */
export async function linkMap(mapId: string, parent: MapParent | null): Promise<CampaignMap> {
  const { data, error } = await supabase
    .from('maps')
    .update({
      parent_pin_id: parent?.kind === 'pin' ? parent.id : null,
      parent_region_id: parent?.kind === 'region' ? parent.id : null,
    })
    .eq('id', mapId)
    .select(MAP_COLUMNS)
    .maybeSingle();
  if (error) {
    const e = error as { code?: string; message?: string };
    if (e.code === '22023' && e.message) throw new DataError('validation', `${e.message}.`);
    throw toDataError(error);
  }
  if (!data) throw new DataError('forbidden');
  return toMap(data as MapRow);
}
