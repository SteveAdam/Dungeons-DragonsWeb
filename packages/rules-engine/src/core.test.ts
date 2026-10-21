import { describe, expect, it } from 'vitest';
import {
  abilityModifier,
  critChance,
  formatPercent,
  levelFromXp,
  proficiencyBonus,
  rangeBand,
  resolveRollMode,
  successChance,
  xpForLevel,
  xpToNext,
  type RollKind,
  type RollMode,
} from './core';

const chance = (kind: RollKind, bonus: number, target: number, mode: RollMode = 'normal') =>
  successChance({ kind, bonus, target, mode }).final;

describe('abilityModifier and proficiencyBonus', () => {
  it('floors (score - 10) / 2', () => {
    expect([1, 8, 9, 10, 11, 12, 16, 20, 30].map(abilityModifier)).toEqual([-5, -1, -1, 0, 0, 1, 3, 5, 10]);
  });

  it('gives +2 to +6 by level, and refuses levels outside 1-20', () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    expect(() => proficiencyBonus(0)).toThrow(RangeError);
    expect(() => proficiencyBonus(21)).toThrow(RangeError);
    expect(() => proficiencyBonus(2.5)).toThrow(RangeError);
  });
});

describe('XP and levels', () => {
  it('finds the level from total XP (ticket cases)', () => {
    expect(levelFromXp(6900)).toBe(5);
    expect(levelFromXp(14000)).toBe(6);
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(400000)).toBe(20);
  });

  it('matches every threshold exactly, one point below stays at the level before', () => {
    for (let level = 2; level <= 20; level++) {
      expect(levelFromXp(xpForLevel(level))).toBe(level);
      expect(levelFromXp(xpForLevel(level) - 1)).toBe(level - 1);
    }
    expect(xpForLevel(20)).toBe(355000);
    expect(() => levelFromXp(-1)).toThrow(RangeError);
  });

  it('counts the XP still needed for the next level', () => {
    expect(xpToNext(6900)).toBe(14000 - 6900);
    expect(xpToNext(0)).toBe(300);
    expect(xpToNext(355000)).toBe(0);
    expect(xpToNext(400000)).toBe(0);
  });
});

describe('resolveRollMode', () => {
  it('advantage plus disadvantage cancel to normal, and every reason shows it', () => {
    const r = resolveRollMode({ advantage: ['High ground'], disadvantage: ['Poisoned'] });
    expect(r.mode).toBe('normal');
    expect(r.reasons).toEqual([
      { text: 'High ground', kind: 'advantage', cancelled: true },
      { text: 'Poisoned', kind: 'disadvantage', cancelled: true },
    ]);
  });

  it('two advantages stay advantage (they do not stack); two disadvantages stay disadvantage', () => {
    expect(resolveRollMode({ advantage: ['Help', 'Hidden'], disadvantage: [] }).mode).toBe('advantage');
    expect(resolveRollMode({ advantage: [], disadvantage: ['Prone', 'Long range'] }).mode).toBe('disadvantage');
    expect(resolveRollMode({ advantage: [], disadvantage: [] })).toEqual({ mode: 'normal', reasons: [] });
  });
});

describe('successChance (ticket cases)', () => {
  it('check +3 vs DC 14: 50%, advantage 75%, disadvantage 25%', () => {
    expect(chance('check', 3, 14)).toBeCloseTo(0.5, 10);
    expect(chance('check', 3, 14, 'advantage')).toBeCloseTo(0.75, 10);
    expect(chance('check', 3, 14, 'disadvantage')).toBeCloseTo(0.25, 10);
    expect(successChance({ kind: 'check', bonus: 3, target: 14, mode: 'normal' })).toEqual({
      single: 0.5,
      final: 0.5,
      needed: 11,
      mode: 'normal',
    });
  });

  it('check +6 vs DC 18 is 45%; +0 vs DC 13 is 40%', () => {
    expect(chance('check', 6, 18)).toBeCloseTo(0.45, 10);
    expect(chance('check', 0, 13)).toBeCloseTo(0.4, 10);
  });

  it('checks have no automatic success or failure: +3 vs DC 30 is 0%, +3 vs DC 2 is 100%', () => {
    expect(chance('check', 3, 30)).toBe(0);
    expect(chance('check', 3, 2)).toBe(1);
    expect(chance('save', 3, 30)).toBe(0);
  });

  it('attack +5 vs AC 13: 65%, disadvantage 42.25%', () => {
    expect(chance('attack', 5, 13)).toBeCloseTo(0.65, 10);
    expect(chance('attack', 5, 13, 'disadvantage')).toBeCloseTo(0.4225, 10);
  });

  it('attacks stay between 5% and 95%: +20 vs AC 10 is 95%, -5 vs AC 25 is 5%', () => {
    expect(chance('attack', 20, 10)).toBeCloseTo(0.95, 10);
    expect(chance('attack', -5, 25)).toBeCloseTo(0.05, 10);
  });
});

