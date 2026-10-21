import { describe, expect, it } from 'vitest';
import type { MapTools } from '../data/maps';
import {
  formatDistance,
  formatDuration,
  gridCellPx,
  pathLengthPx,
  routeLegs,
  terrainAt,
  unitsPerPixel,
} from './mapGeometry';

const size = { width: 2000, height: 1000 };
const tools = (over: Partial<MapTools> = {}): MapTools => ({
  scaleWidth: 400,
  scaleUnit: 'mi',
  northDegrees: 0,
  gridSize: null,
  ...over,
});

describe('scale', () => {
  it('turns pixels into the map unit, and nothing without a scale', () => {
    expect(unitsPerPixel(size, tools())).toBe(0.2);
    expect(unitsPerPixel(size, tools({ scaleWidth: null }))).toBeNull();
    expect(
      pathLengthPx([
        { x: 0, y: 0 },
        { x: 300, y: 400 },
        { x: 300, y: 500 },
      ]),
    ).toBe(600);
  });

  it('sizes grid squares in pixels', () => {
    // a 100-foot-wide battle map 2000 px across: a 5-foot square is 100 px
    expect(gridCellPx(size, tools({ scaleWidth: 100, scaleUnit: 'ft', gridSize: 5 }))).toBe(100);
    expect(gridCellPx(size, tools({ gridSize: null }))).toBeNull();
  });
});

describe('route legs', () => {
  const forest = { cx: 1000, cy: 500, radius: 200, terrain: 'temperate_forest' as const };
  const lake = { cx: 1000, cy: 500, radius: 50, terrain: 'sea' as const };

  it('picks the smallest zone at a point', () => {
    expect(terrainAt({ x: 1000, y: 500 }, [forest, lake])).toBe('sea');
    expect(terrainAt({ x: 1150, y: 500 }, [forest, lake])).toBe('temperate_forest');
    expect(terrainAt({ x: 10, y: 10 }, [forest])).toBeNull();
  });

  it('splits a route where it enters and leaves a zone', () => {
    // 2000 px straight through the forest's middle: 800 px open, 400 px forest, 800 px open
    const legs = routeLegs(
      [
        { x: 0, y: 500 },
        { x: 2000, y: 500 },
      ],
      [forest],
      0.2,
    );
    expect(legs.map(l => l.terrain)).toEqual([null, 'temperate_forest', null]);
    expect(legs[1].miles).toBeCloseTo(80, 0);
    expect(legs.reduce((s, l) => s + l.miles, 0)).toBeCloseTo(400, 6);
  });
});

describe('formatting', () => {
  it('reads naturally', () => {
    expect(formatDistance(42.3, 'mi')).toBe('42 miles');
    expect(formatDistance(1.04, 'mi')).toBe('1 mile');
    expect(formatDistance(2.46, 'mi')).toBe('2.5 miles');
    expect(formatDistance(1234.4, 'ft')).toBe('1,234 feet');
    expect(formatDuration(3, 0.1)).toBe('3 hours');
    expect(formatDuration(17, 2)).toBe('2 days (17 hours on the move)');
  });
});
