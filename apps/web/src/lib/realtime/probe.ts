// Development only (the /dev/realtime page): can the signed-in person really join this topic? Uses a connection of its
// own, so that it cannot disturb the app's channels on the same topics.
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseKey, supabaseUrl } from '../supabase';

const GIVE_UP_MS = 8000;

export async function probeTopic(topic: string): Promise<'allowed' | 'refused'> {
  const { data } = await supabase.auth.getSession();
  const probe = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: 'realtime-probe' },
  });
  await probe.realtime.setAuth(data.session?.access_token ?? null);
  try {
    return await new Promise(resolve => {
      const timer = setTimeout(() => resolve('refused'), GIVE_UP_MS);
      probe.channel(topic, { config: { private: true } }).subscribe(status => {
        if (status !== 'SUBSCRIBED' && status !== 'CHANNEL_ERROR') return;
        clearTimeout(timer);
        resolve(status === 'SUBSCRIBED' ? 'allowed' : 'refused');
      });
    });
  } finally {
    await probe.removeAllChannels();
    probe.realtime.disconnect();
  }
}
