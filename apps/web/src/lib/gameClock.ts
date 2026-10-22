import type { Effect, GameClock } from '@dnd-manager/rules-engine';

// The game clock is the campaign's game_seconds (P2-2), the same clock the roll function measures effects
// against, so the sheet and the server always agree on which effects are active. The DM moves it (P2-8).

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
