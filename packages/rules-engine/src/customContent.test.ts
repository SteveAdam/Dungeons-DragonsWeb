import { describe, expect, it } from 'vitest';
import {
  balanceReport,
  cloneDefinition,
  CUSTOM_KINDS,
  customTemplate,
  customToItem,
  diffDefinitions,
  normaliseDefinition,
  validateCustomDefinition,
  type CrBenchmarkLike,
  type Definition,
} from './customContent';

const range = (p10: number, median: number, p90: number) => ({ p10, median, p90 });
const bench = (cr: string, value: number, ac: number, hp: number, bonus: number, dpr: number): CrBenchmarkLike => ({
  challengeRating: cr,
  challengeValue: value,
  count: 10,
  armourClass: range(ac - 1, ac, ac + 1),
  hitPoints: range(hp * 0.8, hp, hp * 1.2),
  bestAttackBonus: range(bonus - 1, bonus, bonus + 1),
  damagePerRound: range(dpr * 0.8, dpr, dpr * 1.2),
});
const BENCHMARKS = [
  bench('0', 0, 10, 3, 2, 1),
  bench('1/8', 0.125, 11, 8, 3, 3),
  bench('1/4', 0.25, 12, 12, 4, 5),
  bench('1/2', 0.5, 13, 20, 4, 7),
  bench('1', 1, 13, 30, 4, 9),
  bench('2', 2, 13, 50, 5, 14),
  bench('3', 3, 14, 70, 5, 20),
  bench('5', 5, 15, 110, 7, 35),
  bench('10', 10, 17, 180, 9, 65),
  bench('20', 20, 19, 350, 14, 130),
];

const wolf: Definition = {
  ...customTemplate('monster'),
  armourClass: 12,
  hitPoints: 11,
  hitDice: '2d8 + 2',
  challengeRating: '1/4',
  challengeValue: 0.25,
  xp: 50,
  traits: [{ name: 'Pack Tactics', description: 'Advantage near allies.' }],
  actions: [{ name: 'Bite', description: 'Melee Attack Roll: +4.' }],
  attacks: [{ name: 'Bite', attackBonus: 4, damage: [{ average: 5, dice: '1d6 + 2', type: 'piercing' }] }],
};

describe('templates', () => {
  it.each(CUSTOM_KINDS)('a new %s starts from a valid shape', kind => {
    expect(validateCustomDefinition(kind, customTemplate(kind))).toEqual({
      errors: [],
      unsupported: [],
      textOnly: false,
    });
  });
});

describe('validateCustomDefinition', () => {
  const spell = (effects: unknown[]) => ({ ...customTemplate('spell'), effects });

  it('accepts every block of the vocabulary', () => {
    const result = validateCustomDefinition(
      'spell',
      spell([
        { type: 'damage', dice: '2d6', damageType: 'fire' },
        { type: 'heal', dice: '1d8 + 3' },
        { type: 'ability', ability: 'str', mode: 'set', value: 21 },
        { type: 'advantage', mode: 'advantage', roll: 'attack' },
        { type: 'condition', action: 'apply', condition: 'prone' },
        { type: 'resistance', damageType: 'cold' },
        { type: 'stat', stat: 'speed', mode: 'add', value: 10 },
        { type: 'resource', action: 'restore', resource: 'Hit Point Dice', amount: 1 },
        { type: 'restore_body_part' },
        { type: 'check', roll: 'save', ability: 'con', dc: 15 },
      ]),
    );
    expect(result).toEqual({ errors: [], unsupported: [], textOnly: false });
  });

  it('flags an unsupported mechanic as text only, without stopping the save', () => {
    const result = validateCustomDefinition('spell', spell([{ type: 'time_travel' }]));
    expect(result.errors).toEqual([]);
    expect(result.textOnly).toBe(true);
    expect(result.unsupported).toEqual(['"time_travel" is not a supported mechanic']);
  });

  it('flags a non-standard damage type or condition', () => {
    const result = validateCustomDefinition(
      'spell',
      spell([
        { type: 'damage', dice: '1d6', damageType: 'soul' },
        { type: 'condition', action: 'apply', condition: 'sleepy' },
      ]),
    );
    expect(result.unsupported).toHaveLength(2);
  });

  it('keeps a written-out mechanic as text only', () => {
    const result = validateCustomDefinition('item', {
      ...customTemplate('item'),
      effects: [{ type: 'text', text: 'Hums near water' }],
    });
    expect(result).toEqual({ errors: [], unsupported: ['Hums near water'], textOnly: true });
  });

  it('will not let a weapon change what a category means', () => {
    const bad = validateCustomDefinition('weapon', { ...customTemplate('weapon'), category: 'exotic' });
    expect(bad.errors[0]).toMatch(/core rules/);
    const key = validateCustomDefinition('weapon', { ...customTemplate('weapon'), proficiency: 'everyone' });
    expect(key.errors[0]).toMatch(/"proficiency" is not something/);
  });

  it('rejects a wrong shape', () => {
    expect(validateCustomDefinition('spell', { ...customTemplate('spell'), level: 10 }).errors).toHaveLength(1);
    expect(validateCustomDefinition('monster', { ...wolf, hitPoints: 0 }).errors).toHaveLength(1);
    expect(validateCustomDefinition('monster', { ...wolf, challengeRating: '7/2' }).errors).toHaveLength(1);
    expect(validateCustomDefinition('spell', null).errors).toHaveLength(1);
  });

  it('holds versatile damage to versatile weapons', () => {
    expect(
      validateCustomDefinition('weapon', { ...customTemplate('weapon'), properties: ['versatile'] }).errors,
    ).toHaveLength(1);
  });
});

