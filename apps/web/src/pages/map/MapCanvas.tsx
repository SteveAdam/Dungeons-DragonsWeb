// The Leaflet part of the map view: image overlay, terrain regions, wax-seal pins, click-to-place, drag-to-move
// and drawing regions. Kept apart from the page logic so the page can be tested without a browser layout engine
// (jsdom cannot run Leaflet).
import 'leaflet/dist/leaflet.css';
import { TERRAIN_INFO, WEATHER_INFO, type Weather } from '@dnd-manager/rules-engine';
import L from 'leaflet';
import { Layers } from 'lucide-react';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Circle,
  CircleMarker,
  ImageOverlay,
  MapContainer,
  Marker,
  Polyline,
  SVGOverlay,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { DEFAULT_PIN_COLOR, PIN_COLOR_PATTERN, PIN_SIZE, type Pin } from '../../data/pins';
import { MIN_REGION_RADIUS, type Region, type RegionChanges } from '../../data/regions';
import {
  clampToImage,
  containZoom,
  coverZoom,
  imageBounds,
  toImagePoint,
  toLatLng,
  type ImagePoint,
  type ImageSize,
} from '../../lib/mapCoordinates';
import styles from './MapCanvas.module.css';
import { PIN_TYPE_ICONS, PIN_TYPE_LABELS } from './pinIcons';
import { WEATHER_ICONS } from './regionIcons';

