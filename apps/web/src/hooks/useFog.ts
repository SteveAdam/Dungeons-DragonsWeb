// P4-3: fog of war strokes, live. A stroke the DM is drawing goes out as it grows ("partial"), then once saved
// ("final"); anything bigger (clearing, simplifying, changing the map's fog settings) asks everyone to read the fog
// again ("reload"). In per-group mode only the group's own players are told; in shared mode the whole table is.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { addFogStroke, clearFog, listFogStrokes, replaceFog, type SavedFogStroke } from '../data/fog';
import { setMapFog, type CampaignMap } from '../data/maps';
import type { PartyGroup } from '../data/partyGroups';
import type { FogStroke } from '../lib/fog';
import type { PayloadOf } from '../lib/realtime';
import { queryKeys } from './queryKeys';
import { useCharacters } from './useCharacters';
import { useRealtime, useRealtimeEvent } from './useRealtime';

export type FogEvent = PayloadOf<'fog_stroke'>;

export interface LiveStroke extends FogStroke {
  groupId: string | null;
}

export const useFogStrokes = (mapId: string, enabled: boolean) =>
  useQuery({ queryKey: queryKeys.fog(mapId), queryFn: () => listFogStrokes(mapId), enabled: !!mapId && enabled });

/** Listens for fog news about this map: strokes being drawn now (returned, by key), saved strokes, and reloads. */
export function useLiveFog(mapId: string): ReadonlyMap<string, LiveStroke> {
  const client = useQueryClient();
  const [partials, setPartials] = useState<ReadonlyMap<string, LiveStroke>>(new Map());
  useRealtimeEvent('fog_stroke', event => {
    if (event.mapId !== mapId) return;
    if (event.kind === 'reload') {
      setPartials(new Map());
      void client.invalidateQueries({ queryKey: ['maps', mapId] });
      return;
    }
    const stroke: LiveStroke = {
      groupId: event.groupId,
      mode: event.mode,
      radius: event.radius,
      points: event.points,
    };
    if (event.kind === 'final') {
      client.setQueryData<SavedFogStroke[]>(queryKeys.fog(mapId), old =>
        old && !old.some(s => s.id === event.strokeKey)
          ? [...old, { ...stroke, id: event.strokeKey, seq: (old[old.length - 1]?.seq ?? 0) + 1 }]
          : old,
      );
    }
    setPartials(current => {
      const next = new Map(current);
      if (event.kind === 'partial') next.set(event.strokeKey, stroke);
      else next.delete(event.strokeKey);
      return next;
    });
  });
  return partials;
}

/**
 * Tells the people who may see a fog about it: a group's own players for its fog (per-group mode), or the whole table
 * for the shared fog of a map players can see. A reload carries nothing, so it may go to everyone.
 */
export function useFogBroadcast(campaignId: string, map: CampaignMap | undefined, groups: readonly PartyGroup[]) {
  const realtime = useRealtime();
  const characters = useCharacters(campaignId);
  const people = characters.data;
  return useCallback(
    (event: FogEvent) => {
      if (!realtime || !map) return;
      if (event.kind !== 'reload' && map.fogMode === 'per_group' && event.groupId) {
        const group = groups.find(g => g.id === event.groupId);
        const owners = new Set((people ?? []).filter(c => group?.characterIds.includes(c.id)).map(c => c.ownerId));
        owners.delete(realtime.userId);
        for (const user of owners) void realtime.send({ user }, 'fog_stroke', event);
        return;
      }
      if (event.kind === 'reload' || map.visibleToPlayers) void realtime.send('campaign', 'fog_stroke', event);
    },
    [realtime, map, groups, people],
  );
}

/** DM only: saves a brush stroke and adds it to the fog on screen. */
export function useAddFogStroke(mapId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, stroke }: { groupId: string | null; stroke: FogStroke }) =>
      addFogStroke(mapId, groupId, stroke),
    onSuccess: saved =>
      client.setQueryData<SavedFogStroke[]>(queryKeys.fog(mapId), old => (old ? [...old, saved] : [saved])),
  });
}

/** DM only: reveal or hide everything for one fog. */
export function useClearFog(mapId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, mode }: { groupId: string | null; mode: 'reveal' | 'hide' }) =>
      clearFog(mapId, groupId, mode),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.fog(mapId) }),
  });
}

/** DM only: replaces one fog's history with a shorter equivalent. */
export function useReplaceFog(mapId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, strokes }: { groupId: string | null; strokes: FogStroke[] }) =>
      replaceFog(mapId, groupId, strokes),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.fog(mapId) }),
  });
}

/** DM only: turns fog on or off for a map, and chooses shared or per-group fog. */
export function useSetMapFog() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ mapId, enabled, mode }: { mapId: string; enabled: boolean; mode: CampaignMap['fogMode'] }) =>
      setMapFog(mapId, { enabled, mode }),
    onSuccess: (map: CampaignMap) => client.invalidateQueries({ queryKey: ['maps', map.id] }),
  });
}
