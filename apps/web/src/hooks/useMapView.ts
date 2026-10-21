import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataError } from '../data/errors';
import { createMap, getMap, getMapTrail, listSubMaps, setMapVisible, type CampaignMap } from '../data/maps';
import { getPinNotes, savePinNotes } from '../data/pinSecrets';
import { createPin, deletePin, listPins, updatePin, type Pin, type PinChanges, type PinType } from '../data/pins';
import { mapImageStore } from '../lib/storage';
import { queryKeys } from './queryKeys';

/** includeHidden is true only for a DM with DM mode on; otherwise a hidden map is not even requested. */
export const useMap = (mapId: string | undefined, includeHidden: boolean) =>
  useQuery({
    queryKey: queryKeys.map(mapId ?? '', includeHidden),
    queryFn: () => getMap(mapId as string, { includeHidden }),
    enabled: !!mapId,
  });

/** includeHidden is true only for a DM with DM mode on; otherwise hidden pins are not even requested. */
export const usePins = (mapId: string | undefined, includeHidden: boolean) =>
  useQuery({
    queryKey: queryKeys.pins(mapId ?? '', includeHidden),
    queryFn: () => listPins(mapId as string, { includeHidden }),
    enabled: !!mapId,
  });

/** The maps beneath this map's pins, keyed by pin id. Same hidden-data rule as the pins themselves. */
export const useSubMaps = (mapId: string | undefined, pinIds: string[], includeHidden: boolean) =>
  useQuery({
    queryKey: queryKeys.subMaps(mapId ?? '', includeHidden, pinIds),
    queryFn: () => listSubMaps(pinIds, { includeHidden }),
    enabled: !!mapId && pinIds.length > 0,
  });

/** The maps above this one, for the breadcrumb. */
export const useMapTrail = (map: CampaignMap | undefined, includeHidden: boolean) =>
  useQuery({
    queryKey: queryKeys.mapTrail(map?.id ?? '', includeHidden),
    queryFn: () => getMapTrail(map as CampaignMap, { includeHidden }),
    enabled: !!map?.parentPinId,
  });

/** DM notes: pass enabled=false outside DM mode, so the request is never made. */
export const usePinNotes = (pinId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.pinNotes(pinId ?? ''),
    queryFn: () => getPinNotes(pinId as string),
    enabled: enabled && !!pinId,
  });

/** A signed URL for a map image. The store caches URLs, so this can refetch freely. */
export const useMapImageUrl = (path: string | undefined) =>
  useQuery({
    queryKey: queryKeys.mapImage(path ?? ''),
    queryFn: () => mapImageStore.getUrl(path as string),
    enabled: !!path,
    staleTime: 50 * 60_000,
  });

function useInvalidatePins(mapId: string) {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['maps', mapId, 'pins'] });
}

export function useCreatePin(mapId: string) {
  const invalidate = useInvalidatePins(mapId);
  return useMutation({
    mutationFn: ({ at, type }: { at: { x: number; y: number }; type?: PinType }) => createPin(mapId, at, type),
    onSuccess: invalidate,
  });
}

/**
 * Saves pin changes. The change shows at once (so a dragged pin stays where it was dropped) and is rolled back
 * if the save fails.
 */
export function useUpdatePin(mapId: string) {
  const client = useQueryClient();
  const pinsKey = ['maps', mapId, 'pins'];
  return useMutation({
    mutationFn: ({ pinId, changes }: { pinId: string; changes: PinChanges }) => updatePin(pinId, changes),
    onMutate: async ({ pinId, changes }) => {
      await client.cancelQueries({ queryKey: pinsKey });
      const before = client.getQueriesData<Pin[]>({ queryKey: pinsKey });
      client.setQueriesData<Pin[]>({ queryKey: pinsKey }, pins =>
        pins?.map(p => (p.id === pinId ? { ...p, ...changes } : p)),
      );
      return { before };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.before ?? []) client.setQueryData(key, data);
    },
    onSettled: () => client.invalidateQueries({ queryKey: pinsKey }),
  });
}

export function useDeletePin(mapId: string) {
  const invalidate = useInvalidatePins(mapId);
  return useMutation({ mutationFn: (pinId: string) => deletePin(pinId), onSuccess: invalidate });
}

export function useSavePinNotes() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ pinId, notes }: { pinId: string; notes: string }) => savePinNotes(pinId, notes),
    onSuccess: (notes, { pinId }) => client.setQueryData(queryKeys.pinNotes(pinId), notes),
  });
}

export function useSetMapVisible(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ mapId, visible }: { mapId: string; visible: boolean }) => setMapVisible(mapId, visible),
    onSuccess: (map: CampaignMap) => {
      client.invalidateQueries({ queryKey: ['maps', map.id] });
      client.invalidateQueries({ queryKey: ['campaigns', campaignId, 'maps'] });
    },
  });
}

export interface MapUpload {
  name: string;
  file: File;
  visibleToPlayers: boolean;
  /** Put the new map beneath this pin (a sub-map). */
  parentPinId?: string;
}

/**
 * Uploads the image through the storage module, then creates the map row. If the row cannot be created the
 * image is removed again, so no orphan files pile up in the bucket.
 */
export function useUploadMap(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, file, visibleToPlayers, parentPinId }: MapUpload): Promise<CampaignMap> => {
      if (!name.trim()) throw new DataError('validation', 'Give the map a name.');
      const image = await mapImageStore.upload(campaignId, file);
      try {
        return await createMap(campaignId, {
          name,
          imagePath: image.path,
          width: image.width,
          height: image.height,
          visibleToPlayers,
          parentPinId,
        });
      } catch (error) {
        // best effort: a failed cleanup must not hide the real error
        try {
          await mapImageStore.remove(image.path);
        } catch {
          /* the orphan file stays; it is harmless and only the DM can see it */
        }
        throw error;
      }
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['campaigns', campaignId, 'maps'] });
      client.invalidateQueries({ queryKey: ['maps'] }); // sub-map lists on the parent map
    },
  });
}

export type { Pin };
