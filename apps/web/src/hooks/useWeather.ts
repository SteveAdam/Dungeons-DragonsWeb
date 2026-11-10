import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clearWeatherOverride,
  createWeatherZone,
  deleteWeatherZone,
  getWeatherHere,
  listLinkPoints,
  listWeatherDays,
  listWeatherZones,
  saveWeatherOverride,
  updateWeatherZone,
  type WeatherDayRow,
  type WeatherZone,
  type WeatherZoneChanges,
} from '../data/weather';

const weatherKey = (campaignId: string) => ['campaigns', campaignId, 'weather'];

export const useWeatherZones = (campaignId: string) =>
  useQuery({ queryKey: [...weatherKey(campaignId), 'zones'], queryFn: () => listWeatherZones(campaignId) });

export const useWeatherDays = (campaignId: string, zoneIds: string[]) =>
  useQuery({
    queryKey: [...weatherKey(campaignId), 'days', zoneIds.join(',')],
    queryFn: () => listWeatherDays(zoneIds),
    enabled: zoneIds.length > 0,
  });

export const useLinkPoints = (campaignId: string, enabled: boolean) =>
  useQuery({ queryKey: [...weatherKey(campaignId), 'links'], queryFn: () => listLinkPoints(campaignId), enabled });

/** Today's weather where this character's group is. It changes when the clock does, so it is keyed by the day. */
export const useWeatherHere = (campaignId: string, characterId: string | undefined, day: number) =>
  useQuery({
    queryKey: [...weatherKey(campaignId), 'here', characterId, day],
    queryFn: () => getWeatherHere(campaignId, characterId as string),
    enabled: !!characterId,
  });

function useRefresh(campaignId: string) {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: weatherKey(campaignId) });
}

export function useCreateWeatherZone(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({
    mutationFn: (zone: Parameters<typeof createWeatherZone>[0]) => createWeatherZone(zone),
    onSuccess: refresh,
  });
}

export function useUpdateWeatherZone(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: WeatherZoneChanges }) => updateWeatherZone(id, changes),
    onSuccess: refresh,
  });
}

export function useDeleteWeatherZone(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({ mutationFn: (zone: WeatherZone) => deleteWeatherZone(zone.id), onSuccess: refresh });
}

export function useSaveWeatherOverride(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({
    mutationFn: (row: Omit<WeatherDayRow, 'overridden'>) => saveWeatherOverride(row),
    onSuccess: refresh,
  });
}

export function useClearWeatherOverride(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({
    mutationFn: ({ zoneId, day }: { zoneId: string; day: number }) => clearWeatherOverride(zoneId, day),
    onSuccess: refresh,
  });
}
