import { describe, expect, it } from 'vitest';
import {
  CLIMATE_TABLES,
  CLIMATES,
  TEMPERATURE_BANDS,
  WEATHER_CONDITIONS,
  WEATHER_SEASONS,
  WIND_LEVELS,
} from './weatherData';

const sum = (row: readonly number[]) => row.reduce((total, n) => total + n, 0);
const rows = CLIMATES.flatMap(climate => WEATHER_SEASONS.map(season => [climate, season] as const));

describe('the climate tables', () => {
  it.each(rows)('%s in %s has one whole percentage per outcome, adding up to 100', (climate, season) => {
    const t = CLIMATE_TABLES[climate][season];
    expect(t.condition).toHaveLength(WEATHER_CONDITIONS.length);
    expect(t.temperature).toHaveLength(TEMPERATURE_BANDS.length);
    expect(t.wind).toHaveLength(WIND_LEVELS.length);
    for (const row of [t.condition, t.temperature, t.wind]) {
      expect(sum(row)).toBe(100);
      expect(row.every(n => Number.isInteger(n) && n >= 0)).toBe(true);
    }
  });

  const chance = (climate: (typeof CLIMATES)[number], season: (typeof WEATHER_SEASONS)[number], condition: string) =>
    CLIMATE_TABLES[climate][season].condition[WEATHER_CONDITIONS.indexOf(condition as never)];

  it('is plausible', () => {
    expect(WEATHER_SEASONS.map(s => chance('tropical', s, 'snow'))).toEqual([0, 0, 0, 0]);
    expect(chance('arctic', 'winter', 'blizzard')).toBeGreaterThan(chance('temperate', 'winter', 'blizzard'));
    expect(chance('arid', 'summer', 'dust_wind')).toBeGreaterThan(chance('temperate', 'summer', 'dust_wind'));
    expect(chance('coastal', 'autumn', 'fog')).toBeGreaterThan(chance('arid', 'autumn', 'fog'));
  });
});
