// P4-6: what a player is told: the NPC, how it feels about them, the line, and the response options. The same scroll is
// the DM's preview ("What Brannoc sees"), without the buttons doing anything. The line is plain text.
import { Dices } from 'lucide-react';
import type { ShownOption } from '../../data/dialogue';
import type { SpokenLine } from '../../hooks/useDialogue';
import { Button, ICON_PROPS, iconClasses, Paper } from '../ui';
import { checkName, DISPOSITION_WORDS } from './checkWords';
import styles from './Dialogue.module.css';

export interface SpeechScrollProps {
  line: Pick<SpokenLine, 'speaker' | 'disposition' | 'text'> & { options: readonly ShownOption[] };
  /** Called with the option chosen; leave it out for a preview. */
  onChoose?: (index: number) => void;
  /** The option already chosen, if any (its button is marked and the others rest). */
  chosen?: number | null;
  /** The chance shown on a check option, by request (only when the DM shows the odds). */
  chanceFor?: (option: ShownOption) => string | null;
  onClose?: () => void;
  label?: string;
}

export function SpeechScroll({ line, onChoose, chosen = null, chanceFor, onClose, label }: SpeechScrollProps) {
  return (
    <Paper as="section" texture="full" aria-label={label ?? `${line.speaker} speaks`} className={styles.scroll}>
      <div className={styles.speakerRow}>
        <h2 className={styles.speaker}>{line.speaker}</h2>
        <span className={styles.disposition}>{DISPOSITION_WORDS[line.disposition]}</span>
      </div>
      <p className={styles.line}>{`“${line.text}”`}</p>
      {line.options.length > 0 && (
        <ul className={styles.options} aria-label="Your answer">
          {line.options.map((o, i) => {
            const isCheck = o.kind === 'check' && o.check;
            const chance = isCheck ? chanceFor?.(o) : null;
            return (
              <li key={i}>
                <button
                  type="button"
                  className={[styles.option, isCheck ? styles.checkOption : '', chosen === i ? styles.chosen : '']
                    .filter(Boolean)
                    .join(' ')}
                  disabled={!onChoose || (chosen !== null && o.kind !== 'check')}
                  aria-pressed={chosen === i}
                  onClick={() => onChoose?.(i)}
                >
                  <span className={iconClasses.host}>
                    {isCheck && <Dices {...ICON_PROPS} className={iconClasses.icon} />}
                    {o.label}
                    {isCheck && o.check && (
                      <span className={styles.optionNote}>
                        {` · ${checkName(o.check.skill)}${o.check.dc !== undefined ? ` DC ${o.check.dc}` : ''}`}
                      </span>
                    )}
                  </span>
                  {chance && <span>{chance}</span>}
                  {o.kind === 'end' && <span className={styles.optionNote}>ends the talk</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {onClose && (
        <div className={styles.foot}>
          <Button variant="ghost" onClick={onClose}>
            Put it away
          </Button>
        </div>
      )}
    </Paper>
  );
}
