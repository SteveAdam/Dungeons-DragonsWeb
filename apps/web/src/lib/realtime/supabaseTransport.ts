import type { Json } from '../../types/database';
import { supabase } from '../supabase';
import type { ChannelStatus, RealtimeTransport, TransportChannel } from './transport';

const STATUS: Record<string, ChannelStatus> = {
  SUBSCRIBED: 'subscribed',
  CHANNEL_ERROR: 'error',
  TIMED_OUT: 'timed-out',
  CLOSED: 'closed',
};

/** The real thing: private channels only, on the app's one Supabase connection. */
export const supabaseTransport: RealtimeTransport = {
  async ready() {
    const { data } = await supabase.auth.getSession();
    await supabase.realtime.setAuth(data.session?.access_token ?? null);
  },

  openChannel(topic, options): TransportChannel {
    const channel = supabase.channel(topic, {
      config: { private: true, ...(options?.presenceKey ? { presence: { key: options.presenceKey } } : {}) },
    });
    return {
      onBroadcast(handler) {
        channel.on('broadcast', { event: '*' }, message => handler(String(message.event), message.payload));
      },
      onPresence(handler) {
        channel.on('presence', { event: 'sync' }, () => handler(channel.presenceState()));
      },
      subscribe(onStatus) {
        channel.subscribe(status => {
          const mapped = STATUS[status];
          if (mapped) onStatus(mapped);
        });
      },
      async track(state) {
        await channel.track(state);
      },
      close() {
        void supabase.removeChannel(channel);
      },
    };
  },

  async send({ campaignId, target, type, payload }) {
    const { error } = await supabase.rpc('send_realtime_event', {
      p_campaign: campaignId,
      p_channel: typeof target === 'string' ? target : 'user',
      p_event: type,
      p_payload: payload as Json,
      ...(typeof target === 'string' ? {} : { p_target: target.user }),
    });
    if (error) throw error;
  },
};
