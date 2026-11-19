import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../lib/supabase';
import { fakeQuery } from '../test/fakeQuery';
import {
  deletePrivateNote,
  listPrivateNotes,
  listThread,
  listThreads,
  markThreadRead,
  MESSAGE_MAX,
  sendMessage,
  THREAD_PAGE,
} from './messages';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const from = (result: { data: unknown; error: unknown }) => {
  const q = fakeQuery(result);
  vi.mocked(supabase.from).mockReturnValueOnce(q as never);
  return q;
};
const rpc = (result: { data: unknown; error: unknown }) =>
  vi.mocked(supabase.rpc).mockResolvedValueOnce(result as never);

beforeEach(() => vi.clearAllMocks());

describe('listThread', () => {
  const rows = [
    { id: 'm3', player_id: 'p1', sender_id: 'dm', body: 'Psst', kind: 'whisper', created_at: '3', read_at: null },
    { id: 'm2', player_id: 'p1', sender_id: 'p1', body: 'Hi', kind: 'message', created_at: '2', read_at: '2' },
    { id: 'm1', player_id: 'p1', sender_id: 'dm', body: 'Hello', kind: 'odd', created_at: '1', read_at: '1' },
  ];

  it('reads the newest page and returns it oldest first', async () => {
    const q = from({ data: rows, error: null });
    const thread = await listThread('c1', 'p1');
    expect(thread.map(m => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(q.eq).toHaveBeenCalledWith('campaign_id', 'c1');
    expect(q.eq).toHaveBeenCalledWith('player_id', 'p1');
    expect(q.limit).toHaveBeenCalledWith(THREAD_PAGE);
  });

  it('maps rows and treats an unknown kind as a plain message', async () => {
    from({ data: rows, error: null });
    const [first, , last] = await listThread('c1', 'p1');
    expect(first).toEqual({
      id: 'm1',
      playerId: 'p1',
      senderId: 'dm',
      body: 'Hello',
      kind: 'message',
      createdAt: '1',
      readAt: '1',
    });
    expect(last.kind).toBe('whisper');
  });

  it('returns an empty thread when there is no data', async () => {
    from({ data: null, error: null });
    expect(await listThread('c1', 'p1')).toEqual([]);
  });

  it('reports a failed read as a DataError', async () => {
    from({ data: null, error: { code: '42501' } });
    await expect(listThread('c1', 'p1')).rejects.toMatchObject({ name: 'DataError', kind: 'forbidden' });
  });
});

describe('listThreads', () => {
  it('maps the summaries, counts unread as a number and sorts newest first', async () => {
    rpc({
      data: [
        {
          player_id: 'p1',
          last_body: 'a',
          last_kind: 'message',
          last_sender: 'p1',
          last_at: '2026-11-01',
          unread: '2',
        },
        {
          player_id: 'p2',
          last_body: 'b',
          last_kind: 'whisper',
          last_sender: 'dm',
          last_at: '2026-11-03',
          unread: null,
        },
      ],
      error: null,
    });
    const threads = await listThreads('c1');
    expect(supabase.rpc).toHaveBeenCalledWith('message_threads', { p_campaign: 'c1' });
    expect(threads.map(t => t.playerId)).toEqual(['p2', 'p1']);
    expect(threads[0]).toMatchObject({ lastKind: 'whisper', unread: 0 });
    expect(threads[1]).toMatchObject({ lastKind: 'message', unread: 2 });
  });

  it('reports a failure', async () => {
    rpc({ data: null, error: { status: 401 } });
    await expect(listThreads('c1')).rejects.toMatchObject({ kind: 'signed-out' });
  });
});

describe('sendMessage', () => {
  const base = { campaignId: 'c1', playerId: 'p1' };

  it('refuses an empty message before calling the server', async () => {
    await expect(sendMessage({ ...base, body: '  \n ' })).rejects.toMatchObject({
      kind: 'validation',
      message: 'Write something first.',
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('refuses a message over the limit before calling the server', async () => {
    await expect(sendMessage({ ...base, body: 'a'.repeat(MESSAGE_MAX + 1) })).rejects.toMatchObject({
      kind: 'validation',
      message: 'A message can be at most 2,000 characters.',
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('accepts a message of exactly the limit', async () => {
    rpc({ data: 'm1', error: null });
    await expect(sendMessage({ ...base, body: 'a'.repeat(MESSAGE_MAX) })).resolves.toBe('m1');
  });

  it('sends a plain message by default and returns its id', async () => {
    rpc({ data: 'm9', error: null });
    expect(await sendMessage({ ...base, body: 'Hello' })).toBe('m9');
    expect(supabase.rpc).toHaveBeenCalledWith('send_message', {
      p_campaign: 'c1',
      p_player: 'p1',
      p_body: 'Hello',
      p_kind: 'message',
      p_save_note: false,
    });
  });

  it('passes a whisper saved to the player notes', async () => {
    rpc({ data: 'm10', error: null });
    await sendMessage({ ...base, body: 'Secret', kind: 'whisper', saveNote: true });
    expect(supabase.rpc).toHaveBeenCalledWith(
      'send_message',
      expect.objectContaining({ p_kind: 'whisper', p_save_note: true }),
    );
  });

  it('explains the rate limit', async () => {
    rpc({ data: null, error: { code: 'PT429', message: 'slow down' } });
    await expect(sendMessage({ ...base, body: 'Hi' })).rejects.toMatchObject({
      kind: 'rate-limited',
      message: 'That is 20 messages in a minute. Wait a moment before sending more.',
    });
  });

  it('shows the server’s own validation message', async () => {
    rpc({ data: null, error: { code: '22023', message: 'Only the DM can whisper.' } });
    await expect(sendMessage({ ...base, body: 'Hi', kind: 'whisper' })).rejects.toMatchObject({
      kind: 'validation',
      message: 'Only the DM can whisper.',
    });
  });

  it('turns any other failure into a DataError', async () => {
    rpc({ data: null, error: { code: '42501' } });
    await expect(sendMessage({ ...base, body: 'Hi' })).rejects.toMatchObject({ kind: 'forbidden' });
  });
});

describe('markThreadRead', () => {
  it('returns how many messages were marked', async () => {
    rpc({ data: 3, error: null });
    expect(await markThreadRead('c1', 'p1')).toBe(3);
    expect(supabase.rpc).toHaveBeenCalledWith('mark_thread_read', { p_campaign: 'c1', p_player: 'p1' });
  });

  it('treats no count as zero', async () => {
    rpc({ data: null, error: null });
    expect(await markThreadRead('c1', 'p1')).toBe(0);
  });

  it('reports a failure', async () => {
    rpc({ data: null, error: { code: '42501' } });
    await expect(markThreadRead('c1', 'p1')).rejects.toMatchObject({ kind: 'forbidden' });
  });
});

describe('private notes', () => {
  it('lists the notes for the campaign', async () => {
    const q = from({ data: [{ id: 'n1', body: 'Psst', created_at: '2026-11-01' }], error: null });
    expect(await listPrivateNotes('c1')).toEqual([{ id: 'n1', body: 'Psst', createdAt: '2026-11-01' }]);
    expect(supabase.from).toHaveBeenCalledWith('player_notes');
    expect(q.eq).toHaveBeenCalledWith('campaign_id', 'c1');
    expect(q.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('deletes one note by id', async () => {
    const q = from({ data: null, error: null });
    await deletePrivateNote('n1');
    expect(q.delete).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith('id', 'n1');
  });

  it('reports a failed delete', async () => {
    from({ data: null, error: { code: '42501' } });
    await expect(deletePrivateNote('n1')).rejects.toMatchObject({ kind: 'forbidden' });
  });
});
