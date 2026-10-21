// P1-8: the exact odds against a hand-checked table, and against 200,000 real (seeded) rolls per scenario.
import { describe, expect, it } from 'vitest';
import { successChanceWithDice } from './dice';
import cases from './handChecked.cases.json' with { type: 'json' };
import { mulberry32, simulate, type Scenario } from './simulation';

const table = cases as (Scenario & { expected: number; working: string })[];
const exact = (s: Scenario) => successChanceWithDice(s).final;

describe('hand-checked table', () => {
  it('has 30 cases', () => expect(table).toHaveLength(30));

  it.each(table)('$name: $expected', c => {
    expect(Math.abs(exact(c) - c.expected)).toBeLessThan(0.001);
  });
});

describe('simulation parity', () => {
  // 25 scenarios from the table: everything except the duplicates and the two certain/impossible checks
  // (06, 07, 12, 24, 25), which a simulation cannot get wrong. Includes attack with advantage (21, 23, 29),
  // attack with Bless (15, 29), check with Bane (16) and a 2d4 bonus die (28).
  const skip = new Set(['06', '07', '12', '24', '25']);
  const scenarios = table.filter(c => !skip.has(c.name.slice(0, 2)));

  it('covers 25 scenarios', () => expect(scenarios).toHaveLength(25));

  it.each(scenarios.map((s, i) => ({ ...s, seed: 1000 + i })))(
    '$name: 200,000 rolls land within 0.6 points of the exact odds',
    s => {
      const rate = simulate(s, 200_000, mulberry32(s.seed));
      expect(Math.abs(rate - exact(s))).toBeLessThan(0.006);
    },
  );
});
