// P2-11: spell state, casting, preparing, details and the DM's simple long rest.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDetails, saveDetails, type CharacterDetailsData } from '../data/details';
import {
  breakConcentration,
  castSpell,
  getSpellState,
  setPreparedSpells,
  simpleLongRest,
  simpleLongRestParty,
  type SpellState,
} from '../data/spells';
import { queryKeys } from './queryKeys';

export const useSpellState = (characterId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.spellState(characterId ?? ''),
    queryFn: () => getSpellState(characterId as string),
    enabled: !!characterId,
  });

/** Puts the state a function returned straight into the cache, so the slot dots move at once. */
function useSetState(characterId: string) {
  const client = useQueryClient();
  return (state: SpellState) => client.setQueryData(queryKeys.spellState(characterId), state);
}

export function useCastSpell(characterId: string) {
  const setState = useSetState(characterId);
  return useMutation({
    mutationFn: (c: { spell: string; slotLevel: number | null; ritual: boolean }) =>
      castSpell(characterId, c.spell, c.slotLevel, c.ritual),
    onSuccess: setState,
  });
}

export function useBreakConcentration(characterId: string) {
  const setState = useSetState(characterId);
  return useMutation({ mutationFn: () => breakConcentration(characterId), onSuccess: setState });
}

export function useSetPrepared(characterId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (prepared: string[]) => setPreparedSpells(characterId, prepared),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.character(characterId) }),
  });
}

/** DM only. Afterwards the sheet, its effects and its slots are read again. */
export function useSimpleLongRest(characterId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => simpleLongRest(characterId),
    onSuccess: () => client.invalidateQueries({ queryKey: ['characters', characterId] }),
  });
}

export function useSimpleLongRestParty(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => simpleLongRestParty(campaignId),
    onSuccess: () => client.invalidateQueries({ queryKey: ['characters'] }),
  });
}

export const useDetails = (characterId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.details(characterId ?? ''),
    queryFn: () => getDetails(characterId as string),
    enabled: !!characterId,
    // the Details tab keeps its own copy while it is open and autosaves it
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

export function useSaveDetails(characterId: string, campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: CharacterDetailsData) => saveDetails(characterId, campaignId, data),
    onSuccess: (_r, data) => client.setQueryData(queryKeys.details(characterId), data),
  });
}
