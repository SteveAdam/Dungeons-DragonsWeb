import type { Terrain } from '@dnd-manager/rules-engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRegion,
  deleteRegion,
  listCampaignRegions,
  listRegions,
  updateRegion,
  type Region,
  type RegionChanges,
} from '../data/regions';
import { queryKeys } from './queryKeys';

/** The terrain and weather regions of a map. Same hidden-data rule as pins: includeHidden only in DM mode. */
export const useRegions = (mapId: string | undefined, includeHidden: boolean) =>
  useQuery({
    queryKey: queryKeys.regions(mapId ?? '', includeHidden),
    queryFn: () => listRegions(mapId as string, { includeHidden }),
    enabled: !!mapId,
  });

/** Every region of the campaign, read afresh each time something is about to be placed. DM only. */
export const useCampaignRegions = (campaignId: string) =>
  useQuery({
    queryKey: ['campaigns', campaignId, 'all-regions'],
    queryFn: () => listCampaignRegions(campaignId),
  });

const regionsKey = (mapId: string) => ['maps', mapId, 'regions'];

export function useCreateRegion(mapId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ circle, terrain }: { circle: { cx: number; cy: number; radius: number }; terrain?: Terrain }) =>
      createRegion(mapId, circle, terrain),
    onSuccess: () => client.invalidateQueries({ queryKey: regionsKey(mapId) }),
  });
}

/** Saves region changes. Like pins, the change shows at once (a dragged circle stays put) and rolls back on failure. */
export function useUpdateRegion(mapId: string) {
  const client = useQueryClient();
  const key = regionsKey(mapId);
  return useMutation({
    mutationFn: ({ regionId, changes }: { regionId: string; changes: RegionChanges }) =>
      updateRegion(regionId, changes),
    onMutate: async ({ regionId, changes }) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueriesData<Region[]>({ queryKey: key });
      client.setQueriesData<Region[]>({ queryKey: key }, regions =>
        regions?.map(r => (r.id === regionId ? { ...r, ...changes } : r)),
      );
      return { before };
    },
    onError: (_error, _variables, context) => {
      for (const [k, data] of context?.before ?? []) client.setQueryData(k, data);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteRegion(mapId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (regionId: string) => deleteRegion(regionId),
    onSuccess: () => client.invalidateQueries({ queryKey: regionsKey(mapId) }),
  });
}
