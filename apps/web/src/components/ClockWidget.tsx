// P2-8: the DM's game clock. Shows the time as "Day N, hh:mm" and moves it forward with advance_clock, which logs
// each move. Every open screen hears the new time over realtime, so effect countdowns move together.
import { absoluteDayFromSeconds, addMonths } from '@dnd-manager/rules-engine';
import { useId, useState, type FormEvent } from 'react';
import { friendlyMessage } from '../data/errors';
import { useAdvanceClock, useCampaign } from '../hooks/useCampaigns';
import { useCalendar } from '../hooks/useCalendar';
import { calendarClock, SECONDS_PER_DAY } from '../lib/gameClock';
import styles from './ClockWidget.module.css';
import { Button, GameIcon, Input, Paper } from './ui';

const STEPS = [
  { label: '+10 minutes', seconds: 600, reason: '10 minutes pass' },
  { label: '+1 hour', seconds: 3600, reason: 'An hour passes' },
  { label: '+8 hours', seconds: 8 * 3600, reason: '8 hours pass' },
  { label: '+1 day', seconds: 86400, reason: 'A day passes' },
] as const;
const UNITS = { minutes: 60, hours: 3600, days: 86400, weeks: 7 * 86400 } as const;
type Unit = keyof typeof UNITS | 'months';
const MAX_ADVANCE = 365 * SECONDS_PER_DAY;

export function ClockWidget({ campaignId }: { campaignId: string }) {
  const id = useId();
  const campaign = useCampaign(campaignId);
  const advance = useAdvanceClock(campaignId);
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<Unit>('minutes');
  const [reason, setReason] = useState('');
  const seconds = campaign.data?.gameSeconds ?? 0;
  const calendar = useCalendar(campaignId);
  const custom = Number(amount);
  // a month is as long as the calendar says, so it counts from today; only whole months can be counted that way
  const customSeconds = (() => {
    if (unit !== 'months') return Math.round(custom * UNITS[unit]);
    if (!calendar.data || !Number.isInteger(custom) || custom < 1 || custom > 1200) return 0;
    const today = absoluteDayFromSeconds(seconds);
    return (addMonths(calendar.data, today, custom) - today) * SECONDS_PER_DAY;
  })();
  const customOk = Number.isFinite(custom) && custom > 0 && customSeconds > 0 && customSeconds <= MAX_ADVANCE;
  const units: Unit[] = [...(Object.keys(UNITS) as Unit[]), ...(calendar.data ? (['months'] as const) : [])];

  function submit(e: FormEvent) {
    e.preventDefault();
    advance.mutate(
      { seconds: customSeconds, reason: reason.trim() },
      {
        onSuccess: () => {
          setAmount('');
          setReason('');
        },
      },
    );
  }

  return (
    // its own parchment, so it reads the same on the brick desk (hub) as on a sheet
    <Paper as="section" texture="flat" className={styles.clock} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.title}>
        <GameIcon name="hourglass" /> Game clock
      </h2>
      <p className={styles.time} aria-live="polite">
        <time>{campaign.data ? calendarClock(seconds, calendar.data) : '…'}</time>
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
          {units.map(u => (
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
    </Paper>
  );
}
