import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { getHere, searchHere, subscribeToNotices } from '../data/here';
import { assignCharacter, createGroup, deleteGroup, listDiscoveries, listGroups, moveGroup } from '../data/partyGroups';
import { queryKeys } from './queryKeys';

/** What the character's group knows here (masked by the database). */
export const useHere = (characterId: string) =>
  useQuery({ queryKey: queryKeys.here(characterId), queryFn: () => getHere(characterId), enabled: !!characterId });

export function useSearchHere(campaignId: string, characterId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => searchHere(campaignId, characterId),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.here(characterId) }),
  });
}

/**
 * While the character is in a group, each discovery the group makes calls onNotice and refreshes the Here list
 * (realtime, so other members see it too).
 */
export function useDiscoveryNotices(
  characterId: string,
  groupId: string | undefined,
  onNotice: (text: string) => void,
) {
  const client = useQueryClient();
  const latest = useRef(onNotice);
  useEffect(() => {
    latest.current = onNotice;
  });
  useEffect(() => {
    if (!groupId) return undefined;
    return subscribeToNotices(groupId, text => {
      latest.current(text);
      void client.invalidateQueries({ queryKey: queryKeys.here(characterId) });
    });
  }, [client, characterId, groupId]);
}

// DM only: the party groups panel. Pass enabled=false outside DM mode.

export const usePartyGroups = (campaignId: string, enabled: boolean) =>
  useQuery({ queryKey: queryKeys.partyGroups(campaignId), queryFn: () => listGroups(campaignId), enabled });

export const useGroupDiscoveries = (groupIds: string[], enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.groupDiscoveries(groupIds),
    queryFn: () => listDiscoveries(groupIds),
    enabled: enabled && groupIds.length > 0,
  });

function useGroupMutation<A, R>(campaignId: string, fn: (args: A) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.partyGroups(campaignId) });
      void client.invalidateQueries({ queryKey: ['group-discoveries'] });
      void client.invalidateQueries({ queryKey: ['here'] });
    },
  });
}

export const useCreateGroup = (campaignId: string) =>
  useGroupMutation(campaignId, ({ name, color }: { name: string; color: string }) =>
    createGroup(campaignId, name, color),
  );
export const useDeleteGroup = (campaignId: string) =>
  useGroupMutation(campaignId, (groupId: string) => deleteGroup(groupId));
export const useAssignCharacter = (campaignId: string) =>
  useGroupMutation(campaignId, ({ characterId, groupId }: { characterId: string; groupId: string | null }) =>
    assignCharacter(characterId, groupId),
  );
export const useMoveGroup = (campaignId: string) =>
  useGroupMutation(
    campaignId,
    ({ groupId, mapId, regionId }: { groupId: string; mapId: string | null; regionId: string | null }) =>
      moveGroup(campaignId, groupId, mapId, regionId),
  );
