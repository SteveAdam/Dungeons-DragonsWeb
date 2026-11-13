// P4-2: group tokens on the map, the spotlight, and who is beneath each entrance. A token's place is saved on the
// group (x and y, image pixels); moving a group to another map or region goes through the roll Edge Function so what
// the group notices is revealed (see partyGroups.moveGroup).
import type { ImagePoint } from '../lib/mapCoordinates';
import { supabase } from '../lib/supabase';
import { DataError, toDataError } from './errors';
import { moveGroup } from './partyGroups';

export interface Spotlight {
  groupId: string;
  groupName: string;
  /** The region or map the group is in, as the DM chose to show it. */
  place: string;
  /** The DM's one line, or an empty string. */
  summary: string;
  /** Whether the viewer is in the spotlighted group. */
  mine: boolean;
}

/** Who has the spotlight, or null when nobody does. Any member may ask. */
export async function getSpotlight(campaignId: string): Promise<Spotlight | null> {
  const { data, error } = await supabase.rpc('get_spotlight', { p_campaign: campaignId });
  if (error) throw toDataError(error);
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    groupId: row.group_id,
    groupName: row.group_name,
    place: row.place,
    summary: row.summary,
    mine: row.mine,
  };
}

/** DM only. A null group takes the spotlight away. */
export async function setSpotlight(campaignId: string, groupId: string | null, summary: string): Promise<void> {
  const clean = summary.trim();
  if (clean.length > 200) throw new DataError('validation', 'The summary can be up to 200 characters.');
  const { error } = await supabase.rpc('set_spotlight', {
    p_campaign: campaignId,
    p_group: groupId as string,
    p_summary: clean,
  });
  if (error) throw toDataError(error);
}

/** The key under which an entrance's count is kept. */
export const entranceKey = (kind: 'pin' | 'region', id: string) => `${kind}:${id}`;

/**
 * For each pin or region of a map that has a map beneath it: how many characters stand beneath it, counting every map
 * further down. Only groups the viewer may see are counted.
 */
export async function listEntranceCounts(mapId: string): Promise<ReadonlyMap<string, number>> {
  const { data, error } = await supabase.rpc('group_entrance_counts', { p_map: mapId });
  if (error) throw toDataError(error);
  return new Map(
    (data ?? []).flatMap(r =>
      r.kind === 'pin' || r.kind === 'region' ? [[entranceKey(r.kind, r.entrance_id), r.members]] : [],
    ),
  );
}

export interface MemberVitals {
  characterId: string;
  name: string;
  className: string;
  /** Null when the sheet has no hit points yet. */
  hp: { current: number; max: number } | null;
}

const asNumber = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? n : null);

/** DM only: every character's name, class and hit points, for the tracker's bars. */
export async function listMemberVitals(campaignId: string): Promise<MemberVitals[]> {
  const { data, error } = await supabase
    .from('characters')
    .select('id, name, sheet')
    .eq('campaign_id', campaignId)
    .order('name');
  if (error) throw toDataError(error);
  return (data ?? []).map(r => {
    const sheet = (r.sheet ?? {}) as { className?: unknown; hp?: { current?: unknown; max?: unknown } };
    const current = asNumber(sheet.hp?.current);
    const max = asNumber(sheet.hp?.max);
    return {
      characterId: r.id,
      name: r.name,
      className: typeof sheet.className === 'string' ? sheet.className : '',
      hp: current !== null && max !== null ? { current, max } : null,
    };
  });
}

/** DM only: saves where a token stands. A group that goes to another map has its old spot cleared by the database. */
export async function setGroupPosition(groupId: string, point: ImagePoint): Promise<void> {
  const { data, error } = await supabase
    .from('party_groups')
    .update({ x: Math.max(0, point.x), y: Math.max(0, point.y) })
    .eq('id', groupId)
    .select('id');
  if (error) throw toDataError(error);
  if (!data || data.length === 0) throw new DataError('forbidden');
}

export interface PlaceGroupRequest {
  campaignId: string;
  groupId: string;
  point: ImagePoint;
  /** Set when the group goes to another map or region: it is moved first, so what it notices is revealed. */
  move: { mapId: string | null; regionId: string | null } | null;
}

/**
 * DM only: puts a token at a spot. Going into a different map or region moves the group first (the roll function
 * reveals what it notices there), then saves the spot. Returns the names the move revealed.
 */
export async function placeGroup({ campaignId, groupId, point, move }: PlaceGroupRequest): Promise<string[]> {
  const revealed = move ? await moveGroup(campaignId, groupId, move.mapId, move.regionId) : [];
  await setGroupPosition(groupId, point);
  return revealed;
}
