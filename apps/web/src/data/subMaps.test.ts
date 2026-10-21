import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../lib/supabase';
import { fakeQuery } from '../test/fakeQuery';
import { createMap, getMapTrail, listSubMaps } from './maps';
import { validatePinChanges } from './pins';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getSession: vi.fn() } } }));

const from = (result: { data: unknown; error: unknown }) => {
  const q = fakeQuery(result);
  vi.mocked(supabase.from).mockReturnValueOnce(q as never);
  return q;
};
beforeEach(() => vi.clearAllMocks());

const subRow = (id: string, pin: string, visible = true) => ({
  id,
  name: `Map ${id}`,
  image_path: `c1/${id}.png`,
  visible_to_players: visible,
  created_at: '2026-10-21T10:00:00Z',
  parent_pin_id: pin,
});

describe('listSubMaps', () => {
  it('returns the map beneath each pin, keyed by pin (first one wins)', async () => {
    const q = from({ data: [subRow('k', 'p1'), subRow('k2', 'p1'), subRow('t', 'p2', false)], error: null });
    const byPin = await listSubMaps(['p1', 'p2', 'p3'], { includeHidden: true });
    expect([...byPin.keys()]).toEqual(['p1', 'p2']);
    expect(byPin.get('p1')).toMatchObject({ id: 'k', name: 'Map k', parentPinId: 'p1', imagePath: 'c1/k.png' });
    expect(q.in).toHaveBeenCalledWith('parent_pin_id', ['p1', 'p2', 'p3']);
    expect(q.eq).not.toHaveBeenCalledWith('visible_to_players', true);
  });

  it('asks only for visible maps without includeHidden', async () => {
    const q = from({ data: [], error: null });
    await listSubMaps(['p1'], { includeHidden: false });
    expect(q.eq).toHaveBeenCalledWith('visible_to_players', true);
  });

  it('makes no request when there are no pins', async () => {
    expect((await listSubMaps([], { includeHidden: true })).size).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('getMapTrail', () => {
  it('walks up through parent pins, returning the maps top first', async () => {
    from({ data: { map_id: 'kingdom' }, error: null }); // pin above the current map
    from({ data: { id: 'kingdom', name: 'The Kingdom', parent_pin_id: 'p-world' }, error: null });
    from({ data: { map_id: 'world' }, error: null });
    from({ data: { id: 'world', name: 'The Realm', parent_pin_id: null }, error: null });
    expect(await getMapTrail({ parentPinId: 'p-town' }, { includeHidden: true })).toEqual([
      { mapId: 'world', name: 'The Realm' },
      { mapId: 'kingdom', name: 'The Kingdom' },
    ]);
  });

  it('never asks for hidden pins or maps without includeHidden, and stops where it cannot see', async () => {
    const pinQuery = from({ data: { map_id: 'kingdom' }, error: null });
    const mapQuery = from({ data: null, error: null }); // the parent map is hidden from this viewer
    expect(await getMapTrail({ parentPinId: 'p-town' }, { includeHidden: false })).toEqual([]);
    expect(pinQuery.eq).toHaveBeenCalledWith('visible_to_players', true);
    expect(mapQuery.eq).toHaveBeenCalledWith('visible_to_players', true);
  });

  it('is empty for a top-level map, with no requests', async () => {
    expect(await getMapTrail({ parentPinId: null }, { includeHidden: true })).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('createMap beneath a pin', () => {
  it('sends the parent pin', async () => {
    const q = from({
      data: { ...subRow('k', 'p1'), campaign_id: 'c1', width: 10, height: 10, fog_mode: 'shared' },
      error: null,
    });
    await createMap('c1', {
      name: 'Kingdom',
      imagePath: 'c1/k.png',
      width: 10,
      height: 10,
      visibleToPlayers: false,
      parentPinId: 'p1',
    });
    expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({ parent_pin_id: 'p1' }));
  });
});

describe('pin positions', () => {
  it('rounds positions to whole pixels', () => {
    expect(validatePinChanges({ x: 10.6, y: 0.2 })).toEqual({ x: 11, y: 0 });
  });
  it.each([[{ x: -1 }], [{ y: Number.NaN }], [{ x: Number.POSITIVE_INFINITY }]])('refuses %j', changes => {
    expect(() => validatePinChanges(changes)).toThrowError(/position/);
  });
});
