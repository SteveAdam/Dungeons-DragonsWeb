import type { ReactNode } from 'react';
import styles from './LiveHeader.module.css';

/** The waiting state: three runes that light in turn inside a slowly turning circle, with the words beneath. */
export function LoadingRunes({ children }: { children: ReactNode }) {
  return (
    <p role="status" className={styles.loading}>
      <svg aria-hidden="true" viewBox="0 0 60 60" className={styles.runes}>
        <g className={styles.runeCircle}>
          <circle cx="30" cy="30" r="26" strokeDasharray="3 3" />
          <circle cx="30" cy="30" r="21" />
        </g>
        <path className={styles.rune1} d="M19 22v16M19 22l6 5-6 5" />
        <path className={styles.rune2} d="M30 20v20M25 25l5-5 5 5M26 34h8" />
        <path className={styles.rune3} d="M41 22v16M41 24l-5 6 5 6" />
      </svg>
      {children}
    </p>
  );
}
