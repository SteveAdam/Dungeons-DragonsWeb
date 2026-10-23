// P2-10: levelling up (packages/rules-engine levelup.ts) with the real SRD class tables, levels 1 to 3.
import {
  applyLevelUp,
  buildCharacter,
  computeSheet,
  levelUpPlan,
  levelUpProblems,
  pendingLevels,
  slotsFor,
  type CharacterSheet,
  type CreationChoices,
  type CreationSrd,
  type LevelUpChoices,
  type LevelUpClass,
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
const cls = (id: string) => SRD_CLASSES.find(c => c.id === id)! as LevelUpClass;
const noDetails = { personalityTraits: '', ideals: '', bonds: '', flaws: '', appearance: '', backstory: '' };
const base: CreationChoices = {
  name: 'Hero',
  species: 'dwarf',
  class: 'fighter',
  background: 'soldier',
  abilities: { method: 'standard', base: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 } },
  backgroundBonus: { plus2: 'str', plus1: 'con' },
  skills: ['perception', 'survival'],
  equipment: { class: 'A', background: 'A' },
  spells: { cantrips: [], prepared: [], spellbook: [] },
  alignment: '',
  details: noDetails,
};

/** A level 1 character from the creation rules, then given 900 XP (level 3 by XP). */
function level1(choices: CreationChoices): CharacterSheet {
  return { ...buildCharacter(choices, srd).sheet, xp: 900 };
}
const fighter = () => level1(base);
const wizard = () =>
  level1({
    ...base,
    species: 'elf',
    class: 'wizard',
    background: 'sage',
    abilities: { method: 'standard', base: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 } },
    backgroundBonus: { plus2: 'int', plus1: 'con' },
    skills: ['investigation', 'medicine'],
    spells: {
      cantrips: ['Fire Bolt', 'Light', 'Mage Hand'],
      spellbook: ['Detect Magic', 'Feather Fall', 'Mage Armor', 'Magic Missile', 'Sleep', 'Thunderwave'],
      prepared: ['Mage Armor', 'Magic Missile', 'Sleep', 'Thunderwave'],
    },
  });
const cleric = () =>
  level1({
    ...base,
    class: 'cleric',
    background: 'acolyte',
    abilities: { method: 'standard', base: { str: 13, dex: 10, con: 14, int: 8, wis: 15, cha: 12 } },
    backgroundBonus: { plus2: 'wis', plus1: 'cha' },
    skills: ['medicine', 'persuasion'],
    spells: {
      cantrips: ['Guidance', 'Sacred Flame', 'Thaumaturgy'],
      spellbook: [],
      prepared: ['Bless', 'Cure Wounds', 'Healing Word', 'Shield of Faith'],
    },
  });

const none = { cantrips: [], prepared: [], spellbook: [] };
const average = (toLevel: number, extra: Partial<LevelUpChoices> = {}): LevelUpChoices => ({
  toLevel,
  hitPoints: { method: 'average' },
  spells: none,
  ...extra,
});
const messages = (sheet: CharacterSheet, c: LevelUpChoices, id: string, rolledHitDie?: number) =>
  levelUpProblems(sheet, c, cls(id), SRD_SPELLS, { rolledHitDie }).map(p => p.message);

