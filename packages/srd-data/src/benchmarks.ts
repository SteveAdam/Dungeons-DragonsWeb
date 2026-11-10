// P3-6: the Challenge Rating benchmarks alone, for the balance guide, without loading the monsters themselves.
import data from '../generated/crBenchmarks.json';
import type { CrBenchmark } from './crBenchmarks';

export const CR_BENCHMARKS = data as CrBenchmark[];
