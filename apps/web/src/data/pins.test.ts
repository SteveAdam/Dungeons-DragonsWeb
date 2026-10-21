import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../lib/supabase';
import { fakeQuery } from '../test/fakeQuery';
import { getPinNotes, savePinNotes } from './pinSecrets';
import { createPin, deletePin, listPins, updatePin, validatePinChanges } from './pins';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getSession: vi.fn() } } }));

const row = {
  id: 'p1',
  map_id: 'm1',
  type: 'faction',
  title: 'The Iron Ring',
  x: 120,
  y: 80,
  color: '#8E2A22',
  size: 32,
  visible_to_players: false,
  description: 'Smugglers',
  history: '',
  traits: ['secretive'],
  tags: null,
  music_url: null,
};
const from = (result: { data: unknown; error: unknown }) => {
  const q = fakeQuery(result);
  vi.mocked(supabase.from).mockReturnValueOnce(q as never);
  return q;
};
beforeEach(() => vi.clearAllMocks());

describe('listPins', () => {
  it('maps rows to pins (missing lists become empty)', async () => {
    from({ data: [row], error: null });
    expect(await listPins('m1', { includeHidden: true })).toEqual([
      {
        id: 'p1',
        mapId: 'm1',
        type: 'faction',
        title: 'The Iron Ring',
        x: 120,
        y: 80,
        color: '#8E2A22',
        size: 32,
        visibleToPlayers: false,
        description: 'Smugglers',
        history: '',
        traits: ['secretive'],
        tags: [],
        musicUrl: null,
      },
    ]);
  });

  it('asks for hidden pins only when told to, so a player request never carries them', async () => {
    const dm = from({ data: [], error: null });
    await listPins('m1', { includeHidden: true });
    expect(dm.eq).not.toHaveBeenCalledWith('visible_to_players', true);

    const player = from({ data: [], error: null });
    await listPins('m1', { includeHidden: false });
    expect(player.eq).toHaveBeenCalledWith('map_id', 'm1');
    expect(player.eq).toHaveBeenCalledWith('visible_to_players', true);
  });

  it('never asks for DM notes', async () => {
    const q = from({ data: [], error: null });
    await listPins('m1', { includeHidden: true });
    expect(q.select.mock.calls[0][0]).not.toMatch(/dm_notes|pin_secrets/);
  });
});

describe('createPin', () => {
  it('starts hidden, rounded to whole pixels, titled "New pin"', async () => {
    const q = from({ data: row, error: null });
    await createPin('m1', { x: 120.4, y: 79.6 });
    expect(q.insert).toHaveBeenCalledWith({
      map_id: 'm1',
      type: 'location',
      title: 'New pin',
      x: 120,
      y: 80,
      visible_to_players: false,
    });
  });
});

describe('validatePinChanges', () => {
  it('accepts good values and tidies them', () => {
    expect(
      validatePinChanges({
        title: '  Port Vellum ',
        color: '#c0392b',
        size: 40,
        musicUrl: '  https://music.example/harbour.mp3 ',
        traits: [' salty ', '', 'busy'],
      }),
    ).toEqual({
      title: 'Port Vellum',
      color: '#c0392b',
      size: 40,
      musicUrl: 'https://music.example/harbour.mp3',
      traits: ['salty', 'busy'],
    });
    expect(validatePinChanges({ musicUrl: '   ' })).toEqual({ musicUrl: null });
  });

  it.each([
    [{ title: '  ' }, /title of 1 to 120/],
    [{ color: 'red' }, /# and six hex digits/],
    [{ color: '#12345' }, /# and six hex digits/],
    [{ size: 15 }, /from 16 to 80/],
    [{ size: 81 }, /from 16 to 80/],
    [{ size: 20.5 }, /whole number/],
    [{ musicUrl: 'http://music.example/a.mp3' }, /https/],
    [{ musicUrl: 'javascript:alert(1)' }, /https/],
  ])('refuses %j', (changes, message) => {
    expect(() => validatePinChanges(changes as never)).toThrowError(message);
  });
});

describe('updatePin and deletePin', () => {
  it('sends only the changed columns, in database names', async () => {
    const q = from({ data: { ...row, visible_to_players: true }, error: null });
    const pin = await updatePin('p1', { visibleToPlayers: true, musicUrl: 'https://a.example/b' });
    expect(q.update).toHaveBeenCalledWith({ visible_to_players: true, music_url: 'https://a.example/b' });
    expect(pin.visibleToPlayers).toBe(true);
  });
  it('validates before sending', async () => {
    await expect(updatePin('p1', { color: 'blue' })).rejects.toMatchObject({ kind: 'validation' });
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it('treats "nothing changed" or "nothing deleted" as not allowed', async () => {
    from({ data: null, error: null });
    await expect(updatePin('p1', { title: 'x' })).rejects.toMatchObject({ kind: 'forbidden' });
    from({ data: [], error: null });
    await expect(deletePin('p1')).rejects.toMatchObject({ kind: 'forbidden' });
  });
  it('deletes by id', async () => {
    const q = from({ data: [{ id: 'p1' }], error: null });
    await deletePin('p1');
    expect(q.delete).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith('id', 'p1');
  });
});

describe('DM notes (pin_secrets)', () => {
  it('reads the notes, or "" when there are none yet', async () => {
    from({ data: { dm_notes: 'The captain is a spy' }, error: null });
    expect(await getPinNotes('p1')).toBe('The captain is a spy');
    from({ data: null, error: null });
    expect(await getPinNotes('p1')).toBe('');
    expect(supabase.from).toHaveBeenCalledWith('pin_secrets');
  });
  it('upserts by pin', async () => {
    const q = from({ data: { dm_notes: 'new' }, error: null });
    expect(await savePinNotes('p1', 'new')).toBe('new');
    expect(q.upsert).toHaveBeenCalledWith({ pin_id: 'p1', dm_notes: 'new' }, { onConflict: 'pin_id' });
  });
});
