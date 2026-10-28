// Party groups (P3-3): location groups the DM moves around the maps. Not the official Party of P2-6. DM only here:
// a player reads their own group only through the Here tab.
import { supabase } from '../lib/supabase';
import { DataError, toDataError } from './errors';
import { functionError } from './rolls';

export interface PartyGroup {
  id: string;
  name: string;
  color: string;
  mapId: string | null;
  regionId: string | null;
  characterIds: string[];
}

export interface GroupDiscovery {
  groupId: string;
  contentId: string;
  name: string;
  state: 'noticed' | 'found';
}

interface GroupRow {
  id: string;
  name: string;
  color: string;
  map_id: string | null;
  region_id: string | null;
  party_group_members: { character_id: string }[] | null;
}

const passOnRefusal = (error: unknown): never => {
  const e = error as { code?: string; message?: string };
  if (e.code === '22023' && e.message) throw new DataError('validation', `${e.message}.`);
  throw toDataError(error);
};

/** The campaign's groups with their members, oldest first. */
export async function listGroups(campaignId: string): Promise<PartyGroup[]> {
  const { data, error } = await supabase
    .from('party_groups')
    .select('id, name, color, map_id, region_id, party_group_members(character_id)')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });
  if (error) throw toDataError(error);
  return ((data ?? []) as GroupRow[]).map(r => ({
    id: r.id,
    name: r.name,
    color: r.color,
    mapId: r.map_id,
    regionId: r.region_id,
    characterIds: (r.party_group_members ?? []).map(m => m.character_id),
  }));
}

/** DM only. */
export async function createGroup(campaignId: string, name: string, color: string): Promise<string> {
  const clean = name.trim();
  if (clean.length < 1 || clean.length > 60)
    throw new DataError('validation', 'Give the group a name of 1 to 60 characters.');
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw new DataError('validation', 'Choose a colour like #8E2A22.');
  const { data, error } = await supabase.rpc('create_group', { p_campaign: campaignId, p_name: clean, p_color: color });
  if (error) passOnRefusal(error);
  return data as string;
}

/** DM only. Removing a group leaves its characters in no group. */
export async function deleteGroup(groupId: string): Promise<void> {
  const { data, error } = await supabase.from('party_groups').delete().eq('id', groupId).select('id');
  if (error) throw toDataError(error);
  if (!data || data.length === 0) throw new DataError('forbidden');
}

/** DM only: put a character in a group (it leaves any other), or in none. */
export async function assignCharacter(characterId: string, groupId: string | null): Promise<void> {
  const { error } = await supabase.rpc('assign_character', { p_character: characterId, p_group: groupId as string });
  if (error) passOnRefusal(error);
}

/**
 * DM only: move a group to a map and region. Goes through the roll Edge Function, which works out the members'
 * passive scores; entering a region reveals what they notice. Returns the names newly revealed.
 */
export async function moveGroup(
  campaignId: string,
  groupId: string,
  mapId: string | null,
  regionId: string | null,
): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke('roll', {
    body: { action: 'move-group', campaignId, groupId, mapId, regionId },
  });
  if (error) throw await functionError(error);
  return ((data as { revealed?: string[] } | null)?.revealed ?? []).map(String);
}

/** DM only: what each group has noticed or found. */
export async function listDiscoveries(groupIds: string[]): Promise<GroupDiscovery[]> {
  if (groupIds.length === 0) return [];
  const { data, error } = await supabase
    .from('content_discoveries')
    .select('group_id, content_id, state, region_content(name)')
    .in('group_id', groupIds)
    .order('created_at', { ascending: true });
  if (error) throw toDataError(error);
  return (data ?? []).map(r => ({
    groupId: r.group_id,
    contentId: r.content_id,
    name: (r.region_content as unknown as { name: string } | null)?.name ?? 'Entry',
    state: r.state === 'found' ? 'found' : 'noticed',
  }));
}
