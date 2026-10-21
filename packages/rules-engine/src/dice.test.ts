import { describe, expect, it } from 'vitest';
import { successChance, type RollMode } from './core';
import { bonusDiceDistribution, successChanceWithDice, type BonusDie } from './dice';

const bless: BonusDie = { count: 1, sides: 4, sign: 1 };
const bane: BonusDie = { count: 1, sides: 4, sign: -1 };
const check = (bonusDice: BonusDie[], mode: RollMode = 'normal') =>
  successChanceWithDice({ kind: 'check', bonus: 3, target: 14, mode, bonusDice });

describe('successChanceWithDice (ticket cases)', () => {
  it('check +3 vs DC 14 with Bless: 62.5%; with advantage too: 85.625%', () => {
    expect(check([bless]).final).toBeCloseTo(0.625, 10);
    expect(check([bless], 'advantage').final).toBeCloseTo(0.85625, 10);
    expect(check([bless]).expectedBonus).toBeCloseTo(2.5, 10);
    expect(check([bless]).delta).toBeCloseTo(0.125, 10); // "Bless adds about 12 points"
  });

  it('with no bonus dice it equals successChance exactly', () => {
    for (const mode of ['normal', 'advantage', 'disadvantage'] as const) {
      for (const [kind, bonus, target] of [
        ['check', 3, 14],
        ['attack', 5, 13],
        ['save', -2, 25],
        ['attack', 20, 10],
      ] as const) {
        const plain = successChance({ kind, bonus, target, mode }).final;
        const r = successChanceWithDice({ kind, bonus, target, mode, bonusDice: [] });
        expect(r.final).toBe(plain);
        expect(r.withoutDice).toBe(plain);
        expect(r.delta).toBe(0);
      }
    }
  });

  it('attack +5 vs AC 13 with +1d4: 70%, 75%, 80%, 85% for 1 to 4, so 77.5%', () => {
    const r = successChanceWithDice({ kind: 'attack', bonus: 5, target: 13, mode: 'normal', bonusDice: [bless] });
    expect(r.final).toBeCloseTo((0.7 + 0.75 + 0.8 + 0.85) / 4, 10);
    expect(r.final).toBeCloseTo(0.775, 10);
  });

  it('Bane on a +3 check vs DC 14 drops 50% to 37.5%', () => {
    // Working: Bane subtracts 1d4, so the extra e is -1, -2, -3 or -4, each with probability 1/4.
    // The bonus becomes 2, 1, 0 or -1, so the d20 must show 12, 13, 14 or 15.
    // Single-die chances (21 - needed) / 20: 9/20 = 0.45, 8/20 = 0.40, 7/20 = 0.35, 6/20 = 0.30.
    // Average: (0.45 + 0.40 + 0.35 + 0.30) / 4 = 1.50 / 4 = 0.375.
    const r = check([bane]);
    expect(r.final).toBeCloseTo(0.375, 10);
    expect(r.final).toBeLessThan(0.5);
    expect(r.delta).toBeCloseTo(-0.125, 10);
    expect(r.expectedBonus).toBeCloseTo(-2.5, 10);
  });

  it('attacks keep the 5%-95% limits for every die result', () => {
    // +20 vs AC 10 is already 95%, so Bless cannot raise it
    const r = successChanceWithDice({ kind: 'attack', bonus: 20, target: 10, mode: 'normal', bonusDice: [bless] });
    expect(r.final).toBeCloseTo(0.95, 10);
    // a check has no such limit: +18 vs DC 20 with Bless is certain
    expect(
      successChanceWithDice({ kind: 'check', bonus: 18, target: 20, mode: 'normal', bonusDice: [bless] }).final,
    ).toBe(1);
  });
});

describe('bonusDiceDistribution', () => {
  it('2d4 is the triangle 1,2,3,4,3,2,1 sixteenths over totals 2 to 8, summing to 1', () => {
    const d = bonusDiceDistribution([{ count: 2, sides: 4, sign: 1 }]);
    expect([...d.keys()].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    [1, 2, 3, 4, 3, 2, 1].forEach((n, i) => expect(d.get(i + 2)).toBeCloseTo(n / 16, 12));
    expect([...d.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('mixes signs: Bless and Bane together are centred on 0', () => {
    const d = bonusDiceDistribution([bless, bane]);
    expect(Math.min(...d.keys())).toBe(-3);
    expect(Math.max(...d.keys())).toBe(3);
    expect(d.get(0)).toBeCloseTo(4 / 16, 12);
  });

  it('refuses nonsense dice', () => {
    expect(() => bonusDiceDistribution([{ count: 1.5, sides: 4, sign: 1 }])).toThrow(RangeError);
    expect(() => bonusDiceDistribution([{ count: 1, sides: 0, sign: 1 }])).toThrow(RangeError);
  });
});

describe('limits and speed', () => {
  it('always returns a chance from 0 to 1', () => {
    for (let bonus = -30; bonus <= 40; bonus += 7) {
      for (let target = -5; target <= 40; target += 9) {
        for (const kind of ['check', 'attack'] as const) {
          const { final } = successChanceWithDice({
            kind,
            bonus,
            target,
            mode: 'advantage',
            bonusDice: [{ count: 2, sides: 6, sign: 1 }, bane],
          });
          expect(final).toBeGreaterThanOrEqual(0);
          expect(final).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('1,000 calls with three d8 bonus dice take under 100 ms', () => {
    const dice: BonusDie[] = [
      { count: 1, sides: 8, sign: 1 },
      { count: 1, sides: 8, sign: 1 },
      { count: 1, sides: 8, sign: -1 },
    ];
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      successChanceWithDice({ kind: 'attack', bonus: i % 10, target: 15, mode: 'advantage', bonusDice: dice });
    }
    expect(Date.now() - start).toBeLessThan(100);
  });
});
