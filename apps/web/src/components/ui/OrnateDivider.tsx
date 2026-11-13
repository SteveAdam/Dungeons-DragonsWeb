import styles from './OrnateDivider.module.css';

/** A rule with a gem and two small diamonds in the middle, for under a page's main title. Decoration only. */
export function OrnateDivider({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 572 26"
      preserveAspectRatio="xMidYMid meet"
      className={[styles.divider, className ?? ''].filter(Boolean).join(' ')}
    >
      <path d="M10 13h236M326 13h236" />
      <path className={styles.gem} d="M286 3l10 10-10 10-10-10z" />
      <path d="M258 13l8-6 8 6-8 6zM298 13l8-6 8 6-8 6z" />
      <circle className={styles.dot} cx="6" cy="13" r="3" />
      <circle className={styles.dot} cx="566" cy="13" r="3" />
    </svg>
  );
}
