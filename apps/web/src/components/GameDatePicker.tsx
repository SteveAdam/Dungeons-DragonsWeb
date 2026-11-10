// P3-7: choose an in-game date: day, month and year in the campaign's calendar, or a plain day number without one. It
// reports the absolute day, or null while the fields do not make a date.
import { absoluteDayToDate, dateToAbsoluteDay, isValidDate, type CalendarDefinition } from '@dnd-manager/rules-engine';
import { useId, useState } from 'react';
import styles from './GameDatePicker.module.css';
import { Input } from './ui';

interface Props {
  legend: string;
  calendar: CalendarDefinition | null;
  value: number | null;
  onChange: (day: number | null) => void;
}

interface Parts {
  day: string;
  month: number;
  year: string;
}

function partsOf(calendar: CalendarDefinition, value: number | null): Parts {
  if (value === null) return { day: '', month: 0, year: String(calendar.epochYear) };
  const d = absoluteDayToDate(calendar, value);
  return { day: String(d.dayOfMonth), month: d.monthIndex, year: String(d.year) };
}

function CalendarFields({ legend, calendar, value, onChange }: Props & { calendar: CalendarDefinition }) {
  const id = useId();
  const [parts, setParts] = useState(() => partsOf(calendar, value));
  const [bad, setBad] = useState(false);

  function change(next: Parts) {
    setParts(next);
    if (next.day.trim() === '') {
      setBad(false);
      onChange(null);
      return;
    }
    const date = { year: Number(next.year), monthIndex: next.month, dayOfMonth: Number(next.day) };
    const valid = isValidDate(calendar, date);
    setBad(!valid);
    onChange(valid ? dateToAbsoluteDay(calendar, date) : null);
  }

  return (
    <fieldset className={styles.picker}>
      <legend>{legend}</legend>
      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor={`${id}-day`}>Day</label>
          <Input
            id={`${id}-day`}
            type="number"
            min={1}
            aria-invalid={bad || undefined}
            value={parts.day}
            onChange={e => change({ ...parts, day: e.target.value })}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-month`}>Month</label>
          <select
            id={`${id}-month`}
            className={styles.select}
            value={parts.month}
            onChange={e => change({ ...parts, month: Number(e.target.value) })}
          >
            {calendar.months.map((m, i) => (
              <option key={m.name} value={i}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-year`}>Year</label>
          <Input
            id={`${id}-year`}
            type="number"
            min={calendar.epochYear}
            value={parts.year}
            onChange={e => change({ ...parts, year: e.target.value })}
          />
        </div>
      </div>
      {bad && (
        <p role="alert" className={styles.problem}>
          That date is not in this calendar.
        </p>
      )}
    </fieldset>
  );
}

function DayNumber({ legend, value, onChange }: Props) {
  const id = useId();
  return (
    <fieldset className={styles.picker}>
      <legend>{legend}</legend>
      <div className={styles.field}>
        <label htmlFor={`${id}-day`}>Day number</label>
        <Input
          id={`${id}-day`}
          type="number"
          min={1}
          value={value ?? ''}
          onChange={e => {
            const day = Number(e.target.value);
            onChange(Number.isInteger(day) && day >= 1 ? day : null);
          }}
        />
      </div>
    </fieldset>
  );
}

export function GameDatePicker(props: Props) {
  return props.calendar ? <CalendarFields {...props} calendar={props.calendar} /> : <DayNumber {...props} />;
}
