import styles from './Toggle.module.css';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

/**
 * An on/off switch: a real checkbox underneath, so keyboard and screen readers just work.
 * The thumb position and the On/Off word show the state, never the colour alone.
 */
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label className={styles.toggle}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className={styles.input}
      />
      <span aria-hidden="true" className={styles.track}>
        <span className={styles.thumb} />
      </span>
      <span>{label}</span>
      <span aria-hidden="true" className={styles.state}>
        {checked ? 'On' : 'Off'}
      </span>
    </label>
  );
}
