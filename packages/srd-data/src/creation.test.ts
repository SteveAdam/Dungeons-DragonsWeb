// P2-9: the creation rules (packages/rules-engine creation.ts) checked against the real SRD records.
import {
  buildCharacter,
  computeSheet,
  creationProblems,
  previewItems,
  readEquipmentOption,
  type CreationChoices,
  type CreationSrd,
} from '@dnd-manager/rules-engine';
import { describe, expect, it } from 'vitest';
import { SRD_ARMOR, SRD_BACKGROUNDS, SRD_CLASSES, SRD_SPECIES, SRD_SPELLS, SRD_WEAPONS } from './index';

const srd: CreationSrd = {
  species: SRD_SPECIES,
  classes: SRD_CLASSES,
  backgrounds: SRD_BACKGROUNDS,
  spells: SRD_SPELLS,
  weapons: SRD_WEAPONS,
  armor: SRD_ARMOR,
};
const noDetails = { personalityTraits: '', ideals: '', bonds: '', flaws: '', appearance: '', backstory: '' };

/** Brannoc's level 1 self: a human Fighter and Soldier with the standard array. */
const fighter: CreationChoices = {
  name: 'Brannoc',
  species: 'human',
  size: 'medium',
  class: 'fighter',
  background: 'soldier',
  abilities: { method: 'standard', base: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 } },
  backgroundBonus: { plus2: 'str', plus1: 'con' },
  skills: ['perception', 'survival'],
  equipment: { class: 'A', background: 'A' },
  spells: { cantrips: [], prepared: [], spellbook: [] },
  alignment: 'Lawful neutral',
  details: noDetails,
};

const wizard: CreationChoices = {
  ...fighter,
  name: 'Sera',
  species: 'elf',
  size: undefined,
  class: 'wizard',
  background: 'sage',
  abilities: { method: 'pointBuy', base: { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 8 } },
  backgroundBonus: { plus2: 'int', plus1: 'con' },
  skills: ['investigation', 'insight'],
  spells: {
    cantrips: ['Fire Bolt', 'Light', 'Mage Hand'],
    spellbook: ['Detect Magic', 'Feather Fall', 'Mage Armor', 'Magic Missile', 'Sleep', 'Thunderwave'],
    prepared: ['Mage Armor', 'Magic Missile', 'Sleep', 'Thunderwave'],
  },
};

const messages = (c: CreationChoices, totals?: number[]) => creationProblems(c, srd, totals).map(p => p.message);

