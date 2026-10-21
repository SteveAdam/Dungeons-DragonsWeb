// The Leaflet part of the map view: image overlay, wax-seal pins, click-to-place. Kept apart from the page
// logic so the page can be tested without a browser layout engine (jsdom cannot run Leaflet).
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { createElement, useEffect, useMemo } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImageOverlay, MapContainer, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { DEFAULT_PIN_COLOR, PIN_COLOR_PATTERN, PIN_SIZE, type Pin } from '../../data/pins';
import {
  clampToImage,
  imageBounds,
  toImagePoint,
  toLatLng,
  type ImagePoint,
  type ImageSize,
} from '../../lib/mapCoordinates';
import styles from './MapCanvas.module.css';
import { PIN_TYPE_ICONS, PIN_TYPE_LABELS } from './pinIcons';

export interface MapCanvasProps {
  imageUrl: string;
  size: ImageSize;
  pins: Pin[];
  selectedPinId: string | null;
  onSelectPin: (pinId: string) => void;
  /** While true, a click on the map places a pin there instead of panning. */
  addMode: boolean;
  onPlace: (point: ImagePoint) => void;
  /** Accessible name for the map region, e.g. the map's name. */
  label: string;
}

/** The type icon as SVG markup, built once per type (Leaflet markers take HTML strings). */
const iconMarkup = Object.fromEntries(
  Object.entries(PIN_TYPE_ICONS).map(([type, Icon]) => [
    type,
    renderToStaticMarkup(createElement(Icon, { size: '58%', strokeWidth: 2, 'aria-hidden': true })),
  ]),
) as Record<Pin['type'], string>;

function sealIcon(pin: Pin, selected: boolean): L.DivIcon {
  // Both values go into an HTML string, so they are re-checked here even though the database enforces them.
  const size = Math.min(Math.max(Math.round(Number(pin.size)) || 32, PIN_SIZE.min), PIN_SIZE.max);
  const color = PIN_COLOR_PATTERN.test(pin.color) ? pin.color : DEFAULT_PIN_COLOR;
  const classes = [styles.seal, pin.visibleToPlayers ? '' : styles.sealHidden, selected ? styles.sealSelected : '']
    .filter(Boolean)
    .join(' ');
  return L.divIcon({
    className: styles.sealHost,
    // the pin's own colour is data chosen by the DM, so it is passed in as a custom property
    html: `<span class="${classes}" style="--seal-color:${color};--seal-size:${size}px">${iconMarkup[pin.type]}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [0, size / 2],
  });
}

/** Leaflet measures its box once; tell it when the box changes (the pin panel opening, a phone rotating). */
function FollowContainerSize() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function PlaceOnClick({
  active,
  size,
  onPlace,
}: {
  active: boolean;
  size: ImageSize;
  onPlace: (p: ImagePoint) => void;
}) {
  useMapEvents({
    click(event) {
      if (active) onPlace(clampToImage(toImagePoint(event.latlng, size), size));
    },
  });
  return null;
}

export function MapCanvas({
  imageUrl,
  size,
  pins,
  selectedPinId,
  onSelectPin,
  addMode,
  onPlace,
  label,
}: MapCanvasProps) {
  const bounds = useMemo(() => imageBounds(size), [size]);
  return (
    <MapContainer
      crs={L.CRS.Simple}
      bounds={bounds}
      maxBounds={L.latLngBounds(bounds).pad(0.5)}
      minZoom={-8}
      maxZoom={3}
      zoomSnap={0.25}
      attributionControl={false}
      className={addMode ? `${styles.map} ${styles.placing}` : styles.map}
      aria-label={label}
    >
      <ImageOverlay url={imageUrl} bounds={bounds} />
      <FollowContainerSize />
      <PlaceOnClick active={addMode} size={size} onPlace={onPlace} />
      {pins.map(pin => {
        const name = `${pin.title} (${PIN_TYPE_LABELS[pin.type]}${pin.visibleToPlayers ? '' : ', hidden from players'})`;
        return (
          <Marker
            key={pin.id}
            position={toLatLng(pin, size)}
            icon={sealIcon(pin, pin.id === selectedPinId)}
            title={name}
            keyboard
            eventHandlers={{
              click: () => onSelectPin(pin.id),
              // Leaflet makes markers focusable buttons but does not act on keys: Enter or Space opens the pin.
              keydown: (event: L.LeafletKeyboardEvent) => {
                const key = event.originalEvent.key;
                if (key === 'Enter' || key === ' ') {
                  event.originalEvent.preventDefault();
                  onSelectPin(pin.id);
                }
              },
            }}
          >
            <Tooltip direction="bottom" permanent className={styles.label}>
              {pin.title}
            </Tooltip>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
