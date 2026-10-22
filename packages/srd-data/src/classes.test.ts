import { readFileSync } from 'node:fs';
import { classProgression, hitPointsAtLevel1, proficiencyBonus, type ClassDef } from '@dnd-manager/rules-engine';
import { describe, expect, it } from 'vitest';
import { CLASS_SOURCES } from './classSources';
import { convertClass, equipmentOptions } from './convertClass';
import { SRD_CLASSES } from './index';

const source = (file: string) => readFileSync(new URL(`../source/classes/${file}`, import.meta.url), 'utf8');
const byId = (id: string) => SRD_CLASSES.find(c => c.id === id)!;

describe('the SRD classes (levels 1 to 3)', () => {
  it('are exactly what the SRD pages in ../source/classes give', () => {
    expect(CLASS_SOURCES.map(s => convertClass(s, source(`${s.id}.flow.txt`), source(`${s.id}.raw.txt`)))).toEqual(
      SRD_CLASSES,
    );
  });

  it('carry the proficiency bonus the engine works out for each level', () => {
    for (const c of SRD_CLASSES) {
      for (const l of c.levels) expect(l.proficiencyBonus, `${c.name} ${l.level}`).toBe(proficiencyBonus(l.level));
    }
  });

  it('give every feature a description in the SRD words and a decision on its mechanics', () => {
    for (const c of SRD_CLASSES) {
      for (const f of [...c.levels.flatMap(l => l.features), ...c.subclasses.flatMap(s => s.features)]) {
        expect(f.description.length, `${c.name}: ${f.name}`).toBeGreaterThan(20);
        expect(['later', 'none']).toContain(f.mechanics);
      }
    }
  });

  it('feed the engine directly', () => {
    for (const c of SRD_CLASSES) {
      const def: ClassDef = c;
      expect(classProgression(def, 3, c.subclasses[0].id).featuresSoFar.length).toBeGreaterThan(0);
    }
  });
});

