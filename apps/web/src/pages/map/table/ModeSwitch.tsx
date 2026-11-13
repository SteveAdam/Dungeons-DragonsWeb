import { Button } from '../../../components/ui';
import type { MapMode } from '../../../state/mapMode';
import styles from './ModeSwitch.module.css';

/** Prep (editing tools) or Table (running the game): the DM's switch, remembered for the campaign. */
export function ModeSwitch({ mode, onChange }: { mode: MapMode; onChange: (mode: MapMode) => void }) {
  return (
    <div role="group" aria-label="Map mode" className={styles.switch}>
      <Button
        variant={mode === 'prep' ? 'primary' : 'ghost'}
        aria-pressed={mode === 'prep'}
        onClick={() => onChange('prep')}
      >
        Prep
      </Button>
      <Button
        variant={mode === 'table' ? 'primary' : 'ghost'}
        aria-pressed={mode === 'table'}
        onClick={() => onChange('table')}
      >
        Table
      </Button>
    </div>
  );
}
