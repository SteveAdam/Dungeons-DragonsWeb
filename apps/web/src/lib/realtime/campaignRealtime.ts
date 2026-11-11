// P4-1: one campaign's live connection: the channels this person may use, typed sending and receiving, presence, and
// the connection state. Everything outside the browser goes through the transport.
import { parseReceived, realtimeEventSchema, type EventMeta, type PayloadOf, type RealtimeEventType } from './events';
import {
  createIdleTracker,
  summarizePresence,
  type IdleTracker,
  type PresenceEntry,
  type PresenceStatus,
} from './presence';
import { createRateLimiter, SEND_INTERVALS, type RateLimiter } from './rateLimit';
import {
  campaignTopic,
  dmTopic,
  userTopic,
  type ChannelStatus,
  type RealtimeTransport,
  type SendTarget,
  type TransportChannel,
} from './transport';

export type ConnectionState = 'connected' | 'reconnecting' | 'offline';

export type SendResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'rate-limited'; retryInMs: number }
  | { ok: false; reason: 'failed'; error: unknown };

export interface CampaignRealtimeOptions {
  campaignId: string;
  userId: string;
  isDm: boolean;
  now?: () => number;
}

export interface PresenceIdentity {
  name: string;
  characterId: string | null;
  groupId: string | null;
}

type Handler<T extends RealtimeEventType> = (payload: PayloadOf<T>, meta: EventMeta) => void;
type AnyHandler = (payload: never, meta: EventMeta) => void;

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

export class CampaignRealtime {
  readonly campaignId: string;
  readonly userId: string;
  readonly isDm: boolean;

  private readonly transport: RealtimeTransport;
  private readonly now: () => number;
  private readonly limiter: RateLimiter<RealtimeEventType>;
  private readonly channels = new Map<string, TransportChannel>();
  private readonly statuses = new Map<string, ChannelStatus>();
  private readonly handlers = new Map<RealtimeEventType, Set<AnyHandler>>();
  private readonly connectionListeners = new Set<() => void>();
  private readonly presenceListeners = new Set<() => void>();
  private readonly reconnectListeners = new Set<() => void>();
  private readonly strangerListeners = new Set<() => void>();
  private readonly strangers = new Set<string>();

  private stopped = false;
  private everConnected = false;
  private connection: ConnectionState = 'reconnecting';
  private online = typeof navigator === 'undefined' ? true : navigator.onLine;
  private idle: IdleTracker | null = null;

  private identity: PresenceIdentity = { name: 'Adventurer', characterId: null, groupId: null };
  private baseStatus: Exclude<PresenceStatus, 'away'> = 'active';
  private away = false;
  private since: string;
  private rawPresence: Record<string, unknown[]> = {};
  private memberIds: ReadonlySet<string> = new Set();
  private people: PresenceEntry[] = [];

  constructor(transport: RealtimeTransport, options: CampaignRealtimeOptions) {
    this.transport = transport;
    this.campaignId = options.campaignId;
    this.userId = options.userId;
    this.isDm = options.isDm;
    this.now = options.now ?? Date.now;
    this.limiter = createRateLimiter(SEND_INTERVALS, this.now);
    this.since = new Date(this.now()).toISOString();
  }

  /** Opens the channels this person may use. */
  async start(): Promise<void> {
    await this.transport.ready();
    if (this.stopped) return;
    this.open(campaignTopic(this.campaignId), this.userId);
    this.open(userTopic(this.campaignId, this.userId));
    if (this.isDm) this.open(dmTopic(this.campaignId));
    this.refreshConnection();

    this.idle = createIdleTracker(
      idle => {
        this.away = idle;
        this.since = new Date(this.now()).toISOString();
        this.publishPresence();
      },
      undefined,
      this.now,
    );
    if (typeof window !== 'undefined') {
      for (const name of ACTIVITY_EVENTS) window.addEventListener(name, this.touch, { passive: true });
      window.addEventListener('online', this.goOnline);
      window.addEventListener('offline', this.goOffline);
    }
  }

