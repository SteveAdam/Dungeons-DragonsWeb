import type { SpawnPinKind } from '@dnd-manager/rules-engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContent,
  deleteContent,
  getContentNotes,
  listRegionContent,
  rollRandomEncounter,
  setDaylightHours,
  updateContent,
  type ContentDraft,
} from '../data/regionContent';
import {
  createSpawnPin,
  deleteSpawnPin,
  listSpawnPins,
  updateSpawnPin,
  type SpawnPin,
  type SpawnPinChanges,
} from '../data/spawnPins';
import { queryKeys } from './queryKeys';

// Everything here is DM only: pass enabled=false outside DM mode, so a player (or a DM previewing as one) never
// makes the request.

/** The content of these regions (one map's regions, usually). */
export const useRegionContent = (regionIds: string[], enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.regionContent(regionIds),
    queryFn: () => listRegionContent(regionIds),
    enabled: enabled && regionIds.length > 0,
  });

export const useContentNotes = (contentId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.contentNotes(contentId ?? ''),
    queryFn: () => getContentNotes(contentId as string),
    enabled: enabled && !!contentId,
  });

/** Creates (no contentId) or updates an entry, with its DM notes. */
export function useSaveContent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      regionId,
      contentId,
      draft,
      dmNotes,
    }: {
      regionId: string;
      contentId?: string;
      draft: ContentDraft;
      dmNotes: string;
    }) => (contentId ? updateContent(contentId, draft, dmNotes) : createContent(regionId, draft, dmNotes)),
    onSuccess: (saved, { dmNotes }) => {
      client.invalidateQueries({ queryKey: ['region-content'] });
      client.setQueryData(queryKeys.contentNotes(saved.id), dmNotes);
    },
  });
}

export function useDeleteContent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (contentId: string) => deleteContent(contentId),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['region-content'] });
      client.invalidateQueries({ queryKey: ['maps'] }); // spawn pins that pointed at it are now unlinked
    },
  });
}

export const useRollEncounter = () => useMutation({ mutationFn: (regionId: string) => rollRandomEncounter(regionId) });

export function useSetDaylight(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ start, end }: { start: number; end: number }) => setDaylightHours(campaignId, start, end),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.campaign(campaignId) }),
  });
}

export const useSpawnPins = (mapId: string, enabled: boolean) =>
  useQuery({ queryKey: queryKeys.spawnPins(mapId), queryFn: () => listSpawnPins(mapId), enabled: enabled && !!mapId });

export function useCreateSpawnPin(mapId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ at, kind }: { at: { x: number; y: number }; kind: SpawnPinKind }) => createSpawnPin(mapId, at, kind),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.spawnPins(mapId) }),
  });
}

/** Like pins, a change shows at once (a dragged marker stays put) and rolls back if saving fails. */
export function useUpdateSpawnPin(mapId: string) {
  const client = useQueryClient();
  const key = queryKeys.spawnPins(mapId);
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: SpawnPinChanges }) => updateSpawnPin(id, changes),
    onMutate: async ({ id, changes }) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<SpawnPin[]>(key);
      client.setQueryData<SpawnPin[]>(key, pins => pins?.map(p => (p.id === id ? { ...p, ...changes } : p)));
      return { before };
    },
    onError: (_e, _v, context) => client.setQueryData(key, context?.before),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteSpawnPin(mapId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSpawnPin(id),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.spawnPins(mapId) }),
  });
}
