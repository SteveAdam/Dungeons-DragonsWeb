// P4-4: pings. A ping is a live event only (nothing is stored): someone points at a spot on the map they are viewing,
// and everyone viewing that map sees a ripple with their name for three seconds.
//
// What the receiver believes: the sender (stamped by the database) and the spot. The name and colour in the payload
// are only what the sender's app claims, so the receiver works both out again from the member list.
import type { EventMeta, PayloadOf } from './realtime';

export type PingPayload = PayloadOf<'ping'>;

/** How many colours the palette has: --ping-1 to --ping-8 in tokens.css. */
export const PING_PALETTE_SIZE = 8;
/** A person may ping once every two seconds (the sender's app also holds to this, see SEND_INTERVALS). */
export const PING_INTERVAL_MS = 2000;
/** A ripple stays this long. */
export const PING_LIFETIME_MS = 3000;
/** Pings from one person that arrive closer together than this are dropped. A little under the interval, because two
 * pings sent two seconds apart can arrive a few milliseconds closer than that. */
export const PING_RECEIVE_GAP_MS = PING_INTERVAL_MS - 250;
/** A press held this long without moving pings the spot. */
export const LONG_PRESS_MS = 600;
/** …and moving further than this (screen pixels) turns it into a drag instead. */
export const LONG_PRESS_SLOP_PX = 8;

export interface PingMember {
  userId: string;
  joinedAt: string;
  displayName: string;
}

/** The colour token for a person ("ping-1" to "ping-8"), by the order people joined the campaign. */
export function pingColour(userId: string, members: readonly PingMember[]): string {
  const order = [...members].sort((a, b) =>
    a.joinedAt === b.joinedAt ? a.userId.localeCompare(b.userId) : a.joinedAt.localeCompare(b.joinedAt),
  );
  const index = order.findIndex(m => m.userId === userId);
  return `ping-${(Math.max(0, index) % PING_PALETTE_SIZE) + 1}`;
}

/** The CSS value for a colour token from pingColour, or the first colour for anything else. */
export function pingColourValue(token: string): string {
  const n = /^ping-([1-8])$/.exec(token)?.[1] ?? '1';
  return `var(--ping-${n})`;
}

export interface PingGate {
  /** True if a ping from this sender may be shown now; it then counts as the sender's last ping. */
  accept(sender: string): boolean;
}

/** Drops a person's pings that come faster than the interval (each person is timed on their own). */
export function createPingGate(now: () => number = Date.now, gapMs = PING_RECEIVE_GAP_MS): PingGate {
  const last = new Map<string, number>();
  return {
    accept(sender) {
      const time = now();
      const previous = last.get(sender);
      if (previous !== undefined && time - previous < gapMs) return false;
      last.set(sender, time);
      return true;
    },
  };
}

export interface PingView {
  /** Unique per ping on this screen. */
  key: string;
  sender: string;
  x: number;
  y: number;
  /** A colour token, "ping-1" to "ping-8". */
  colour: string;
  name: string;
}

export interface PingContext {
  mapId: string;
  size: { width: number; height: number };
  members: readonly PingMember[];
  /** campaigns.settings.pingsEnabled: when off, only DMs' pings are shown. */
  pingsEnabled: boolean;
}

/**
 * What to show for a ping that arrived, or null to ignore it: a ping for another map, from someone who is not a member,
 * from a player while pings are off, or for a spot off the map. The rate limit is the gate's job.
 */
export function receivePing(payload: PingPayload, meta: EventMeta, context: PingContext): Omit<PingView, 'key'> | null {
  if (payload.mapId !== context.mapId) return null;
  const member = context.members.find(m => m.userId === meta.sender);
  if (!member) return null;
  if (!context.pingsEnabled && meta.senderRole !== 'dm') return null;
  const { width, height } = context.size;
  if (payload.x < 0 || payload.y < 0 || payload.x > width || payload.y > height) return null;
  return {
    sender: meta.sender,
    x: payload.x,
    y: payload.y,
    colour: pingColour(meta.sender, context.members),
    name: member.displayName,
  };
}

export interface NamedPoint {
  title: string;
  x: number;
  y: number;
}

/** How close a pin must be to name the spot: a tenth of the map's longer side, but at least 60 image pixels. */
export const nearDistance = (size: { width: number; height: number }) =>
  Math.max(60, Math.max(size.width, size.height) / 10);

/** The nearest pin's name, if one is close enough to describe the spot. */
export function nearestPinName(
  point: { x: number; y: number },
  pins: readonly NamedPoint[],
  size: { width: number; height: number },
): string | null {
  let best: NamedPoint | null = null;
  let bestDistance = nearDistance(size);
  for (const pin of pins) {
    const d = Math.hypot(pin.x - point.x, pin.y - point.y);
    if (d <= bestDistance && pin.title.trim()) {
      best = pin;
      bestDistance = d;
    }
  }
  return best?.title.trim() ?? null;
}

/** What the screen reader says, and what the text-only view shows: "Ana pinged near Port Vellum". */
export const pingAnnouncement = (name: string, near: string | null) =>
  near ? `${name} pinged near ${near}` : `${name} pinged the map`;
