import { describe, expect, it } from 'vitest';
import { abilityRollTotals, pointBuyCost, readCreationChoices, weaponTrainingOf } from './creation';

const scores = (str: number, dex: number, con: number, int: number, wis: number, cha: number) => ({
  str,
  dex,
  con,
  int,
  wis,
  cha,
});

describe('character creation helpers (P2-9)', () => {
  it('prices point buy with the SRD costs: 8 is free, 14 costs 7, 15 costs 9', () => {
    expect(pointBuyCost(scores(8, 8, 8, 8, 8, 8))).toBe(0);
    expect(pointBuyCost(scores(15, 15, 15, 8, 8, 8))).toBe(27);
    expect(pointBuyCost(scores(14, 14, 14, 14, 8, 8))).toBe(28);
    expect(pointBuyCost(scores(16, 8, 8, 8, 8, 8))).toBeNull();
    expect(pointBuyCost(scores(7, 8, 8, 8, 8, 8))).toBeNull();
  });

  it('totals each set of 4d6 without its lowest die', () => {
    const dice = [6, 6, 6, 1, 1, 1, 1, 1, 3, 4, 5, 2, 6, 5, 4, 3, 2, 2, 2, 2, 6, 6, 1, 6];
    expect(abilityRollTotals(dice)).toEqual([18, 3, 12, 15, 6, 18]);
    expect(() => abilityRollTotals([6, 6, 6])).toThrow(RangeError);
    expect(() => abilityRollTotals(Array(24).fill(7))).toThrow(RangeError);
  });

  it('reads weapon training from the class text, including the Monk and Rogue limits', () => {
    expect(weaponTrainingOf('Simple and Martial weapons')).toEqual(['simple', 'martial']);
    expect(weaponTrainingOf('Simple weapons')).toEqual(['simple']);
    expect(weaponTrainingOf('Simple weapons and Martial weapons that have the Light property')).toEqual([
      'simple',
      'martial-light',
    ]);
    expect(weaponTrainingOf('Simple weapons and Martial weapons that have the Finesse or Light property')).toEqual([
      'simple',
      'martial-light',
      'martial-finesse',
    ]);
  });

  it('refuses payloads of the wrong shape before any rule is checked', () => {
    expect(readCreationChoices(null)).toEqual({ error: 'The choices must be an object' });
    expect(readCreationChoices({ name: 'A', species: 'elf', class: 'wizard', background: 'sage' })).toEqual({
      error: 'abilities.method must be standard, pointBuy or roll',
    });
  });
});
