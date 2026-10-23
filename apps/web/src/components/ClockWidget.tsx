// P2-8: the DM's game clock. Shows the time as "Day N, hh:mm" and moves it forward with advance_clock, which logs
// each move. Every open screen hears the new time over realtime, so effect countdowns move together.
import { Clock } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { friendlyMessage } from '../data/errors';
import { useAdvanceClock, useCampaign } from '../hooks/useCampaigns';
import { dayClock } from '../lib/gameClock';
import styles from './ClockWidget.module.css';
import { Button, ICON_PROPS, Input } from './ui';

const STEPS = [
  { label: '+10 minutes', seconds: 600, reason: '10 minutes pass' },
  { label: '+1 hour', seconds: 3600, reason: 'An hour passes' },
  { label: '+8 hours', seconds: 8 * 3600, reason: '8 hours pass' },
  { label: '+1 day', seconds: 86400, reason: 'A day passes' },
] as const;
const UNITS = { minutes: 60, hours: 3600, days: 86400 } as const;
type Unit = keyof typeof UNITS;

export function ClockWidget({ campaignId }: { campaignId: string }) {
  const id = useId();
  const campaign = useCampaign(campaignId);
  const advance = useAdvanceClock(campaignId);
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<Unit>('minutes');
  const [reason, setReason] = useState('');
  const seconds = campaign.data?.gameSeconds ?? 0;
  const custom = Number(amount);
  const customOk = Number.isFinite(custom) && custom > 0 && custom * UNITS[unit] <= 365 * 86400;

  function submit(e: FormEvent) {
    e.preventDefault();
    advance.mutate(
      { seconds: Math.round(custom * UNITS[unit]), reason: reason.trim() },
      {
        onSuccess: () => {
          setAmount('');
          setReason('');
        },
      },
    );
  }

  return (
    <section className={styles.clock} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.title}>
        <Clock {...ICON_PROPS} /> Game clock
      </h2>
      <p className={styles.time} aria-live="polite">
        <time>{campaign.data ? dayClock(seconds) : '…'}</time>
      </p>
      <div className={styles.steps} role="group" aria-label="Advance the clock">
        {STEPS.map(s => (
          <Button
            key={s.label}
            variant="ghost"
            disabled={advance.isPending || !campaign.data}
            onClick={() => advance.mutate({ seconds: s.seconds, reason: s.reason })}
          >
            {s.label}
          </Button>
        ))}
      </div>
      <form className={styles.custom} onSubmit={submit} aria-label="Advance by another amount">
        <label htmlFor={`${id}-amount`} className={styles.label}>
          Amount
        </label>
        <Input
          id={`${id}-amount`}
          type="number"
          min={0}
          step="any"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className={styles.amount}
        />
        <label htmlFor={`${id}-unit`} className={styles.hidden}>
          Unit
        </label>
        <select
          id={`${id}-unit`}
          value={unit}
          onChange={e => setUnit(e.target.value as Unit)}
          className={styles.select}
        >
          {Object.keys(UNITS).map(u => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-reason`} className={styles.label}>
          Reason
        </label>
        <Input
          id={`${id}-reason`}
          maxLength={200}
          value={reason}
          placeholder="Travel to Port Vellum"
          onChange={e => setReason(e.target.value)}
        />
        <Button type="submit" disabled={!customOk || advance.isPending}>
          {advance.isPending ? 'Advancing…' : 'Advance'}
        </Button>
      </form>
      {advance.isError && (
        <p role="alert" className={styles.alert}>
          {friendlyMessage(advance.error)}
        </p>
      )}
    </section>
  );
}
