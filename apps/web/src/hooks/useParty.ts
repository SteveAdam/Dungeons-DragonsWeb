import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  awardCoins,
  awardXp,
  depositToParty,
  getParty,
  listLedger,
  listWallets,
  splitPartyGold,
  type CoinAward,
  type Coins,
  type XpAward,
} from '../data/party';
import { queryKeys } from './queryKeys';

export const useParty = (campaignId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.party(campaignId ?? ''),
    queryFn: () => getParty(campaignId as string),
    enabled: !!campaignId,
  });

export const useWallets = (campaignId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.wallets(campaignId ?? ''),
    queryFn: () => listWallets(campaignId as string),
    enabled: !!campaignId,
  });

export const useLedger = (campaignId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.ledger(campaignId ?? ''),
    queryFn: () => listLedger(campaignId as string),
    enabled: !!campaignId,
  });

/** After any award, split or deposit: the party, wallets and ledger, the characters' XP, and any open sheet. */
function useRefresh(campaignId: string) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.party(campaignId) }),
      client.invalidateQueries({ queryKey: queryKeys.characters(campaignId) }),
      client.invalidateQueries({ queryKey: ['characters'] }),
    ]);
}

export function useAwardXp(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({ mutationFn: (a: XpAward) => awardXp(a), onSuccess: refresh });
}

export function useAwardCoins(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({ mutationFn: (a: CoinAward) => awardCoins(a), onSuccess: refresh });
}

export function useSplitPartyGold(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({ mutationFn: (partyId: string) => splitPartyGold(partyId), onSuccess: refresh });
}

export function useDepositToParty(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({
    mutationFn: (d: { characterId: string; coins: Partial<Coins>; note: string }) =>
      depositToParty(d.characterId, d.coins, d.note),
    onSuccess: refresh,
  });
}
