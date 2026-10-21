import { describe, expect, it } from 'vitest';
import {
  isTerrain,
  isWeather,
  milesPerDay,
  rollWeather,
  TERRAIN_INFO,
  TERRAINS,
  WEATHER_INFO,
  WEATHERS,
} from './environment';

describe('terrain and weather', () => {
  it('describes every terrain and weather, and every terrain suggests only known weather', () => {
    for (const t of TERRAINS) {
      expect(TERRAIN_INFO[t].label).not.toBe('');
      expect(TERRAIN_INFO[t].typicalWeather.length).toBeGreaterThan(0);
      for (const w of TERRAIN_INFO[t].typicalWeather) expect(isWeather(w)).toBe(true);
    }
    for (const w of WEATHERS) expect(WEATHER_INFO[w].label).not.toBe('');
    // hazards always say what to roll
    for (const w of WEATHERS.filter(w => WEATHER_INFO[w].severity === 'hazard')) {
      expect(WEATHER_INFO[w].effects.length).toBeGreaterThan(0);
    }
  });

  it('halves a day of travel in difficult terrain', () => {
    expect(milesPerDay('grassland')).toBe(24);
    expect(milesPerDay('swamp')).toBe(12);
    expect(milesPerDay('mountains', 'fast')).toBe(15);
    expect(milesPerDay('desert', 'slow')).toBe(18);
  });

  it('rolls weather the terrain usually sees, the most common first', () => {
    expect(rollWeather('desert', 0)).toBe('extreme_heat');
    expect(rollWeather('desert', 0.999)).toBe('strong_wind');
    expect(rollWeather('boreal_forest', 0)).toBe('snow');
    for (let r = 0; r < 1; r += 0.05) expect(TERRAIN_INFO.arctic.typicalWeather).toContain(rollWeather('arctic', r));
    // out-of-range numbers are clamped rather than falling off the list
    expect(rollWeather('urban', 1.5)).toBe('fog');
    expect(rollWeather('urban', -1)).toBe('clear');
  });

  it('recognises only known keys', () => {
    expect(isTerrain('jungle')).toBe(true);
    expect(isTerrain('lava_lamp')).toBe(false);
    expect(isWeather('blizzard')).toBe(true);
    expect(isWeather('frogs')).toBe(false);
  });
});
