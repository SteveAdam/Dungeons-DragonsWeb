// P3-4: what a typical monster of each Challenge Rating looks like, measured from the SRD monsters only (never from
// any other table). `node scripts/data.ts` writes the result to generated/crBenchmarks.json, and the check fails if the
// file no longer matches the data. The balance guide (P3-6) compares custom monsters against it.
import { damagePerRound } from '@dnd-manager/rules-engine/monsters';
import type { SrdMonster } from './schemas';

export interface BenchmarkSpread {
  p10: number;
  median: number;
  p90: number;
}

export interface CrBenchmark {
  challengeRating: string;
  challengeValue: number;
  count: number;
  armourClass: BenchmarkSpread;
  hitPoints: BenchmarkSpread;
  /** Null when no monster of this rating has an attack roll. */
  bestAttackBonus: BenchmarkSpread | null;
  /** Null when no monster of this rating forces a save for damage. */
  saveDc: BenchmarkSpread | null;
  damagePerRound: BenchmarkSpread;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** The value at this fraction of the sorted values, interpolating between neighbours. */
function percentile(sorted: readonly number[], fraction: number): number {
  const at = (sorted.length - 1) * fraction;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return round(sorted[low] + (sorted[high] - sorted[low]) * (at - low));
}

function spread(values: readonly number[]): BenchmarkSpread {
  const sorted = [...values].sort((a, b) => a - b);
  return { p10: percentile(sorted, 0.1), median: percentile(sorted, 0.5), p90: percentile(sorted, 0.9) };
}

const orNull = (values: number[]) => (values.length ? spread(values) : null);

export function crBenchmarks(monsters: readonly SrdMonster[]): CrBenchmark[] {
  const ratings = [...new Set(monsters.map(m => m.challengeRating))];
  return ratings
    .map(challengeRating => {
      const group = monsters.filter(m => m.challengeRating === challengeRating);
      const bonuses = group
        .map(m => m.attacks.flatMap(a => (a.attackBonus === undefined ? [] : [a.attackBonus])))
        .filter(b => b.length)
        .map(b => Math.max(...b));
      const dcs = group
        .map(m => m.attacks.flatMap(a => (a.saveDc === undefined ? [] : [a.saveDc])))
        .filter(d => d.length)
        .map(d => Math.max(...d));
      return {
        challengeRating,
        challengeValue: group[0].challengeValue,
        count: group.length,
        armourClass: spread(group.map(m => m.armourClass)),
        hitPoints: spread(group.map(m => m.hitPoints)),
        bestAttackBonus: orNull(bonuses),
        saveDc: orNull(dcs),
        damagePerRound: spread(group.map(m => round(damagePerRound(m)))),
      };
    })
    .sort((a, b) => a.challengeValue - b.challengeValue);
}
