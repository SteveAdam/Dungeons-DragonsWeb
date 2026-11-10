import { describe, expect, it } from 'vitest';
import { spellFirstLevel, spellTier, spellTierGap, tierOfPlay } from './spellTier';

const cleric = {
  name: 'Cleric',
  firstSlotAt: { '1': 1, '2': 3, '3': 5, '4': 7, '5': 9, '6': 11, '7': 13, '8': 15, '9': 17 },
};
const warlock = { name: 'Warlock', firstSlotAt: { '1': 1, '2': 3, '3': 5, '4': 7, '5': 9 } };
const paladin = { name: 'Paladin', firstSlotAt: { '1': 1, '2': 5, '3': 9, '4': 13, '5': 17 } };
const classes = [cleric, warlock, paladin];

describe('tierOfPlay', () => {
  it.each([
    [1, 1],
    [4, 1],
    [5, 2],
    [10, 2],
    [11, 3],
    [16, 3],
    [17, 4],
    [20, 4],
  ])('level %i is tier %i', (level, tier) => {
    expect(tierOfPlay(level)).toBe(tier);
  });
});

describe('spellTier', () => {
  it('puts a 1st-level cleric spell in tier 1', () => {
    expect(spellTier({ level: 1, classes: ['Cleric'] }, classes)).toBe(1);
  });

  it('puts a 7th-level cleric spell such as Regenerate in tier 3, first slots at level 13', () => {
    const regenerate = { level: 7, classes: ['Cleric'] };
    expect(spellFirstLevel(regenerate, classes)).toBe(13);
    expect(spellTier(regenerate, classes)).toBe(3);
  });

  it('puts every cantrip in tier 1', () => {
    expect(spellTier({ level: 0, classes: ['Cleric'] }, classes)).toBe(1);
    expect(spellTier({ level: 0, classes: ['Nobody'] }, [])).toBe(1);
  });

  it('takes the lowest level among the classes', () => {
    expect(spellFirstLevel({ level: 2, classes: ['Paladin', 'Cleric'] }, classes)).toBe(3);
    expect(spellTier({ level: 2, classes: ['Paladin'] }, classes)).toBe(2);
  });

  it('passes over a class that has a table but never a slot of that level', () => {
    expect(spellFirstLevel({ level: 6, classes: ['Warlock', 'Cleric'] }, classes)).toBe(11);
  });

  it('is unknown when a class table is missing, and says so', () => {
    const spell = { name: 'Odd Spell', level: 1, classes: ['Cleric', 'Artificer'] };
    expect(spellTier(spell, classes)).toBe('unknown');
    expect(spellTierGap(spell, classes)).toBe('Odd Spell: no class table for Artificer');
  });

  it('is unknown when a class has no slot table at all', () => {
    expect(spellTier({ level: 1, classes: ['Fighter'] }, [{ name: 'Fighter' }])).toBe('unknown');
  });

  it('is unknown when no class gains a slot of that level', () => {
    const spell = { name: 'Pact Secret', level: 6, classes: ['Warlock'] };
    expect(spellTier(spell, classes)).toBe('unknown');
    expect(spellTierGap(spell, classes)).toBe('Pact Secret: no class gains a level 6 slot');
  });

  it('reports no gap for a known tier', () => {
    expect(spellTierGap({ name: 'Bless', level: 1, classes: ['Cleric'] }, classes)).toBeNull();
  });
});
