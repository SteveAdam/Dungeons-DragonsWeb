import { ChevronRight, Eye, EyeOff, MapPinPlus, Swords } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Button, ICON_PROPS, iconClasses, IconLink, Tag, Toggle } from '../../components/ui';
import { friendlyMessage } from '../../data/errors';
import { useCampaign } from '../../hooks/useCampaigns';
import { useDmMode } from '../../hooks/useDmMode';
import { useCreatePin, useMap, useMapImageUrl, usePins, useSetMapVisible } from '../../hooks/useMapView';
import { useShowDmIndicator } from '../../state/dmIndicator';
import { MapCanvas } from './MapCanvas';
import styles from './MapView.module.css';
import { PinPanel } from './PinPanel';

/**
 * Map view, prep mode (P0-8). Everything hidden is requested only while a DM has DM mode on, so a player and a
 * DM previewing as one make exactly the same requests: no hidden map, no hidden pin, no DM notes.
 */
export function MapViewPage() {
  const { campaignId = '', mapId = '' } = useParams();
  const campaign = useCampaign(campaignId);
  const { isDm, dmMode, setDmMode } = useDmMode(campaignId);
  useShowDmIndicator(dmMode);

  const map = useMap(mapId, dmMode);
  const pins = usePins(mapId, dmMode);
  const image = useMapImageUrl(map.data?.imagePath);
  const createPin = useCreatePin(mapId);
  const setVisible = useSetMapVisible(campaignId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const selected = pins.data?.find(p => p.id === selectedId) ?? null;
  const placing = addMode && dmMode;

  // Escape leaves add-pin mode
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAddMode(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing]);

  const campaignName = campaign.data?.name ?? 'Campaign';
  const breadcrumb = (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <IconLink to={`/campaigns/${campaignId}/maps`} icon={Swords}>
        {campaignName}
      </IconLink>
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
            onClick={() => setAddMode(on => !on)}
          >
            <MapPinPlus {...ICON_PROPS} className={iconClasses.icon} />
            {placing ? 'Click the map to place it' : 'Add pin'}
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
      {(createPin.isError || setVisible.isError || pins.isError) && (
        <p role="alert" className={styles.alertOnDesk}>
          {friendlyMessage(createPin.error ?? setVisible.error ?? pins.error)}
        </p>
      )}

      <div className={styles.layout}>
        <section aria-label="Map" className={styles.frame}>
          {image.data ? (
            <MapCanvas
              imageUrl={image.data}
              size={{ width: current.width, height: current.height }}
              pins={pins.data ?? []}
              selectedPinId={selectedId}
              onSelectPin={setSelectedId}
              addMode={placing}
              label={current.name}
              onPlace={point =>
                createPin.mutate(
                  { at: point },
                  {
                    onSuccess: pin => {
                      setSelectedId(pin.id);
                      setAddMode(false);
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
          <PinPanel pin={selected} mapId={current.id} canEdit={dmMode} onClose={() => setSelectedId(null)} />
        )}
      </div>
    </main>
  );
}
