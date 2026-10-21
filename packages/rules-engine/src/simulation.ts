// P1-8 test support: actually rolls the dice, to check the exact odds against reality. Seeded, so every run
// gives the same numbers. Not exported from the package: the engine itself never uses randomness.
import type { RollKind, RollMode } from './core';
import type { BonusDie } from './dice';

/** mulberry32: a small, fast, seedable generator. Returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Scenario {
  name: string;
  kind: RollKind;
  bonus: number;
  target: number;
  mode: RollMode;
  bonusDice: BonusDie[];
}

/** Rolls the scenario `trials` times and returns the share of successes. */
export function simulate(s: Scenario, trials: number, random: () => number): number {
  const roll = (sides: number) => Math.floor(random() * sides) + 1;
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const first = roll(20);
    const kept =
      s.mode === 'normal' ? first : s.mode === 'advantage' ? Math.max(first, roll(20)) : Math.min(first, roll(20));
    let total = kept + s.bonus;
    for (const d of s.bonusDice) for (let n = 0; n < d.count; n++) total += d.sign * roll(d.sides);
    const success =
      s.kind === 'attack' && kept === 20 ? true : s.kind === 'attack' && kept === 1 ? false : total >= s.target;
    if (success) wins++;
  }
  return wins / trials;
}
