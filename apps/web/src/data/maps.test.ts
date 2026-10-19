import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../lib/supabase';
import { fakeQuery } from '../test/fakeQuery';
import { listMaps } from './maps';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getSession: vi.fn() } } }));

const rows = [{ id: 'm1', name: 'Sword Coast', visible_to_players: true, created_at: '2026-10-18T10:00:00Z' }];
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
      { id: 'm1', name: 'Sword Coast', visibleToPlayers: true, createdAt: '2026-10-18T10:00:00Z' },
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
