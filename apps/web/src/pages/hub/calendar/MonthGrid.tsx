// P3-7: one month of a campaign's calendar, with what happened on each day.
import { absoluteDayToDate, dateToAbsoluteDay, monthLength, type CalendarDefinition } from '@dnd-manager/rules-engine';
import styles from './calendar.module.css';

export type MarkerKind = 'session' | 'note' | 'event';
export interface DayMarker {
  kind: MarkerKind;
  title: string;
}

const LETTER: Record<MarkerKind, string> = { session: 'S', note: 'N', event: 'E' };
const WORD: Record<MarkerKind, string> = { session: 'Session', note: 'Note', event: 'Event' };

interface Props {
  calendar: CalendarDefinition;
  year: number;
  monthIndex: number;
  today: number;
  markers?: ReadonlyMap<number, DayMarker[]>;
}

export function MonthGrid({ calendar, year, monthIndex, today, markers }: Props) {
  const first = dateToAbsoluteDay(calendar, { year, monthIndex, dayOfMonth: 1 });
  const length = monthLength(calendar, year, monthIndex);
  const width = calendar.weekdays.length;
  const offset = absoluteDayToDate(calendar, first).weekdayIndex;
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length }, (_, i) => first + i),
  ];
  while (cells.length % width !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / width }, (_, w) => cells.slice(w * width, (w + 1) * width));
  const label = `${calendar.months[monthIndex].name} ${year}${calendar.yearLabel ? ` ${calendar.yearLabel}` : ''}`;

  return (
    <div className={styles.gridScroll}>
      <table className={styles.grid}>
        <caption>{label}</caption>
        <thead>
          <tr>
            {calendar.weekdays.map(w => (
              <th key={w} scope="col" title={w}>
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, w) => (
            <tr key={w}>
              {week.map((day, d) =>
                day === null ? (
                  <td key={d} className={styles.blank} />
                ) : (
                  <td
                    key={d}
                    aria-current={day === today ? 'date' : undefined}
                    className={day === today ? styles.today : undefined}
                  >
                    <span className={styles.dayNumber}>{day - first + 1}</span>
                    {markers?.get(day)?.map(m => (
                      <span
                        key={`${m.kind}:${m.title}`}
                        className={styles.marker}
                        title={`${WORD[m.kind]}: ${m.title}`}
                      >
                        <span aria-hidden="true">{LETTER[m.kind]}</span>
                        <span className="visually-hidden">{`${WORD[m.kind]}: ${m.title}`}</span>
                      </span>
                    ))}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
