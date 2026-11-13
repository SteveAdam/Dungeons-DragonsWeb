import type { ReactNode } from 'react';
import compass from '../../assets/art/compass-rose.png';
import quill from '../../assets/stock/quill-inkwell.svg';
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
      {/* props at the desk's edges: decoration only, behind the page, and gone under "Reduce texture" */}
      <div className={styles.props} aria-hidden="true">
        <span className={`${styles.pennant} ${styles.pennantLeft}`} />
        <span className={`${styles.pennant} ${styles.pennantLeftSmall}`} />
        <span className={`${styles.pennant} ${styles.pennantRight}`} />
        <span className={`${styles.pennant} ${styles.pennantRightSmall}`} />
        <span className={styles.candleGlow} />
        <img className={styles.compass} src={compass} alt="" />
        <span className={styles.candle} />
        <svg className={styles.flame} viewBox="0 0 24 40">
          <path
            className={styles.flameOuter}
            d="M12 2c4 4 6.500 7 6.500 11a6.500 6.500 0 0 1-13 0c0-2.600 1.300-4.200 2.600-5.500.3 2.600 1.300 4 2.600 4 0-4 .1-7 1.300-9.500z"
          />
          <path
            className={styles.flameInner}
            d="M12 9c1.800 2 3 3.500 3 5.500a3 3 0 0 1-6 0c0-1.200.6-2 1.200-2.600.2 1.200.6 1.800 1.200 1.800 0-1.800 0-3.400.6-4.700z"
          />
        </svg>
        <span className={`${styles.ember} ${styles.ember1}`} />
        <span className={`${styles.ember} ${styles.ember2}`} />
        <span className={`${styles.ember} ${styles.ember3}`} />
        <img className={styles.quill} src={quill} alt="" />
      </div>
      <header className={styles.bar}>
        <div className={styles.brand}>{brand}</div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      <div className={styles.content}>{children}</div>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </div>
  );
}
