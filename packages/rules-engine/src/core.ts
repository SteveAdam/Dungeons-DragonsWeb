// P1-1: the core of the rules engine, following the 2024 rules (SRD 5.2).
// Pure functions: no I/O, no randomness, no dependencies. Every chance is a number from 0 to 1.

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITY_KEYS: readonly Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export type RollMode = 'normal' | 'advantage' | 'disadvantage';
export type RollKind = 'check' | 'save' | 'attack';

/** The modifier for an ability score: floor((score - 10) / 2), so 10-11 give 0, 16 gives +3, 9 gives -1. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new RangeError(`Level must be a whole number from 1 to 20, got ${level}`);
  }
}

/** Proficiency bonus by character level: +2 at levels 1-4, rising by 1 every four levels to +6 at 17-20. */
export function proficiencyBonus(level: number): number {
  assertLevel(level);
  return 2 + Math.floor((level - 1) / 4);
}

/** Total XP needed to reach each level; index 0 is level 1. */
export const XP_THRESHOLDS: readonly number[] = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000,
  265000, 305000, 355000,
];

/** Total XP at which a character reaches this level (level 1 is 0). */
export function xpForLevel(level: number): number {
  assertLevel(level);
  return XP_THRESHOLDS[level - 1];
}

function assertXp(xp: number): void {
  if (!Number.isFinite(xp) || xp < 0) throw new RangeError(`XP must be zero or more, got ${xp}`);
}

/** The character's level for a total XP. Level-ups are automatic, so this is the only source of a level. */
export function levelFromXp(xp: number): number {
  assertXp(xp);
  let level = 1;
  while (level < 20 && xp >= XP_THRESHOLDS[level]) level++;
  return level;
}

/** XP still needed to reach the next level; 0 at level 20. */
export function xpToNext(xp: number): number {
  const level = levelFromXp(xp);
  return level === 20 ? 0 : XP_THRESHOLDS[level] - xp;
}

export interface RollModeReason {
  text: string;
  /** Which side the reason is on. */
  kind: 'advantage' | 'disadvantage';
  /** True when advantage and disadvantage cancel each other out. */
  cancelled: boolean;
}

export interface ResolvedRollMode {
  mode: RollMode;
  reasons: RollModeReason[];
}

/**
 * Combines sources of advantage and disadvantage. Several sources of the same kind do not stack; at least one of
 * each cancels out to a normal roll, and then every reason is marked cancelled.
 */
export function resolveRollMode(sources: {
  advantage: readonly string[];
  disadvantage: readonly string[];
}): ResolvedRollMode {
  const hasAdvantage = sources.advantage.length > 0;
  const hasDisadvantage = sources.disadvantage.length > 0;
  const cancelled = hasAdvantage && hasDisadvantage;
  const mode: RollMode = cancelled
    ? 'normal'
    : hasAdvantage
      ? 'advantage'
      : hasDisadvantage
        ? 'disadvantage'
        : 'normal';
  return {
    mode,
    reasons: [
      ...sources.advantage.map(text => ({ text, kind: 'advantage' as const, cancelled })),
      ...sources.disadvantage.map(text => ({ text, kind: 'disadvantage' as const, cancelled })),
    ],
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * The chance one d20 meets the target. Attack rolls hit on a natural 20 and miss on a natural 1, so they stay
 * between 5% and 95%. Checks and saves have no automatic success or failure, so 0 and 1 are possible.
 */
export function singleDieChance(kind: RollKind, bonus: number, target: number): number {
  const single = clamp((21 - (target - bonus)) / 20, 0, 1);
  return kind === 'attack' ? clamp(single, 0.05, 0.95) : single;
}

/** Turns a single-die chance into the chance with advantage (best of two) or disadvantage (worst of two). */
export function applyRollMode(single: number, mode: RollMode): number {
  if (mode === 'advantage') return 1 - (1 - single) ** 2;
  if (mode === 'disadvantage') return single ** 2;
  return single;
}

export interface SuccessChanceInput {
  kind: RollKind;
  bonus: number;
  /** The DC for checks and saves, the armour class for attacks. */
  target: number;
  mode: RollMode;
}

export interface SuccessChance {
  /** The chance with one d20. */
  single: number;
  /** The chance with the roll mode applied. */
  final: number;
  /** The number the d20 must show: target - bonus. */
  needed: number;
  mode: RollMode;
}

export function successChance({ kind, bonus, target, mode }: SuccessChanceInput): SuccessChance {
  const single = singleDieChance(kind, bonus, target);
  return { single, final: applyRollMode(single, mode), needed: target - bonus, mode };
}

/** The chance of a critical hit (a natural 20) on an attack roll. */
export function critChance(mode: RollMode): number {
  return applyRollMode(0.05, mode);
}

export interface RangeBandInput {
  distanceFt: number;
  normalFt: number;
  longFt: number;
  /** A hostile creature that can see the attacker is within 5 feet. */
  hostileWithin5ft: boolean;
}

export interface RangeBand {
  /** 'out' means the attack cannot be made. */
  band: 'normal' | 'long' | 'out';
  disadvantageReasons: string[];
}

/** The range band of a ranged attack, and the reasons it has disadvantage (ready for resolveRollMode). */
export function rangeBand({ distanceFt, normalFt, longFt, hostileWithin5ft }: RangeBandInput): RangeBand {
  const disadvantageReasons: string[] = [];
  let band: RangeBand['band'] = 'normal';
  if (distanceFt > longFt) band = 'out';
  else if (distanceFt > normalFt) {
    band = 'long';
    disadvantageReasons.push('Beyond normal range');
  }
  if (hostileWithin5ft) disadvantageReasons.push('Hostile creature within 5 feet');
  return { band, disadvantageReasons };
}

/** A chance as a whole percent, never rounding a possible outcome to "0%" or an uncertain one to "100%". */
export function formatPercent(p: number): string {
  if (p > 0 && p < 0.005) return '<1%';
  if (p > 0.995 && p < 1) return '>99%';
  return `${Math.round(p * 100)}%`;
}
