import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../supabase';
import { supabaseTransport } from './supabaseTransport';

// The real transport, against a stand-in Supabase client. Everything else in the app tests with fakeRealtime.ts.
vi.mock('../supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    realtime: { setAuth: vi.fn() },
    channel: vi.fn(),
    removeChannel: vi.fn(),
    rpc: vi.fn(),
  },
}));

type Listener = (payload: unknown) => void;

function fakeChannel() {
  const listeners: { type: string; filter: unknown; cb: Listener }[] = [];
  let statusCb: ((status: string) => void) | undefined;
  const channel = {
    on: vi.fn((type: string, filter: unknown, cb: Listener) => {
      listeners.push({ type, filter, cb });
      return channel;
    }),
    subscribe: vi.fn((cb: (status: string) => void) => {
      statusCb = cb;
      return channel;
    }),
    track: vi.fn(async () => 'ok'),
    presenceState: vi.fn(() => ({ u1: [{ name: 'Lyra' }] })),
    emit: (type: string, payload?: unknown) => listeners.filter(l => l.type === type).forEach(l => l.cb(payload)),
    status: (s: string) => statusCb?.(s),
    listeners,
  };
  vi.mocked(supabase.channel).mockReturnValueOnce(channel as never);
  return channel;
}

beforeEach(() => vi.clearAllMocks());

describe('ready', () => {
  it('hands the session token to realtime', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: { access_token: 'tok' } },
    } as never);
    await supabaseTransport.ready();
    expect(supabase.realtime.setAuth).toHaveBeenCalledWith('tok');
  });

  it('clears the token when signed out', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({ data: { session: null } } as never);
    await supabaseTransport.ready();
    expect(supabase.realtime.setAuth).toHaveBeenCalledWith(null);
  });
});

describe('openChannel', () => {
  it('opens a private channel, with a presence key only when asked', () => {
    fakeChannel();
    supabaseTransport.openChannel('campaign:c1');
    expect(supabase.channel).toHaveBeenLastCalledWith('campaign:c1', { config: { private: true } });

    fakeChannel();
    supabaseTransport.openChannel('campaign:c1', { presenceKey: 'u1' });
    expect(supabase.channel).toHaveBeenLastCalledWith('campaign:c1', {
      config: { private: true, presence: { key: 'u1' } },
    });
  });

  it('passes every broadcast on with its event name and payload', () => {
    const ch = fakeChannel();
    const handler = vi.fn();
    supabaseTransport.openChannel('campaign:c1').onBroadcast(handler);
    expect(ch.on).toHaveBeenCalledWith('broadcast', { event: '*' }, expect.any(Function));
    ch.emit('broadcast', { event: 'ping', payload: { x: 1 } });
    expect(handler).toHaveBeenCalledWith('ping', { x: 1 });
  });

  it('passes the whole presence state on each sync', () => {
    const ch = fakeChannel();
    const handler = vi.fn();
    supabaseTransport.openChannel('campaign:c1').onPresence(handler);
    expect(ch.on).toHaveBeenCalledWith('presence', { event: 'sync' }, expect.any(Function));
    ch.emit('presence');
    expect(handler).toHaveBeenCalledWith({ u1: [{ name: 'Lyra' }] });
  });

  it('maps Supabase statuses and ignores ones it does not know', () => {
    const ch = fakeChannel();
    const onStatus = vi.fn();
    supabaseTransport.openChannel('campaign:c1').subscribe(onStatus);
    for (const s of ['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED', 'JOINING']) ch.status(s);
    expect(onStatus.mock.calls.map(c => c[0])).toEqual(['subscribed', 'error', 'timed-out', 'closed']);
  });

  it('tracks presence state and removes the channel on close', async () => {
    const ch = fakeChannel();
    const t = supabaseTransport.openChannel('campaign:c1', { presenceKey: 'u1' });
    await t.track({ name: 'Lyra' });
    expect(ch.track).toHaveBeenCalledWith({ name: 'Lyra' });
    t.close();
    expect(supabase.removeChannel).toHaveBeenCalledWith(ch);
  });
});

describe('send', () => {
  it('sends to a named channel without a target user', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as never);
    await supabaseTransport.send({ campaignId: 'c1', target: 'dm', type: 'ping', payload: { x: 1 } });
    expect(supabase.rpc).toHaveBeenCalledWith('send_realtime_event', {
      p_campaign: 'c1',
      p_channel: 'dm',
      p_event: 'ping',
      p_payload: { x: 1 },
    });
  });

  it('sends to one person through the user channel', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as never);
    await supabaseTransport.send({ campaignId: 'c1', target: { user: 'u2' }, type: 'handout', payload: null });
    expect(supabase.rpc).toHaveBeenCalledWith('send_realtime_event', {
      p_campaign: 'c1',
      p_channel: 'user',
      p_event: 'handout',
      p_payload: null,
      p_target: 'u2',
    });
  });

  it('throws the server error', async () => {
    const error = { code: '42501', message: 'nope' };
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error } as never);
    await expect(supabaseTransport.send({ campaignId: 'c1', target: 'campaign', type: 'x', payload: {} })).rejects.toBe(
      error,
    );
  });
});
