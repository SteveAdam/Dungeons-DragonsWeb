import { describe, expect, it } from 'vitest';
import { parseReceived, realtimeEventSchema, type RealtimeEvent } from './events';

const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

const VALID: RealtimeEvent[] = [
  { type: 'reveal', payload: { kind: 'pin', id: ID, mapId: ID2 } },
  { type: 'ping', payload: { mapId: ID, x: 1, y: 2.5, colour: 'gold', name: 'Aldric' } },
  { type: 'dialogue', payload: { speaker: 'Mira', text: 'Well met', groupId: null } },
  { type: 'check_offer', payload: { offerId: ID, label: 'Perception', groupId: ID2 } },
  { type: 'handout', payload: { handoutId: ID } },
  { type: 'message', payload: { messageId: ID, playerId: ID2, kind: 'whisper' } },
  { type: 'pause', payload: { state: 'requested', name: null } },
  { type: 'spotlight', payload: { groupId: ID, summary: 'In the vault' } },
  { type: 'turn', payload: { name: 'Sera', round: 2 } },
  { type: 'toast', payload: { message: 'Hello' } },
  {
    type: 'fog_stroke',
    payload: {
      mapId: ID,
      groupId: null,
      kind: 'partial',
      strokeKey: ID2,
      mode: 'reveal',
      radius: 20,
      points: [[1, 2]],
    },
  },
  { type: 'group_moved', payload: { groupId: ID, mapId: ID2, regionId: null, x: 5, y: null } },
];

const INVALID: [string, unknown][] = [
  ['an unknown type', { type: 'nonsense', payload: {} }],
  ['no payload', { type: 'toast' }],
  ['a missing field', { type: 'ping', payload: { mapId: ID, x: 1, y: 2, colour: 'gold' } }],
  ['a wrong field type', { type: 'turn', payload: { name: 'Sera', round: 'two' } }],
  ['a malformed id', { type: 'handout', payload: { handoutId: 'not-an-id' } }],
  ['a value outside the list', { type: 'pause', payload: { state: 'maybe', name: null } }],
  ['an infinite coordinate', { type: 'ping', payload: { mapId: ID, x: Infinity, y: 2, colour: 'g', name: 'A' } }],
  [
    'an empty stroke',
    {
      type: 'fog_stroke',
      payload: { mapId: ID, groupId: null, kind: 'final', strokeKey: ID, mode: 'cover', radius: 1, points: [] },
    },
  ],
];

describe('the event schemas', () => {
  it.each(VALID.map(e => [e.type, e] as const))('accepts a valid %s', (_type, event) => {
    expect(realtimeEventSchema.safeParse(event).success).toBe(true);
  });

  it('has a valid example of every event', () => {
    expect(new Set(VALID.map(e => e.type)).size).toBe(realtimeEventSchema.options.length);
  });

  it.each(INVALID)('refuses %s', (_label, event) => {
    expect(realtimeEventSchema.safeParse(event).success).toBe(false);
  });

  it.each(VALID.map(e => [e.type, e] as const))('refuses extra fields on %s', (_type, event) => {
    expect(realtimeEventSchema.safeParse({ ...event, payload: { ...event.payload, extra: 1 } }).success).toBe(false);
    expect(realtimeEventSchema.safeParse({ ...event, extra: 1 }).success).toBe(false);
  });
});

describe('parseReceived', () => {
  const body = { id: ID2, sender: ID, senderRole: 'dm', sentAt: '2026-01-01T00:00:00.000Z', data: { message: 'Hi' } };

  it('returns the event, with the sender from the envelope', () => {
    expect(parseReceived('toast', body)).toEqual({
      event: { type: 'toast', payload: { message: 'Hi' } },
      meta: { sender: ID, senderRole: 'dm', sentAt: '2026-01-01T00:00:00.000Z' },
    });
  });

  it('ignores something with no envelope, as a direct broadcast would be', () => {
    expect(parseReceived('toast', { message: 'Hi' })).toBeNull();
  });

  it('ignores a bad payload inside a good envelope', () => {
    expect(parseReceived('toast', { ...body, data: { message: 5 } })).toBeNull();
  });

  it('ignores an unknown event', () => {
    expect(parseReceived('mystery', body)).toBeNull();
  });

  it('ignores extra envelope fields', () => {
    expect(parseReceived('toast', { ...body, extra: 1 })).toBeNull();
  });
});
