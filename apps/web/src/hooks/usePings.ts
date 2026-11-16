// P4-4: pings, live. Sending goes through the realtime client (which holds to one ping every two seconds); receiving
// drops pings for other maps, from strangers, too fast, or while pings are off for players (lib/pings.ts). Each ripple
// lasts three seconds, and every ping is also put into words for the polite live region.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { setPingsEnabled } from '../data/campaigns';
import { listPingMutes, mutePings, unmutePings } from '../data/pings';
import {
  createPingGate,
  nearestPinName,
  pingAnnouncement,
  pingColour,
  PING_LIFETIME_MS,
  receivePing,
  type NamedPoint,
  type PingMember,
  type PingView,
} from '../lib/pings';
import type { SendResult } from '../lib/realtime';
import { queryKeys } from './queryKeys';
import { useRealtime, useRealtimeEvent } from './useRealtime';

const pingMutesKey = (campaignId: string) => [...queryKeys.campaign(campaignId), 'ping-mutes'] as const;

export const usePingMutes = (campaignId: string, enabled = true) =>
  useQuery({
    queryKey: pingMutesKey(campaignId),
    queryFn: () => listPingMutes(campaignId),
    enabled: !!campaignId && enabled,
  });

export function useMutePings(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, muted }: { userId: string; muted: boolean }) =>
      muted ? mutePings(campaignId, userId) : unmutePings(campaignId, userId),
    onSuccess: () => client.invalidateQueries({ queryKey: pingMutesKey(campaignId) }),
  });
}

/** DM only: whether players may ping (the DM always can). */
export function useSetPingsEnabled(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) => setPingsEnabled(campaignId, on),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.campaign(campaignId), exact: true }),
  });
}

export interface LivePingOptions {
  mapId: string;
  size: { width: number; height: number };
  members: readonly PingMember[];
  pingsEnabled: boolean;
  /** The pins on screen, to say where a ping is ("near Port Vellum"). */
  pins: readonly NamedPoint[];
  now?: () => number;
}

export interface LivePings {
  pings: PingView[];
  /** The latest ping in words, for the live region and the text-only view. */
  announcement: string;
  /** Shows the viewer's own ping at once (the copy coming back from the server is then dropped). */
  showOwn: (ping: Omit<PingView, 'key'>) => void;
}

export function useLivePings({ mapId, size, members, pingsEnabled, pins, now = Date.now }: LivePingOptions): LivePings {
  // each ripple remembers the map it was made on, so moving to another map shows none of the old ones
  const [all, setPings] = useState<(PingView & { mapId: string })[]>([]);
  const pings = useMemo(() => all.filter(p => p.mapId === mapId), [all, mapId]);
  const [announcement, setAnnouncement] = useState('');
  const gate = useMemo(() => createPingGate(now), [now]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const counter = useRef(0);

  useEffect(() => {
    const live = timers.current;
    return () => {
      live.forEach(clearTimeout);
      live.clear();
    };
  }, []);

  const show = useCallback(
    (ping: Omit<PingView, 'key'>) => {
      counter.current += 1;
      const key = `${ping.sender}:${counter.current}`;
      setPings(current => [...current, { ...ping, key, mapId }]);
      setAnnouncement(pingAnnouncement(ping.name, nearestPinName(ping, pins, size)));
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        setPings(current => current.filter(p => p.key !== key));
      }, PING_LIFETIME_MS);
      timers.current.add(timer);
    },
    [pins, size, mapId],
  );

  const showOwn = useCallback(
    (ping: Omit<PingView, 'key'>) => {
      if (gate.accept(ping.sender)) show(ping);
    },
    [gate, show],
  );

  useRealtimeEvent('ping', (payload, meta) => {
    const ping = receivePing(payload, meta, { mapId, size, members, pingsEnabled });
    if (!ping || !gate.accept(meta.sender)) return;
    show(ping);
  });

  return { pings, announcement, showOwn };
}

/** Sends a ping for a spot on this map. The result says whether it went (or why not: too soon, offline…). */
export function useSendPing(mapId: string, me: PingMember | undefined, members: readonly PingMember[]) {
  const realtime = useRealtime();
  return useCallback(
    async (point: { x: number; y: number }): Promise<SendResult | null> => {
      if (!realtime || !me) return null;
      return realtime.send('campaign', 'ping', {
        mapId,
        x: Math.round(point.x * 10) / 10,
        y: Math.round(point.y * 10) / 10,
        colour: pingColour(me.userId, members),
        name: me.displayName.slice(0, 120),
      });
    },
    [realtime, mapId, me, members],
  );
}
