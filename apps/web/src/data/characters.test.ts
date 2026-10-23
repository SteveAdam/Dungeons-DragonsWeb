import { BRANNOC } from '@dnd-manager/rules-engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../lib/supabase';
import { fakeQuery } from '../test/fakeQuery';
import { applyEffect, getCharacter, getEffectSecrets, listEffects } from './characters';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const from = (result: { data: unknown; error: unknown }) => {
  const q = fakeQuery(result);
  vi.mocked(supabase.from).mockReturnValueOnce(q as never);
  return q;
};
// the stored jsonb: name and xp live in their own columns
const storedSheet: Partial<typeof BRANNOC> = { ...BRANNOC };
delete storedSheet.name;
delete storedSheet.xp;
const row = {
  id: 'ch1',
  campaign_id: 'c1',
  owner_id: 'u1',
  name: 'Brannoc',
  sheet: { ...storedSheet, xp: 999999 }, // a stale copy in the sheet must not win
  xp: 6900,
  created_at: '',
};
beforeEach(() => vi.clearAllMocks());

describe('getCharacter', () => {
  it('validates the sheet and takes XP from its own (DM-guarded) column', async () => {
    from({ data: row, error: null });
    const c = await getCharacter('ch1');
    expect(c.sheet).toEqual(BRANNOC);
    expect(c.sheet.xp).toBe(6900);
  });

  it('refuses a damaged sheet with a plain message', async () => {
    from({
      data: { ...row, sheet: { ...storedSheet, abilityScores: { ...BRANNOC.abilityScores, str: 99 } } },
      error: null,
    });
    await expect(getCharacter('ch1')).rejects.toMatchObject({
      kind: 'validation',
      message: expect.stringContaining('abilityScores.str'),
    });
  });

  it("reads someone else's character (hidden by row level security) as not found", async () => {
    from({ data: null, error: null });
    await expect(getCharacter('ch2')).rejects.toMatchObject({ kind: 'not-found' });
  });
});

describe('effects', () => {
  it('maps rows to engine effects, with a safe duration', async () => {
    from({
      data: [
        {
          id: 'e1',
          character_id: 'ch1',
          name: 'Bless',
          source: 'Sera',
          stat: 'str',
          mode: 'add',
          value: 0,
          duration: { kind: 'rounds', remaining: 10 },
          concentration: true,
          created_at: '',
        },
        {
          id: 'e2',
          character_id: 'ch1',
          name: 'Odd',
          source: '',
          stat: 'ac',
          mode: 'add',
          value: 1,
          duration: { kind: 'forever' },
          concentration: false,
          created_at: '',
        },
      ],
      error: null,
    });
    const [bless, odd] = await listEffects('ch1');
    expect(bless).toEqual({
      id: 'e1',
      name: 'Bless',
      source: 'Sera',
      stat: 'str',
      mode: 'add',
      value: 0,
      duration: { kind: 'rounds', remaining: 10 },
      concentration: true,
    });
    expect(odd.duration).toEqual({ kind: 'permanent' });
  });

  it('asks for secrets only when there are effects', async () => {
    expect(await getEffectSecrets([])).toEqual(new Map());
    expect(supabase.from).not.toHaveBeenCalled();
    from({ data: [{ effect_id: 'e1', hidden_detail: 'Cursed' }], error: null });
    expect(await getEffectSecrets(['e1'])).toEqual(new Map([['e1', 'Cursed']]));
  });

  it('applies an effect through apply_effect, with a "for" duration and its hidden detail (P2-8)', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        id: 'e3',
        character_id: 'ch1',
        name: 'Potion',
        source: 'Potion',
        stat: 'str',
        mode: 'set_at_least',
        value: 21,
        duration: { kind: 'until', atSeconds: 3600 },
        concentration: false,
        created_at: '',
      },
      error: null,
    } as never);
    const effect = await applyEffect('ch1', {
      name: 'Potion',
      source: 'Potion',
      stat: 'str',
      mode: 'set_at_least',
      value: 21,
      duration: { kind: 'for', seconds: 3600 },
      hiddenDetail: 'Cursed',
    });
    expect(supabase.rpc).toHaveBeenCalledWith('apply_effect', {
      p_character: 'ch1',
      p_name: 'Potion',
      p_source: 'Potion',
      p_stat: 'str',
      p_mode: 'set_at_least',
      p_value: 21,
      p_duration: { kind: 'for', seconds: 3600 },
      p_concentration: false,
      p_hidden_detail: 'Cursed',
    });
    expect(effect.duration).toEqual({ kind: 'until', atSeconds: 3600 });
  });
});
