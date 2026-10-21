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
}

const SUMMARY_COLUMNS = 'id, name, image_path, visible_to_players, created_at';
const MAP_COLUMNS =
  'id, campaign_id, name, image_path, width, height, visible_to_players, fog_mode, parent_pin_id, created_at';

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
