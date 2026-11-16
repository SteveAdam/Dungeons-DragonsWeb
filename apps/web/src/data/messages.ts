// P4-5: private messages between the DM and one player, and whispers. Each player has one thread with the DM; nothing
// goes player to player (the database decides who reads what; see migration 0031). Messages are plain text: screens
// show them with their line breaks, never as HTML. They are never edited or deleted.
import { supabase } from '../lib/supabase';
import { DataError, toDataError } from './errors';

export type MessageKind = 'message' | 'whisper';
export const MESSAGE_MAX = 2000;
/** How many of a thread's latest messages are read. */
export const THREAD_PAGE = 200;

export interface Message {
  id: string;
  playerId: string;
  senderId: string;
  body: string;
  kind: MessageKind;
  createdAt: string;
  readAt: string | null;
}

export interface ThreadSummary {
  playerId: string;
  lastBody: string;
  lastKind: MessageKind;
  lastSender: string;
  lastAt: string;
  /** The other side's messages not yet read. */
  unread: number;
}

export interface PrivateNote {
  id: string;
  body: string;
  createdAt: string;
}

interface MessageRow {
  id: string;
  player_id: string;
  sender_id: string;
  body: string;
  kind: string;
  created_at: string;
  read_at: string | null;
}

const kindOf = (k: string): MessageKind => (k === 'whisper' ? 'whisper' : 'message');

const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  playerId: r.player_id,
  senderId: r.sender_id,
  body: r.body,
  kind: kindOf(r.kind),
  createdAt: r.created_at,
  readAt: r.read_at,
});

/** The latest messages of one player's thread, oldest first. */
export async function listThread(campaignId: string, playerId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, player_id, sender_id, body, kind, created_at, read_at')
    .eq('campaign_id', campaignId)
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(THREAD_PAGE);
  if (error) throw toDataError(error);
  return ((data ?? []) as MessageRow[]).map(toMessage).reverse();
}

/** Every thread the viewer can read (a DM: one per player who has one; a player: their own), newest first. */
export async function listThreads(campaignId: string): Promise<ThreadSummary[]> {
  const { data, error } = await supabase.rpc('message_threads', { p_campaign: campaignId });
  if (error) throw toDataError(error);
  return (
    (data ?? []) as {
      player_id: string;
      last_body: string;
      last_kind: string;
      last_sender: string;
      last_at: string;
      unread: number;
    }[]
  )
    .map(r => ({
      playerId: r.player_id,
      lastBody: r.last_body,
      lastKind: kindOf(r.last_kind),
      lastSender: r.last_sender,
      lastAt: r.last_at,
      unread: Number(r.unread) || 0,
    }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export interface SendInput {
  campaignId: string;
  playerId: string;
  body: string;
  kind?: MessageKind;
  /** DM only, whispers only: also keep it in the player's private notes. */
  saveNote?: boolean;
}

/** Sends a message (or, for a DM, a whisper) as the signed-in person. Returns its id. */
export async function sendMessage({ campaignId, playerId, body, kind = 'message', saveNote = false }: SendInput) {
  if (!body.trim()) throw new DataError('validation', 'Write something first.');
  if (body.length > MESSAGE_MAX) {
    throw new DataError('validation', `A message can be at most ${MESSAGE_MAX.toLocaleString('en')} characters.`);
  }
  const { data, error } = await supabase.rpc('send_message', {
    p_campaign: campaignId,
    p_player: playerId,
    p_body: body,
    p_kind: kind,
    p_save_note: saveNote,
  });
  if (error) {
    if (error.code === 'PT429') {
      throw new DataError('rate-limited', 'That is 20 messages in a minute. Wait a moment before sending more.');
    }
    if (error.code === '22023') throw new DataError('validation', error.message);
    throw toDataError(error);
  }
  return data as string;
}

/** Opening a thread: the other side's messages in it are marked read. */
export async function markThreadRead(campaignId: string, playerId: string): Promise<number> {
  const { data, error } = await supabase.rpc('mark_thread_read', { p_campaign: campaignId, p_player: playerId });
  if (error) throw toDataError(error);
  return Number(data) || 0;
}

/** The signed-in player's private notes in this campaign (whispers the DM saved for them), newest first. */
export async function listPrivateNotes(campaignId: string): Promise<PrivateNote[]> {
  const { data, error } = await supabase
    .from('player_notes')
    .select('id, body, created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });
  if (error) throw toDataError(error);
  return ((data ?? []) as { id: string; body: string; created_at: string }[]).map(r => ({
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function deletePrivateNote(id: string): Promise<void> {
  const { error } = await supabase.from('player_notes').delete().eq('id', id);
  if (error) throw toDataError(error);
}
