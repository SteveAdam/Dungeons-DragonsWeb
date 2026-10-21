// P1-8: property tests. fast-check tries hundreds of random inputs per property and shrinks any failure to the
// smallest example, so these catch edge cases the hand-written cases miss.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { critChance, resolveRollMode, successChance, type RollKind, type RollMode } from './core';
import { successChanceWithDice, type BonusDie } from './dice';
import { effectiveStat, type Effect, type StatKey } from './effects';

const kind = fc.constantFrom<RollKind>('check', 'save', 'attack');
const mode = fc.constantFrom<RollMode>('normal', 'advantage', 'disadvantage');
const bonus = fc.integer({ min: -20, max: 40 });
const target = fc.integer({ min: -10, max: 50 });
const die: fc.Arbitrary<BonusDie> = fc.record({
  count: fc.integer({ min: 0, max: 3 }),
  sides: fc.constantFrom(4, 6, 8, 10, 12),
  sign: fc.constantFrom<1 | -1>(1, -1),
});
const dice = fc.array(die, { maxLength: 3 });

const chance = (k: RollKind, b: number, t: number, m: RollMode, d: BonusDie[]) =>
  successChanceWithDice({ kind: k, bonus: b, target: t, mode: m, bonusDice: d }).final;

describe('odds properties', () => {
  it('successChance and successChanceWithDice always give a number from 0 to 1', () => {
    fc.assert(
      fc.property(kind, bonus, target, mode, dice, (k, b, t, m, d) => {
        const plain = successChance({ kind: k, bonus: b, target: t, mode: m }).final;
        const withDice = chance(k, b, t, m, d);
        return plain >= 0 && plain <= 1 && withDice >= 0 && withDice <= 1;
      }),
    );
  });

  it('a higher bonus never lowers the chance; a higher target never raises it', () => {
    fc.assert(
      fc.property(kind, bonus, target, mode, dice, fc.integer({ min: 1, max: 10 }), (k, b, t, m, d, step) => {
        const base = chance(k, b, t, m, d);
        return chance(k, b + step, t, m, d) >= base - 1e-12 && chance(k, b, t + step, m, d) <= base + 1e-12;
      }),
    );
  });

  it('advantage is never worse than normal, and disadvantage never better', () => {
    fc.assert(
      fc.property(kind, bonus, target, dice, (k, b, t, d) => {
        const normal = chance(k, b, t, 'normal', d);
        return (
          chance(k, b, t, 'advantage', d) >= normal - 1e-12 && chance(k, b, t, 'disadvantage', d) <= normal + 1e-12
        );
      }),
    );
  });

  it('critChance is between 0 and 1, and advantage > normal > disadvantage', () => {
    const [adv, normal, dis] = (['advantage', 'normal', 'disadvantage'] as const).map(critChance);
    for (const c of [adv, normal, dis]) expect(c >= 0 && c <= 1).toBe(true);
    expect(adv).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(dis);
  });
});

describe('effectiveStat properties', () => {
  const stat = fc.constantFrom<StatKey>('str', 'dex', 'con', 'int', 'wis', 'cha', 'speed', 'ac');
  const effect: fc.Arbitrary<Effect> = fc.record({
    id: fc.uuid(),
    name: fc.string(),
    source: fc.string(),
    stat,
    mode: fc.constantFrom('add', 'set', 'set_at_least'),
    value: fc.integer({ min: -40, max: 40 }),
    duration: fc.oneof(
      fc.record({ kind: fc.constant('rounds' as const), remaining: fc.integer({ min: -2, max: 20 }) }),
      fc.record({ kind: fc.constant('until' as const), atSeconds: fc.integer({ min: 0, max: 10_000 }) }),
      fc.record({ kind: fc.constant('rest' as const), rest: fc.constantFrom('short' as const, 'long' as const) }),
      fc.constant({ kind: 'permanent' as const }),
    ),
    concentration: fc.boolean(),
  });

  it('stays within its limits and never changes its inputs', () => {
    fc.assert(
      fc.property(
        stat,
        fc.integer({ min: -10, max: 60 }),
        fc.array(effect, { maxLength: 8 }),
        fc.integer({ min: 0, max: 10_000 }),
        (s, base, effects, seconds) => {
          const before = JSON.stringify(effects);
          const { value } = effectiveStat(base, s, effects, { seconds });
          const isAbility = s !== 'speed' && s !== 'ac';
          const inLimits = isAbility ? value >= 1 && value <= 30 : value >= 0;
          return inLimits && JSON.stringify(effects) === before;
        },
      ),
    );
  });
});

describe('resolveRollMode properties', () => {
  it('the order of the sources never changes the mode', () => {
    const reasons = fc.array(fc.string({ minLength: 1 }), { maxLength: 5 });
    fc.assert(
      fc.property(reasons, reasons, (adv, dis) => {
        const forward = resolveRollMode({ advantage: adv, disadvantage: dis }).mode;
        const reversed = resolveRollMode({ advantage: [...adv].reverse(), disadvantage: [...dis].reverse() }).mode;
        return forward === reversed;
      }),
    );
  });
});
