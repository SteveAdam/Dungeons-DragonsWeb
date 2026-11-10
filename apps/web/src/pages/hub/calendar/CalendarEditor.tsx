// P3-7: the DM's calendar settings, with today's date and its month drawn live from what is being typed.
import {
  absoluteDayToDate,
  DEFAULT_CALENDAR,
  formatDate,
  validateCalendar,
  type CalendarDefinition,
} from '@dnd-manager/rules-engine';
import { Plus, Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button, ICON_PROPS, iconClasses, Input } from '../../../components/ui';
import { friendlyMessage } from '../../../data/errors';
import { useSaveCalendar } from '../../../hooks/useCalendar';
import styles from './calendar.module.css';
import { MonthGrid } from './MonthGrid';

interface Props {
  campaignId: string;
  calendar: CalendarDefinition | null;
  today: number;
}

const whole = (text: string) => (text.trim() === '' ? Number.NaN : Number(text));

export function CalendarEditor({ campaignId, calendar, today }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<CalendarDefinition>(calendar ?? DEFAULT_CALENDAR);
  const save = useSaveCalendar(campaignId);
  const [saved, setSaved] = useState(false);
  const problems = validateCalendar(draft);
  const set = (patch: Partial<CalendarDefinition>) => {
    setSaved(false);
    setDraft(d => ({ ...d, ...patch }));
  };
  const monthOptions = draft.months.map((m, i) => (
    <option key={i} value={i}>
      {m.name || `Month ${i + 1}`}
    </option>
  ));

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(draft, { onSuccess: () => setSaved(true) });
  }

  const preview = problems.length === 0 ? absoluteDayToDate(draft, today) : null;

  return (
    <form className={styles.editor} aria-label="Calendar settings" onSubmit={submit}>
      <div className={styles.editorFields}>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label htmlFor={`${id}-name`}>Calendar name</label>
            <Input id={`${id}-name`} value={draft.name} onChange={e => set({ name: e.target.value })} />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-label`}>Year label</label>
            <Input id={`${id}-label`} value={draft.yearLabel} onChange={e => set({ yearLabel: e.target.value })} />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-epoch`}>Year of day 1</label>
            <Input
              id={`${id}-epoch`}
              type="number"
              value={Number.isNaN(draft.epochYear) ? '' : draft.epochYear}
              onChange={e => set({ epochYear: whole(e.target.value) })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-start`}>Weekday of day 1</label>
            <select
              id={`${id}-start`}
              className={styles.select}
              value={draft.startWeekdayIndex}
              onChange={e => set({ startWeekdayIndex: Number(e.target.value) })}
            >
              {draft.weekdays.map((w, i) => (
                <option key={i} value={i}>
                  {w || `Weekday ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className={styles.rows}>
          <legend>Months</legend>
          {draft.months.map((m, n) => (
            <div key={n} className={styles.rowLine}>
              <Input
                aria-label={`Month ${n + 1}: name`}
                value={m.name}
                onChange={e =>
                  set({ months: draft.months.map((x, i) => (i === n ? { ...x, name: e.target.value } : x)) })
                }
              />
              <Input
                aria-label={`Month ${n + 1}: days`}
                type="number"
                min={1}
                value={Number.isNaN(m.days) ? '' : m.days}
                onChange={e =>
                  set({ months: draft.months.map((x, i) => (i === n ? { ...x, days: whole(e.target.value) } : x)) })
                }
              />
              <Button
                variant="ghost"
                aria-label={`Remove month ${n + 1}`}
                onClick={() => set({ months: draft.months.filter((_, i) => i !== n) })}
              >
                <Trash2 {...ICON_PROPS} />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            className={iconClasses.host}
            onClick={() => set({ months: [...draft.months, { name: '', days: 30 }] })}
          >
            <Plus {...ICON_PROPS} className={iconClasses.icon} />
            Add month
          </Button>
        </fieldset>

        <fieldset className={styles.rows}>
          <legend>Weekdays</legend>
          {draft.weekdays.map((w, n) => (
            <div key={n} className={styles.rowLine}>
              <Input
                aria-label={`Weekday ${n + 1}`}
                value={w}
                onChange={e => set({ weekdays: draft.weekdays.map((x, i) => (i === n ? e.target.value : x)) })}
              />
              <Button
                variant="ghost"
                aria-label={`Remove weekday ${n + 1}`}
                onClick={() => set({ weekdays: draft.weekdays.filter((_, i) => i !== n), startWeekdayIndex: 0 })}
              >
                <Trash2 {...ICON_PROPS} />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            className={iconClasses.host}
            onClick={() => set({ weekdays: [...draft.weekdays, ''] })}
          >
            <Plus {...ICON_PROPS} className={iconClasses.icon} />
            Add weekday
          </Button>
        </fieldset>

        <fieldset className={styles.rows}>
          <legend>Seasons</legend>
          {draft.seasons.map((s, n) => (
            <div key={n} className={styles.rowLine}>
              <Input
                aria-label={`Season ${n + 1}: name`}
                value={s.name}
                onChange={e =>
                  set({ seasons: draft.seasons.map((x, i) => (i === n ? { ...x, name: e.target.value } : x)) })
                }
              />
              <select
                aria-label={`Season ${n + 1}: first month`}
                className={styles.select}
                value={s.startMonthIndex}
                onChange={e =>
                  set({
                    seasons: draft.seasons.map((x, i) =>
                      i === n ? { ...x, startMonthIndex: Number(e.target.value) } : x,
                    ),
                  })
                }
              >
                {monthOptions}
              </select>
              <select
                aria-label={`Season ${n + 1}: last month`}
                className={styles.select}
                value={s.endMonthIndex}
                onChange={e =>
                  set({
                    seasons: draft.seasons.map((x, i) =>
                      i === n ? { ...x, endMonthIndex: Number(e.target.value) } : x,
                    ),
                  })
                }
              >
                {monthOptions}
              </select>
              <Button
                variant="ghost"
                aria-label={`Remove season ${n + 1}`}
                onClick={() => set({ seasons: draft.seasons.filter((_, i) => i !== n) })}
              >
                <Trash2 {...ICON_PROPS} />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            className={iconClasses.host}
            onClick={() => set({ seasons: [...draft.seasons, { name: '', startMonthIndex: 0, endMonthIndex: 0 }] })}
          >
            <Plus {...ICON_PROPS} className={iconClasses.icon} />
            Add season
          </Button>
        </fieldset>

        <fieldset className={styles.rows}>
          <legend>Leap years</legend>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={!!draft.leapRule}
              onChange={e =>
                set({ leapRule: e.target.checked ? { everyYears: 4, monthIndex: 0, extraDays: 1 } : undefined })
              }
            />{' '}
            This calendar has leap years
          </label>
          {draft.leapRule && (
            <div className={styles.rowLine}>
              <Input
                aria-label="Leap year every (years)"
                type="number"
                min={1}
                value={Number.isNaN(draft.leapRule.everyYears) ? '' : draft.leapRule.everyYears}
                onChange={e => set({ leapRule: { ...draft.leapRule!, everyYears: whole(e.target.value) } })}
              />
              <select
                aria-label="Month that gains the days"
                className={styles.select}
                value={draft.leapRule.monthIndex}
                onChange={e => set({ leapRule: { ...draft.leapRule!, monthIndex: Number(e.target.value) } })}
              >
                {monthOptions}
              </select>
              <Input
                aria-label="Extra days"
                type="number"
                min={1}
                value={Number.isNaN(draft.leapRule.extraDays) ? '' : draft.leapRule.extraDays}
                onChange={e => set({ leapRule: { ...draft.leapRule!, extraDays: whole(e.target.value) } })}
              />
            </div>
          )}
        </fieldset>
      </div>

      <section aria-label="Preview" className={styles.preview}>
        <h4>Preview</h4>
        {preview ? (
          <>
            <p className={styles.previewDate}>{`${preview.weekdayName}, ${formatDate(draft, today)}`}</p>
            {preview.season && <p>{`Season: ${preview.season}`}</p>}
            <MonthGrid calendar={draft} year={preview.year} monthIndex={preview.monthIndex} today={today} />
          </>
        ) : (
          <ul role="alert" className={styles.problems}>
            {problems.map(p => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <Button type="submit" disabled={problems.length > 0 || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save calendar'}
        </Button>
        {saved && <p role="status">Calendar saved.</p>}
        {save.isError && (
          <p role="alert" className={styles.problems}>
            {friendlyMessage(save.error)}
          </p>
        )}
      </section>
    </form>
  );
}
