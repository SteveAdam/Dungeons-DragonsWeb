import { toDataError } from '../data/errors';
import { Button, Paper } from './ui';
import styles from './notice.module.css';

/** A friendly error message, with a retry button when trying again could help. */
export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { kind, message } = toDataError(error);
  const canRetry = !!onRetry && (kind === 'network' || kind === 'unknown');
  return (
    <Paper as="div" role="alert" className={styles.notice}>
      <p className={styles.message}>{message}</p>
      {canRetry && <Button variant="ghost" onClick={onRetry}>Try again</Button>}
    </Paper>
  );
}
