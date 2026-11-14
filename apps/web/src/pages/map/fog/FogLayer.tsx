// P4-3: the fog over the map. An SVG laid over the image (Leaflet keeps it aligned through zoom and pan) holds a mask:
// white where the fog lies, black where it is revealed, with every stroke painted over the last in order, so a hide
// after a reveal covers it again. The fog is the desk colour: opaque for players, see-through for the DM.
//
// THIS FOG IS COSMETIC: it hides parts of the map on screen, but the map image itself can still be opened.
import type L from 'leaflet';
import { useEffect, useId, useMemo, useRef } from 'react';
import { SVGOverlay, useMap, useMapEvents } from 'react-leaflet';
import { lastMarkerIndex, type FogPoint, type FogStroke } from '../../../lib/fog';
import { clampToImage, imageBounds, toImagePoint, type ImageSize } from '../../../lib/mapCoordinates';
import { strokePath } from './fogPath';
import styles from './Fog.module.css';

export function FogLayer({ size, strokes, dm }: { size: ImageSize; strokes: readonly FogStroke[]; dm: boolean }) {
  const bounds = useMemo(() => imageBounds(size), [size]);
  const maskId = `fog-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const start = lastMarkerIndex(strokes);
  const base = start >= 0 && strokes[start].mode === 'reveal_all' ? 'black' : 'white';
  const shown = strokes.slice(start + 1).filter(s => s.points.length > 0 && s.radius > 0);
  return (
    <SVGOverlay
      bounds={bounds}
      interactive={false}
      attributes={{
        viewBox: `0 0 ${size.width} ${size.height}`,
        preserveAspectRatio: 'none',
        class: styles.layer,
        'aria-hidden': 'true',
      }}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={size.width} height={size.height}>
          <rect x="0" y="0" width={size.width} height={size.height} fill={base} />
          {shown.map((s, i) => (
            <path
              key={i}
              d={strokePath(s.points)}
              fill="none"
              stroke={s.mode === 'reveal' ? 'black' : 'white'}
              strokeWidth={s.radius * 2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </mask>
      </defs>
      <rect
        x="0"
        y="0"
        width={size.width}
        height={size.height}
        className={dm ? styles.fogDm : styles.fogPlayer}
        mask={`url(#${maskId})`}
      />
    </SVGOverlay>
  );
}

/**
 * The DM's brush: press on the map and drag. The map does not pan while it is on. Points closer together than a sixth
 * of the brush are skipped, so a stroke stays small even before it is simplified.
 */
export function BrushLayer({
  size,
  radius,
  onStroke,
}: {
  size: ImageSize;
  radius: number;
  onStroke: (points: FogPoint[], done: boolean) => void;
}) {
  const map = useMap();
  const points = useRef<FogPoint[] | null>(null);
  const latest = useRef(onStroke);
  useEffect(() => {
    latest.current = onStroke;
  });
  useEffect(() => {
    const el = map.getContainer();
    map.dragging.disable();
    el.classList.add(styles.brushing);
    return () => {
      map.dragging.enable();
      el.classList.remove(styles.brushing);
    };
  }, [map]);
  const finish = () => {
    if (points.current) latest.current(points.current, true);
    points.current = null;
  };
  useMapEvents({
    mousedown(e: L.LeafletMouseEvent) {
      const p = clampToImage(toImagePoint(e.latlng, size), size);
      points.current = [[p.x, p.y]];
      latest.current(points.current, false);
    },
    mousemove(e: L.LeafletMouseEvent) {
      const current = points.current;
      if (!current) return;
      const p = clampToImage(toImagePoint(e.latlng, size), size);
      const last = current[current.length - 1];
      if (Math.hypot(p.x - last[0], p.y - last[1]) < Math.max(1, radius / 6)) return;
      points.current = [...current, [p.x, p.y]];
      latest.current(points.current, false);
    },
    mouseup: finish,
    mouseout: finish,
  });
  return null;
}
