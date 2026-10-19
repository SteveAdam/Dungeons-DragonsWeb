import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCampaign, getCampaign, getInviteCode, joinCampaign, listCampaigns } from '../data/campaigns';
import { queryKeys } from './queryKeys';

export const useCampaigns = () => useQuery({ queryKey: queryKeys.campaigns, queryFn: listCampaigns });

export const useCampaign = (campaignId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.campaign(campaignId ?? ''),
    queryFn: () => getCampaign(campaignId as string),
    enabled: !!campaignId,
  });

/** Pass enabled=false for anyone who is not a DM, so the request is never made. */
export const useInviteCode = (campaignId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.inviteCode(campaignId ?? ''),
    queryFn: () => getInviteCode(campaignId as string),
    enabled: enabled && !!campaignId,
    staleTime: 5 * 60_000,
  });

export function useCreateCampaign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createCampaign(name),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.campaigns, exact: true }),
  });
}

export function useJoinCampaign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => joinCampaign(code),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.campaigns, exact: true }),
  });
}
