// P3-8: weather zones, fixed days, and today's weather for a character's group (0025_weather.sql). Players read only
// what is on maps they can see; where a group is, and what it inherits, is worked out on the server.
import {
  absoluteDayFromSeconds,
  weatherFor,
  weatherSeason,
  type CalendarDefinition,
  type Climate,
  type DayWeather,
  type Point,
  type TemperatureBand,
  type WeatherCondition,
  type WindLevel,
} from '@dnd-manager/rules-engine';
import { supabase } from '../lib/supabase';
import { DataError, toDataError } from './errors';
import { functionError } from './rolls';

export interface WeatherZone extends Point {
  id: string;
  campaignId: string;
  mapId: string;
  name: string;
  radius: number;
  climate: Climate;
  color: string;
  showBorder: boolean;
  createdAt: string;
}

export type WeatherZoneChanges = Partial<
  Pick<WeatherZone, 'name' | 'x' | 'y' | 'radius' | 'climate' | 'color' | 'showBorder'>
>;

/** A day that has been fixed: a DM's override, or what players were shown. */
export interface WeatherDayRow {
  zoneId: string;
  day: number;
  condition: WeatherCondition;
  temperature: TemperatureBand;
  wind: WindLevel;
  overridden: boolean;
  note: string;
}

/** A day's weather as shown: what was fixed, or else what the zone's climate gives. */
export interface ShownWeather extends DayWeather {
  overridden: boolean;
  note: string;
}

const ZONE_COLUMNS =
  'id, campaign_id, map_id, name, center_x, center_y, radius, climate, color, show_border, created_at';

interface ZoneRow {
  id: string;
  campaign_id: string;
  map_id: string;
  name: string;
  center_x: number;
  center_y: number;
  radius: number;
  climate: string;
  color: string;
  show_border: boolean;
  created_at: string;
}

const toZone = (r: ZoneRow): WeatherZone => ({
  id: r.id,
  campaignId: r.campaign_id,
  mapId: r.map_id,
  name: r.name,
  x: r.center_x,
  y: r.center_y,
  radius: r.radius,
  climate: r.climate as Climate,
  color: r.color,
  showBorder: r.show_border,
  createdAt: r.created_at,
});

/** The zones the viewer may read: all of them for a DM, those on visible maps for a player. */
export async function listWeatherZones(campaignId: string): Promise<WeatherZone[]> {
  const { data, error } = await supabase
    .from('weather_zones')
    .select(ZONE_COLUMNS)
    .eq('campaign_id', campaignId)
    .order('created_at');
  if (error) throw toDataError(error);
  return ((data ?? []) as ZoneRow[]).map(toZone);
}

/** DM only. */
export async function createWeatherZone(
  zone: Pick<WeatherZone, 'campaignId' | 'mapId' | 'name' | 'x' | 'y' | 'radius' | 'climate' | 'color'>,
): Promise<WeatherZone> {
  const name = zone.name.trim();
  if (name.length < 1 || name.length > 120)
    throw new DataError('validation', 'Give the zone a name of 1 to 120 characters.');
  const { data, error } = await supabase
    .from('weather_zones')
    .insert({
      campaign_id: zone.campaignId,
      map_id: zone.mapId,
      name,
      center_x: zone.x,
      center_y: zone.y,
      radius: zone.radius,
      climate: zone.climate,
      color: zone.color,
    })
    .select(ZONE_COLUMNS)
    .single();
  if (error) throw toDataError(error);
  return toZone(data as ZoneRow);
}

/** DM only. */
export async function updateWeatherZone(id: string, changes: WeatherZoneChanges): Promise<void> {
  const { error } = await supabase
    .from('weather_zones')
    .update({
      ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
      ...(changes.x !== undefined ? { center_x: changes.x } : {}),
      ...(changes.y !== undefined ? { center_y: changes.y } : {}),
      ...(changes.radius !== undefined ? { radius: changes.radius } : {}),
      ...(changes.climate !== undefined ? { climate: changes.climate } : {}),
      ...(changes.color !== undefined ? { color: changes.color } : {}),
      ...(changes.showBorder !== undefined ? { show_border: changes.showBorder } : {}),
    })
    .eq('id', id);
  if (error) throw toDataError(error);
}

