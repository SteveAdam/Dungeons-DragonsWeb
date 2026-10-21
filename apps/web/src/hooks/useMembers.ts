import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMyRole, listMembers, removeMember } from '../data/members';
import { queryKeys } from './queryKeys';

export const useMembers = (campaignId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.members(campaignId ?? ''),
    queryFn: () => listMembers(campaignId as string),
    enabled: !!campaignId,
  });

export const useMyRole = (campaignId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.myRole(campaignId ?? ''),
    queryFn: () => getMyRole(campaignId as string),
    enabled: !!campaignId,
  });

/** DM only: removes a member, then refreshes the member list (and with it the hub's member count). */
export function useRemoveMember(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeMember(campaignId, userId),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.members(campaignId) }),
  });
}
