import { useState } from 'react';
import { Button, Paper } from '../../components/ui';
import { friendlyMessage } from '../../data/errors';
import styles from './hub.module.css';

interface Props {
  code: string | null;
  loading: boolean;
  error: unknown;
}

/** The invitation code, sealed away from players. The parent only renders this for a DM with DM mode on. */
export function SealedInviteCard({ code, loading, error }: Props) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function onCopy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  return (
    <Paper as="section" aria-label="Sealed invitation code" className={styles.sealed}>
      <div>
        <p className={styles.label}>Sealed invitation code</p>
        {error ? (
          <p role="alert" className={styles.muted}>{friendlyMessage(error)}</p>
        ) : (
          <p className={styles.code}>{loading ? '…' : code ?? 'Unavailable'}</p>
        )}
      </div>
      <div className={styles.copyRow}>
        <Button variant="ghost" onClick={onCopy} disabled={!code}>Copy</Button>
        <span role="status" className={copy === 'failed' ? `${styles.copyStatus} ${styles.copyStatusFailed}` : styles.copyStatus}>
          {copy === 'copied' && 'Copied'}
          {copy === 'failed' && 'Could not copy. Select the code and copy it by hand.'}
        </span>
      </div>
    </Paper>
  );
}