/** DM only. */
export async function deleteWeatherZone(id: string): Promise<void> {
  const { error } = await supabase.from('weather_zones').delete().eq('id', id);
  if (error) throw toDataError(error);
}

interface DayRow {
  zone_id: string;
  day: number;
  condition: string;
  temperature: string;
  wind: string;
  overridden: boolean;
  note: string;
}

const toDay = (r: DayRow): WeatherDayRow => ({
  zoneId: r.zone_id,
  day: r.day,
  condition: r.condition as WeatherCondition,
  temperature: r.temperature as TemperatureBand,
  wind: r.wind as WindLevel,
  overridden: r.overridden,
  note: r.note,
});

/** The fixed days of these zones, newest first. */
export async function listWeatherDays(zoneIds: string[]): Promise<WeatherDayRow[]> {
  if (zoneIds.length === 0) return [];
  const { data, error } = await supabase
    .from('weather_days')
    .select('zone_id, day, condition, temperature, wind, overridden, note')
    .in('zone_id', zoneIds)
    .order('day', { ascending: false });
  if (error) throw toDataError(error);
  return ((data ?? []) as DayRow[]).map(toDay);
}

/** DM only: fixes a day's weather. */
export async function saveWeatherOverride(row: Omit<WeatherDayRow, 'overridden'>): Promise<void> {
  const { error } = await supabase.from('weather_days').upsert({
    zone_id: row.zoneId,
    day: row.day,
    condition: row.condition,
    temperature: row.temperature,
    wind: row.wind,
    note: row.note.trim(),
    overridden: true,
  });
  if (error) throw toDataError(error);
}

/** DM only: gives a day back to the climate. */
export async function clearWeatherOverride(zoneId: string, day: number): Promise<void> {
  const { error } = await supabase.from('weather_days').delete().eq('zone_id', zoneId).eq('day', day);
  if (error) throw toDataError(error);
}

/** The positions of every pin and region, for working out what a detail map inherits. DM only. */
export async function listLinkPoints(campaignId: string): Promise<Record<string, Point & { mapId: string }>> {
  const [pins, regions] = await Promise.all([
    supabase
      .from('pins')
      .select('id, x, y, map_id, maps!pins_map_id_fkey!inner(campaign_id)')
      .eq('maps.campaign_id', campaignId),
    supabase
      .from('regions')
      .select('id, cx, cy, map_id, maps!regions_map_id_fkey!inner(campaign_id)')
      .eq('maps.campaign_id', campaignId),
  ]);
  if (pins.error) throw toDataError(pins.error);
  if (regions.error) throw toDataError(regions.error);
  return Object.fromEntries([
    ...(pins.data ?? []).map(p => [p.id, { x: p.x, y: p.y, mapId: p.map_id }] as const),
    ...(regions.data ?? []).map(r => [r.id, { x: r.cx, y: r.cy, mapId: r.map_id }] as const),
  ]);
}

/** A zone's weather on a day: what was fixed, or else what its climate and the season give. */
export function weatherOfDay(
  zone: WeatherZone,
  day: number,
  calendar: CalendarDefinition | null,
  rows: readonly WeatherDayRow[],
): ShownWeather {
  const generated = weatherFor({
    campaignId: zone.campaignId,
    zoneId: zone.id,
    day,
    climate: zone.climate,
    season: weatherSeason(calendar, day),
  });
  const row = rows.find(r => r.zoneId === zone.id && r.day === day);
  if (!row) return { ...generated, overridden: false, note: '' };
  return {
    condition: row.condition,
    temperature: row.temperature,
    wind: row.wind,
    trend: 'steady',
    overridden: row.overridden,
    note: row.note,
  };
}

export const todayOf = (gameSeconds: number) => absoluteDayFromSeconds(gameSeconds);

export interface HereWeather extends ShownWeather {
  zoneId: string;
  day: number;
}

/** Today's weather where a character's group is, or null when it is nowhere with weather. Also records it as seen. */
export async function getWeatherHere(campaignId: string, characterId: string): Promise<HereWeather | null> {
  const { data, error } = await supabase.functions.invoke('roll', {
    body: { action: 'weather-here', campaignId, characterId },
  });
  if (error) throw await functionError(error);
  return (data as { weather: HereWeather | null }).weather;
}
