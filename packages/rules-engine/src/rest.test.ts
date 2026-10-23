import { describe, expect, it } from 'vitest';
import { hillGiantStrength } from './fixtures';
import type { Effect } from './effects';
import { longRest } from './rest';

const untilRest = (rest: 'short' | 'long'): Effect => ({
  id: `rest-${rest}`,
  name: `Until a ${rest} rest`,
  source: 'Test',
  stat: 'ac',
  mode: 'add',
  value: 1,
  duration: { kind: 'rest', rest },
});

describe('the simple long rest (P2-11, SRD 5.2.1 "Long Rest")', () => {
  it('restores all hit points, all spent Hit Point Dice and every slot; Exhaustion drops by 1; concentration ends', () => {
    const after = longRest({
      hp: { max: 20, current: 3, temp: 4 },
      hitDice: { die: 'd6', total: 3, spent: 3 },
      exhaustion: 2,
      slotsUsed: [4, 2, 0, 0, 0, 0, 0, 0, 0],
      concentration: 'Blur',
      effects: [untilRest('short'), untilRest('long'), hillGiantStrength(0)],
    });
    expect(after.hp).toEqual({ max: 20, current: 20, temp: 4 });
    expect(after.hitDice.spent).toBe(0);
    expect(after.exhaustion).toBe(1);
    expect(after.slotsUsed).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(after.concentration).toBeNull();
    // effects that last until a rest end; timed ones carry on by the clock
    expect(after.effects.map(e => e.name)).toEqual(['Potion of Hill Giant Strength']);
  });

  it('never takes Exhaustion below 0', () => {
    const after = longRest({
      hp: { max: 8, current: 8, temp: 0 },
      hitDice: { die: 'd8', total: 1, spent: 0 },
      exhaustion: 0,
      slotsUsed: [],
      concentration: null,
      effects: [],
    });
    expect(after.exhaustion).toBe(0);
  });
});
