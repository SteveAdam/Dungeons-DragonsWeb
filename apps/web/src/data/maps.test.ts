import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../lib/supabase';
import { fakeQuery } from '../test/fakeQuery';
import { createMap, getMap, listMaps, setMapVisible } from './maps';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getSession: vi.fn() } } }));

const rows = [
  {
    id: 'm1',
    name: 'Sword Coast',
    image_path: 'c1/coast.png',
    visible_to_players: true,
    created_at: '2026-10-18T10:00:00Z',
  },
];
const fullRow = {
  ...rows[0],
  campaign_id: 'c1',
  width: 4000,
  height: 3000,
  fog_mode: 'shared',
  parent_pin_id: null,
};
const from = (result: { data: unknown; error: unknown }) => {
  const q = fakeQuery(result);
  vi.mocked(supabase.from).mockReturnValueOnce(q as never);
  return q;
};
beforeEach(() => vi.clearAllMocks());

describe('listMaps', () => {
  it('asks only for top-level maps and maps the rows', async () => {
    const q = from({ data: rows, error: null });
    expect(await listMaps('c1', { includeHidden: true })).toEqual([
      {
        id: 'm1',
        name: 'Sword Coast',
        imagePath: 'c1/coast.png',
        visibleToPlayers: true,
        createdAt: '2026-10-18T10:00:00Z',
      },
    ]);
    expect(q.is).toHaveBeenCalledWith('parent_pin_id', null);
  });
  it('asks for hidden maps only when told to', async () => {
    const withHidden = from({ data: rows, error: null });
    await listMaps('c1', { includeHidden: true });
    expect(withHidden.eq).not.toHaveBeenCalledWith('visible_to_players', true);

    const withoutHidden = from({ data: rows, error: null });
    await listMaps('c1', { includeHidden: false });
    expect(withoutHidden.eq).toHaveBeenCalledWith('visible_to_players', true);
  });
  it('reports a failure', async () => {
    from({ data: null, error: { message: 'Failed to fetch' } });
    await expect(listMaps('c1', { includeHidden: false })).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('getMap', () => {
  it('maps the row, with size and fog mode', async () => {
    const q = from({ data: fullRow, error: null });
    expect(await getMap('m1', { includeHidden: true })).toEqual({
      id: 'm1',
      campaignId: 'c1',
      name: 'Sword Coast',
      imagePath: 'c1/coast.png',
      width: 4000,
      height: 3000,
      visibleToPlayers: true,
      fogMode: 'shared',
      parentPinId: null,
      createdAt: '2026-10-18T10:00:00Z',
    });
    expect(q.eq).not.toHaveBeenCalledWith('visible_to_players', true);
  });
  it('without includeHidden asks only for a visible map, and reports a hidden one as not found', async () => {
    const q = from({ data: null, error: null });
    await expect(getMap('m2', { includeHidden: false })).rejects.toMatchObject({ kind: 'not-found' });
    expect(q.eq).toHaveBeenCalledWith('visible_to_players', true);
  });
});

describe('createMap', () => {
  it('trims the name and stores the image path and size', async () => {
    const q = from({ data: fullRow, error: null });
    await createMap('c1', {
      name: '  Sword Coast ',
      imagePath: 'c1/coast.png',
      width: 4000,
      height: 3000,
      visibleToPlayers: false,
    });
    expect(q.insert).toHaveBeenCalledWith({
      campaign_id: 'c1',
      name: 'Sword Coast',
      image_path: 'c1/coast.png',
      width: 4000,
      height: 3000,
      visible_to_players: false,
    });
  });
  it('refuses an empty name without calling the server', async () => {
    await expect(
      createMap('c1', { name: ' ', imagePath: 'c1/x.png', width: 1, height: 1, visibleToPlayers: false }),
    ).rejects.toMatchObject({ kind: 'validation' });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('setMapVisible', () => {
  it('updates the flag', async () => {
    const q = from({ data: { ...fullRow, visible_to_players: false }, error: null });
    expect((await setMapVisible('m1', false)).visibleToPlayers).toBe(false);
    expect(q.update).toHaveBeenCalledWith({ visible_to_players: false });
  });
  it('treats "no row changed" as not allowed', async () => {
    from({ data: null, error: null });
    await expect(setMapVisible('m1', true)).rejects.toMatchObject({ kind: 'forbidden' });
  });
});
