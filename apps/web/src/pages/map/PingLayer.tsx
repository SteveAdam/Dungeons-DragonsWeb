// P4-4: pings on the canvas. Each ping is a ripple in the sender's colour with their name on a paper label, for three
// seconds. With the Ping tool a click pings; without it, pressing and holding still on the map pings too (on a phone
// this is the natural way). Holding still matters: moving starts a pan instead.
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { LONG_PRESS_MS, LONG_PRESS_SLOP_PX, pingColourValue, type PingView } from '../../lib/pings';
import { clampToImage, toImagePoint, toLatLng, type ImagePoint, type ImageSize } from '../../lib/mapCoordinates';
import styles from './MapCanvas.module.css';

/** The ripple, coloured by a palette token only (never a colour from the network). */
function pingIcon(colour: string): L.DivIcon {
  return L.divIcon({
    className: styles.sealHost,
    html: `<span class="${styles.ping}" style="--ping-color:${pingColourValue(colour)}"><span class="${styles.pingRing}"></span><span class="${styles.pingRing}"></span><span class="${styles.pingDot}"></span></span>`,
    iconSize: [64, 64],
    iconAnchor: [32, 32],
    tooltipAnchor: [0, 18],
  });
}

export function PingMarkers({ pings, size }: { pings: readonly PingView[]; size: ImageSize }) {
  return (
    <>
      {pings.map(p => (
        <Marker
          key={p.key}
          position={toLatLng(p, size)}
          icon={pingIcon(p.colour)}
          interactive={false}
          keyboard={false}
          zIndexOffset={2000}
        >
          <Tooltip direction="bottom" permanent className={styles.label}>
            {p.name}
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}

/**
 * Turns a click (while `clickToPing`) or a long press (while `holdToPing`) into a ping at that spot of the image.
 */
export function PingInput({
  size,
  clickToPing,
  holdToPing,
  onPing,
}: {
  size: ImageSize;
  clickToPing: boolean;
  holdToPing: boolean;
  onPing: (point: ImagePoint) => void;
}) {
  const map = useMap();
  // read through refs, so a re-render while someone is holding (another ping arriving, say) does not cancel the hold
  const latest = useRef(onPing);
  const sizeRef = useRef(size);
  useEffect(() => {
    latest.current = onPing;
    sizeRef.current = size;
  });

  useMapEvents({
    click(event) {
      if (clickToPing) latest.current(clampToImage(toImagePoint(event.latlng, size), size));
    },
  });

  useEffect(() => {
    if (!holdToPing) return;
    const container = map.getContainer();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let start: { x: number; y: number } | null = null;
    const cancel = () => {
      clearTimeout(timer);
      timer = undefined;
      start = null;
    };
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return;
      cancel();
      start = { x: e.clientX, y: e.clientY };
      const latlng = map.mouseEventToLatLng(e);
      timer = setTimeout(() => {
        timer = undefined;
        const current = sizeRef.current;
        latest.current(clampToImage(toImagePoint(latlng, current), current));
      }, LONG_PRESS_MS);
    };
    const move = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > LONG_PRESS_SLOP_PX) cancel();
    };
    // a long press on a touch screen would otherwise open the browser's own menu
    const menu = (e: Event) => e.preventDefault();
    container.addEventListener('pointerdown', down);
    container.addEventListener('pointermove', move);
    container.addEventListener('pointerup', cancel);
    container.addEventListener('pointercancel', cancel);
    container.addEventListener('pointerleave', cancel);
    container.addEventListener('contextmenu', menu);
    map.on('movestart zoomstart', cancel);
    return () => {
      cancel();
      container.removeEventListener('pointerdown', down);
      container.removeEventListener('pointermove', move);
      container.removeEventListener('pointerup', cancel);
      container.removeEventListener('pointercancel', cancel);
      container.removeEventListener('pointerleave', cancel);
      container.removeEventListener('contextmenu', menu);
      map.off('movestart zoomstart', cancel);
    };
  }, [map, holdToPing]);

  return null;
}
