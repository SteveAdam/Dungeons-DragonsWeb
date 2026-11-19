// P4-6: the dialogue tool's data, live. The DM's side refreshes check results as rolls land and hears players'
// choices; a player's side keeps the latest line said to them and their open check requests.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  closeCheck,
  createLine,
  deleteLine,
  getNpcProfile,
  listLines,
  listLog,
  listMyRequests,
  listRequests,
  offerCheck,
  sayLine,
  setDisposition,
  updateLine,
  type Disposition,
  type LineDraft,
  type OfferInput,
  type SayInput,
} from '../data/dialogue';
import { subscribeToRolls } from '../data/rolls';
import type { PayloadOf } from '../lib/realtime';
import { queryKeys } from './queryKeys';
import { useRealtimeEvent } from './useRealtime';

const keys = {
  profile: (npcId: string) => ['npc', npcId, 'profile'] as const,
  lines: (npcId: string) => ['npc', npcId, 'lines'] as const,
  log: (campaignId: string, npcId: string | undefined) =>
    [...queryKeys.campaign(campaignId), 'dialogue-log', npcId ?? 'all'] as const,
  requests: (campaignId: string) => [...queryKeys.campaign(campaignId), 'check-requests'] as const,
  myRequests: (campaignId: string) => [...queryKeys.campaign(campaignId), 'my-check-requests'] as const,
};

export const useNpcProfile = (npcId: string, enabled = true) =>
  useQuery({ queryKey: keys.profile(npcId), queryFn: () => getNpcProfile(npcId), enabled: !!npcId && enabled });

export function useSetDisposition(campaignId: string, npcId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (d: Disposition) => setDisposition(campaignId, npcId, d),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.profile(npcId) }),
  });
}

export const useLines = (npcId: string, enabled = true) =>
  useQuery({ queryKey: keys.lines(npcId), queryFn: () => listLines(npcId), enabled: !!npcId && enabled });

export function useSaveLine(campaignId: string, npcId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, draft }: { lineId: string | null; draft: LineDraft }) =>
      lineId ? updateLine(lineId, draft) : createLine(campaignId, npcId, draft).then(() => undefined),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.lines(npcId) }),
  });
}

export function useDeleteLine(npcId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) => deleteLine(lineId),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.lines(npcId) }),
  });
}

export const useDialogueLog = (campaignId: string, npcId?: string, enabled = true) =>
  useQuery({
    queryKey: keys.log(campaignId, npcId),
    queryFn: () => listLog(campaignId, npcId),
    enabled: !!campaignId && enabled,
  });

export function useSayLine(campaignId: string, npcId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<SayInput, 'npcId'>) => sayLine({ ...input, npcId }),
    onSuccess: (_r, input) => {
      void client.invalidateQueries({ queryKey: [...queryKeys.campaign(campaignId), 'dialogue-log'] });
      void client.invalidateQueries({ queryKey: keys.requests(campaignId) });
      if (input.saveToNpc) void client.invalidateQueries({ queryKey: keys.lines(npcId) });
    },
  });
}

/** DM: check requests and their answers, read again whenever a roll lands in the campaign. */
export function useCheckRequests(campaignId: string, enabled = true) {
  const client = useQueryClient();
  useEffect(() => {
    if (!campaignId || !enabled) return;
    return subscribeToRolls(campaignId, () => void client.invalidateQueries({ queryKey: keys.requests(campaignId) }));
  }, [campaignId, enabled, client]);
  return useQuery({
    queryKey: keys.requests(campaignId),
    queryFn: () => listRequests(campaignId),
    enabled: !!campaignId && enabled,
  });
}

export function useOfferCheck(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<OfferInput, 'campaignId'>) => offerCheck({ ...input, campaignId }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.requests(campaignId) }),
  });
}

export function useCloseCheck(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => closeCheck(requestId),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.requests(campaignId) }),
  });
}

export type DialogueChoice = PayloadOf<'dialogue_choice'> & { sender: string; at: string };

/** DM: what players chose to say, as it arrives, newest first (at most 20). */
export function useDialogueChoices() {
  const [choices, setChoices] = useState<DialogueChoice[]>([]);
  useRealtimeEvent('dialogue_choice', (payload, meta) => {
    setChoices(current => [{ ...payload, sender: meta.sender, at: meta.sentAt }, ...current].slice(0, 20));
  });
  return choices;
}

/** Player: their open check requests, read again when a check is offered or a line with a check is said. */
export function useMyRequests(campaignId: string, enabled = true) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: keys.myRequests(campaignId) });
  useRealtimeEvent('check_offer', refresh);
  useRealtimeEvent('dialogue', payload => {
    if (payload.options.some(o => o.requestId)) refresh();
  });
  return useQuery({
    queryKey: keys.myRequests(campaignId),
    queryFn: () => listMyRequests(campaignId),
    enabled: !!campaignId && enabled,
  });
}

export const invalidateMyRequests = (client: ReturnType<typeof useQueryClient>, campaignId: string) =>
  client.invalidateQueries({ queryKey: keys.myRequests(campaignId) });

export type SpokenLine = PayloadOf<'dialogue'>;

/** Player: the latest line an NPC said to them, until they put it away. */
export function useLatestLine() {
  const [line, setLine] = useState<SpokenLine | null>(null);
  const client = useQueryClient();
  useRealtimeEvent('dialogue', payload => {
    setLine(payload);
    if (payload.logId) void client.invalidateQueries({ predicate: q => q.queryKey.includes('dialogue-log') });
  });
  return { line, dismiss: () => setLine(null) };
}