describe('diffDefinitions', () => {
  it('lists exactly a changed hit point total and an added trait', () => {
    const thornHide = { name: 'Thorn Hide', description: 'Hurts to touch.' };
    const variant = { ...wolf, hitPoints: 22, traits: [...(wolf.traits as object[]), thornHide] };
    expect(diffDefinitions(wolf, variant)).toEqual([
      { path: 'hitPoints', before: 11, after: 22 },
      { path: 'traits.Thorn Hide', before: undefined, after: thornHide },
    ]);
  });

  it('flattens nested fields', () => {
    const variant = { ...wolf, initiative: { bonus: 3, score: 10 } };
    expect(diffDefinitions(wolf, variant)).toEqual([{ path: 'initiative.bonus', before: 0, after: 3 }]);
  });

  it('follows a change inside a named entry, and a removal', () => {
    const variant = { ...wolf, traits: [{ name: 'Pack Tactics', description: 'Changed.' }], actions: [] };
    expect(diffDefinitions(wolf, variant).map(c => c.path)).toEqual([
      'traits.Pack Tactics.description',
      'actions.Bite',
    ]);
  });

  it('finds nothing in an unchanged copy, and treats empty and missing lists alike', () => {
    expect(diffDefinitions(wolf, { ...wolf })).toEqual([]);
    expect(diffDefinitions({ effects: [] }, {})).toEqual([]);
  });
});

describe('cloneDefinition', () => {
  it('drops what the row itself holds', () => {
    expect(cloneDefinition('monster', { id: 'wolf', name: 'Wolf', source: 'srd-5.2', hitPoints: 11 })).toEqual({
      hitPoints: 11,
    });
  });

  it('turns a spell mechanics into effects', () => {
    const clone = cloneDefinition('spell', {
      id: 'x',
      name: 'X',
      source: 'srd-5.2',
      mechanics: { damage: { dice: '8d6', type: 'fire' }, healing: { dice: '1d8', addAbilityModifier: true } },
    });
    expect(clone).toEqual({
      effects: [
        { type: 'damage', dice: '8d6', damageType: 'fire' },
        { type: 'heal', dice: '1d8' },
      ],
    });
  });

  it('gives weapons and armour blank item rules', () => {
    expect(cloneDefinition('weapon', { id: 'x' }).itemRules).toMatchObject({ canBeGiven: true, requirements: [] });
  });
});

describe('normaliseDefinition', () => {
  it('moves XP and proficiency with the challenge rating', () => {
    const d = normaliseDefinition('monster', { ...wolf, challengeRating: '5' });
    expect(d).toMatchObject({ challengeValue: 5, xp: 1800, proficiencyBonus: 3 });
  });

  it('leaves a printed exception alone while the rating stands', () => {
    const d = { ...wolf, xp: 77 };
    expect(normaliseDefinition('monster', d).xp).toBe(77);
  });

  it('rewrites the properties text only when the properties changed', () => {
    const base = {
      ...customTemplate('weapon'),
      properties: ['versatile'],
      versatileDice: '1d10',
      propertiesText: 'Versatile (1d10)',
    };
    expect(normaliseDefinition('weapon', base).propertiesText).toBe('Versatile (1d10)');
    expect(normaliseDefinition('weapon', { ...base, properties: ['versatile', 'heavy'] }).propertiesText).toBe(
      'Versatile (1d10), Heavy',
    );
  });
});

