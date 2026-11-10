import { describe, expect, it } from 'vitest';
import {
  averageDamage,
  challengeValue,
  damagePerRound,
  parseDice,
  parseHitDice,
  xpForChallengeRating,
  type MonsterDamageLike,
} from './monsters';

describe('dice notation', () => {
  it('reads dice with a bonus, a penalty, on their own, and flat numbers', () => {
    expect(parseDice('20d10 + 40')).toEqual({ count: 20, sides: 10, bonus: 40 });
    expect(parseDice('1d4 - 1')).toEqual({ count: 1, sides: 4, bonus: -1 });
    expect(parseDice('1d4 − 1')).toEqual({ count: 1, sides: 4, bonus: -1 });
    expect(parseDice('2d8')).toEqual({ count: 2, sides: 8, bonus: 0 });
    expect(parseDice('5')).toEqual({ count: 0, sides: 0, bonus: 5 });
  });

  it('refuses anything else', () => {
    expect(parseDice('')).toBeNull();
    expect(parseDice('d8')).toBeNull();
    expect(parseDice('2d6 5')).toBeNull();
    expect(() => averageDamage('a lot')).toThrow('Not a dice expression');
  });

  it('averages exactly', () => {
    expect(averageDamage('2d6 + 5')).toBe(12);
    expect(averageDamage('1d4')).toBe(2.5);
    expect(averageDamage('1')).toBe(1);
  });

  it('hit dice average as the SRD prints them, rounded down', () => {
    expect(parseHitDice('20d10 + 40')).toEqual({ count: 20, sides: 10, bonus: 40, average: 150 });
    expect(parseHitDice('2d8 + 2').average).toBe(11);
    expect(parseHitDice('1d4 - 1').average).toBe(1);
    expect(() => parseHitDice('many')).toThrow('Not a hit dice expression');
  });
});

describe('challenge ratings', () => {
  it('gives the XP from the SRD table, and null for a rating that does not exist', () => {
    expect(xpForChallengeRating('1/4')).toBe(50);
    expect(xpForChallengeRating('10')).toBe(5900);
    expect(xpForChallengeRating('30')).toBe(155000);
    expect(xpForChallengeRating('31')).toBeNull();
  });

  it('turns printed fractions into numbers', () => {
    expect(challengeValue('1/8')).toBe(0.125);
    expect(challengeValue('1/2')).toBe(0.5);
    expect(challengeValue('12')).toBe(12);
  });
});

describe('damage per round', () => {
  const attack = (name: string, dice: string, limited?: boolean) => ({
    name,
    damage: [{ dice }],
    ...(limited ? { limited } : {}),
  });
  const monster = (multi: string | null, attacks: MonsterDamageLike['attacks']): MonsterDamageLike => ({
    actions: multi ? [{ name: 'Multiattack', description: multi }] : [],
    attacks,
  });
  const rend = attack('Rend', '2d6 + 5'); // 12
  const bite = attack('Bite', '1d8 + 4'); // 8.5

  it('is the best single attack with no Multiattack', () => {
    expect(damagePerRound(monster(null, [rend, bite]))).toBe(12);
  });

  it('counts a repeated attack', () => {
    expect(damagePerRound(monster('The ogre makes two Rend attacks.', [rend, bite]))).toBe(24);
  });

  it('adds different attacks with their own counts', () => {
    expect(damagePerRound(monster('The beast makes one Bite attack and two Rend attacks.', [rend, bite]))).toBe(32.5);
  });

  it('takes the better of "Rend or Bite"', () => {
    expect(damagePerRound(monster('The beast makes three Rend or Bite attacks.', [rend, bite]))).toBe(36);
  });

  it('reads "two attacks, using ... in any combination"', () => {
    expect(
      damagePerRound(monster('The beast makes two attacks, using Bite or Rend in any combination.', [rend, bite])),
    ).toBe(24);
  });

  it('adds what it "uses" once, when that is available every round', () => {
    const memories = attack('Consume Memories', '3d6'); // 10.5
    expect(
      damagePerRound(monster('The aboleth makes two Rend attacks and uses Consume Memories.', [rend, memories])),
    ).toBe(34.5);
    const limited = attack('Consume Memories', '3d6', true);
    expect(
      damagePerRound(monster('The aboleth makes two Rend attacks and uses Consume Memories.', [rend, limited])),
    ).toBe(24);
  });

  it('adds a named attack to "other attacks, using ..."', () => {
    expect(
      damagePerRound(
        monster('It makes one Rend attack and three other attacks, using Bite or Rend in any combination.', [
          rend,
          bite,
        ]),
      ),
    ).toBe(48);
  });

  it('counts attacks per head from the traits', () => {
    expect(
      damagePerRound({
        ...monster('The hydra makes as many Bite attacks as it has heads.', [bite]),
        traits: [{ description: 'The hydra has five heads.' }],
      }),
    ).toBe(42.5);
  });

  it('is never below the best single attack', () => {
    expect(damagePerRound(monster('It makes two Bite attacks.', [bite, attack('Maul', '6d6')]))).toBe(21);
  });

  it('adds every damage in an attack', () => {
    const flaming = { name: 'Slam', damage: [{ dice: '2d6 + 5' }, { dice: '2d6' }] };
    expect(damagePerRound(monster(null, [flaming]))).toBe(19);
  });

  it('prefers what is available every round, but uses a limited attack if that is all', () => {
    const breath = attack('Breath', '12d6', true);
    expect(damagePerRound(monster(null, [bite, breath]))).toBe(8.5);
    expect(damagePerRound(monster(null, [breath]))).toBe(42);
  });

  it('falls back to the best attack when Multiattack names nothing it can read', () => {
    expect(damagePerRound(monster('The beast attacks wildly.', [rend, bite]))).toBe(12);
  });

  it('is zero with no attacks', () => {
    expect(damagePerRound(monster(null, []))).toBe(0);
  });
});
