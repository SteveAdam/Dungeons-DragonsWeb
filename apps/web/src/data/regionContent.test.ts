import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../lib/supabase';
import { fakeQuery } from '../test/fakeQuery';
import { DataError } from './errors';
import { contentToRow, emptyDraft, encounterLogLine, listRegionContent, rollRandomEncounter } from './regionContent';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getSession: vi.fn() } } }));
beforeEach(() => vi.clearAllMocks());

describe('contentToRow', () => {
  it('writes a shop with its stock, and leaves empty details out', () => {
    const row = contentToRow({
      ...emptyDraft('shop'),
      name: '  The Gilded Ferret ',
      stock: [{ itemRef: ' Rope (50 ft) ', priceCp: 100 }],
    });
    expect(row).toMatchObject({
      kind: 'shop',
      name: 'The Gilded Ferret',
      state: 'noticed',
      details: { stock: [{ itemRef: 'Rope (50 ft)', priceCp: 100 }] },
      discovery_skill: 'perception',
    });
    expect(contentToRow({ ...emptyDraft('find'), name: 'Shrine' }).details).toEqual({});
  });

  it('starts folk and shops noticed, creatures and finds hidden', () => {
    expect(['creature', 'folk', 'find', 'shop', 'interactable'].map(k => emptyDraft(k as never).state)).toEqual([
      'hidden',
      'noticed',
      'hidden',
      'noticed',
      'hidden',
    ]);
  });

  it.each([
    [{ name: '' }, 'Give the entry a name of 1 to 120 characters.'],
    [{ discoveryDc: 41 }, 'The discovery DC is a whole number from 1 to 40.'],
    [{ hintText: 'x'.repeat(301) }, 'The hint is at most 300 characters.'],
    [
      { spawnRule: { mode: 'chance', chance: 101, timeOfDay: 'any', count: { min: 1, max: 1 } } },
      'The chance is a whole number from 0 to 100.',
    ],
  ])('refuses %j in plain words', (over, message) => {
    const run = () => contentToRow({ ...emptyDraft('creature'), name: 'Wolves', ...(over as object) });
    expect(run).toThrowError(DataError);
    expect(run).toThrowError(message);
  });

  it('refuses a negative price', () => {
    expect(() =>
      contentToRow({ ...emptyDraft('shop'), name: 'Shop', stock: [{ itemRef: 'Rope', priceCp: -1 }] }),
    ).toThrowError('Prices are whole copper pieces, 0 or more.');
  });
});

describe('listRegionContent', () => {
  it('makes no request without regions', async () => {
    expect(await listRegionContent([])).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('reads the details and spawn rule back', async () => {
    const q = fakeQuery({
      data: [
        {
          id: 'e1',
          region_id: 'r1',
          kind: 'shop',
          name: 'Ferret',
          entity_id: null,
          monster_ref: null,
          details: { description: 'Cosy', stock: [{ itemRef: 'Rope', priceCp: 100 }] },
          state: 'noticed',
          hint_text: null,
          discovery_dc: null,
          discovery_skill: 'perception',
          spawn_rule: { mode: 'chance', chance: 35, timeOfDay: 'night', count: { min: 1, max: 3 } },
          sort_order: 0,
        },
      ],
      error: null,
    });
    vi.mocked(supabase.from).mockReturnValueOnce(q as never);
    const [entry] = await listRegionContent(['r1']);
    expect(entry).toMatchObject({ description: 'Cosy', stock: [{ itemRef: 'Rope', priceCp: 100 }] });
    expect(entry.spawnRule).toEqual({ mode: 'chance', chance: 35, timeOfDay: 'night', count: { min: 1, max: 3 } });
    expect(q.in).toHaveBeenCalledWith('region_id', ['r1']);
  });
});

describe('the random encounter', () => {
  it('rolls on the server', async () => {
    const roll = { rollId: 'x', hour: 12, isDay: true, results: [] };
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: roll, error: null } as never);
    expect(await rollRandomEncounter('r1')).toEqual(roll);
    expect(supabase.rpc).toHaveBeenCalledWith('roll_random_encounter', { p_region: 'r1' });
  });

  it('reads as one log line', () => {
    expect(encounterLogLine('Mourning Wood', { rollId: 'x', hour: 9, isDay: true, results: [] })).toBe(
      'Random encounter in Mourning Wood, 09:00 (day): no encounter',
    );
    expect(
      encounterLogLine('Mourning Wood', {
        rollId: 'x',
        hour: 23,
        isDay: false,
        results: [
          { contentId: 'a', name: 'Thornwolf pack', monsterRef: null, count: 3 },
          { contentId: 'b', name: 'Bandit pair', monsterRef: null, count: 2 },
        ],
      }),
    ).toBe('Random encounter in Mourning Wood, 23:00 (night): Thornwolf pack × 3, Bandit pair × 2');
  });
});
