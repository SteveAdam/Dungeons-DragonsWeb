// P2-9: the wizard's step screens. Each shows the SRD's own text for what is being chosen and edits the draft's
// choices; the rules (what is allowed, what it adds up to) come from the rules engine.
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  abilityModifier,
  abilityRollTotals,
  ALIGNMENTS,
  finalScores,
  POINT_BUY_BUDGET,
  pointBuyCost,
  SKILLS,
  spellAllowance,
  STANDARD_ARRAY,
  type Ability,
  type AbilityMethod,
  type CreationChoices,
  type SkillKey,
} from '@dnd-manager/rules-engine';
import { useId } from 'react';
import { Button, Input } from '../../../components/ui';
import type { AbilityRoll, WizardSrd } from '../../../data/creation';
import { friendlyMessage } from '../../../data/errors';
import styles from './create.module.css';

export interface StepProps {
  srd: WizardSrd;
  choices: CreationChoices;
  onChange: (patch: Partial<CreationChoices>) => void;
}

const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`);

/** Paragraphs as the SRD prints them; "• " lines become a list. */
function SrdText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n\n').map((p, i) =>
        p.startsWith('• ') ? (
          <ul key={i} className={styles.bullets}>
            {p.split('\n').map((l, j) => (
              <li key={j}>{l.replace(/^• /, '')}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{p}</p>
        ),
      )}
    </>
  );
}

function Choice<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T | '';
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select id={id} value={value} onChange={e => onChange(e.target.value as T)} className={styles.select}>
        <option value="" disabled>
          Choose…
        </option>
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// 1. NAME AND SPECIES ---------------------------------------------------------------------

export function OriginStep({ srd, choices, onChange }: StepProps) {
  const id = useId();
  const species = srd.species.find(s => s.id === choices.species);
  return (
    <>
      <div className={styles.field}>
        <label htmlFor={`${id}-name`} className={styles.label}>
          Name
        </label>
        <Input
          id={`${id}-name`}
          maxLength={80}
          value={choices.name}
          onChange={e => onChange({ name: e.target.value })}
          autoComplete="off"
        />
      </div>
      <Choice
        id={`${id}-species`}
        label="Species"
        value={choices.species}
        options={srd.species.map(s => ({ value: s.id, label: s.name }))}
        onChange={v => onChange({ species: v, size: undefined })}
      />
      {species && (
        <section className={styles.srd} aria-label={`${species.name} traits`}>
          <p>{`${species.creatureType} · ${species.sizeText} · Speed ${species.speed} feet`}</p>
          {species.sizeOptions.length > 1 && (
            <Choice
              id={`${id}-size`}
              label="Size"
              value={choices.size ?? ''}
              options={species.sizeOptions.map(s => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))}
              onChange={v => onChange({ size: v })}
            />
          )}
          {species.traits.map(t => (
            <details key={t.name} className={styles.trait}>
              <summary>{t.name}</summary>
              <SrdText text={t.description} />
            </details>
          ))}
        </section>
      )}
    </>
  );
}

// 2. CLASS -----------------------------------------------------------------------------------

export function ClassStep({ srd, choices, onChange }: StepProps) {
  const id = useId();
  const cls = srd.classes.find(c => c.id === choices.class);
  const allow = cls ? spellAllowance(cls) : null;
  return (
    <>
      <Choice
        id={`${id}-class`}
        label="Class"
        value={choices.class}
        options={srd.classes.map(c => ({ value: c.id, label: c.name }))}
        // a new class has its own skills, equipment and spells
        onChange={v =>
          onChange({
            class: v,
            skills: [],
            equipment: { ...choices.equipment, class: 'A' },
            spells: { cantrips: [], prepared: [], spellbook: [] },
          })
        }
      />
      {cls && (
        <section className={styles.srd} aria-label={`${cls.name} traits`}>
          <dl className={styles.facts}>
            <dt>Hit Point Die</dt>
            <dd>{`${cls.hitDie.toUpperCase()} per ${cls.name} level`}</dd>
            <dt>Saving throws</dt>
            <dd>{cls.saveProficiencies.map(a => ABILITY_LABELS[a].label).join(' and ')}</dd>
            <dt>Skills</dt>
            <dd>{cls.skillChoices.text}</dd>
            <dt>Weapons</dt>
            <dd>{cls.weaponProficiencies}</dd>
            <dt>Armour</dt>
            <dd>{cls.armorTraining.text}</dd>
            {cls.spellcasting && allow && (
              <>
                <dt>Spellcasting</dt>
                <dd>{`${ABILITY_LABELS[cls.spellcasting.ability].label}: ${allow.cantrips} cantrips, ${allow.prepared} prepared level 1 spells${allow.spellbook ? `, a spellbook of ${allow.spellbook}` : ''}`}</dd>
              </>
            )}
          </dl>
          <h3 className={styles.subhead}>Level 1 features</h3>
          {cls.levels[0].features.map(f => (
            <details key={f.name} className={styles.trait}>
              <summary>{f.name}</summary>
              <SrdText text={f.description} />
            </details>
          ))}
        </section>
      )}
    </>
  );
}

// 3. BACKGROUND -------------------------------------------------------------------------------

export function BackgroundStep({ srd, choices, onChange }: StepProps) {
  const id = useId();
  const bg = srd.backgrounds.find(b => b.id === choices.background);
  return (
    <>
      <Choice
        id={`${id}-background`}
        label="Background"
        value={choices.background}
        options={srd.backgrounds.map(b => ({ value: b.id, label: b.name }))}
        onChange={v => {
          const next = srd.backgrounds.find(b => b.id === v);
          onChange({
            background: v,
            // the increases must go to this background's abilities; start with +2 and +1 to its first two
            backgroundBonus: next
              ? { plus2: next.abilityScores[0], plus1: next.abilityScores[1] }
              : choices.backgroundBonus,
            equipment: { ...choices.equipment, background: 'A' },
            skills: choices.skills.filter(s => !next?.skillProficiencies.includes(s)),
          });
        }}
      />
      {bg && (
        <section className={styles.srd} aria-label={`${bg.name} background`}>
          <dl className={styles.facts}>
            <dt>Ability scores</dt>
            <dd>{bg.abilityScores.map(a => ABILITY_LABELS[a].label).join(', ')}</dd>
            <dt>Skills</dt>
            <dd>{bg.skillProficiencies.map(s => SKILLS[s].label).join(' and ')}</dd>
            <dt>Tool</dt>
            <dd>{bg.toolProficiency}</dd>
            <dt>Origin feat</dt>
            <dd>{bg.originFeat.name}</dd>
          </dl>
          <p className={styles.muted}>
            Increase one of these abilities by 2 and another by 1, or all three by 1 (none above 20): you choose on the
            next step.
          </p>
          <details className={styles.trait}>
            <summary>{bg.originFeat.name}</summary>
            <SrdText text={bg.originFeat.description} />
          </details>
        </section>
      )}
    </>
  );
}

// 4. ABILITY SCORES ------------------------------------------------------------------------------

const METHODS: { value: AbilityMethod; label: string }[] = [
  { value: 'standard', label: 'Standard array (15, 14, 13, 12, 10, 8)' },
  { value: 'pointBuy', label: 'Point buy (27 points, scores 8 to 15)' },
  { value: 'roll', label: 'Roll (4d6, drop the lowest, six times)' },
];
const START: Record<AbilityMethod, number[]> = {
  standard: [...STANDARD_ARRAY],
  pointBuy: [8, 8, 8, 8, 8, 8],
  roll: [],
};

export function AbilitiesStep({
  srd,
  choices,
  onChange,
  roll,
  onRoll,
  rolling,
  rollError,
}: StepProps & { roll: AbilityRoll | null; onRoll: () => void; rolling: boolean; rollError: unknown }) {
  const id = useId();
  const { method, base } = choices.abilities;
  const totals = roll ? abilityRollTotals(roll.dice) : null;
  const bg = srd.backgrounds.find(b => b.id === choices.background);
  const final = bg ? finalScores(choices, bg) : null;
  const cost = method === 'pointBuy' ? pointBuyCost(base) : null;
  const pool = method === 'standard' ? STANDARD_ARRAY : (totals ?? []);
  const setBase = (a: Ability, v: number) =>
    onChange({ abilities: { ...choices.abilities, base: { ...base, [a]: v } } });

  function pickMethod(m: AbilityMethod) {
    const values = m === 'roll' ? (totals ?? [0, 0, 0, 0, 0, 0]) : START[m];
    onChange({
      abilities: {
        method: m,
        base: Object.fromEntries(ABILITY_KEYS.map((a, i) => [a, values[i]])) as CreationChoices['abilities']['base'],
        ...(m === 'roll' && roll ? { rollId: roll.id } : {}),
      },
    });
  }

  const bonus = choices.backgroundBonus;
  const even = 'plusOneEach' in bonus;
  return (
    <>
      <fieldset className={styles.radios}>
        <legend className={styles.label}>Method</legend>
        {METHODS.map(m => (
          <label key={m.value}>
            <input
              type="radio"
              name={`${id}-method`}
              checked={method === m.value}
              onChange={() => pickMethod(m.value)}
            />{' '}
            {m.label}
          </label>
        ))}
      </fieldset>

      {method === 'roll' && (
        <div className={styles.roll}>
          {totals ? (
            <p>{`You rolled ${totals.join(', ')}. The roll is kept with your draft and in the roll log: it cannot be rolled again.`}</p>
          ) : (
            <Button onClick={onRoll} disabled={rolling}>
              {rolling ? 'Rolling…' : 'Roll 4d6 six times'}
            </Button>
          )}
          {rollError ? (
            <p role="alert" className={styles.alert}>
              {friendlyMessage(rollError)}
            </p>
          ) : null}
        </div>
      )}

      {(method !== 'roll' || totals) && (
        <table className={styles.scores}>
          <caption className={styles.label}>
            {method === 'pointBuy' && cost !== null ? `Scores (${cost} of ${POINT_BUY_BUDGET} points spent)` : 'Scores'}
          </caption>
          <thead>
            <tr>
              <th scope="col">Ability</th>
              <th scope="col">Score</th>
              <th scope="col">With background</th>
              <th scope="col">Modifier</th>
            </tr>
          </thead>
          <tbody>
            {ABILITY_KEYS.map(a => {
              const score = final && 'scores' in final ? final.scores[a] : base[a];
              return (
                <tr key={a}>
                  <th scope="row">{ABILITY_LABELS[a].label}</th>
                  <td>
                    {method === 'pointBuy' ? (
                      <Input
                        aria-label={`${ABILITY_LABELS[a].label} score`}
                        type="number"
                        min={8}
                        max={15}
                        value={base[a]}
                        onChange={e => setBase(a, Math.trunc(Number(e.target.value)) || 8)}
                        className={styles.number}
                      />
                    ) : (
                      <select
                        aria-label={`${ABILITY_LABELS[a].label} score`}
                        value={base[a]}
                        onChange={e => setBase(a, Number(e.target.value))}
                        className={styles.select}
                      >
                        {[...new Set(pool)].map(v => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>{score}</td>
                  <td>{signed(abilityModifier(score))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {bg && (
        <fieldset className={styles.radios}>
          <legend className={styles.label}>{`${bg.name} increases`}</legend>
          <label>
            <input
              type="radio"
              name={`${id}-bonus`}
              checked={!even}
              onChange={() => onChange({ backgroundBonus: { plus2: bg.abilityScores[0], plus1: bg.abilityScores[1] } })}
            />{' '}
            +2 to one and +1 to another
          </label>
          {!even && (
            <div className={styles.inline}>
              <Choice
                id={`${id}-plus2`}
                label="+2 to"
                value={bonus.plus2}
                options={bg.abilityScores.map(a => ({ value: a, label: ABILITY_LABELS[a].label }))}
                onChange={v => onChange({ backgroundBonus: { plus2: v, plus1: bonus.plus1 } })}
              />
              <Choice
                id={`${id}-plus1`}
                label="+1 to"
                value={bonus.plus1}
                options={bg.abilityScores.map(a => ({ value: a, label: ABILITY_LABELS[a].label }))}
                onChange={v => onChange({ backgroundBonus: { plus2: bonus.plus2, plus1: v } })}
              />
            </div>
          )}
          <label>
            <input
              type="radio"
              name={`${id}-bonus`}
              checked={even}
              onChange={() => onChange({ backgroundBonus: { plusOneEach: true } })}
            />{' '}
            {`+1 to each of ${bg.abilityScores.map(a => ABILITY_LABELS[a].label).join(', ')}`}
          </label>
        </fieldset>
      )}
    </>
  );
}

// 5. SKILLS --------------------------------------------------------------------------------------

export function SkillsStep({ srd, choices, onChange }: StepProps) {
  const cls = srd.classes.find(c => c.id === choices.class);
  const bg = srd.backgrounds.find(b => b.id === choices.background);
  if (!cls) return <p className={styles.muted}>Choose a class first.</p>;
  const fixed = new Set<SkillKey>(bg?.skillProficiencies ?? []);
  const toggle = (s: SkillKey, on: boolean) =>
    onChange({ skills: on ? [...choices.skills, s] : choices.skills.filter(x => x !== s) });
  return (
    <fieldset className={styles.checks}>
      <legend className={styles.label}>{`Choose ${cls.skillChoices.count} (${choices.skills.length} chosen)`}</legend>
      {cls.skillChoices.from.map(s => (
        <label key={s}>
          <input
            type="checkbox"
            checked={fixed.has(s) || choices.skills.includes(s)}
            disabled={fixed.has(s)}
            onChange={e => toggle(s, e.target.checked)}
          />{' '}
          {SKILLS[s].label}
          {fixed.has(s) && <span className={styles.muted}>{` (from your ${bg?.name} background)`}</span>}
        </label>
      ))}
      {bg && (
        <p
          className={styles.muted}
        >{`Your background gives ${bg.skillProficiencies.map(s => SKILLS[s].label).join(' and ')}.`}</p>
      )}
    </fieldset>
  );
}

// 6. EQUIPMENT --------------------------------------------------------------------------------------

export function EquipmentStep({ srd, choices, onChange }: StepProps) {
  const id = useId();
  const cls = srd.classes.find(c => c.id === choices.class);
  const bg = srd.backgrounds.find(b => b.id === choices.background);
  return (
    <>
      {cls && (
        <fieldset className={styles.radios}>
          <legend className={styles.label}>{`${cls.name} equipment`}</legend>
          {cls.startingEquipmentOptions.map(o => (
            <label key={o.option}>
              <input
                type="radio"
                name={`${id}-class`}
                checked={choices.equipment.class === o.option}
                onChange={() => onChange({ equipment: { ...choices.equipment, class: o.option } })}
              />{' '}
              {`(${o.option}) ${o.text}`}
            </label>
          ))}
        </fieldset>
      )}
      {bg && (
        <fieldset className={styles.radios}>
          <legend className={styles.label}>{`${bg.name} equipment`}</legend>
          {bg.equipmentOptions.map(o => (
            <label key={o.option}>
              <input
                type="radio"
                name={`${id}-background`}
                checked={choices.equipment.background === o.option}
                onChange={() => onChange({ equipment: { ...choices.equipment, background: o.option } })}
              />{' '}
              {`(${o.option}) ${o.text}`}
            </label>
          ))}
        </fieldset>
      )}
      <p className={styles.muted}>Gold you start with can be spent on equipment once the character is made.</p>
    </>
  );
}

// 7. SPELLS -------------------------------------------------------------------------------------------

export function SpellsStep({ srd, choices, onChange }: StepProps) {
  const cls = srd.classes.find(c => c.id === choices.class);
  if (!cls) return <p className={styles.muted}>Choose a class first.</p>;
  const allow = spellAllowance(cls);
  if (!cls.spellcasting) return <p className={styles.muted}>{`${cls.name}s cast no spells at level 1.`}</p>;
  const list = (level: number) => srd.spells.filter(s => s.level === level && s.classes.includes(cls.name));
  const { spells } = choices;
  const set = (patch: Partial<CreationChoices['spells']>) => onChange({ spells: { ...spells, ...patch } });
  const toggle = (key: keyof CreationChoices['spells'], name: string, on: boolean) => {
    const next = on ? [...spells[key], name] : spells[key].filter(n => n !== name);
    // a spell taken out of the spellbook cannot stay prepared
    if (key === 'spellbook' && !on) set({ spellbook: next, prepared: spells.prepared.filter(n => n !== name) });
    else set({ [key]: next });
  };
  const group = (key: keyof CreationChoices['spells'], title: string, size: number, pool: { name: string }[]) => (
    <fieldset className={styles.checks}>
      <legend className={styles.label}>{`${title}: choose ${size} (${spells[key].length} chosen)`}</legend>
      {pool.map(s => (
        <label key={s.name}>
          <input
            type="checkbox"
            checked={spells[key].includes(s.name)}
            onChange={e => toggle(key, s.name, e.target.checked)}
          />{' '}
          {s.name}
        </label>
      ))}
    </fieldset>
  );
  return (
    <>
      {allow.cantrips > 0 && group('cantrips', 'Cantrips', allow.cantrips, list(0))}
      {allow.spellbook > 0 && group('spellbook', 'Spellbook', allow.spellbook, list(1))}
      {allow.prepared > 0 &&
        group(
          'prepared',
          allow.spellbook ? 'Prepared from your spellbook' : 'Prepared level 1 spells',
          allow.prepared,
          allow.spellbook ? list(1).filter(s => spells.spellbook.includes(s.name)) : list(1),
        )}
    </>
  );
}

// 8. DETAILS ---------------------------------------------------------------------------------------------

const DETAIL_LABELS: Record<keyof CreationChoices['details'], string> = {
  personalityTraits: 'Personality traits',
  ideals: 'Ideals',
  bonds: 'Bonds',
  flaws: 'Flaws',
  appearance: 'Appearance',
  backstory: 'Backstory',
};

export function DetailsStep({ choices, onChange }: StepProps) {
  const id = useId();
  return (
    <>
      <Choice
        id={`${id}-alignment`}
        label="Alignment"
        value={choices.alignment as (typeof ALIGNMENTS)[number] | ''}
        options={ALIGNMENTS.map(a => ({ value: a, label: a }))}
        onChange={v => onChange({ alignment: v })}
      />
      {(Object.keys(DETAIL_LABELS) as (keyof CreationChoices['details'])[]).map(k => (
        <div key={k} className={styles.field}>
          <label htmlFor={`${id}-${k}`} className={styles.label}>
            {DETAIL_LABELS[k]}
          </label>
          <textarea
            id={`${id}-${k}`}
            rows={k === 'backstory' ? 5 : 2}
            maxLength={4000}
            value={choices.details[k]}
            onChange={e => onChange({ details: { ...choices.details, [k]: e.target.value } })}
            className={styles.textarea}
          />
        </div>
      ))}
    </>
  );
}
