// P4-2: the pure parts of group tokens on the map: which region a spot is in, how the arrow keys move a token, where a
// token with no saved spot stands, and the next name and colour for a new group. All positions are image pixels.
import type { ImagePoint } from './mapCoordinates';

interface Size {
  width: number;
  height: number;
}

interface Circle {
  id: string;
  cx: number;
  cy: number;
  radius: number;
}

/** The innermost region that holds the point (the smallest circle when several overlap), or null. */
export function regionAt<R extends Circle>(point: ImagePoint, regions: readonly R[]): R | null {
  let best: R | null = null;
  for (const region of regions) {
    const inside = Math.hypot(point.x - region.cx, point.y - region.cy) <= region.radius;
    if (inside && (best === null || region.radius < best.radius)) best = region;
  }
  return best;
}

/** One arrow-key press moves a token this far: a fiftieth of the map's short side, at least one pixel. */
export const tokenStep = (size: Size) => Math.max(1, Math.round(Math.min(size.width, size.height) / 50));

const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Where an arrow key moves a token (five steps with Shift), kept on the map; null for any other key. */
export function nudgePoint(point: ImagePoint, key: string, size: Size, big = false): ImagePoint | null {
  const direction = ARROWS[key];
  if (!direction) return null;
  const step = tokenStep(size) * (big ? 5 : 1);
  return {
    x: clamp(point.x + direction[0] * step, size.width),
    y: clamp(point.y + direction[1] * step, size.height),
  };
}

interface Placed {
  x: number | null;
  y: number | null;
  regionId: string | null;
}

/**
 * Where a group's token is drawn: its saved spot, else the middle of its region, else the middle of the map. Tokens
 * with no spot of their own are spread along a line so they do not hide one another.
 */
export function tokenPoint(group: Placed, regions: readonly Circle[], size: Size, index: number): ImagePoint {
  if (group.x !== null && group.y !== null) return { x: group.x, y: group.y };
  const region = regions.find(r => r.id === group.regionId);
  const spread = index * tokenStep(size) * 2;
  const base = region ? { x: region.cx, y: region.cy } : { x: size.width / 2, y: size.height / 2 };
  return { x: clamp(base.x + spread, size.width), y: clamp(base.y, size.height) };
}

/** Colours for new groups, in turn. Data like pin colours, so they are written here rather than in the tokens file. */
export const GROUP_COLORS = ['#8E2A22', '#3D6A5D', '#8E6B2A', '#4A5D8E', '#6B4A8E', '#2B2118'] as const;

/** "Group 3" and the third colour, for a campaign that has two groups; names already taken are skipped. */
export function nextGroup(existing: readonly { name: string }[]): { name: string; color: string } {
  const taken = new Set(existing.map(g => g.name));
  let n = existing.length + 1;
  while (taken.has(`Group ${n}`)) n++;
  return { name: `Group ${n}`, color: GROUP_COLORS[existing.length % GROUP_COLORS.length] };
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
/** A group's colour goes into HTML for the map marker, so it is checked again here. */
export const safeGroupColor = (color: string): string => (HEX.test(color) ? color : GROUP_COLORS[0]);

/** A word for the bar as well as its colour, so health is never told by colour alone. */
export function healthWord(current: number, max: number): { word: string; tone: 'high' | 'mid' | 'low' } {
  if (current <= 0) return { word: 'Down', tone: 'low' };
  if (current * 4 <= max) return { word: 'Badly wounded', tone: 'low' };
  if (current * 2 <= max) return { word: 'Wounded', tone: 'mid' };
  return { word: 'Healthy', tone: 'high' };
}

export function locationText(group: {
  mapId: string | null;
  mapName: string | null;
  regionName: string | null;
}): string {
  if (!group.mapId) return 'Not on any map';
  const map = group.mapName ?? 'A map you cannot read';
  return group.regionName ? `${map} · ${group.regionName}` : map;
}
