import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPAWN_RULE,
  hourOfDay,
  isDaytime,
  spawnRuleSummary,
  validateSpawnRule,
  type SpawnRule,
} from './encounters';

const rule = (over: Partial<SpawnRule>): SpawnRule => ({ ...DEFAULT_SPAWN_RULE, ...over });

describe('spawnRuleSummary', () => {
  it.each([
    [
      rule({ mode: 'chance', chance: 35, timeOfDay: 'night', count: { min: 1, max: 3 } }),
      '35% chance, at night, 1 to 3',
    ],
    [rule({ mode: 'chance', chance: 10, timeOfDay: 'day', count: { min: 2, max: 2 } }), '10% chance, by day, 2'],
    [rule({ mode: 'chance', chance: 50, timeOfDay: 'any', count: { min: 0, max: 4 } }), '50% chance, any time, 0 to 4'],
    [rule({ mode: 'always', count: { min: 2, max: 2 } }), 'Always, any time, 2'],
    [rule({ mode: 'time', timeOfDay: 'night', count: { min: 1, max: 4 } }), 'Only at night, 1 to 4'],
    [rule({ mode: 'always', timeOfDay: 'day' }), 'Only by day, 1'],
    [rule({ mode: 'time', timeOfDay: 'any' }), 'Always, any time, 1'],
  ])('%j reads "%s"', (r, text) => {
    expect(spawnRuleSummary(r)).toBe(text);
  });
});

describe('validateSpawnRule', () => {
  it('accepts the default and a full chance rule', () => {
    expect(validateSpawnRule(DEFAULT_SPAWN_RULE)).toEqual([]);
    expect(validateSpawnRule(rule({ mode: 'chance', chance: 100, count: { min: 0, max: 100 } }))).toEqual([]);
  });

  it('refuses chances outside 0 to 100, fractions, and a count with min above max', () => {
    expect(validateSpawnRule(rule({ chance: 135 }))).toEqual(['The chance is a whole number from 0 to 100.']);
    expect(validateSpawnRule(rule({ chance: 12.5 }))).toEqual(['The chance is a whole number from 0 to 100.']);
    expect(validateSpawnRule(rule({ count: { min: 3, max: 1 } }))).toEqual([
      'The smallest count cannot be more than the largest.',
    ]);
    expect(validateSpawnRule(rule({ count: { min: -1, max: 1 } }))).toEqual([
      'The count is a whole number from 0 to 100.',
    ]);
  });
});

describe('day and night', () => {
  it('reads the hour from the game clock', () => {
    expect(hourOfDay(0)).toBe(0);
    expect(hourOfDay(12 * 3600 + 59 * 60)).toBe(12);
    expect(hourOfDay(25 * 3600)).toBe(1);
  });

  it('daylight runs from the start hour up to the end hour (default 6 to 18)', () => {
    expect([5, 6, 12, 17, 18, 23].map(h => isDaytime(h))).toEqual([false, true, true, true, false, false]);
  });

  it('wraps past midnight when the start is after the end', () => {
    expect([23, 2, 4, 12].map(h => isDaytime(h, { start: 20, end: 4 }))).toEqual([true, true, false, false]);
  });
});
