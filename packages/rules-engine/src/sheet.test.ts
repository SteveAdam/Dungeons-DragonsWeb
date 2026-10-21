import { describe, expect, it } from 'vitest';
import { BRANNOC, hillGiantStrength } from './fixtures';
import { computeSheet, type CharacterSheet } from './sheet';

const clock = { seconds: 10_000 };
const bonusOf = <T extends { bonus: number }>(list: T[], pick: (t: T) => boolean) => list.find(pick)!.bonus;

describe('golden fixture: Brannoc (P1-7)', () => {
  const s = computeSheet(BRANNOC, [], clock);
  const skill = (key: string) => bonusOf(s.skills, x => x.key === key);
  const save = (a: string) => bonusOf(s.saves, x => x.ability === a);
  const attack = (id: string) => s.attacks.find(a => a.id === id)!;

  it('level 5 from 6900 XP, proficiency +3, XP 6900 of 14000 for level 6', () => {
    expect(s.level).toBe(5);
    expect(s.proficiencyBonus).toBe(3);
    expect(s.xp).toEqual({
      total: 6900,
      level: 5,
      levelStartsAt: 6500,
      nextLevelAt: 14000,
      intoLevel: 400,
      toNext: 7100,
    });
  });

  it('modifiers +3 +1 +2 -1 0 0', () => {
    expect(['str', 'dex', 'con', 'int', 'wis', 'cha'].map(a => s.abilities[a as 'str'].modifier)).toEqual([
      3, 1, 2, -1, 0, 0,
    ]);
  });

  it('saves: Str +6, Dex +1, Con +5, Int -1, Wis 0, Cha 0', () => {
    expect(['str', 'dex', 'con', 'int', 'wis', 'cha'].map(save)).toEqual([6, 1, 5, -1, 0, 0]);
    expect(s.saves.filter(x => x.proficient).map(x => x.ability)).toEqual(['str', 'con']);
  });

  it('skills: Athletics +6, Intimidation +3, Perception +3, Survival +3, Acrobatics +1, Arcana -1, all 18 listed', () => {
    expect(skill('athletics')).toBe(6);
    expect(skill('intimidation')).toBe(3);
    expect(skill('perception')).toBe(3);
    expect(skill('survival')).toBe(3);
    expect(skill('acrobatics')).toBe(1);
    expect(skill('arcana')).toBe(-1);
    expect(s.skills).toHaveLength(18);
  });

  it('initiative +1, passive Perception 13, armour class 18, speed 25', () => {
    expect(s.initiative.bonus).toBe(1);
    expect(s.passivePerception).toBe(13);
    expect(s.armorClass.value).toBe(18);
    expect(s.armorClass.parts).toEqual([
      { label: 'Chain mail', value: 16 },
      { label: 'Dexterity', value: 0 },
      { label: 'Shield', value: 2 },
    ]);
    expect(s.speed.value).toBe(25);
  });

  it('Longsword +7 for 1d8+4 (Sap), Handaxe +6 for 1d6+3 (Vex), Greatsword locked (Str 16 vs 17)', () => {
    expect(attack('longsword')).toMatchObject({ bonus: 7, damage: '1d8+4', mastery: 'Sap', usable: true });
    expect(attack('handaxe')).toMatchObject({ bonus: 6, damage: '1d6+3', mastery: 'Vex', usable: true });
    expect(attack('greatsword-drowned')).toMatchObject({
      usable: false,
      lockReasons: ['Strength 17 needed, you have 16'],
    });
    expect(attack('longsword').breakdown).toEqual([
      { label: 'Strength', value: 3 },
      { label: 'Proficiency', value: 3 },
      { label: 'Magic', value: 1 },
    ]);
  });
});

