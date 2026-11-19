// P4-1: every live event, as one discriminated union. Sending validates against these; anything received that fails is
// dropped. Later tickets may tighten a payload here, and the event names match send_realtime_event in the database.
import { z } from 'zod';

const id = z.string().uuid();
const coord = z.number().finite();
const shortText = z.string().min(1).max(500);

const payloads = {
  reveal: z.object({ kind: z.enum(['pin', 'region', 'map', 'entity', 'page']), id, mapId: id.optional() }).strict(),
  ping: z.object({ mapId: id, x: coord, y: coord, colour: z.string().max(32), name: z.string().max(120) }).strict(),
  // P4-6: an NPC's line, sent by say_line to each player of the groups that hear it. A check option carries the request
  // it became; its DC is missing when the DM hid the odds.
  dialogue: z
    .object({
      npcId: id,
      lineKey: id,
      logId: id.nullable(),
      speaker: z.string().min(1).max(120),
      disposition: z.enum(['friendly', 'indifferent', 'hostile']),
      text: z.string().min(1).max(2000),
      options: z
        .array(
          z
            .object({
              label: z.string().min(1).max(120),
              kind: z.enum(['say', 'check', 'end']),
              requestId: id.optional(),
              check: z
                .object({
                  skill: z.string().min(1).max(40),
                  dc: z.number().int().min(1).max(30).optional(),
                  showOdds: z.boolean(),
                })
                .strict()
                .optional(),
            })
            .strict(),
        )
        .max(6),
    })
    .strict(),
  // P4-6: a check offered to one of this player's characters; the request itself is read with my_check_requests
  check_offer: z.object({ requestId: id }).strict(),
  // P4-6: what a player chose to say, to the DMs (the sender is stamped by the database)
  dialogue_choice: z
    .object({ npcId: id, lineKey: id, optionIndex: z.number().int().min(0).max(5), label: z.string().min(1).max(120) })
    .strict(),
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
      // partial: the DM is still drawing it; final: it is saved; reload: read the whole fog again
      kind: z.enum(['partial', 'final', 'reload']),
      strokeKey: id,
      mode: z.enum(['reveal', 'hide', 'reveal_all', 'hide_all']),
      radius: z.number().int().min(0).max(4000),
      points: z.array(z.tuple([coord, coord])).max(500),
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
  event('dialogue_choice'),
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
