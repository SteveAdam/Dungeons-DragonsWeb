import type { FogPoint } from '../../../lib/fog';

/** An SVG path through the points; a single point is a line of no length, which a round cap draws as a dot. */
export function strokePath(points: readonly FogPoint[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  const tail = rest.length > 0 ? rest : [first];
  return `M${first[0]} ${first[1]}${tail.map(p => `L${p[0]} ${p[1]}`).join('')}`;
}
