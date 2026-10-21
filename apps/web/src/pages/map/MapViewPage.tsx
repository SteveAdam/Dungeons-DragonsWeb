import { ChevronRight, CircleDashed, Eye, EyeOff, Map as MapIcon, MapPinPlus, Swords } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Button, ICON_PROPS, iconClasses, IconLink, Tag, Toggle } from '../../components/ui';
import { friendlyMessage } from '../../data/errors';
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
import { useShowDmIndicator } from '../../state/dmIndicator';
import { MapCanvas } from './MapCanvas';
import styles from './MapView.module.css';
import { PinPanel } from './PinPanel';
import { RegionPanel } from './RegionPanel';

const NO_SUB_MAPS: ReadonlySet<string> = new Set();
const NO_REGIONS: Region[] = [];

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

  // one thing is open in the side panel at a time: a pin or a region
  const [selection, setSelection] = useState<{ kind: 'pin' | 'region'; id: string } | null>(null);
  const [tool, setTool] = useState<'pin' | 'region' | null>(null);
  const [showRegions, setShowRegions] = useState(true);
  const selected = selection?.kind === 'pin' ? (pins.data?.find(p => p.id === selection.id) ?? null) : null;
  const selectedRegion =
    showRegions && selection?.kind === 'region' ? (regions.data?.find(r => r.id === selection.id) ?? null) : null;
  const placing = tool === 'pin' && dmMode;
  const drawing = tool === 'region' && dmMode && showRegions;
  const subMapPinIds = useMemo(() => (subMaps.data ? new Set(subMaps.data.keys()) : NO_SUB_MAPS), [subMaps.data]);
  const selectPin = (id: string) => setSelection({ kind: 'pin', id });
  const toggleTool = (which: 'pin' | 'region') => setTool(t => (t === which ? null : which));

  // Escape leaves add-pin or draw-region mode
  useEffect(() => {
    if (!placing && !drawing) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTool(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing, drawing]);

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
  const actionError =
    createPin.error ??
    updatePin.error ??
    createRegion.error ??
    updateRegion.error ??
    setVisible.error ??
    pins.error ??
    regions.error ??
    subMaps.error;
  const hasRegions = (regions.data?.length ?? 0) > 0;
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
            onClick={() => toggleTool('pin')}
          >
            <MapPinPlus {...ICON_PROPS} className={iconClasses.icon} />
            {placing ? 'Click the map to place it' : 'Add pin'}
          </Button>
          <Button
            variant={drawing ? 'primary' : 'ghost'}
            aria-pressed={drawing}
            className={iconClasses.host}
            onClick={() => {
              setShowRegions(true);
              toggleTool('region');
            }}
          >
            <CircleDashed {...ICON_PROPS} className={iconClasses.icon} />
            {drawing ? 'Click the centre, then the edge' : 'Add region'}
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
      {hasRegions && (
        <div className={styles.viewBar}>
          <Toggle
            checked={showRegions}
            onChange={on => {
              setShowRegions(on);
              if (!on && tool === 'region') setTool(null);
            }}
            label="Show regions and weather"
          />
        </div>
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
              pins={pins.data ?? []}
              selectedPinId={selected?.id ?? null}
              onSelectPin={selectPin}
              addMode={placing}
              label={current.name}
              subMapPinIds={subMapPinIds}
              onEnterSubMap={pinId => {
                const sub = subMaps.data?.get(pinId);
                if (sub) navigate(`/campaigns/${campaignId}/maps/${sub.id}`);
              }}
              regions={showRegions ? (regions.data ?? []) : NO_REGIONS}
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
            />
          ) : image.isError ? (
            <ErrorNotice error={image.error} onRetry={() => image.refetch()} />
          ) : (
            <p role="status" className={styles.status}>
              Fetching the map image…
            </p>
          )}
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
      </div>
    </main>
  );
}
