// P4-4: who may ping. Pings themselves are live events (lib/pings.ts); what is stored is the DM's mutes. A mute lasts the
// session: 12 hours, or until the DM lifts it. The server refuses a muted player's pings (send_realtime_event).
import { supabase } from '../lib/supabase';
import { toDataError } from './errors';

export const PING_MUTE_HOURS = 12;

export interface PingMute {
  userId: string;
  mutedUntil: string;
}

/** The mutes still in force. A DM reads every one; a player only their own. */
export async function listPingMutes(campaignId: string, now: () => number = Date.now): Promise<PingMute[]> {
  const { data, error } = await supabase
    .from('ping_mutes')
    .select('user_id, muted_until')
    .eq('campaign_id', campaignId);
  if (error) throw toDataError(error);
  return ((data ?? []) as { user_id: string; muted_until: string }[])
    .filter(r => Date.parse(r.muted_until) > now())
    .map(r => ({ userId: r.user_id, mutedUntil: r.muted_until }));
}

/** DM only: mutes one player's pings for the session (or starts the 12 hours again). */
export async function mutePings(campaignId: string, userId: string, now: () => number = Date.now): Promise<void> {
  const mutedUntil = new Date(now() + PING_MUTE_HOURS * 3600 * 1000).toISOString();
  const { error } = await supabase
    .from('ping_mutes')
    .upsert(
      { campaign_id: campaignId, user_id: userId, muted_until: mutedUntil },
      { onConflict: 'campaign_id,user_id' },
    );
  if (error) throw toDataError(error);
}

/** DM only: lets a player ping again. */
export async function unmutePings(campaignId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('ping_mutes').delete().eq('campaign_id', campaignId).eq('user_id', userId);
  if (error) throw toDataError(error);
}
