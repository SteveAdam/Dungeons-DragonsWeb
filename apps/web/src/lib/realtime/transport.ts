// What the realtime module needs from the outside world. The real one is Supabase; tests use src/test/fakeRealtime.ts.

export type ChannelStatus = 'subscribed' | 'error' | 'timed-out' | 'closed';

/** Where an event goes: to the table, to the DMs, or to one person's channel. */
export type SendTarget = 'campaign' | 'dm' | { user: string };

export interface TransportChannel {
  onBroadcast(handler: (type: string, body: unknown) => void): void;
  /** Called with the whole presence state, keyed by user, whenever it changes. */
  onPresence(handler: (state: Record<string, unknown[]>) => void): void;
  /** Called every time the channel's status changes, including after each rejoin. */
  subscribe(onStatus: (status: ChannelStatus) => void): void;
  track(state: Record<string, unknown>): Promise<void>;
  close(): void;
}

export interface SendRequest {
  campaignId: string;
  target: SendTarget;
  type: string;
  payload: unknown;
}

export interface RealtimeTransport {
  /** Resolves when opening a private channel will carry the signed-in person's token. */
  ready(): Promise<void>;
  openChannel(topic: string, options?: { presenceKey?: string }): TransportChannel;
  send(request: SendRequest): Promise<void>;
}

export const campaignTopic = (campaignId: string) => `campaign:${campaignId}`;
export const dmTopic = (campaignId: string) => `dm:${campaignId}`;
export const userTopic = (campaignId: string, userId: string) => `user:${campaignId}:${userId}`;
