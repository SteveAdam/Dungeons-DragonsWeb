import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reconnectDelayMs } from './backoff';
import { AWAY_AFTER_MS, createIdleTracker, summarizePresence } from './presence';
import { createRateLimiter, SEND_INTERVALS } from './rateLimit';

describe('rate limiting', () => {
  it('allows a ping every two seconds and says how long to wait', () => {
    let time = 10_000;
    const limiter = createRateLimiter(SEND_INTERVALS, () => time);
    expect(limiter.take('ping')).toEqual({ ok: true });
    time += 500;
    expect(limiter.take('ping')).toEqual({ ok: false, retryInMs: 1500 });
    time += 1500;
    expect(limiter.take('ping')).toEqual({ ok: true });
  });

  it('does not push the next slot back when refused', () => {
    let time = 0;
    const limiter = createRateLimiter({ a: 100 }, () => time);
    limiter.take('a');
    time = 90;
    limiter.take('a');
    time = 100;
    expect(limiter.take('a').ok).toBe(true);
  });

  it('counts each event type separately, and leaves unlisted ones alone', () => {
    const limiter = createRateLimiter(SEND_INTERVALS, () => 0);
    expect(limiter.take('ping').ok).toBe(true);
    expect(limiter.take('message').ok).toBe(true);
    expect(limiter.take('reveal').ok).toBe(true);
    expect(limiter.take('reveal').ok).toBe(true);
  });
});

describe('reconnect backoff', () => {
  it('doubles from one second up to thirty', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(reconnectDelayMs)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
  });
});

describe('the idle timer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('goes away after three minutes without a touch', () => {
    const changes: boolean[] = [];
    createIdleTracker(idle => changes.push(idle));
    vi.advanceTimersByTime(AWAY_AFTER_MS - 1);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true]);
  });

  it('a touch starts the three minutes again', () => {
    const changes: boolean[] = [];
    const tracker = createIdleTracker(idle => changes.push(idle));
    vi.advanceTimersByTime(AWAY_AFTER_MS - 1000);
    tracker.touch();
    vi.advanceTimersByTime(AWAY_AFTER_MS - 1000);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([true]);
  });

  it('comes back at the first touch, and can go away again', () => {
    const changes: boolean[] = [];
    const tracker = createIdleTracker(idle => changes.push(idle));
    vi.advanceTimersByTime(AWAY_AFTER_MS);
    tracker.touch();
    tracker.touch();
    expect(changes).toEqual([true, false]);
    vi.advanceTimersByTime(AWAY_AFTER_MS);
    expect(changes).toEqual([true, false, true]);
  });

  it('stops', () => {
    const changes: boolean[] = [];
    createIdleTracker(idle => changes.push(idle)).stop();
    vi.advanceTimersByTime(AWAY_AFTER_MS * 2);
    expect(changes).toEqual([]);
  });
});

describe('summarizePresence', () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const entry = (userId: string, name: string, status: string) => ({
    userId,
    name,
    characterId: null,
    groupId: null,
    status,
    since: '2026-01-01T00:00:00.000Z',
    presence_ref: 'x',
  });
  const members = new Set([A, B]);

  it('sorts people by name', () => {
    const people = summarizePresence({ [A]: [entry(A, 'Zed', 'active')], [B]: [entry(B, 'Ann', 'away')] }, members);
    expect(people.map(p => p.name)).toEqual(['Ann', 'Zed']);
  });

  it('counts someone with several tabs once, as their most present tab', () => {
    const people = summarizePresence({ [A]: [entry(A, 'Zed', 'away'), entry(A, 'Zed', 'active')] }, members);
    expect(people.map(p => p.status)).toEqual(['active']);
  });

  it('leaves out people who are not members, and entries claiming another id', () => {
    const stranger = '33333333-3333-4333-8333-333333333333';
    expect(summarizePresence({ [stranger]: [entry(stranger, 'X', 'active')] }, members)).toEqual([]);
    expect(summarizePresence({ [A]: [entry(B, 'Claims B', 'active')] }, members)).toEqual([]);
  });

  it('drops malformed entries', () => {
    expect(summarizePresence({ [A]: [{ userId: A }, 'nonsense'] }, members)).toEqual([]);
  });
});
