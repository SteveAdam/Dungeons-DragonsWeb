// P2-8, DM only: put an effect on a character (name, source, stat, how it changes it, how long it lasts,
// concentration, and a hidden detail only DMs see), from scratch or from a preset. Durations in minutes or hours
// are counted on the game clock by the server (apply_effect), so the sheet and the roll function agree.
import type { EffectMode, StatKey } from '@dnd-manager/rules-engine';
import { useId, useState, type FormEvent } from 'react';
import { Button, Input } from '../../components/ui';
import type { EffectDurationInput, NewEffect } from '../../data/characters';
import { friendlyMessage } from '../../data/errors';
import { useApplyEffect } from '../../hooks/useCharacters';
import styles from './EffectsTool.module.css';

const STATS: { value: StatKey; label: string }[] = [
  { value: 'str', label: 'Strength' },
  { value: 'dex', label: 'Dexterity' },
  { value: 'con', label: 'Constitution' },
  { value: 'int', label: 'Intelligence' },
  { value: 'wis', label: 'Wisdom' },
  { value: 'cha', label: 'Charisma' },
  { value: 'ac', label: 'Armour class' },
  { value: 'speed', label: 'Speed' },
];
const MODES: { value: EffectMode; label: string }[] = [
  { value: 'add', label: 'Add' },
  { value: 'set', label: 'Set to' },
  { value: 'set_at_least', label: 'Set to at least' },
];
type Lasts = 'minutes' | 'hours' | 'rounds' | 'rest' | 'permanent';

interface FormState {
  name: string;
  source: string;
  stat: StatKey;
  mode: EffectMode;
  value: string;
  lasts: Lasts;
  amount: string;
  rest: 'short' | 'long';
  concentration: boolean;
  hiddenDetail: string;
}

const BLANK: FormState = {
  name: '',
  source: '',
  stat: 'str',
  mode: 'add',
  value: '',
  lasts: 'minutes',
  amount: '10',
  rest: 'long',
  concentration: false,
  hiddenDetail: '',
};

const PRESETS: { id: string; label: string; form: FormState }[] = [
  {
    id: 'hill-giant',
    label: 'Potion of Hill Giant Strength (Strength at least 21, 1 hour)',
    form: {
      ...BLANK,
      name: 'Potion of Hill Giant Strength',
      source: 'Potion',
      stat: 'str',
      mode: 'set_at_least',
      value: '21',
      lasts: 'hours',
      amount: '1',
    },
  },
  {
    id: 'ac-two',
    label: '+2 armour class for 10 minutes',
    form: {
      ...BLANK,
      name: 'Armour class +2',
      source: 'Spell',
      stat: 'ac',
      mode: 'add',
      value: '2',
      lasts: 'minutes',
      amount: '10',
    },
  },
];

function durationOf(f: FormState): EffectDurationInput {
  const n = Number(f.amount);
  switch (f.lasts) {
    case 'minutes':
      return { kind: 'for', seconds: Math.round(n * 60) };
    case 'hours':
      return { kind: 'for', seconds: Math.round(n * 3600) };
    case 'rounds':
      return { kind: 'rounds', remaining: Math.round(n) };
    case 'rest':
      return { kind: 'rest', rest: f.rest };
    case 'permanent':
      return { kind: 'permanent' };
  }
}

/** The form's effect, or why it cannot be applied yet. */
function check(f: FormState): { effect: NewEffect } | { problem: string } {
  const value = Number(f.value);
  const amount = Number(f.amount);
  if (!f.name.trim()) return { problem: 'Give the effect a name.' };
  if (f.value.trim() === '' || !Number.isInteger(value) || value < -100 || value > 100)
    return { problem: 'The value is a whole number from -100 to 100.' };
  if (['minutes', 'hours', 'rounds'].includes(f.lasts) && !(amount > 0)) return { problem: `Say how many ${f.lasts}.` };
  return {
    effect: {
      name: f.name.trim(),
      source: f.source.trim(),
      stat: f.stat,
      mode: f.mode,
      value,
      duration: durationOf(f),
      concentration: f.concentration,
      hiddenDetail: f.hiddenDetail.trim(),
    },
  };
}

