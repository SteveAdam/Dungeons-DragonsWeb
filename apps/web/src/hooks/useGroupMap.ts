// P4-2: what the map's group tokens, the tracker and the spotlight need. Moves are saved through the data layer, then
// announced: a group's own players hear about it on their own channel, everyone only when positions are shared.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { setShareGroupPositions } from '../data/campaigns';
import {
  getSpotlight,
  listEntranceCounts,
  listMemberVitals,
  placeGroup,
  setSpotlight,
  type PlaceGroupRequest,
} from '../data/groupTokens';
import type { PartyGroup } from '../data/partyGroups';
import type { ImagePoint } from '../lib/mapCoordinates';
import type { PayloadOf } from '../lib/realtime';
import { useToasts } from '../state/toasts';
import { queryKeys } from './queryKeys';
import { useCampaign } from './useCampaigns';
import { useCharacters } from './useCharacters';
import { useRealtime } from './useRealtime';

/** Who has the spotlight (the banner), or null. */
export const useSpotlight = (campaignId: string, enabled: boolean) =>
  useQuery({ queryKey: queryKeys.spotlight(campaignId), queryFn: () => getSpotlight(campaignId), enabled });

/** How many characters are beneath each entrance of a map, for the "N inside" badges. */
export const useEntranceCounts = (mapId: string) =>
  useQuery({ queryKey: queryKeys.entranceCounts(mapId), queryFn: () => listEntranceCounts(mapId), enabled: !!mapId });

/** DM only: hit points for the tracker. */
export const useMemberVitals = (campaignId: string, enabled: boolean) =>
  useQuery({ queryKey: queryKeys.memberVitals(campaignId), queryFn: () => listMemberVitals(campaignId), enabled });

/**
 * Tells the people who may see a group that it moved: its own players on their channel, and everyone when the DM has
 * shared group positions. `everyone` sends a blank signal to all (used when sharing is switched), which carries no
 * place, so nothing leaks to someone who is about to lose sight of the groups.
 */
export function useGroupBroadcast(campaignId: string) {
  const realtime = useRealtime();
  const characters = useCharacters(campaignId);
  const campaign = useCampaign(campaignId);
  const shared = campaign.data?.shareGroupPositions === true;
  const people = characters.data;
  return useCallback(
    (group: Pick<PartyGroup, 'id' | 'characterIds'>, payload: PayloadOf<'group_moved'>, everyone = false) => {
      if (!realtime) return;
      const owners = new Set((people ?? []).filter(c => group.characterIds.includes(c.id)).map(c => c.ownerId));
      owners.delete(realtime.userId);
      if (!everyone) for (const user of owners) void realtime.send({ user }, 'group_moved', payload);
      if (shared || everyone) void realtime.send('campaign', 'group_moved', payload);
    },
    [realtime, people, shared],
  );
}

export interface PlaceGroupInput {
  group: PartyGroup;
  point: ImagePoint;
  move: PlaceGroupRequest['move'];
}

/** DM only: puts a group's token at a spot, moving the group first when it enters another map or region. */
export function usePlaceGroup(campaignId: string) {
  const client = useQueryClient();
  const broadcast = useGroupBroadcast(campaignId);
  const toast = useToasts(s => s.push);
  return useMutation({
    mutationFn: ({ group, point, move }: PlaceGroupInput) => placeGroup({ campaignId, groupId: group.id, point, move }),
    onSuccess: (revealed, { group, point, move }) => {
      void client.invalidateQueries({ queryKey: queryKeys.partyGroups(campaignId) });
      void client.invalidateQueries({ queryKey: ['entrance-counts'] });
      void client.invalidateQueries({ queryKey: ['group-discoveries'] });
      void client.invalidateQueries({ queryKey: ['here'] });
      if (revealed.length > 0) toast(`${group.name} noticed: ${revealed.join(', ')}.`);
      broadcast(group, {
        groupId: group.id,
        mapId: move ? move.mapId : group.mapId,
        regionId: move ? move.regionId : group.regionId,
        x: point.x,
        y: point.y,
      });
    },
  });
}

/** DM only: gives a group the spotlight (or takes it away with a null group) and tells the table. */
export function useSetSpotlight(campaignId: string) {
  const client = useQueryClient();
  const realtime = useRealtime();
  return useMutation({
    mutationFn: ({ groupId, summary }: { groupId: string | null; summary: string }) =>
      setSpotlight(campaignId, groupId, summary),
    onSuccess: (_, { groupId, summary }) => {
      void client.invalidateQueries({ queryKey: queryKeys.spotlight(campaignId) });
      void realtime?.send('campaign', 'spotlight', { groupId, summary: summary.trim() || null });
    },
  });
}

/** DM only: lets players see where the other groups are, or stops it. Players are told to look again. */
export function useShareGroupPositions(campaignId: string, groups: readonly PartyGroup[]) {
  const client = useQueryClient();
  const broadcast = useGroupBroadcast(campaignId);
  return useMutation({
    mutationFn: (on: boolean) => setShareGroupPositions(campaignId, on),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.campaign(campaignId) });
      const first = groups[0];
      if (first) broadcast(first, { groupId: first.id, mapId: null, regionId: null, x: null, y: null }, true);
    },
  });
}
