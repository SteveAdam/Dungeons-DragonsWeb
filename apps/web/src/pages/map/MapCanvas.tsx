// The Leaflet part of the map view: image overlay, terrain regions, wax-seal pins, click-to-place, drag-to-move
// and drawing regions. Kept apart from the page logic so the page can be tested without a browser layout engine
// (jsdom cannot run Leaflet).
import 'leaflet/dist/leaflet.css';
import { TERRAIN_INFO, WEATHER_INFO, type Weather, type WeatherCondition } from '@dnd-manager/rules-engine';
import L from 'leaflet';
import { Layers, Shield } from 'lucide-react';
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
import type { SpawnPin } from '../../data/spawnPins';
import { entranceKey } from '../../data/groupTokens';
import { nudgePoint, safeGroupColor } from '../../lib/groupTokens';
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
import { CONDITION_ICONS, CONDITION_LABELS } from '../../lib/weatherText';
import { SPAWN_PIN_ICONS, SPAWN_PIN_LABELS } from './spawnIcons';

/** A party group's token as the canvas draws it (P4-2). */
export interface GroupTokenView {
  id: string;
  name: string;
  color: string;
  /** How many characters are in the group. */
  count: number;
  x: number;
  y: number;
}

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
  /** Regions that have a map beneath them, the same way. */
  subMapRegionIds: ReadonlySet<string>;
  onEnterRegionMap: (regionId: string) => void;
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
  /** DM mode only (P3-2): spawn pins, drawn as dashed markers. Pass none outside DM mode. */
  spawnPins: SpawnPin[];
  selectedSpawnPinId: string | null;
  onSelectSpawnPin: (id: string) => void;
  onMoveSpawnPin: (id: string, point: ImagePoint) => void;
  /** While true, a click on the map places a spawn pin there. */
  spawnMode: boolean;
  onPlaceSpawnPin: (point: ImagePoint) => void;
  /** P3-8: weather zones. A DM sees and edits the circles; players see the icon, and the circle only if it is shown. */
  weatherZones: CanvasWeatherZone[];
  canEditZones: boolean;
  /** While true, two clicks on the map draw a weather zone: the first sets its centre, the second its edge. */
  zoneDrawMode: boolean;
  onDrawZone: (circle: RegionCircle) => void;
  onChangeZone: (zoneId: string, changes: { x?: number; y?: number; radius?: number }) => void;
  onSelectZone: () => void;
  /** P4-2: the group tokens on this map, and who may move them (the DM, at the table). */
  groupTokens?: GroupTokenView[];
  selectedGroupId?: string | null;
  onSelectGroup?: (groupId: string) => void;
  canMoveGroups?: boolean;
  /** `final` is true when the token was dropped (save now), false for an arrow-key step (more may follow). */
  onMoveGroup?: (groupId: string, point: ImagePoint, final: boolean) => void;
  /** P4-2: how many characters are beneath each pin or region that has a map of its own (keys from entranceKey). */
  entranceCounts?: ReadonlyMap<string, number>;
}

export interface CanvasWeatherZone {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  showBorder: boolean;
  condition: WeatherCondition;
}

/** The spawn pin icons as SVG markup, built once per kind. */
const spawnMarkup = Object.fromEntries(
  Object.entries(SPAWN_PIN_ICONS).map(([kind, Icon]) => [
    kind,
    renderToStaticMarkup(createElement(Icon, { size: '60%', strokeWidth: 2, 'aria-hidden': true })),
  ]),
) as Record<SpawnPin['kind'], string>;

