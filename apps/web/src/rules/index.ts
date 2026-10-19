export type AbilityName = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'
export type SkillKey =
  | 'acrobatics'
  | 'animalHandling'
  | 'arcana'
  | 'athletics'
  | 'deception'
  | 'history'
  | 'insight'
  | 'intimidation'
  | 'investigation'
  | 'medicine'
  | 'nature'
  | 'perception'
  | 'performance'
  | 'persuasion'
  | 'religion'
  | 'sleightOfHand'
  | 'stealth'
  | 'survival'

export type AbilityScoreMap = Record<AbilityName, number>

export const ABILITIES: Array<{ key: AbilityName; label: string; short: string }> = [
  { key: 'str', label: 'Strength', short: 'STR' },
  { key: 'dex', label: 'Dexterity', short: 'DEX' },
  { key: 'con', label: 'Constitution', short: 'CON' },
  { key: 'int', label: 'Intelligence', short: 'INT' },
  { key: 'wis', label: 'Wisdom', short: 'WIS' },
  { key: 'cha', label: 'Charisma', short: 'CHA' },
]

export const SKILLS: Record<SkillKey, { label: string; ability: AbilityName }> = {
  acrobatics: { label: 'Acrobatics', ability: 'dex' },
  animalHandling: { label: 'Animal Handling', ability: 'wis' },
  arcana: { label: 'Arcana', ability: 'int' },
  athletics: { label: 'Athletics', ability: 'str' },
  deception: { label: 'Deception', ability: 'cha' },
  history: { label: 'History', ability: 'int' },
  insight: { label: 'Insight', ability: 'wis' },
  intimidation: { label: 'Intimidation', ability: 'cha' },
  investigation: { label: 'Investigation', ability: 'int' },
  medicine: { label: 'Medicine', ability: 'wis' },
  nature: { label: 'Nature', ability: 'int' },
  perception: { label: 'Perception', ability: 'wis' },
  performance: { label: 'Performance', ability: 'cha' },
  persuasion: { label: 'Persuasion', ability: 'cha' },
  religion: { label: 'Religion', ability: 'int' },
  sleightOfHand: { label: 'Sleight of Hand', ability: 'dex' },
  stealth: { label: 'Stealth', ability: 'dex' },
  survival: { label: 'Survival', ability: 'wis' },
}

export const EXPERIENCE_TABLE = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
]

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

export function proficiencyBonus(level: number): number {
  return Math.max(2, 2 + Math.floor((level - 1) / 4))
}

export function levelFromExperience(xp: number): number {
  let level = 1
  for (let i = 1; i < EXPERIENCE_TABLE.length; i += 1) {
    if (xp >= EXPERIENCE_TABLE[i]) {
      level = i + 1
    }
  }
  return Math.min(level, 20)
}

export function xpToNextLevel(level: number): number {
  const safeLevel = Math.max(1, Math.min(level, EXPERIENCE_TABLE.length))
  const current = safeLevel > 1 ? EXPERIENCE_TABLE[safeLevel - 2] : 0
  const next = EXPERIENCE_TABLE[Math.min(safeLevel - 1, EXPERIENCE_TABLE.length - 1)]
  return Math.max(0, next - current)
}

export function armorClass(base: number, dexModifier: number, shieldBonus = 0): number {
  return base + dexModifier + shieldBonus
}

export function rangedAttackBonus(abilityScore: number, level: number, bonus = 0): number {
  return abilityModifier(abilityScore) + proficiencyBonus(level) + bonus
}

export function successChance(
  dc: number,
  bonus: number,
  advantage = false,
  disadvantage = false,
): number {
  if (advantage && disadvantage) {
    return successChance(dc, bonus)
  }

  const rolls = Array.from({ length: 20 }, (_, index) => index + 1)
  let successes = 0

  if (advantage || disadvantage) {
    for (const first of rolls) {
      for (const second of rolls) {
        const roll = advantage ? Math.max(first, second) : Math.min(first, second)
        if (roll + bonus >= dc) {
          successes += 1
        }
      }
    }
    return successes / 400
  }

  for (const roll of rolls) {
    if (roll + bonus >= dc) {
      successes += 1
    }
  }

  return successes / 20
}

