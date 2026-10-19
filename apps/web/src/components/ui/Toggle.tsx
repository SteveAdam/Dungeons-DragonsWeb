import styles from './ui.module.css';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

/** An on/off switch. A real checkbox underneath, so keyboard and screen readers just work. */
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} className={styles.toggleInput} />
      <span aria-hidden="true" className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
      <span>{label}</span>
    </label>
  );
}