/** A spawn pin: a dashed paper token with the kind's icon. Never on a player's map. */
function spawnIcon(pin: SpawnPin, selected: boolean): L.DivIcon {
  const classes = [styles.spawn, selected ? styles.sealSelected : ''].filter(Boolean).join(' ');
  return L.divIcon({
    className: styles.sealHost,
    html: `<span class="${classes}">${spawnMarkup[pin.kind] ?? ''}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    tooltipAnchor: [0, 14],
  });
}

/** The type icon as SVG markup, built once per type (Leaflet markers take HTML strings). */
const iconMarkup = Object.fromEntries(
  Object.entries(PIN_TYPE_ICONS).map(([type, Icon]) => [
    type,
    renderToStaticMarkup(createElement(Icon, { size: '58%', strokeWidth: 2, 'aria-hidden': true })),
  ]),
) as Record<Pin['type'], string>;
/** The shield of a group token, filled with the group's colour by the stylesheet. */
const shieldMarkup = renderToStaticMarkup(createElement(Shield, { size: '100%', strokeWidth: 2, 'aria-hidden': true }));

/** A group token: a shield in the group's colour with the number of characters on it. */
function groupIcon(token: GroupTokenView, selected: boolean): L.DivIcon {
  // the colour and the count go into an HTML string, so both are re-checked here
  const color = safeGroupColor(token.color);
  const count = Math.max(0, Math.round(Number(token.count)) || 0);
  return L.divIcon({
    className: styles.sealHost,
    html: `<span class="${[styles.token, selected ? styles.tokenSelected : ''].filter(Boolean).join(' ')}" style="--token-color:${color}">${shieldMarkup}<span class="${styles.tokenCount}">${count}</span></span>`,
    iconSize: [38, 44],
    iconAnchor: [19, 40],
    tooltipAnchor: [0, 4],
  });
}

const insideBadge = (inside: number) =>
  inside > 0 ? `<span class="${styles.inside}">${Math.round(inside)} inside</span>` : '';

const layersMarkup = renderToStaticMarkup(
  createElement(Layers, { size: '100%', strokeWidth: 2.5, 'aria-hidden': true }),
);
const weatherMarkup = Object.fromEntries(
  Object.entries(WEATHER_ICONS).map(([weather, Icon]) => [
    weather,
    renderToStaticMarkup(createElement(Icon, { size: '62%', strokeWidth: 2, 'aria-hidden': true })),
  ]),
) as Record<Weather, string>;

const conditionMarkup = Object.fromEntries(
  Object.entries(CONDITION_ICONS).map(([condition, Icon]) => [
    condition,
    renderToStaticMarkup(createElement(Icon, { size: '62%', strokeWidth: 2, 'aria-hidden': true })),
  ]),
) as Record<WeatherCondition, string>;

function zoneIcon(condition: WeatherCondition): L.DivIcon {
  return L.divIcon({
    className: styles.sealHost,
    html: `<span class="${styles.weather}">${conditionMarkup[condition]}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    tooltipAnchor: [0, 17],
  });
}

export interface RegionCircle {
  cx: number;
  cy: number;
  radius: number;
}

