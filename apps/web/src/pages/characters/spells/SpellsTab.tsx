// P2-11: the Spells tab (casters only). The spellcasting numbers come from computeSheet, the slots from the class
// table (slotsFor) and the stored spell state; casting, preparing and concentration go through the database's
// functions, which keep the class rules and the cast log.
import {
  ABILITY_LABELS,
  addDice,
  cantripDamageDice,
  concentrationSaveDc,
  slotsFor,
  type CharacterSheet,
  type ComputedSheet,
  type LevelUpClass,
} from '@dnd-manager/rules-engine';
import type { SrdSpell } from '@dnd-manager/srd-data/schemas';
import { useId, useState } from 'react';
import { ErrorNotice } from '../../../components/ErrorNotice';
import { Button, Input, Tag } from '../../../components/ui';
import { friendlyMessage } from '../../../data/errors';
import { useBreakConcentration, useCastSpell, useSetPrepared, useSpellState } from '../../../hooks/useSpells';
import styles from './spells.module.css';

const ORDINAL = [
  'Cantrips',
  '1st level',
  '2nd level',
  '3rd level',
  '4th level',
  '5th level',
  '6th level',
  '7th level',
  '8th level',
  '9th level',
];
const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`);

interface Props {
  characterId: string;
  sheet: CharacterSheet;
  computed: ComputedSheet;
  cls: LevelUpClass;
  spells: SrdSpell[];
  dmMode: boolean;
  /** The campaign's rule: prepared spells change only after a long rest. */
  prepareAfterRestOnly: boolean;
  /** Opens the odds popup for a spell attack (the server works out the bonus). */
  onSpellAttack: (anchor: HTMLElement, spell: string) => void;
}

export function SpellsTab({
  characterId,
  sheet,
  computed,
  cls,
  spells,
  dmMode,
  prepareAfterRestOnly,
  onSpellAttack,
}: Props) {
  const id = useId();
  const state = useSpellState(characterId);
  const cast = useCastSpell(characterId);
  const brk = useBreakConcentration(characterId);
  const prepare = useSetPrepared(characterId);
  const [damage, setDamage] = useState('');
  const [preparing, setPreparing] = useState(false);
  const sc = computed.spellcasting;
  const level = computed.level;

  if (state.isError) return <ErrorNotice error={state.error} onRetry={() => state.refetch()} />;
  if (!state.data || !sc)
    return (
      <p role="status" className={styles.muted}>
        Opening the spellbook…
      </p>
    );

  const max = (() => {
    try {
      return slotsFor(cls, level);
    } catch {
      return Array<number>(9).fill(0);
    }
  })();
  const used = state.data.slotsUsed;
  const left = (n: number) => (max[n - 1] ?? 0) - (used[n - 1] ?? 0);
  const topSlot = max.reduce((top, n, i) => (n > 0 ? i + 1 : top), 0);
  const known = sheet.spells ?? { cantrips: [], prepared: [] };
  const byName = new Map(spells.map(s => [s.name, s]));
  const cantrips = known.cantrips.map(n => byName.get(n)).filter((s): s is SrdSpell => !!s);
  const prepared = known.prepared.map(n => byName.get(n)).filter((s): s is SrdSpell => !!s);
  const spellbook = cls.spellcasting?.preparation === 'spellbook';
  // the spells that could be prepared: a Wizard's spellbook, or the class list, at levels with slots
  const preparable = (spellbook ? (known.spellbook ?? []).map(n => byName.get(n)) : spells)
    .filter((s): s is SrdSpell => !!s && s.classes.includes(cls.name) && s.level >= 1 && s.level <= topSlot)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const limit = (() => {
    const row = cls.levels.find(l => l.level === level);
    return typeof row?.columns.preparedSpells === 'number' ? row.columns.preparedSpells : 0;
  })();
  const canPrepare = dmMode || !prepareAfterRestOnly || state.data.prepareOpen;
  // ritual spells a Wizard can cast from the spellbook without preparing them
  const rituals = spellbook
    ? (known.spellbook ?? [])
        .map(n => byName.get(n))
        .filter((s): s is SrdSpell => !!s && s.ritual && !known.prepared.includes(s.name))
    : [];
  const error = cast.error ?? brk.error ?? prepare.error;

  function togglePrepared(name: string, on: boolean) {
    const next = on ? [...known.prepared, name] : known.prepared.filter(n => n !== name);
    prepare.mutate(next);
  }

  return (
    <div className={styles.tab}>
      <dl className={styles.header}>
        <div>
          <dt>Spellcasting ability</dt>
          <dd>{`${ABILITY_LABELS[sc.ability].label} (${signed(computed.abilities[sc.ability].modifier)})`}</dd>
        </div>
        <div>
          <dt>Spell save DC</dt>
          <dd>{sc.saveDc}</dd>
        </div>
        <div>
          <dt>Spell attack</dt>
          <dd>{signed(sc.attackBonus)}</dd>
        </div>
      </dl>

      {state.data.concentration && (
        <section className={styles.concentration} aria-label="Concentration">
          <p>
            <b>{`Concentrating on ${state.data.concentration.spell}`}</b>
          </p>
          <Button variant="ghost" disabled={brk.isPending} onClick={() => brk.mutate()}>
            Break concentration
          </Button>
          <div className={styles.dcHelper}>
            <label htmlFor={`${id}-damage`}>Damage taken</label>
            <Input
              id={`${id}-damage`}
              type="number"
              min={0}
              value={damage}
              onChange={e => setDamage(e.target.value)}
              className={styles.number}
            />
            <span>
              {Number(damage) > 0
                ? `Constitution save DC ${concentrationSaveDc(Number(damage))} to keep concentrating`
                : 'The save DC is 10, or half the damage if that is higher (at most 30).'}
            </span>
          </div>
        </section>
      )}

      {topSlot > 0 && (
        <section aria-labelledby={`${id}-slots`} className={styles.section}>
          <h2 id={`${id}-slots`} className={styles.heading}>
            Spell slots
          </h2>
          <ul className={styles.slots}>
            {max.map((n, i) =>
              n > 0 ? (
                <li key={i} aria-label={`${ORDINAL[i + 1]}: ${left(i + 1)} of ${n} left`}>
                  <span className={styles.slotLevel}>{ORDINAL[i + 1]}</span>
                  {Array.from({ length: n }, (_, d) => (
                    <span key={d} aria-hidden="true" className={d < (used[i] ?? 0) ? styles.spent : styles.dot} />
                  ))}
                </li>
              ) : null,
            )}
          </ul>
        </section>
      )}

      {error && (
        <p role="alert" className={styles.alert}>
          {friendlyMessage(error)}
        </p>
      )}

      <section aria-labelledby={`${id}-cantrips`} className={styles.section}>
        <h2 id={`${id}-cantrips`} className={styles.heading}>
          Cantrips
        </h2>
        <ul className={styles.spells}>
          {cantrips.map(s => (
            <SpellRow
              key={s.name}
              spell={s}
              characterLevel={level}
              saveDc={sc.saveDc}
              slotsLeft={left}
              topSlot={topSlot}
              casting={cast.isPending}
              onCast={(slot, ritual) => cast.mutate({ spell: s.name, slotLevel: slot, ritual })}
              onAttack={anchor => onSpellAttack(anchor, s.name)}
            />
          ))}
        </ul>
      </section>

      {[1, 2, 3, 4, 5, 6, 7, 8, 9]
        .filter(l => prepared.some(s => s.level === l))
        .map(l => (
          <section key={l} aria-labelledby={`${id}-l${l}`} className={styles.section}>
            <h2 id={`${id}-l${l}`} className={styles.heading}>
              {ORDINAL[l]}
            </h2>
            <ul className={styles.spells}>
              {prepared
                .filter(s => s.level === l)
                .map(s => (
                  <SpellRow
                    key={s.name}
                    spell={s}
                    characterLevel={level}
                    saveDc={sc.saveDc}
                    slotsLeft={left}
                    topSlot={topSlot}
                    casting={cast.isPending}
                    onCast={(slot, ritual) => cast.mutate({ spell: s.name, slotLevel: slot, ritual })}
                    onAttack={anchor => onSpellAttack(anchor, s.name)}
                  />
                ))}
            </ul>
          </section>
        ))}

      {rituals.length > 0 && (
        <section aria-labelledby={`${id}-rituals`} className={styles.section}>
          <h2 id={`${id}-rituals`} className={styles.heading}>
            Rituals from your spellbook
          </h2>
          <ul className={styles.spells}>
            {rituals.map(s => (
              <li key={s.name} className={styles.spell}>
                <span className={styles.name}>{s.name}</span>
                <Button
                  variant="ghost"
                  disabled={cast.isPending}
                  onClick={() => cast.mutate({ spell: s.name, slotLevel: null, ritual: true })}
                >
                  {`Cast ${s.name} as a ritual`}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby={`${id}-prepare`} className={styles.section}>
        <h2 id={`${id}-prepare`} className={styles.heading}>
          Prepared spells
        </h2>
        <p className={styles.muted}>
          {`${known.prepared.length} of ${limit} prepared${spellbook ? ', from your spellbook' : ''}.`}
          {!canPrepare && ' Prepared spells change after a long rest, before you cast with a slot.'}
        </p>
        <Button variant="ghost" aria-expanded={preparing} onClick={() => setPreparing(!preparing)}>
          {preparing ? 'Done preparing' : 'Change prepared spells'}
        </Button>
        {preparing && (
          <fieldset className={styles.checks} disabled={!canPrepare || prepare.isPending}>
            <legend className={styles.label}>{`Prepare up to ${limit}`}</legend>
            {known.prepared.length >= limit && (
              <p className={styles.muted}>{`You have prepared ${limit}, the most a level ${level} ${cls.name} can.`}</p>
            )}
            {preparable.map(s => {
              const on = known.prepared.includes(s.name);
              return (
                <label key={s.name}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!on && known.prepared.length >= limit}
                    onChange={e => togglePrepared(s.name, e.target.checked)}
                  />{' '}
                  {`${s.name} (level ${s.level})`}
                </label>
              );
            })}
          </fieldset>
        )}
      </section>
    </div>
  );
}

function SpellRow({
  spell: s,
  characterLevel,
  saveDc,
  slotsLeft,
  topSlot,
  casting,
  onCast,
  onAttack,
}: {
  spell: SrdSpell;
  characterLevel: number;
  saveDc: number;
  slotsLeft: (level: number) => number;
  topSlot: number;
  casting: boolean;
  onCast: (slotLevel: number | null, ritual: boolean) => void;
  onAttack: (anchor: HTMLElement) => void;
}) {
  const id = useId();
  const options = Array.from({ length: Math.max(0, topSlot - s.level + 1) }, (_, i) => s.level + i).filter(
    l => s.level > 0 && slotsLeft(l) > 0,
  );
  const [slot, setSlot] = useState<number | ''>(options[0] ?? '');
  // the slot asked for, or the lowest free one if that has just been spent
  const chosen = s.level === 0 ? 0 : options.includes(Number(slot)) ? Number(slot) : (options[0] ?? s.level);
  const m = s.mechanics;
  const dice = (base: string, per?: string) =>
    s.level === 0 && m?.cantripScaling
      ? cantripDamageDice(base, characterLevel)
      : per && chosen > s.level
        ? addDice(base, per, chosen - s.level)
        : base;
  const facts = [
    m?.attack ? 'spell attack' : '',
    m?.save
      ? `DC ${saveDc} ${ABILITY_LABELS[m.save.ability].label} save${m.save.onSuccess === 'half' ? ' (half on a success)' : ''}`
      : '',
    m?.damage ? `${dice(m.damage.dice, m.damage.perSlotLevel)} ${m.damage.type}` : '',
    m?.healing
      ? `heals ${dice(m.healing.dice, m.healing.perSlotLevel)}${m.healing.addAbilityModifier ? ' + modifier' : ''}`
      : '',
  ].filter(Boolean);
  // a slot of the spell's level is chosen once, unless a higher one is free too
  const upcast = s.level > 0 && options.length > 1;
  const noSlot = s.level > 0 && options.length === 0;

  return (
    <li className={styles.spell}>
      <div className={styles.spellHead}>
        <span className={styles.name}>{s.name}</span>
        {s.concentration && <Tag>Concentration</Tag>}
        {s.ritual && <Tag>Ritual</Tag>}
      </div>
      <p className={styles.muted}>{`${s.castingTime} · ${s.range} · ${s.duration}`}</p>
      {facts.length > 0 && <p>{facts.join(' · ')}</p>}
      <div className={styles.actions}>
        {upcast && (
          <>
            <label htmlFor={`${id}-slot`} className={styles.label}>
              Slot
            </label>
            <select
              id={`${id}-slot`}
              value={slot}
              onChange={e => setSlot(Number(e.target.value))}
              className={styles.select}
            >
              {options.map(l => (
                <option key={l} value={l}>
                  {`Level ${l}${l > s.level ? ' (upcast)' : ''}`}
                </option>
              ))}
            </select>
          </>
        )}
        <Button disabled={casting || noSlot} onClick={() => onCast(s.level === 0 ? null : chosen, false)}>
          {s.level === 0 ? `Cast ${s.name}` : `Cast ${s.name} (level ${chosen} slot)`}
        </Button>
        {s.ritual && s.level > 0 && (
          <Button variant="ghost" disabled={casting} onClick={() => onCast(null, true)}>
            As a ritual
          </Button>
        )}
        {m?.attack && (
          <Button variant="ghost" onClick={e => onAttack(e.currentTarget)}>
            {`Attack roll: ${s.name}`}
          </Button>
        )}
        {noSlot && <span className={styles.muted}>No slot left</span>}
      </div>
    </li>
  );
}
