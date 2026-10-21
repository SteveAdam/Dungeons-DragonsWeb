import { EmptyState } from '../../components/EmptyState';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Tag } from '../../components/ui';
import { useMaps } from '../../hooks/useMaps';
import styles from './hub.module.css';

interface Props {
  campaignId: string;
  /** True only for a DM with DM mode on. Otherwise hidden maps are not requested at all. */
  includeHidden: boolean;
}

/** "The cartographer's chest": one card per top-level map. Hidden maps get a dashed outline and a tag. */
export function MapsTab({ campaignId, includeHidden }: Props) {
  const maps = useMaps(campaignId, includeHidden);

  if (maps.isPending)
    return (
      <p role="status" className={styles.status}>
        Opening the cartographer&apos;s chest…
      </p>
    );
  if (maps.isError) return <ErrorNotice error={maps.error} onRetry={() => maps.refetch()} />;
  if (maps.data.length === 0) {
    return includeHidden ? (
      <EmptyState title="The chest is empty">You have not added a map yet. Map upload is coming soon.</EmptyState>
    ) : (
      <EmptyState title="No maps yet">Your DM has not shared a map with the party.</EmptyState>
    );
  }
  return (
    <>
      <h2 className={styles.chestTitle}>The cartographer&apos;s chest</h2>
      <ul className={styles.cards}>
        {maps.data.map(map => (
          <li key={map.id} className={map.visibleToPlayers ? styles.card : `${styles.card} ${styles.hidden}`}>
            {/* The thumbnail arrives with map upload (P0-8); for now an empty frame keeps the layout. */}
            <span aria-hidden="true" className={styles.thumb} />
            <span className={styles.cardName}>{map.name}</span>
            {!map.visibleToPlayers && <Tag>Hidden from players</Tag>}
          </li>
        ))}
      </ul>
    </>
  );
}
