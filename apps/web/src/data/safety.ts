// P4-5: the pause button and the anonymous X-card. Any member may ask for a pause (at most once every five minutes); the
// DM resumes. A pause blocks nothing: it is a signal and a banner. Who played an anonymous X-card is never stored.
import { supabase } from '../lib/supabase';
import { DataError, toDataError } from './errors';

export interface TablePause {
  paused: boolean;
  since: string | null;
  anonymous: boolean;
  /** Who asked: told only to a DM, and only when it was not an X-card. */
  name: string | null;
}

export const NOT_PAUSED: TablePause = { paused: false, since: null, anonymous: false, name: null };

export async function getTablePause(campaignId: string): Promise<TablePause> {
  const { data, error } = await supabase.rpc('get_table_pause', { p_campaign: campaignId });
  if (error) throw toDataError(error);
  const d = (data ?? {}) as Partial<Record<keyof TablePause, unknown>>;
  return {
    paused: d.paused === true,
    since: typeof d.since === 'string' ? d.since : null,
    anonymous: d.anonymous === true,
    name: typeof d.name === 'string' ? d.name : null,
  };
}

export async function requestPause(campaignId: string, anonymous: boolean): Promise<void> {
  const { error } = await supabase.rpc('request_pause', { p_campaign: campaignId, p_anonymous: anonymous });
  if (error) {
    if (error.code === 'PT429') {
      throw new DataError('rate-limited', 'You asked for a pause a moment ago. The DM has been told.');
    }
    throw toDataError(error);
  }
}

/** DM only. */
export async function resumeTable(campaignId: string): Promise<void> {
  const { error } = await supabase.rpc('resume_table', { p_campaign: campaignId });
  if (error) throw toDataError(error);
}
