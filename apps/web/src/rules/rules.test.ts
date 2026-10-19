import { describe, expect, it } from 'vitest'
import { abilityModifier, derive, proficiencyBonus, successChance } from './index'
import { brannoc } from '../sample'

describe('rules', () => {
  it('calculates modifiers and proficiency', () => {
    expect(abilityModifier(16)).toBe(3)
    expect(abilityModifier(14)).toBe(2)
    expect(proficiencyBonus(5)).toBe(3)
  })

  it('calculates success chance for normal and advantage conditions', () => {
    expect(successChance(15, 6)).toBeCloseTo(0.6, 3)
    expect(successChance(15, 6, true)).toBeGreaterThan(successChance(15, 6))
    expect(successChance(15, 6, false, true)).toBeLessThan(successChance(15, 6))
  })

  it('derives the sample character from raw scores', () => {
    const result = derive(brannoc)
    expect(result.proficiencyBonus).toBe(3)
    expect(result.abilityModifiers.str).toBe(4)
    expect(result.armorClass).toBe(14 + 2 + 2)
    expect(result.level).toBe(5)
  })
})
