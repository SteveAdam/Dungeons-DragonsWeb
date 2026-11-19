// P4-6: a check's skill or ability in words ("Persuasion", "Wisdom save").
import { ABILITY_LABELS, SKILLS, type Ability, type SkillKey } from '@dnd-manager/rules-engine';

export function checkName(key: string, kind: 'check' | 'save' = 'check'): string {
  const name =
    key in SKILLS ? SKILLS[key as SkillKey].label : key in ABILITY_LABELS ? ABILITY_LABELS[key as Ability].label : key;
  return kind === 'save' ? `${name} save` : name;
}

export const DISPOSITION_WORDS = { friendly: 'Friendly', indifferent: 'Indifferent', hostile: 'Hostile' } as const;
