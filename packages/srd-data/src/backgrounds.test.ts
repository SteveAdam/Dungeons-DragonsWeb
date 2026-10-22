import { readFileSync } from 'node:fs';
import { applyBackground } from '@dnd-manager/rules-engine';
import { describe, expect, it } from 'vitest';
import { convertBackgrounds } from './convertBackgrounds';
import { SRD_BACKGROUNDS } from './index';

const source = (file: string) => readFileSync(new URL(`../source/${file}`, import.meta.url), 'utf8');
const byId = (id: string) => SRD_BACKGROUNDS.find(b => b.id === id)!;

describe('the SRD backgrounds (SRD 5.2.1 page 83, with Origin feats from page 87)', () => {
  it('are exactly what the SRD pages in ../source give', () => {
    expect(convertBackgrounds(source('species.raw.txt'), source('feats.raw.txt'), source('feats.flow.txt'))).toEqual(
      SRD_BACKGROUNDS,
    );
  });

  it('are the four SRD backgrounds with their abilities, feat, skills and tool', () => {
    expect(
      SRD_BACKGROUNDS.map(b => [b.name, b.abilityScores, b.originFeat.name, b.skillProficiencies, b.toolProficiency]),
    ).toEqual([
      ['Acolyte', ['int', 'wis', 'cha'], 'Magic Initiate (Cleric)', ['insight', 'religion'], 'Calligrapher’s Supplies'],
      ['Criminal', ['dex', 'con', 'int'], 'Alert', ['sleightOfHand', 'stealth'], 'Thieves’ Tools'],
      ['Sage', ['con', 'int', 'wis'], 'Magic Initiate (Wizard)', ['arcana', 'history'], 'Calligrapher’s Supplies'],
      [
        'Soldier',
        ['str', 'dex', 'con'],
        'Savage Attacker',
        ['athletics', 'intimidation'],
        'Choose one kind of Gaming Set (see “Equipment”)',
      ],
    ]);
  });

  it('read the equipment choice, joining words split at the end of a line', () => {
    expect(byId('sage').equipmentOptions).toEqual([
      { option: 'A', text: 'Quarterstaff, Calligrapher’s Supplies, Book (history), Parchment (8 sheets), Robe, 8 GP' },
      { option: 'B', text: '50 GP' },
    ]);
    for (const b of SRD_BACKGROUNDS) expect(b.equipmentOptions[1]).toEqual({ option: 'B', text: '50 GP' });
  });

  it('carry the Origin feat’s text from “Feats”, one paragraph per benefit', () => {
    expect(
      byId('criminal')
        .originFeat.description.split('\n\n')
        .map(p => p.split('.')[0]),
    ).toEqual(['You gain the following benefits', 'Initiative Proficiency', 'Initiative Swap']);
    expect(byId('acolyte').originFeat.description).toBe(byId('sage').originFeat.description);
    expect(byId('soldier').originFeat.description).toBe(
      'You’ve trained to deal particularly damaging strikes. Once per turn when you hit a target with a weapon, you can roll the weapon’s damage dice twice and use either roll against the target.',
    );
  });

  it('feed applyBackground: a Soldier can put +2 in Strength and +1 in Constitution, but not touch Wisdom', () => {
    const scores = { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 };
    expect(applyBackground(scores, byId('soldier'), { plus2: 'str', plus1: 'con' })).toEqual({
      ...scores,
      str: 17,
      con: 15,
    });
    expect(() => applyBackground(scores, byId('soldier'), { plus2: 'wis', plus1: 'str' })).toThrow(RangeError);
    expect(applyBackground(scores, byId('sage'), { plusOneEach: true })).toEqual({
      ...scores,
      con: 15,
      int: 9,
      wis: 13,
    });
  });
});
