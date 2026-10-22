import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convertSpecies } from './convertSpecies';
import { SRD_SPECIES } from './index';
import { SPECIES_SOURCES } from './speciesSources';

const source = (file: string) => readFileSync(new URL(`../source/${file}`, import.meta.url), 'utf8');
const byId = (id: string) => SRD_SPECIES.find(s => s.id === id)!;
const trait = (id: string, name: string) => byId(id).traits.find(t => t.name === name)!;

describe('the SRD species (SRD 5.2.1 pages 83 to 86)', () => {
  it('are exactly what the SRD pages in ../source give', () => {
    expect(
      convertSpecies(
        SPECIES_SOURCES,
        source('species.raw.txt'),
        source('species.flow.txt'),
        source('species.layout.txt'),
      ),
    ).toEqual(SRD_SPECIES);
  });

  it('are the nine SRD species, each Humanoid, with its size and speed', () => {
    expect(SRD_SPECIES.map(s => [s.name, s.creatureType, s.sizeOptions, s.speed])).toEqual([
      ['Dragonborn', 'Humanoid', ['medium'], 30],
      ['Dwarf', 'Humanoid', ['medium'], 30],
      ['Elf', 'Humanoid', ['medium'], 30],
      ['Gnome', 'Humanoid', ['small'], 30],
      ['Goliath', 'Humanoid', ['medium'], 35],
      ['Halfling', 'Humanoid', ['small'], 30],
      ['Human', 'Humanoid', ['small', 'medium'], 30],
      ['Orc', 'Humanoid', ['medium'], 30],
      ['Tiefling', 'Humanoid', ['small', 'medium'], 30],
    ]);
    expect(byId('human').sizeText).toBe(
      'Medium (about 4–7 feet tall) or Small (about 2–4 feet tall), chosen when you select this species',
    );
  });

  it('have their traits in the SRD’s order', () => {
    expect(SRD_SPECIES.map(s => [s.name, s.traits.map(t => t.name)])).toEqual(
      SPECIES_SOURCES.map(s => [s.name, s.traits]),
    );
    for (const s of SRD_SPECIES)
      for (const t of s.traits) expect(t.description.length, `${s.name} ${t.name}`).toBeGreaterThan(20);
  });

  it('join words the PDF split at the end of a line, keeping real hyphens', () => {
    expect(trait('dwarf', 'Stonecunning').description).toContain('you gain Tremorsense with a range of 60 feet');
    expect(trait('gnome', 'Gnomish Cunning').description).toBe(
      'You have Advantage on Intelligence, Wisdom, and Charisma saving throws.',
    );
    expect(trait('gnome', 'Gnomish Lineage').description).toContain('the spell’s ignite-extinguish effect');
    expect(trait('dragonborn', 'Breath Weapon').description).toContain('either a 15-foot Cone or a 30-foot Line');
  });

  it('keep paragraphs and option lists apart', () => {
    expect(trait('dragonborn', 'Breath Weapon').description.split('\n\n')).toHaveLength(2);
    const giant = trait('goliath', 'Giant Ancestry').description.split('\n\n');
    expect(giant.slice(2).map(p => p.split('.')[0])).toEqual([
      'Cloud’s Jaunt (Cloud Giant)',
      'Fire’s Burn (Fire Giant)',
      'Frost’s Chill (Frost Giant)',
      'Hill’s Tumble (Hill Giant)',
      'Stone’s Endurance (Stone Giant)',
      'Storm’s Thunder (Storm Giant)',
    ]);
  });

  it('read the Draconic Ancestors table, two dragons per printed line, left column first', () => {
    expect(trait('dragonborn', 'Draconic Ancestry').tables).toEqual([
      {
        title: 'Draconic Ancestors',
        columns: ['Dragon', 'Damage Type'],
        rows: [
          ['Black', 'Acid'],
          ['Blue', 'Lightning'],
          ['Brass', 'Fire'],
          ['Bronze', 'Lightning'],
          ['Copper', 'Acid'],
          ['Gold', 'Fire'],
          ['Green', 'Poison'],
          ['Red', 'Fire'],
          ['Silver', 'Cold'],
          ['White', 'Cold'],
        ],
      },
    ]);
  });

  it('split each lineage’s level 3 and level 5 spells where the printed table does', () => {
    expect(trait('elf', 'Elven Lineage').tables![0].rows.map(r => [r[0], r[2], r[3]])).toEqual([
      ['Drow', 'Faerie Fire', 'Darkness'],
      ['High Elf', 'Detect Magic', 'Misty Step'],
      ['Wood Elf', 'Longstrider', 'Pass without Trace'],
    ]);
    expect(trait('tiefling', 'Fiendish Legacy').tables![0].rows.map(r => [r[0], r[2], r[3]])).toEqual([
      ['Abyssal', 'Ray of Sickness', 'Hold Person'],
      ['Chthonic', 'False Life', 'Ray of Enfeeblement'],
      ['Infernal', 'Hellish Rebuke', 'Darkness'],
    ]);
    expect(trait('elf', 'Elven Lineage').tables![0].rows[0][1]).toBe(
      'The range of your Darkvision increases to 120 feet. You also know the Dancing Lights cantrip.',
    );
  });

  it('keep a table out of the text it was printed next to (Elven Lineages sits inside the Goliath’s column)', () => {
    expect(trait('goliath', 'Giant Ancestry').description).not.toContain('Lineage');
    expect(trait('elf', 'Elven Lineage').description).toContain(
      'Intelligence, Wisdom, or Charisma is your spellcasting ability for the spells you cast with this trait',
    );
  });
});
