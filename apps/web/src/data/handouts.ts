// P4-4: handouts. The DM makes them (an image or a text) and shows them to everyone, a party group or chosen players.
// A player reads a handout only while it is shown to them, and its image the same way (the database decides; see
// migration 0030). Text is plain text: screens show it with its line breaks, never as HTML.
import type { HandoutImageStore } from '../lib/storage/handoutImages';
import { supabase } from '../lib/supabase';
import { DataError, toDataError } from './errors';

export type HandoutKind = 'image' | 'text';

export const HANDOUT_TITLE_MAX = 120;
export const HANDOUT_BODY_MAX = 8000;

export interface HandoutShare {
  userId: string;
  sharedAt: string;
  /** Null until the player opens it: the "new" marker. */
  seenAt: string | null;
}

export interface Handout {
  id: string;
  campaignId: string;
  title: string;
  kind: HandoutKind;
  /** The text of a text handout, or an image's caption. */
  body: string | null;
  imagePath: string | null;
  createdAt: string;
  /** A DM reads every share; a player reads only their own. */
  shares: HandoutShare[];
}

export type HandoutAudience =
  { kind: 'everyone' } | { kind: 'group'; groupId: string } | { kind: 'players'; userIds: string[] };

interface HandoutRow {
  id: string;
  campaign_id: string;
  title: string;
  kind: string;
  body: string | null;
  image_path: string | null;
  created_at: string;
  handout_shares: { user_id: string; shared_at: string; seen_at: string | null }[] | null;
}

const COLUMNS =
  'id, campaign_id, title, kind, body, image_path, created_at, handout_shares(user_id, shared_at, seen_at)';

const toHandout = (r: HandoutRow): Handout => ({
  id: r.id,
  campaignId: r.campaign_id,
  title: r.title,
  kind: r.kind === 'image' ? 'image' : 'text',
  body: r.body,
  imagePath: r.image_path,
  createdAt: r.created_at,
  shares: (r.handout_shares ?? []).map(s => ({ userId: s.user_id, sharedAt: s.shared_at, seenAt: s.seen_at })),
});

/** A player's own share of a handout (the only one they can read), or undefined. */
export const shareFor = (handout: Handout, userId: string | undefined) => handout.shares.find(s => s.userId === userId);

/** For a player: the handout is new until they open it. */
export const isNewFor = (handout: Handout, userId: string | undefined) => {
  const share = shareFor(handout, userId);
  return !!share && share.seenAt === null;
};

/** The handouts the viewer may read, newest shown first (for a DM: every handout of the campaign). */
export async function listHandouts(campaignId: string): Promise<Handout[]> {
  const { data, error } = await supabase
    .from('handouts')
    .select(COLUMNS)
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });
  if (error) throw toDataError(error);
  const handouts = ((data ?? []) as unknown as HandoutRow[]).map(toHandout);
  const latest = (h: Handout) => h.shares.reduce((a, s) => (s.sharedAt > a ? s.sharedAt : a), h.createdAt);
  return handouts.sort((a, b) => latest(b).localeCompare(latest(a)));
}

export interface HandoutInput {
  title: string;
  kind: HandoutKind;
  body: string;
  /** A new image (image handouts). When editing, leave it out to keep the current one. */
  image?: File | null;
}

function cleanInput(input: HandoutInput, hasImage: boolean) {
  const title = input.title.trim();
  if (title.length < 1 || title.length > HANDOUT_TITLE_MAX) {
    throw new DataError('validation', `Give the handout a title of 1 to ${HANDOUT_TITLE_MAX} characters.`);
  }
  // keep the text exactly as typed (line breaks matter), only drop blank lines at the ends
  const body = input.body.replace(/^\s*\n|\n\s*$/g, '');
  if (body.length > HANDOUT_BODY_MAX) {
    throw new DataError(
      'validation',
      `A handout’s text can be at most ${HANDOUT_BODY_MAX.toLocaleString('en')} characters.`,
    );
  }
  if (input.kind === 'text' && !body.trim()) throw new DataError('validation', 'Write the handout’s text.');
  if (input.kind === 'image' && !hasImage) throw new DataError('validation', 'Choose an image for the handout.');
  return { title, body: body.trim() ? body : null };
}

/** DM only: makes a handout. An image is uploaded first and removed again if the handout cannot be saved. */
export async function createHandout(
  campaignId: string,
  input: HandoutInput,
  store: HandoutImageStore,
): Promise<Handout> {
  const { title, body } = cleanInput(input, !!input.image);
  const imagePath = input.kind === 'image' && input.image ? await store.upload(campaignId, input.image) : null;
  const { data, error } = await supabase
    .from('handouts')
    .insert({ campaign_id: campaignId, title, kind: input.kind, body, image_path: imagePath })
    .select(COLUMNS)
    .single();
  if (error) {
    if (imagePath) await store.remove(imagePath).catch(() => undefined);
    throw toDataError(error);
  }
  return toHandout(data as unknown as HandoutRow);
}

/** DM only: changes a handout's title and text, and its image if a new one is given (the old file is then removed). */
export async function updateHandout(
  handout: Handout,
  input: Omit<HandoutInput, 'kind'>,
  store: HandoutImageStore,
): Promise<Handout> {
  const { title, body } = cleanInput({ ...input, kind: handout.kind }, !!input.image || !!handout.imagePath);
  const newPath = handout.kind === 'image' && input.image ? await store.upload(handout.campaignId, input.image) : null;
  const { data, error } = await supabase
    .from('handouts')
    .update({ title, body, ...(newPath ? { image_path: newPath } : {}) })
    .eq('id', handout.id)
    .select(COLUMNS);
  if (error || !data || data.length === 0) {
    if (newPath) await store.remove(newPath).catch(() => undefined);
    throw error ? toDataError(error) : new DataError('forbidden');
  }
  if (newPath && handout.imagePath) await store.remove(handout.imagePath).catch(() => undefined);
  return toHandout(data[0] as unknown as HandoutRow);
}

/** DM only: deletes a handout (players lose it at once) and then its image. */
export async function deleteHandout(handout: Handout, store: HandoutImageStore): Promise<void> {
  const { data, error } = await supabase.from('handouts').delete().eq('id', handout.id).select('id');
  if (error) throw toDataError(error);
  if (!data || data.length === 0) throw new DataError('forbidden');
  // a leftover file is harmless (no handout points at it, so no player can read it); do not fail the delete for it
  if (handout.imagePath) await store.remove(handout.imagePath).catch(() => undefined);
}

/** DM only: shows a handout. Each player gets it as new, on their own channel. Returns who it was shown to. */
export async function showHandout(handoutId: string, audience: HandoutAudience): Promise<string[]> {
  const { data, error } = await supabase.rpc('show_handout', {
    p_handout: handoutId,
    p_audience: audience.kind,
    p_group: (audience.kind === 'group' ? audience.groupId : null) as string,
    p_users: (audience.kind === 'players' ? audience.userIds : null) as string[],
  });
  if (error) {
    if (error.code === '22023') throw new DataError('validation', error.message);
    throw toDataError(error);
  }
  return (data ?? []) as string[];
}

/** DM only: stops showing a handout to one player. */
export async function takeBackHandout(handoutId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('handout_shares').delete().eq('handout_id', handoutId).eq('user_id', userId);
  if (error) throw toDataError(error);
}

/** A player opened a handout shown to them: the "new" marker goes. */
export async function markHandoutSeen(handoutId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_handout_seen', { p_handout: handoutId });
  if (error) throw toDataError(error);
}
