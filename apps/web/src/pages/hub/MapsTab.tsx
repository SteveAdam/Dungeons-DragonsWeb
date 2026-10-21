import { ImagePlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Button, ICON_PROPS, iconClasses, Tag } from '../../components/ui';
import type { MapSummary } from '../../data/maps';
import { useMapImageUrl } from '../../hooks/useMapView';
import { useMaps } from '../../hooks/useMaps';
import styles from './hub.module.css';
import { MapUploadForm } from './MapUploadForm';

interface Props {
  campaignId: string;
  /** True only for a DM with DM mode on. Otherwise hidden maps are not requested at all, and there is no upload. */
  includeHidden: boolean;
}

function MapCard({ campaignId, map }: { campaignId: string; map: MapSummary }) {
  const image = useMapImageUrl(map.imagePath);
  return (
    <li className={map.visibleToPlayers ? styles.card : `${styles.card} ${styles.hidden}`}>
      <Link to={`/campaigns/${campaignId}/maps/${map.id}`} className={styles.cardLink}>
        {image.data ? (
          <img src={image.data} alt="" className={styles.thumb} loading="lazy" />
        ) : (
          <span aria-hidden="true" className={styles.thumb} />
        )}
        <span className={styles.cardName}>{map.name}</span>
      </Link>
      {!map.visibleToPlayers && <Tag>Hidden from players</Tag>}
    </li>
  );
}

/** "The cartographer's chest": one card per top-level map. Hidden maps get a dashed outline and a tag. */
export function MapsTab({ campaignId, includeHidden }: Props) {
  const maps = useMaps(campaignId, includeHidden);
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);

  const header = (
    <div className={styles.chestHeader}>
      <h2 className={styles.chestTitle}>The cartographer&apos;s chest</h2>
      {includeHidden && !adding && (
        <Button variant="ghost" className={iconClasses.host} onClick={() => setAdding(true)}>
          <ImagePlus {...ICON_PROPS} className={iconClasses.icon} />
          Add a map
        </Button>
      )}
    </div>
  );
  const form = adding && (
    <MapUploadForm
      campaignId={campaignId}
      onCancel={() => setAdding(false)}
      onUploaded={map => navigate(`/campaigns/${campaignId}/maps/${map.id}`)}
    />
  );

  if (maps.isPending)
    return (
      <p role="status" className={styles.status}>
        Opening the cartographer&apos;s chest…
      </p>
    );
  if (maps.isError) return <ErrorNotice error={maps.error} onRetry={() => maps.refetch()} />;
  if (maps.data.length === 0) {
    return (
      <>
        {header}
        {form}
        {!adding &&
          (includeHidden ? (
            <EmptyState title="The chest is empty">Add your first map with the button above.</EmptyState>
          ) : (
            <EmptyState title="No maps yet">Your DM has not shared a map with the party.</EmptyState>
          ))}
      </>
    );
  }
  return (
    <>
      {header}
      {form}
      <ul className={styles.cards}>
        {maps.data.map(map => (
          <MapCard key={map.id} campaignId={campaignId} map={map} />
        ))}
      </ul>
    </>
  );
}
