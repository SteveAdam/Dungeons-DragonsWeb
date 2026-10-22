import type { Effect } from '@dnd-manager/rules-engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addEffect,
  getCharacter,
  getEffectSecrets,
  listCharacters,
  listEffects,
  removeEffect,
} from '../data/characters';
import { previewRoll, type CharacterRollRequest } from '../data/rolls';
import { queryKeys } from './queryKeys';

export const useCharacter = (characterId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.character(characterId ?? ''),
    queryFn: () => getCharacter(characterId as string),
    enabled: !!characterId,
  });

export const useCharacters = (campaignId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.characters(campaignId ?? ''),
    queryFn: () => listCharacters(campaignId as string),
    enabled: !!campaignId,
  });

export const useCharacterEffects = (characterId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.characterEffects(characterId ?? ''),
    queryFn: () => listEffects(characterId as string),
    enabled: !!characterId,
  });

/** DM only: pass enabled=false outside DM mode, so the request is never made. */
export const useEffectSecrets = (characterId: string | undefined, effectIds: string[], enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.effectSecrets(characterId ?? '', effectIds),
    queryFn: () => getEffectSecrets(effectIds),
    enabled: enabled && !!characterId && effectIds.length > 0,
  });

export function useAddEffect(characterId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (effect: Omit<Effect, 'id'>) => addEffect(characterId, effect),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.characterEffects(characterId) }),
  });
}

export function useRemoveEffect(characterId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (effectId: string) => removeEffect(effectId),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.characterEffects(characterId) }),
  });
}

/** The server's bonus, mode and odds for a roll (P2-2). Fetched fresh each time the odds popup opens. */
export const useRollPreview = (request: CharacterRollRequest | null) =>
  useQuery({
    queryKey: queryKeys.rollPreview(request?.characterId ?? '', request ?? {}),
    queryFn: () => previewRoll(request as CharacterRollRequest),
    enabled: !!request,
    retry: false,
  });
