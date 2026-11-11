// P4-1: an in-memory campaign for tests. Nothing is delivered until flush(), and then strictly in the order sent, so a
// test decides exactly when each person hears what. It follows the same rules as the database: who may join a topic,
// who may send what, and the sender stamped from the connection, never from the payload.
import type { ChannelStatus, RealtimeTransport, SendRequest, TransportChannel } from '../lib/realtime/transport';

interface FakeSubscriber {
  userId: string;
  presenceKey?: string;
  broadcast: ((type: string, body: unknown) => void)[];
  presence: ((state: Record<string, unknown[]>) => void)[];
  status?: (status: ChannelStatus) => void;
  meta?: Record<string, unknown>;
}

export interface FakeCampaign {
  /** A person's connection: pass it to CampaignRealtime or setRealtimeTransport. */
  connect(userId: string): RealtimeTransport;
  /** Delivers everything waiting, in order. */
  flush(): void;
  /** Every channel on the campaign loses its connection. */
  drop(): void;
  /** Every channel rejoins (deliver with flush()). */
  restore(): void;
  /** Puts an arbitrary broadcast on a topic, as a misbehaving network or client might. */
  inject(topic: string, type: string, body: unknown): void;
  /** The topics a person has joined. */
  topicsOf(userId: string): string[];
}

export function createFakeCampaign(campaignId: string, roles: Record<string, 'dm' | 'player'>): FakeCampaign {
  const topics = new Map<string, Set<FakeSubscriber>>();
  const queue: (() => void)[] = [];
  let sequence = 0;

  const isDm = (user: string) => roles[user] === 'dm';
  const isMember = (user: string) => user in roles;

  function canJoin(user: string, topic: string) {
    if (topic === `campaign:${campaignId}`) return isMember(user);
    if (topic === `dm:${campaignId}`) return isDm(user);
    const prefix = `user:${campaignId}:`;
    if (topic.startsWith(prefix)) return isDm(user) || (isMember(user) && topic.slice(prefix.length) === user);
    return false;
  }

  function topicFor({ target }: SendRequest) {
    if (target === 'campaign') return `campaign:${campaignId}`;
    if (target === 'dm') return `dm:${campaignId}`;
    return `user:${campaignId}:${target.user}`;
  }

  function mayRaise(user: string, { target, type }: SendRequest) {
    if (!isMember(user)) return false;
    if (isDm(user)) return true;
    if (target === 'campaign') return type === 'ping';
    if (target === 'dm') return false;
    return target.user === user && type === 'message';
  }

  function deliver(topic: string, type: string, body: unknown) {
    queue.push(() => {
      for (const subscriber of topics.get(topic) ?? []) for (const handler of subscriber.broadcast) handler(type, body);
    });
  }

  function syncPresence(topic: string) {
    queue.push(() => {
      const subscribers = [...(topics.get(topic) ?? [])];
      const state: Record<string, unknown[]> = {};
      for (const s of subscribers) if (s.presenceKey && s.meta) (state[s.presenceKey] ??= []).push(s.meta);
      for (const s of subscribers) for (const handler of s.presence) handler(state);
    });
  }

  function everyone(status: ChannelStatus) {
    queue.push(() => {
      for (const set of topics.values()) for (const s of set) s.status?.(status);
    });
  }

  return {
    connect(userId) {
      return {
        ready: () => Promise.resolve(),
        openChannel(topic, options): TransportChannel {
          const subscriber: FakeSubscriber = {
            userId,
            presenceKey: options?.presenceKey,
            broadcast: [],
            presence: [],
          };
          return {
            onBroadcast: handler => void subscriber.broadcast.push(handler),
            onPresence: handler => void subscriber.presence.push(handler),
            subscribe(onStatus) {
              subscriber.status = onStatus;
              queue.push(() => {
                if (!canJoin(userId, topic)) return onStatus('error');
                const set = topics.get(topic) ?? new Set();
                topics.set(topic, set);
                set.add(subscriber);
                onStatus('subscribed');
              });
            },
            async track(state) {
              subscriber.meta = state;
              syncPresence(topic);
            },
            close() {
              queue.push(() => {
                topics.get(topic)?.delete(subscriber);
              });
              syncPresence(topic);
            },
          };
        },
        async send(request) {
          if (!mayRaise(userId, request)) throw new Error('Only a DM can send that');
          deliver(topicFor(request), request.type, {
            id: `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
            sender: userId,
            senderRole: isDm(userId) ? 'dm' : 'player',
            sentAt: '2026-01-01T00:00:00.000Z',
            data: request.payload,
          });
        },
      };
    },
    flush() {
      while (queue.length) queue.shift()?.();
    },
    drop: () => everyone('error'),
    restore: () => everyone('subscribed'),
    inject: deliver,
    topicsOf: userId =>
      [...topics.entries()].filter(([, set]) => [...set].some(s => s.userId === userId)).map(([t]) => t),
  };
}
