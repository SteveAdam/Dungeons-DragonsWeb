import type { SrdArmor, SrdMonster, SrdSpell, SrdWeapon } from '@dnd-manager/srd-data/schemas';
import { describe, expect, it } from 'vitest';
import {
  challengeRatings,
  filterEquipment,
  filterMonsters,
  filterSpells,
  matchesSearch,
  NO_FILTERS,
} from './libraryFilters';

const spell = (name: string, level: number, classes: string[]) => ({ name, level, classes }) as SrdSpell;
const monster = (name: string, challengeRating: string, challengeValue: number) =>
  ({ name, challengeRating, challengeValue }) as SrdMonster;
const cleric = { name: 'Cleric', firstSlotAt: { '1': 1, '7': 13 } };
const wizard = { name: 'Wizard', firstSlotAt: { '1': 1, '9': 17 } };
const classes = [cleric, wizard];

const bless = spell('Bless', 1, ['Cleric']);
const regenerate = spell('Regenerate', 7, ['Cleric']);
const wish = spell('Wish', 9, ['Wizard']);
const odd = spell('Odd', 1, ['Artificer']);
const spells = [bless, regenerate, wish, odd];

const names = (list: { name: string }[]) => list.map(e => e.name);

describe('matchesSearch', () => {
  it('ignores case and stray spaces', () => {
    expect(matchesSearch('Regenerate', '  REGEN ')).toBe(true);
    expect(matchesSearch('Regenerate', 'wolf')).toBe(false);
    expect(matchesSearch('Regenerate', '')).toBe(true);
  });
});

describe('filterSpells', () => {
  it('shows everything with no filters', () => {
    expect(filterSpells(spells, classes, NO_FILTERS)).toHaveLength(4);
  });

  it('filters by class', () => {
    expect(names(filterSpells(spells, classes, { ...NO_FILTERS, className: 'Wizard' }))).toEqual(['Wish']);
  });

  it('filters by tier, and leaves out a spell whose tier is unknown', () => {
    expect(names(filterSpells(spells, classes, { ...NO_FILTERS, tiers: [3] }))).toEqual(['Regenerate']);
    expect(names(filterSpells(spells, classes, { ...NO_FILTERS, tiers: [1, 4] }))).toEqual(['Bless', 'Wish']);
  });

  it('combines class, tier and search', () => {
    expect(names(filterSpells(spells, classes, { ...NO_FILTERS, className: 'Cleric', tiers: [3] }))).toEqual([
      'Regenerate',
    ]);
    expect(filterSpells(spells, classes, { ...NO_FILTERS, className: 'Cleric', tiers: [3], search: 'bless' })).toEqual(
      [],
    );
  });

  it('has nothing on the campaign shelf yet', () => {
    expect(filterSpells(spells, classes, { ...NO_FILTERS, sources: ['campaign'] })).toEqual([]);
  });
});

describe('filterMonsters', () => {
  const monsters = [
    monster('Rat', '0', 0),
    monster('Wolf', '1/4', 0.25),
    monster('Ogre', '2', 2),
    monster('Lich', '21', 21),
  ];

  it('keeps a challenge rating range, both ends included', () => {
    expect(names(filterMonsters(monsters, { ...NO_FILTERS, crMin: 0.25, crMax: 2 }))).toEqual(['Wolf', 'Ogre']);
  });

  it('takes an open-ended range, and CR 0 counts as a real lower end', () => {
    expect(names(filterMonsters(monsters, { ...NO_FILTERS, crMin: 2 }))).toEqual(['Ogre', 'Lich']);
    expect(names(filterMonsters(monsters, { ...NO_FILTERS, crMax: 0 }))).toEqual(['Rat']);
  });

  it('searches by name', () => {
    expect(names(filterMonsters(monsters, { ...NO_FILTERS, search: 'WOL' }))).toEqual(['Wolf']);
  });

  it('lists the challenge ratings once each, in order', () => {
    expect(challengeRatings([...monsters].reverse().concat(monster('Dog', '1/4', 0.25))).map(c => c.label)).toEqual([
      '0',
      '1/4',
      '2',
      '21',
    ]);
  });
});

describe('filterEquipment', () => {
  const dagger = { name: 'Dagger', category: 'simple' } as SrdWeapon;
  const longsword = { name: 'Longsword', category: 'martial' } as SrdWeapon;
  const shield = { name: 'Shield', category: 'shield' } as SrdArmor;

  it('filters by category', () => {
    expect(names(filterEquipment([dagger, longsword], { ...NO_FILTERS, category: 'martial' }))).toEqual(['Longsword']);
    expect(names(filterEquipment([shield], { ...NO_FILTERS, category: 'shield' }))).toEqual(['Shield']);
  });

  it('searches, and leaves the campaign shelf empty', () => {
    expect(names(filterEquipment([dagger, longsword], { ...NO_FILTERS, search: 'dag' }))).toEqual(['Dagger']);
    expect(filterEquipment([dagger], { ...NO_FILTERS, sources: ['campaign'] })).toEqual([]);
  });
});
