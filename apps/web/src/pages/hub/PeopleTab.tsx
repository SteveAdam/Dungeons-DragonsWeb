import { useState } from 'react';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Button, Tag } from '../../components/ui';
import { friendlyMessage } from '../../data/errors';
import { useMembers, useRemoveMember } from '../../hooks/useMembers';
import styles from './hub.module.css';

interface Props {
  campaignId: string;
  /** True for a DM with DM mode on: shows Remove next to each player. */
  canManage: boolean;
}

export function PeopleTab({ campaignId, canManage }: Props) {
  const members = useMembers(campaignId);
  const remove = useRemoveMember(campaignId);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (members.isPending)
    return (
      <p role="status" className={styles.status}>
        Calling the roll…
      </p>
    );
  if (members.isError) return <ErrorNotice error={members.error} onRetry={() => members.refetch()} />;
  return (
    <>
      {remove.isError && (
        <p role="alert" className={styles.alert}>
          {friendlyMessage(remove.error)}
        </p>
      )}
      <ul className={styles.list}>
        {members.data.map(m => (
          <li key={m.userId} className={styles.row}>
            {m.avatarUrl ? (
              <img src={m.avatarUrl} alt="" className={styles.avatar} loading="lazy" referrerPolicy="no-referrer" />
            ) : (
              <span aria-hidden="true" className={styles.initial}>
                {m.displayName.charAt(0).toUpperCase()}
              </span>
            )}
            <span className={styles.rowName}>{m.displayName}</span>
            <Tag>{m.role === 'dm' ? 'DM' : 'Player'}</Tag>
            {canManage &&
              m.role === 'player' &&
              (confirming === m.userId ? (
                <span className={styles.confirm}>
                  <span>{`Remove ${m.displayName}?`}</span>
                  <Button
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(m.userId, { onSettled: () => setConfirming(null) })}
                  >
                    {remove.isPending ? 'Removing…' : 'Yes, remove'}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(null)}>
                    Keep
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  aria-label={`Remove ${m.displayName}`}
                  onClick={() => {
                    remove.reset();
                    setConfirming(m.userId);
                  }}
                >
                  Remove
                </Button>
              ))}
          </li>
        ))}
      </ul>
    </>
  );
}