describe('critChance', () => {
  it('is 5%, 9.75% with advantage, 0.25% with disadvantage', () => {
    expect(critChance('normal')).toBeCloseTo(0.05, 10);
    expect(critChance('advantage')).toBeCloseTo(0.0975, 10);
    expect(critChance('disadvantage')).toBeCloseTo(0.0025, 10);
  });
});

describe('rangeBand', () => {
  const shortbow = { normalFt: 80, longFt: 320, hostileWithin5ft: false };

  it('shortbow at 90 ft is long range, which gives the +5 attack vs AC 13 a 42% chance', () => {
    const range = rangeBand({ ...shortbow, distanceFt: 90 });
    expect(range).toEqual({ band: 'long', disadvantageReasons: ['Beyond normal range'] });
    const { mode } = resolveRollMode({ advantage: [], disadvantage: range.disadvantageReasons });
    expect(formatPercent(chance('attack', 5, 13, mode))).toBe('42%');
  });

  it('normal up to the normal range, out beyond the long range, and a hostile within 5 feet adds a reason', () => {
    expect(rangeBand({ ...shortbow, distanceFt: 80 }).band).toBe('normal');
    expect(rangeBand({ ...shortbow, distanceFt: 320 }).band).toBe('long');
    expect(rangeBand({ ...shortbow, distanceFt: 321 }).band).toBe('out');
    expect(rangeBand({ ...shortbow, distanceFt: 30, hostileWithin5ft: true })).toEqual({
      band: 'normal',
      disadvantageReasons: ['Hostile creature within 5 feet'],
    });
  });
});

describe('formatPercent', () => {
  it('rounds to whole percents but never shows a possible result as 0% or an uncertain one as 100%', () => {
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(0.4225)).toBe('42%');
    expect(formatPercent(0.0025)).toBe('<1%');
    expect(formatPercent(0.996)).toBe('>99%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0.005)).toBe('1%');
  });
});

describe('formatPoints and rollOutcome', () => {
  it('formats a change in chance as signed points', async () => {
    const { formatPoints } = await import('./core');
    expect(formatPoints(0.125)).toBe('+12 points'); // Bless: 'about 12 points'
    expect(formatPoints(0.12)).toBe('+12 points');
    expect(formatPoints(-0.125)).toBe('-12 points');
    expect(formatPoints(0.29)).toBe('+29 points');
    expect(formatPoints(0.01)).toBe('+1 point');
    expect(formatPoints(0)).toBe('0 points');
  });

  it('follows the server rules: attack 20 crits, attack 1 fumbles, checks have no automatic result', async () => {
    const { rollOutcome } = await import('./core');
    expect(rollOutcome({ kind: 'check', mode: 'advantage', dice: [5, 17], bonus: 0, target: 10 })).toMatchObject({
      kept: 17,
    });
    expect(rollOutcome({ kind: 'check', mode: 'disadvantage', dice: [5, 17], bonus: 0, target: 10 })).toMatchObject({
      kept: 5,
    });
    expect(rollOutcome({ kind: 'attack', mode: 'normal', dice: [20], bonus: 0, target: 30 })).toEqual({
      kept: 20,
      total: 20,
      success: true,
      crit: true,
      fumble: false,
    });
    expect(rollOutcome({ kind: 'attack', mode: 'normal', dice: [1], bonus: 30, target: 5 })).toEqual({
      kept: 1,
      total: 31,
      success: false,
      crit: false,
      fumble: true,
    });
    expect(rollOutcome({ kind: 'check', mode: 'normal', dice: [20], bonus: 0, target: 25 }).success).toBe(false);
    expect(rollOutcome({ kind: 'save', mode: 'normal', dice: [1], bonus: 10, target: 5 }).success).toBe(true);
    expect(rollOutcome({ kind: 'check', mode: 'normal', dice: [12], bonus: 3, target: null }).success).toBeNull();
  });
});
