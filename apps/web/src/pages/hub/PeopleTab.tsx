import { ErrorNotice } from '../../components/ErrorNotice';
import { Tag } from '../../components/ui';
import { useMembers } from '../../hooks/useMembers';
import styles from './hub.module.css';

export function PeopleTab({ campaignId }: { campaignId: string }) {
  const members = useMembers(campaignId);

  if (members.isPending) return <p role="status" className={styles.status}>Calling the roll…</p>;
  if (members.isError) return <ErrorNotice error={members.error} onRetry={() => members.refetch()} />;
  return (
    <ul className={styles.list}>
      {members.data.map(m => (
        <li key={m.userId} className={styles.row}>
          {m.avatarUrl ? (
            <img src={m.avatarUrl} alt="" className={styles.avatar} loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <span aria-hidden="true" className={styles.initial}>{m.displayName.charAt(0).toUpperCase()}</span>
          )}
          <span className={styles.rowName}>{m.displayName}</span>
          <Tag>{m.role === 'dm' ? 'DM' : 'Player'}</Tag>
        </li>
      ))}
    </ul>
  );
}
