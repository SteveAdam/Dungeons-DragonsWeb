// /dev/odds (development builds only): try the odds popup with any bonus, target, reasons and bonus dice,
// with a pretend roll in memory or a real roll through the server's roll_d20.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dices, FlaskConical, Server } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useAuth } from '../../auth/authContext';
import { OddsPopup, type OddsBonusDie, type OddsCheck } from '../../components/odds/OddsPopup';
import { Button, ICON_PROPS, iconClasses, Input, Paper, RibbonTabs } from '../../components/ui';
import { listRecentRolls, rollD20, subscribeToRolls } from '../../data/rolls';
import { useCampaigns } from '../../hooks/useCampaigns';
import { fakeRoll } from './fakeRoller';
import styles from './OddsDevPage.module.css';

const DICE: Record<string, OddsBonusDie> = {
  bless: { label: 'Bless', count: 1, sides: 4, sign: 1 },
  bane: { label: 'Bane', count: 1, sides: 4, sign: -1 },
  guidance: { label: 'Guidance', count: 1, sides: 4, sign: 1 },
};
const rollsKey = (campaignId: string) => ['campaigns', campaignId, 'rolls'];
const lines = (text: string) =>
  text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

export default function OddsDevPage() {
  const id = useId();
  const { session } = useAuth();
  const [tab, setTab] = useState<'fake' | 'real'>('fake');
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
  const [campaignId, setCampaignId] = useState('');
  const client = useQueryClient();
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
  const canRollForReal = tab === 'fake' || (!!session && !!campaignId);

  return (
    <main className={styles.page}>
      <Paper as="section" texture="flat" aria-labelledby={`${id}-title`} className={styles.card}>
        <h1 id={`${id}-title`} className={styles.title}>
          Odds popup (development)
        </h1>
        <RibbonTabs
          aria-label="Roll with"
          tabs={[
            { id: 'fake', label: 'Pretend roll', icon: FlaskConical },
            { id: 'real', label: 'Real roll', icon: Server },
          ]}
          value={tab}
          onChange={t => setTab(t as 'fake' | 'real')}
        />

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

          {tab === 'real' && <RealRollSettings campaignId={campaignId} onCampaign={setCampaignId} />}
        </div>

        <Button ref={setOpener} className={iconClasses.host} disabled={!canRollForReal} onClick={() => setOpen(true)}>
          <Dices {...ICON_PROPS} className={iconClasses.icon} />
          Show the odds
        </Button>
        {tab === 'real' && campaignId && <RollLog campaignId={campaignId} />}
      </Paper>

      <OddsPopup
        open={open}
        onClose={() => setOpen(false)}
        anchor={opener}
        check={check}
        onRoll={mode =>
          tab === 'fake'
            ? fakeRoll(check, mode)
            : rollD20({
                campaignId,
                kind: check.kind,
                label: check.label,
                bonus: check.bonus,
                target: check.target,
                mode,
              }).then(roll => {
                // our own roll refreshes the log at once; realtime brings everyone else's
                void client.invalidateQueries({ queryKey: rollsKey(campaignId) });
                return roll;
              })
        }
      />
    </main>
  );
}

function RealRollSettings({ campaignId, onCampaign }: { campaignId: string; onCampaign: (id: string) => void }) {
  const id = useId();
  const { session } = useAuth();
  const campaigns = useCampaigns();
  if (!session) return <p className={styles.note}>Sign in to roll through the server.</p>;
  return (
    <>
      <label htmlFor={`${id}-campaign`}>Test campaign (the roll is logged there)</label>
      <select
        id={`${id}-campaign`}
        value={campaignId}
        onChange={e => onCampaign(e.target.value)}
        className={styles.select}
      >
        <option value="">Choose a campaign</option>
        {(campaigns.data ?? []).map(c => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </>
  );
}

/** The campaign's roll log, live: new rolls arrive through realtime. */
function RollLog({ campaignId }: { campaignId: string }) {
  const client = useQueryClient();
  const rolls = useQuery({ queryKey: rollsKey(campaignId), queryFn: () => listRecentRolls(campaignId, 10) });
  useEffect(
    () => subscribeToRolls(campaignId, () => client.invalidateQueries({ queryKey: rollsKey(campaignId) })),
    [campaignId, client],
  );
  return (
    <section aria-label="Roll log" className={styles.log}>
      <h2 className={styles.logTitle}>Roll log</h2>
      <ol>
        {(rolls.data ?? []).map(r => (
          <li key={r.id}>
            {`${r.label}: ${r.dice.join(' & ')} → ${r.total}${r.target === null ? '' : ` vs ${r.target}`}`}
            {r.success === null ? '' : r.crit ? ' (critical hit)' : r.success ? ' (success)' : ' (failure)'}
          </li>
        ))}
      </ol>
    </section>
  );
}
