import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../lib/supabase';
import { fakeQuery } from '../test/fakeQuery';
import { listRecentRolls, previewRoll, rollForCharacter, subscribeToRolls } from './rolls';

const channel = { on: vi.fn(), subscribe: vi.fn() };
vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(), functions: { invoke: vi.fn() } },
}));

const row = {
  id: 'r1',
  campaign_id: 'c1',
  character_id: null,
  rolled_by: 'u1',
  kind: 'check',
  label: 'Perception',
  bonus: 3,
  bonus_breakdown: null,
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
  bonusBreakdown: null,
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

const request = {
  campaignId: 'c1',
  characterId: 'ch1',
  kind: 'check' as const,
  key: 'athletics',
  target: 14,
};
const breakdown = [
  { label: 'Strength', value: 3 },
  { label: 'Proficiency', value: 3 },
];
// what supabase-js gives back when the function answers with an error status
const httpError = (status: number, body: unknown) => ({
  name: 'FunctionsHttpError',
  context: new Response(JSON.stringify(body), { status }),
});

describe('previewRoll and rollForCharacter (P2-2: through the roll Edge Function)', () => {
  it('asks the function for a preview, sending what to roll but no bonus', async () => {
    const preview = { label: 'Athletics check', bonus: 6, bonusBreakdown: breakdown, mode: 'normal', chance: 0.65 };
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: preview, error: null } as never);
    expect(await previewRoll(request)).toEqual(preview);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('roll', { body: { action: 'preview', ...request } });
  });

  it('rolls through the function and returns the logged roll, with its breakdown', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { ...row, character_id: 'ch1', bonus: 6, bonus_breakdown: breakdown },
      error: null,
    } as never);
    const result = await rollForCharacter(request);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('roll', { body: { action: 'roll', ...request } });
    expect(result).toEqual({ ...roll, characterId: 'ch1', bonus: 6, bonusBreakdown: breakdown });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("keeps the server's reason when a roll is refused", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: httpError(403, { error: 'You can only roll for your own character' }),
    } as never);
    await expect(rollForCharacter(request)).rejects.toMatchObject({
      kind: 'forbidden',
      message: 'You can only roll for your own character',
    });
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: httpError(409, { error: 'Brannoc cannot use the Greatsword yet: Strength 17 needed, you have 16' }),
    } as never);
    await expect(previewRoll(request)).rejects.toMatchObject({
      kind: 'validation',
      message: 'Brannoc cannot use the Greatsword yet: Strength 17 needed, you have 16',
    });
  });

  it('turns the rate limit into a plain message', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: httpError(429, { error: 'Too many rolls in the last minute.' }),
    } as never);
    await expect(rollForCharacter(request)).rejects.toMatchObject({
      kind: 'rate-limited',
      message: 'Too many rolls in the last minute. Wait a moment and roll again.',
    });
  });

  it('says so when the function is not running', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: { name: 'FunctionsRelayError', message: 'Relay Error invoking the Edge Function' },
    } as never);
    await expect(previewRoll(request)).rejects.toMatchObject({
      message: 'The dice server is not answering. Try again in a moment.',
    });
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
