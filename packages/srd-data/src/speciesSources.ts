// P2-4: the names of each species' traits in the order the SRD gives them, so trait lines can be told from the
// option lines inside a trait ("Forest Gnome.", "Cloud’s Jaunt (Cloud Giant)."), and a decision on each trait's
// mechanics. The converter checks every name against the SRD text; nothing here is rules data.

export interface SpeciesTable {
  title: string;
  columns: string[];
  /**
   * 'pairs': two pairs of cells per line ("Black Acid Gold Fire"), the left column first.
   * 'lineage': a name and its level 1 text, then a line with the level 3 and level 5 spells.
   */
  kind: 'pairs' | 'lineage';
}

export interface SpeciesSource {
  id: string;
  name: string;
  traits: string[];
  /** Tables inside a trait, by trait name. */
  tables?: Record<string, SpeciesTable>;
  /** Every trait must be listed. */
  mechanics: Record<string, 'later' | 'none'>;
}

/** All species traits have game mechanics the app does not run yet. */
const later = (...names: string[]) => Object.fromEntries(names.map(n => [n, 'later' as const]));

export const SPECIES_PAGES = '83-86';

export const SPECIES_SOURCES: SpeciesSource[] = [
  {
    id: 'dragonborn',
    name: 'Dragonborn',
    traits: ['Draconic Ancestry', 'Breath Weapon', 'Damage Resistance', 'Darkvision', 'Draconic Flight'],
    tables: {
      'Draconic Ancestry': { title: 'Draconic Ancestors', columns: ['Dragon', 'Damage Type'], kind: 'pairs' },
    },
    mechanics: later('Draconic Ancestry', 'Breath Weapon', 'Damage Resistance', 'Darkvision', 'Draconic Flight'),
  },
  {
    id: 'dwarf',
    name: 'Dwarf',
    traits: ['Darkvision', 'Dwarven Resilience', 'Dwarven Toughness', 'Stonecunning'],
    mechanics: later('Darkvision', 'Dwarven Resilience', 'Dwarven Toughness', 'Stonecunning'),
  },
  {
    id: 'elf',
    name: 'Elf',
    traits: ['Darkvision', 'Elven Lineage', 'Fey Ancestry', 'Keen Senses', 'Trance'],
    tables: {
      'Elven Lineage': {
        title: 'Elven Lineages',
        columns: ['Lineage', 'Level 1', 'Level 3', 'Level 5'],
        kind: 'lineage',
      },
    },
    mechanics: later('Darkvision', 'Elven Lineage', 'Fey Ancestry', 'Keen Senses', 'Trance'),
  },
  {
    id: 'gnome',
    name: 'Gnome',
    traits: ['Darkvision', 'Gnomish Cunning', 'Gnomish Lineage'],
    mechanics: later('Darkvision', 'Gnomish Cunning', 'Gnomish Lineage'),
  },
  {
    id: 'goliath',
    name: 'Goliath',
    traits: ['Giant Ancestry', 'Large Form', 'Powerful Build'],
    mechanics: later('Giant Ancestry', 'Large Form', 'Powerful Build'),
  },
  {
    id: 'halfling',
    name: 'Halfling',
    traits: ['Brave', 'Halfling Nimbleness', 'Luck', 'Naturally Stealthy'],
    mechanics: later('Brave', 'Halfling Nimbleness', 'Luck', 'Naturally Stealthy'),
  },
  {
    id: 'human',
    name: 'Human',
    traits: ['Resourceful', 'Skillful', 'Versatile'],
    mechanics: later('Resourceful', 'Skillful', 'Versatile'),
  },
  {
    id: 'orc',
    name: 'Orc',
    traits: ['Adrenaline Rush', 'Darkvision', 'Relentless Endurance'],
    mechanics: later('Adrenaline Rush', 'Darkvision', 'Relentless Endurance'),
  },
  {
    id: 'tiefling',
    name: 'Tiefling',
    traits: ['Darkvision', 'Fiendish Legacy', 'Otherworldly Presence'],
    tables: {
      'Fiendish Legacy': {
        title: 'Fiendish Legacies',
        columns: ['Legacy', 'Level 1', 'Level 3', 'Level 5'],
        kind: 'lineage',
      },
    },
    mechanics: later('Darkvision', 'Fiendish Legacy', 'Otherworldly Presence'),
  },
];
