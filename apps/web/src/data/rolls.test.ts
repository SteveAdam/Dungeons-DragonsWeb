import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../lib/supabase';
import { fakeQuery } from '../test/fakeQuery';
import { listRecentRolls, rollD20, subscribeToRolls } from './rolls';

const channel = { on: vi.fn(), subscribe: vi.fn() };
vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}));

const row = {
  id: 'r1',
  campaign_id: 'c1',
  character_id: null,
  rolled_by: 'u1',
  kind: 'check',
  label: 'Perception',
  bonus: 3,
  target: 14,
  mode: 'advantage',
  dice: [7, 15],
  kept: 15,
  total: 18,
  success: true,
  crit: false,
  fumble: false,
  hidden: false,
  created_at: '2026-10-21T10:00:00Z',
};
const roll = {
  id: 'r1',
  campaignId: 'c1',
  characterId: null,
  rolledBy: 'u1',
  kind: 'check',
  label: 'Perception',
  bonus: 3,
  target: 14,
  mode: 'advantage',
  dice: [7, 15],
  kept: 15,
  total: 18,
  success: true,
  crit: false,
  fumble: false,
  hidden: false,
  createdAt: '2026-10-21T10:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  vi.mocked(supabase.channel).mockReturnValue(channel as never);
});

describe('rollD20', () => {
  it('asks the server to roll and returns the logged roll', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: row, error: null } as never);
    const result = await rollD20({
      campaignId: 'c1',
      kind: 'check',
      label: ' Perception ',
      bonus: 3,
      target: 14,
      mode: 'advantage',
    });
    expect(supabase.rpc).toHaveBeenCalledWith('roll_d20', {
      p_campaign: 'c1',
      p_character: null,
      p_kind: 'check',
      p_label: 'Perception',
      p_bonus: 3,
      p_target: 14,
      p_mode: 'advantage',
      p_hidden: false,
    });
    expect(result).toEqual(roll);
  });

  it('turns the rate limit into a plain message', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: 'PT429', message: 'Too many' } } as never);
    await expect(
      rollD20({ campaignId: 'c1', kind: 'other', label: 'x', bonus: 0, mode: 'normal' }),
    ).rejects.toMatchObject({
      kind: 'rate-limited',
      message: 'Too many rolls in the last minute. Wait a moment and roll again.',
    });
  });

  it('checks the label and bonus before calling the server', async () => {
    await expect(
      rollD20({ campaignId: 'c1', kind: 'check', label: ' ', bonus: 0, mode: 'normal' }),
    ).rejects.toMatchObject({
      kind: 'validation',
    });
    await expect(
      rollD20({ campaignId: 'c1', kind: 'check', label: 'x', bonus: 41, mode: 'normal' }),
    ).rejects.toMatchObject({
      kind: 'validation',
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('listRecentRolls', () => {
  it('reads the newest rolls of a campaign first', async () => {
    const q = fakeQuery({ data: [row], error: null });
    vi.mocked(supabase.from).mockReturnValueOnce(q as never);
    expect(await listRecentRolls('c1', 5)).toEqual([roll]);
    expect(q.eq).toHaveBeenCalledWith('campaign_id', 'c1');
    expect(q.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(q.limit).toHaveBeenCalledWith(5);
  });
});

describe('subscribeToRolls', () => {
  it('passes on new rolls for the campaign and stops when asked', () => {
    const seen: unknown[] = [];
    const stop = subscribeToRolls('c1', r => seen.push(r));
    const [, filter, handler] = channel.on.mock.calls[0];
    expect(filter).toEqual({ event: 'INSERT', schema: 'public', table: 'rolls', filter: 'campaign_id=eq.c1' });
    handler({ new: row });
    expect(seen).toEqual([roll]);
    stop();
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  });
});
