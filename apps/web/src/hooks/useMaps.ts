import { useQuery } from '@tanstack/react-query';
import { listMaps } from '../data/maps';
import { queryKeys } from './queryKeys';

/** includeHidden is true only for a DM with DM mode on. Otherwise hidden maps are not even requested. */
export const useMaps = (campaignId: string | undefined, includeHidden: boolean) =>
  useQuery({
    queryKey: queryKeys.maps(campaignId ?? '', includeHidden),
    queryFn: () => listMaps(campaignId as string, { includeHidden }),
    enabled: !!campaignId,
  });
