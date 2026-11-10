import { describe, expect, it } from 'vitest';
import { DEFAULT_CALENDAR, type CalendarDefinition } from './calendar';
import {
  dmNotes,
  weatherFor,
  weatherForMap,
  weatherSeason,
  zoneAt,
  type DayWeather,
  type WeatherInput,
  type ZoneShape,
} from './weather';
import { CLIMATE_TABLES, CLIMATES, WEATHER_CONDITIONS, WEATHER_SEASONS } from './weatherData';

const input: WeatherInput = { campaignId: 'c1', zoneId: 'z1', day: 100, climate: 'temperate', season: 'spring' };
const days = (over: Partial<WeatherInput>, count: number, from = 1) =>
  Array.from({ length: count }, (_, i) => weatherFor({ ...input, ...over, day: from + i }));
const WET = new Set(['drizzle', 'rain', 'sleet', 'snow', 'hail', 'storm', 'blizzard']);

describe('weatherFor', () => {
  it('gives the same weather for the same inputs, every time', () => {
    const first = weatherFor(input);
    for (let i = 0; i < 1000; i++) expect(weatherFor(input)).toEqual(first);
  });

  it('varies over a season', () => {
    expect(new Set(days({}, 91).map(d => d.condition)).size).toBeGreaterThan(1);
  });

  it('differs between zones and campaigns on the same days', () => {
    const a = days({}, 60).map(d => d.condition);
    expect(days({ zoneId: 'z2' }, 60).map(d => d.condition)).not.toEqual(a);
    expect(days({ campaignId: 'c2' }, 60).map(d => d.condition)).not.toEqual(a);
  });

  it('never snows in the tropics', () => {
    for (const season of WEATHER_SEASONS) {
      expect(days({ climate: 'tropical', season }, 3000).some(d => d.condition === 'snow')).toBe(false);
    }
  });

  it('keeps the three rolls consistent', () => {
    for (const climate of CLIMATES) {
      for (const season of WEATHER_SEASONS) {
        for (const d of days({ climate, season }, 2000)) {
          if (['snow', 'blizzard', 'sleet'].includes(d.condition))
            expect(['freezing', 'cold']).toContain(d.temperature);
          if (d.temperature === 'freezing') expect(['drizzle', 'rain', 'storm']).not.toContain(d.condition);
          if (['storm', 'blizzard', 'dust_wind'].includes(d.condition)) expect(['strong', 'gale']).toContain(d.wind);
        }
      }
    }
  });
});

describe('dynamic weather', () => {
  // the approved tables stay the long-run odds; the reconciling rules move a little between snow and rain
  it.each(CLIMATES.flatMap(c => WEATHER_SEASONS.map(s => [c, s] as const)))(
    '%s in %s keeps the odds of its table, for dry weather',
    (climate, season) => {
      const counts = new Map<string, number>();
      const samples = 300;
      for (let z = 0; z < samples; z++) {
        for (const d of days({ climate, season, zoneId: `z${z}` }, 60)) {
          counts.set(d.condition, (counts.get(d.condition) ?? 0) + 1);
        }
      }
      for (const dry of ['clear', 'partly_cloudy', 'overcast', 'fog'] as const) {
        const share = ((counts.get(dry) ?? 0) / (samples * 60)) * 100;
        expect(share, dry).toBeCloseTo(
          CLIMATE_TABLES[climate][season].condition[WEATHER_CONDITIONS.indexOf(dry)],
          -0.4,
        );
      }
    },
  );

  const series = days({}, 20000);

  it('makes wet days cluster, rather than falling independently', () => {
    const wet = series.map(d => WET.has(d.condition));
    const base = wet.filter(Boolean).length / wet.length;
    let pairs = 0;
    let both = 0;
    for (let i = 1; i < wet.length; i++) {
      if (wet[i - 1]) {
        pairs++;
        if (wet[i]) both++;
      }
    }
    expect(both / pairs).toBeGreaterThan(base * 1.5);
  });

  it('builds up: a rainy day is rarely straight after a clear one', () => {
    const rain = series.flatMap((d, i) => (i > 0 && WET.has(d.condition) ? [series[i - 1].condition] : []));
    const clearBefore = rain.filter(c => c === 'clear').length / rain.length;
    const clearOverall = series.filter(d => d.condition === 'clear').length / series.length;
    expect(clearBefore).toBeLessThan(clearOverall / 1.5);
  });

  it('really does walk from clear through cloud into rain', () => {
    const seen = series.some(
      (d, i) =>
        d.condition === 'clear' &&
        ['partly_cloudy', 'overcast', 'fog'].includes(series[i + 1]?.condition) &&
        ['overcast', 'fog', 'drizzle'].includes(series[i + 2]?.condition) &&
        WET.has(series[i + 3]?.condition ?? ''),
    );
    expect(seen).toBe(true);
  });

  it('says when weather is building or easing, from the days ahead', () => {
    const wetAt = (i: number) => WET.has(series[i].condition);
    series.slice(0, 5000).forEach((d: DayWeather, i) => {
      if (d.trend === 'building') expect(!wetAt(i) && (wetAt(i + 1) || wetAt(i + 2))).toBe(true);
      if (d.trend === 'easing') expect(wetAt(i) && !wetAt(i + 1)).toBe(true);
    });
    expect(series.some(d => d.trend === 'building')).toBe(true);
    expect(series.some(d => d.trend === 'easing')).toBe(true);
  });
});