describe('creating a level 1 character from the SRD (P2-9)', () => {
  it('a Fighter with the standard array and the Soldier background has a correct level 1 sheet', () => {
    expect(creationProblems(fighter, srd)).toEqual([]);
    const built = buildCharacter(fighter, srd);
    // Strength 15 + 2, Constitution 14 + 1: hit points are the d10's 10 plus Constitution +2
    expect(built.sheet.abilityScores).toEqual({ str: 17, dex: 13, con: 15, int: 8, wis: 12, cha: 10 });
    expect(built.sheet.hp).toEqual({ max: 12, current: 12, temp: 0 });
    expect(built.sheet.hitDice).toEqual({ die: 'd10', total: 1, spent: 0 });
    expect(built.sheet.saveProficiencies).toEqual(['str', 'con']);
    expect(built.sheet.skillProficiencies).toEqual(['athletics', 'intimidation', 'perception', 'survival']);
    expect([built.sheet.originFeat, built.sheet.speed, built.sheet.weaponProficiencies]).toEqual([
      'Savage Attacker',
      30,
      ['simple', 'martial'],
    ]);
    // 4 GP from the Fighter's option A and 14 GP from the Soldier's
    expect(built.gp).toBe(18);

    const sheet = computeSheet(built.sheet, [], { seconds: 0 }, undefined, previewItems(built));
    expect([sheet.level, sheet.proficiencyBonus, sheet.hp.max]).toEqual([1, 2, 12]);
    // chain mail, worn at once: 16 (heavy armour adds no Dexterity)
    expect(sheet.armorClass.value).toBe(16);
    const greatsword = sheet.attacks.find(a => a.name === 'Greatsword')!;
    expect([greatsword.bonus, greatsword.damage]).toEqual([5, '2d6+3']);
  });

  it('reads the equipment options as the SRD prints them', () => {
    const fighterA = readEquipmentOption(
      SRD_CLASSES.find(c => c.id === 'fighter')!.startingEquipmentOptions[0].text,
      srd,
    );
    expect(fighterA.items.map(i => [i.name, i.quantity, i.kind])).toEqual([
      ['Chain Mail', 1, 'armor'],
      ['Greatsword', 1, 'weapon'],
      ['Flail', 1, 'weapon'],
      ['Javelin', 8, 'weapon'],
      ['Dungeoneer’s Pack', 1, 'gear'],
    ]);
    expect(fighterA.gp).toBe(4);
    expect(readEquipmentOption('155 GP', srd)).toEqual({ items: [], gp: 155 });
    const soldierA = readEquipmentOption(SRD_BACKGROUNDS.find(b => b.id === 'soldier')!.equipmentOptions[0].text, srd);
    expect(soldierA.items.find(i => i.name === 'Arrows')).toMatchObject({ quantity: 20, kind: 'gear' });
  });

  it('a Wizard with point buy, the Sage background and a spellbook of six', () => {
    expect(creationProblems(wizard, srd)).toEqual([]);
    const built = buildCharacter(wizard, srd);
    expect(built.sheet.hp.max).toBe(6 + 2);
    expect(built.sheet.spells).toEqual(wizard.spells);
    // P2-11: Intelligence 15 + 2 = 17 (+3) and proficiency +2: save DC 13, spell attack +5
    expect(computeSheet(built.sheet, [], { seconds: 0 }).spellcasting).toEqual({
      ability: 'int',
      label: 'Intelligence',
      saveDc: 13,
      attackBonus: 5,
    });
    expect(computeSheet(buildCharacter(fighter, srd).sheet, [], { seconds: 0 }).spellcasting).toBeUndefined();
    expect(built.sheet.weaponProficiencies).toEqual(['simple']);
    // the Quarterstaff in "Arcane Focus (Quarterstaff)" is a focus, kept as gear; the daggers are weapons
    expect(built.items.filter(i => i.kind === 'weapon').map(i => [i.name, i.quantity, i.equipped])).toEqual([
      ['Dagger', 2, true],
      ['Quarterstaff', 1, true],
    ]);
  });

  it('rejects point buy over 27 points, and scores outside 8 to 15', () => {
    const over = {
      ...wizard,
      abilities: { method: 'pointBuy' as const, base: { str: 15, dex: 15, con: 15, int: 10, wis: 8, cha: 8 } },
    };
    expect(messages(over)).toContain('That costs 29 points; you have 27.');
    const high = {
      ...wizard,
      abilities: { method: 'pointBuy' as const, base: { str: 16, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } },
    };
    expect(messages(high)).toContain('With point buy, every score is from 8 to 15.');
  });

  it('rejects the standard array used twice', () => {
    const twice = {
      ...fighter,
      abilities: { method: 'standard' as const, base: { str: 15, dex: 15, con: 14, int: 8, wis: 12, cha: 10 } },
    };
    expect(messages(twice)).toEqual(["Use each of the standard array's scores once: 15, 14, 13, 12, 10, 8."]);
  });

  it('rejects rolled scores that are not the ones the server rolled', () => {
    const rolled = {
      ...fighter,
      abilities: { method: 'roll' as const, base: { str: 18, dex: 13, con: 14, int: 8, wis: 12, cha: 10 } },
    };
    expect(messages(rolled)).toContain('Roll your ability scores first.');
    expect(messages(rolled, [15, 13, 14, 8, 12, 10])).toContain(
      'Use each of your rolled scores once: 15, 13, 14, 8, 12, 10.',
    );
    expect(messages(rolled, [18, 13, 14, 8, 12, 10])).toEqual([]);
  });

  it('rejects background increases the background does not offer, or above 20', () => {
    expect(messages({ ...fighter, backgroundBonus: { plus2: 'cha', plus1: 'str' } })).toContain(
      'Soldier can raise only str, dex, con, not cha',
    );
  });

  it('rejects a skill outside the class list, a background skill, and the wrong number', () => {
    expect(messages({ ...fighter, skills: ['perception', 'arcana'] })).toEqual(['Fighters cannot choose arcana.']);
    expect(messages({ ...fighter, skills: ['perception', 'athletics'] })).toEqual([
      'Your background already gives athletics; choose another.',
    ]);
    expect(messages({ ...fighter, skills: ['perception'] })).toEqual(['Choose 2 skills from the Fighter list.']);
  });

  it('rejects equipment options and spells the class does not have', () => {
    expect(messages({ ...wizard, equipment: { class: 'C', background: 'A' } })).toEqual([
      "Choose one of the Wizard's equipment options.",
    ]);
    expect(messages({ ...fighter, spells: { cantrips: ['Fire Bolt'], prepared: [], spellbook: [] } })).toContain(
      'Fire Bolt is not a level 0 Fighter spell.',
    );
    const greedy = {
      ...wizard,
      spells: { ...wizard.spells, cantrips: ['Fire Bolt', 'Light', 'Mage Hand', 'Mending'] },
    };
    expect(messages(greedy)).toEqual(['Choose 3 cantrips.']);
    const offList = {
      ...wizard,
      spells: { ...wizard.spells, prepared: ['Mage Armor', 'Magic Missile', 'Sleep', 'Cure Wounds'] },
    };
    expect(messages(offList)).toEqual([
      'Prepare spells from your spellbook.',
      'Cure Wounds is not a level 1 Wizard spell.',
    ]);
  });

  it('asks a Human or Tiefling to choose a size, and checks the name and alignment', () => {
    expect(messages({ ...fighter, size: undefined })).toEqual(['Choose your size: small or medium.']);
    expect(messages({ ...fighter, name: '  ', alignment: 'Sneaky' })).toEqual([
      'Give your character a name of up to 80 letters.',
      'Alignment is one of: Lawful good, Neutral good, Chaotic good, Lawful neutral, Neutral, Chaotic neutral, Lawful evil, Neutral evil, Chaotic evil.',
    ]);
  });
});
