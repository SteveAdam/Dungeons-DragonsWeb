import { describe, expect, it } from 'vitest';
import type { Effect, GameClock } from './effects';
import { checkRequirements, whoCanUse, type AbilityScores, type RequirementItem } from './requirements';

const clock: GameClock = { seconds: 1000 };
const scores = (str: number): AbilityScores => ({ str, dex: 12, con: 15, int: 9, wis: 11, cha: 10 });

const greatsword: RequirementItem = {
  id: 'greatsword-drowned',
  name: 'Greatsword of the Drowned',
  requirements: [{ stat: 'str', min: 17, onUnmet: 'lock' }],
};
const chainMail: RequirementItem = {
  id: 'chain-mail',
  name: 'Chain mail',
  requirements: [{ stat: 'str', min: 13, onUnmet: 'speed_penalty', penaltyFt: 10 }],
};
const hillGiant: Effect = {
  id: 'hill-giant',
  name: 'Potion of Hill Giant Strength',
  source: 'Potion',
  stat: 'str',
  mode: 'set_at_least',
  value: 21,
  duration: { kind: 'until', atSeconds: clock.seconds + 3600 },
};

const brannoc = { id: 'brannoc', name: 'Brannoc', baseScores: scores(16), effects: [] as Effect[] };
const sera = { id: 'sera', name: 'Sera', baseScores: scores(8), effects: [] as Effect[] };

describe('checkRequirements', () => {
  it('Brannoc (Str 16) cannot use the Greatsword of the Drowned (Str 17)', () => {
    expect(checkRequirements(greatsword, brannoc.baseScores, [], clock)).toEqual({
      usable: false,
      results: [{ stat: 'str', required: 17, actual: 16, base: 16, met: false }],
      speedPenaltyFt: 0,
    });
  });

  it('with Hill Giant Strength he can, and the potion is named with its end time', () => {
    const r = checkRequirements(greatsword, brannoc.baseScores, [hillGiant], clock);
    expect(r.usable).toBe(true);
    expect(r.results[0]).toMatchObject({ actual: 21, base: 16, met: true });
    expect(r.results[0].metByEffect).toEqual({
      id: 'hill-giant',
      name: 'Potion of Hill Giant Strength',
      expiresAtSeconds: 4600,
    });
  });

  it('once the potion wears off he is locked out again', () => {
    expect(checkRequirements(greatsword, brannoc.baseScores, [hillGiant], { seconds: 4600 }).usable).toBe(false);
  });

  it('chain mail never locks: Str 12 is usable with a 10 ft speed penalty, Str 13 has none', () => {
    expect(checkRequirements(chainMail, scores(12), [], clock)).toMatchObject({ usable: true, speedPenaltyFt: 10 });
    expect(checkRequirements(chainMail, scores(13), [], clock)).toMatchObject({ usable: true, speedPenaltyFt: 0 });
  });

  it('a score already high enough is plain usable, without effect credit', () => {
    expect(checkRequirements(greatsword, scores(18), [hillGiant], clock).results[0].metByEffect).toBeUndefined();
  });
});

describe('whoCanUse', () => {
  it('sorts the party into locked, usable and usable with an effect', () => {
    const strongOne = { id: 'thrain', name: 'Thrain', baseScores: scores(18), effects: [] };
    const boosted = { ...brannoc, effects: [hillGiant] };
    const result = whoCanUse(greatsword, [brannoc, sera, strongOne, boosted], clock);
    expect(result.map(r => [r.name, r.state])).toEqual([
      ['Brannoc', 'locked'],
      ['Sera', 'locked'],
      ['Thrain', 'usable'],
      ['Brannoc', 'usable_with_effect'],
    ]);
    expect(result[1].check.results[0].actual).toBe(8);
  });
});
