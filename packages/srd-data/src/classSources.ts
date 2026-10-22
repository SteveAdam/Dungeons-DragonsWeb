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
  spellcasting?: { ability: 'int' | 'wis' | 'cha'; preparation: 'prepared' | 'known' | 'spellbook' };
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
];
