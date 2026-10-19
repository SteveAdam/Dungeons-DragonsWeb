import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../lib/supabase';
import { fakeQuery } from '../test/fakeQuery';
import { getMyRole, listMembers } from './members';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getSession: vi.fn() } } }));

const from = (result: { data: unknown; error: unknown }) => {
  const q = fakeQuery(result);
  vi.mocked(supabase.from).mockReturnValueOnce(q as never);
  return q;
};
beforeEach(() => vi.clearAllMocks());

describe('listMembers', () => {
  const rows = [
    { user_id: 'u-player2', role: 'player', joined_at: '2026-10-18T12:00:00Z' },
    { user_id: 'u-dm', role: 'dm', joined_at: '2026-10-18T10:00:00Z' },
    { user_id: 'u-player1', role: 'player', joined_at: '2026-10-18T11:00:00Z' },
  ];
  const profiles = [
    { id: 'u-dm', display_name: 'Dungeon Dan', avatar_url: 'https://cdn.example/dan.png' },
    { id: 'u-player1', display_name: '  ', avatar_url: null },
  ];

  it('joins members with their profiles and puts the DM first, then by join time', async () => {
    from({ data: rows, error: null });
    const profileQuery = from({ data: profiles, error: null });
    const members = await listMembers('c1');
    expect(members.map(m => m.userId)).toEqual(['u-dm', 'u-player1', 'u-player2']);
    expect(members[0]).toMatchObject({ role: 'dm', displayName: 'Dungeon Dan', avatarUrl: 'https://cdn.example/dan.png' });
    expect(profileQuery.in).toHaveBeenCalledWith('id', ['u-player2', 'u-dm', 'u-player1']);
  });
  it('falls back to "Adventurer" when there is no usable name', async () => {
    from({ data: rows, error: null });
    from({ data: profiles, error: null });
    const members = await listMembers('c1');
    expect(members.find(m => m.userId === 'u-player1')?.displayName).toBe('Adventurer');
    expect(members.find(m => m.userId === 'u-player2')?.displayName).toBe('Adventurer');
  });
  it('returns an empty list without asking for profiles when there are no members', async () => {
    from({ data: [], error: null });
    expect(await listMembers('c1')).toEqual([]);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });
  it('reports a failure of either query', async () => {
    from({ data: null, error: { message: 'Failed to fetch' } });
    await expect(listMembers('c1')).rejects.toMatchObject({ kind: 'network' });
    from({ data: rows, error: null });
    from({ data: null, error: { message: 'Failed to fetch' } });
    await expect(listMembers('c1')).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('getMyRole', () => {
  const signedIn = () => vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: { id: 'u1' } } } } as never);

  it('returns my role', async () => {
    signedIn();
    const q = from({ data: { role: 'dm' }, error: null });
    expect(await getMyRole('c1')).toBe('dm');
    expect(q.eq).toHaveBeenCalledWith('user_id', 'u1');
  });
  it('returns null when I am not a member', async () => {
    signedIn();
    from({ data: null, error: null });
    expect(await getMyRole('c1')).toBeNull();
  });
  it('fails clearly when signed out', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never);
    await expect(getMyRole('c1')).rejects.toMatchObject({ kind: 'signed-out' });
  });
});
