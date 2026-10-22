// /dev/odds (development builds only): try the odds popup with any bonus, target, reasons and bonus dice,
// with a pretend roll in memory. Since P2-2 the server rolls only for characters, with the bonus it works out
// itself, so a made-up bonus can no longer be rolled for real: real rolls are made from a character's sheet.
import { Dices } from 'lucide-react';
import { useId, useState } from 'react';
import { OddsPopup, type OddsBonusDie, type OddsCheck } from '../../components/odds/OddsPopup';
import { Button, ICON_PROPS, iconClasses, Input, Paper } from '../../components/ui';
import { fakeRoll } from './fakeRoller';
import styles from './OddsDevPage.module.css';

const DICE: Record<string, OddsBonusDie> = {
  bless: { label: 'Bless', count: 1, sides: 4, sign: 1 },
  bane: { label: 'Bane', count: 1, sides: 4, sign: -1 },
  guidance: { label: 'Guidance', count: 1, sides: 4, sign: 1 },
};
const lines = (text: string) =>
  text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

export default function OddsDevPage() {
  const id = useId();
  const [form, setForm] = useState({
    label: 'Search the undergrowth',
    skill: 'Perception',
    kind: 'check' as OddsCheck['kind'],
    bonus: '3',
    target: '14',
    advantage: '',
    disadvantage: '',
    dice: [] as string[],
  });
  const [open, setOpen] = useState(false);
  // a callback ref kept in state, so the popup can be placed next to the button it opened from
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(f => ({ ...f, [key]: value }));

  const check: OddsCheck = {
    label: form.label || 'A roll',
    skill: form.skill || undefined,
    kind: form.kind,
    bonus: Number(form.bonus) || 0,
    target: Number(form.target) || 0,
    advantage: lines(form.advantage),
    disadvantage: lines(form.disadvantage),
    bonusDice: form.dice.map(d => DICE[d]),
  };

  return (
    <main className={styles.page}>
      <Paper as="section" texture="flat" aria-labelledby={`${id}-title`} className={styles.card}>
        <h1 id={`${id}-title`} className={styles.title}>
          Odds popup (development)
        </h1>
        <p className={styles.note}>
          Pretend rolls only. Real rolls come from a character's sheet, where the server works out the bonus.
        </p>

        <div className={styles.form}>
          <label htmlFor={`${id}-label`}>What is happening</label>
          <Input id={`${id}-label`} value={form.label} onChange={e => set('label', e.target.value)} />
          <label htmlFor={`${id}-skill`}>Skill, ability or weapon</label>
          <Input id={`${id}-skill`} value={form.skill} onChange={e => set('skill', e.target.value)} />
          <label htmlFor={`${id}-kind`}>Kind</label>
          <select
            id={`${id}-kind`}
            value={form.kind}
            onChange={e => set('kind', e.target.value as OddsCheck['kind'])}
            className={styles.select}
          >
            <option value="check">Ability check</option>
            <option value="save">Saving throw</option>
            <option value="attack">Attack</option>
          </select>
          <div className={styles.row}>
            <span>
              <label htmlFor={`${id}-bonus`}>Bonus</label>
              <Input id={`${id}-bonus`} type="number" value={form.bonus} onChange={e => set('bonus', e.target.value)} />
            </span>
            <span>
              <label htmlFor={`${id}-target`}>{form.kind === 'attack' ? 'Armour class' : 'DC'}</label>
              <Input
                id={`${id}-target`}
                type="number"
                value={form.target}
                onChange={e => set('target', e.target.value)}
              />
            </span>
          </div>
          <label htmlFor={`${id}-adv`}>Advantage reasons (one per line)</label>
          <textarea
            id={`${id}-adv`}
            rows={2}
            value={form.advantage}
            onChange={e => set('advantage', e.target.value)}
            className={styles.textarea}
          />
          <label htmlFor={`${id}-dis`}>Disadvantage reasons (one per line)</label>
          <textarea
            id={`${id}-dis`}
            rows={2}
            value={form.disadvantage}
            onChange={e => set('disadvantage', e.target.value)}
            className={styles.textarea}
          />
          <fieldset className={styles.dice}>
            <legend>Bonus dice</legend>
            {Object.entries(DICE).map(([key, d]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={form.dice.includes(key)}
                  onChange={e => set('dice', e.target.checked ? [...form.dice, key] : form.dice.filter(k => k !== key))}
                />
                {` ${d.label} (${d.sign < 0 ? '-' : '+'}${d.count}d${d.sides})`}
              </label>
            ))}
          </fieldset>
        </div>

        <Button ref={setOpener} className={iconClasses.host} onClick={() => setOpen(true)}>
          <Dices {...ICON_PROPS} className={iconClasses.icon} />
          Show the odds
        </Button>
      </Paper>

      <OddsPopup
        open={open}
        onClose={() => setOpen(false)}
        anchor={opener}
        check={check}
        onRoll={mode => fakeRoll(check, mode)}
      />
    </main>
  );
}
