// Geometry for the map tools: distances at the map's scale, and which zone each part of a measured route
// crosses. Positions are image pixels (x from the left, y from the top), like pins and regions.
import type { JourneyLeg, Terrain } from '@dnd-manager/rules-engine';
import type { MapTools } from '../data/maps';
import type { ImagePoint, ImageSize } from './mapCoordinates';

export const FEET_PER_MILE = 5280;

/** How many of the map's units one image pixel spans; null while the DM has not set a scale. */
export function unitsPerPixel(size: ImageSize, tools: MapTools): number | null {
  return tools.scaleWidth ? tools.scaleWidth / size.width : null;
}

const distancePx = (a: ImagePoint, b: ImagePoint) => Math.hypot(b.x - a.x, b.y - a.y);

/** The length of a path of points, in image pixels. */
export function pathLengthPx(points: readonly ImagePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distancePx(points[i - 1], points[i]);
  return total;
}

/** A grid square's side in image pixels, or null when there is no grid or no scale. */
export function gridCellPx(size: ImageSize, tools: MapTools): number | null {
  const upp = unitsPerPixel(size, tools);
  return upp && tools.gridSize ? tools.gridSize / upp : null;
}

export interface Circle {
  cx: number;
  cy: number;
  radius: number;
  terrain: Terrain;
}

/** The terrain at a point: the smallest zone containing it (a lake drawn inside a forest wins), or null. */
export function terrainAt(point: ImagePoint, zones: readonly Circle[]): Terrain | null {
  let best: Circle | null = null;
  for (const z of zones) {
    if (Math.hypot(point.x - z.cx, point.y - z.cy) <= z.radius && (!best || z.radius < best.radius)) best = z;
  }
  return best?.terrain ?? null;
}

/**
 * Splits a route into legs, one per stretch of the same terrain, in miles. Each segment is sampled every few
 * pixels, so a route that cuts across a zone is split where it enters and leaves it. Only for maps in miles.
 */
export function routeLegs(
  points: readonly ImagePoint[],
  zones: readonly Circle[],
  milesPerPixel: number,
): JourneyLeg[] {
  const legs: JourneyLeg[] = [];
  const add = (terrain: Terrain | null, px: number) => {
    const last = legs[legs.length - 1];
    if (last && last.terrain === terrain) last.miles += px * milesPerPixel;
    else legs.push({ terrain, miles: px * milesPerPixel });
  };
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const length = distancePx(a, b);
    const steps = Math.max(1, Math.ceil(length / 4));
    for (let s = 0; s < steps; s++) {
      // the middle of each small step decides its terrain
      const t = (s + 0.5) / steps;
      add(terrainAt({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, zones), length / steps);
    }
  }
  return legs;
}

/** "42 miles", "1.5 miles", "120 feet". */
export function formatDistance(value: number, unit: 'mi' | 'ft'): string {
  if (unit === 'ft') return `${Math.round(value).toLocaleString('en')} feet`;
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded.toLocaleString('en')} ${rounded === 1 ? 'mile' : 'miles'}`;
}

/** "17 hours", "2.5 days". */
export function formatDuration(hours: number, days: number): string {
  if (hours < 8) return `${Math.round(hours * 10) / 10} ${hours === 1 ? 'hour' : 'hours'}`;
  const d = Math.round(days * 10) / 10;
  return `${d} ${d === 1 ? 'day' : 'days'} (${Math.round(hours)} hours on the move)`;
}
