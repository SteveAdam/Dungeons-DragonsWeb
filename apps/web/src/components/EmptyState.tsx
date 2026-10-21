import type { ReactNode } from 'react';
import { Paper } from './ui';
import styles from './notice.module.css';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Paper as="div" texture="flat" className={styles.empty}>
      <h3 className={styles.emptyTitle}>{title}</h3>
      {children && <p className={styles.emptyText}>{children}</p>}
    </Paper>
  );
}