export function resolveRoll(
  roll: number,
  bonus: number,
  dc: number,
  options: { advantage?: boolean; disadvantage?: boolean } = {},
): {
  roll: number
  bonus: number
  dc: number
  total: number
  success: boolean
  natural20: boolean
  natural1: boolean
  advantage: boolean
  disadvantage: boolean
  chance: number
} {
  const total = roll + bonus
  const success = total >= dc
  return {
    roll,
    bonus,
    dc,
    total,
    success,
    natural20: roll === 20,
    natural1: roll === 1,
    advantage: !!options.advantage,
    disadvantage: !!options.disadvantage,
    chance: successChance(dc, bonus, options.advantage, options.disadvantage),
  }
}

export function meetsRequirement(score: number, requirement: number): boolean {
  return score >= requirement
}

export function applyEffect<T extends Record<string, unknown>>(character: T, effect: string): T {
  const result = { ...character }

  if (effect === 'potion-of-heroism') {
    return {
      ...result,
      activeEffects: [...((result as Record<string, unknown>).activeEffects as string[] | undefined ?? []), effect],
      hpBonus: ((result as Record<string, unknown>).hpBonus as number | undefined ?? 0) + 10,
    } as T
  }

  if (effect === 'bless') {
    return {
      ...result,
      activeEffects: [...((result as Record<string, unknown>).activeEffects as string[] | undefined ?? []), effect],
      bless: true,
    } as T
  }

  return result
}

export type CharacterLike = {
  name: string
  className: string
  background: string
  level: number
  xp: number
  abilities: AbilityScoreMap
  armor: number
  hp: number
  tempHp?: number
  shield?: number
  equipment?: string[]
  activeEffects?: string[]
  weapon?: string
  weaponDamage?: string
}

export function derive(character: CharacterLike) {
  const level = Math.max(1, character.level || levelFromExperience(character.xp || 0))
  const proficiency = proficiencyBonus(level)
  const abilityMods = Object.fromEntries(
    ABILITIES.map(({ key }) => [key, abilityModifier(character.abilities[key])]),
  ) as Record<AbilityName, number>

  const armorClass = CharacterArmor(character.armor, abilityMods.dex, character.shield ?? 0)

  const skills = Object.fromEntries(
    Object.entries(SKILLS).map(([key, details]) => {
      const name = key as SkillKey
      const bonus = abilityMods[details.ability] + proficiency
      return [name, bonus]
    }),
  ) as Record<SkillKey, number>

  const attacks = [
    {
      label: 'Longsword',
      ability: 'str' as const,
      bonus: abilityMods.str + proficiency,
      damage: '1d8 + 4',
    },
    {
      label: 'Shortbow',
      ability: 'dex' as const,
      bonus: abilityMods.dex + proficiency,
      damage: '1d6 + 2',
    },
  ]

  return {
    ...character,
    level,
    proficiencyBonus: proficiency,
    initiative: abilityMods.dex,
    armorClass,
    hp: character.hp + (character.tempHp ?? 0),
    passivePerception: 10 + abilityMods.wis,
    abilityModifiers: abilityMods,
    skills,
    attacks,
    activeEffects: character.activeEffects ?? [],
  }
}

export function CharacterArmor(baseArmor: number, dexterityModifier: number, shieldBonus = 0): number {
  return armorClass(baseArmor, dexterityModifier, shieldBonus)
}

export default {
  ABILITIES,
  SKILLS,
  EXPERIENCE_TABLE,
  abilityModifier,
  proficiencyBonus,
  levelFromExperience,
  xpToNextLevel,
  armorClass,
  rangedAttackBonus,
  successChance,
  resolveRoll,
  meetsRequirement,
  derive,
}
