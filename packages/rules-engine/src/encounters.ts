// Region content and random encounters (P3-2). The roll itself happens in the database (roll_random_encounter,
// with secure dice); this module holds the shared vocabulary, the checks the forms use before saving, and the
// plain-language summary of a spawn rule ("35% chance, at night, 1 to 3").

export const CONTENT_KINDS = ['creature', 'folk', 'find', 'shop', 'interactable'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/** How far a region entry has been discovered, from the DM's point of view. */
export const DISCOVERY_STATES = ['hidden', 'hinted', 'noticed', 'found'] as const;
export type DiscoveryState = (typeof DISCOVERY_STATES)[number];

export const SPAWN_PIN_KINDS = ['creature', 'find', 'interactable', 'trap'] as const;
export type SpawnPinKind = (typeof SPAWN_PIN_KINDS)[number];

export type SpawnMode = 'always' | 'chance' | 'time';
export type TimeOfDay = 'day' | 'night' | 'any';

/**
 * When an entry turns up. timeOfDay applies whatever the mode: a 'day' or 'night' entry never turns up at the
 * other time. 'always' and 'time' then always turn up; 'chance' turns up on a d100 roll at or below the chance.
 */
export interface SpawnRule {
  mode: SpawnMode;
  /** 0 to 100, whole numbers; used by 'chance'. */
  chance: number;
  timeOfDay: TimeOfDay;
  /** How many turn up, chosen evenly from min to max (0 to 100). */
  count: { min: number; max: number };
}

export const DEFAULT_SPAWN_RULE: SpawnRule = {
  mode: 'always',
  chance: 100,
  timeOfDay: 'any',
  count: { min: 1, max: 1 },
};

const whole = (n: unknown, lo: number, hi: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;

/** The problems with a spawn rule, in plain words; empty when it is fine. Same rules as spawn_rule_ok in SQL. */
export function validateSpawnRule(rule: SpawnRule): string[] {
  const errors: string[] = [];
  if (!['always', 'chance', 'time'].includes(rule.mode)) errors.push('Choose when it turns up.');
  if (!whole(rule.chance, 0, 100)) errors.push('The chance is a whole number from 0 to 100.');
  if (!['day', 'night', 'any'].includes(rule.timeOfDay)) errors.push('Choose day, night or any time.');
  if (!whole(rule.count.min, 0, 100) || !whole(rule.count.max, 0, 100)) {
    errors.push('The count is a whole number from 0 to 100.');
  } else if (rule.count.min > rule.count.max) {
    errors.push('The smallest count cannot be more than the largest.');
  }
  return errors;
}

const TIME_WORDS: Record<TimeOfDay, string> = { day: 'by day', night: 'at night', any: 'any time' };

/** "35% chance, at night, 1 to 3" / "Always, any time, 2" / "Only at night, 1 to 4". */
export function spawnRuleSummary(rule: SpawnRule): string {
  const when =
    rule.mode === 'chance'
      ? `${rule.chance}% chance, ${TIME_WORDS[rule.timeOfDay]}`
      : rule.timeOfDay === 'any'
        ? 'Always, any time'
        : `Only ${TIME_WORDS[rule.timeOfDay]}`;
  const { min, max } = rule.count;
  return `${when}, ${min === max ? `${min}` : `${min} to ${max}`}`;
}

/** The hour of the in-game day (0 to 23) for a game clock in seconds. */
export function hourOfDay(gameSeconds: number): number {
  return Math.floor(gameSeconds / 3600) % 24;
}

export interface DaylightHours {
  /** Day starts at this hour (inclusive). */
  start: number;
  /** And ends at this one (exclusive). A start after the end wraps past midnight. */
  end: number;
}

export const DEFAULT_DAYLIGHT: DaylightHours = { start: 6, end: 18 };

/** Is it day at this hour? Same rule as is_daytime in SQL. */
export function isDaytime(hour: number, daylight: DaylightHours = DEFAULT_DAYLIGHT): boolean {
  return daylight.start <= daylight.end
    ? hour >= daylight.start && hour < daylight.end
    : hour >= daylight.start || hour < daylight.end;
}
