import { readFileSync } from 'node:fs';
import { cantripDamageDice, castSpell, freshSlots, type SpellDef } from '@dnd-manager/rules-engine';
import { describe, expect, it } from 'vitest';
import { convertSpells } from './convertSpells';
import { SRD_SPELLS } from './index';
import { SPELL_BATCH } from './spellSources';

const source = (file: string) => readFileSync(new URL(`../source/${file}`, import.meta.url), 'utf8');
const all = convertSpells(source('spells.raw.txt'), source('spells.flow.txt'));
const byName = (name: string) => SRD_SPELLS.find(s => s.name === name)!;

describe('the SRD spells (SRD 5.2.1 pages 107 to 175)', () => {
  it('are read from every entry in the chapter: 339 spells, from Acid Arrow to Zone of Truth', () => {
    expect(all).toHaveLength(339);
    expect([all[0].name, all[all.length - 1].name]).toEqual(['Acid Arrow', 'Zone of Truth']);
    expect(new Set(all.map(s => s.id)).size).toBe(339);
  });

  it('ship the batches checked so far, exactly as the SRD text gives them', () => {
    expect(SRD_SPELLS).toEqual(all.filter(s => s.level <= SPELL_BATCH.maxLevel || SPELL_BATCH.extras.includes(s.name)));
  });

  it('include all 27 SRD cantrips', () => {
    expect(SRD_SPELLS.filter(s => s.level === 0).map(s => s.name)).toEqual([
      'Acid Splash',
      'Chill Touch',
      'Dancing Lights',
      'Druidcraft',
      'Eldritch Blast',
      'Elementalism',
      'Fire Bolt',
      'Guidance',
      'Light',
      'Mage Hand',
      'Mending',
      'Message',
      'Minor Illusion',
      'Poison Spray',
      'Prestidigitation',
      'Produce Flame',
      'Ray of Frost',
      'Resistance',
      'Sacred Flame',
      'Shillelagh',
      'Shocking Grasp',
      'Sorcerous Burst',
      'Spare the Dying',
      'Starry Wisp',
      'Thaumaturgy',
      'True Strike',
      'Vicious Mockery',
    ]);
  });

  it('read the heading, casting time, range, components and duration', () => {
    const acid = all.find(s => s.name === 'Acid Arrow')!;
    expect([
      acid.level,
      acid.school,
      acid.castingTime,
      acid.range,
      acid.components,
      acid.duration,
      acid.classes,
    ]).toEqual([
      2,
      'evocation',
      'Action',
      '90 feet',
      { v: true, s: true, m: true, materialText: 'powdered rhubarb leaf' },
      'Instantaneous',
      ['Wizard'],
    ]);
    const aid = all.find(s => s.name === 'Aid')!;
    expect(aid.classes).toEqual(['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger']);
    const alarm = all.find(s => s.name === 'Alarm')!;
    expect([alarm.castingTime, alarm.ritual]).toEqual(['1 minute or Ritual', true]);
    expect(byName('Dancing Lights').concentration).toBe(true);
    // the SRD prints Barkskin's line as "Component:"
    expect(all.find(s => s.name === 'Barkskin')!.components.m).toBe(true);
  });

  it('read a material cost and whether the spell consumes it', () => {
    const revivify = all.find(s => s.name === 'Revivify')!;
    expect(revivify.components).toMatchObject({ m: true, costGp: 300, consumed: true });
  });

  it('keep paragraphs, option headings and the upgrade text apart, with words closed up across line breaks', () => {
    expect(
      byName('Druidcraft')
        .text.split('\n\n')
        .map(p => p.split('.')[0]),
    ).toEqual([
      'Whispering to the spirits of nature, you create one of the following effects within range',
      'Weather Sensor',
      'Bloom',
      'Sensory Effect',
      'Fire Play',
    ]);
    expect(byName('Dancing Lights').text).toContain('Dim Light in a 10-foot radius');
    expect(byName('Acid Splash').higherLevels).toBe(
      'Cantrip Upgrade. The damage increases by 1d6 when you reach levels 5 (2d6), 11 (3d6), and 17 (4d6).',
    );
  });

  it('record mechanics only where the text states them', () => {
    expect(byName('Fire Bolt').mechanics).toEqual({
      attack: true,
      damage: { dice: '1d10', type: 'fire' },
      cantripScaling: true,
    });
    expect(byName('Sacred Flame').mechanics?.save).toEqual({ ability: 'dex', onSuccess: 'none' });
    // Eldritch Blast gains beams, Shillelagh changes its die, Spare the Dying its range: no damage-dice scaling
    for (const name of ['Eldritch Blast', 'Shillelagh', 'Spare the Dying']) {
      expect(byName(name).mechanics?.cantripScaling, name).toBeUndefined();
    }
    // Sorcerous Burst's damage type is the caster's choice, so it records no damage
    expect(byName('Sorcerous Burst').mechanics?.damage).toBeUndefined();
    expect(byName('Prestidigitation').mechanics).toBeUndefined();
  });

  it('feed the engine: Fire Bolt does 2d10 at level 5, and a cantrip spends no slot', () => {
    const fireBolt: SpellDef = byName('Fire Bolt');
    expect(cantripDamageDice(fireBolt.mechanics!.damage!.dice, 5)).toBe('2d10');
    expect(castSpell(freshSlots(Array(9).fill(0)), fireBolt).errors).toEqual([]);
  });
});
