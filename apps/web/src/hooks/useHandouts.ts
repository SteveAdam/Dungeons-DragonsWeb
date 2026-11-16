// P4-4: handouts. The DM's library and the player's list read the same query (the database returns what each may
// read). A 'handout' event on the player's own channel means "the DM just showed you this": the list is read again and
// the popup is told which one.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createHandout,
  deleteHandout,
  listHandouts,
  markHandoutSeen,
  showHandout,
  takeBackHandout,
  updateHandout,
  type Handout,
  type HandoutAudience,
  type HandoutInput,
} from '../data/handouts';
import { handoutImageStore, type HandoutImageStore } from '../lib/storage';
import { queryKeys } from './queryKeys';
import { useRealtimeEvent } from './useRealtime';

const handoutsKey = (campaignId: string) => [...queryKeys.campaign(campaignId), 'handouts'] as const;

export const useHandouts = (campaignId: string | undefined, enabled = true, refetchInterval?: number) =>
  useQuery({
    queryKey: handoutsKey(campaignId ?? ''),
    queryFn: () => listHandouts(campaignId as string),
    enabled: !!campaignId && enabled,
    refetchInterval,
  });

export const useHandoutImageUrl = (path: string | null, store: HandoutImageStore = handoutImageStore) =>
  useQuery({
    queryKey: ['handout-image', path ?? ''],
    queryFn: () => store.getUrl(path as string),
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
  });

/** "The DM just showed you this": read the handouts again (the popup then finds the new one). */
export function useHandoutArrivals(campaignId: string | undefined) {
  const client = useQueryClient();
  useRealtimeEvent('handout', () => {
    if (campaignId) void client.invalidateQueries({ queryKey: handoutsKey(campaignId) });
  });
}

function useInvalidate(campaignId: string) {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: handoutsKey(campaignId) });
}

export function useCreateHandout(campaignId: string, store: HandoutImageStore = handoutImageStore) {
  const invalidate = useInvalidate(campaignId);
  return useMutation({
    mutationFn: (input: HandoutInput) => createHandout(campaignId, input, store),
    onSuccess: invalidate,
  });
}

export function useUpdateHandout(campaignId: string, store: HandoutImageStore = handoutImageStore) {
  const invalidate = useInvalidate(campaignId);
  return useMutation({
    mutationFn: ({ handout, input }: { handout: Handout; input: Omit<HandoutInput, 'kind'> }) =>
      updateHandout(handout, input, store),
    onSuccess: invalidate,
  });
}

export function useDeleteHandout(campaignId: string, store: HandoutImageStore = handoutImageStore) {
  const invalidate = useInvalidate(campaignId);
  return useMutation({ mutationFn: (handout: Handout) => deleteHandout(handout, store), onSuccess: invalidate });
}

export function useShowHandout(campaignId: string) {
  const invalidate = useInvalidate(campaignId);
  return useMutation({
    mutationFn: ({ handoutId, audience }: { handoutId: string; audience: HandoutAudience }) =>
      showHandout(handoutId, audience),
    onSuccess: invalidate,
  });
}

export function useTakeBackHandout(campaignId: string) {
  const invalidate = useInvalidate(campaignId);
  return useMutation({
    mutationFn: ({ handoutId, userId }: { handoutId: string; userId: string }) => takeBackHandout(handoutId, userId),
    onSuccess: invalidate,
  });
}

/** Marks a handout opened, and drops its "new" marker at once rather than after the round trip. */
export function useMarkHandoutSeen(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (handoutId: string) => markHandoutSeen(handoutId),
    onMutate: handoutId => {
      const seenAt = new Date().toISOString();
      client.setQueryData<Handout[]>(handoutsKey(campaignId), old =>
        old?.map(h =>
          h.id === handoutId ? { ...h, shares: h.shares.map(s => ({ ...s, seenAt: s.seenAt ?? seenAt })) } : h,
        ),
      );
    },
    onSettled: () => client.invalidateQueries({ queryKey: handoutsKey(campaignId) }),
  });
}
