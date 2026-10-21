import type { Effect, GameClock } from '@dnd-manager/rules-engine';
import { useEffect, useState } from 'react';

/**
 * The game clock, in seconds. Phase 1 has no campaign clock yet, so game time is real time (seconds since
 * 1970): a one-hour potion lasts a real hour. A DM-driven campaign clock can replace this later.
 */
export const nowClock = (): GameClock => ({ seconds: Math.floor(Date.now() / 1000) });

/** The clock, refreshed every 30 seconds so effects run out on screen without a reload. */
export function useGameClock(): GameClock {
  const [clock, setClock] = useState(nowClock);
  useEffect(() => {
    const timer = setInterval(() => setClock(nowClock()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return clock;
}

/** "1 hour", "23 minutes", "less than a minute": how long until a moment on the clock. */
export function timeLeft(untilSeconds: number, clock: GameClock): string {
  const seconds = untilSeconds - clock.seconds;
  if (seconds < 60) return 'less than a minute';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.round(minutes / 60);
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

/** How long an effect lasts, in words. */
export function durationText(effect: Effect, clock: GameClock): string {
  const d = effect.duration;
  switch (d.kind) {
    case 'rounds':
      return `${d.remaining} ${d.remaining === 1 ? 'round' : 'rounds'}`;
    case 'until':
      return `${timeLeft(d.atSeconds, clock)} left`;
    case 'rest':
      return `until a ${d.rest} rest`;
    case 'permanent':
      return 'lasting';
  }
}