export interface MapCanvasProps {
  imageUrl: string;
  size: ImageSize;
  pins: Pin[];
  selectedPinId: string | null;
  onSelectPin: (pinId: string) => void;
  /** While true, a click on the map places a pin there instead of panning. */
  addMode: boolean;
  onPlace: (point: ImagePoint) => void;
  /** Pins that have a map beneath them: they get a layers badge, and a double-click enters the map. */
  subMapPinIds: ReadonlySet<string>;
  onEnterSubMap: (pinId: string) => void;
  /** DM mode: pins can be dragged to a new place. */
  canMovePins: boolean;
  onMovePin: (pinId: string, point: ImagePoint) => void;
  /** Terrain and weather regions, drawn under the pins. */
  regions: Region[];
  selectedRegionId: string | null;
  onSelectRegion: (regionId: string) => void;
  /** While true, two clicks on the map draw a region: the first sets its centre, the second its edge. */
  drawMode: boolean;
  onDrawRegion: (circle: RegionCircle) => void;
  /** DM mode: a region moves with the marker in its middle and resizes with the handle on its edge. */
  canEditRegions: boolean;
  onChangeRegion: (regionId: string, changes: Pick<RegionChanges, 'cx' | 'cy' | 'radius'>) => void;
  /** Measuring: clicks add points to the route, which is drawn as a line. */
  measuring: boolean;
  measurePoints: readonly ImagePoint[];
  onMeasurePoint: (point: ImagePoint) => void;
  /** A grid square's side in image pixels, or null for no grid. */
  gridCellPx: number | null;
  /** Pan to this point; a new key pans again even to the same point. */
  focus: { x: number; y: number; key: number } | null;
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
const layersMarkup = renderToStaticMarkup(
  createElement(Layers, { size: '100%', strokeWidth: 2.5, 'aria-hidden': true }),
);
const weatherMarkup = Object.fromEntries(
  Object.entries(WEATHER_ICONS).map(([weather, Icon]) => [
    weather,
    renderToStaticMarkup(createElement(Icon, { size: '62%', strokeWidth: 2, 'aria-hidden': true })),
  ]),
) as Record<Weather, string>;

export interface RegionCircle {
  cx: number;
  cy: number;
  radius: number;
}

// Only fixed markup goes into these icons: the region's name is shown by a React tooltip, never as HTML.
function weatherIcon(region: Region, selected: boolean): L.DivIcon {
  const classes = [
    styles.weather,
    region.visibleToPlayers ? '' : styles.sealHidden,
    selected ? styles.sealSelected : '',
  ]
    .filter(Boolean)
    .join(' ');
  return L.divIcon({
    className: styles.sealHost,
    html: `<span class="${classes}">${weatherMarkup[region.weather]}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    tooltipAnchor: [0, 17],
  });
}
const resizeIcon = L.divIcon({
  className: styles.sealHost,
  html: `<span class="${styles.handle}"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/** Where the resize handle sits: on the right edge, or the left one when the right is off the image. */
function edgePoint(region: RegionCircle, size: ImageSize): ImagePoint {
  const right = region.cx + region.radius;
  return { x: right <= size.width ? right : region.cx - region.radius, y: region.cy };
}

function sealIcon(pin: Pin, selected: boolean, hasSubMap: boolean): L.DivIcon {
  // Both values go into an HTML string, so they are re-checked here even though the database enforces them.
  const size = Math.min(Math.max(Math.round(Number(pin.size)) || 32, PIN_SIZE.min), PIN_SIZE.max);
  const color = PIN_COLOR_PATTERN.test(pin.color) ? pin.color : DEFAULT_PIN_COLOR;
  const classes = [styles.seal, pin.visibleToPlayers ? '' : styles.sealHidden, selected ? styles.sealSelected : '']
    .filter(Boolean)
    .join(' ');
  const badge = hasSubMap ? `<span class="${styles.badge}">${layersMarkup}</span>` : '';
  return L.divIcon({
    className: styles.sealHost,
    // the pin's own colour is data chosen by the DM, so it is passed in as a custom property
    html: `<span class="${classes}" style="--seal-color:${color};--seal-size:${size}px">${iconMarkup[pin.type]}${badge}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [0, size / 2],
  });
}

/**
 * Fills the frame with the map ("cover"): full width and full height, no empty bands, the overflow a pan away.
 * Done on load and again whenever the frame changes size (the pin panel opening, a window resize, a phone
 * rotating), unless the user has zoomed or panned themself. Zooming out stops where the whole map is visible
 * ("contain"), and panning stops at the map's edges.
 */
function KeepImageFilled({ width, height }: ImageSize) {
  const map = useMap();
  useEffect(() => {
    // plain numbers as dependencies: a new size object on every render must not reset the view
    const size = { width, height };
    let userMoved = false;
    let fitting = false;
    const box = () => {
      const { x, y } = map.getSize();
      return { width: x, height: y };
    };
    const center = L.latLng(size.height / 2, size.width / 2);
    const fill = () => {
      fitting = true;
      map.invalidateSize({ pan: false });
      map.setMinZoom(containZoom(box(), size));
      map.setView(center, coverZoom(box(), size), { animate: false });
      fitting = false;
    };
    // only real gestures count: Leaflet also pans by itself to a pin that gets focus, and that must not stop refitting
    const onMoveStart = () => {
      if (!fitting) userMoved = true;
    };
    fill();
    map.on('zoomstart dragstart', onMoveStart);
    const observer = new ResizeObserver(() => {
      if (!userMoved) return fill();
      map.invalidateSize();
      map.setMinZoom(containZoom(box(), size));
    });
    observer.observe(map.getContainer());
    return () => {
      observer.disconnect();
      map.off('zoomstart dragstart', onMoveStart);
    };
  }, [map, width, height]);
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

function RegionShape({
  region,
  size,
  selected,
  busy,
  editable,
  onSelect,
  onChange,
}: {
  region: Region;
  size: ImageSize;
  selected: boolean;
  /** Placing a pin or drawing a region: clicks belong to the map, and nothing can be dragged. */
  busy: boolean;
  editable: boolean;
  onSelect: () => void;
  onChange: (changes: Pick<RegionChanges, 'cx' | 'cy' | 'radius'>) => void;
}) {
  const map = useMap();
  const circle = useRef<L.Circle>(null);
  const handle = useRef<L.Marker>(null);
  const centre = toLatLng({ x: region.cx, y: region.cy }, size);
  const name = [
    `${region.name} (${TERRAIN_INFO[region.terrain].label}, ${WEATHER_INFO[region.weather].label.toLowerCase()}`,
    region.visibleToPlayers ? '' : ', hidden from players',
    ')',
  ].join('');
  const className = [
    styles.region,
    styles[`terrain_${region.terrain}`],
    region.visibleToPlayers ? '' : styles.regionHidden,
    selected ? styles.regionSelected : '',
  ]
    .filter(Boolean)
    .join(' ');
  const select = () => {
    if (!busy) onSelect();
  };
  return (
    <>
      <Circle
        // Leaflet sets a path's class only when it is created, so a change of look rebuilds the circle
        key={className}
        ref={circle}
        center={centre}
        radius={region.radius}
        pathOptions={{ className, fillOpacity: 0.55, weight: selected ? 4 : 2 }}
        eventHandlers={{ click: select }}
      />
      <Marker
        key={`${region.id}:${name}`}
        position={centre}
        icon={weatherIcon(region, selected)}
        title={name}
        keyboard
        draggable={editable && !busy}
        eventHandlers={{
          click: select,
          keydown: (event: L.LeafletKeyboardEvent) => {
            const key = event.originalEvent.key;
            if (key === 'Enter' || key === ' ') {
              event.originalEvent.preventDefault();
              onSelect();
            }
          },
          // the circle and its handle follow the marker while it is dragged; the new centre is saved on drop
          drag: (event: L.LeafletEvent) => {
            const at = (event.target as L.Marker).getLatLng();
            circle.current?.setLatLng(at);
            const moved = toImagePoint(at, size);
            handle.current?.setLatLng(
              toLatLng(edgePoint({ cx: moved.x, cy: moved.y, radius: region.radius }, size), size),
            );
          },
          dragend: (event: L.DragEndEvent) => {
            const moved = clampToImage(toImagePoint((event.target as L.Marker).getLatLng(), size), size);
            onChange({ cx: moved.x, cy: moved.y });
          },
        }}
      >
        <Tooltip direction="bottom" permanent className={styles.regionLabel}>
          {region.name}
        </Tooltip>
      </Marker>
      {editable && selected && !busy && (
        <Marker
          ref={handle}
          position={toLatLng(edgePoint(region, size), size)}
          icon={resizeIcon}
          title={`Resize ${region.name}`}
          draggable
          eventHandlers={{
            drag: (event: L.LeafletEvent) => {
              const r = map.distance(circle.current?.getLatLng() ?? centre, (event.target as L.Marker).getLatLng());
              circle.current?.setRadius(Math.max(r, MIN_REGION_RADIUS));
            },
            dragend: () => {
              const r = circle.current?.getRadius();
              if (r) onChange({ radius: Math.round(Math.max(r, MIN_REGION_RADIUS)) });
            },
          }}
        />
      )}
    </>
  );
}

/** Two clicks draw a region: the centre, then a point on the edge. The circle follows the mouse in between. */
function DrawRegion({ size, onDraw }: { size: ImageSize; onDraw: (circle: RegionCircle) => void }) {
  const [centre, setCentre] = useState<L.LatLng | null>(null);
  const [radius, setRadius] = useState(0);
  const map = useMapEvents({
    click(event) {
      if (!centre) {
        setCentre(L.latLng(toLatLng(clampToImage(toImagePoint(event.latlng, size), size), size)));
        return;
      }
      const r = map.distance(centre, event.latlng);
      if (r < MIN_REGION_RADIUS) return; // a second click on the centre is not a region
      const c = toImagePoint(centre, size);
      onDraw({ cx: Math.round(c.x), cy: Math.round(c.y), radius: Math.round(r) });
      setCentre(null);
      setRadius(0);
    },
    mousemove(event) {
      if (centre) setRadius(map.distance(centre, event.latlng));
    },
  });
  if (!centre) return null;
  return (
    <Circle
      center={centre}
      radius={Math.max(radius, 1)}
      interactive={false}
      pathOptions={{ className: styles.drawing, weight: 2, fillOpacity: 0.15 }}
    />
  );
}

/** Square grid lines over the whole image, one square every `cell` image pixels; lines stay 1 px at any zoom. */
function GridOverlay({ size, cell }: { size: ImageSize; cell: number }) {
  const bounds = useMemo(() => imageBounds(size), [size]);
  // one path of real lines (a pattern would clip half of each line at the tile edge); far too many squares to
  // see apart are not drawn at all
  const d = useMemo(() => {
    if (size.width / cell + size.height / cell > 600) return '';
    const parts: string[] = [];
    for (let x = cell; x < size.width; x += cell) parts.push(`M${x} 0V${size.height}`);
    for (let y = cell; y < size.height; y += cell) parts.push(`M0 ${y}H${size.width}`);
    return parts.join('');
  }, [size, cell]);
  return (
    <SVGOverlay
      bounds={bounds}
      interactive={false}
      attributes={{ viewBox: `0 0 ${size.width} ${size.height}`, preserveAspectRatio: 'none', class: styles.grid }}
    >
      <path d={d} fill="none" vectorEffect="non-scaling-stroke" />
    </SVGOverlay>
  );
}

/** While measuring, each click adds a point; the route is drawn as a dashed line with a dot at each point. */
function MeasureLayer({
  active,
  size,
  points,
  onPoint,
}: {
  active: boolean;
  size: ImageSize;
  points: readonly ImagePoint[];
  onPoint: (p: ImagePoint) => void;
}) {
  useMapEvents({
    click(event) {
      if (active) onPoint(clampToImage(toImagePoint(event.latlng, size), size));
    },
  });
  const positions = points.map(p => toLatLng(p, size));
  return (
    <>
      {positions.length > 1 && (
        <Polyline positions={positions} interactive={false} pathOptions={{ className: styles.route, weight: 3 }} />
      )}
      {positions.map((p, i) => (
        <CircleMarker
          key={i}
          center={p}
          radius={5}
          interactive={false}
          pathOptions={{ className: styles.routePoint, weight: 2, fillOpacity: 1 }}
        />
      ))}
    </>
  );
}

/** Pans to a point when asked (finding a pin), keeping the zoom. */
function PanTo({ size, focus }: { size: ImageSize; focus: MapCanvasProps['focus'] }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.panTo(toLatLng(focus, size));
    // the key, not the object, decides: a fresh request pans even to the same point
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, focus?.key]);
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
  subMapPinIds,
  onEnterSubMap,
  canMovePins,
  onMovePin,
  regions,
  selectedRegionId,
  onSelectRegion,
  drawMode,
  onDrawRegion,
  canEditRegions,
  onChangeRegion,
  measuring,
  measurePoints,
  onMeasurePoint,
  gridCellPx,
  focus,
  label,
}: MapCanvasProps) {
  const busy = addMode || drawMode || measuring;
  const bounds = useMemo(() => imageBounds(size), [size]);
  return (
    <MapContainer
      crs={L.CRS.Simple}
      bounds={bounds}
      // panning stops at the map's edges, so no empty space slides into view
      maxBounds={bounds}
      maxBoundsViscosity={1}
      minZoom={-8}
      maxZoom={3}
      zoomSnap={0}
      zoomDelta={0.5}
      attributionControl={false}
      className={busy ? `${styles.map} ${styles.placing}` : styles.map}
      aria-label={label}
    >
      <ImageOverlay url={imageUrl} bounds={bounds} />
      <KeepImageFilled width={size.width} height={size.height} />
      {gridCellPx && <GridOverlay size={size} cell={gridCellPx} />}
      <PlaceOnClick active={addMode} size={size} onPlace={onPlace} />
      <MeasureLayer active={measuring} size={size} points={measurePoints} onPoint={onMeasurePoint} />
      <PanTo size={size} focus={focus} />
      {regions.map(region => (
        <RegionShape
          key={region.id}
          region={region}
          size={size}
          selected={region.id === selectedRegionId}
          busy={busy}
          editable={canEditRegions}
          onSelect={() => onSelectRegion(region.id)}
          onChange={changes => onChangeRegion(region.id, changes)}
        />
      ))}
      {drawMode && <DrawRegion size={size} onDraw={onDrawRegion} />}
      {pins.map(pin => {
        const hasSubMap = subMapPinIds.has(pin.id);
        const name = [
          `${pin.title} (${PIN_TYPE_LABELS[pin.type]}`,
          pin.visibleToPlayers ? '' : ', hidden from players',
          hasSubMap ? ', has a map beneath: double-click to enter' : '',
          ')',
        ].join('');
        return (
          <Marker
            // Leaflet sets the title (the accessible name) only when a marker is created, so a change to what it
            // says rebuilds the marker
            key={`${pin.id}:${name}`}
            position={toLatLng(pin, size)}
            icon={sealIcon(pin, pin.id === selectedPinId, hasSubMap)}
            title={name}
            keyboard
            draggable={canMovePins && !busy}
            eventHandlers={{
              click: () => onSelectPin(pin.id),
              dblclick: () => hasSubMap && onEnterSubMap(pin.id),
              // Leaflet makes markers focusable buttons but does not act on keys: Enter or Space opens the pin.
              keydown: (event: L.LeafletKeyboardEvent) => {
                const key = event.originalEvent.key;
                if (key === 'Enter' || key === ' ') {
                  event.originalEvent.preventDefault();
                  onSelectPin(pin.id);
                }
              },
              dragend: (event: L.DragEndEvent) => {
                const point = clampToImage(toImagePoint((event.target as L.Marker).getLatLng(), size), size);
                onMovePin(pin.id, point);
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