export function EffectsTool({ characterId }: { characterId: string }) {
  const id = useId();
  const apply = useApplyEffect(characterId);
  const [form, setForm] = useState<FormState>(BLANK);
  const [preset, setPreset] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });
  const result = check(form);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!('effect' in result)) return;
    setDone(null);
    const name = result.effect.name;
    apply.mutate(result.effect, {
      onSuccess: () => {
        setDone(`Applied ${name}.`);
        setForm(BLANK);
        setPreset('');
      },
    });
  }

  return (
    <form className={styles.tool} onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={styles.title}>
        Apply an effect
      </h3>
      <div className={styles.field}>
        <label htmlFor={`${id}-preset`} className={styles.label}>
          Preset
        </label>
        <select
          id={`${id}-preset`}
          value={preset}
          onChange={e => {
            setPreset(e.target.value);
            setForm(PRESETS.find(p => p.id === e.target.value)?.form ?? BLANK);
          }}
          className={styles.select}
        >
          <option value="">None</option>
          {PRESETS.map(p => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.fields}>
        <div className={`${styles.field} ${styles.grow}`}>
          <label htmlFor={`${id}-name`} className={styles.label}>
            Name
          </label>
          <Input id={`${id}-name`} maxLength={120} value={form.name} onChange={e => set({ name: e.target.value })} />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-source`} className={styles.label}>
            Source
          </label>
          <Input
            id={`${id}-source`}
            maxLength={120}
            value={form.source}
            onChange={e => set({ source: e.target.value })}
          />
        </div>
      </div>
      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor={`${id}-stat`} className={styles.label}>
            Stat
          </label>
          <select
            id={`${id}-stat`}
            value={form.stat}
            onChange={e => set({ stat: e.target.value as StatKey })}
            className={styles.select}
          >
            {STATS.map(s => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-mode`} className={styles.label}>
            How
          </label>
          <select
            id={`${id}-mode`}
            value={form.mode}
            onChange={e => set({ mode: e.target.value as EffectMode })}
            className={styles.select}
          >
            {MODES.map(m => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-value`} className={styles.label}>
            Value
          </label>
          <Input
            id={`${id}-value`}
            type="number"
            min={-100}
            max={100}
            step={1}
            value={form.value}
            onChange={e => set({ value: e.target.value })}
            className={styles.number}
          />
        </div>
      </div>
      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor={`${id}-lasts`} className={styles.label}>
            Lasts
          </label>
          <select
            id={`${id}-lasts`}
            value={form.lasts}
            onChange={e => set({ lasts: e.target.value as Lasts })}
            className={styles.select}
          >
            <option value="minutes">Minutes from now</option>
            <option value="hours">Hours from now</option>
            <option value="rounds">Rounds</option>
            <option value="rest">Until a rest</option>
            <option value="permanent">Permanent</option>
          </select>
        </div>
        {['minutes', 'hours', 'rounds'].includes(form.lasts) && (
          <div className={styles.field}>
            <label htmlFor={`${id}-amount`} className={styles.label}>
              {`How many ${form.lasts}`}
            </label>
            <Input
              id={`${id}-amount`}
              type="number"
              min={1}
              step="any"
              value={form.amount}
              onChange={e => set({ amount: e.target.value })}
              className={styles.number}
            />
          </div>
        )}
        {form.lasts === 'rest' && (
          <div className={styles.field}>
            <label htmlFor={`${id}-rest`} className={styles.label}>
              Rest
            </label>
            <select
              id={`${id}-rest`}
              value={form.rest}
              onChange={e => set({ rest: e.target.value as 'short' | 'long' })}
              className={styles.select}
            >
              <option value="short">Short rest</option>
              <option value="long">Long rest</option>
            </select>
          </div>
        )}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.concentration}
            onChange={e => set({ concentration: e.target.checked })}
          />{' '}
          Concentration
        </label>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-hidden`} className={styles.label}>
          Hidden detail (DMs only)
        </label>
        <Input
          id={`${id}-hidden`}
          maxLength={1000}
          value={form.hiddenDetail}
          placeholder="Brewed by a hag: it curses on the third sip"
          onChange={e => set({ hiddenDetail: e.target.value })}
        />
      </div>
      {'problem' in result && form.name.trim() !== '' && <p className={styles.muted}>{result.problem}</p>}
      <Button type="submit" disabled={!('effect' in result) || apply.isPending}>
        {apply.isPending ? 'Applying…' : 'Apply effect'}
      </Button>
      {apply.isError && (
        <p role="alert" className={styles.alert}>
          {friendlyMessage(apply.error)}
        </p>
      )}
      {done && (
        <p role="status" className={styles.done}>
          {done}
        </p>
      )}
    </form>
  );
}
