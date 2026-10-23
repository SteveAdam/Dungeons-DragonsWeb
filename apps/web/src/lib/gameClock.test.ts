import { hillGiantStrength } from '@dnd-manager/rules-engine';
import { describe, expect, it } from 'vitest';
import { dayClock, durationText, timeLeft } from './gameClock';

describe('the game clock in words (P2-8)', () => {
  it('reads "Day N, hh:mm", with day 1 starting at game time 0', () => {
    expect(dayClock(0)).toBe('Day 1, 00:00');
    expect(dayClock(3600 + 25 * 60)).toBe('Day 1, 01:25');
    expect(dayClock(86400)).toBe('Day 2, 00:00');
    expect(dayClock(2 * 86400 + 23 * 3600 + 59 * 60 + 59)).toBe('Day 3, 23:59');
  });

  it('counts down in minutes, hours and days, and says "1 minute" until the very end', () => {
    const until = 3600;
    expect(timeLeft(until, { seconds: 0 })).toBe('1 hour');
    expect(timeLeft(until, { seconds: 13 * 60 })).toBe('47 minutes');
    expect(timeLeft(until, { seconds: 59 * 60 })).toBe('1 minute');
    expect(timeLeft(until, { seconds: 59 * 60 + 30 })).toBe('less than a minute');
    expect(timeLeft(5400, { seconds: 0 })).toBe('1 hour 30 minutes');
    expect(timeLeft(3 * 86400 + 7200, { seconds: 0 })).toBe('3 days 2 hours');
  });

  it("gives an effect's time left on the clock", () => {
    expect(durationText(hillGiantStrength(0), { seconds: 59 * 60 })).toBe('1 minute left');
  });
});