// Only fixed markup goes into these icons: the region's name is shown by a React tooltip, never as HTML.
function weatherIcon(region: Region, selected: boolean, hasSubMap: boolean, inside: number): L.DivIcon {
  const classes = [
    styles.weather,
    region.visibleToPlayers ? '' : styles.sealHidden,
    selected ? styles.sealSelected : '',
  ]
    .filter(Boolean)
    .join(' ');
  return L.divIcon({
    className: styles.sealHost,
    html: `<span class="${classes}">${weatherMarkup[region.weather]}${hasSubMap ? `<span class="${styles.badge}">${layersMarkup}</span>` : ''}${insideBadge(inside)}</span>`,
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

function sealIcon(pin: Pin, selected: boolean, hasSubMap: boolean, inside: number): L.DivIcon {
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
    html: `<span class="${classes}" style="--seal-color:${color};--seal-size:${size}px">${iconMarkup[pin.type]}${badge}${insideBadge(inside)}</span>`,
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
  hasSubMap,
  inside,
  onSelect,
  onEnter,
  onChange,
}: {
  region: Region;
  size: ImageSize;
  selected: boolean;
  /** Placing a pin or drawing a region: clicks belong to the map, and nothing can be dragged. */
  busy: boolean;
  editable: boolean;
  /** The region has a detail map beneath it: a layers badge, and a double-click enters the map. */
  hasSubMap: boolean;
  /** How many characters are beneath it (P4-2). */
  inside: number;
  onSelect: () => void;
  onEnter: () => void;
  onChange: (changes: Pick<RegionChanges, 'cx' | 'cy' | 'radius'>) => void;
}) {
  const map = useMap();
  const circle = useRef<L.Circle>(null);
  const handle = useRef<L.Marker>(null);
  const centre = toLatLng({ x: region.cx, y: region.cy }, size);
  const name = [
    `${region.name} (${TERRAIN_INFO[region.terrain].label}, ${WEATHER_INFO[region.weather].label.toLowerCase()}`,
    region.visibleToPlayers ? '' : ', hidden from players',
    hasSubMap ? ', has a map beneath: double-click to enter' : '',
    inside > 0 ? `, ${inside} inside` : '',
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
  const enter = () => {
    if (!busy && hasSubMap) onEnter();
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
        eventHandlers={{ click: select, dblclick: enter }}
      />
      <Marker
        key={`${region.id}:${name}`}
        position={centre}
        icon={weatherIcon(region, selected, hasSubMap, inside)}
        title={name}
        keyboard
        draggable={editable && !busy}
        eventHandlers={{
          click: select,
          dblclick: enter,
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
function WeatherZoneShape({
  zone,
  size,
  editable,
  busy,
  onSelect,
  onChange,
}: {
  zone: CanvasWeatherZone;
  size: ImageSize;
  editable: boolean;
  busy: boolean;
  onSelect: () => void;
  onChange: (changes: { x?: number; y?: number; radius?: number }) => void;
}) {
  const map = useMap();
  const circle = useRef<L.Circle>(null);
  const handle = useRef<L.Marker>(null);
  const centre = toLatLng(zone, size);
  const label = `${zone.name}: ${CONDITION_LABELS[zone.condition]}`;
  const circleShown = editable || zone.showBorder;
  const color = PIN_COLOR_PATTERN.test(zone.color) ? zone.color : DEFAULT_PIN_COLOR;
  const shape = { cx: zone.x, cy: zone.y, radius: zone.radius };
  return (
    <>
      {circleShown && (
        <Circle
          ref={circle}
          center={centre}
          radius={zone.radius}
          interactive={false}
          pathOptions={{ color, fillColor: color, fillOpacity: 0.14, weight: 2, dashArray: '6 6' }}
        />
      )}
      <Marker
        key={`${zone.id}:${label}`}
        position={centre}
        icon={zoneIcon(zone.condition)}
        title={label}
        draggable={editable && !busy}
        eventHandlers={{
          click: () => {
            if (!busy && editable) onSelect();
          },
          drag: (event: L.LeafletEvent) => {
            const at = (event.target as L.Marker).getLatLng();
            circle.current?.setLatLng(at);
            const moved = toImagePoint(at, size);
            handle.current?.setLatLng(
              toLatLng(edgePoint({ cx: moved.x, cy: moved.y, radius: zone.radius }, size), size),
            );
          },
          dragend: (event: L.DragEndEvent) => {
            const moved = clampToImage(toImagePoint((event.target as L.Marker).getLatLng(), size), size);
            onChange({ x: Math.round(moved.x), y: Math.round(moved.y) });
          },
        }}
      >
        <Tooltip>{label}</Tooltip>
      </Marker>
      {editable && !busy && (
        <Marker
          ref={handle}
          position={toLatLng(edgePoint(shape, size), size)}
          icon={resizeIcon}
          draggable
          title={`Resize ${zone.name}`}
          eventHandlers={{
            drag: (event: L.LeafletEvent) => {
              circle.current?.setRadius(map.distance(centre, (event.target as L.Marker).getLatLng()));
            },
            dragend: (event: L.DragEndEvent) => {
              const radius = map.distance(centre, (event.target as L.Marker).getLatLng());
              if (radius >= MIN_REGION_RADIUS) onChange({ radius: Math.round(radius) });
            },
          }}
        />
      )}
    </>
  );
}

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

const NO_TOKENS: GroupTokenView[] = [];
const NO_COUNTS: ReadonlyMap<string, number> = new Map();

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
  subMapRegionIds,
  onEnterRegionMap,
  canMovePins,
  onMovePin,
  regions,
  selectedRegionId,
  onSelectRegion,
  drawMode,
  weatherZones,
  canEditZones,
  zoneDrawMode,
  onDrawZone,
  onChangeZone,
  onSelectZone,
  onDrawRegion,
  canEditRegions,
  onChangeRegion,
  measuring,
  measurePoints,
  onMeasurePoint,
  gridCellPx,
  focus,
  label,
  spawnPins,
  selectedSpawnPinId,
  onSelectSpawnPin,
  onMoveSpawnPin,
  spawnMode,
  onPlaceSpawnPin,
  groupTokens = NO_TOKENS,
  selectedGroupId = null,
  onSelectGroup,
  canMoveGroups = false,
  onMoveGroup,
  entranceCounts = NO_COUNTS,
}: MapCanvasProps) {
  const busy = addMode || drawMode || measuring || spawnMode || zoneDrawMode;
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
      <PlaceOnClick active={spawnMode} size={size} onPlace={onPlaceSpawnPin} />
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
          hasSubMap={subMapRegionIds.has(region.id)}
          inside={entranceCounts.get(entranceKey('region', region.id)) ?? 0}
          onSelect={() => onSelectRegion(region.id)}
          onEnter={() => onEnterRegionMap(region.id)}
          onChange={changes => onChangeRegion(region.id, changes)}
        />
      ))}
      {drawMode && <DrawRegion size={size} onDraw={onDrawRegion} />}
      {zoneDrawMode && <DrawRegion size={size} onDraw={onDrawZone} />}
      {weatherZones.map(zone => (
        <WeatherZoneShape
          key={zone.id}
          zone={zone}
          size={size}
          editable={canEditZones}
          busy={busy}
          onSelect={onSelectZone}
          onChange={changes => onChangeZone(zone.id, changes)}
        />
      ))}
      {spawnPins.map(sp => {
        const name = `Spawn pin: ${sp.label || SPAWN_PIN_LABELS[sp.kind]} (${SPAWN_PIN_LABELS[sp.kind]}, DM only)`;
        return (
          <Marker
            key={`${sp.id}:${name}`}
            position={toLatLng(sp, size)}
            icon={spawnIcon(sp, sp.id === selectedSpawnPinId)}
            title={name}
            keyboard
            draggable={!busy}
            eventHandlers={{
              click: () => onSelectSpawnPin(sp.id),
              keydown: (event: L.LeafletKeyboardEvent) => {
                const key = event.originalEvent.key;
                if (key === 'Enter' || key === ' ') {
                  event.originalEvent.preventDefault();
                  onSelectSpawnPin(sp.id);
                }
              },
              dragend: (event: L.DragEndEvent) => {
                const point = clampToImage(toImagePoint((event.target as L.Marker).getLatLng(), size), size);
                onMoveSpawnPin(sp.id, point);
              },
            }}
          />
        );
      })}
      {pins.map(pin => {
        const hasSubMap = subMapPinIds.has(pin.id);
        const inside = entranceCounts.get(entranceKey('pin', pin.id)) ?? 0;
        const name = [
          `${pin.title} (${PIN_TYPE_LABELS[pin.type]}`,
          pin.visibleToPlayers ? '' : ', hidden from players',
          hasSubMap ? ', has a map beneath: double-click to enter' : '',
          inside > 0 ? `, ${inside} inside` : '',
          ')',
        ].join('');
        return (
          <Marker
            // Leaflet sets the title (the accessible name) only when a marker is created, so a change to what it
            // says rebuilds the marker
            key={`${pin.id}:${name}`}
            position={toLatLng(pin, size)}
            icon={sealIcon(pin, pin.id === selectedPinId, hasSubMap, inside)}
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
      {groupTokens.map(token => {
        const name = `Group ${token.name}, ${token.count} ${token.count === 1 ? 'member' : 'members'}${canMoveGroups ? '. Arrow keys move it, Shift for bigger steps' : ''}`;
        return (
          <Marker
            key={`${token.id}:${name}:${token.color}`}
            position={toLatLng({ x: token.x, y: token.y }, size)}
            icon={groupIcon(token, token.id === selectedGroupId)}
            title={name}
            keyboard
            zIndexOffset={1000}
            draggable={canMoveGroups && !busy}
            eventHandlers={{
              click: () => onSelectGroup?.(token.id),
              keydown: (event: L.LeafletKeyboardEvent) => {
                const e = event.originalEvent;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectGroup?.(token.id);
                  return;
                }
                if (!canMoveGroups || busy) return;
                // Leaflet does not move a marker for arrow keys: the token goes a step, and the page saves it
                const next = nudgePoint({ x: token.x, y: token.y }, e.key, size, e.shiftKey);
                if (!next) return;
                e.preventDefault();
                onMoveGroup?.(token.id, next, false);
              },
              dragend: (event: L.DragEndEvent) => {
                const point = clampToImage(toImagePoint((event.target as L.Marker).getLatLng(), size), size);
                onMoveGroup?.(token.id, point, true);
              },
            }}
          >
            <Tooltip direction="bottom" permanent className={styles.label}>
              {token.name}
            </Tooltip>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
