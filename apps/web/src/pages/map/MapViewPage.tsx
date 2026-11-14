import {
  ArrowUp,
  ChevronRight,
  CircleDashed,
  CloudSun,
  Eye,
  EyeOff,
  Map as MapIcon,
  MapPinPlus,
  PawPrint,
  Ruler,
  Settings2,
  Shield,
  Swords,
  Thermometer,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Button, Cell, ICON_PROPS, iconClasses, IconLink, PageGrid, Tag, Toggle } from '../../components/ui';
import { friendlyMessage } from '../../data/errors';
import type { MapTrailStep } from '../../data/maps';
import type { PartyGroup } from '../../data/partyGroups';
import type { MemberVitals } from '../../data/groupTokens';
import type { Pin } from '../../data/pins';
import type { RegionContent } from '../../data/regionContent';
import type { Region } from '../../data/regions';
import type { SpawnPin } from '../../data/spawnPins';
import { useCampaign } from '../../hooks/useCampaigns';
import {
  useEntranceCounts,
  useMemberVitals,
  usePlaceGroup,
  useSetSpotlight,
  useShareGroupPositions,
  useSpotlight,
} from '../../hooks/useGroupMap';
import {
  useAddFogStroke,
  useClearFog,
  useFogBroadcast,
  useFogStrokes,
  useLiveFog,
  useReplaceFog,
  useSetMapFog,
  type FogEvent,
} from '../../hooks/useFog';
import { useCreateGroup, usePartyGroups } from '../../hooks/useHere';
import { useDmMode } from '../../hooks/useDmMode';
import {
  useCreatePin,
  useMap,
  useMapImageUrl,
  useMapTrail,
  usePins,
  useSetMapVisible,
  useSubMaps,
  useUpdatePin,
} from '../../hooks/useMapView';
import { useCreateSpawnPin, useRegionContent, useSpawnPins, useUpdateSpawnPin } from '../../hooks/useRegionContent';
import { useCreateRegion, useRegions, useUpdateRegion } from '../../hooks/useRegions';
import type { ImagePoint } from '../../lib/mapCoordinates';
import {
  fitPoints,
  fogSummary,
  MAX_STROKE_POINTS,
  oppositeStroke,
  renderFog,
  revealedFraction,
  simplifyFog,
  summaryCell,
  type FogPoint,
  type FogStroke,
} from '../../lib/fog';
import { nextGroup, regionAt, tokenPoint } from '../../lib/groupTokens';
import { gridCellPx } from '../../lib/mapGeometry';
import { useShowDmIndicator } from '../../state/dmIndicator';
import { useMapMode } from '../../state/mapMode';
import { Compass } from './Compass';
import { LayersMenu, type LayerState } from './LayersMenu';
import { MapCanvas, type GroupTokenView, type RegionCircle } from './MapCanvas';
import { MapSettingsPanel } from './MapSettingsPanel';
import toolStyles from './MapTools.module.css';
import { WeatherPanel } from './WeatherPanel';
import { todayOf, weatherOfDay } from '../../data/weather';
import { useCalendar } from '../../hooks/useCalendar';
import { useUpdateWeatherZone, useWeatherDays, useWeatherZones } from '../../hooks/useWeather';
import styles from './MapView.module.css';
import { MeasureBar } from './MeasureBar';
import { PinPanel } from './PinPanel';
import { PinSearch } from './PinSearch';
import { RegionPanel } from './RegionPanel';
import { SpawnPinPanel } from './SpawnPinPanel';
import { BRUSH_MAX, BRUSH_MIN, FogToolbar } from './fog/FogToolbar';
import { GroupStrip } from './table/GroupStrip';
import { GroupTracker } from './table/GroupTracker';
import { ModeSwitch } from './table/ModeSwitch';

const NO_SUB_MAPS: ReadonlySet<string> = new Set();
const NO_TRAIL: MapTrailStep[] = [];
const NO_REGIONS: Region[] = [];
const NO_PINS: Pin[] = [];

type Selection = { kind: 'pin' | 'region' | 'spawn'; id: string } | { kind: 'settings' } | { kind: 'weather' };
const NO_SPAWN_PINS: SpawnPin[] = [];
const NO_CONTENT: RegionContent[] = [];
const NO_GROUPS: PartyGroup[] = [];
const NO_VITALS: MemberVitals[] = [];
const NO_STROKES: FogStroke[] = [];
const UNDO_DEPTH = 20;
const newKey = () => crypto.randomUUID();

