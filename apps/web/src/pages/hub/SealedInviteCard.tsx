import { useState } from 'react';
import { Button, Paper } from '../../components/ui';
import { friendlyMessage } from '../../data/errors';
import styles from './hub.module.css';

interface Props {
  code: string | null;
  loading: boolean;
  error: unknown;
}

/** The invitation code under a wax seal, kept from players. The parent renders it only for a DM in DM mode. */
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
    <Paper as="section" variant="torn" aria-label="Sealed invitation code" className={styles.sealed}>
      <span aria-hidden="true" className={styles.seal}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3c2 3.2 5 5.4 5 9.3A5 5 0 0 1 12 17.5a5 5 0 0 1-5-5.2c0-2 1.2-3.4 2.3-4.6.3 1.6 1 2.5 2.1 2.9C11 8.4 11 5.6 12 3Z" />
        </svg>
      </span>
      <div className={styles.sealedBody}>
        <p className={styles.label}>Sealed invitation code</p>
        {error ? (
          <p role="alert" className={styles.muted}>
            {friendlyMessage(error)}
          </p>
        ) : (
          <p className={styles.code}>{loading ? '…' : (code ?? 'Unavailable')}</p>
        )}
        <div className={styles.copyRow}>
          <Button variant="ghost" onClick={onCopy} disabled={!code}>
            Copy
          </Button>
          <span
            role="status"
            className={copy === 'failed' ? `${styles.copyStatus} ${styles.copyStatusFailed}` : styles.copyStatus}
          >
            {copy === 'copied' && 'Copied'}
            {copy === 'failed' && 'Could not copy. Select the code and copy it by hand.'}
          </span>
        </div>
      </div>
    </Paper>
  );
}
