import styles from './DmBanner.module.css';

/**
 * DM mode, always visible: a wax-red rule across the very top of the window and a dashed "DM mode" badge
 * (placed in the header). Render it only while DM mode is on.
 */
export function DmBanner() {
  return (
    <>
      <span aria-hidden="true" className={styles.rule} />
      <span
        role="note"
        aria-label="DM mode is on"
        title="Hidden maps, pins and notes are visible to you"
        className={styles.badge}
      >
        DM mode
      </span>
    </>
  );
}