describe('Barbarian (SRD 5.2.1 pages 28 to 30)', () => {
  const b = byId('barbarian');

  it('core traits', () => {
    expect(b.hitDie).toBe('d12');
    expect(b.primaryAbilities).toEqual(['str']);
    expect(b.saveProficiencies).toEqual(['str', 'con']);
    expect(b.skillChoices).toEqual({
      count: 2,
      from: ['animalHandling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
      text: 'Choose 2: Animal Handling, Athletics, Intimidation, Nature, Perception, or Survival',
    });
    expect(b.weaponProficiencies).toBe('Simple and Martial weapons');
    expect(b.armorTraining).toEqual({
      text: 'Light and Medium armor and Shields',
      categories: ['light', 'medium', 'shield'],
    });
    expect(b.startingEquipmentOptions).toEqual([
      { option: 'A', text: 'Greataxe, 4 Handaxes, Explorer’s Pack, and 15 GP' },
      { option: 'B', text: '75 GP' },
    ]);
    expect(b.spellcasting).toBeUndefined();
  });

  it('the Barbarian Features table, levels 1 to 3', () => {
    expect(b.levels.map(l => [l.level, l.proficiencyBonus, l.features.map(f => f.name), l.columns])).toEqual([
      [1, 2, ['Rage', 'Unarmored Defense', 'Weapon Mastery'], { rages: 2, rageDamage: '+2', weaponMastery: 2 }],
      [2, 2, ['Danger Sense', 'Reckless Attack'], { rages: 2, rageDamage: '+2', weaponMastery: 2 }],
      [3, 2, ['Barbarian Subclass', 'Primal Knowledge'], { rages: 3, rageDamage: '+2', weaponMastery: 2 }],
    ]);
  });

  it('Path of the Berserker, to level 3', () => {
    expect(b.subclasses.map(s => [s.name, s.tagline, s.features.map(f => [f.level, f.name])])).toEqual([
      ['Path of the Berserker', 'Channel Rage into Violent Fury', [[3, 'Frenzy']]],
    ]);
  });

  it('keeps the Rage text whole across the page break, with its bullets', () => {
    const rage = b.levels[0].features[0].description;
    expect(rage).toContain('Strength—with either a weapon or an Unarmed Strike—and deal damage');
    expect(rage).toContain('• Make an attack roll against an enemy.\n• Force an enemy to make a saving throw.');
    expect(rage.endsWith('You can maintain a Rage for up to 10 minutes.')).toBe(true);
  });

  it('a level 1 Barbarian with Constitution 14 has 14 hit points', () => {
    expect(hitPointsAtLevel1(b.hitDie, 2)).toBe(14);
  });
});

describe('Bard (SRD 5.2.1 pages 31 to 35)', () => {
  const b = byId('bard');

  it('core traits', () => {
    expect(b.hitDie).toBe('d8');
    expect(b.primaryAbilities).toEqual(['cha']);
    expect(b.saveProficiencies).toEqual(['dex', 'cha']);
    expect(b.skillChoices.count).toBe(3);
    expect(b.skillChoices.from).toHaveLength(18);
    expect(b.skillChoices.text).toBe('Choose any 3 skills (see “Playing the Game”)');
    expect(b.weaponProficiencies).toBe('Simple weapons');
    expect(b.toolProficiencies).toBe('Choose 3 Musical Instruments (see “Equipment”)');
    expect(b.armorTraining).toEqual({ text: 'Light armor', categories: ['light'] });
    expect(b.startingEquipmentOptions).toEqual([
      {
        option: 'A',
        text: 'Leather Armor, 2 Daggers, Musical Instrument of your choice, Entertainer’s Pack, and 19 GP',
      },
      { option: 'B', text: '90 GP' },
    ]);
    expect(b.spellcasting).toEqual({ ability: 'cha', preparation: 'prepared' });
  });

  it('the Bard Features table, levels 1 to 3, with rows that run onto several lines', () => {
    const dash = '—';
    const slots = (one: number, two: number | string) => ({
      slots1: one,
      slots2: two,
      slots3: dash,
      slots4: dash,
      slots5: dash,
      slots6: dash,
      slots7: dash,
      slots8: dash,
      slots9: dash,
    });
    expect(b.levels.map(l => [l.level, l.proficiencyBonus, l.features.map(f => f.name), l.columns])).toEqual([
      [
        1,
        2,
        ['Bardic Inspiration', 'Spellcasting'],
        { bardicDie: 'D6', cantrips: 2, preparedSpells: 4, ...slots(2, dash) },
      ],
      [
        2,
        2,
        ['Expertise', 'Jack of All Trades'],
        { bardicDie: 'D6', cantrips: 2, preparedSpells: 5, ...slots(3, dash) },
      ],
      [3, 2, ['Bard Subclass'], { bardicDie: 'D6', cantrips: 2, preparedSpells: 6, ...slots(4, 2) }],
    ]);
  });

  it('College of Lore, to level 3', () => {
    expect(b.subclasses.map(s => [s.name, s.tagline, s.features.map(f => [f.level, f.name])])).toEqual([
      [
        'College of Lore',
        'Plumb the Depths of Magical Knowledge',
        [
          [3, 'Bonus Proficiencies'],
          [3, 'Cutting Words'],
        ],
      ],
    ]);
  });

  it('joins a paragraph split by the page break, and ends Spellcasting before the spell list', () => {
    const [inspiration, spellcasting] = b.levels[0].features;
    expect(inspiration.description).toContain('That creature gains one of your Bardic Inspiration dice.');
    expect(spellcasting.description).toContain('your list of prepared spells can include six spells of levels 1 and 2');
    expect(
      spellcasting.description.endsWith(
        'You can use a Musical Instrument as a Spellcasting Focus for your Bard spells.',
      ),
    ).toBe(true);
  });
});

describe('Cleric (SRD 5.2.1 pages 36 to 40)', () => {
  const c = byId('cleric');
  const dash = '—';
  const noHigherSlots = {
    slots3: dash,
    slots4: dash,
    slots5: dash,
    slots6: dash,
    slots7: dash,
    slots8: dash,
    slots9: dash,
  };

  it('core traits', () => {
    expect(c.hitDie).toBe('d8');
    expect(c.primaryAbilities).toEqual(['wis']);
    expect(c.saveProficiencies).toEqual(['wis', 'cha']);
    expect(c.skillChoices).toEqual({
      count: 2,
      from: ['history', 'insight', 'medicine', 'persuasion', 'religion'],
      text: 'Choose 2: History, Insight, Medicine, Persuasion, or Religion',
    });
    expect(c.weaponProficiencies).toBe('Simple weapons');
    expect(c.armorTraining.categories).toEqual(['light', 'medium', 'shield']);
    expect(c.startingEquipmentOptions).toEqual([
      { option: 'A', text: 'Chain Shirt, Shield, Mace, Holy Symbol, Priest’s Pack, and 7 GP' },
      { option: 'B', text: '110 GP' },
    ]);
    expect(c.spellcasting).toEqual({ ability: 'wis', preparation: 'prepared' });
  });

  it('the Cleric Features table, levels 1 to 3', () => {
    expect(c.levels.map(l => [l.level, l.proficiencyBonus, l.features.map(f => f.name), l.columns])).toEqual([
      [
        1,
        2,
        ['Spellcasting', 'Divine Order'],
        { channelDivinity: dash, cantrips: 3, preparedSpells: 4, slots1: 2, slots2: dash, ...noHigherSlots },
      ],
      [
        2,
        2,
        ['Channel Divinity'],
        { channelDivinity: 2, cantrips: 3, preparedSpells: 5, slots1: 3, slots2: dash, ...noHigherSlots },
      ],
      [
        3,
        2,
        ['Cleric Subclass'],
        { channelDivinity: 2, cantrips: 3, preparedSpells: 6, slots1: 4, slots2: 2, ...noHigherSlots },
      ],
    ]);
  });

  it('Life Domain, to level 3, with its spell table read as rows', () => {
    const life = c.subclasses[0];
    expect([life.name, life.tagline, life.features.map(f => f.name)]).toEqual([
      'Life Domain',
      'Soothe the Hurts of the World',
      ['Disciple of Life', 'Life Domain Spells', 'Preserve Life'],
    ]);
    const spells = life.features[1];
    expect(spells.description).toBe(
      'Your connection to this divine domain ensures you always have certain spells ready. When you reach a Cleric level specified in the Life Domain Spells table, you thereafter always have the listed spells prepared.',
    );
    expect(spells.tables).toEqual([
      {
        title: 'Life Domain Spells',
        columns: ['Cleric Level', 'Prepared Spells'],
        rows: [
          ['3', 'Aid, Bless, Cure Wounds, Lesser Restoration'],
          ['5', 'Mass Healing Word, Revivify'],
          ['7', 'Aura of Life, Death Ward'],
          ['9', 'Greater Restoration, Mass Cure Wounds'],
        ],
      },
    ]);
  });
});

describe('Druid (SRD 5.2.1 pages 41 to 46)', () => {
  const d = byId('druid');
  const dash = '—';
  const noHigherSlots = {
    slots3: dash,
    slots4: dash,
    slots5: dash,
    slots6: dash,
    slots7: dash,
    slots8: dash,
    slots9: dash,
  };

  it('core traits', () => {
    expect(d.hitDie).toBe('d8');
    expect(d.primaryAbilities).toEqual(['wis']);
    expect(d.saveProficiencies).toEqual(['int', 'wis']);
    expect(d.skillChoices.count).toBe(2);
    expect(d.skillChoices.from).toEqual([
      'animalHandling',
      'arcana',
      'insight',
      'medicine',
      'nature',
      'perception',
      'religion',
      'survival',
    ]);
    expect(d.weaponProficiencies).toBe('Simple weapons');
    expect(d.toolProficiencies).toBe('Herbalism Kit');
    expect(d.armorTraining).toEqual({ text: 'Light armor and Shields', categories: ['light', 'shield'] });
    expect(d.startingEquipmentOptions).toEqual([
      {
        option: 'A',
        text: 'Leather Armor, Shield, Sickle, Druidic Focus (Quarterstaff), Explorer’s Pack, Herbalism Kit, and 9 GP',
      },
      { option: 'B', text: '50 GP' },
    ]);
    expect(d.spellcasting).toEqual({ ability: 'wis', preparation: 'prepared' });
  });

  it('the Druid Features table, levels 1 to 3', () => {
    expect(d.levels.map(l => [l.level, l.proficiencyBonus, l.features.map(f => f.name), l.columns])).toEqual([
      [
        1,
        2,
        ['Spellcasting', 'Druidic', 'Primal Order'],
        { wildShape: dash, cantrips: 2, preparedSpells: 4, slots1: 2, slots2: dash, ...noHigherSlots },
      ],
      [
        2,
        2,
        ['Wild Shape', 'Wild Companion'],
        { wildShape: 2, cantrips: 2, preparedSpells: 5, slots1: 3, slots2: dash, ...noHigherSlots },
      ],
      [
        3,
        2,
        ['Druid Subclass'],
        { wildShape: 2, cantrips: 2, preparedSpells: 6, slots1: 4, slots2: 2, ...noHigherSlots },
      ],
    ]);
  });

  it('Wild Shape keeps its text on both sides of the Beast Shapes table, read as four columns', () => {
    const wildShape = d.levels[1].features[0];
    expect(wildShape.description).toContain('as shown in the Beast Shapes table. In addition, starting at level 8');
    expect(wildShape.description).toContain('Rules While Shape-Shifted. While in a form, you retain your personality');
    expect(wildShape.description).not.toMatch(/\n\n(Druid|Known|Max|CR|Fly Speed|No No Yes|\d)\n\n/);
    expect(wildShape.tables).toEqual([
      {
        title: 'Beast Shapes',
        columns: ['Druid Level', 'Known Forms', 'Max CR', 'Fly Speed'],
        rows: [
          ['2', '4', '1/4', 'No'],
          ['4', '6', '1/2', 'No'],
          ['8', '8', '1', 'Yes'],
        ],
      },
    ]);
  });

  it('Circle of the Land, to level 3, with a spell table for each kind of land', () => {
    const land = d.subclasses[0];
    expect([land.name, land.tagline, land.features.map(f => f.name)]).toEqual([
      'Circle of the Land',
      'Celebrate Connection to the Natural World',
      ['Circle of the Land Spells', 'Land’s Aid'],
    ]);
    const spells = land.features[0];
    expect(spells.description.endsWith('you have the spells listed for your Druid level and lower prepared.')).toBe(
      true,
    );
    expect(spells.tables!.map(t => [t.title, t.rows[0]])).toEqual([
      ['Arid Land', ['3', 'Blur, Burning Hands, Fire Bolt']],
      ['Polar Land', ['3', 'Fog Cloud, Hold Person, Ray of Frost']],
      ['Temperate Land', ['3', 'Misty Step, Shocking Grasp, Sleep']],
      ['Tropical Land', ['3', 'Acid Splash, Ray of Sickness, Web']],
    ]);
    expect(spells.tables!.every(t => t.rows.map(r => r[0]).join() === '3,5,7,9')).toBe(true);
  });
});

describe('Fighter (SRD 5.2.1 pages 47 to 49)', () => {
  const f = byId('fighter');

  it('core traits', () => {
    expect(f.hitDie).toBe('d10');
    expect(f.primaryAbilityText).toBe('Strength or Dexterity');
    expect(f.primaryAbilities).toEqual(['str', 'dex']);
    expect(f.saveProficiencies).toEqual(['str', 'con']);
    expect(f.skillChoices.text).toBe(
      'Choose 2: Acrobatics, Animal Handling, Athletics, History, Insight, Intimidation, Persuasion, Perception, or Survival',
    );
    expect(f.skillChoices.from).toHaveLength(9);
    expect(f.weaponProficiencies).toBe('Simple and Martial weapons');
    expect(f.armorTraining).toEqual({
      text: 'Light, Medium, and Heavy armor and Shields',
      categories: ['light', 'medium', 'heavy', 'shield'],
    });
    expect(f.spellcasting).toBeUndefined();
  });

  it('starting equipment: three choices, without the PDF’s invisible soft hyphen in “Shortsword”', () => {
    expect(f.startingEquipmentOptions).toEqual([
      { option: 'A', text: 'Chain Mail, Greatsword, Flail, 8 Javelins, Dungeoneer’s Pack, and 4 GP' },
      {
        option: 'B',
        text: 'Studded Leather Armor, Scimitar, Shortsword, Longbow, 20 Arrows, Quiver, Dungeoneer’s Pack, and 11 GP',
      },
      { option: 'C', text: '155 GP' },
    ]);
  });

  it('the Fighter Features table, levels 1 to 3 (“Action Surge (one use)” is the Action Surge feature)', () => {
    expect(f.levels.map(l => [l.level, l.proficiencyBonus, l.features.map(x => x.name), l.columns])).toEqual([
      [1, 2, ['Fighting Style', 'Second Wind', 'Weapon Mastery'], { secondWind: 2, weaponMastery: 3 }],
      [2, 2, ['Action Surge', 'Tactical Mind'], { secondWind: 2, weaponMastery: 3 }],
      [3, 2, ['Fighter Subclass'], { secondWind: 2, weaponMastery: 3 }],
    ]);
  });

  it('Champion, to level 3', () => {
    expect(f.subclasses.map(s => [s.name, s.tagline, s.features.map(x => [x.level, x.name])])).toEqual([
      [
        'Champion',
        'Pursue Physical Excellence in Combat',
        [
          [3, 'Improved Critical'],
          [3, 'Remarkable Athlete'],
        ],
      ],
    ]);
  });

  it('a level 1 Fighter with Constitution 14 has 12 hit points (the ticket’s example)', () => {
    expect(hitPointsAtLevel1(f.hitDie, 2)).toBe(12);
  });
});

describe('Monk (SRD 5.2.1 pages 49 to 52)', () => {
  const m = byId('monk');

  it('core traits', () => {
    expect(m.hitDie).toBe('d8');
    expect(m.primaryAbilities).toEqual(['dex', 'wis']);
    expect(m.saveProficiencies).toEqual(['str', 'dex']);
    expect(m.skillChoices).toEqual({
      count: 2,
      from: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'],
      text: 'Choose 2: Acrobatics, Athletics, History, Insight, Religion, or Stealth',
    });
    expect(m.weaponProficiencies).toBe('Simple weapons and Martial weapons that have the Light property');
    expect(m.toolProficiencies).toBe('Choose one type of Artisan’s Tools or Musical Instrument (see “Equipment”)');
    expect(m.armorTraining).toEqual({ text: 'None', categories: [] });
    expect(m.startingEquipmentOptions.map(o => o.option)).toEqual(['A', 'B']);
    expect(m.spellcasting).toBeUndefined();
  });

  it('the Monk Features table, levels 1 to 3, with “+10 ft.” kept as one cell', () => {
    expect(m.levels.map(l => [l.level, l.proficiencyBonus, l.features.map(f => f.name), l.columns])).toEqual([
      [1, 2, ['Martial Arts', 'Unarmored Defense'], { martialArts: '1d6', focusPoints: '—', unarmoredMovement: '—' }],
      [
        2,
        2,
        ['Monk’s Focus', 'Unarmored Movement', 'Uncanny Metabolism'],
        { martialArts: '1d6', focusPoints: 2, unarmoredMovement: '+10 ft.' },
      ],
      [
        3,
        2,
        ['Deflect Attacks', 'Monk Subclass'],
        { martialArts: '1d6', focusPoints: 3, unarmoredMovement: '+10 ft.' },
      ],
    ]);
  });

  it('Warrior of the Open Hand, to level 3', () => {
    expect(m.subclasses.map(s => [s.name, s.tagline, s.features.map(f => [f.level, f.name])])).toEqual([
      ['Warrior of the Open Hand', 'Master Unarmed Combat Techniques', [[3, 'Open Hand Technique']]],
    ]);
  });

  it('keeps Martial Arts whole although the class table ends on the same page it starts', () => {
    const martialArts = m.levels[0].features[0].description;
    expect(martialArts).toContain('• Simple Melee weapons\n• Martial Melee weapons that have the Light property');
    expect(martialArts).toContain('Dexterous Attacks.');
  });
});

describe('Paladin (SRD 5.2.1 pages 53 to 57)', () => {
  const p = byId('paladin');
  const dash = '—';

  it('core traits', () => {
    expect(p.hitDie).toBe('d10');
    expect(p.primaryAbilities).toEqual(['str', 'cha']);
    expect(p.saveProficiencies).toEqual(['wis', 'cha']);
    expect(p.skillChoices.from).toEqual(['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion']);
    expect(p.weaponProficiencies).toBe('Simple and Martial weapons');
    expect(p.armorTraining.categories).toEqual(['light', 'medium', 'heavy', 'shield']);
    expect(p.startingEquipmentOptions).toEqual([
      { option: 'A', text: 'Chain Mail, Shield, Longsword, 6 Javelins, Holy Symbol, Priest’s Pack, and 9 GP' },
      { option: 'B', text: '150 GP' },
    ]);
    expect(p.spellcasting).toEqual({ ability: 'cha', preparation: 'prepared' });
  });

  it('the Paladin Features table, levels 1 to 3, with five spell slot levels', () => {
    const higher = { slots2: dash, slots3: dash, slots4: dash, slots5: dash };
    expect(p.levels.map(l => [l.level, l.proficiencyBonus, l.features.map(f => f.name), l.columns])).toEqual([
      [
        1,
        2,
        ['Lay On Hands', 'Spellcasting', 'Weapon Mastery'],
        { channelDivinity: dash, preparedSpells: 2, slots1: 2, ...higher },
      ],
      [2, 2, ['Fighting Style', 'Paladin’s Smite'], { channelDivinity: dash, preparedSpells: 3, slots1: 2, ...higher }],
      [3, 2, ['Channel Divinity', 'Paladin Subclass'], { channelDivinity: 2, preparedSpells: 4, slots1: 3, ...higher }],
    ]);
  });

  it('Oath of Devotion, to level 3, with its tenets and spell table, and nothing from the Ranger on the last page', () => {
    const oath = p.subclasses[0];
    expect([oath.name, oath.tagline, oath.features.map(f => f.name)]).toEqual([
      'Oath of Devotion',
      'Uphold the Ideals of Justice and Order',
      ['Oath of Devotion Spells', 'Sacred Weapon'],
    ]);
    expect(oath.description).toContain(
      '• Let your word be your promise.\n• Protect the weak and never fear to act.\n• Let your honorable deeds be an example.',
    );
    expect(oath.features[0].tables![0].rows).toEqual([
      ['3', 'Protection from Evil and Good, Shield of Faith'],
      ['5', 'Aid, Zone of Truth'],
      ['9', 'Beacon of Hope, Dispel Magic'],
      ['13', 'Freedom of Movement, Guardian of Faith'],
      ['17', 'Commune, Flame Strike'],
    ]);
  });

  it('lifts the “Breaking Your Oath” sidebar out of Channel Divinity', () => {
    const channel = p.levels[2].features[0].description;
    expect(channel).not.toContain('Breaking Your Oath');
    expect(channel).toContain(
      'You gain an additional use when you reach Paladin level 11.\n\nIf a Channel Divinity effect requires a saving throw',
    );
    expect(p.sidebars?.map(s => [s.title, s.text.split('\n\n').length])).toEqual([['Breaking Your Oath', 3]]);
  });
});

describe('Ranger (SRD 5.2.1 pages 57 to 61)', () => {
  const r = byId('ranger');
  const dash = '—';

  it('core traits', () => {
    expect(r.hitDie).toBe('d10');
    expect(r.primaryAbilities).toEqual(['dex', 'wis']);
    expect(r.saveProficiencies).toEqual(['str', 'dex']);
    expect(r.skillChoices.count).toBe(3);
    expect(r.skillChoices.from).toEqual([
      'animalHandling',
      'athletics',
      'insight',
      'investigation',
      'nature',
      'perception',
      'stealth',
      'survival',
    ]);
    expect(r.armorTraining.categories).toEqual(['light', 'medium', 'shield']);
    expect(r.startingEquipmentOptions).toEqual([
      {
        option: 'A',
        text: 'Studded Leather Armor, Scimitar, Shortsword, Longbow, 20 Arrows, Quiver, Druidic Focus (sprig of mistletoe), Explorer’s Pack, and 7 GP',
      },
      { option: 'B', text: '150 GP' },
    ]);
    expect(r.spellcasting).toEqual({ ability: 'wis', preparation: 'prepared' });
  });

  it('the Ranger Features table, levels 1 to 3', () => {
    const higher = { slots2: dash, slots3: dash, slots4: dash, slots5: dash };
    expect(r.levels.map(l => [l.level, l.proficiencyBonus, l.features.map(f => f.name), l.columns])).toEqual([
      [
        1,
        2,
        ['Spellcasting', 'Favored Enemy', 'Weapon Mastery'],
        { favoredEnemy: 2, preparedSpells: 2, slots1: 2, ...higher },
      ],
      [2, 2, ['Deft Explorer', 'Fighting Style'], { favoredEnemy: 2, preparedSpells: 3, slots1: 2, ...higher }],
      [3, 2, ['Ranger Subclass'], { favoredEnemy: 2, preparedSpells: 4, slots1: 3, ...higher }],
    ]);
  });

  it('keeps the Spellcasting text that follows the class table on the same page', () => {
    const spellcasting = r.levels[0].features[0].description;
    expect(spellcasting).toContain('Prepared Spells of Level 1+. You prepare the list');
    expect(spellcasting).toContain('Spellcasting Ability. Wisdom is your spellcasting ability for your Ranger spells.');
  });

  it('Hunter, to level 3, without the Rogue that starts on the last page', () => {
    expect(r.subclasses.map(s => [s.name, s.tagline, s.features.map(f => [f.level, f.name])])).toEqual([
      [
        'Hunter',
        'Protect Nature and People from Destruction',
        [
          [3, 'Hunter’s Lore'],
          [3, 'Hunter’s Prey'],
        ],
      ],
    ]);
  });
});

describe('Rogue (SRD 5.2.1 pages 61 to 64)', () => {
  const r = byId('rogue');

  it('core traits', () => {
    expect(r.hitDie).toBe('d8');
    expect(r.primaryAbilities).toEqual(['dex']);
    expect(r.saveProficiencies).toEqual(['dex', 'int']);
    expect(r.skillChoices.count).toBe(4);
    expect(r.skillChoices.from).toEqual([
      'acrobatics',
      'athletics',
      'deception',
      'insight',
      'intimidation',
      'investigation',
      'perception',
      'persuasion',
      'sleightOfHand',
      'stealth',
    ]);
    expect(r.weaponProficiencies).toBe('Simple weapons and Martial weapons that have the Finesse or Light property');
    expect(r.toolProficiencies).toBe('Thieves’ Tools');
    expect(r.armorTraining).toEqual({ text: 'Light armor', categories: ['light'] });
    expect(r.startingEquipmentOptions).toEqual([
      {
        option: 'A',
        text: 'Leather Armor, 2 Daggers, Shortsword, Shortbow, 20 Arrows, Quiver, Thieves’ Tools, Burglar’s Pack, and 8 GP',
      },
      { option: 'B', text: '100 GP' },
    ]);
    expect(r.spellcasting).toBeUndefined();
  });

  it('the Rogue Features table, levels 1 to 3', () => {
    expect(r.levels.map(l => [l.level, l.proficiencyBonus, l.features.map(f => f.name), l.columns])).toEqual([
      [1, 2, ['Expertise', 'Sneak Attack', 'Thieves’ Cant', 'Weapon Mastery'], { sneakAttack: '1d6' }],
      [2, 2, ['Cunning Action'], { sneakAttack: '1d6' }],
      [3, 2, ['Rogue Subclass', 'Steady Aim'], { sneakAttack: '2d6' }],
    ]);
  });

  it('Thief, to level 3, with Fast Hands whole across the column break', () => {
    const thief = r.subclasses[0];
    expect([thief.name, thief.tagline, thief.features.map(f => f.name)]).toEqual([
      'Thief',
      'Hunt for Treasure as a Classic Adventurer',
      ['Fast Hands', 'Second-Story Work'],
    ]);
    expect(thief.features[0].description).toContain(
      'Make a Dexterity (Sleight of Hand) check to pick a lock or disarm a trap',
    );
  });
});

describe('Sorcerer (SRD 5.2.1 pages 64 to 70)', () => {
  const s = byId('sorcerer');
  const dash = '—';
  const noHigherSlots = {
    slots3: dash,
    slots4: dash,
    slots5: dash,
    slots6: dash,
    slots7: dash,
    slots8: dash,
    slots9: dash,
  };

  it('core traits', () => {
    expect(s.hitDie).toBe('d6');
    expect(s.primaryAbilities).toEqual(['cha']);
    expect(s.saveProficiencies).toEqual(['con', 'cha']);
    expect(s.skillChoices.from).toEqual(['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion']);
    expect(s.weaponProficiencies).toBe('Simple weapons');
    expect(s.armorTraining).toEqual({ text: 'None', categories: [] });
    expect(s.startingEquipmentOptions).toEqual([
      { option: 'A', text: 'Spear, 2 Daggers, Arcane Focus (crystal), Dungeoneer’s Pack, and 28 GP' },
      { option: 'B', text: '50 GP' },
    ]);
    expect(s.spellcasting).toEqual({ ability: 'cha', preparation: 'prepared' });
  });

  it('the Sorcerer Features table, levels 1 to 3', () => {
    expect(s.levels.map(l => [l.level, l.proficiencyBonus, l.features.map(f => f.name), l.columns])).toEqual([
      [
        1,
        2,
        ['Spellcasting', 'Innate Sorcery'],
        { sorceryPoints: dash, cantrips: 4, preparedSpells: 2, slots1: 2, slots2: dash, ...noHigherSlots },
      ],
      [
        2,
        2,
        ['Font of Magic', 'Metamagic'],
        { sorceryPoints: 2, cantrips: 4, preparedSpells: 4, slots1: 3, slots2: dash, ...noHigherSlots },
      ],
      [
        3,
        2,
        ['Sorcerer Subclass'],
        { sorceryPoints: 3, cantrips: 4, preparedSpells: 6, slots1: 4, slots2: 2, ...noHigherSlots },
      ],
    ]);
  });

  it('Font of Magic keeps its text after the Creating Spell Slots table, read as three columns', () => {
    const font = s.levels[1].features[0];
    expect(
      font.description.endsWith('Any spell slot you create with this feature vanishes when you finish a Long Rest.'),
    ).toBe(true);
    expect(font.tables).toEqual([
      {
        title: 'Creating Spell Slots',
        columns: ['Spell Slot Level', 'Sorcery Point Cost', 'Min. Sorcerer Level'],
        rows: [
          ['1', '2', '2'],
          ['2', '3', '3'],
          ['3', '5', '5'],
          ['4', '6', '7'],
          ['5', '7', '9'],
        ],
      },
    ]);
  });

  it('reads “Metamagic” whole where the PDF broke it with a soft hyphen, and keeps bullets as one list', () => {
    expect(s.levels[1].features[1].description).toContain('from “Metamagic Options” later');
    expect(s.levels[0].features[1].description).toContain(
      '• The spell save DC of your Sorcerer spells increases by 1.\n• You have Advantage on the attack rolls',
    );
  });

  it('Draconic Sorcery, to level 3, with its spell table', () => {
    const draconic = s.subclasses[0];
    expect([draconic.name, draconic.tagline, draconic.features.map(f => f.name)]).toEqual([
      'Draconic Sorcery',
      'Breathe the Magic of Dragons',
      ['Draconic Resilience', 'Draconic Spells'],
    ]);
    expect(draconic.features[1].tables![0].rows[0]).toEqual([
      '3',
      'Alter Self, Chromatic Orb, Command, Dragon’s Breath',
    ]);
  });
});

describe('Warlock (SRD 5.2.1 pages 70 to 76)', () => {
  const w = byId('warlock');

  it('core traits, with the spellcasting ability read from Pact Magic', () => {
    expect(w.hitDie).toBe('d8');
    expect(w.primaryAbilities).toEqual(['cha']);
    expect(w.saveProficiencies).toEqual(['wis', 'cha']);
    expect(w.skillChoices.from).toEqual([
      'arcana',
      'deception',
      'history',
      'intimidation',
      'investigation',
      'nature',
      'religion',
    ]);
    expect(w.weaponProficiencies).toBe('Simple weapons');
    expect(w.armorTraining).toEqual({ text: 'Light armor', categories: ['light'] });
    expect(w.startingEquipmentOptions).toEqual([
      {
        option: 'A',
        text: 'Leather Armor, Sickle, 2 Daggers, Arcane Focus (orb), Book (occult lore), Scholar’s Pack, and 15 GP',
      },
      { option: 'B', text: '100 GP' },
    ]);
    expect(w.spellcasting).toEqual({ ability: 'cha', preparation: 'prepared' });
  });

  it('the Warlock Features table, levels 1 to 3, with Pact Magic slots and their level', () => {
    expect(w.levels.map(l => [l.level, l.proficiencyBonus, l.features.map(f => f.name), l.columns])).toEqual([
      [
        1,
        2,
        ['Eldritch Invocations', 'Pact Magic'],
        { eldritchInvocations: 1, cantrips: 2, preparedSpells: 2, spellSlots: 1, slotLevel: 1 },
      ],
      [
        2,
        2,
        ['Magical Cunning'],
        { eldritchInvocations: 3, cantrips: 2, preparedSpells: 3, spellSlots: 2, slotLevel: 1 },
      ],
      [
        3,
        2,
        ['Warlock Subclass'],
        { eldritchInvocations: 3, cantrips: 2, preparedSpells: 4, spellSlots: 2, slotLevel: 2 },
      ],
    ]);
  });

  it('Fiend Patron, to level 3, with its spell table and nothing from the Wizard that follows', () => {
    const fiend = w.subclasses[0];
    expect([fiend.name, fiend.tagline, fiend.features.map(f => f.name)]).toEqual([
      'Fiend Patron',
      'Make a Deal with the Lower Planes',
      ['Dark One’s Blessing', 'Fiend Spells'],
    ]);
    expect(fiend.features[1].tables![0].rows).toEqual([
      ['3', 'Burning Hands, Command, Scorching Ray, Suggestion'],
      ['5', 'Fireball, Stinking Cloud'],
      ['7', 'Fire Shield, Wall of Fire'],
      ['9', 'Geas, Insect Plague'],
    ]);
  });
});

describe('Wizard (SRD 5.2.1 pages 77 to 82)', () => {
  const w = byId('wizard');
  const dash = '—';
  const noHigherSlots = {
    slots3: dash,
    slots4: dash,
    slots5: dash,
    slots6: dash,
    slots7: dash,
    slots8: dash,
    slots9: dash,
  };

  it('core traits, with a spellbook', () => {
    expect(w.hitDie).toBe('d6');
    expect(w.primaryAbilities).toEqual(['int']);
    expect(w.saveProficiencies).toEqual(['int', 'wis']);
    expect(w.skillChoices.from).toEqual([
      'arcana',
      'history',
      'insight',
      'investigation',
      'medicine',
      'nature',
      'religion',
    ]);
    expect(w.armorTraining).toEqual({ text: 'None', categories: [] });
    expect(w.startingEquipmentOptions).toEqual([
      { option: 'A', text: '2 Daggers, Arcane Focus (Quarterstaff), Robe, Spellbook, Scholar’s Pack, and 5 GP' },
      { option: 'B', text: '55 GP' },
    ]);
    expect(w.spellcasting).toEqual({ ability: 'int', preparation: 'spellbook' });
  });

  it('the Wizard Features table, levels 1 to 3', () => {
    expect(w.levels.map(l => [l.level, l.proficiencyBonus, l.features.map(f => f.name), l.columns])).toEqual([
      [
        1,
        2,
        ['Spellcasting', 'Ritual Adept', 'Arcane Recovery'],
        { cantrips: 3, preparedSpells: 4, slots1: 2, slots2: dash, ...noHigherSlots },
      ],
      [2, 2, ['Scholar'], { cantrips: 3, preparedSpells: 5, slots1: 3, slots2: dash, ...noHigherSlots }],
      [3, 2, ['Wizard Subclass'], { cantrips: 3, preparedSpells: 6, slots1: 4, slots2: 2, ...noHigherSlots }],
    ]);
  });

  it('lifts the spellbook sidebar out of the middle of a sentence, which closes up again', () => {
    expect(w.levels[2].features[0].description).toContain(
      'For the rest of your career, you gain each of your subclass’s features that are of your Wizard level or lower.',
    );
    expect(w.sidebars?.map(s => [s.title, s.text.split('\n\n').length])).toEqual([
      ['Expanding and Replacing a Spellbook', 4],
    ]);
    expect(w.sidebars![0].text.endsWith('many wizards keep a backup spellbook.')).toBe(true);
  });

  it('Evoker, to level 3', () => {
    expect(w.subclasses.map(s => [s.name, s.tagline, s.features.map(f => [f.level, f.name])])).toEqual([
      [
        'Evoker',
        'Create Explosive Elemental Effects',
        [
          [3, 'Evocation Savant'],
          [3, 'Potent Cantrip'],
        ],
      ],
    ]);
  });
});

describe('all twelve SRD classes', () => {
  it('are here, each with a subclass to level 3', () => {
    expect(SRD_CLASSES.map(c => c.name)).toEqual([
      'Barbarian',
      'Bard',
      'Cleric',
      'Druid',
      'Fighter',
      'Monk',
      'Paladin',
      'Ranger',
      'Rogue',
      'Sorcerer',
      'Warlock',
      'Wizard',
    ]);
    for (const c of SRD_CLASSES)
      expect(
        c.subclasses[0].features.some(f => f.level === 3),
        c.name,
      ).toBe(true);
  });
});

describe('equipmentOptions', () => {
  it('reads A, B and C choices', () => {
    expect(equipmentOptions('Choose A, B, or C: (A) Mace; (B) Spear; or (C) 50 GP')).toEqual([
      { option: 'A', text: 'Mace' },
      { option: 'B', text: 'Spear' },
      { option: 'C', text: '50 GP' },
    ]);
  });
});
