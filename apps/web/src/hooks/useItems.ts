import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptTransfer,
  attuneItem,
  cancelTransfer,
  createItem,
  declineTransfer,
  equipItem,
  forceMoveItem,
  getItemSecret,
  getPartyRoster,
  listCharacterItems,
  listItems,
  listTransfers,
  offerTransfer,
  saveItemSecret,
  updateItemRules,
  type ItemOwnerType,
  type ItemRules,
  type ItemSecret,
  type NewItem,
} from '../data/items';
import { queryKeys } from './queryKeys';

/** Every item the viewer may read in the campaign (their characters', the party's; all for the DM). */
export const useItems = (campaignId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.items(campaignId ?? ''),
    queryFn: () => listItems(campaignId as string),
    enabled: !!campaignId,
  });

export const useCharacterItems = (characterId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.characterItems(characterId ?? ''),
    queryFn: () => listCharacterItems(characterId as string),
    enabled: !!characterId,
  });

export const useTransfers = (campaignId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.transfers(campaignId ?? ''),
    queryFn: () => listTransfers(campaignId as string),
    enabled: !!campaignId,
  });

export const usePartyRoster = (campaignId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: queryKeys.roster(campaignId ?? ''),
    queryFn: () => getPartyRoster(campaignId as string),
    enabled: enabled && !!campaignId,
  });

/** DM only: pass enabled=false outside DM mode, so the request is never made. */
export const useItemSecret = (itemId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.itemSecret(itemId ?? ''),
    queryFn: () => getItemSecret(itemId as string),
    enabled: enabled && !!itemId,
  });

/** After any change: every item list, the transfers, and the sheets that items feed. */
function useRefresh(campaignId: string) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.items(campaignId) }),
      client.invalidateQueries({ queryKey: ['characters'] }),
    ]);
}

export function useEquipItem(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({
    mutationFn: ({ itemId, on }: { itemId: string; on: boolean }) => equipItem(itemId, on),
    onSuccess: refresh,
  });
}

export function useAttuneItem(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({
    mutationFn: ({ itemId, on }: { itemId: string; on: boolean }) => attuneItem(itemId, on),
    onSuccess: refresh,
  });
}

export function useOfferTransfer(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({
    mutationFn: (o: { itemId: string; toCharacterId: string; quantity: number }) =>
      offerTransfer(o.itemId, o.toCharacterId, o.quantity),
    onSuccess: refresh,
  });
}

export function useResolveTransfer(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({
    mutationFn: ({ transferId, action }: { transferId: string; action: 'accept' | 'decline' | 'cancel' }) =>
      (action === 'accept' ? acceptTransfer : action === 'decline' ? declineTransfer : cancelTransfer)(transferId),
    onSuccess: refresh,
  });
}

export function useCreateItem(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({ mutationFn: (i: NewItem) => createItem(i), onSuccess: refresh });
}

export function useUpdateItemRules(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({
    mutationFn: ({ itemId, rules }: { itemId: string; rules: ItemRules }) => updateItemRules(itemId, rules),
    onSuccess: refresh,
  });
}

export function useSaveItemSecret(itemId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (s: ItemSecret) => saveItemSecret(itemId, s),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.itemSecret(itemId) }),
  });
}

export function useForceMoveItem(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({
    mutationFn: (m: { itemId: string; toType: ItemOwnerType; toId: string | null; quantity: number }) =>
      forceMoveItem(m.itemId, m.toType, m.toId, m.quantity),
    onSuccess: refresh,
  });
}
