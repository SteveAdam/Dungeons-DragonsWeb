// P1-2: effects (potions, spells, curses) with durations, and the stats they produce.
// Pure and immutable: inputs are never changed; every function returns new arrays.
import type { Ability } from './core';

export type StatKey = Ability | 'speed' | 'ac';
export type EffectMode = 'add' | 'set' | 'set_at_least';

export type EffectDuration =
  | { kind: 'rounds'; remaining: number }
  | { kind: 'until'; atSeconds: number }
  | { kind: 'rest'; rest: 'short' | 'long' }
  | { kind: 'permanent' };

export interface Effect {
  id: string;
  name: string;
  /** Where it came from, e.g. "Potion" or "Bless (cast by Sera)". */
  source: string;
  stat: StatKey;
  mode: EffectMode;
  value: number;
  duration: EffectDuration;
  /** Ends when its caster's concentration ends. */
  concentration?: boolean;
}

/** In-game time in seconds. */
export interface GameClock {
  seconds: number;
}

export const SECONDS_PER_ROUND = 6;
export const SECONDS_PER_MINUTE = 60; // 10 rounds
export const SECONDS_PER_HOUR = 3600;

const ABILITY_KEYS: readonly StatKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const isAbility = (stat: StatKey) => ABILITY_KEYS.includes(stat);

/** Whether an effect is in force at this moment. An 'until' effect ends AT atSeconds, so it is off at that second. */
export function isActive(effect: Effect, clock: GameClock): boolean {
  const d = effect.duration;
  switch (d.kind) {
    case 'rounds':
      return d.remaining > 0;
    case 'until':
      return clock.seconds < d.atSeconds;
    case 'rest':
    case 'permanent':
      return true;
  }
}

export interface EffectiveStat {
  value: number;
  base: number;
  /** Effects that changed the value, in the order they were applied. */
  applied: Effect[];
  /** Active effects on this stat that made no difference (a lower 'set', or 'set_at_least' at or below the score). */
  ignored: Effect[];
}

/** Ability scores stay from 1 to 30; speed and armour class never drop below 0. */
function clampStat(stat: StatKey, value: number): number {
  return isAbility(stat) ? Math.min(Math.max(value, 1), 30) : Math.max(value, 0);
}

/**
 * A stat after effects. Order: 'set', then 'set_at_least', then 'add'.
 *
 * DECISION (the written rules leave a gap here): when several 'set' effects target the same stat, the highest
 * value wins and the others are ignored. Several 'set_at_least' effects behave the same way naturally: only the
 * highest can raise the score. Every 'add' applies, and they stack.
 */
export function effectiveStat(
  base: number,
  stat: StatKey,
  effects: readonly Effect[],
  clock: GameClock,
): EffectiveStat {
  const active = effects.filter(e => e.stat === stat && isActive(e, clock));
  const applied: Effect[] = [];
  const ignored: Effect[] = [];
  let value = base;

  const byValueDesc = (a: Effect, b: Effect) => b.value - a.value;
  const sets = active.filter(e => e.mode === 'set').sort(byValueDesc);
  if (sets.length > 0) {
    value = sets[0].value;
    applied.push(sets[0]);
    ignored.push(...sets.slice(1));
  }
  // "becomes this value, but only if that is higher": a score already at or above it is unchanged
  for (const e of active.filter(e => e.mode === 'set_at_least').sort(byValueDesc)) {
    if (e.value > value) {
      value = e.value;
      applied.push(e);
    } else {
      ignored.push(e);
    }
  }
  for (const e of active.filter(e => e.mode === 'add')) {
    value += e.value;
    applied.push(e);
  }
  return { value: clampStat(stat, value), base, applied, ignored };
}

export interface EffectChange {
  effects: Effect[];
  expired: Effect[];
}

/** Splits effects into those that stay (updated by `next`) and those that end. */
function step(effects: readonly Effect[], next: (e: Effect) => Effect | null): EffectChange {
  const kept: Effect[] = [];
  const expired: Effect[] = [];
  for (const e of effects) {
    const after = next(e);
    if (after) kept.push(after);
    else expired.push(e);
  }
  return { effects: kept, expired };
}

/**
 * Counts down effects measured in rounds by n rounds; those that reach 0 expire. Clock-based ('until') effects
 * are not touched, because this function does not know the time: use advanceTime when the clock moves.
 */
export function advanceRounds(effects: readonly Effect[], n: number): EffectChange {
  return step(effects, e => {
    if (e.duration.kind !== 'rounds') return e;
    const remaining = e.duration.remaining - n;
    return remaining > 0 ? { ...e, duration: { kind: 'rounds', remaining } } : null;
  });
}

/**
 * Moves the clock on by `seconds`: round effects count down by whole rounds (6 seconds each), and 'until'
 * effects expire once the new time reaches their end. Returns the new clock too.
 */
export function advanceTime(
  effects: readonly Effect[],
  clock: GameClock,
  seconds: number,
): EffectChange & { clock: GameClock } {
  const now = { seconds: clock.seconds + seconds };
  const rounds = Math.floor(seconds / SECONDS_PER_ROUND);
  const counted = rounds > 0 ? advanceRounds(effects, rounds) : { effects: [...effects], expired: [] };
  const timed = step(counted.effects, e => (e.duration.kind === 'until' && !isActive(e, now) ? null : e));
  return { effects: timed.effects, expired: [...counted.expired, ...timed.expired], clock: now };
}

/** A short rest ends effects that last until a short rest; a long rest ends those and long-rest ones. */
export function applyRest(effects: readonly Effect[], rest: 'short' | 'long'): EffectChange {
  return step(effects, e => {
    if (e.duration.kind !== 'rest') return e;
    return rest === 'long' || e.duration.rest === 'short' ? null : e;
  });
}

/** The caster's concentration ends: every effect that needs it ends. */
export function endConcentration(effects: readonly Effect[]): EffectChange {
  return step(effects, e => (e.concentration ? null : e));
}
