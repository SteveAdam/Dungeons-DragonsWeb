import type { CreationChoices } from '@dnd-manager/rules-engine';

/** A new character before any choice: the standard array, +1 to each background ability, option A kits. */
export function blankChoices(): CreationChoices {
  return {
    name: '',
    species: '',
    class: '',
    background: '',
    abilities: { method: 'standard', base: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } },
    backgroundBonus: { plusOneEach: true },
    skills: [],
    equipment: { class: 'A', background: 'A' },
    spells: { cantrips: [], prepared: [], spellbook: [] },
    alignment: '',
    details: { personalityTraits: '', ideals: '', bonds: '', flaws: '', appearance: '', backstory: '' },
  };
}
