import type { ReactNode } from 'react';
import { GameIcon, Paper, type GameIconName } from './ui';
import styles from './notice.module.css';

interface EmptyStateProps {
  title: string;
  /** The drawing beside the words: pick the one for what is missing. */
  icon?: GameIconName;
  children?: ReactNode;
}

/** An empty screen that says what is missing and what to do about it. */
export function EmptyState({ title, icon = 'compass', children }: EmptyStateProps) {
  return (
    <Paper as="div" texture="flat" className={styles.empty}>
      <GameIcon name={icon} size="3.25rem" className={styles.emptyIcon} />
      <div>
        <h3 className={styles.emptyTitle}>{title}</h3>
        {children && <p className={styles.emptyText}>{children}</p>}
      </div>
    </Paper>
  );
}
