// P4-3: fog of war, the pure part. A fog is a list of strokes in the order they were drawn: a brush stroke reveals or
// hides everything within its radius of its line of points; a marker reveals or hides the whole map. Positions and
// radii are image pixels. The fog starts fully hidden.
//
// THIS FOG IS COSMETIC: it hides parts of the map on screen, but the map image itself can still be opened.

export type FogMode = 'reveal' | 'hide' | 'reveal_all' | 'hide_all';
export type FogPoint = readonly [number, number];

export interface FogStroke {
  mode: FogMode;
  radius: number;
  points: readonly FogPoint[];
}

/** Which cells of the map are revealed (1) or hidden (0). A cell is `cell` image pixels square. */
export interface FogMask {
  width: number;
  height: number;
  cell: number;
  cols: number;
  rows: number;
  data: Uint8Array;
}

export const isMarker = (s: Pick<FogStroke, 'mode'>) => s.mode === 'reveal_all' || s.mode === 'hide_all';

/** Where the fog's story starts: the last whole-map marker (everything before it no longer matters), or -1. */
export function lastMarkerIndex(strokes: readonly Pick<FogStroke, 'mode'>[]): number {
  for (let i = strokes.length - 1; i >= 0; i--) if (isMarker(strokes[i])) return i;
  return -1;
}

/** A sensible cell size for a quick look at a map: about 256 cells along its long side. */
export const summaryCell = (width: number, height: number) => Math.max(1, Math.ceil(Math.max(width, height) / 256));

/**
 * Where on the horizontal line y the stroke's band (every point within r of the segment a-b) lies: [lo, hi], or null.
 * The band is convex, so its crossing with a line is one interval: the union of the two end discs and the straight part.
 */
