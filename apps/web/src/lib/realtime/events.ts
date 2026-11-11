// P4-1: every live event, as one discriminated union. Sending validates against these; anything received that fails is
// dropped. Later tickets may tighten a payload here, and the event names match send_realtime_event in the database.
import { z } from 'zod';

const id = z.string().uuid();
const coord = z.number().finite();
const shortText = z.string().min(1).max(500);

const payloads = {
  reveal: z.object({ kind: z.enum(['pin', 'region', 'map', 'entity', 'page']), id, mapId: id.optional() }).strict(),
  ping: z.object({ mapId: id, x: coord, y: coord, colour: z.string().max(32), name: z.string().max(120) }).strict(),
  dialogue: z
    .object({ speaker: z.string().min(1).max(120), text: z.string().max(2000), groupId: id.nullable() })
    .strict(),
  check_offer: z.object({ offerId: id, label: shortText, groupId: id.nullable() }).strict(),
  handout: z.object({ handoutId: id }).strict(),
  message: z.object({ messageId: id, playerId: id, kind: z.enum(['message', 'whisper']) }).strict(),
  pause: z.object({ state: z.enum(['requested', 'resumed']), name: z.string().max(120).nullable() }).strict(),
  spotlight: z.object({ groupId: id.nullable(), summary: z.string().max(200).nullable() }).strict(),
  turn: z.object({ name: z.string().min(1).max(120), round: z.number().int().min(1) }).strict(),
  toast: z.object({ message: shortText }).strict(),
  fog_stroke: z
    .object({
      mapId: id,
      groupId: id.nullable(),
      mode: z.enum(['reveal', 'cover']),
      radius: z.number().positive(),
      points: z
        .array(z.tuple([coord, coord]))
        .min(1)
        .max(500),
    })
    .strict(),
  group_moved: z
    .object({ groupId: id, mapId: id.nullable(), regionId: id.nullable(), x: coord.nullable(), y: coord.nullable() })
    .strict(),
} as const;

const event = <T extends keyof typeof payloads>(type: T) =>
  z.object({ type: z.literal(type), payload: payloads[type] }).strict();

export const realtimeEventSchema = z.discriminatedUnion('type', [
  event('reveal'),
  event('ping'),
  event('dialogue'),
  event('check_offer'),
  event('handout'),
  event('message'),
  event('pause'),
  event('spotlight'),
  event('turn'),
  event('toast'),
  event('fog_stroke'),
  event('group_moved'),
]);

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export type RealtimeEventType = RealtimeEvent['type'];
export type PayloadOf<T extends RealtimeEventType> = Extract<RealtimeEvent, { type: T }>['payload'];

/** What the database wraps around a payload. Only send_realtime_event can publish, so `sender` can be believed. */
const envelopeSchema = z
  .object({
    id: id.optional(),
    sender: id,
    senderRole: z.enum(['dm', 'player']),
    sentAt: z.string().datetime(),
    data: z.unknown(),
  })
  .strict();

export interface EventMeta {
  sender: string;
  senderRole: 'dm' | 'player';
  sentAt: string;
}

export interface ReceivedEvent {
  event: RealtimeEvent;
  meta: EventMeta;
}

/** A broadcast as it arrives, or null if any part of it is not what the database sends. */
export function parseReceived(type: string, body: unknown): ReceivedEvent | null {
  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success) return null;
  const parsed = realtimeEventSchema.safeParse({ type, payload: envelope.data.data });
  if (!parsed.success) return null;
  const { sender, senderRole, sentAt } = envelope.data;
  return { event: parsed.data, meta: { sender, senderRole, sentAt } };
}