describe('weatherSeason', () => {
  it('uses four seasons of 91 days with no calendar', () => {
    expect(weatherSeason(null, 1)).toBe('spring');
    expect(weatherSeason(null, 91)).toBe('spring');
    expect(weatherSeason(null, 92)).toBe('summer');
    expect(weatherSeason(null, 364)).toBe('winter');
    expect(weatherSeason(null, 365)).toBe('spring');
  });

  it('reads the calendar season by name', () => {
    expect(weatherSeason(DEFAULT_CALENDAR, 1)).toBe('spring');
    expect(weatherSeason(DEFAULT_CALENDAR, 30 * 9 + 1)).toBe('winter');
  });

  it('maps differently named seasons by their order', () => {
    const custom: CalendarDefinition = {
      ...DEFAULT_CALENDAR,
      seasons: [
        { name: 'Thaw', startMonthIndex: 0, endMonthIndex: 5 },
        { name: 'Blaze', startMonthIndex: 6, endMonthIndex: 11 },
      ],
    };
    expect(weatherSeason(custom, 1)).toBe('spring');
    expect(weatherSeason(custom, 181)).toBe('summer');
  });

  it('falls back on the time of year when no season covers the month', () => {
    expect(weatherSeason({ ...DEFAULT_CALENDAR, seasons: [] }, 30 * 6 + 1)).toBe('autumn');
  });
});

const zone = (id: string, x: number, y: number, radius: number, createdAt = '2026-01-01'): ZoneShape => ({
  id,
  x,
  y,
  radius,
  createdAt,
});

describe('zoneAt', () => {
  it('finds the zone holding a point, edge included', () => {
    expect(zoneAt({ x: 10, y: 0 }, [zone('a', 0, 0, 10)])?.id).toBe('a');
    expect(zoneAt({ x: 11, y: 0 }, [zone('a', 0, 0, 10)])).toBeNull();
  });

  it('prefers the smallest zone where they overlap', () => {
    expect(zoneAt({ x: 1, y: 1 }, [zone('wide', 0, 0, 100), zone('small', 0, 0, 10)])?.id).toBe('small');
  });

  it('breaks a tie towards the zone created later', () => {
    const older = zone('older', 0, 0, 10, '2026-01-01');
    const newer = zone('newer', 0, 0, 10, '2026-02-01');
    expect(zoneAt({ x: 0, y: 0 }, [older, newer])?.id).toBe('newer');
    expect(zoneAt({ x: 0, y: 0 }, [newer, older])?.id).toBe('newer');
  });
});

describe('weatherForMap', () => {
  const world = { id: 'world', parentPinId: null, parentRegionId: null, parentMapId: null };
  const town = { id: 'town', parentPinId: 'pin-town', parentRegionId: null, parentMapId: 'world' };
  const cellar = { id: 'cellar', parentPinId: null, parentRegionId: 'region-cellar', parentMapId: 'town' };
  const maps = { world, town, cellar };
  const desert = zone('desert', 100, 100, 50);
  const forest = zone('forest', 500, 500, 80);
  const zones = { world: [desert, forest] };
  const links = { 'pin-town': { x: 510, y: 490 }, 'region-cellar': { x: 1, y: 1 } };

  it('uses the zone at the position on a map that has zones', () => {
    expect(weatherForMap(world, maps, zones, links, { x: 100, y: 110 })?.id).toBe('desert');
  });

  it('uses the widest zone with no position, or one outside every zone', () => {
    expect(weatherForMap(world, maps, zones, links)?.id).toBe('forest');
    expect(weatherForMap(world, maps, zones, links, { x: 900, y: 900 })?.id).toBe('forest');
  });

  it('gives a town inside a forest the weather of the forest', () => {
    expect(weatherForMap(town, maps, zones, links)?.id).toBe('forest');
  });

  it('climbs more than one level', () => {
    const withTown = { ...links, 'region-cellar': { x: 1, y: 1 } };
    expect(weatherForMap(cellar, maps, zones, withTown)?.id).toBe('forest');
  });

  it('prefers the map own zones over its parent', () => {
    const own = zone('own', 0, 0, 10);
    expect(weatherForMap(town, maps, { ...zones, town: [own] }, links)?.id).toBe('own');
  });

  it('stops at the top with nothing to inherit', () => {
    expect(weatherForMap(town, maps, {}, links)).toBeNull();
  });

  it('survives a loop in the map links', () => {
    const a = { id: 'a', parentPinId: 'p', parentRegionId: null, parentMapId: 'b' };
    const b = { id: 'b', parentPinId: 'q', parentRegionId: null, parentMapId: 'a' };
    expect(weatherForMap(a, { a, b }, {}, { p: { x: 0, y: 0 }, q: { x: 0, y: 0 } })).toBeNull();
  });
});

describe('dmNotes', () => {
  it('suggests rather than rules', () => {
    const notes = dmNotes({ condition: 'storm', temperature: 'cold', wind: 'gale' });
    expect(notes.length).toBeGreaterThan(1);
    for (const note of notes) expect(note).toMatch(/consider/);
  });

  it('has nothing to add on a fine day', () => {
    expect(dmNotes({ condition: 'clear', temperature: 'mild', wind: 'breeze' })).toEqual([]);
  });

  it('warns when clouds are building', () => {
    expect(
      dmNotes({ condition: 'overcast', temperature: 'mild', wind: 'breeze', trend: 'building' }).join(' '),
    ).toMatch(/building/);
  });
});
