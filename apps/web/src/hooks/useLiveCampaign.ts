// P4-1: what keeps a campaign live while any of its screens is open. Called once, from the app shell.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from '../auth/authContext';
import { openCampaignRealtime } from '../lib/realtime';
import { useToasts } from '../state/toasts';
import { useLiveClock } from './useCampaigns';
import { useCharacters } from './useCharacters';
import { usePartyGroups } from './useHere';
import { useMembers, useMyRole } from './useMembers';
import { queryKeys } from './queryKeys';
import { useRealtime, useRealtimeEvent } from './useRealtime';

export function useLiveCampaign(campaignId: string) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const client = useQueryClient();
  const role = useMyRole(campaignId);
  const members = useMembers(campaignId);
  const characters = useCharacters(campaignId);
  const groups = usePartyGroups(campaignId, !!role.data);
  const realtime = useRealtime();
  const pushToast = useToasts(s => s.push);

  useLiveClock(campaignId);

  const isDm = role.data === 'dm';
  const isMember = !!role.data;
  useEffect(() => {
    if (!userId || !isMember) return;
    return openCampaignRealtime({ campaignId, userId, isDm });
  }, [campaignId, userId, isMember, isDm]);

  const memberList = members.data;
  useEffect(() => {
    if (memberList) realtime?.setMembers(new Set(memberList.map(m => m.userId)));
  }, [realtime, memberList]);

  const me = memberList?.find(m => m.userId === userId);
  const character = characters.data?.find(c => c.ownerId === userId);
  const name = character?.name ?? me?.displayName ?? 'Adventurer';
  const characterId = character?.id ?? null;
  const groupId = (characterId && groups.data?.find(g => g.characterIds.includes(characterId))?.id) || null;
  useEffect(() => {
    realtime?.setIdentity({ name, characterId, groupId });
  }, [realtime, name, characterId, groupId]);

  // broadcasts are not replayed, so everything durable is read again after a gap
  useEffect(() => realtime?.onReconnect(() => void client.invalidateQueries()), [realtime, client]);
  useEffect(
    () => realtime?.onStranger(() => void client.invalidateQueries({ queryKey: queryKeys.members(campaignId) })),
    [realtime, client, campaignId],
  );

  useRealtimeEvent('toast', payload => pushToast(payload.message));
}
