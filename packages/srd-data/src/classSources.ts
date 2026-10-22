// P2-4: which SRD pages hold each class, the names of its table's extra columns, and a decision for every
// level 1 to 3 feature: does it have game mechanics the app does not run yet ('later'), or not ('none')?
// Nothing here is rules data; the data itself comes from the SRD text in ../source/classes.

export interface ClassSource {
  id: string;
  name: string;
  /** SRD 5.2.1 pages, for source/README.md and anyone checking. */
  pages: string;
  /** The class table's columns after Level, Proficiency Bonus and Class Features, in order. */
  columns: { key: string; label: string }[];
  /**
   * For a spellcaster, how its spells are readied. The spellcasting ability itself is read from the SRD's
   * Spellcasting feature.
   */
  preparation?: 'prepared' | 'known' | 'spellbook';
  /** The feature that grants spells, when it is not called Spellcasting (the Warlock's Pact Magic). */
  castingFeature?: string;
  /** Tables inside a feature's text, by feature name, with the column headings as the SRD prints them. */
  tables?: Record<string, { title: string; columns: string[] }[]>;
  /** Sidebar boxes that land inside a feature's text: the title and how many paragraphs follow it. */
  sidebars?: { title: string; paragraphs: number }[];
  /** Every level 1 to 3 feature, class and subclass, must be listed. */
  mechanics: Record<string, 'later' | 'none'>;
}

