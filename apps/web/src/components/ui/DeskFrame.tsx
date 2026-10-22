import type { ReactNode } from 'react';
import styles from './DeskFrame.module.css';

interface DeskFrameProps {
  /** Left side of the iron header bar (usually the app name). */
  brand: ReactNode;
  /** Right side of the bar (navigation, settings, sign out). */
  actions?: ReactNode;
  /** Under every page (the SRD attribution). */
  footer?: ReactNode;
  children: ReactNode;
}

/** The dark desk the parchment sits on: an iron header bar with a gold bottom rule, then the page. */
export function DeskFrame({ brand, actions, footer, children }: DeskFrameProps) {
  return (
    <div className={styles.desk}>
      <header className={styles.bar}>
        <div className={styles.brand}>{brand}</div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      <div className={styles.content}>{children}</div>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </div>
  );
}
