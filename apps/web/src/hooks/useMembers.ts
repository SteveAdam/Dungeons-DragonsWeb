import { useQuery } from '@tanstack/react-query';
import { getMyRole, listMembers } from '../data/members';
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
