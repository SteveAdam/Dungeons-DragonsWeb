import { supabase } from '../lib/supabase';
import { toDataError } from './errors';

export interface MapSummary {
  id: string;
  name: string;
  visibleToPlayers: boolean;
  createdAt: string;
}

interface MapRow {
  id: string;
  name: string;
  visible_to_players: boolean;
  created_at: string;
}

/**
 * Top-level maps of a campaign (sub-maps hang off pins). With includeHidden false the request itself asks
 * only for visible maps, so "preview as player" never fetches hidden data. Players are filtered by the
 * database either way.
 */
export async function listMaps(campaignId: string, options: { includeHidden: boolean }): Promise<MapSummary[]> {
  let query = supabase
    .from('maps')
    .select('id, name, visible_to_players, created_at')
    .eq('campaign_id', campaignId)
    .is('parent_pin_id', null);
  if (!options.includeHidden) query = query.eq('visible_to_players', true);

  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) throw toDataError(error);
  return ((data ?? []) as MapRow[]).map(r => ({
    id: r.id,
    name: r.name,
    visibleToPlayers: r.visible_to_players,
    createdAt: r.created_at,
  }));
}
