import styles from './ui.module.css';

/** The strip across the top that says hidden things are showing. */
export function DmBanner() {
  return (
    <div role="note" className={styles.dmBanner}>
      <strong>DM mode</strong> <span>Hidden maps, pins and notes are visible to you.</span>
    </div>
  );
}
