import {
  ChevronRight,
  CircleDashed,
  Eye,
  EyeOff,
  Map as MapIcon,
  MapPinPlus,
  Ruler,
  Settings2,
  Swords,
} from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Button, ICON_PROPS, iconClasses, IconLink, Tag, Toggle } from '../../components/ui';
import { friendlyMessage } from '../../data/errors';
import type { Pin } from '../../data/pins';
import type { Region } from '../../data/regions';
import { useCampaign } from '../../hooks/useCampaigns';
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
import { useCreateRegion, useRegions, useUpdateRegion } from '../../hooks/useRegions';
import type { ImagePoint } from '../../lib/mapCoordinates';
import { gridCellPx } from '../../lib/mapGeometry';
import { useShowDmIndicator } from '../../state/dmIndicator';
import { Compass } from './Compass';
import { LayersMenu, type LayerState } from './LayersMenu';
import { MapCanvas } from './MapCanvas';
import { MapSettingsPanel } from './MapSettingsPanel';
import toolStyles from './MapTools.module.css';
import styles from './MapView.module.css';
import { MeasureBar } from './MeasureBar';
import { PinPanel } from './PinPanel';
import { PinSearch } from './PinSearch';
import { RegionPanel } from './RegionPanel';

const NO_SUB_MAPS: ReadonlySet<string> = new Set();
const NO_REGIONS: Region[] = [];
const NO_PINS: Pin[] = [];

type Selection = { kind: 'pin' | 'region'; id: string } | { kind: 'settings' };

/**
 * Map view, prep mode (P0-8). Everything hidden is requested only while a DM has DM mode on, so a player and a
 * DM previewing as one make exactly the same requests: no hidden map, no hidden pin, no DM notes.
 */
export function MapViewPage() {
  const { mapId = '' } = useParams();
  // a new map (entering a sub-map, or going back up) starts fresh: new Leaflet view, no selection
  return <MapView key={mapId} />;
}

function MapView() {
  const { campaignId = '', mapId = '' } = useParams();
  const navigate = useNavigate();
  const campaign = useCampaign(campaignId);
  const { isDm, dmMode, setDmMode } = useDmMode(campaignId);
  useShowDmIndicator(dmMode);

  const map = useMap(mapId, dmMode);
  const pins = usePins(mapId, dmMode);
  const pinIds = useMemo(() => (pins.data ?? []).map(p => p.id), [pins.data]);
  const subMaps = useSubMaps(mapId, pinIds, dmMode);
  const trail = useMapTrail(map.data, dmMode);
  const image = useMapImageUrl(map.data?.imagePath);
  const createPin = useCreatePin(mapId);
  const updatePin = useUpdatePin(mapId);
  const setVisible = useSetMapVisible(campaignId);
  const regions = useRegions(mapId, dmMode);
  const createRegion = useCreateRegion(mapId);
  const updateRegion = useUpdateRegion(mapId);

  // one thing is open in the side panel at a time: a pin, a region or the map settings
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tool, setTool] = useState<'pin' | 'region' | 'measure' | null>(null);
  const [layers, setLayers] = useState<LayerState>({ pins: true, regions: true, grid: true, compass: true });
  const [route, setRoute] = useState<ImagePoint[]>([]);
  const [focus, setFocus] = useState<{ x: number; y: number; key: number } | null>(null);
  const selected =
    layers.pins && selection?.kind === 'pin' ? (pins.data?.find(p => p.id === selection.id) ?? null) : null;
  const selectedRegion =
    layers.regions && selection?.kind === 'region' ? (regions.data?.find(r => r.id === selection.id) ?? null) : null;
  const placing = tool === 'pin' && dmMode && layers.pins;
  const drawing = tool === 'region' && dmMode && layers.regions;
  const measuring = tool === 'measure';
  const subMapPinIds = useMemo(() => (subMaps.data ? new Set(subMaps.data.keys()) : NO_SUB_MAPS), [subMaps.data]);
  const selectPin = (id: string) => setSelection({ kind: 'pin', id });
  const toggleTool = (which: 'pin' | 'region' | 'measure') => setTool(t => (t === which ? null : which));

  // Escape leaves add-pin, draw-region or measuring mode
  useEffect(() => {
    if (!tool) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTool(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool]);

  const campaignName = campaign.data?.name ?? 'Campaign';
  const breadcrumb = (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <IconLink to={`/campaigns/${campaignId}/maps`} icon={Swords}>
        {campaignName}
      </IconLink>
      {(trail.data ?? []).map(step => (
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
    subMaps.error;
  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        {breadcrumb}
        {isDm && <Toggle checked={dmMode} onChange={setDmMode} label="DM mode" />}
      </div>

      {dmMode && (
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
        {layers.pins && (pins.data?.length ?? 0) > 0 && (
          <PinSearch
            pins={pins.data ?? NO_PINS}
            onPick={pin => {
              selectPin(pin.id);
              setFocus({ x: pin.x, y: pin.y, key: Date.now() });
            }}
          />
        )}
      </div>
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
                const sub = subMaps.data?.get(pinId);
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
              canEditRegions={dmMode}
              onChangeRegion={(regionId, changes) => updateRegion.mutate({ regionId, changes })}
              canMovePins={dmMode}
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

        {selected && (
          <PinPanel
            pin={selected}
            mapId={current.id}
            campaignId={campaignId}
            mapSize={size}
            subMap={subMaps.data?.get(selected.id)}
            canEdit={dmMode}
            onClose={() => setSelection(null)}
          />
        )}
        {selectedRegion && (
          <RegionPanel
            region={selectedRegion}
            mapId={current.id}
            mapSize={size}
            canEdit={dmMode}
            onClose={() => setSelection(null)}
          />
        )}
        {selection?.kind === 'settings' && dmMode && (
          <MapSettingsPanel map={current} onClose={() => setSelection(null)} />
        )}
      </div>
    </main>
  );
}
