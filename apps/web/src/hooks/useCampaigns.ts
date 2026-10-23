import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  advanceClock,
  createCampaign,
  getCampaign,
  getInviteCode,
  joinCampaign,
  listCampaigns,
  subscribeToClock,
  type Campaign,
} from '../data/campaigns';
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

/** Puts a new game time into the cached campaign, so every effect countdown on screen moves with it. */
function useSetClock(campaignId: string) {
  const client = useQueryClient();
  return (gameSeconds: number) =>
    client.setQueryData<Campaign>(queryKeys.campaign(campaignId), old => (old ? { ...old, gameSeconds } : old));
}

/** DM only (P2-8): moves the clock forward. */
export function useAdvanceClock(campaignId: string) {
  const setClock = useSetClock(campaignId);
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ seconds, reason }: { seconds: number; reason: string }) => advanceClock(campaignId, seconds, reason),
    onSuccess: gameSeconds => {
      setClock(gameSeconds);
      return client.invalidateQueries({ queryKey: queryKeys.campaign(campaignId), exact: true });
    },
  });
}

/** Keeps the cached game time current while a screen is open: the DM's moves arrive over realtime. */
export function useLiveClock(campaignId: string | undefined) {
  const client = useQueryClient();
  useEffect(() => {
    if (!campaignId) return;
    return subscribeToClock(campaignId, gameSeconds =>
      client.setQueryData<Campaign>(queryKeys.campaign(campaignId), old => (old ? { ...old, gameSeconds } : old)),
    );
  }, [campaignId, client]);
}
