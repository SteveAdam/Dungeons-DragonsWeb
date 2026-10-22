// P1-6: the odds popup. Every number comes from the rules engine (resolveRollMode, successChanceWithDice,
// critChance, formatPercent and friends); this file only lays them out. The dice are rolled by the server
// through onRoll. For a character's roll the server's preview (P2-2) is passed in as check.server, and the popup
// shows exactly that mode and chance: what the player sees is what the server rolls with.
import {
  critChance,
  formatPercent,
  formatPoints,
  resolveRollMode,
  settleWithBonusDice,
  successChanceWithDice,
  type BonusDie,
  type RollMode,
  type RollModeReason,
} from '@dnd-manager/rules-engine';
import { Dices, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { friendlyMessage } from '../../data/errors';
import type { RollRow } from '../../data/rolls';
import { Button, ICON_PROPS, iconClasses, Paper } from '../ui';
import styles from './OddsPopup.module.css';

export interface OddsBonusDie extends BonusDie {
  /** The source, e.g. "Bless" or "Bane". */
  label: string;
}

export interface OddsCheck {
  /** What the character is doing, e.g. "Search the undergrowth". */
  label: string;
  kind: 'check' | 'save' | 'attack';
  /** The skill, ability or weapon, e.g. "Perception" or "Longsword", for the subtitle. */
  skill?: string;
  bonus: number;
  bonusBreakdown?: { label: string; value: number }[];
  bonusDice?: OddsBonusDie[];
  /** The DC for checks and saves, the armour class for attacks. */
  target: number;
  /** 'DC' or 'AC'; defaults to AC for attacks and DC otherwise. */
  targetLabel?: string;
  /** Reasons, e.g. "you watch from high ground". */
  advantage?: string[];
  disadvantage?: string[];
  /** The server's own mode and odds (a character's roll). When set, advantage and disadvantage are not used. */
  server?: { mode: RollMode; reasons: RollModeReason[]; chance: number; critChance: number };
}

export interface OddsPopupProps {
  open: boolean;
  onClose: () => void;
  check: OddsCheck;
  /** Rolls on the server with the resolved mode and returns the logged roll. */
  onRoll: (mode: RollMode) => Promise<RollRow>;
  /** On wide screens the card sits next to this element; on phones the popup is a bottom sheet. */
  anchor?: HTMLElement | null;
  /** Shown while the odds are being fetched; the Roll button waits. */
  waiting?: string;
  /** Why this roll cannot be made (shown as an alert; the Roll button is disabled). */
  problem?: string;
}

const KIND_WORD = { check: 'check', save: 'saving throw', attack: 'attack' } as const;
const MODE_HELP: Record<RollMode, string> = {
  normal: 'Roll one d20.',
  advantage: 'Roll two d20 and keep the higher.',
  disadvantage: 'Roll two d20 and keep the lower.',
};
const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`);
const diceText = (d: BonusDie) => `${d.sign < 0 ? '-' : '+'}${d.count}d${d.sides}`;

/** Where the card goes on a wide screen: under the anchor, or above it when the anchor is low on the screen. */
function placement(anchor: HTMLElement | null | undefined): Record<string, string> | undefined {
  if (!anchor) return undefined;
  const r = anchor.getBoundingClientRect();
  const left = `${Math.max(16, Math.min(r.left, window.innerWidth - 16 - 352))}px`;
  return r.bottom > window.innerHeight * 0.55
    ? { '--odds-left': left, '--odds-bottom': `${window.innerHeight - r.top + 8}px` }
    : { '--odds-left': left, '--odds-top': `${r.bottom + 8}px` };
}

export function OddsPopup(props: OddsPopupProps) {
  // mounting only while open means every opening starts fresh: no old roll, no old error
  return props.open ? <OddsDialog {...props} /> : null;
}

function OddsDialog({ onClose, check, onRoll, anchor, waiting, problem }: OddsPopupProps) {
  const id = useId();
  const dialog = useRef<HTMLElement>(null);
  const rollButton = useRef<HTMLButtonElement>(null);
  const [place] = useState(() => placement(anchor));
  const [rolling, setRolling] = useState(false);
  const [roll, setRoll] = useState<RollRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  // focus moves to the Roll button, and back to where it was when the popup closes
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    rollButton.current?.focus();
    return () => before?.focus?.();
  }, []);

  const bonusDice = check.bonusDice ?? [];
  const { mode, reasons } =
    check.server ??
    resolveRollMode({
      advantage: check.advantage ?? [],
      disadvantage: check.disadvantage ?? [],
    });
  const base = { kind: check.kind, bonus: check.bonus, target: check.target };
  const chance = check.server?.chance ?? successChanceWithDice({ ...base, mode, bonusDice }).final;
  const withoutMode = successChanceWithDice({ ...base, mode: 'normal', bonusDice });
  const targetLabel = check.targetLabel ?? (check.kind === 'attack' ? 'AC' : 'DC');
  const subtitle = [
    `${check.skill ? `${check.skill} ` : ''}${KIND_WORD[check.kind]}`,
    `${targetLabel} ${check.target}`,
    `your bonus ${signed(check.bonus)}`,
  ].join(', ');
  const diceCount = mode === 'normal' ? 1 : 2;

  async function doRoll() {
    setRolling(true);
    setError(null);
    try {
      setRoll(await onRoll(mode));
    } catch (e) {
      setError(friendlyMessage(e));
    } finally {
      setRolling(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !dialog.current) return;
    // keep Tab inside the popup
    const focusable = [
      ...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select'),
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <Paper
        as="div"
        ref={dialog}
        texture="full"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-subtitle`}
        className={`${styles.card} ${place ? styles.anchored : ''}`}
        style={place}
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {/* the Roll button comes first, so it is the first thing reached by keyboard */}
        <div className={styles.rollRow}>
          <div className={styles.dice} aria-hidden="true">
            {Array.from({ length: roll ? roll.dice.length : diceCount }, (_, i) => {
              const value = roll?.dice[i];
              const kept = roll ? i === roll.dice.indexOf(roll.kept) : true;
              return (
                <span
                  key={i}
                  className={[styles.d20, kept ? '' : styles.faded, rolling ? styles.tumbling : ''].join(' ')}
                >
                  {value ?? '?'}
                </span>
              );
            })}
          </div>
          <Button
            ref={rollButton}
            className={iconClasses.host}
            disabled={rolling || !!waiting || !!problem}
            onClick={doRoll}
          >
            <Dices {...ICON_PROPS} className={iconClasses.icon} />
            {rolling ? 'Rolling…' : roll ? 'Roll again' : 'Roll'}
          </Button>
        </div>

        <header className={styles.header}>
          <h2 id={`${id}-title`} className={styles.title}>
            {check.label}
          </h2>
          <Button variant="ghost" aria-label="Close the odds" className={styles.close} onClick={onClose}>
            <X {...ICON_PROPS} />
          </Button>
        </header>
        <p id={`${id}-subtitle`} className={styles.subtitle}>
          {subtitle}
        </p>
        {check.bonusBreakdown && check.bonusBreakdown.length > 0 && (
          <p className={styles.breakdown}>
            {check.bonusBreakdown.map(b => `${b.label} ${signed(b.value)}`).join(' · ')}
          </p>
        )}

        <div className={styles.chanceRow}>
          <p className={styles.chance}>
            <span className={styles.percent}>{waiting ? '…' : formatPercent(chance)}</span>
            <span className={styles.chanceLabel}>chance to succeed</span>
          </p>
          <div className={styles.why}>
            {mode !== 'normal' && (
              <p className={styles.line}>{`${formatPercent(withoutMode.final)} without ${mode}`}</p>
            )}
            <p className={styles.line}>{MODE_HELP[mode]}</p>
          </div>
        </div>
        <div className={styles.bar} aria-hidden="true">
          <div className={styles.fill} style={{ width: `${waiting ? 0 : chance * 100}%` }} />
        </div>

        {reasons.length > 0 && (
          <ul className={styles.reasons} aria-label="Advantage and disadvantage">
            {reasons.map(r => {
              const text = `${r.kind === 'advantage' ? 'Advantage' : 'Disadvantage'}: ${r.text}`;
              return (
                <li key={`${r.kind}:${r.text}`} className={r.kind === 'advantage' ? styles.good : styles.bad}>
                  {r.cancelled ? (
                    <>
                      <s>{text}</s> <span className={styles.cancelled}>cancelled</span>
                    </>
                  ) : (
                    text
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {bonusDice.length > 0 && (
          <ul className={styles.reasons} aria-label="Bonus dice">
            {bonusDice.map(d => {
              const alone = successChanceWithDice({ ...base, mode, bonusDice: [d] });
              return (
                <li
                  key={`${d.label}:${diceText(d)}`}
                >{`${d.label} (${diceText(d)}): about ${formatPoints(alone.delta)}`}</li>
              );
            })}
          </ul>
        )}

        {check.kind === 'attack' && (
          <p
            className={styles.line}
          >{`Critical hit chance: ${formatPercent(check.server?.critChance ?? critChance(mode))}`}</p>
        )}

        <div role="status" aria-live="polite" className={styles.result}>
          {waiting && !roll && <p className={styles.line}>{waiting}</p>}
          {roll && <RollResult roll={roll} check={check} targetLabel={targetLabel} />}
        </div>
        {(error ?? problem) && (
          <p role="alert" className={styles.error}>
            {error ?? problem}
          </p>
        )}
      </Paper>
    </div>
  );
}

function RollResult({ roll, check, targetLabel }: { roll: RollRow; check: OddsCheck; targetLabel: string }) {
  const bonusDice = check.bonusDice ?? [];
  const sum = `${roll.kept} ${roll.bonus < 0 ? '-' : '+'} ${Math.abs(roll.bonus)}`;
  const target = roll.target === null ? '' : ` against ${targetLabel} ${roll.target}`;
  let verdict: string;
  if (roll.crit) verdict = 'Critical hit';
  else if (roll.fumble) verdict = 'Natural 1: a miss';
  else if (bonusDice.length === 0) verdict = roll.success === null ? '' : roll.success ? 'Success' : 'Failure';
  else {
    // the server rolls only the d20, so the bonus dice may still decide it
    const names = bonusDice.map(d => `${d.label} ${diceText(d)}`).join(' and ');
    const settled = settleWithBonusDice({
      ...check,
      kept: roll.kept,
      total: roll.total,
      target: roll.target,
      bonusDice,
    });
    verdict =
      settled === 'success'
        ? `Success, whatever ${names} adds`
        : settled === 'failure'
          ? `Failure, whatever ${names} adds`
          : settled === 'depends'
            ? `Roll ${names} and add it: that decides it`
            : '';
  }
  const outcome = roll.crit || roll.success ? styles.success : roll.success === false ? styles.failure : '';
  return (
    <>
      <p className={styles.total}>{`Total ${roll.total} (${sum})${target}`}</p>
      {verdict && <p className={`${styles.verdict} ${outcome}`}>{verdict}</p>}
    </>
  );
}
