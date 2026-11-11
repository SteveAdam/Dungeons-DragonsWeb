// P4-1: who is at the table. Presence is written by each client about itself, so it is for display only: nothing may
// grant access because of it.
import { z } from 'zod';

export const AWAY_AFTER_MS = 3 * 60_000;
const ACTIVITY_CHECK_MS = 1000;

const presenceSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().max(120),
  characterId: z.string().uuid().nullable(),
  groupId: z.string().uuid().nullable(),
  status: z.enum(['active', 'away', 'in-scene']),
  since: z.string().datetime(),
});

export type PresenceEntry = z.infer<typeof presenceSchema>;
export type PresenceStatus = PresenceEntry['status'];

const RANK: Record<PresenceStatus, number> = { 'in-scene': 0, active: 1, away: 2 };

/**
 * The raw presence state as one entry per person, sorted by name. Malformed entries are dropped, as is anyone not in
 * the campaign. Someone with several tabs open counts once, as their most present tab.
 */
export function summarizePresence(state: Record<string, unknown[]>, memberIds: ReadonlySet<string>): PresenceEntry[] {
  const people: PresenceEntry[] = [];
  for (const [key, metas] of Object.entries(state)) {
    if (!memberIds.has(key)) continue;
    const valid = metas.flatMap(meta => {
      const parsed = presenceSchema.safeParse(meta);
      return parsed.success && parsed.data.userId === key ? [parsed.data] : [];
    });
    if (valid.length === 0) continue;
    people.push(valid.reduce((best, next) => (RANK[next.status] < RANK[best.status] ? next : best)));
  }
  return people.sort((a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId));
}

export interface IdleTracker {
  /** Call on any interaction. */
  touch(): void;
  stop(): void;
}

/** Calls onChange(true) after `timeoutMs` without a touch, and onChange(false) at the first touch after that. */
export function createIdleTracker(
  onChange: (idle: boolean) => void,
  timeoutMs: number = AWAY_AFTER_MS,
  now: () => number = Date.now,
): IdleTracker {
  let lastActivity = now();
  let idle = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule(delay: number) {
    timer = setTimeout(check, delay);
  }
  // one timer that looks at the last activity, so mouse movement costs nothing but a number being set
  function check() {
    const quiet = now() - lastActivity;
    if (quiet >= timeoutMs) {
      idle = true;
      timer = undefined;
      onChange(true);
    } else {
      schedule(Math.max(timeoutMs - quiet, ACTIVITY_CHECK_MS));
    }
  }
  schedule(timeoutMs);

  return {
    touch() {
      lastActivity = now();
      if (idle) {
        idle = false;
        schedule(timeoutMs);
        onChange(false);
      }
    },
    stop() {
      clearTimeout(timer);
    },
  };
}
