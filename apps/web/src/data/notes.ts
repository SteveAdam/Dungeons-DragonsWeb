// P3-7: notes and session logs (the pages table), dated by absolute day. DMs write; members read what is visible.
import { supabase } from '../lib/supabase';
import { DataError, toDataError } from './errors';

export type NoteKind = 'note' | 'session';

export interface Note {
  id: string;
  campaignId: string;
  kind: NoteKind;
  title: string;
  body: string;
  visibleToPlayers: boolean;
  sessionNo: number | null;
  /** The absolute day it happened on. */
  ingameDay: number | null;
  /** The old free-text date: read-only, kept until it is converted. */
  legacyDate: string | null;
}

export type NoteDraft = Pick<Note, 'kind' | 'title' | 'body' | 'visibleToPlayers' | 'sessionNo' | 'ingameDay'>;

const COLUMNS = 'id, campaign_id, kind, title, body, visible_to_players, session_no, ingame_day, ingame_date';

interface Row {
  id: string;
  campaign_id: string;
  kind: string;
  title: string;
  body: string;
  visible_to_players: boolean;
  session_no: number | null;
  ingame_day: number | null;
  ingame_date: string | null;
}

const toNote = (r: Row): Note => ({
  id: r.id,
  campaignId: r.campaign_id,
  kind: r.kind === 'session' ? 'session' : 'note',
  title: r.title,
  body: r.body,
  visibleToPlayers: r.visible_to_players,
  sessionNo: r.session_no,
  ingameDay: r.ingame_day,
  legacyDate: r.ingame_date,
});

/** Notes and session logs, newest first. With includeHidden false the request asks only for visible ones. */
export async function listNotes(campaignId: string, options: { includeHidden: boolean }): Promise<Note[]> {
  let query = supabase.from('pages').select(COLUMNS).eq('campaign_id', campaignId).in('kind', ['note', 'session']);
  if (!options.includeHidden) query = query.eq('visible_to_players', true);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw toDataError(error);
  return ((data ?? []) as Row[]).map(toNote);
}

/** DM only: adds a note, or changes the one with this id. */
export async function saveNote(campaignId: string, draft: NoteDraft, id?: string): Promise<void> {
  const title = draft.title.trim();
  if (title.length < 1 || title.length > 200)
    throw new DataError('validation', 'Give it a title of 1 to 200 characters.');
  const row = {
    campaign_id: campaignId,
    kind: draft.kind,
    title,
    body: draft.body,
    visible_to_players: draft.visibleToPlayers,
    session_no: draft.sessionNo,
    ingame_day: draft.ingameDay,
  };
  const { error } = await (id ? supabase.from('pages').update(row).eq('id', id) : supabase.from('pages').insert(row));
  if (error) throw toDataError(error);
}

/** DM only. */
export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('pages').delete().eq('id', id);
  if (error) throw toDataError(error);
}