describe('second fixture: Brannoc with Hill Giant Strength', () => {
  const potion = hillGiantStrength(clock.seconds);
  const s = computeSheet(BRANNOC, [potion], clock);

  it('Str 21 (+5), Athletics +8, Longsword +9 for 1d8+6', () => {
    expect(s.abilities.str).toMatchObject({ base: 16, score: 21, modifier: 5, applied: [potion] });
    expect(s.skills.find(x => x.key === 'athletics')!.bonus).toBe(8);
    expect(s.attacks.find(a => a.id === 'longsword')).toMatchObject({ bonus: 9, damage: '1d8+6' });
  });

  it('the Greatsword is usable thanks to the potion, which ends in an hour', () => {
    expect(s.attacks.find(a => a.id === 'greatsword-drowned')).toMatchObject({
      usable: true,
      lockReasons: [],
      unlockedBy: { id: potion.id, name: 'Potion of Hill Giant Strength', expiresAtSeconds: clock.seconds + 3600 },
    });
    expect(s.activeEffects).toEqual([potion]);
  });

  it('when the hour is up, everything is back to normal', () => {
    const later = computeSheet(BRANNOC, [potion], { seconds: clock.seconds + 3600 });
    expect(later.abilities.str.score).toBe(16);
    expect(later.attacks.find(a => a.id === 'greatsword-drowned')!.usable).toBe(false);
    expect(later.activeEffects).toEqual([]);
  });
});

describe('third fixture: Brannoc poisoned', () => {
  it('the numbers do not change, and the sheet lists the condition', () => {
    const plain = computeSheet(BRANNOC, [], clock);
    const poisoned = computeSheet(BRANNOC, [], clock, { conditions: ['poisoned'], exhaustion: 0 });
    expect({ ...poisoned, conditionNotes: [] }).toEqual(plain);
    expect(poisoned.conditionNotes).toEqual([expect.stringMatching(/^Poisoned: /)]);
  });
});

describe('other rules', () => {
  const base = BRANNOC;
  it('expertise doubles the proficiency bonus', () => {
    const s = computeSheet({ ...base, expertise: ['athletics'] }, [], clock);
    expect(s.skills.find(x => x.key === 'athletics')).toMatchObject({
      bonus: 3 + 6,
      expertise: true,
      proficient: true,
    });
  });

  it('no armour is 10 + Dexterity; light armour has no Dexterity cap', () => {
    const nimble: CharacterSheet = { ...base, abilityScores: { ...base.abilityScores, dex: 18 }, shield: false };
    expect(computeSheet({ ...nimble, armor: null }, [], clock).armorClass.value).toBe(14);
    expect(
      computeSheet({ ...nimble, armor: { name: 'Leather', base: 11, dexCap: null } }, [], clock).armorClass.value,
    ).toBe(15);
    expect(
      computeSheet({ ...nimble, armor: { name: 'Half plate', base: 15, dexCap: 2 } }, [], clock).armorClass.value,
    ).toBe(17);
  });

  it('heavy armour without the Strength costs 10 feet of speed', () => {
    const weak = { ...base, abilityScores: { ...base.abilityScores, str: 12 } };
    expect(computeSheet(weak, [], clock).speed).toMatchObject({ value: 15, base: 25, armorPenaltyFt: 10 });
  });

  it('finesse uses the higher of Strength and Dexterity', () => {
    const rogue: CharacterSheet = {
      ...base,
      abilityScores: { ...base.abilityScores, dex: 18 },
      weapons: [
        {
          id: 'rapier',
          name: 'Rapier',
          ability: 'finesse',
          proficient: true,
          magicBonus: 0,
          damage: '1d8',
          damageType: 'piercing',
        },
      ],
    };
    expect(computeSheet(rogue, [], clock).attacks[0]).toMatchObject({ ability: 'dex', bonus: 4 + 3, damage: '1d8+4' });
  });

  it('never changes its input', () => {
    const frozen = JSON.parse(JSON.stringify(BRANNOC));
    computeSheet(BRANNOC, [hillGiantStrength(0)], clock);
    expect(BRANNOC).toEqual(frozen);
  });
});
