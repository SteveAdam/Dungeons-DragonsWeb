// The early prototype behind the demo character sheet (/sheet). P1-7 replaces it with computeSheet; until then it
// is kept here, built on the P1-1 core, so the demo keeps working. New code should not use it.
import { abilityModifier, levelFromXp, proficiencyBonus, type Ability } from './core';
import { SKILLS, type SkillKey } from './sheet';

export type AbilityName = Ability;
export type AbilityScoreMap = Record<AbilityName, number>;

export const ABILITIES: Array<{ key: AbilityName; label: string; short: string }> = [
  { key: 'str', label: 'Strength', short: 'STR' },
  { key: 'dex', label: 'Dexterity', short: 'DEX' },
  { key: 'con', label: 'Constitution', short: 'CON' },
  { key: 'int', label: 'Intelligence', short: 'INT' },
  { key: 'wis', label: 'Wisdom', short: 'WIS' },
  { key: 'cha', label: 'Charisma', short: 'CHA' },
];

export type CharacterLike = {
  name: string;
  className: string;
  background: string;
  level: number;
  xp: number;
  abilities: AbilityScoreMap;
  armor: number;
  hp: number;
  tempHp?: number;
  shield?: number;
  equipment?: string[];
  activeEffects?: string[];
  weapon?: string;
  weaponDamage?: string;
};

/** Prototype stats for the demo sheet: every skill counts as proficient, and the attacks are fixed. */
export function derive(character: CharacterLike) {
  const level = Math.max(1, character.level || levelFromXp(character.xp || 0));
  const proficiency = proficiencyBonus(level);
  const abilityMods = Object.fromEntries(
    ABILITIES.map(({ key }) => [key, abilityModifier(character.abilities[key])]),
  ) as Record<AbilityName, number>;

  const skills = Object.fromEntries(
    Object.entries(SKILLS).map(([key, details]) => [key, abilityMods[details.ability] + proficiency]),
  ) as Record<SkillKey, number>;

  return {
    ...character,
    level,
    proficiencyBonus: proficiency,
    initiative: abilityMods.dex,
    armorClass: character.armor + abilityMods.dex + (character.shield ?? 0),
    hp: character.hp + (character.tempHp ?? 0),
    passivePerception: 10 + abilityMods.wis,
    abilityModifiers: abilityMods,
    skills,
    attacks: [
      { label: 'Longsword', ability: 'str' as const, bonus: abilityMods.str + proficiency, damage: '1d8 + 4' },
      { label: 'Shortbow', ability: 'dex' as const, bonus: abilityMods.dex + proficiency, damage: '1d6 + 2' },
    ],
    activeEffects: character.activeEffects ?? [],
  };
}