export const CLASS_SOURCES: ClassSource[] = [
  {
    id: 'barbarian',
    name: 'Barbarian',
    pages: '28-30',
    columns: [
      { key: 'rages', label: 'Rages' },
      { key: 'rageDamage', label: 'Rage Damage' },
      { key: 'weaponMastery', label: 'Weapon Mastery' },
    ],
    mechanics: {
      Rage: 'later',
      'Unarmored Defense': 'later',
      'Weapon Mastery': 'later',
      'Danger Sense': 'later',
      'Reckless Attack': 'later',
      // choosing the subclass is part of levelling up (P2-10); the feature itself does nothing else
      'Barbarian Subclass': 'none',
      'Primal Knowledge': 'later',
      Frenzy: 'later',
    },
  },
  {
    id: 'bard',
    name: 'Bard',
    pages: '31-35',
    columns: [
      { key: 'bardicDie', label: 'Bardic Die' },
      { key: 'cantrips', label: 'Cantrips' },
      { key: 'preparedSpells', label: 'Prepared Spells' },
      { key: 'slots1', label: 'Spell Slots: 1' },
      { key: 'slots2', label: 'Spell Slots: 2' },
      { key: 'slots3', label: 'Spell Slots: 3' },
      { key: 'slots4', label: 'Spell Slots: 4' },
      { key: 'slots5', label: 'Spell Slots: 5' },
      { key: 'slots6', label: 'Spell Slots: 6' },
      { key: 'slots7', label: 'Spell Slots: 7' },
      { key: 'slots8', label: 'Spell Slots: 8' },
      { key: 'slots9', label: 'Spell Slots: 9' },
    ],
    // "You prepare the list of level 1+ spells that are available for you to cast with this feature."
    preparation: 'prepared',
    mechanics: {
      'Bardic Inspiration': 'later',
      // spells and slots come with P2-5
      Spellcasting: 'later',
      Expertise: 'later',
      'Jack of All Trades': 'later',
      'Bard Subclass': 'none',
      'Bonus Proficiencies': 'later',
      'Cutting Words': 'later',
    },
  },
  {
    id: 'cleric',
    name: 'Cleric',
    pages: '36-40',
    columns: [
      { key: 'channelDivinity', label: 'Channel Divinity' },
      { key: 'cantrips', label: 'Cantrips' },
      { key: 'preparedSpells', label: 'Prepared Spells' },
      { key: 'slots1', label: 'Spell Slots: 1' },
      { key: 'slots2', label: 'Spell Slots: 2' },
      { key: 'slots3', label: 'Spell Slots: 3' },
      { key: 'slots4', label: 'Spell Slots: 4' },
      { key: 'slots5', label: 'Spell Slots: 5' },
      { key: 'slots6', label: 'Spell Slots: 6' },
      { key: 'slots7', label: 'Spell Slots: 7' },
      { key: 'slots8', label: 'Spell Slots: 8' },
      { key: 'slots9', label: 'Spell Slots: 9' },
    ],
    preparation: 'prepared',
    tables: {
      'Life Domain Spells': [{ title: 'Life Domain Spells', columns: ['Cleric Level', 'Prepared Spells'] }],
    },
    mechanics: {
      Spellcasting: 'later',
      'Divine Order': 'later',
      'Channel Divinity': 'later',
      'Cleric Subclass': 'none',
      'Disciple of Life': 'later',
      'Life Domain Spells': 'later',
      'Preserve Life': 'later',
    },
  },
  {
    id: 'druid',
    name: 'Druid',
    pages: '41-46',
    columns: [
      { key: 'wildShape', label: 'Wild Shape' },
      { key: 'cantrips', label: 'Cantrips' },
      { key: 'preparedSpells', label: 'Prepared Spells' },
      { key: 'slots1', label: 'Spell Slots: 1' },
      { key: 'slots2', label: 'Spell Slots: 2' },
      { key: 'slots3', label: 'Spell Slots: 3' },
      { key: 'slots4', label: 'Spell Slots: 4' },
      { key: 'slots5', label: 'Spell Slots: 5' },
      { key: 'slots6', label: 'Spell Slots: 6' },
      { key: 'slots7', label: 'Spell Slots: 7' },
      { key: 'slots8', label: 'Spell Slots: 8' },
      { key: 'slots9', label: 'Spell Slots: 9' },
    ],
    preparation: 'prepared',
    tables: {
      'Wild Shape': [{ title: 'Beast Shapes', columns: ['Druid Level', 'Known Forms', 'Max CR', 'Fly Speed'] }],
      'Circle of the Land Spells': [
        { title: 'Arid Land', columns: ['Druid Level', 'Circle Spells'] },
        { title: 'Polar Land', columns: ['Druid Level', 'Circle Spells'] },
        { title: 'Temperate Land', columns: ['Druid Level', 'Circle Spells'] },
        { title: 'Tropical Land', columns: ['Druid Level', 'Circle Spells'] },
      ],
    },
    mechanics: {
      Spellcasting: 'later',
      Druidic: 'later',
      'Primal Order': 'later',
      'Wild Shape': 'later',
      'Wild Companion': 'later',
      'Druid Subclass': 'none',
      'Circle of the Land Spells': 'later',
      'Land’s Aid': 'later',
    },
  },
  {
    id: 'fighter',
    name: 'Fighter',
    pages: '47-49',
    columns: [
      { key: 'secondWind', label: 'Second Wind' },
      { key: 'weaponMastery', label: 'Weapon Mastery' },
    ],
    mechanics: {
      'Fighting Style': 'later',
      'Second Wind': 'later',
      'Weapon Mastery': 'later',
      'Action Surge': 'later',
      'Tactical Mind': 'later',
      'Fighter Subclass': 'none',
      'Improved Critical': 'later',
      'Remarkable Athlete': 'later',
    },
  },
  {
    id: 'monk',
    name: 'Monk',
    pages: '49-52',
    columns: [
      { key: 'martialArts', label: 'Martial Arts' },
      { key: 'focusPoints', label: 'Focus Points' },
      { key: 'unarmoredMovement', label: 'Unarmored Movement' },
    ],
    mechanics: {
      'Martial Arts': 'later',
      'Unarmored Defense': 'later',
      'Monk’s Focus': 'later',
      'Unarmored Movement': 'later',
      'Uncanny Metabolism': 'later',
      'Deflect Attacks': 'later',
      'Monk Subclass': 'none',
      'Open Hand Technique': 'later',
    },
  },
  {
    id: 'paladin',
    name: 'Paladin',
    pages: '53-57',
    columns: [
      { key: 'channelDivinity', label: 'Channel Divinity' },
      { key: 'preparedSpells', label: 'Prepared Spells' },
      { key: 'slots1', label: 'Spell Slots: 1' },
      { key: 'slots2', label: 'Spell Slots: 2' },
      { key: 'slots3', label: 'Spell Slots: 3' },
      { key: 'slots4', label: 'Spell Slots: 4' },
      { key: 'slots5', label: 'Spell Slots: 5' },
    ],
    preparation: 'prepared',
    sidebars: [{ title: 'Breaking Your Oath', paragraphs: 3 }],
    tables: {
      'Oath of Devotion Spells': [{ title: 'Oath of Devotion Spells', columns: ['Paladin Level', 'Spells'] }],
    },
    mechanics: {
      'Lay On Hands': 'later',
      Spellcasting: 'later',
      'Weapon Mastery': 'later',
      'Fighting Style': 'later',
      'Paladin’s Smite': 'later',
      'Channel Divinity': 'later',
      'Paladin Subclass': 'none',
      'Oath of Devotion Spells': 'later',
      'Sacred Weapon': 'later',
    },
  },
  {
    id: 'ranger',
    name: 'Ranger',
    pages: '57-61',
    columns: [
      { key: 'favoredEnemy', label: 'Favored Enemy' },
      { key: 'preparedSpells', label: 'Prepared Spells' },
      { key: 'slots1', label: 'Spell Slots: 1' },
      { key: 'slots2', label: 'Spell Slots: 2' },
      { key: 'slots3', label: 'Spell Slots: 3' },
      { key: 'slots4', label: 'Spell Slots: 4' },
      { key: 'slots5', label: 'Spell Slots: 5' },
    ],
    preparation: 'prepared',
    mechanics: {
      Spellcasting: 'later',
      'Favored Enemy': 'later',
      'Weapon Mastery': 'later',
      'Deft Explorer': 'later',
      'Fighting Style': 'later',
      'Ranger Subclass': 'none',
      'Hunter’s Lore': 'later',
      'Hunter’s Prey': 'later',
    },
  },
  {
    id: 'rogue',
    name: 'Rogue',
    pages: '61-64',
    columns: [{ key: 'sneakAttack', label: 'Sneak Attack' }],
    mechanics: {
      Expertise: 'later',
      'Sneak Attack': 'later',
      'Thieves’ Cant': 'later',
      'Weapon Mastery': 'later',
      'Cunning Action': 'later',
      'Rogue Subclass': 'none',
      'Steady Aim': 'later',
      'Fast Hands': 'later',
      'Second-Story Work': 'later',
    },
  },
  {
    id: 'sorcerer',
    name: 'Sorcerer',
    pages: '64-70',
    columns: [
      { key: 'sorceryPoints', label: 'Sorcery Points' },
      { key: 'cantrips', label: 'Cantrips' },
      { key: 'preparedSpells', label: 'Prepared Spells' },
      { key: 'slots1', label: 'Spell Slots: 1' },
      { key: 'slots2', label: 'Spell Slots: 2' },
      { key: 'slots3', label: 'Spell Slots: 3' },
      { key: 'slots4', label: 'Spell Slots: 4' },
      { key: 'slots5', label: 'Spell Slots: 5' },
      { key: 'slots6', label: 'Spell Slots: 6' },
      { key: 'slots7', label: 'Spell Slots: 7' },
      { key: 'slots8', label: 'Spell Slots: 8' },
      { key: 'slots9', label: 'Spell Slots: 9' },
    ],
    preparation: 'prepared',
    tables: {
      'Font of Magic': [
        { title: 'Creating Spell Slots', columns: ['Spell Slot Level', 'Sorcery Point Cost', 'Min. Sorcerer Level'] },
      ],
      'Draconic Spells': [{ title: 'Draconic Spells', columns: ['Sorcerer Level', 'Spells'] }],
    },
    mechanics: {
      Spellcasting: 'later',
      'Innate Sorcery': 'later',
      'Font of Magic': 'later',
      Metamagic: 'later',
      'Sorcerer Subclass': 'none',
      'Draconic Resilience': 'later',
      'Draconic Spells': 'later',
    },
  },
  {
    id: 'warlock',
    name: 'Warlock',
    pages: '70-76',
    columns: [
      { key: 'eldritchInvocations', label: 'Eldritch Invocations' },
      { key: 'cantrips', label: 'Cantrips' },
      { key: 'preparedSpells', label: 'Prepared Spells' },
      { key: 'spellSlots', label: 'Spell Slots' },
      { key: 'slotLevel', label: 'Slot Level' },
    ],
    preparation: 'prepared',
    castingFeature: 'Pact Magic',
    tables: {
      'Fiend Spells': [{ title: 'Fiend Spells', columns: ['Warlock Level', 'Spells'] }],
    },
    mechanics: {
      'Eldritch Invocations': 'later',
      'Pact Magic': 'later',
      'Magical Cunning': 'later',
      'Warlock Subclass': 'none',
      'Dark One’s Blessing': 'later',
      'Fiend Spells': 'later',
    },
  },
  {
    id: 'wizard',
    name: 'Wizard',
    pages: '77-82',
    columns: [
      { key: 'cantrips', label: 'Cantrips' },
      { key: 'preparedSpells', label: 'Prepared Spells' },
      { key: 'slots1', label: 'Spell Slots: 1' },
      { key: 'slots2', label: 'Spell Slots: 2' },
      { key: 'slots3', label: 'Spell Slots: 3' },
      { key: 'slots4', label: 'Spell Slots: 4' },
      { key: 'slots5', label: 'Spell Slots: 5' },
      { key: 'slots6', label: 'Spell Slots: 6' },
      { key: 'slots7', label: 'Spell Slots: 7' },
      { key: 'slots8', label: 'Spell Slots: 8' },
      { key: 'slots9', label: 'Spell Slots: 9' },
    ],
    // "Spellbook. Your wizardly apprenticeship culminated in the creation of a unique book: your spellbook."
    preparation: 'spellbook',
    sidebars: [{ title: 'Expanding and Replacing a Spellbook', paragraphs: 4 }],
    mechanics: {
      Spellcasting: 'later',
      'Ritual Adept': 'later',
      'Arcane Recovery': 'later',
      Scholar: 'later',
      'Wizard Subclass': 'none',
      'Evocation Savant': 'later',
      'Potent Cantrip': 'later',
    },
  },
];
