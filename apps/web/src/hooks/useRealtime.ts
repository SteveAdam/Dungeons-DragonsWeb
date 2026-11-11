// P4-1: how screens reach the live campaign. Outside a live campaign these are quiet: no connection, nobody present.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  getRealtime,
  subscribeRealtime,
  type ConnectionState,
  type EventMeta,
  type PayloadOf,
  type PresenceEntry,
  type RealtimeEventType,
} from '../lib/realtime';

const NOBODY: PresenceEntry[] = [];
const noSubscription = () => () => {};

/** The live campaign's connection, or null when no campaign is live. */
export const useRealtime = () => useSyncExternalStore(subscribeRealtime, getRealtime);

/** Who is at the table right now, for display only. */
export function usePresence(): PresenceEntry[] {
  const realtime = useRealtime();
  return useSyncExternalStore(realtime?.subscribePresence ?? noSubscription, realtime?.getPresence ?? (() => NOBODY));
}

/** The connection's state, or null when no campaign is live. */
export function useConnectionState(): ConnectionState | null {
  const realtime = useRealtime();
  return useSyncExternalStore(realtime?.subscribeConnection ?? noSubscription, realtime?.getConnection ?? (() => null));
}

/** Calls the handler for each valid event of this type. The handler may change between renders. */
export function useRealtimeEvent<T extends RealtimeEventType>(
  type: T,
  handler: (payload: PayloadOf<T>, meta: EventMeta) => void,
) {
  const realtime = useRealtime();
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => realtime?.on(type, (payload, meta) => latest.current(payload, meta)), [realtime, type]);
}
