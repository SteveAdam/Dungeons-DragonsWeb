import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../lib/supabase';
import { fakeQuery } from '../test/fakeQuery';
import { DataError } from './errors';
import { createMap, getMapTrail, linkMap, listSubMaps } from './maps';
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
  parent_region_id: null,
});

describe('listSubMaps', () => {
  it('returns the map beneath each pin and each region, keyed by parent (first one wins)', async () => {
    const pinQuery = from({ data: [subRow('k', 'p1'), subRow('k2', 'p1'), subRow('t', 'p2', false)], error: null });
    const regionQuery = from({
      data: [{ ...subRow('o', 'x'), parent_pin_id: null, parent_region_id: 'r1' }],
      error: null,
    });
    const subs = await listSubMaps({ pinIds: ['p1', 'p2', 'p3'], regionIds: ['r1'] }, { includeHidden: true });
    expect([...subs.byPin.keys()]).toEqual(['p1', 'p2']);
    expect(subs.byPin.get('p1')).toMatchObject({ id: 'k', name: 'Map k', parentPinId: 'p1', imagePath: 'c1/k.png' });
    expect(subs.byRegion.get('r1')).toMatchObject({ id: 'o', parentPinId: null, parentRegionId: 'r1' });
    expect(pinQuery.in).toHaveBeenCalledWith('parent_pin_id', ['p1', 'p2', 'p3']);
    expect(regionQuery.in).toHaveBeenCalledWith('parent_region_id', ['r1']);
    expect(pinQuery.eq).not.toHaveBeenCalledWith('visible_to_players', true);
  });

  it('asks only for visible maps without includeHidden', async () => {
    const q = from({ data: [], error: null });
    await listSubMaps({ pinIds: ['p1'], regionIds: [] }, { includeHidden: false });
    expect(q.eq).toHaveBeenCalledWith('visible_to_players', true);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('makes no request when there are no pins or regions', async () => {
    const subs = await listSubMaps({ pinIds: [], regionIds: [] }, { includeHidden: true });
    expect(subs.byPin.size + subs.byRegion.size).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('getMapTrail', () => {
  const ancestors = [
    { map_id: 'kingdom', name: 'The Kingdom', depth: 1, via_kind: 'pin', via_id: 'p-town' },
    { map_id: 'world', name: 'The Realm', depth: 2, via_kind: 'region', via_id: 'r-kingdom' },
  ];

  it('asks map_ancestors and returns the maps top first', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: ancestors, error: null } as never);
    expect(
      await getMapTrail({ id: 'town', parentPinId: 'p-town', parentRegionId: null }, { includeHidden: true }),
    ).toEqual([
      { mapId: 'world', name: 'The Realm' },
      { mapId: 'kingdom', name: 'The Kingdom' },
    ]);
    expect(supabase.rpc).toHaveBeenCalledWith('map_ancestors', { p_map: 'town', as_player: false });
  });

  it('asks as a player without includeHidden, so a DM previewing gets no hidden names', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [], error: null } as never);
    await getMapTrail({ id: 'town', parentPinId: null, parentRegionId: 'r1' }, { includeHidden: false });
    expect(supabase.rpc).toHaveBeenCalledWith('map_ancestors', { p_map: 'town', as_player: true });
  });

  it('is empty for a top-level map, with no requests', async () => {
    expect(await getMapTrail({ id: 'w', parentPinId: null, parentRegionId: null }, { includeHidden: true })).toEqual(
      [],
    );
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('linkMap', () => {
  const mapRow = { ...subRow('k', 'p1'), campaign_id: 'c1', width: 10, height: 10, fog_mode: 'shared' };

  it('sets exactly one parent', async () => {
    const q = from({ data: { ...mapRow, parent_pin_id: null, parent_region_id: 'r1' }, error: null });
    const linked = await linkMap('k', { kind: 'region', id: 'r1' });
    expect(q.update).toHaveBeenCalledWith({ parent_pin_id: null, parent_region_id: 'r1' });
    expect(q.eq).toHaveBeenCalledWith('id', 'k');
    expect(linked.parentRegionId).toBe('r1');
  });

  it('unlinks with no parent', async () => {
    const q = from({ data: { ...mapRow, parent_pin_id: null }, error: null });
    await linkMap('k', null);
    expect(q.update).toHaveBeenCalledWith({ parent_pin_id: null, parent_region_id: null });
  });

  it('passes on the database refusal of a cycle in plain words', async () => {
    from({
      data: null,
      error: { code: '22023', message: 'A map cannot be placed beneath itself or one of its own detail maps' },
    });
    const error = await linkMap('k', { kind: 'pin', id: 'p9' }).catch(e => e);
    expect(error).toBeInstanceOf(DataError);
    expect(error.message).toBe('A map cannot be placed beneath itself or one of its own detail maps.');
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
