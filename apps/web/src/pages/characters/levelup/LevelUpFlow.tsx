// P2-10: one level-up, one screen per step: hit points, new features (and the subclass), an Ability Score
// Improvement where the class table gives one, new spells, then review and apply. Each step is checked with the
// rules engine before the next; the server checks everything again when the level is applied.
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  abilityModifier,
  applyLevelUp,
  computeSheet,
  LEVEL_UP_STEPS,
  levelUpHitPoints,
  levelUpPlan,
  levelUpProblems,
  type Ability,
  type CharacterSheet,
  type LevelUpChoices,
  type LevelUpClass,
  type LevelUpProblem,
} from '@dnd-manager/rules-engine';
import type { SrdSpell } from '@dnd-manager/srd-data/schemas';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Button } from '../../../components/ui';
import { friendlyMessage } from '../../../data/errors';
import {
  applyLevelUp as sendLevelUp,
  LevelUpRejected,
  rollHitDie,
  type AppliedLevel,
  type HitDieRoll,
} from '../../../data/levelup';
import styles from '../create/create.module.css';

const STEPS = [
  { id: 'hitPoints', title: 'Hit points' },
  { id: 'features', title: 'New features' },
  { id: 'improvement', title: 'Ability scores' },
  { id: 'spells', title: 'Spells' },
  { id: 'review', title: 'Review and apply' },
] as const;
const REVIEW = STEPS.length - 1;
const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`);

/** Paragraphs as the SRD prints them. */
const Paragraphs = ({ text }: { text: string }) => (
  <>
    {text.split('\n\n').map((p, i) => (
      <p key={i}>{p}</p>
    ))}
  </>
);

interface Props {
  characterId: string;
  sheet: CharacterSheet;
  cls: LevelUpClass;
  spells: SrdSpell[];
  optionalFeats: boolean;
  /** This level's Hit Point Die roll, if the player already rolled (it survives a refresh). */
  existingRoll: HitDieRoll | null;
  onApplied: (result: AppliedLevel) => void;
}

export function LevelUpFlow({ characterId, sheet, cls, spells, optionalFeats, existingRoll, onApplied }: Props) {
  const id = useId();
  const plan = levelUpPlan(sheet, cls);
  const [step, setStep] = useState(0);
  const [roll, setRoll] = useState<HitDieRoll | null>(existingRoll);
  const [choices, setChoices] = useState<LevelUpChoices>({
    toLevel: plan.toLevel,
    hitPoints: existingRoll ? { method: 'roll', rollId: existingRoll.id } : { method: 'average' },
    spells: { cantrips: [], prepared: [], spellbook: [] },
  });
  const [problems, setProblems] = useState<LevelUpProblem[]>([]);
  const change = (patch: Partial<LevelUpChoices>) => {
    setChoices(c => ({ ...c, ...patch }));
    setProblems([]);
  };

  const rollDie = useMutation({
    mutationFn: () => rollHitDie(characterId),
    onSuccess: r => {
      setRoll(r);
      change({ hitPoints: { method: 'roll', rollId: r.id } });
    },
  });
  const apply = useMutation({
    mutationFn: () => sendLevelUp(characterId, choices),
    onSuccess: onApplied,
    onError: e => {
      if (e instanceof LevelUpRejected && e.problems.length) {
        setProblems(e.problems);
        setStep(LEVEL_UP_STEPS.indexOf(e.problems[0].step));
      }
    },
  });

  if (!plan.available) {
    return (
      <section className={styles.step} aria-label={`Level ${plan.toLevel}`}>
        <h2 className={styles.heading}>{`Level ${plan.toLevel}`}</h2>
        <p role="status" className={styles.alert}>
          Content for this level is not available yet.
        </p>
        <p className={styles.muted}>{`The app has the SRD's ${cls.name} levels 1 to 3 so far.`}</p>
      </section>
    );
  }

  const check = () => levelUpProblems(sheet, choices, cls, spells, { rolledHitDie: roll?.die, optionalFeats });
  function go(to: number) {
    if (to > step) {
      const done = LEVEL_UP_STEPS.slice(0, Math.min(to, LEVEL_UP_STEPS.length));
      const found = check().filter(p => done.includes(p.step));
      if (found.length) {
        setProblems(found);
        setStep(LEVEL_UP_STEPS.indexOf(found[0].step));
        return;
      }
    }
    setProblems([]);
    setStep(to);
  }

  const current = STEPS[step];
  const con = abilityModifier(sheet.abilityScores.con);
  const ready = check().length === 0;
  const preview = ready ? applyLevelUp(sheet, choices, cls, roll?.die) : null;
  const previewSheet = preview ? computeSheet(preview, [], { seconds: 0 }) : null;
  const known = sheet.spells ?? { cantrips: [], prepared: [], spellbook: [] };
  const toggleSpell = (key: keyof LevelUpChoices['spells'], name: string, on: boolean) => {
    const list = on ? [...choices.spells[key], name] : choices.spells[key].filter(n => n !== name);
    const next = { ...choices.spells, [key]: list };
    // a spell taken back out of the spellbook cannot stay prepared
    if (key === 'spellbook' && !on) next.prepared = next.prepared.filter(n => n !== name);
    change({ spells: next });
  };
  const spellGroup = (key: keyof LevelUpChoices['spells'], title: string, size: number, pool: SrdSpell[]) => (
    <fieldset className={styles.checks}>
      <legend className={styles.label}>{`${title}: choose ${size} (${choices.spells[key].length} chosen)`}</legend>
      {pool.map(s => (
        <label key={s.name}>
          <input
            type="checkbox"
            checked={choices.spells[key].includes(s.name)}
            onChange={e => toggleSpell(key, s.name, e.target.checked)}
          />{' '}
          {`${s.name}${s.level ? ` (level ${s.level})` : ''}`}
        </label>
      ))}
    </fieldset>
  );
  const levelled = (s: SrdSpell) =>
    s.classes.includes(cls.name) && s.level >= 1 && s.level <= plan.spells.maxSpellLevel;
  const book = [...(known.spellbook ?? []), ...choices.spells.spellbook];
  const imp = choices.improvement;

  return (
    <div className={styles.wizard}>
      <nav aria-label="Level-up steps">
        <ol className={styles.ribbon}>
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              aria-current={i === step ? 'step' : undefined}
              className={i < step ? styles.done : undefined}
            >
              <span className={styles.stepNumber}>{i + 1}</span>
              <span className={styles.stepTitle}>{s.title}</span>
            </li>
          ))}
        </ol>
      </nav>

      <section aria-labelledby={`${id}-title`} className={styles.step}>
        <h2 id={`${id}-title`} className={styles.heading}>{`Level ${plan.toLevel}: ${current.title}`}</h2>

        {current.id === 'hitPoints' && (
          <>
            <fieldset className={styles.radios}>
              <legend className={styles.label}>{`Hit Point Die ${plan.hitDie}, Constitution ${signed(con)}`}</legend>
              <label>
                <input
                  type="radio"
                  name={`${id}-hp`}
                  checked={choices.hitPoints.method === 'average'}
                  disabled={!!roll}
                  onChange={() => change({ hitPoints: { method: 'average' } })}
                />{' '}
                {`Take the average: ${plan.averageRoll} ${signed(con)} = ${Math.max(1, plan.averageRoll + con)}`}
              </label>
              <label>
                <input
                  type="radio"
                  name={`${id}-hp`}
                  checked={choices.hitPoints.method === 'roll'}
                  onChange={() =>
                    roll
                      ? change({ hitPoints: { method: 'roll', rollId: roll.id } })
                      : change({ hitPoints: { method: 'roll', rollId: '' } })
                  }
                />{' '}
                Roll the die
              </label>
            </fieldset>
            {choices.hitPoints.method === 'roll' &&
              (roll ? (
                <p>{`You rolled ${roll.die} on the ${plan.hitDie}: ${roll.die} ${signed(con)} = ${Math.max(1, roll.die + con)} hit points. The roll is in the roll log and cannot be rolled again.`}</p>
              ) : (
                <Button onClick={() => rollDie.mutate()} disabled={rollDie.isPending}>
                  {rollDie.isPending ? 'Rolling…' : `Roll the ${plan.hitDie}`}
                </Button>
              ))}
            {rollDie.isError && (
              <p role="alert" className={styles.alert}>
                {friendlyMessage(rollDie.error)}
              </p>
            )}
          </>
        )}

        {current.id === 'features' && (
          <>
            {plan.features.length === 0 && !plan.subclassChoice && (
              <p className={styles.muted}>No new class features.</p>
            )}
            {plan.features.map(f => (
              <details key={f.name} className={styles.trait} open={plan.features.length <= 2}>
                <summary>{f.name}</summary>
                <Paragraphs text={f.description} />
              </details>
            ))}
            {plan.subclassChoice && (
              <fieldset className={styles.radios}>
                <legend className={styles.label}>{`Your ${cls.name} subclass`}</legend>
                {plan.subclassChoice.map(s => (
                  <label key={s.id}>
                    <input
                      type="radio"
                      name={`${id}-subclass`}
                      checked={choices.subclass === s.id}
                      onChange={() => change({ subclass: s.id })}
                    />{' '}
                    {s.name}
                  </label>
                ))}
              </fieldset>
            )}
            {plan.subclassChoice
              ?.find(s => s.id === choices.subclass)
              ?.features.filter(f => f.level === plan.toLevel)
              .map(f => (
                <details key={f.name} className={styles.trait}>
                  <summary>{f.name}</summary>
                  <Paragraphs text={f.description} />
                </details>
              ))}
          </>
        )}

        {current.id === 'improvement' &&
          (plan.improvement ? (
            <>
              <fieldset className={styles.radios}>
                <legend className={styles.label}>Ability Score Improvement (no score above 20)</legend>
                <label>
                  <input
                    type="radio"
                    name={`${id}-imp`}
                    checked={!!imp && 'plus2' in imp}
                    onChange={() => change({ improvement: { plus2: 'str' } })}
                  />{' '}
                  +2 to one score
                </label>
                <label>
                  <input
                    type="radio"
                    name={`${id}-imp`}
                    checked={!!imp && 'plus1' in imp}
                    onChange={() => change({ improvement: { plus1: ['str', 'dex'] } })}
                  />{' '}
                  +1 to two scores
                </label>
                {optionalFeats && (
                  <label>
                    <input
                      type="radio"
                      name={`${id}-imp`}
                      checked={!!imp && 'feat' in imp}
                      onChange={() => change({ improvement: { feat: '' } })}
                    />{' '}
                    A feat (feats arrive later)
                  </label>
                )}
              </fieldset>
              {imp && 'plus2' in imp && (
                <AbilityPick
                  id={`${id}-p2`}
                  label="+2 to"
                  value={imp.plus2}
                  onChange={a => change({ improvement: { plus2: a } })}
                />
              )}
              {imp && 'plus1' in imp && (
                <div className={styles.inline}>
                  {[0, 1].map(n => (
                    <AbilityPick
                      key={n}
                      id={`${id}-p1-${n}`}
                      label="+1 to"
                      value={imp.plus1[n]}
                      onChange={a =>
                        change({ improvement: { plus1: n === 0 ? [a, imp.plus1[1]] : [imp.plus1[0], a] } })
                      }
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className={styles.muted}>{`Level ${plan.toLevel} gives no Ability Score Improvement.`}</p>
          ))}

        {current.id === 'spells' &&
          (plan.spells.cantrips + plan.spells.prepared + plan.spells.spellbook === 0 ? (
            <p className={styles.muted}>{`No new spells at level ${plan.toLevel}.`}</p>
          ) : (
            <>
              {plan.spells.cantrips > 0 &&
                spellGroup(
                  'cantrips',
                  'New cantrips',
                  plan.spells.cantrips,
                  spells.filter(s => s.level === 0 && s.classes.includes(cls.name) && !known.cantrips.includes(s.name)),
                )}
              {plan.spells.spellbook > 0 &&
                spellGroup(
                  'spellbook',
                  'Add to your spellbook',
                  plan.spells.spellbook,
                  spells.filter(s => levelled(s) && !(known.spellbook ?? []).includes(s.name)),
                )}
              {plan.spells.prepared > 0 &&
                spellGroup(
                  'prepared',
                  plan.spells.spellbook ? 'Prepare from your spellbook' : 'Newly prepared spells',
                  plan.spells.prepared,
                  spells.filter(
                    s =>
                      levelled(s) &&
                      !known.prepared.includes(s.name) &&
                      (!plan.spells.spellbook || book.includes(s.name)),
                  ),
                )}
            </>
          ))}

        {current.id === 'review' &&
          (preview && previewSheet ? (
            <section className={styles.review} aria-label="After this level">
              <dl className={styles.stats}>
                <div>
                  <dt>Level</dt>
                  <dd>{previewSheet.level}</dd>
                </div>
                <div>
                  <dt>Hit points</dt>
                  <dd>{`${previewSheet.hp.max} (+${levelUpHitPoints(sheet, choices, cls, roll?.die)})`}</dd>
                </div>
                <div>
                  <dt>Proficiency</dt>
                  <dd>{signed(previewSheet.proficiencyBonus)}</dd>
                </div>
                <div>
                  <dt>Hit Point Dice</dt>
                  <dd>{`${preview.hitDice.total}${plan.hitDie}`}</dd>
                </div>
              </dl>
              <p>
                <span className={styles.label}>New features </span>
                {[
                  ...plan.features,
                  ...(plan.subclassChoice
                    ?.find(s => s.id === choices.subclass)
                    ?.features.filter(f => f.level === plan.toLevel) ?? []),
                ]
                  .map(f => f.name)
                  .join(', ') || 'none'}
              </p>
              {plan.slots.some(n => n > 0) && (
                <p>
                  <span className={styles.label}>Spell slots </span>
                  {plan.slots
                    .map((n, i) => (n ? `${n} of level ${i + 1}` : ''))
                    .filter(Boolean)
                    .join(', ')}
                </p>
              )}
              {preview.spells && (
                <p>
                  <span className={styles.label}>Spells </span>
                  {`Cantrips: ${preview.spells.cantrips.join(', ') || 'none'}. Prepared: ${preview.spells.prepared.join(', ') || 'none'}.`}
                  {preview.spells.spellbook ? ` Spellbook: ${preview.spells.spellbook.join(', ')}.` : ''}
                </p>
              )}
              {imp && !('feat' in imp) && (
                <p>
                  <span className={styles.label}>Ability scores </span>
                  {ABILITY_KEYS.filter(a => preview.abilityScores[a] !== sheet.abilityScores[a])
                    .map(a => `${ABILITY_LABELS[a].label} ${sheet.abilityScores[a]} → ${preview.abilityScores[a]}`)
                    .join(', ')}
                </p>
              )}
            </section>
          ) : (
            <p className={styles.muted}>Some choices still need attention.</p>
          ))}

        {problems.filter(p => p.step === current.id || current.id === 'review').length > 0 && (
          <ul role="alert" className={styles.problems}>
            {problems
              .filter(p => p.step === current.id || current.id === 'review')
              .map(p => (
                <li key={p.message}>{p.message}</li>
              ))}
          </ul>
        )}
      </section>

      <div className={styles.nav}>
        <Button variant="ghost" disabled={step === 0} onClick={() => go(step - 1)}>
          Back
        </Button>
        {step < REVIEW ? (
          <Button onClick={() => go(step + 1)}>Next</Button>
        ) : (
          <Button onClick={() => apply.mutate()} disabled={!ready || apply.isPending}>
            {apply.isPending ? 'Applying…' : `Apply level ${plan.toLevel}`}
          </Button>
        )}
      </div>
      {apply.isError && !(apply.error instanceof LevelUpRejected && apply.error.problems.length) && (
        <p role="alert" className={styles.alert}>
          {friendlyMessage(apply.error)}
        </p>
      )}
    </div>
  );
}

function AbilityPick({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: Ability;
  onChange: (a: Ability) => void;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select id={id} value={value} onChange={e => onChange(e.target.value as Ability)} className={styles.select}>
        {ABILITY_KEYS.map(a => (
          <option key={a} value={a}>
            {ABILITY_LABELS[a].label}
          </option>
        ))}
      </select>
    </div>
  );
}
