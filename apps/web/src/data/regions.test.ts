import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../lib/supabase';
import { fakeQuery } from '../test/fakeQuery';
import { createRegion, deleteRegion, listRegions, updateRegion, validateRegionChanges } from './regions';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getSession: vi.fn() } } }));

const row = {
  id: 'r1',
  map_id: 'm1',
  name: 'The Glass Sands',
  cx: 400,
  cy: 300,
  radius: 120,
  terrain: 'desert',
  weather: 'extreme_heat',
  description: '',
  visible_to_players: true,
};
const from = (result: { data: unknown; error: unknown }) => {
  const q = fakeQuery(result);
  vi.mocked(supabase.from).mockReturnValueOnce(q as never);
  return q;
};
beforeEach(() => vi.clearAllMocks());

describe('listRegions', () => {
  it('maps rows to regions, and falls back on unknown terrain or weather', async () => {
    from({ data: [row, { ...row, id: 'r2', terrain: 'moon', weather: 'frogs' }], error: null });
    const [sands, odd] = await listRegions('m1', { includeHidden: true });
    expect(sands).toEqual({
      id: 'r1',
      mapId: 'm1',
      name: 'The Glass Sands',
      cx: 400,
      cy: 300,
      radius: 120,
      terrain: 'desert',
      weather: 'extreme_heat',
      description: '',
      visibleToPlayers: true,
    });
    expect(odd).toMatchObject({ terrain: 'grassland', weather: 'clear' });
  });

  it('asks for hidden regions only when told to', async () => {
    const dm = from({ data: [], error: null });
    await listRegions('m1', { includeHidden: true });
    expect(dm.eq).not.toHaveBeenCalledWith('visible_to_players', true);
    const player = from({ data: [], error: null });
    await listRegions('m1', { includeHidden: false });
    expect(player.eq).toHaveBeenCalledWith('visible_to_players', true);
  });
});

describe('writing regions', () => {
  it('creates a hidden region with whole-pixel numbers', async () => {
    const q = from({ data: row, error: null });
    await createRegion('m1', { cx: 400.4, cy: 299.6, radius: 120.2 }, 'desert');
    expect(q.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        map_id: 'm1',
        cx: 400,
        cy: 300,
        radius: 120,
        terrain: 'desert',
        visible_to_players: false,
      }),
    );
  });

  it('sends only the changed columns, and says "forbidden" when row level security hides the row', async () => {
    const q = from({ data: row, error: null });
    await updateRegion('r1', { weather: 'sandstorm', visibleToPlayers: true });
    expect(q.update).toHaveBeenCalledWith({ weather: 'sandstorm', visible_to_players: true });
    from({ data: null, error: null });
    await expect(updateRegion('r1', { name: 'x' })).rejects.toMatchObject({ kind: 'forbidden' });
    from({ data: [], error: null });
    await expect(deleteRegion('r1')).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('refuses bad values with a plain message before reaching the server', () => {
    expect(() => validateRegionChanges({ name: '  ' })).toThrow(/name of 1 to 120/);
    expect(() => validateRegionChanges({ radius: 2 })).toThrow(/at least 8 pixels/);
    expect(() => validateRegionChanges({ cx: -1 })).toThrow(/centre/);
    expect(() => validateRegionChanges({ terrain: 'moon' as never })).toThrow(/terrain/);
    expect(() => validateRegionChanges({ weather: 'frogs' as never })).toThrow(/weather/);
    expect(validateRegionChanges({ name: ' Wraithwood ', radius: 40.6 })).toEqual({ name: 'Wraithwood', radius: 41 });
  });
});