describe('levelling up with the SRD class tables (P2-10)', () => {
  it('a Fighter goes from 1 to 2 to 3: Action Surge, then the Champion, 12 + 8 + 8 hit points', () => {
    const one = fighter();
    expect(pendingLevels(one)).toBe(2);
    const plan2 = levelUpPlan(one, cls('fighter'));
    expect([plan2.toLevel, plan2.averageRoll, plan2.features.map(f => f.name)]).toEqual([
      2,
      6,
      ['Action Surge', 'Tactical Mind'],
    ]);
    expect(messages(one, average(2), 'fighter')).toEqual([]);
    const two = applyLevelUp(one, average(2), cls('fighter'));
    // d10 average 6, Constitution 15 (+2)
    expect([two.levelApplied, two.hp.max, two.hp.current, two.hitDice.total]).toEqual([2, 20, 20, 2]);

    const plan3 = levelUpPlan(two, cls('fighter'));
    expect(plan3.subclassChoice?.map(s => s.name)).toEqual(['Champion']);
    expect(messages(two, average(3), 'fighter')).toEqual(['Choose your Fighter subclass.']);
    const three = applyLevelUp(two, average(3, { subclass: 'champion' }), cls('fighter'));
    expect([three.levelApplied, three.hp.max, three.subclass]).toEqual([3, 28, 'champion']);
    expect(levelUpPlan(three, cls('fighter')).features.map(f => f.name)).toEqual([]);
    expect(pendingLevels(three)).toBe(0);
    const sheet = computeSheet(three, [], { seconds: 0 });
    expect([sheet.level, sheet.proficiencyBonus, sheet.hp.max]).toEqual([3, 2, 28]);
  });

  it('a Wizard adds two spellbook spells a level, prepares one more, and gets level 2 slots at 3', () => {
    const one = wizard();
    const plan2 = levelUpPlan(one, cls('wizard'));
    expect(plan2.spells).toEqual({ cantrips: 0, prepared: 1, spellbook: 2, maxSpellLevel: 1 });
    expect(messages(one, average(2), 'wizard')).toEqual([
      'Choose 2 new spellbook spells.',
      'Choose 1 new prepared spell.',
    ]);
    const two = applyLevelUp(
      one,
      average(2, { spells: { cantrips: [], spellbook: ['Shield', 'Grease'], prepared: ['Shield'] } }),
      cls('wizard'),
    );
    // d6 average 4, Constitution 14 (+2)
    expect(two.hp.max).toBe(8 + 6);
    expect(two.spells?.spellbook).toHaveLength(8);

    const plan3 = levelUpPlan(two, cls('wizard'));
    expect([plan3.spells.maxSpellLevel, plan3.slots.slice(0, 2)]).toEqual([2, [4, 2]]);
    const spells3 = { cantrips: [], spellbook: ['Blur', 'Augury'], prepared: ['Blur'] };
    expect(messages(two, average(3, { subclass: 'evoker', spells: spells3 }), 'wizard')).toEqual([]);
    const three = applyLevelUp(two, average(3, { subclass: 'evoker', spells: spells3 }), cls('wizard'));
    expect([three.levelApplied, three.hp.max, three.spells?.prepared.length, three.subclass]).toEqual([
      3,
      20,
      6,
      'evoker',
    ]);
    expect(slotsFor(cls('wizard'), 3).slice(0, 2)).toEqual([4, 2]);
  });

  it('a Cleric prepares one more spell at 2 and at 3, with level 2 spells and the Life Domain at 3', () => {
    const one = cleric();
    const two = applyLevelUp(one, average(2, { spells: { ...none, prepared: ['Sanctuary'] } }), cls('cleric'));
    // d8 average 5, Constitution 14 (+2)
    expect(two.hp.max).toBe(10 + 7);
    expect(
      messages(two, average(3, { subclass: 'life-domain', spells: { ...none, prepared: ['Aid'] } }), 'cleric'),
    ).toEqual([]);
    expect(
      messages(two, average(3, { subclass: 'life-domain', spells: { ...none, prepared: ['Fireball'] } }), 'cleric'),
    ).toEqual(['Fireball is not a Cleric prepared spell you can take at level 3.']);
    const three = applyLevelUp(
      two,
      average(3, { subclass: 'life-domain', spells: { ...none, prepared: ['Aid'] } }),
      cls('cleric'),
    );
    expect([three.levelApplied, three.hp.max, three.spells?.prepared.length]).toEqual([3, 24, 6]);
  });

  it('cannot apply without a pending level, or with choices for the wrong level', () => {
    expect(messages({ ...fighter(), xp: 0 }, average(2), 'fighter')).toEqual([
      'No level-up is waiting: the character needs more XP.',
    ]);
    expect(messages(fighter(), average(3), 'fighter')).toEqual(['These choices are for level 3; the next level is 2.']);
    expect(messages(fighter(), average(2, { subclass: 'champion' }), 'fighter')).toEqual([
      'Level 2 gives no subclass choice.',
    ]);
  });

  it('applies several pending levels in order, and stops where the content ends', () => {
    let sheet = fighter();
    sheet = applyLevelUp(sheet, average(2), cls('fighter'));
    sheet = applyLevelUp(sheet, average(3, { subclass: 'champion' }), cls('fighter'));
    sheet = { ...sheet, xp: 2700 };
    expect(pendingLevels(sheet)).toBe(1);
    expect(levelUpPlan(sheet, cls('fighter')).available).toBe(false);
    expect(messages(sheet, average(4), 'fighter')).toEqual(['Content for this level is not available yet.']);
  });

  it('a rolled hit point gain stays within the die; the average is half the die plus 1', () => {
    const roll = (toLevel: number): LevelUpChoices => ({
      ...average(toLevel),
      hitPoints: { method: 'roll', rollId: 'r1' },
    });
    expect(messages(fighter(), roll(2), 'fighter')).toEqual(['Roll your Hit Point Die first.']);
    expect(messages(fighter(), roll(2), 'fighter', 11)).toEqual(['A d10 roll is from 1 to 10.']);
    expect(messages(fighter(), roll(2), 'fighter', 0)).toEqual(['A d10 roll is from 1 to 10.']);
    expect(applyLevelUp(fighter(), roll(2), cls('fighter'), 1).hp.max).toBe(12 + 1 + 2);
    expect(
      ['d6', 'd8', 'd10', 'd12'].map(
        d => levelUpPlan(fighter(), { ...cls('fighter'), hitDie: d as never }).averageRoll,
      ),
    ).toEqual([4, 5, 6, 7]);
  });

  it('an Ability Score Improvement never raises a score above 20, and feats wait for later', () => {
    // the SRD's first Ability Score Improvement is at level 4; a test class gives one at level 2
    const asi = {
      ...cls('fighter'),
      levels: cls('fighter').levels.map(l =>
        l.level === 2 ? { ...l, features: [{ level: 2, name: 'Ability Score Improvement', description: '' }] } : l,
      ),
    };
    const sheet = { ...fighter(), abilityScores: { ...fighter().abilityScores, str: 19 } };
    const p = (c: LevelUpChoices, feats = false) =>
      levelUpProblems(sheet, c, asi, SRD_SPELLS, { optionalFeats: feats }).map(x => x.message);
    expect(p(average(2))).toEqual(['Choose an Ability Score Improvement.']);
    expect(p(average(2, { improvement: { plus2: 'str' } }))).toEqual(['That would raise str to 21; the most is 20.']);
    expect(p(average(2, { improvement: { plus1: ['str', 'dex'] } }))).toEqual([]);
    expect(p(average(2, { improvement: { plus1: ['str', 'str'] } }))).toEqual([
      'Choose two different abilities for +1 each.',
    ]);
    expect(p(average(2, { improvement: { feat: 'Alert' } }))).toEqual([
      'This campaign does not use feats: improve your ability scores.',
    ]);
    expect(p(average(2, { improvement: { feat: 'Alert' } }), true)).toEqual([
      'Feats arrive later: improve your ability scores for now.',
    ]);
    // +1 Constitution (15 to 16) raises the earlier level's hit points too
    const up = applyLevelUp(sheet, average(2, { improvement: { plus1: ['con', 'dex'] } }), asi);
    expect([up.abilityScores.con, up.hp.max]).toEqual([16, 12 + 6 + 3 + 1]);
  });
});
