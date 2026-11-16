import { describe, expect, it } from 'vitest';
import {
  createPingGate,
  nearestPinName,
  pingAnnouncement,
  pingColour,
  pingColourValue,
  PING_INTERVAL_MS,
  receivePing,
  type PingContext,
  type PingMember,
} from './pings';
import { parseReceived, type EventMeta } from './realtime/events';
import { createRateLimiter, SEND_INTERVALS } from './realtime/rateLimit';

const MAP = '11111111-1111-4111-8111-111111111111';
const OTHER_MAP = '22222222-2222-4222-8222-222222222222';
const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BEN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DM = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const STRANGER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const members: PingMember[] = [
  { userId: BEN, joinedAt: '2026-01-03T00:00:00Z', displayName: 'Ben' },
  { userId: DM, joinedAt: '2026-01-01T00:00:00Z', displayName: 'The DM' },
  { userId: ANA, joinedAt: '2026-01-02T00:00:00Z', displayName: 'Ana' },
];
const context: PingContext = { mapId: MAP, size: { width: 1000, height: 800 }, members, pingsEnabled: true };
const meta = (sender: string, senderRole: 'dm' | 'player' = 'player'): EventMeta => ({
  sender,
  senderRole,
  sentAt: '2026-11-14T10:00:00.000Z',
});
const ping = (over: Partial<{ mapId: string; x: number; y: number; colour: string; name: string }> = {}) => ({
  mapId: MAP,
  x: 100,
  y: 200,
  colour: 'ping-8',
  name: 'Somebody else',
  ...over,
});

describe('ping colours', () => {
  it('follow the order people joined, not the order of the list', () => {
    expect(pingColour(DM, members)).toBe('ping-1');
    expect(pingColour(ANA, members)).toBe('ping-2');
    expect(pingColour(BEN, members)).toBe('ping-3');
  });

  it('go round the palette of eight', () => {
    const many: PingMember[] = Array.from({ length: 10 }, (_, i) => ({
      userId: `u${i}`,
      joinedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      displayName: `P${i}`,
    }));
    expect(many.map(m => pingColour(m.userId, many))).toEqual([
      'ping-1',
      'ping-2',
      'ping-3',
      'ping-4',
      'ping-5',
      'ping-6',
      'ping-7',
      'ping-8',
      'ping-1',
      'ping-2',
    ]);
  });

  it('break a tie in join time the same way on every screen', () => {
    const tied: PingMember[] = [
      { userId: 'b', joinedAt: '2026-01-01T00:00:00Z', displayName: 'B' },
      { userId: 'a', joinedAt: '2026-01-01T00:00:00Z', displayName: 'A' },
    ];
    expect(pingColour('a', tied)).toBe('ping-1');
    expect(pingColour('a', [...tied].reverse())).toBe('ping-1');
  });

  it('become a CSS variable only for a real palette token', () => {
    expect(pingColourValue('ping-5')).toBe('var(--ping-5)');
    expect(pingColourValue('red; background: url(x)')).toBe('var(--ping-1)');
    expect(pingColourValue('ping-9')).toBe('var(--ping-1)');
  });
});

describe('the sending rate limit', () => {
  it('allows one ping every two seconds', () => {
    let time = 0;
    const limiter = createRateLimiter(SEND_INTERVALS, () => time);
    expect(SEND_INTERVALS.ping).toBe(PING_INTERVAL_MS);
    expect(limiter.take('ping')).toEqual({ ok: true });
    time = 1500;
    expect(limiter.take('ping')).toEqual({ ok: false, retryInMs: 500 });
    time = 2000;
    expect(limiter.take('ping')).toEqual({ ok: true });
  });
});

describe('the receiving gate', () => {
  it('drops a person’s pings that come too fast, each person timed on their own', () => {
    let time = 0;
    const gate = createPingGate(() => time);
    expect(gate.accept(ANA)).toBe(true);
    time = 500;
    expect(gate.accept(ANA)).toBe(false);
    expect(gate.accept(BEN)).toBe(true);
    time = 1000;
    expect(gate.accept(ANA)).toBe(false);
    // a dropped ping does not push Ana's next one back
    time = 1800;
    expect(gate.accept(ANA)).toBe(true);
  });

  it('lets through pings sent two seconds apart that arrive a little closer', () => {
    let time = 0;
    const gate = createPingGate(() => time);
    gate.accept(ANA);
    time = PING_INTERVAL_MS - 120;
    expect(gate.accept(ANA)).toBe(true);
  });
});

describe('receivePing', () => {
  it('shows a ping on this map with the sender’s own name and colour, whatever the payload claims', () => {
    expect(receivePing(ping(), meta(ANA), context)).toEqual({
      sender: ANA,
      x: 100,
      y: 200,
      colour: 'ping-2',
      name: 'Ana',
    });
  });

  it('ignores a ping for another map', () => {
    expect(receivePing(ping({ mapId: OTHER_MAP }), meta(ANA), context)).toBeNull();
  });

  it('ignores a ping from someone who is not a member', () => {
    expect(receivePing(ping(), meta(STRANGER), context)).toBeNull();
  });

  it('ignores a ping off the map', () => {
    expect(receivePing(ping({ x: -1 }), meta(ANA), context)).toBeNull();
    expect(receivePing(ping({ y: 801 }), meta(ANA), context)).toBeNull();
  });

  it('shows only the DM’s pings while pings are off', () => {
    const off = { ...context, pingsEnabled: false };
    expect(receivePing(ping(), meta(ANA), off)).toBeNull();
    expect(receivePing(ping(), meta(DM, 'dm'), off)?.name).toBe('The DM');
  });
});

describe('invalid ping events', () => {
  const envelope = (data: unknown) => ({ sender: ANA, senderRole: 'player', sentAt: '2026-11-14T10:00:00.000Z', data });

  it('are dropped before any handler sees them', () => {
    expect(parseReceived('ping', envelope(ping()))).not.toBeNull();
    expect(parseReceived('ping', envelope({ ...ping(), x: 'left' }))).toBeNull();
    expect(parseReceived('ping', envelope({ ...ping(), mapId: 'not-a-map' }))).toBeNull();
    expect(parseReceived('ping', envelope({ ...ping(), extra: true }))).toBeNull();
    expect(parseReceived('ping', envelope({ ...ping(), y: Infinity }))).toBeNull();
    expect(parseReceived('ping', { ...envelope(ping()), sender: 'nobody' })).toBeNull();
  });
});

describe('the announcement', () => {
  const pins = [
    { title: 'Port Vellum', x: 120, y: 210 },
    { title: 'Old Mill', x: 400, y: 400 },
  ];

  it('names the nearest pin when one is close', () => {
    const near = nearestPinName({ x: 100, y: 200 }, pins, context.size);
    expect(pingAnnouncement('Ana', near)).toBe('Ana pinged near Port Vellum');
  });

  it('says only "the map" when no pin is close enough', () => {
    const near = nearestPinName({ x: 900, y: 50 }, pins, context.size);
    expect(near).toBeNull();
    expect(pingAnnouncement('Ana', near)).toBe('Ana pinged the map');
  });

  it('picks the closer of two pins', () => {
    expect(
      nearestPinName({ x: 380, y: 390 }, [...pins, { title: 'Mill pond', x: 330, y: 330 }], {
        width: 1000,
        height: 800,
      }),
    ).toBe('Old Mill');
  });
});