/**
 * Map view, prep mode (P0-8). Everything hidden is requested only while a DM has DM mode on, so a player and a
 * DM previewing as one make exactly the same requests: no hidden map, no hidden pin, no DM notes.
 */
export function MapViewPage() {
  const { mapId = '' } = useParams();
  // a new map (entering a detail map, or going back up) starts fresh: new Leaflet view, no selection. DM mode
  // lives in a store outside the page, so it carries over.
  return <MapView key={mapId} />;
}

function MapView() {
  const { campaignId = '', mapId = '' } = useParams();
  const navigate = useNavigate();
  const campaign = useCampaign(campaignId);
  const { isDm, dmMode, setDmMode } = useDmMode(campaignId);
  useShowDmIndicator(dmMode);
  // P4-2: the DM runs the game in table mode (no editing tools or panels, the tracker beside the map) and prepares in
  // prep mode. Everyone else already has the table view.
  const [mode, setMode] = useMapMode(campaignId);
  const table = dmMode && mode === 'table';

  const map = useMap(mapId, dmMode);
  const pins = usePins(mapId, dmMode);
  const pinIds = useMemo(() => (pins.data ?? []).map(p => p.id), [pins.data]);
  const trail = useMapTrail(map.data, dmMode);
  const image = useMapImageUrl(map.data?.imagePath);
  const createPin = useCreatePin(mapId);
  const updatePin = useUpdatePin(mapId);
  const setVisible = useSetMapVisible(campaignId);
  const regions = useRegions(mapId, dmMode);
  const createRegion = useCreateRegion(mapId);
  const updateRegion = useUpdateRegion(mapId);
  const regionIds = useMemo(() => (regions.data ?? []).map(r => r.id), [regions.data]);
  const subMaps = useSubMaps(mapId, pinIds, regionIds, dmMode);
  // spawn pins and region content are DM only: asked for only while DM mode is on
  const spawnPins = useSpawnPins(mapId, dmMode);
  const content = useRegionContent(regionIds, dmMode);
  const createSpawnPin = useCreateSpawnPin(mapId);
  const updateSpawnPin = useUpdateSpawnPin(mapId);
  // what a player sees: the zones on a map they can read, each with today's weather as an icon
  const allZones = useWeatherZones(campaignId);
  const updateZone = useUpdateWeatherZone(campaignId);
  const calendar = useCalendar(campaignId);
  const mapZones = useMemo(() => (allZones.data ?? []).filter(z => z.mapId === mapId), [allZones.data, mapId]);
  const zoneDays = useWeatherDays(
    campaignId,
    mapZones.map(z => z.id),
  );
  const today = todayOf(campaign.data?.gameSeconds ?? 0);
  const canvasZones = useMemo(
    () =>
      mapZones.map(z => ({
        ...z,
        condition: weatherOfDay(z, today, calendar.data ?? null, zoneDays.data ?? []).condition,
      })),
    [mapZones, today, calendar.data, zoneDays.data],
  );
  // P4-2: group tokens. What a player may read of the groups is the database's decision (their own, or all when shared).
  const groups = usePartyGroups(campaignId, !!campaignId);
  const groupList = groups.data ?? NO_GROUPS;
  const vitals = useMemberVitals(campaignId, dmMode);
  const entranceCounts = useEntranceCounts(mapId);
  const spotlight = useSpotlight(campaignId, dmMode);
  const placeGroup = usePlaceGroup(campaignId);
  const setSpotlight = useSetSpotlight(campaignId);
  const share = useShareGroupPositions(campaignId, groupList);
  const createGroup = useCreateGroup(campaignId);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const fogStrokes = useFogStrokes(mapId, map.data?.fogEnabled === true || dmMode);
  const liveFog = useLiveFog(mapId);
  const fogBroadcast = useFogBroadcast(campaignId, map.data, groups.data ?? NO_GROUPS);
  const addStroke = useAddFogStroke(mapId);
  const clearFogM = useClearFog(mapId);
  const replaceFogM = useReplaceFog(mapId);
  const setMapFog = useSetMapFog();
  const [fogTools, setFogTools] = useState(false);
  const [brushMode, setBrushMode] = useState<'reveal' | 'hide' | null>(null);
  const [brushRadius, setBrushRadius] = useState(60);
  const [fogGroupChoice, setFogGroupChoice] = useState<string | null>(null);
  const [draftStroke, setDraftStroke] = useState<FogStroke | null>(null);
  const [undoStack, setUndoStack] = useState<FogStroke[]>([]);
  const strokeKey = useRef('');
  const lastSent = useRef(0);
  const [showTokens, setShowTokens] = useState(true);
  // a token being dragged or nudged is drawn where it is going, until the move is saved
  const [moving, setMoving] = useState<Record<string, ImagePoint>>({});
  const nudgeTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = nudgeTimers.current;
    return () => timers.forEach(t => clearTimeout(t));
  }, []);
  const steps = trail.data ?? NO_TRAIL;
  const up = steps.length > 0 ? steps[steps.length - 1] : null;
  // the maps that cannot go beneath a pin or region on this map: this one and every map above it
  const excludeMapIds = useMemo(() => [mapId, ...steps.map(s => s.mapId)], [mapId, steps]);

  // one thing is open in the side panel at a time: a pin, a region or the map settings
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tool, setTool] = useState<'pin' | 'region' | 'spawn' | 'measure' | 'weather' | null>(null);
  const [zoneDraft, setZoneDraft] = useState<RegionCircle | null>(null);
  const [layers, setLayers] = useState<LayerState>({ pins: true, regions: true, grid: true, compass: true });
  const [route, setRoute] = useState<ImagePoint[]>([]);
  const [focus, setFocus] = useState<{ x: number; y: number; key: number } | null>(null);
  const selected =
    !table && layers.pins && selection?.kind === 'pin' ? (pins.data?.find(p => p.id === selection.id) ?? null) : null;
  const selectedRegion =
    !table && layers.regions && selection?.kind === 'region'
      ? (regions.data?.find(r => r.id === selection.id) ?? null)
      : null;
  const placing = tool === 'pin' && dmMode && !table && layers.pins;
  const drawing = tool === 'region' && dmMode && !table && layers.regions;
  const measuring = tool === 'measure';
  const spawning = tool === 'spawn' && dmMode && !table;
  const drawingZone = tool === 'weather' && dmMode && !table;
  const selectedSpawn =
    dmMode && !table && selection?.kind === 'spawn' ? (spawnPins.data?.find(p => p.id === selection.id) ?? null) : null;
  const subMapPinIds = useMemo(() => (subMaps.data ? new Set(subMaps.data.byPin.keys()) : NO_SUB_MAPS), [subMaps.data]);
  const subMapRegionIds = useMemo(
    () => (subMaps.data ? new Set(subMaps.data.byRegion.keys()) : NO_SUB_MAPS),
    [subMaps.data],
  );
  const selectPin = (id: string) => setSelection({ kind: 'pin', id });
  const toggleTool = (which: 'pin' | 'region' | 'spawn' | 'measure' | 'weather') =>
    setTool(t => (t === which ? null : which));

  // Alt+Up goes up one level, as the button does (MAP-2). Not while typing, where Alt+Up may mean something else.
  useEffect(() => {
    if (!up) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.key !== 'ArrowUp') return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      navigate(`/campaigns/${campaignId}/maps/${up.mapId}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [up, navigate, campaignId]);

  // Escape leaves add-pin, draw-region or measuring mode
  useEffect(() => {
    if (!tool) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTool(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool]);

  const regionList = regions.data ?? NO_REGIONS;
  // saves a group's spot: entering a different map or region moves the group first, so what it notices is revealed
  const commitToken = (group: PartyGroup, point: ImagePoint) => {
    const regionId = regionAt(point, regionList)?.id ?? null;
    const move = group.mapId !== mapId || group.regionId !== regionId ? { mapId, regionId } : null;
    placeGroup.mutate(
      { group, point, move },
      {
        onSettled: () =>
          setMoving(m => {
            const { [group.id]: _done, ...rest } = m;
            void _done;
            return rest;
          }),
      },
    );
  };
  const moveToken = (groupId: string, point: ImagePoint, now: boolean) => {
    const group = groupList.find(g => g.id === groupId);
    if (!group) return;
    setMoving(m => ({ ...m, [groupId]: point }));
    clearTimeout(nudgeTimers.current.get(groupId));
    if (now) return commitToken(group, point);
    // arrow keys come in a run: save when they stop
    nudgeTimers.current.set(
      groupId,
      setTimeout(() => commitToken(group, point), 500),
    );
  };
  // P4-3: fog of war (cosmetic). Players read their fog (shared, or their group's) and see it opaque; the DM sees the
  // fog being drawn (shared, or the chosen group's) see-through.
  const fogOn = map.data?.fogEnabled === true;
  const perGroup = map.data?.fogMode === 'per_group';
  const fogGroupId = perGroup ? (fogGroupChoice ?? selectedGroupId ?? groupList[0]?.id ?? null) : null;
  const shownStrokes = useMemo(() => {
    const saved = (fogStrokes.data ?? []).filter(s =>
      dmMode ? s.groupId === fogGroupId : perGroup ? s.groupId !== null : s.groupId === null,
    );
    const live = dmMode ? [] : [...liveFog.values()].filter(s => (perGroup ? s.groupId !== null : s.groupId === null));
    return [...saved, ...live, ...(draftStroke ? [draftStroke] : [])];
  }, [fogStrokes.data, liveFog, draftStroke, dmMode, perGroup, fogGroupId]);
  const fogText = useMemo(() => {
    if (!fogOn || !map.data) return null;
    const { width, height } = map.data;
    return fogSummary(revealedFraction(renderFog(shownStrokes, width, height, summaryCell(width, height))));
  }, [fogOn, map.data, shownStrokes]);
  const editingStrokes = dmMode ? (fogStrokes.data ?? []).filter(s => s.groupId === fogGroupId) : NO_STROKES;
  const brushing = dmMode && fogTools && fogOn && brushMode !== null && !(perGroup && !fogGroupId);
  const fogEvent = (kind: FogEvent['kind'], stroke: FogStroke, key: string): FogEvent => ({
    mapId,
    groupId: fogGroupId,
    kind,
    strokeKey: key,
    mode: stroke.mode,
    radius: Math.round(stroke.radius),
    points: stroke.points.length > 500 ? [] : stroke.points.map(p => [p[0], p[1]] as [number, number]),
  });
  const fogReload = () => fogBroadcast(fogEvent('reload', { mode: 'hide_all', radius: 0, points: [] }, newKey()));
  const saveStroke = (stroke: FogStroke, key: string, undoable: boolean) =>
    addStroke.mutate(
      { groupId: fogGroupId, stroke },
      {
        onSuccess: () => {
          if (undoable) setUndoStack(u => [...u, stroke].slice(-UNDO_DEPTH));
          fogBroadcast(stroke.points.length > 500 ? fogEvent('reload', stroke, key) : fogEvent('final', stroke, key));
        },
        onSettled: () => setDraftStroke(null),
      },
    );
  const onBrushStroke = (points: FogPoint[], done: boolean) => {
    if (!brushMode) return;
    if (!strokeKey.current) strokeKey.current = newKey();
    if (!done) {
      const live: FogStroke = { mode: brushMode, radius: brushRadius, points };
      setDraftStroke(live);
      const now = Date.now();
      // others see the stroke grow a few times a second, never more
      if (now - lastSent.current > 150) {
        lastSent.current = now;
        fogBroadcast(
          fogEvent('partial', { ...live, points: fitPoints(points, 500, brushRadius / 8) }, strokeKey.current),
        );
      }
      return;
    }
    const key = strokeKey.current;
    strokeKey.current = '';
    const stroke: FogStroke = {
      mode: brushMode,
      radius: brushRadius,
      points: fitPoints(points, MAX_STROKE_POINTS, Math.max(0.5, brushRadius / 8)),
    };
    setDraftStroke(stroke);
    saveStroke(stroke, key, true);
  };
  const undoFog = () => {
    const last = undoStack[undoStack.length - 1];
    if (!last || addStroke.isPending) return;
    setUndoStack(u => u.slice(0, -1));
    saveStroke(oppositeStroke(last), newKey(), false);
  };
  const undoRef = useRef(undoFog);
  useEffect(() => {
    undoRef.current = undoFog;
  });
  const clearAll = (mode: 'reveal' | 'hide') =>
    clearFogM.mutate(
      { groupId: fogGroupId, mode },
      {
        onSuccess: () => {
          setUndoStack([]);
          fogReload();
        },
      },
    );
  const simplifyNow = () => {
    if (!map.data) return;
    const simpler = simplifyFog(editingStrokes, map.data.width, map.data.height);
    replaceFogM.mutate(
      { groupId: fogGroupId, strokes: simpler },
      {
        onSuccess: () => {
          setUndoStack([]);
          fogReload();
        },
      },
    );
  };
  // fog keys: R reveal brush, H hide brush, [ and ] size, Ctrl+Z undo, Esc put the brush down
  useEffect(() => {
    if (!fogTools || !dmMode) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoRef.current();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'r') setBrushMode(m => (m === 'reveal' ? null : 'reveal'));
      else if (key === 'h') setBrushMode(m => (m === 'hide' ? null : 'hide'));
      else if (e.key === '[') setBrushRadius(r => Math.max(BRUSH_MIN, Math.round(r / 1.25)));
      else if (e.key === ']') setBrushRadius(r => Math.min(BRUSH_MAX, Math.round(r * 1.25)));
      else if (e.key === 'Escape') setBrushMode(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fogTools, dmMode]);

  const tokensHere = groupList.filter(g => g.mapId === mapId);
  const groupTokens: GroupTokenView[] = showTokens
    ? tokensHere.map((g, i) => ({
        id: g.id,
        name: g.name,
        color: g.color,
        count: g.memberCount,
        ...(moving[g.id] ??
          tokenPoint(g, regionList, { width: map.data?.width ?? 0, height: map.data?.height ?? 0 }, i)),
      }))
    : [];

  const campaignName = campaign.data?.name ?? 'Campaign';
  const breadcrumb = (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <IconLink to={`/campaigns/${campaignId}/maps`} icon={Swords}>
        {campaignName}
      </IconLink>
      {steps.map(step => (
        <span key={step.mapId} className={styles.crumb}>
          <ChevronRight {...ICON_PROPS} className={styles.crumbSep} />
          <IconLink to={`/campaigns/${campaignId}/maps/${step.mapId}`} icon={MapIcon}>
            {step.name}
          </IconLink>
        </span>
      ))}
      <ChevronRight {...ICON_PROPS} className={styles.crumbSep} />
      <span aria-current="page">{map.data?.name ?? 'Map'}</span>
    </nav>
  );

  if (map.isPending) {
    return (
      <main className={styles.page}>
        {breadcrumb}
        <p role="status" className={styles.status}>
          Unrolling the map…
        </p>
      </main>
    );
  }
  if (map.isError) {
    return (
      <main className={styles.page}>
        {breadcrumb}
        <ErrorNotice error={map.error} onRetry={() => map.refetch()} />
      </main>
    );
  }

  const current = map.data;
  const size = { width: current.width, height: current.height };
  const cell = gridCellPx(size, current.tools);
  const actionError =
    createPin.error ??
    updatePin.error ??
    createRegion.error ??
    updateRegion.error ??
    setVisible.error ??
    pins.error ??
    regions.error ??
    subMaps.error ??
    spawnPins.error ??
    createSpawnPin.error ??
    updateSpawnPin.error ??
    placeGroup.error ??
    setSpotlight.error ??
    createGroup.error ??
    addStroke.error ??
    clearFogM.error ??
    replaceFogM.error ??
    setMapFog.error;
  return (
    <PageGrid className={styles.mapGrid}>
      {/* the red band: where you are in the layers, and the way up */}
      <Cell className={styles.topBar}>
        {breadcrumb}
        {up && (
          <IconLink
            to={`/campaigns/${campaignId}/maps/${up.mapId}`}
            icon={ArrowUp}
            aria-keyshortcuts="Alt+ArrowUp"
            title="Up one level (Alt+Up)"
          >
            Up one level
          </IconLink>
        )}
        {isDm && dmMode && (
          <ModeSwitch
            mode={mode}
            onChange={next => {
              setMode(next);
              setTool(null);
              setSelection(null);
            }}
          />
        )}
        {isDm && <Toggle checked={dmMode} onChange={setDmMode} label="DM mode" />}
      </Cell>

      {/* the tool rail: DM tools, then the view tools; a row of its own on narrower screens */}
      <Cell span={2} spanMd={6} className={styles.rail}>
        {dmMode && !table && (
          <div role="toolbar" aria-label="Map tools" className={styles.tools}>
            <Button
              variant={placing ? 'primary' : 'ghost'}
              aria-pressed={placing}
              className={iconClasses.host}
              onClick={() => {
                setLayers(l => ({ ...l, pins: true }));
                toggleTool('pin');
              }}
            >
              <MapPinPlus {...ICON_PROPS} className={iconClasses.icon} />
              {placing ? 'Click the map to place it' : 'Add pin'}
            </Button>
            <Button
              variant={drawing ? 'primary' : 'ghost'}
              aria-pressed={drawing}
              className={iconClasses.host}
              onClick={() => {
                setLayers(l => ({ ...l, regions: true }));
                toggleTool('region');
              }}
            >
              <CircleDashed {...ICON_PROPS} className={iconClasses.icon} />
              {drawing ? 'Click the centre, then the edge' : 'Add region'}
            </Button>
            <Button
              variant={spawning ? 'primary' : 'ghost'}
              aria-pressed={spawning}
              className={iconClasses.host}
              onClick={() => toggleTool('spawn')}
            >
              <PawPrint {...ICON_PROPS} className={iconClasses.icon} />
              {spawning ? 'Click the map to place it' : 'Add spawn pin'}
            </Button>
            <Button
              variant={drawingZone ? 'primary' : 'ghost'}
              aria-pressed={drawingZone}
              className={iconClasses.host}
              onClick={() => toggleTool('weather')}
            >
              <CloudSun {...ICON_PROPS} className={iconClasses.icon} />
              {drawingZone ? 'Click the centre, then the edge' : 'Draw weather zone'}
            </Button>
            <Button
              variant={selection?.kind === 'weather' ? 'primary' : 'ghost'}
              aria-pressed={selection?.kind === 'weather'}
              className={iconClasses.host}
              onClick={() => setSelection(s => (s?.kind === 'weather' ? null : { kind: 'weather' }))}
            >
              <Thermometer {...ICON_PROPS} className={iconClasses.icon} />
              Weather
            </Button>
            <Button
              variant={fogTools ? 'primary' : 'ghost'}
              aria-pressed={fogTools}
              className={iconClasses.host}
              onClick={() => {
                setFogTools(v => !v);
                setBrushMode(null);
                setTool(null);
              }}
            >
              <EyeOff {...ICON_PROPS} className={iconClasses.icon} />
              Fog of war
            </Button>
            <Button
              variant={selection?.kind === 'settings' ? 'primary' : 'ghost'}
              aria-pressed={selection?.kind === 'settings'}
              className={iconClasses.host}
              onClick={() => setSelection(s => (s?.kind === 'settings' ? null : { kind: 'settings' }))}
            >
              <Settings2 {...ICON_PROPS} className={iconClasses.icon} />
              Map settings
            </Button>
            <Button
              variant="ghost"
              className={iconClasses.host}
              disabled={setVisible.isPending}
              onClick={() => setVisible.mutate({ mapId: current.id, visible: !current.visibleToPlayers })}
            >
              {current.visibleToPlayers ? (
                <Eye {...ICON_PROPS} className={iconClasses.icon} />
              ) : (
                <EyeOff {...ICON_PROPS} className={iconClasses.icon} />
              )}
              {current.visibleToPlayers ? 'Map visible to players' : 'Map hidden from players'}
            </Button>
            {!current.visibleToPlayers && <Tag>Players cannot see this map</Tag>}
          </div>
        )}

        <div role="toolbar" aria-label="View" className={toolStyles.viewBar}>
          <Button
            variant={measuring ? 'primary' : 'ghost'}
            aria-pressed={measuring}
            className={iconClasses.host}
            onClick={() => {
              if (measuring) setRoute([]);
              toggleTool('measure');
            }}
          >
            <Ruler {...ICON_PROPS} className={iconClasses.icon} />
            {measuring ? 'Stop measuring' : 'Measure'}
          </Button>
          {table && (
            <>
              <Button
                variant={fogTools ? 'primary' : 'ghost'}
                aria-pressed={fogTools}
                className={iconClasses.host}
                onClick={() => {
                  setFogTools(v => !v);
                  setBrushMode(null);
                }}
              >
                <EyeOff {...ICON_PROPS} className={iconClasses.icon} />
                Reveal fog
              </Button>
              <Button
                variant={showTokens ? 'primary' : 'ghost'}
                aria-pressed={showTokens}
                className={iconClasses.host}
                onClick={() => setShowTokens(v => !v)}
              >
                <Shield {...ICON_PROPS} className={iconClasses.icon} />
                Group tokens
              </Button>
            </>
          )}
          {!table && (
            <LayersMenu
              layers={layers}
              onChange={next => {
                setLayers(next);
                if (!next.regions && tool === 'region') setTool(null);
                if (!next.pins && tool === 'pin') setTool(null);
              }}
              gridAvailable={cell !== null}
              regions={regions.data ?? NO_REGIONS}
            />
          )}
          {!table && layers.pins && (pins.data?.length ?? 0) > 0 && (
            <PinSearch
              pins={pins.data ?? NO_PINS}
              onPick={pin => {
                selectPin(pin.id);
                setFocus({ x: pin.x, y: pin.y, key: Date.now() });
              }}
            />
          )}
        </div>
      </Cell>

      <Cell span={10} spanMd={6} className={styles.body}>
        {measuring && (
          <MeasureBar
            points={route}
            size={size}
            tools={current.tools}
            regions={regions.data ?? NO_REGIONS}
            isDm={dmMode}
            onUndo={() => setRoute(r => r.slice(0, -1))}
            onClear={() => setRoute([])}
          />
        )}

        {dmMode && fogTools && (
          <FogToolbar
            enabled={fogOn}
            perGroup={perGroup}
            brush={brushMode}
            radius={brushRadius}
            strokeCount={editingStrokes.length}
            canUndo={undoStack.length > 0}
            groups={groupList}
            groupId={fogGroupId}
            busy={addStroke.isPending || clearFogM.isPending || replaceFogM.isPending || setMapFog.isPending}
            onBrush={mode => {
              setBrushMode(mode);
              setTool(null);
            }}
            onRadius={setBrushRadius}
            onRevealAll={() => clearAll('reveal')}
            onHideAll={() => clearAll('hide')}
            onUndo={undoFog}
            onSimplify={simplifyNow}
            onGroup={g => {
              setFogGroupChoice(g);
              setUndoStack([]);
            }}
            onTurnOn={() =>
              setMapFog.mutate(
                { mapId, enabled: true, mode: map.data?.fogMode ?? 'shared' },
                { onSuccess: () => fogReload() },
              )
            }
          />
        )}
        {fogText && (
          <p className="visually-hidden" aria-live="polite">
            {fogText}
          </p>
        )}

        {actionError && (
          <p role="alert" className={styles.alertOnDesk}>
            {friendlyMessage(actionError)}
          </p>
        )}

        <div className={styles.layout}>
          <section
            aria-label="Map"
            className={styles.frame}
            // the frame takes the image's own shape, so it hugs the map
            style={{ '--map-ratio': current.width / current.height } as CSSProperties}
          >
            {image.data ? (
              <MapCanvas
                imageUrl={image.data}
                size={size}
                pins={layers.pins ? (pins.data ?? NO_PINS) : NO_PINS}
                selectedPinId={selected?.id ?? null}
                onSelectPin={selectPin}
                addMode={placing}
                label={current.name}
                subMapPinIds={subMapPinIds}
                onEnterSubMap={pinId => {
                  const sub = subMaps.data?.byPin.get(pinId);
                  if (sub) navigate(`/campaigns/${campaignId}/maps/${sub.id}`);
                }}
                subMapRegionIds={subMapRegionIds}
                onEnterRegionMap={regionId => {
                  const sub = subMaps.data?.byRegion.get(regionId);
                  if (sub) navigate(`/campaigns/${campaignId}/maps/${sub.id}`);
                }}
                regions={layers.regions ? (regions.data ?? NO_REGIONS) : NO_REGIONS}
                selectedRegionId={selectedRegion?.id ?? null}
                onSelectRegion={id => setSelection({ kind: 'region', id })}
                drawMode={drawing}
                onDrawRegion={circle =>
                  createRegion.mutate(
                    { circle },
                    {
                      onSuccess: region => {
                        setSelection({ kind: 'region', id: region.id });
                        setTool(null);
                      },
                    },
                  )
                }
                canEditRegions={dmMode && !table}
                onChangeRegion={(regionId, changes) => updateRegion.mutate({ regionId, changes })}
                canMovePins={dmMode && !table}
                onMovePin={(pinId, point) => updatePin.mutate({ pinId, changes: point })}
                onPlace={point =>
                  createPin.mutate(
                    { at: point },
                    {
                      onSuccess: pin => {
                        selectPin(pin.id);
                        setTool(null);
                      },
                    },
                  )
                }
                measuring={measuring}
                measurePoints={route}
                onMeasurePoint={point => setRoute(r => [...r, point])}
                gridCellPx={layers.grid ? cell : null}
                focus={focus}
                spawnPins={dmMode && !table ? (spawnPins.data ?? NO_SPAWN_PINS) : NO_SPAWN_PINS}
                selectedSpawnPinId={selectedSpawn?.id ?? null}
                onSelectSpawnPin={id => setSelection({ kind: 'spawn', id })}
                onMoveSpawnPin={(id, point) => updateSpawnPin.mutate({ id, changes: point })}
                groupTokens={groupTokens}
                selectedGroupId={selectedGroupId}
                onSelectGroup={setSelectedGroupId}
                canMoveGroups={table}
                onMoveGroup={(id, point, final) => {
                  setSelectedGroupId(id);
                  moveToken(id, point, final);
                }}
                entranceCounts={entranceCounts.data}
                fog={fogOn ? { strokes: shownStrokes, dm: dmMode } : null}
                brush={brushing ? { radius: brushRadius } : null}
                onBrushStroke={onBrushStroke}
                weatherZones={canvasZones}
                canEditZones={dmMode && !table}
                zoneDrawMode={drawingZone}
                onDrawZone={circle => {
                  setZoneDraft(circle);
                  setTool(null);
                  setSelection({ kind: 'weather' });
                }}
                onChangeZone={(id, changes) => updateZone.mutate({ id, changes })}
                onSelectZone={() => setSelection({ kind: 'weather' })}
                spawnMode={spawning}
                onPlaceSpawnPin={point =>
                  createSpawnPin.mutate(
                    { at: point, kind: 'creature' },
                    {
                      onSuccess: sp => {
                        setSelection({ kind: 'spawn', id: sp.id });
                        setTool(null);
                      },
                    },
                  )
                }
              />
            ) : image.isError ? (
              <ErrorNotice error={image.error} onRetry={() => image.refetch()} />
            ) : (
              <p role="status" className={styles.status}>
                Fetching the map image…
              </p>
            )}
            {layers.compass && image.data && <Compass northDegrees={current.tools.northDegrees} />}
          </section>

          {table && (
            <GroupTracker
              groups={groupList}
              vitals={vitals.data ?? NO_VITALS}
              mapId={mapId}
              regions={regionList}
              selectedGroupId={selectedGroupId}
              spotlight={spotlight.data ?? null}
              sharePositions={campaign.data?.shareGroupPositions === true}
              busy={placeGroup.isPending || setSpotlight.isPending || createGroup.isPending || share.isPending}
              onSelect={setSelectedGroupId}
              onJump={target => navigate(`/campaigns/${campaignId}/maps/${target}`)}
              onBringHere={group => commitToken(group, { x: current.width / 2, y: current.height / 2 })}
              onMoveToRegion={(group, regionId) => {
                const region = regionList.find(r => r.id === regionId);
                if (!region) return;
                const move = group.mapId !== mapId || group.regionId !== regionId ? { mapId, regionId } : null;
                placeGroup.mutate({ group, point: { x: region.cx, y: region.cy }, move });
              }}
              onSpotlight={(groupId, summary) => setSpotlight.mutate({ groupId, summary })}
              onNewGroup={() => createGroup.mutate(nextGroup(groupList))}
              onShare={on => share.mutate(on)}
            />
          )}
          {selected && (
            <PinPanel
              pin={selected}
              mapId={current.id}
              campaignId={campaignId}
              mapSize={size}
              subMap={subMaps.data?.byPin.get(selected.id)}
              canEdit={dmMode}
              excludeMapIds={excludeMapIds}
              onClose={() => setSelection(null)}
            />
          )}
          {selectedRegion && (
            <RegionPanel
              region={selectedRegion}
              mapId={current.id}
              campaignId={campaignId}
              mapSize={size}
              subMap={subMaps.data?.byRegion.get(selectedRegion.id)}
              canEdit={dmMode}
              excludeMapIds={excludeMapIds}
              onClose={() => setSelection(null)}
            />
          )}
          {selectedSpawn && (
            <SpawnPinPanel
              key={selectedSpawn.id}
              pin={selectedSpawn}
              mapId={current.id}
              content={content.data ?? NO_CONTENT}
              regions={regions.data ?? NO_REGIONS}
              onClose={() => setSelection(null)}
            />
          )}
          {selection?.kind === 'weather' && dmMode && !table && (
            <WeatherPanel
              campaignId={campaignId}
              map={current}
              draft={zoneDraft}
              onDraftDone={() => setZoneDraft(null)}
              onClose={() => {
                setZoneDraft(null);
                setSelection(null);
              }}
            />
          )}
          {selection?.kind === 'settings' && dmMode && !table && (
            <MapSettingsPanel map={current} onClose={() => setSelection(null)} onFogChanged={fogReload} />
          )}
        </div>
        {table && (
          <GroupStrip
            groups={groupList}
            vitals={vitals.data ?? NO_VITALS}
            mapId={mapId}
            onJump={target => navigate(`/campaigns/${campaignId}/maps/${target}`)}
          />
        )}
      </Cell>
    </PageGrid>
  );
}
