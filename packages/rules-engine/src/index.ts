// @dnd-manager/rules-engine: D&D 2024 rules (SRD 5.2) as pure functions. No runtime dependencies, no I/O,
// no randomness, and nothing imported from the apps.

/** Proves the web app can import this package (P0-1). */
export function rulesEngineInfo(): { name: string; editions: readonly ['2014', '2024'] } {
  return { name: '@dnd-manager/rules-engine', editions: ['2014', '2024'] };
}

export * from './conditions';
export * from './core';
export * from './currency';
export * from './dice';
export * from './effects';
export * from './environment';
export * from './equipment';
export * from './fixtures';
export * from './legacy';
export * from './requirements';
export * from './sheet';