describe('balanceReport', () => {
  const order = BENCHMARKS.map(b => b.challengeRating);
  const at = (cr?: string) => order.indexOf(cr as string);

  it('always says it is a rule of thumb, and never returns errors', () => {
    const report = balanceReport('monster', wolf, { monsters: BENCHMARKS });
    expect(report.heuristic).toMatch(/rule of thumb/);
    expect(report).not.toHaveProperty('errors');
  });

  it('suggests a challenge rating at or above the wolf for one with doubled hit points', () => {
    const plain = balanceReport('monster', wolf, { monsters: BENCHMARKS }).suggestedCr;
    const tough = balanceReport('monster', { ...wolf, hitPoints: 22 }, { monsters: BENCHMARKS }).suggestedCr;
    expect(at(tough?.high)).toBeGreaterThanOrEqual(at(plain?.high));
    expect(at(tough?.high)).toBeGreaterThanOrEqual(at('1/4'));
  });

  it('warns when the stats are far above the stated rating', () => {
    const brute = {
      ...wolf,
      armourClass: 19,
      hitPoints: 350,
      attacks: [{ name: 'Bite', attackBonus: 14, damage: [{ average: 130, dice: '20d12', type: 'piercing' }] }],
    };
    expect(balanceReport('monster', brute, { monsters: BENCHMARKS }).warnings[0]).toMatch(/rated 1\/4/);
  });

  it('does not warn about a monster that matches its rating', () => {
    expect(balanceReport('monster', wolf, { monsters: BENCHMARKS }).warnings).toEqual([]);
  });

  const peers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => ({
    level: 3,
    text: 'Burns.',
    mechanics: { damage: { dice: `${n}d6` } },
  }));
  const regenerate = { level: 7, text: 'Any severed body parts regrow after 2 minutes.' };
  const spell = (effects: unknown[], level = 3) => ({ ...customTemplate('spell'), level, effects });

  it('warns about a spell above the 90th percentile of its level', () => {
    const report = balanceReport('spell', spell([{ type: 'damage', dice: '12d6', damageType: 'fire' }]), {
      spells: peers,
    });
    expect(report.warnings[0]).toMatch(/above nine in ten/);
  });

  it('accepts a spell inside the usual range', () => {
    const report = balanceReport('spell', spell([{ type: 'damage', dice: '4d6', damageType: 'fire' }]), {
      spells: peers,
    });
    expect(report.warnings).toEqual([]);
  });

  it('notes a body part restored below the lowest comparable SRD spell', () => {
    const effects = [{ type: 'restore_body_part' }];
    expect(balanceReport('spell', spell(effects, 5), { spells: [regenerate] }).warnings[0]).toMatch(/level 7/);
    expect(balanceReport('spell', spell(effects, 7), { spells: [regenerate] }).warnings).toEqual([]);
  });

  const weapons = [
    { category: 'martial', kind: 'melee', damage: { dice: '1d8' } },
    { category: 'martial', kind: 'melee', damage: { dice: '2d6' } },
    { category: 'simple', kind: 'melee', damage: { dice: '1d4' } },
  ];
  const weapon = (dice: string) => ({
    ...customTemplate('weapon'),
    category: 'martial',
    damage: { dice, type: 'slashing' },
  });

  it('warns about a weapon above every peer in its category', () => {
    expect(balanceReport('weapon', weapon('3d6'), { weapons }).warnings[0]).toMatch(/above every SRD martial melee/);
    expect(balanceReport('weapon', weapon('2d6'), { weapons }).warnings).toEqual([]);
  });
});

describe('customToItem', () => {
  const rules = {
    requirements: [{ stat: 'str', min: 17, onUnmet: 'lock' }],
    effects: [{ stat: 'ac', mode: 'add', value: 1 }],
    grantedText: 'Colder near water.',
    canBeGiven: true,
    bound: false,
  };

  it('makes a weapon with its requirement, effects and price', () => {
    const d = {
      ...customTemplate('weapon'),
      category: 'martial',
      damage: { dice: '2d6', type: 'slashing' },
      weightLb: 6,
      cost: { amount: 50, coin: 'gp' },
      itemRules: rules,
    };
    expect(customToItem('weapon', d)).toMatchObject({
      kind: 'weapon',
      weight: 6,
      valueCp: 5000,
      bound: false,
      definition: {
        weapon: { category: 'martial', damage: { dice: '2d6' }, mastery: 'sap' },
        requirements: rules.requirements,
        effects: rules.effects,
        description: 'Colder near water.',
      },
    });
  });

  it('binds an item that cannot be given', () => {
    const d = { ...customTemplate('weapon'), itemRules: { ...rules, canBeGiven: false } };
    expect(customToItem('weapon', d).bound).toBe(true);
  });

  it('makes a shield a shield', () => {
    const d = { ...customTemplate('armor'), category: 'shield', baseAc: 2 };
    expect(customToItem('armor', d)).toMatchObject({ kind: 'shield', definition: { armor: { baseAc: 2 } } });
  });

  it('carries an item vocabulary effects it can calculate', () => {
    const d = {
      ...customTemplate('item'),
      itemKind: 'magic',
      rarity: 'rare',
      requiresAttunement: true,
      effects: [
        { type: 'ability', ability: 'str', mode: 'set', value: 21 },
        { type: 'heal', dice: '1d4' },
      ],
    };
    expect(customToItem('item', d)).toMatchObject({
      kind: 'magic',
      rarity: 'rare',
      requiresAttunement: true,
      definition: { effects: [{ stat: 'str', mode: 'set', value: 21 }] },
    });
  });
});
