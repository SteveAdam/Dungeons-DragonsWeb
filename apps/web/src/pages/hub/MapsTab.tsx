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

export function MapsTab({ campaignId, includeHidden }: Props) {
  const maps = useMaps(campaignId, includeHidden);

  if (maps.isPending) return <p role="status" className={styles.status}>Opening the cartographer&apos;s chest…</p>;
  if (maps.isError) return <ErrorNotice error={maps.error} onRetry={() => maps.refetch()} />;
  if (maps.data.length === 0) {
    return includeHidden ? (
      <EmptyState title="The chest is empty">You have not added a map yet. Map upload is coming soon.</EmptyState>
    ) : (
      <EmptyState title="No maps yet">Your DM has not shared a map with the party.</EmptyState>
    );
  }
  return (
    <ul className={styles.list}>
      {maps.data.map(map => (
        <li key={map.id} className={styles.row}>
          <span className={styles.rowName}>{map.name}</span>
          {!map.visibleToPlayers && <Tag>Hidden from players</Tag>}
        </li>
      ))}
    </ul>
  );
}
