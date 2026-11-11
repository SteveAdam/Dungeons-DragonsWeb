const FIRST_MS = 1000;
const MOST_MS = 30_000;

/** How long to wait before reconnect attempt number `tries` (from 1): doubling from a second, up to thirty. */
export function reconnectDelayMs(tries: number): number {
  return Math.min(FIRST_MS * 2 ** Math.max(tries - 1, 0), MOST_MS);
}
