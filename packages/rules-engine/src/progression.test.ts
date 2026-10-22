import { describe, expect, it } from 'vitest';
import { abilityModifier } from './core';
import { applyBackground, classProgression, hitPointsAtLevel1, hitPointsGain, type ClassDef } from './progression';

const scores = { str: 15, dex: 14, con: 13, int: 8, wis: 12, cha: 10 };

describe('hit points (SRD 5.2.1)', () => {
  it('a level 1 Fighter with Constitution 14 and a d10 has 12', () => {
    expect(hitPointsAtLevel1('d10', abilityModifier(14))).toBe(12);
  });

  it('the level 2 average gain for a d10 with Constitution +2 is 8 (6 plus 2)', () => {
    expect(hitPointsGain('d10', 2, 'average')).toBe(8);
  });

  it('the fixed value is half the die plus 1 for every die', () => {
    expect(['d6', 'd8', 'd10', 'd12'].map(d => hitPointsGain(d as 'd6', 0, 'average'))).toEqual([4, 5, 6, 7]);
  });

  it('a rolled gain uses the roll, and a level never adds less than 1', () => {
    expect(hitPointsGain('d12', 1, 'rolled', 9)).toBe(10);
    expect(hitPointsGain('d6', -3, 'rolled', 1)).toBe(1);
    expect(hitPointsGain('d6', -5, 'average')).toBe(1);
    expect(hitPointsAtLevel1('d6', -5)).toBe(1);
  });

  it('refuses a roll the die cannot make', () => {
    expect(() => hitPointsGain('d8', 0, 'rolled')).toThrow(RangeError);
    expect(() => hitPointsGain('d8', 0, 'rolled', 9)).toThrow(RangeError);
    expect(() => hitPointsGain('d8', 0, 'rolled', 0)).toThrow(RangeError);
    expect(() => hitPointsGain('d8', 0, 'rolled', 2.5)).toThrow(RangeError);
  });
});

describe('applyBackground (SRD 5.2.1: +2 and +1, or +1 to all three, none above 20)', () => {
  const soldier = { name: 'Soldier', abilityScores: ['str', 'dex', 'con'] as const };

  it('gives +2 to one listed ability and +1 to another', () => {
    expect(applyBackground(scores, soldier, { plus2: 'str', plus1: 'con' })).toEqual({ ...scores, str: 17, con: 14 });
  });

  it('or +1 to each of the three', () => {
    expect(applyBackground(scores, soldier, { plusOneEach: true })).toEqual({ ...scores, str: 16, dex: 15, con: 14 });
  });

  it('does not change the scores passed in', () => {
    applyBackground(scores, soldier, { plusOneEach: true });
    expect(scores.str).toBe(15);
  });

  it('refuses an ability the background does not list, or both increases on one ability', () => {
    expect(() => applyBackground(scores, soldier, { plus2: 'wis', plus1: 'str' })).toThrow(/can raise only/);
    expect(() => applyBackground(scores, soldier, { plus2: 'str', plus1: 'str' })).toThrow(/two different/);
  });

  it('refuses to raise a score above 20, and allows exactly 20', () => {
    expect(() => applyBackground({ ...scores, str: 19 }, soldier, { plus2: 'str', plus1: 'dex' })).toThrow(
      /most is 20/,
    );
    expect(applyBackground({ ...scores, str: 18 }, soldier, { plus2: 'str', plus1: 'dex' }).str).toBe(20);
    expect(() => applyBackground({ ...scores, con: 20 }, soldier, { plusOneEach: true })).toThrow(/most is 20/);
  });

  it('a background must list three different abilities', () => {
    expect(() =>
      applyBackground(scores, { name: 'Odd', abilityScores: ['str', 'str', 'dex'] }, { plusOneEach: true }),
    ).toThrow(RangeError);
  });
});

const feature = (level: number, name: string) => ({ level, name, description: `${name} text` });
const tester: ClassDef = {
  id: 'tester',
  name: 'Tester',
  hitDie: 'd8',
  levels: [
    { level: 1, proficiencyBonus: 2, features: [feature(1, 'First')], columns: { uses: 2 } },
    { level: 2, proficiencyBonus: 2, features: [feature(2, 'Second')], columns: { uses: 2 } },
    { level: 3, proficiencyBonus: 2, features: [feature(3, 'Tester Subclass')], columns: { uses: 3 } },
  ],
  subclasses: [{ id: 'path', name: 'Path', features: [feature(3, 'Path Feature')] }],
};

describe('classProgression', () => {
  it('gives the features, proficiency bonus and table columns of a level', () => {
    const p = classProgression(tester, 2);
    expect(p.proficiencyBonus).toBe(2);
    expect(p.features.map(f => f.name)).toEqual(['Second']);
    expect(p.featuresSoFar.map(f => f.name)).toEqual(['First', 'Second']);
    expect(p.columns).toEqual({ uses: 2 });
  });

  it("adds the subclass's features once one is chosen", () => {
    expect(classProgression(tester, 3).features.map(f => f.name)).toEqual(['Tester Subclass']);
    expect(classProgression(tester, 3, 'path').features.map(f => f.name)).toEqual(['Tester Subclass', 'Path Feature']);
    expect(classProgression(tester, 3, 'path').featuresSoFar).toHaveLength(4);
  });

  it('refuses levels the data does not cover, and unknown subclasses', () => {
    expect(() => classProgression(tester, 4)).toThrow('Tester is described for levels 1 to 3, not 4');
    expect(() => classProgression(tester, 0)).toThrow(RangeError);
    expect(() => classProgression(tester, 1.5)).toThrow(RangeError);
    expect(() => classProgression(tester, 3, 'nope')).toThrow(RangeError);
  });
});
