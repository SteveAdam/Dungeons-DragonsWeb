import { describe, expect, it } from 'vitest';
import {
  effectivePace,
  isTerrain,
  isWeather,
  journeyTime,
  milesPerDay,
  rollWeather,
  SRD_TERRAIN,
  TERRAIN_INFO,
  TERRAINS,
  TRAVEL_PACE,
  travelTerrain,
  WEATHER_INFO,
  WEATHERS,
} from './environment';

describe('terrain and weather data', () => {
  it('describes every terrain and weather, and every terrain suggests only known weather', () => {
    for (const t of TERRAINS) {
      expect(TERRAIN_INFO[t].label).not.toBe('');
      expect(SRD_TERRAIN[TERRAIN_INFO[t].srdTerrain]).toBeDefined();
      for (const w of TERRAIN_INFO[t].typicalWeather) expect(isWeather(w)).toBe(true);
    }
    for (const w of WEATHERS) expect(WEATHER_INFO[w].label).not.toBe('');
    for (const w of WEATHERS.filter(w => WEATHER_INFO[w].severity === 'hazard')) {
      expect(WEATHER_INFO[w].effects.length).toBeGreaterThan(0);
    }
  });

  it('matches the SRD 5.2.1 Travel Pace table', () => {
    expect(TRAVEL_PACE.fast).toMatchObject({ feetPerMinute: 400, milesPerHour: 4, milesPerDay: 30 });
    expect(TRAVEL_PACE.normal).toMatchObject({ feetPerMinute: 300, milesPerHour: 3, milesPerDay: 24 });
    expect(TRAVEL_PACE.slow).toMatchObject({ feetPerMinute: 200, milesPerHour: 2, milesPerDay: 18 });
  });

  it('matches the SRD 5.2.1 Travel Terrain table (maximum pace and DCs)', () => {
    const row = (t: keyof typeof SRD_TERRAIN) => {
      const r = SRD_TERRAIN[t];
      return [r.maxPace, r.foragingDc, r.navigationDc, r.searchDc];
    };
    expect(row('arctic')).toEqual(['fast', 20, 10, 10]);
    expect(row('coastal')).toEqual(['normal', 10, 5, 15]);
    expect(row('desert')).toEqual(['normal', 20, 10, 10]);
    expect(row('forest')).toEqual(['normal', 10, 15, 15]);
    expect(row('grassland')).toEqual(['fast', 15, 5, 15]);
    expect(row('hill')).toEqual(['normal', 15, 10, 15]);
    expect(row('mountain')).toEqual(['slow', 20, 15, 20]);
    expect(row('swamp')).toEqual(['slow', 10, 15, 20]);
    expect(row('underdark')).toEqual(['normal', 20, 10, 20]);
    expect(row('urban')).toEqual(['normal', 20, 15, 15]);
    expect(row('waterborne')).toEqual(['special', 15, 10, 15]);
  });
});

describe('travel', () => {
  it('terrain caps the pace instead of halving the distance (2024 rules)', () => {
    expect(milesPerDay('grassland', 'fast')).toBe(30);
    expect(milesPerDay('temperate_forest', 'fast')).toBe(24); // forest: Normal at most
    expect(milesPerDay('swamp', 'normal')).toBe(18); // swamp: Slow at most
    expect(milesPerDay('mountains', 'slow')).toBe(18);
    expect(milesPerDay('sea')).toBeNull(); // the vessel decides
  });

  it('a good road raises the maximum by one step', () => {
    expect(effectivePace('swamp', 'fast')).toBe('slow');
    expect(effectivePace('swamp', 'fast', true)).toBe('normal');
    expect(effectivePace('desert', 'fast', true)).toBe('fast');
    expect(effectivePace(null, 'fast')).toBe('fast');
    expect(travelTerrain('badlands').label).toBe('Hill');
  });

  it('times a route leg by leg', () => {
    // 24 miles of open land then 18 miles of swamp at a Normal pace: 1 day + 1 day, 8 h + 9 h
    const j = journeyTime(
      [
        { miles: 24, terrain: null },
        { miles: 18, terrain: 'swamp' },
      ],
      'normal',
    );
    expect(j).toMatchObject({ miles: 42, days: 2, hours: 17, slowedBy: ['swamp'], waterborneMiles: 0 });
    const sea = journeyTime([{ miles: 10, terrain: 'sea' }], 'normal');
    expect(sea).toMatchObject({ miles: 10, days: 0, hours: 0, waterborneMiles: 10 });
  });
});

describe('weather', () => {
  it('rolls weather the terrain usually sees, the most common first', () => {
    expect(rollWeather('desert', 0)).toBe('extreme_heat');
    expect(rollWeather('desert', 0.999)).toBe('strong_wind');
    expect(rollWeather('boreal_forest', 0)).toBe('snow');
    for (let r = 0; r < 1; r += 0.05) expect(TERRAIN_INFO.arctic.typicalWeather).toContain(rollWeather('arctic', r));
    expect(rollWeather('urban', 1.5)).toBe('fog');
    expect(rollWeather('urban', -1)).toBe('clear');
  });

  it('states the SRD hazards', () => {
    expect(WEATHER_INFO.extreme_cold.effects[0]).toMatch(/DC 10 Constitution save/);
    expect(WEATHER_INFO.extreme_heat.effects[0]).toMatch(/DC 5, \+1 each further hour/);
    expect(WEATHER_INFO.heavy_rain.effects[0]).toMatch(/disadvantage on all Wisdom \(Perception\) checks/);
    expect(WEATHER_INFO.hail.effects[0]).toMatch(/not an SRD rule/);
  });

  it('recognises only known keys', () => {
    expect(isTerrain('jungle')).toBe(true);
    expect(isTerrain('lava_lamp')).toBe(false);
    expect(isWeather('blizzard')).toBe(true);
    expect(isWeather('frogs')).toBe(false);
  });
});
