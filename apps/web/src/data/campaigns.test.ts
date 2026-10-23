import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../lib/supabase';
import { fakeQuery } from '../test/fakeQuery';
import { createCampaign, getCampaign, getInviteCode, joinCampaign, listCampaigns } from './campaigns';
import { DataError } from './errors';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getSession: vi.fn() } } }));

const row = {
  id: 'c1',
  name: 'The Sunken Crown',
  rules_edition: '2024',
  next_session_at: null,
  game_seconds: 3600,
  created_at: '2026-10-18T10:00:00Z',
};
const from = (result: { data: unknown; error: unknown }) => {
  const q = fakeQuery(result);
  vi.mocked(supabase.from).mockReturnValueOnce(q as never);
  return q;
};

beforeEach(() => vi.clearAllMocks());

describe('listCampaigns', () => {
  it('maps rows to campaigns, with the optional feat setting (P2-10)', async () => {
    from({ data: [row, { ...row, id: 'c2', rules_edition: '2014', settings: { optionalFeats: true } }], error: null });
    expect(await listCampaigns()).toEqual([
      {
        id: 'c1',
        name: 'The Sunken Crown',
        rulesEdition: '2024',
        nextSessionAt: null,
        gameSeconds: 3600,
        optionalFeats: false,
        createdAt: '2026-10-18T10:00:00Z',
      },
      {
        id: 'c2',
        name: 'The Sunken Crown',
        rulesEdition: '2014',
        nextSessionAt: null,
        gameSeconds: 3600,
        optionalFeats: true,
        createdAt: '2026-10-18T10:00:00Z',
      },
    ]);
    expect(supabase.from).toHaveBeenCalledWith('campaigns');
  });
  it('returns an empty list for no rows', async () => {
    from({ data: null, error: null });
    expect(await listCampaigns()).toEqual([]);
  });
  it('turns a dropped connection into a network error', async () => {
    from({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    await expect(listCampaigns()).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('getCampaign', () => {
  it('returns the campaign', async () => {
    from({ data: row, error: null });
    expect((await getCampaign('c1')).name).toBe('The Sunken Crown');
  });
  it('says not-found when nothing comes back (not a member, or it does not exist)', async () => {
    from({ data: null, error: null });
    await expect(getCampaign('nope')).rejects.toMatchObject({ kind: 'not-found' });
  });
});

describe('createCampaign', () => {
  it('trims the name and returns the new campaign', async () => {
    const q = from({ data: row, error: null });
    await createCampaign('  The Sunken Crown  ');
    expect(q.insert).toHaveBeenCalledWith({ name: 'The Sunken Crown' });
  });
  it.each(['', '   ', 'x'.repeat(121)])('rejects a bad name without calling the server: %j', async name => {
    await expect(createCampaign(name)).rejects.toMatchObject({ kind: 'validation' });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('joinCampaign', () => {
  it('calls the join_campaign function with the trimmed code and returns the campaign id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'c1', error: null } as never);
    expect(await joinCampaign('  7F3A9C21 ')).toBe('c1');
    expect(supabase.rpc).toHaveBeenCalledWith('join_campaign', { code: '7F3A9C21' });
  });
  it('maps a wrong code to a friendly error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { code: 'P0001', message: 'Invalid invite code' },
    } as never);
    const error = await joinCampaign('WRONG').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect(error).toMatchObject({ kind: 'invalid-code' });
  });
  it('asks for a code when it is empty, without calling the server', async () => {
    await expect(joinCampaign('  ')).rejects.toMatchObject({ kind: 'validation' });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('getInviteCode', () => {
  it('returns the code for a DM', async () => {
    const q = from({ data: { invite_code: '7F3A9C21' }, error: null });
    expect(await getInviteCode('c1')).toBe('7F3A9C21');
    expect(supabase.from).toHaveBeenCalledWith('campaign_secrets');
    expect(q.eq).toHaveBeenCalledWith('campaign_id', 'c1');
  });
  it('returns null for anyone else, because the database returns no row', async () => {
    from({ data: null, error: null });
    expect(await getInviteCode('c1')).toBeNull();
  });
});
