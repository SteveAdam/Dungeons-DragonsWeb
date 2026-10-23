import type { Effect, GameClock } from '@dnd-manager/rules-engine';

// The game clock is the campaign's game_seconds (P2-2), the same clock the roll function measures effects
// against, so the sheet and the server always agree on which effects are active. The DM moves it (P2-8).

export const SECONDS_PER_DAY = 86400;

/** "Day 1, 00:00" at game time 0: the day counts from 1, the time is hours and minutes (the calendar is Phase 3). */
export function dayClock(gameSeconds: number): string {
  const day = Math.floor(gameSeconds / SECONDS_PER_DAY) + 1;
  const inDay = gameSeconds % SECONDS_PER_DAY;
  const hh = String(Math.floor(inDay / 3600)).padStart(2, '0');
  const mm = String(Math.floor((inDay % 3600) / 60)).padStart(2, '0');
  return `Day ${day}, ${hh}:${mm}`;
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

/**
 * "47 minutes", "1 hour 30 minutes", "2 days 3 hours", "less than a minute": how long until a moment on the clock.
 * Partial minutes count up, so a countdown reads "1 minute" until the very end.
 */
export function timeLeft(untilSeconds: number, clock: GameClock): string {
  const seconds = untilSeconds - clock.seconds;
  if (seconds < 60) return 'less than a minute';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return plural(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 48)
    return minutes % 60 ? `${plural(hours, 'hour')} ${plural(minutes % 60, 'minute')}` : plural(hours, 'hour');
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${plural(days, 'day')} ${plural(hours % 24, 'hour')}` : plural(days, 'day');
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
