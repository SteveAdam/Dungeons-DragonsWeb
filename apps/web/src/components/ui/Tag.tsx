import type { ReactNode } from 'react';
import styles from './Tag.module.css';

/** A small inked label. The text carries the meaning; the colour never does on its own. */
export function Tag({ children }: { children: ReactNode }) {
  return <span className={styles.tag}>{children}</span>;
}