function bandRow(ax: number, ay: number, bx: number, by: number, r: number, y: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  const disc = (cx: number, cy: number) => {
    const dy = y - cy;
    if (Math.abs(dy) > r) return;
    const w = Math.sqrt(r * r - dy * dy);
    lo = Math.min(lo, cx - w);
    hi = Math.max(hi, cx + w);
  };
  disc(ax, ay);
  disc(bx, by);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 > 0) {
    const len = Math.sqrt(len2);
    // along the segment: 0 <= t <= 1
    let tLo = -Infinity;
    let tHi = Infinity;
    if (dx !== 0) {
      const x0 = ax - ((y - ay) * dy) / dx;
      const x1 = ax + (len2 - (y - ay) * dy) / dx;
      tLo = Math.min(x0, x1);
      tHi = Math.max(x0, x1);
    } else {
      const t = ((y - ay) * dy) / len2;
      if (t < 0 || t > 1) tLo = Infinity;
    }
    // close to the line: |(x - ax) * dy - (y - ay) * dx| <= r * len
    let pLo = -Infinity;
    let pHi = Infinity;
    if (dy !== 0) {
      const p0 = ax + ((y - ay) * dx - r * len) / dy;
      const p1 = ax + ((y - ay) * dx + r * len) / dy;
      pLo = Math.min(p0, p1);
      pHi = Math.max(p0, p1);
    } else if (Math.abs(y - ay) > r) {
      pLo = Infinity;
    }
    const sLo = Math.max(tLo, pLo);
    const sHi = Math.min(tHi, pHi);
    if (sLo <= sHi) {
      lo = Math.min(lo, sLo);
      hi = Math.max(hi, sHi);
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

/** Sets every cell whose centre is within the stroke's radius of its line. */
function stamp(mask: FogMask, stroke: FogStroke, value: number) {
  const { cell, cols, rows, data } = mask;
  const r = stroke.radius / cell;
  const pts = stroke.points;
  // a lone point is a segment of no length (a dot); otherwise one segment per pair of neighbouring points
  const segments = Math.max(1, pts.length - 1);
  for (let k = 0; k < segments; k++) {
    const [axp, ayp] = pts[k];
    const [bxp, byp] = pts[Math.min(k + 1, pts.length - 1)];
    const ax = axp / cell;
    const ay = ayp / cell;
    const bx = bxp / cell;
    const by = byp / cell;
    const j0 = Math.max(0, Math.ceil(Math.min(ay, by) - r - 0.5));
    const j1 = Math.min(rows - 1, Math.floor(Math.max(ay, by) + r - 0.5));
    for (let j = j0; j <= j1; j++) {
      const span = bandRow(ax, ay, bx, by, r, j + 0.5);
      if (!span) continue;
      const i0 = Math.max(0, Math.ceil(span[0] - 0.5));
      const i1 = Math.min(cols - 1, Math.floor(span[1] - 0.5));
      if (i0 <= i1) data.fill(value, j * cols + i0, j * cols + i1 + 1);
    }
  }
}

/** The revealed mask of a fog: hidden at the start, then every stroke in order from the last whole-map marker. */
export function renderFog(strokes: readonly FogStroke[], width: number, height: number, cell = 1): FogMask {
  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.ceil(height / cell));
  const mask: FogMask = { width, height, cell, cols, rows, data: new Uint8Array(cols * rows) };
  const start = lastMarkerIndex(strokes);
  if (start >= 0 && strokes[start].mode === 'reveal_all') mask.data.fill(1);
  for (let i = start + 1; i < strokes.length; i++) {
    const s = strokes[i];
    if (s.points.length === 0 || s.radius <= 0) continue;
    stamp(mask, s, s.mode === 'reveal' ? 1 : 0);
  }
  return mask;
}

/** Whether the image pixel (x, y) is revealed in the mask. */
export function isRevealed(mask: FogMask, x: number, y: number): boolean {
  const i = Math.min(mask.cols - 1, Math.max(0, Math.floor(x / mask.cell)));
  const j = Math.min(mask.rows - 1, Math.max(0, Math.floor(y / mask.cell)));
  return mask.data[j * mask.cols + i] === 1;
}

/** The share of the map that is revealed, from 0 to 1. */
export function revealedFraction(mask: FogMask): number {
  let n = 0;
  for (let k = 0; k < mask.data.length; k++) n += mask.data[k];
  return n / mask.data.length;
}

/** What a screen reader is told: "Fog: about 35 percent revealed". */
export function fogSummary(fraction: number): string {
  const percent = Math.round(fraction * 100);
  if (percent <= 0) return 'Fog: the whole map is hidden';
  if (percent >= 100) return 'Fog: the whole map is revealed';
  return `Fog: about ${percent} percent revealed`;
}

/** Undoing a stroke draws its opposite over it: a reveal becomes a hide along the same line, and the other way round. */
export const oppositeStroke = (s: FogStroke): FogStroke => ({
  ...s,
  mode:
    s.mode === 'reveal' ? 'hide' : s.mode === 'hide' ? 'reveal' : s.mode === 'reveal_all' ? 'hide_all' : 'reveal_all',
});

/** Distance from p to the segment a-b. */
function segmentDistance(p: FogPoint, a: FogPoint, b: FogPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/**
 * Douglas-Peucker: drops the points of a line that lie within `epsilon` of the simplified line, keeping the ends, so a
 * stroke is small before it is saved. Iterative, so a long stroke cannot overflow the stack.
 */
export function simplifyLine(points: readonly FogPoint[], epsilon: number): FogPoint[] {
  if (points.length <= 2) return points.map(p => [p[0], p[1]] as FogPoint);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    let worst = -1;
    let far = 0;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(points[i], points[first], points[last]);
      if (d > far) {
        far = d;
        worst = i;
      }
    }
    if (worst >= 0 && far > epsilon) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1).map(p => [p[0], p[1]] as FogPoint);
}

/** Rounds a saved point to a tenth of a pixel: plenty for fog, and it keeps the stored strokes small. */
export const roundPoint = (p: FogPoint): FogPoint => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];

/** A fog with more strokes than this is offered "Simplify fog". */
export const SIMPLIFY_AFTER = 2000;
/** The most points one saved stroke may have (the database checks the same). */
export const MAX_STROKE_POINTS = 2000;

interface Run {
  x0: number;
  x1: number;
}

/**
 * An equivalent, shorter history for a fog: the same revealed area, within one pixel.
 *
 * The algorithm: the fog is rendered at one-pixel detail. Each row of the result is split into runs of revealed pixels.
 * Runs that touch from one row to the next, one to one, are chained into a strand, and each strand becomes one reveal
 * stroke of radius 1 that sweeps its rows like a plough (along a row, down one pixel at a column both rows share, along
 * the next row, and so on), so it never leaves the revealed area by more than a pixel. The new history is "hide
 * everything" followed by those strokes, split where a stroke would pass the point limit. A fog that is all revealed or
 * all hidden becomes a single marker.
 */
