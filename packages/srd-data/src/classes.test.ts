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

describe('equipmentOptions', () => {
  it('reads A, B and C choices', () => {
    expect(equipmentOptions('Choose A, B, or C: (A) Mace; (B) Spear; or (C) 50 GP')).toEqual([
      { option: 'A', text: 'Mace' },
      { option: 'B', text: 'Spear' },
      { option: 'C', text: '50 GP' },
    ]);
  });
});
