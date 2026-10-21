import { describe, expect, it } from 'vitest';
import { abilityModifier, derive, proficiencyBonus, rulesEngineInfo, successChance, type CharacterLike } from './index';

// A level 5 fighter (the same one the web app's demo sheet uses).
const brannoc: CharacterLike = {
  name: 'Brannoc',
  className: 'Fighter',
  background: 'Veteran scout',
  level: 5,
  xp: 6500,
  abilities: { str: 18, dex: 14, con: 16, int: 10, wis: 12, cha: 11 },
  armor: 14,
  hp: 34,
  tempHp: 0,
  shield: 2,
  equipment: ['Longsword', 'Shield', 'Shortbow', 'Explorer’s pack'],
  activeEffects: [],
  weapon: 'Longsword',
  weaponDamage: '1d8 + 4',
};

describe('rules', () => {
  it('describes itself (P0-1 placeholder)', () => {
    expect(rulesEngineInfo()).toEqual({ name: '@dnd-manager/rules-engine', editions: ['2014', '2024'] });
  });

  it('calculates modifiers and proficiency', () => {
    expect(abilityModifier(16)).toBe(3);
    expect(abilityModifier(14)).toBe(2);
    expect(proficiencyBonus(5)).toBe(3);
  });

  it('calculates success chance for normal and advantage conditions', () => {
    expect(successChance(15, 6)).toBeCloseTo(0.6, 3);
    expect(successChance(15, 6, true)).toBeGreaterThan(successChance(15, 6));
    expect(successChance(15, 6, false, true)).toBeLessThan(successChance(15, 6));
  });

  it('derives the sample character from raw scores', () => {
    const result = derive(brannoc);
    expect(result.proficiencyBonus).toBe(3);
    expect(result.abilityModifiers.str).toBe(4);
    expect(result.armorClass).toBe(14 + 2 + 2);
    expect(result.level).toBe(5);
  });
});
