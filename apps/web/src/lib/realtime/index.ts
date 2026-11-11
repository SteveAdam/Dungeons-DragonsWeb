// P4-1: the single realtime client. One campaign is live at a time, on one connection. Screens reach it through
// src/hooks/useRealtime.ts.
import { CampaignRealtime, type CampaignRealtimeOptions } from './campaignRealtime';
import { supabaseTransport } from './supabaseTransport';
import type { RealtimeTransport } from './transport';

export { CampaignRealtime } from './campaignRealtime';
export type { ConnectionState, PresenceIdentity, SendResult } from './campaignRealtime';
export type { EventMeta, PayloadOf, RealtimeEvent, RealtimeEventType } from './events';
export type { PresenceEntry, PresenceStatus } from './presence';
export type { RealtimeTransport, SendTarget } from './transport';

// long enough that React's strict-mode remount, or a re-render of the shell, keeps the same connection
const CLOSE_DELAY_MS = 250;

let transport: RealtimeTransport = supabaseTransport;
let current: CampaignRealtime | null = null;
let holders = 0;
let closing: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function setCurrent(next: CampaignRealtime | null) {
  current = next;
  for (const listener of listeners) listener();
}

/** Tests only: replaces Supabase with a fake, and forgets any connection left by the last test. */
export function setRealtimeTransport(next: RealtimeTransport) {
  clearTimeout(closing);
  current?.stop();
  holders = 0;
  current = null;
  transport = next;
}

export const getRealtime = () => current;

export function subscribeRealtime(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Goes live in a campaign, or joins the connection that is already live there. Returns the function that lets go. */
export function openCampaignRealtime(options: CampaignRealtimeOptions): () => void {
  clearTimeout(closing);
  const same =
    current &&
    current.campaignId === options.campaignId &&
    current.userId === options.userId &&
    current.isDm === options.isDm;
  if (!same) {
    current?.stop();
    holders = 0;
    const next = new CampaignRealtime(transport, options);
    void next.start();
    setCurrent(next);
  }
  holders++;
  const mine = current;
  return () => {
    if (current !== mine) return;
    holders--;
    if (holders > 0) return;
    closing = setTimeout(() => {
      current?.stop();
      setCurrent(null);
    }, CLOSE_DELAY_MS);
  };
}
