// P4-5: the table's pause state, live. A 'pause' event (requested or resumed) means "read the state again"; it never
// says who asked, except to the DMs, and never for an anonymous X-card.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTablePause, requestPause, resumeTable } from '../data/safety';
import { queryKeys } from './queryKeys';
import { useRealtimeEvent } from './useRealtime';

const pauseKey = (campaignId: string) => [...queryKeys.campaign(campaignId), 'pause'] as const;

export function useTablePause(campaignId: string, enabled = true) {
  const client = useQueryClient();
  useRealtimeEvent('pause', () => {
    void client.invalidateQueries({ queryKey: pauseKey(campaignId) });
  });
  return useQuery({
    queryKey: pauseKey(campaignId),
    queryFn: () => getTablePause(campaignId),
    enabled: !!campaignId && enabled,
  });
}

export function useRequestPause(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (anonymous: boolean) => requestPause(campaignId, anonymous),
    onSuccess: () => client.invalidateQueries({ queryKey: pauseKey(campaignId) }),
  });
}

export function useResumeTable(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => resumeTable(campaignId),
    onSuccess: () => client.invalidateQueries({ queryKey: pauseKey(campaignId) }),
  });
}
