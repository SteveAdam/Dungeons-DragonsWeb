import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { derive, rulesEngineInfo, type CharacterLike } from './index';

// The prototype character behind the demo sheet (replaced by computeSheet in P1-7).
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
};

describe('package', () => {
  it('describes itself (P0-1 placeholder)', () => {
    expect(rulesEngineInfo()).toEqual({ name: '@dnd-manager/rules-engine', editions: ['2014', '2024'] });
  });

  it('still derives the demo sheet character (legacy prototype)', () => {
    const result = derive(brannoc);
    expect(result.proficiencyBonus).toBe(3);
    expect(result.abilityModifiers.str).toBe(4);
    expect(result.armorClass).toBe(14 + 2 + 2);
    expect(result.level).toBe(5);
  });

  it('has no runtime dependencies (P1-1 acceptance 2)', () => {
    expect((pkg as { dependencies?: object }).dependencies ?? {}).toEqual({});
  });
});
