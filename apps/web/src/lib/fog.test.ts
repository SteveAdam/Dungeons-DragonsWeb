import { describe, expect, it } from 'vitest';
import {
  fogSummary,
  isRevealed,
  lastMarkerIndex,
  oppositeStroke,
  renderFog,
  revealedFraction,
  sameWithinOnePixel,
  simplifyFog,
  simplifyLine,
  summaryCell,
  type FogPoint,
  type FogStroke,
} from './fog';

const reveal = (points: FogPoint[], radius = 10): FogStroke => ({ mode: 'reveal', radius, points });
const hide = (points: FogPoint[], radius = 10): FogStroke => ({ mode: 'hide', radius, points });
const revealAll: FogStroke = { mode: 'reveal_all', radius: 0, points: [] };
const hideAll: FogStroke = { mode: 'hide_all', radius: 0, points: [] };

describe('renderFog', () => {
  it('starts fully hidden', () => {
    const mask = renderFog([], 100, 80);
    expect(revealedFraction(mask)).toBe(0);
    expect(isRevealed(mask, 50, 40)).toBe(false);
  });

  it('reveals a point inside a reveal stroke, and nothing far from it', () => {
    const mask = renderFog([reveal([[20, 20]], 10)], 100, 80);
    expect(isRevealed(mask, 20, 20)).toBe(true);
    expect(isRevealed(mask, 27, 20)).toBe(true);
    expect(isRevealed(mask, 40, 20)).toBe(false);
  });

  it('reveals along the whole line of a stroke, not only at its points', () => {
    const mask = renderFog(
      [
        reveal(
          [
            [10, 40],
            [90, 40],
          ],
          5,
        ),
      ],
      100,
      80,
    );
    expect(isRevealed(mask, 50, 40)).toBe(true);
    expect(isRevealed(mask, 50, 43)).toBe(true);
    expect(isRevealed(mask, 50, 50)).toBe(false);
  });

  it('follows a diagonal line', () => {
    const mask = renderFog(
      [
        reveal(
          [
            [0, 0],
            [80, 80],
          ],
          4,
        ),
      ],
      100,
      100,
    );
    expect(isRevealed(mask, 40, 40)).toBe(true);
    expect(isRevealed(mask, 40, 50)).toBe(false);
  });

  it('a later hide stroke covers what was revealed', () => {
    const mask = renderFog([reveal([[20, 20]], 10), hide([[20, 20]], 5)], 100, 80);
    expect(isRevealed(mask, 20, 20)).toBe(false);
    expect(isRevealed(mask, 27, 20)).toBe(true);
  });

  it('order matters: a reveal after the hide wins', () => {
    const revealedLast = renderFog([hide([[20, 20]], 10), reveal([[20, 20]], 10)], 100, 80);
    const hiddenLast = renderFog([reveal([[20, 20]], 10), hide([[20, 20]], 10)], 100, 80);
    expect(isRevealed(revealedLast, 20, 20)).toBe(true);
    expect(isRevealed(hiddenLast, 20, 20)).toBe(false);
  });

  it('a clear marker resets everything before it', () => {
    expect(revealedFraction(renderFog([reveal([[20, 20]], 10), hideAll], 100, 80))).toBe(0);
    expect(revealedFraction(renderFog([hide([[20, 20]], 10), revealAll], 100, 80))).toBe(1);
    const after = renderFog([reveal([[20, 20]], 10), revealAll, hide([[50, 40]], 5)], 100, 80);
    expect(isRevealed(after, 20, 20)).toBe(true);
    expect(isRevealed(after, 50, 40)).toBe(false);
    expect(isRevealed(after, 80, 70)).toBe(true);
  });

  it('finds the last marker', () => {
    expect(lastMarkerIndex([reveal([[1, 1]]), hideAll, reveal([[1, 1]])])).toBe(1);
    expect(lastMarkerIndex([reveal([[1, 1]])])).toBe(-1);
  });

  it('works at a coarser cell size for a quick look', () => {
    const mask = renderFog([reveal([[100, 100]], 50)], 400, 300, 10);
    expect(mask.cols).toBe(40);
    expect(mask.rows).toBe(30);
    expect(isRevealed(mask, 100, 100)).toBe(true);
    expect(isRevealed(mask, 300, 250)).toBe(false);
    expect(summaryCell(4000, 1000)).toBe(16);
  });

  it('measures the revealed share closely enough for the summary', () => {
    // a band 20 pixels tall across a 100 x 100 map: a fifth of it
    const mask = renderFog(
      [
        reveal(
          [
            [-50, 50],
            [150, 50],
          ],
          10,
        ),
      ],
      100,
      100,
    );
    expect(revealedFraction(mask)).toBeCloseTo(0.2, 1);
    expect(fogSummary(0.35)).toBe('Fog: about 35 percent revealed');
    expect(fogSummary(0)).toBe('Fog: the whole map is hidden');
    expect(fogSummary(1)).toBe('Fog: the whole map is revealed');
  });

  it('draws 500 strokes quickly (the time is reported, not enforced)', () => {
    const strokes: FogStroke[] = [];
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 500; i++) {
      const x = rand() * 2000;
      const y = rand() * 1400;
      const points: FogPoint[] = Array.from({ length: 10 }, (_, k) => [x + k * 15, y + Math.sin(k) * 20]);
      strokes.push(rand() < 0.8 ? reveal(points, 40) : hide(points, 25));
    }
    const runs = [1, 4].map(cell => {
      const t0 = performance.now();
      renderFog(strokes, 2000, 1400, cell);
      return { cell, ms: Math.round((performance.now() - t0) * 10) / 10 };
    });
    console.log(
      `renderFog, 500 strokes on 2000 x 1400: ${runs.map(r => `${r.ms} ms at ${r.cell} px cells`).join(', ')}`,
    );
    expect(runs[1].ms).toBeLessThan(2000);
  });
});