export function simplifyFog(strokes: readonly FogStroke[], width: number, height: number): FogStroke[] {
  const mask = renderFog(strokes, width, height, 1);
  const { cols, rows, data } = mask;
  let revealed = 0;
  for (let k = 0; k < data.length; k++) revealed += data[k];
  if (revealed === 0) return [{ mode: 'hide_all', radius: 0, points: [] }];
  if (revealed === data.length) return [{ mode: 'reveal_all', radius: 0, points: [] }];

  interface Strand {
    last: Run;
    points: FogPoint[];
    x: number;
  }
  const done: FogPoint[][] = [];
  let active: Strand[] = [];
  const centre = (x: number, y: number): FogPoint => [x + 0.5, y + 0.5];
  const push = (pts: FogPoint[], p: FogPoint) => {
    const prev = pts[pts.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) pts.push(p);
  };

  for (let y = 0; y < rows; y++) {
    const runs: Run[] = [];
    for (let x = 0; x < cols;) {
      if (data[y * cols + x] === 1) {
        const x0 = x;
        while (x < cols && data[y * cols + x] === 1) x++;
        runs.push({ x0, x1: x - 1 });
      } else x++;
    }
    const overlaps = (a: Run, b: Run) => a.x0 <= b.x1 && b.x0 <= a.x1;
    const next: Strand[] = [];
    const used = new Set<Strand>();
    for (const run of runs) {
      const from = active.filter(s => overlaps(s.last, run));
      const strand = from.length === 1 ? from[0] : null;
      // a strand goes on only when this is the one run it touches and it is the one strand touching this run
      if (strand && !used.has(strand) && runs.filter(r => overlaps(strand.last, r)).length === 1) {
        used.add(strand);
        const shared = Math.min(Math.max(strand.x, Math.max(run.x0, strand.last.x0)), Math.min(run.x1, strand.last.x1));
        push(strand.points, centre(shared, y - 1));
        push(strand.points, centre(shared, y));
        // sweep the new row: to the nearer end first, then across to the far one
        const nearRight = Math.abs(run.x1 - shared) <= Math.abs(shared - run.x0);
        const [first, second] = nearRight ? [run.x1, run.x0] : [run.x0, run.x1];
        push(strand.points, centre(first, y));
        push(strand.points, centre(second, y));
        strand.last = run;
        strand.x = second;
        next.push(strand);
      } else {
        const points: FogPoint[] = [];
        push(points, centre(run.x0, y));
        push(points, centre(run.x1, y));
        next.push({ last: run, points, x: run.x1 });
      }
    }
    for (const s of active) if (!next.includes(s)) done.push(s.points);
    active = next;
  }
  for (const s of active) done.push(s.points);

  const out: FogStroke[] = [{ mode: 'hide_all', radius: 0, points: [] }];
  for (const pts of done) {
    for (let i = 0; i < pts.length; i += MAX_STROKE_POINTS - 1) {
      out.push({ mode: 'reveal', radius: 1, points: pts.slice(i, i + MAX_STROKE_POINTS) });
      if (i + MAX_STROKE_POINTS >= pts.length) break;
    }
  }
  return out;
}

/**
 * Whether two masks of the same size agree within one pixel: every cell where they differ has, in the first mask, a
 * neighbour (the 8 around it) with the second mask's value. Used to check that simplifying keeps the revealed area.
 */
export function sameWithinOnePixel(a: FogMask, b: FogMask): boolean {
  if (a.cols !== b.cols || a.rows !== b.rows) return false;
  for (let j = 0; j < a.rows; j++) {
    for (let i = 0; i < a.cols; i++) {
      const k = j * a.cols + i;
      if (a.data[k] === b.data[k]) continue;
      let near = false;
      for (let dj = -1; dj <= 1 && !near; dj++) {
        for (let di = -1; di <= 1 && !near; di++) {
          const jj = j + dj;
          const ii = i + di;
          if (jj >= 0 && jj < a.rows && ii >= 0 && ii < a.cols && a.data[jj * a.cols + ii] === b.data[k]) near = true;
        }
      }
      if (!near) return false;
    }
  }
  return true;
}

/**
 * A stroke's points made small enough to send or save: simplified (Douglas-Peucker, starting at `epsilon` pixels and
 * doubling until it fits) and rounded to a tenth of a pixel.
 */
export function fitPoints(points: readonly FogPoint[], max: number, epsilon: number): FogPoint[] {
  let e = Math.max(0.1, epsilon);
  let out = simplifyLine(points, e);
  while (out.length > max) {
    e *= 2;
    out = simplifyLine(points, e);
  }
  return out.map(roundPoint);
}
