import type { RealtimeEventType } from './events';

/** The shortest gap between two sends of an event, in milliseconds. Events not listed are not limited. */
export const SEND_INTERVALS: Partial<Record<RealtimeEventType, number>> = {
  ping: 2000,
  message: 1000,
  toast: 1000,
  check_offer: 1000,
};

export type RateResult = { ok: true } | { ok: false; retryInMs: number };

export interface RateLimiter<K extends string> {
  /** Uses up the slot for this key if it is free. A refused attempt does not push the next slot back. */
  take(key: K): RateResult;
}

export function createRateLimiter<K extends string>(
  intervals: Partial<Record<K, number>>,
  now: () => number = Date.now,
): RateLimiter<K> {
  const last = new Map<K, number>();
  return {
    take(key) {
      const interval = intervals[key];
      if (!interval) return { ok: true };
      const previous = last.get(key);
      const time = now();
      if (previous !== undefined && time - previous < interval) {
        return { ok: false, retryInMs: interval - (time - previous) };
      }
      last.set(key, time);
      return { ok: true };
    },
  };
}