  stop(): void {
    this.stopped = true;
    this.idle?.stop();
    if (typeof window !== 'undefined') {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, this.touch);
      window.removeEventListener('online', this.goOnline);
      window.removeEventListener('offline', this.goOffline);
    }
    for (const channel of this.channels.values()) channel.close();
    this.channels.clear();
    this.statuses.clear();
  }

  /** Listens for one event type on every channel this person is on. Returns the function that stops. */
  on<T extends RealtimeEventType>(type: T, handler: Handler<T>): () => void {
    const set = this.handlers.get(type) ?? new Set<AnyHandler>();
    this.handlers.set(type, set);
    set.add(handler as AnyHandler);
    return () => set.delete(handler as AnyHandler);
  }

  /** Validates, applies the rate limit, then asks the database to send. The database decides who may. */
  async send<T extends RealtimeEventType>(target: SendTarget, type: T, payload: PayloadOf<T>): Promise<SendResult> {
    const parsed = realtimeEventSchema.safeParse({ type, payload });
    if (!parsed.success) return { ok: false, reason: 'invalid' };
    const rate = this.limiter.take(type);
    if (!rate.ok) return { ok: false, reason: 'rate-limited', retryInMs: rate.retryInMs };
    try {
      await this.transport.send({ campaignId: this.campaignId, target, type, payload: parsed.data.payload });
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: 'failed', error };
    }
  }

  // PRESENCE ---------------------------------------------------------------------------------------------------------

  getPresence = (): PresenceEntry[] => this.people;

  subscribePresence = (listener: () => void): (() => void) => {
    this.presenceListeners.add(listener);
    return () => this.presenceListeners.delete(listener);
  };

  /** Who this person is, as others see it. */
  setIdentity(identity: PresenceIdentity): void {
    this.identity = identity;
    this.publishPresence();
  }

  /** Who belongs in the list: anyone else in the presence state is left out. */
  setMembers(memberIds: ReadonlySet<string>): void {
    this.memberIds = memberIds;
    this.refreshPeople();
  }

  /** For screens that put someone in a scene. An idle person still shows as away. */
  setStatus(status: Exclude<PresenceStatus, 'away'>): void {
    if (status === this.baseStatus) return;
    this.baseStatus = status;
    this.since = new Date(this.now()).toISOString();
    this.publishPresence();
  }

  // CONNECTION -------------------------------------------------------------------------------------------------------

  getConnection = (): ConnectionState => this.connection;

  subscribeConnection = (listener: () => void): (() => void) => {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  };

  /** Called each time the connection comes back after being lost. Broadcasts are not replayed: refetch here. */
  onReconnect(listener: () => void): () => void {
    this.reconnectListeners.add(listener);
    return () => this.reconnectListeners.delete(listener);
  }

  /** Called when someone appears who is not in the member list: they may just have joined, so reload it. */
  onStranger(listener: () => void): () => void {
    this.strangerListeners.add(listener);
    return () => this.strangerListeners.delete(listener);
  }

  // INSIDE -----------------------------------------------------------------------------------------------------------

  private touch = () => this.idle?.touch();

  private goOnline = () => {
    this.online = true;
    this.refreshConnection();
  };

  private goOffline = () => {
    this.online = false;
    this.refreshConnection();
  };

  private open(topic: string, presenceKey?: string) {
    const channel = this.transport.openChannel(topic, presenceKey ? { presenceKey } : undefined);
    this.channels.set(topic, channel);
    channel.onBroadcast((type, body) => this.receive(type, body));
    if (presenceKey) {
      channel.onPresence(state => {
        this.rawPresence = state;
        this.refreshPeople();
      });
    }
    channel.subscribe(status => {
      if (this.stopped) return;
      this.statuses.set(topic, status);
      // the server forgets presence when a channel drops, so each join announces it again
      if (presenceKey && status === 'subscribed') this.publishPresence();
      this.refreshConnection();
    });
  }

  private receive(type: string, body: unknown) {
    const received = parseReceived(type, body);
    if (!received) return;
    const set = this.handlers.get(received.event.type);
    if (!set) return;
    for (const handler of set) (handler as Handler<RealtimeEventType>)(received.event.payload as never, received.meta);
  }

  private publishPresence() {
    const topic = campaignTopic(this.campaignId);
    if (this.statuses.get(topic) !== 'subscribed') return;
    const state: PresenceEntry = {
      userId: this.userId,
      ...this.identity,
      status: this.away ? 'away' : this.baseStatus,
      since: this.since,
    };
    void this.channels
      .get(topic)
      ?.track(state as unknown as Record<string, unknown>)
      .catch(() => {});
  }

  private refreshPeople() {
    const fresh = Object.keys(this.rawPresence).filter(k => !this.memberIds.has(k) && !this.strangers.has(k));
    if (this.memberIds.size > 0 && fresh.length > 0) {
      fresh.forEach(k => this.strangers.add(k));
      for (const listener of this.strangerListeners) listener();
    }
    this.people = summarizePresence(this.rawPresence, this.memberIds);
    for (const listener of this.presenceListeners) listener();
  }

  private refreshConnection() {
    const allJoined =
      this.channels.size > 0 && [...this.channels.keys()].every(t => this.statuses.get(t) === 'subscribed');
    const next: ConnectionState = !this.online ? 'offline' : allJoined ? 'connected' : 'reconnecting';
    if (next === this.connection) return;
    this.connection = next;
    for (const listener of this.connectionListeners) listener();
    if (next === 'connected') {
      if (this.everConnected) for (const listener of this.reconnectListeners) listener();
      this.everConnected = true;
    }
  }
}
