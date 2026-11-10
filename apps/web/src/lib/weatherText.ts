// P3-8: how weather is named and drawn, shared by the map, the DM's panel and the player's card.
import type { LucideIcon } from 'lucide-react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  Snowflake,
  Sun,
  Tornado,
} from 'lucide-react';
import type { Climate, WeatherCondition, WeatherTrend } from '@dnd-manager/rules-engine';

export const CONDITION_LABELS: Record<WeatherCondition, string> = {
  clear: 'Clear',
  partly_cloudy: 'Partly cloudy',
  overcast: 'Overcast',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  storm: 'Storm',
  snow: 'Snow',
  blizzard: 'Blizzard',
  sleet: 'Sleet',
  hail: 'Hail',
  dust_wind: 'Dust wind',
};

export const CONDITION_ICONS: Record<WeatherCondition, LucideIcon> = {
  clear: Sun,
  partly_cloudy: CloudSun,
  overcast: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  storm: CloudLightning,
  snow: CloudSnow,
  blizzard: Snowflake,
  sleet: CloudRainWind,
  hail: CloudHail,
  dust_wind: Tornado,
};

export const CLIMATE_LABELS: Record<Climate, string> = {
  arid: 'Arid',
  temperate: 'Temperate',
  boreal: 'Boreal',
  tropical: 'Tropical',
  arctic: 'Arctic',
  coastal: 'Coastal',
  mountain: 'Mountain',
};

export const TREND_TEXT: Record<WeatherTrend, string> = {
  building: 'Clouds are building',
  easing: 'Easing',
  steady: '',
};

export const titled = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** "Rain, cool, strong wind": one line for a list. */
export const weatherLine = (w: { condition: WeatherCondition; temperature: string; wind: string }) =>
  `${CONDITION_LABELS[w.condition]}, ${w.temperature}, ${w.wind === 'calm' ? 'calm' : w.wind === 'breeze' ? 'a breeze' : `${w.wind} wind`}`;
