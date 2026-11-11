// The Here tab (P3-3): what a character's group knows about the region it is in, from get_here (masked in the
// database: discovered entries, hints, never hidden entries or DM data), the search through the roll Edge Function,
// and the notices a group gets when it discovers something.
import type { ContentKind } from '@dnd-manager/rules-engine';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import { toDataError } from './errors';
import { functionError, toRoll, type RollRow } from './rolls';

export type HereAction = 'talk' | 'act' | 'examine' | 'buy';

export interface HereEntry {
  id: string;
  kind: ContentKind;
  name: string;
  description: string;
  stock: { itemRef: string; priceCp: number }[];
  actions: HereAction[];
}

export interface HereHint {
  id: string;
  kind: ContentKind;
  hint: string;
}

export interface Here {
  group: { id: string; name: string; color: string; mapId: string | null } | null;
  region: { id: string; name: string } | null;
  entries: HereEntry[];
  hints: HereHint[];
}

/** For the character's owner or the DM. */
export async function getHere(characterId: string): Promise<Here> {
  const { data, error } = await supabase.rpc('get_here', { p_character: characterId });
  if (error) throw toDataError(error);
  const here = (data ?? {}) as Partial<Here>;
  return {
    group: here.group ?? null,
    region: here.region ?? null,
    entries: here.entries ?? [],
    hints: here.hints ?? [],
  };
}

export interface SearchResult {
  roll: RollRow;
  found: { name: string; kind: ContentKind }[];
}

type RollDbRow = Database['public']['Tables']['rolls']['Row'];

/**
 * Searches the region the character's group is in. The server rolls Perception (its own bonus) and compares the
 * die with each undiscovered entry's DC; only what was found comes back. One search per region per cooldown.
 */
export async function searchHere(campaignId: string, characterId: string): Promise<SearchResult> {
  const { data, error } = await supabase.functions.invoke('roll', {
    body: { action: 'search', campaignId, characterId },
  });
  if (error) throw await functionError(error);
  const result = data as { roll: RollDbRow; found: SearchResult['found'] };
  return { roll: toRoll(result.roll), found: result.found ?? [] };
}

/** Calls back with each notice ("You notice a mossy shrine") for this group. Returns the function that stops. */
export function subscribeToNotices(groupId: string, onNotice: (text: string) => void): () => void {
  const channel = supabase
    .channel(`discoveries:${groupId}`, { config: { private: true } })
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'discovery_notices', filter: `group_id=eq.${groupId}` },
      payload => onNotice(String((payload.new as { text?: unknown }).text ?? '')),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
