// P4-3: the DM's fog tools: a reveal brush and a hide brush with a size, reveal or hide everything, undo, simplify, and
// in per-group mode which group's fog is being drawn. Keyboard: R reveal, H hide, [ and ] size, Ctrl+Z undo, Esc stop.
import { Eraser, EyeOff, Paintbrush, Undo2, Wand2 } from 'lucide-react';
import { useId } from 'react';
import { Button, ICON_PROPS, iconClasses } from '../../../components/ui';
import { SIMPLIFY_AFTER } from '../../../lib/fog';
import styles from './Fog.module.css';

export const BRUSH_MIN = 5;
export const BRUSH_MAX = 400;

export const COSMETIC_NOTE =
  'Fog is cosmetic: it hides parts of the map on screen, but a determined player could still open the map image itself. Keep real secrets off the map.';

export interface FogToolbarProps {
  enabled: boolean;
  perGroup: boolean;
  brush: 'reveal' | 'hide' | null;
  radius: number;
  strokeCount: number;
  canUndo: boolean;
  groups: readonly { id: string; name: string }[];
  groupId: string | null;
  busy: boolean;
  onBrush: (mode: 'reveal' | 'hide' | null) => void;
  onRadius: (radius: number) => void;
  onRevealAll: () => void;
  onHideAll: () => void;
  onUndo: () => void;
  onSimplify: () => void;
  onGroup: (groupId: string) => void;
  onTurnOn: () => void;
}

export function FogToolbar(props: FogToolbarProps) {
  const id = useId();
  const { enabled, perGroup, brush, radius, strokeCount, canUndo, groups, groupId, busy } = props;
  if (!enabled) {
    return (
      <section className={styles.bar} aria-label="Fog of war">
        <p className={styles.off}>Fog of war is off for this map: players see all of it.</p>
        <div className={styles.row}>
          <Button disabled={busy} onClick={props.onTurnOn}>
            Turn on fog (hides the whole map from players)
          </Button>
        </div>
        <p className={styles.help}>{COSMETIC_NOTE}</p>
      </section>
    );
  }
  const noGroup = perGroup && !groupId;
  return (
    <section className={styles.bar} aria-label="Fog of war">
      {perGroup && (
        <div className={styles.row}>
          <label htmlFor={`${id}-group`} className={styles.label}>
            Drawing the fog of
          </label>
          <select
            id={`${id}-group`}
            className={styles.select}
            value={groupId ?? ''}
            onChange={e => props.onGroup(e.target.value)}
          >
            {groups.length === 0 && <option value="">No groups yet</option>}
            {groups.map(g => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className={styles.row} role="toolbar" aria-label="Fog brushes">
        <Button
          variant={brush === 'reveal' ? 'primary' : 'ghost'}
          aria-pressed={brush === 'reveal'}
          aria-keyshortcuts="R"
          className={iconClasses.host}
          disabled={noGroup}
          onClick={() => props.onBrush(brush === 'reveal' ? null : 'reveal')}
        >
          <Paintbrush {...ICON_PROPS} className={iconClasses.icon} />
          Reveal brush
        </Button>
        <Button
          variant={brush === 'hide' ? 'primary' : 'ghost'}
          aria-pressed={brush === 'hide'}
          aria-keyshortcuts="H"
          className={iconClasses.host}
          disabled={noGroup}
          onClick={() => props.onBrush(brush === 'hide' ? null : 'hide')}
        >
          <Eraser {...ICON_PROPS} className={iconClasses.icon} />
          Hide brush
        </Button>
        <span className={styles.size}>
          <label htmlFor={`${id}-size`}>{`Size ${radius}`}</label>
          <input
            id={`${id}-size`}
            type="range"
            min={BRUSH_MIN}
            max={BRUSH_MAX}
            step={1}
            value={radius}
            aria-keyshortcuts="[ ]"
            aria-valuetext={`${radius} pixels on the map`}
            onChange={e => props.onRadius(Number(e.target.value))}
          />
        </span>
        <Button
          variant="ghost"
          className={iconClasses.host}
          aria-keyshortcuts="Control+Z"
          disabled={!canUndo || busy}
          onClick={props.onUndo}
        >
          <Undo2 {...ICON_PROPS} className={iconClasses.icon} />
          Undo
        </Button>
      </div>
      <div className={styles.row}>
        <Button variant="ghost" disabled={busy || noGroup} onClick={props.onRevealAll}>
          Reveal all
        </Button>
        <Button variant="ghost" className={iconClasses.host} disabled={busy || noGroup} onClick={props.onHideAll}>
          <EyeOff {...ICON_PROPS} className={iconClasses.icon} />
          Hide all
        </Button>
        {strokeCount > SIMPLIFY_AFTER && (
          <Button variant="ghost" className={iconClasses.host} disabled={busy} onClick={props.onSimplify}>
            <Wand2 {...ICON_PROPS} className={iconClasses.icon} />
            {`Simplify fog (${strokeCount} strokes)`}
          </Button>
        )}
      </div>
      {noGroup && (
        <p className={styles.help}>Make a party group first: in per-group mode each group has its own fog.</p>
      )}
      <p className={styles.keys}>
        Keys: R reveal brush, H hide brush, [ and ] brush size, Ctrl+Z undo, Esc put the brush down.
      </p>
      <p className={styles.help}>{COSMETIC_NOTE}</p>
    </section>
  );
}