describe('undo', () => {
  it('draws the opposite of a stroke', () => {
    expect(oppositeStroke(reveal([[1, 1]], 5)).mode).toBe('hide');
    expect(oppositeStroke(hide([[1, 1]], 5))).toEqual(reveal([[1, 1]], 5));
  });

  it('undoing a reveal on hidden fog hides it again', () => {
    const stroke = reveal(
      [
        [30, 30],
        [60, 30],
      ],
      8,
    );
    const mask = renderFog([stroke, oppositeStroke(stroke)], 100, 80);
    expect(revealedFraction(mask)).toBe(0);
  });
});

describe('simplifyLine (Douglas-Peucker)', () => {
  it('keeps the ends and drops points that lie on the line', () => {
    const line: FogPoint[] = [
      [0, 0],
      [1, 0.01],
      [2, 0],
      [3, -0.01],
      [4, 0],
    ];
    expect(simplifyLine(line, 0.5)).toEqual([
      [0, 0],
      [4, 0],
    ]);
  });

  it('keeps a corner', () => {
    const line: FogPoint[] = [
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 5],
      [10, 10],
    ];
    expect(simplifyLine(line, 0.5)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
  });

  it('leaves short lines alone', () => {
    expect(simplifyLine([[1, 2]], 1)).toEqual([[1, 2]]);
    expect(
      simplifyLine(
        [
          [1, 2],
          [3, 4],
        ],
        1,
      ),
    ).toHaveLength(2);
  });

  it('copes with a very long stroke', () => {
    const long: FogPoint[] = Array.from({ length: 20000 }, (_, i) => [i, Math.sin(i / 50) * 30]);
    const small = simplifyLine(long, 1);
    expect(small.length).toBeLessThan(long.length / 10);
    expect(small[0]).toEqual([0, 0]);
  });
});

describe('simplifyFog', () => {
  const W = 160;
  const H = 120;
  function history(n: number, seed: number): FogStroke[] {
    const strokes: FogStroke[] = [];
    let s = seed;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 0; i < n; i++) {
      const points: FogPoint[] = [
        [rand() * W, rand() * H],
        [rand() * W, rand() * H],
      ];
      strokes.push(
        rand() < 0.75 ? reveal(points, 3 + Math.round(rand() * 12)) : hide(points, 2 + Math.round(rand() * 8)),
      );
      if (i === Math.floor(n / 3)) strokes.push(revealAll);
      if (i === Math.floor(n / 2)) strokes.push(hideAll);
    }
    return strokes;
  }

  it.each([11, 29, 53])('keeps the revealed area within one pixel (random history %s)', seed => {
    const strokes = history(300, seed);
    const simpler = simplifyFog(strokes, W, H);
    const before = renderFog(strokes, W, H, 1);
    const after = renderFog(simpler, W, H, 1);
    expect(sameWithinOnePixel(before, after)).toBe(true);
    expect(Math.abs(revealedFraction(after) - revealedFraction(before))).toBeLessThan(0.05);
  });

  it('gives a much shorter history', () => {
    const strokes = history(2500, 3);
    const simpler = simplifyFog(strokes, W, H);
    expect(simpler.length).toBeLessThan(strokes.length / 5);
    expect(simpler[0].mode).toBe('hide_all');
    expect(simpler.every(s => s.points.length <= 2000)).toBe(true);
  });

  it('turns an all-revealed or all-hidden fog into one marker', () => {
    expect(simplifyFog([reveal([[1, 1]]), revealAll], W, H)).toEqual([revealAll]);
    expect(simplifyFog([reveal([[1, 1]], 5), hide([[1, 1]], 20)], W, H)).toEqual([hideAll]);
  });

  it('tells two masks apart when they differ by more than a pixel', () => {
    const a = renderFog([reveal([[50, 50]], 20)], W, H, 1);
    const b = renderFog([reveal([[50, 50]], 24)], W, H, 1);
    expect(sameWithinOnePixel(a, b)).toBe(false);
    const c = renderFog([reveal([[50, 50]], 20.5)], W, H, 1);
    expect(sameWithinOnePixel(a, c)).toBe(true);
  });
});
