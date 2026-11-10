// P3-6: the balance guide against the real SRD numbers. Directions only: it is a rule of thumb.
import {
  balanceReport,
  cloneDefinition,
  CUSTOM_KINDS,
  validateCustomDefinition,
  type Definition,
} from '@dnd-manager/rules-engine';
import { describe, expect, it } from 'vitest';
import { CR_BENCHMARKS } from './benchmarks';
import { SRD_ARMOR, SRD_MONSTERS, SRD_SPELLS, SRD_WEAPONS } from './index';

const order = CR_BENCHMARKS.map(b => b.challengeRating);
const rank = (cr: string | undefined) => order.indexOf(cr as string);
const monster = (name: string) =>
  cloneDefinition('monster', SRD_MONSTERS.find(m => m.name === name) as unknown as Definition);
const report = (d: Definition) => balanceReport('monster', d, { monsters: CR_BENCHMARKS });

describe('balance guide on the SRD', () => {
  it('suggests at or above the wolf for a wolf with doubled hit points', () => {
    const wolf = monster('Wolf');
    const tough = report({ ...wolf, hitPoints: (wolf.hitPoints as number) * 2 });
    expect(rank(tough.suggestedCr?.high)).toBeGreaterThanOrEqual(rank('1/4'));
    expect(rank(tough.suggestedCr?.high)).toBeGreaterThanOrEqual(rank(report(wolf).suggestedCr?.high));
  });

  it('warns about a wolf with the numbers of an ancient dragon', () => {
    const wolf = monster('Wolf');
    const dragon = monster('Ancient Red Dragon');
    const giant = report({
      ...wolf,
      armourClass: dragon.armourClass,
      hitPoints: dragon.hitPoints,
      attacks: dragon.attacks,
      actions: dragon.actions,
    });
    expect(giant.warnings.join(' ')).toMatch(/rated 1\/4/);
  });

  it('leaves almost every real SRD monster without a warning', () => {
    const warned = SRD_MONSTERS.filter(
      m => report(cloneDefinition('monster', m as unknown as Definition)).warnings.length > 0,
    );
    expect(warned.length / SRD_MONSTERS.length).toBeLessThan(0.1);
  });

  it('has Regenerate as the lowest spell regrowing a body part', () => {
    const spell = {
      ...cloneDefinition('spell', SRD_SPELLS.find(s => s.name === 'Regenerate') as unknown as Definition),
      level: 5,
      effects: [{ type: 'restore_body_part' }],
    };
    expect(balanceReport('spell', spell, { spells: SRD_SPELLS }).warnings.join(' ')).toMatch(/level 7/);
  });

  it('does not warn about the Greatsword itself', () => {
    const sword = cloneDefinition('weapon', SRD_WEAPONS.find(w => w.name === 'Greatsword') as unknown as Definition);
    expect(balanceReport('weapon', sword, { weapons: SRD_WEAPONS }).warnings).toEqual([]);
  });
});

describe('every SRD entry can be cloned', () => {
  const sources = {
    monster: SRD_MONSTERS,
    spell: SRD_SPELLS,
    weapon: SRD_WEAPONS,
    armor: SRD_ARMOR,
  } as const;

  it.each(Object.keys(sources) as (keyof typeof sources)[])('a clone of any SRD %s is a valid definition', kind => {
    expect(CUSTOM_KINDS).toContain(kind);
    for (const record of sources[kind]) {
      const { errors } = validateCustomDefinition(kind, cloneDefinition(kind, record as unknown as Definition));
      expect(errors, record.name).toEqual([]);
    }
  });
});
