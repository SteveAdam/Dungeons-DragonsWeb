import { readFileSync } from 'node:fs';
import { averageDamage, damagePerRound, parseHitDice, xpForChallengeRating } from '@dnd-manager/rules-engine';
import { describe, expect, it } from 'vitest';
import { convertMonsters } from './convertMonsters';
import { crBenchmarks } from './crBenchmarks';
import { monsterSchema } from './schemas';

const source = (file: string) => readFileSync(new URL(`../source/${file}`, import.meta.url), 'utf8');
const all = convertMonsters(source('monsters.raw.txt'), source('monsters.flow.txt'));
const shipped = monsterSchema
  .array()
  .parse(JSON.parse(readFileSync(new URL('../data/monsters.json', import.meta.url), 'utf8')));
const byName = (name: string) => all.find(m => m.name === name)!;

describe('the SRD monsters (SRD 5.2.1 pages 258 to 364)', () => {
  it('reads every stat block in the chapters: one for each AC line in the text', () => {
    const acLines = source('monsters.raw.txt').match(/^AC \d/gm);
    expect(all).toHaveLength(acLines!.length);
    expect(all).toHaveLength(330);
    expect(new Set(all.map(m => m.id)).size).toBe(330);
  });

  it('ships exactly what the SRD text gives', () => {
    expect(shipped).toEqual(all);
  });

  it('keeps every sentence word for word as the flow text prints it', () => {
    // compared letters and digits only, since the two extracts break compound words differently
    const letters = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
    const flow = letters(
      source('monsters.flow.txt')
        .replace(/^(\d+ )?System Reference Document 5\.2\.1( \d+)?$/gm, '')
        .replace(/^\d{2,3}$/gm, ''),
    );
    for (const m of all) {
      for (const e of [...m.traits, ...m.actions, ...m.bonusActions, ...m.reactions, ...m.legendaryActions]) {
        for (const p of e.description.split(/\n+/)) {
          if (/^(At Will|\d+\/Day)/.test(p)) continue;
          for (const s of p.split(/(?<=[.:?!])\s+(?=[A-Z“])/)) {
            if (s.length > 12) expect(flow.includes(letters(s)), `${m.name}, ${e.name}: "${s}"`).toBe(true);
          }
        }
      }
    }
  });

  it('every monster has six ability scores, a CR, XP, an armour class and hit points', () => {
    for (const m of all) {
      expect(Object.keys(m.abilityScores)).toHaveLength(6);
      expect(m.armourClass).toBeGreaterThan(0);
      expect(m.hitPoints).toBeGreaterThan(0);
      expect(m.challengeRating).toMatch(/^\d+(\/\d+)?$/);
    }
  });

  it('every CR matches its XP in the SRD table', () => {
    // printed differently from the SRD's own table; the data keeps what the stat block prints
    const printedOtherwise = new Set(['Archmage']);
    for (const m of all) {
      if (printedOtherwise.has(m.name)) continue;
      if (m.challengeRating === '0') expect([0, 10], m.name).toContain(m.xp);
      else expect(m.xp, m.name).toBe(xpForChallengeRating(m.challengeRating));
    }
    expect(byName('Archmage')).toMatchObject({ challengeRating: '12', xp: 8000 });
  });

  it('every Proficiency Bonus follows its CR', () => {
    for (const m of all) {
      const expected = m.challengeValue < 5 ? 2 : Math.ceil(m.challengeValue / 4) + 1;
      expect(m.proficiencyBonus, m.name).toBe(expected);
    }
  });

  it('every hit point total is the average of its hit dice', () => {
    for (const m of all) expect(parseHitDice(m.hitDice).average, m.name).toBe(m.hitPoints);
  });

  it('every printed damage number is the average of its dice', () => {
    for (const m of all) {
      for (const a of m.attacks) {
        for (const d of a.damage) expect(Math.floor(averageDamage(d.dice)), `${m.name}: ${a.name}`).toBe(d.average);
      }
    }
  });

  it('every initiative score is 10 plus its bonus, except two the SRD prints otherwise', () => {
    const printedOtherwise = new Set(['Gray Ooze', 'Invisible Stalker']);
    for (const m of all) {
      if (!printedOtherwise.has(m.name)) expect(m.initiative.score, m.name).toBe(10 + m.initiative.bonus);
    }
    expect(byName('Gray Ooze').initiative).toEqual({ bonus: -2, score: 13 });
    expect(byName('Invisible Stalker').initiative).toEqual({ bonus: 7, score: 22 });
  });

  it('reads a full stat block', () => {
    const wolf = byName('Wolf');
    expect(wolf).toMatchObject({
      id: 'wolf',
      source: 'srd-5.2',
      category: 'animal',
      size: ['Medium'],
      creatureType: 'Beast',
      alignment: 'Unaligned',
      armourClass: 12,
      initiative: { bonus: 2, score: 12 },
      hitPoints: 11,
      hitDice: '2d8 + 2',
      speeds: { walk: 40 },
      abilityScores: { str: 14, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
      skills: [
        { name: 'Perception', bonus: 5 },
        { name: 'Stealth', bonus: 4 },
      ],
      senses: ['Darkvision 60 ft.'],
      passivePerception: 15,
      languages: 'None',
      challengeRating: '1/4',
      challengeValue: 0.25,
      xp: 50,
      proficiencyBonus: 2,
    });
    expect(wolf.traits.map(t => t.name)).toEqual(['Pack Tactics']);
    expect(wolf.attacks).toEqual([
      {
        name: 'Bite',
        attackBonus: 4,
        reachOrRange: 'reach 5 ft.',
        damage: [{ average: 5, dice: '1d6 + 2', type: 'piercing' }],
      },
    ]);
  });

  it('keeps the sections of a legendary monster, with lair XP and usage notes', () => {
    const aboleth = byName('Aboleth');
    expect(aboleth).toMatchObject({ xp: 5900, xpInLair: 7200, speeds: { walk: 10, swim: 40 } });
    expect(aboleth.traits.find(t => t.name === 'Legendary Resistance')?.usage).toBe('3/Day, or 4/Day in Lair');
    expect(aboleth.legendaryIntro).toMatch(/^Legendary Action Uses: 3 \(4 in Lair\)\./);
    expect(aboleth.legendaryActions.map(a => a.name)).toEqual(['Lash', 'Psychic Drain']);
    expect(aboleth.attacks.find(a => a.name === 'Consume Memories')).toMatchObject({ saveDc: 16, saveAbility: 'int' });
    expect(aboleth.attacks.find(a => a.name === 'Dominate Mind')).toBeUndefined();
  });

  it('marks attacks with a recharge or daily uses as limited', () => {
    expect(byName('Air Elemental').attacks.find(a => a.name === 'Whirlwind')).toMatchObject({
      limited: true,
      saveDc: 13,
    });
  });

  it('splits damage immunities from condition immunities', () => {
    expect(byName('Air Elemental')).toMatchObject({
      damageImmunities: ['Poison', 'Thunder'],
      conditionImmunities: expect.arrayContaining(['Exhaustion', 'Grappled', 'Unconscious']),
    });
  });

  it('corrects three typing slips in the source, each noted in the converter', () => {
    expect(byName('Young White Dragon').saves.int).toBe(-2);
    expect(byName('Adult White Dragon').abilityScores.con).toBe(22);
    expect(byName('Gold Dragon Wyrmling').xp).toBe(700);
  });

  it('keeps a wrapped spell list whole', () => {
    expect(byName('Djinni').actions.find(a => a.name === 'Spellcasting')?.description).toMatch(
      /Major Image, Plane Shift$/,
    );
  });

  it('keeps form-only speeds in the printed text, not in the numbers', () => {
    expect(byName('Werebear')).toMatchObject({
      speeds: { walk: 30 },
      speedText: expect.stringContaining('bear form only'),
    });
  });

  it('reads damage per round from the real Multiattack text', () => {
    expect(damagePerRound(byName('Wolf'))).toBe(5.5);
    expect(damagePerRound(byName('Tarrasque'))).toBeGreaterThan(damagePerRound(byName('Ancient Red Dragon')));
    expect(damagePerRound(byName('Hydra'))).toBeGreaterThan(40);
  });
});

describe('the Challenge Rating benchmarks', () => {
  const generated = JSON.parse(readFileSync(new URL('../generated/crBenchmarks.json', import.meta.url), 'utf8'));
  const benchmarks = crBenchmarks(all);

  it('regenerate identically from the data', () => {
    expect(generated).toEqual(benchmarks);
  });

  it('cover every rating in the data, lowest first', () => {
    expect(benchmarks.reduce((n, b) => n + b.count, 0)).toBe(330);
    expect(benchmarks[0].challengeRating).toBe('0');
    expect(benchmarks[benchmarks.length - 1].challengeRating).toBe('30');
  });

  it('hold their percentiles in order', () => {
    for (const b of benchmarks) {
      for (const s of [b.armourClass, b.hitPoints, b.damagePerRound, b.bestAttackBonus, b.saveDc]) {
        if (!s) continue;
        expect(s.p10).toBeLessThanOrEqual(s.median);
        expect(s.median).toBeLessThanOrEqual(s.p90);
      }
    }
  });

  it('rise with the rating', () => {
    const at = (cr: string) => benchmarks.find(b => b.challengeRating === cr)!;
    expect(at('20').hitPoints.median).toBeGreaterThan(at('5').hitPoints.median);
    expect(at('20').damagePerRound.median).toBeGreaterThan(at('5').damagePerRound.median);
  });
});
