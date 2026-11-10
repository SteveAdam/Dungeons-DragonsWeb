// P3-7: the campaign's calendar: today, the month, the timeline of sessions and events, and the DM's controls.
import {
  absoluteDayFromSeconds,
  absoluteDayToDate,
  SECONDS_PER_DAY,
  secondsFromDay,
  type CalendarDefinition,
} from '@dnd-manager/rules-engine';
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { ErrorNotice } from '../../../components/ErrorNotice';
import { GameDatePicker } from '../../../components/GameDatePicker';
import { Button, ICON_PROPS, Input, Tag } from '../../../components/ui';
import type { WorldEvent } from '../../../data/calendar';
import { friendlyMessage } from '../../../data/errors';
import { useCampaign } from '../../../hooks/useCampaigns';
import {
  useCalendar,
  useDeleteWorldEvent,
  useNotes,
  useSaveWorldEvent,
  useSetGameDate,
  useWorldEvents,
} from '../../../hooks/useCalendar';
import { calendarClock, dayLabel } from '../../../lib/gameClock';
import styles from './calendar.module.css';
import { CalendarEditor } from './CalendarEditor';
import { MonthGrid, type DayMarker, type MarkerKind } from './MonthGrid';

interface TimelineEntry {
  key: string;
  day: number;
  kind: MarkerKind;
  title: string;
  text: string;
  hidden: boolean;
  event?: WorldEvent;
}

const KIND_WORD: Record<MarkerKind, string> = { session: 'SESSION', note: 'NOTE', event: 'EVENT' };

function SetDate({
  campaignId,
  calendar,
  gameSeconds,
}: {
  campaignId: string;
  calendar: CalendarDefinition | null;
  gameSeconds: number;
}) {
  const id = useId();
  const setDate = useSetGameDate(campaignId);
  const [day, setDay] = useState<number | null>(null);
  const [hour, setHour] = useState('8');
  const [minute, setMinute] = useState('0');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState('');
  const secondsIntoDay = Number(hour) * 3600 + Number(minute) * 60;
  const timeOk = secondsIntoDay >= 0 && secondsIntoDay < SECONDS_PER_DAY && Number.isInteger(secondsIntoDay);
  const rewinding = day !== null && timeOk && secondsFromDay(day, secondsIntoDay) < gameSeconds;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (day === null) return;
    setDone('');
    setDate.mutate(
      { day, secondsIntoDay, reason: reason.trim(), confirmRewind: confirm },
      {
        onSuccess: () => {
          setDone(`The date is now ${dayLabel(calendar, day)}.`);
          setConfirm(false);
          setReason('');
        },
      },
    );
  }

  return (
    <form className={styles.panel} aria-label="Set the date" onSubmit={submit}>
      <h4>Set the date</h4>
      <GameDatePicker
        key={calendar?.name ?? 'days'}
        legend="New date"
        calendar={calendar}
        value={day}
        onChange={setDay}
      />
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor={`${id}-hour`}>Hour</label>
          <Input
            id={`${id}-hour`}
            type="number"
            min={0}
            max={23}
            value={hour}
            onChange={e => setHour(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-minute`}>Minute</label>
          <Input
            id={`${id}-minute`}
            type="number"
            min={0}
            max={59}
            value={minute}
            onChange={e => setMinute(e.target.value)}
          />
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-reason`}>Reason</label>
        <Input id={`${id}-reason`} maxLength={180} value={reason} onChange={e => setReason(e.target.value)} />
      </div>
      {rewinding && (
        <label className={styles.check}>
          <input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} /> That is in the past.
          Move the clock back (this is logged, and effects may come back)
        </label>
      )}
      <Button type="submit" disabled={day === null || !timeOk || (rewinding && !confirm) || setDate.isPending}>
        {setDate.isPending ? 'Setting…' : 'Set the date'}
      </Button>
      {done && <p role="status">{done}</p>}
      {setDate.isError && (
        <p role="alert" className={styles.problems}>
          {friendlyMessage(setDate.error)}
        </p>
      )}
    </form>
  );
}

function EventForm({
  campaignId,
  calendar,
  today,
  editing,
  onDone,
}: {
  campaignId: string;
  calendar: CalendarDefinition | null;
  today: number;
  editing: WorldEvent | null;
  onDone: () => void;
}) {
  const id = useId();
  const save = useSaveWorldEvent(campaignId);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [day, setDay] = useState<number | null>(editing?.day ?? today);
  const [visible, setVisible] = useState(editing?.visibleToPlayers ?? false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (day === null) return;
    save.mutate(
      { draft: { title, description, day, visibleToPlayers: visible }, id: editing?.id },
      {
        onSuccess: () => {
          setTitle('');
          setDescription('');
          onDone();
        },
      },
    );
  }

  return (
    <form
      className={styles.panel}
      aria-label={editing ? `Change ${editing.title}` : 'Add a world event'}
      onSubmit={submit}
    >
      <h4>{editing ? 'Change the event' : 'Add a world event'}</h4>
      <div className={styles.field}>
        <label htmlFor={`${id}-title`}>Title</label>
        <Input id={`${id}-title`} maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <GameDatePicker legend="When" calendar={calendar} value={day} onChange={setDay} />
      <div className={styles.field}>
        <label htmlFor={`${id}-text`}>Description</label>
        <textarea
          id={`${id}-text`}
          className={styles.textarea}
          rows={3}
          maxLength={4000}
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>
      <label className={styles.check}>
        <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} /> Players can see this
      </label>
      <div className={styles.actions}>
        <Button type="submit" disabled={!title.trim() || day === null || save.isPending}>
          {save.isPending ? 'Saving…' : editing ? 'Save event' : 'Add event'}
        </Button>
        {editing && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
      {save.isError && (
        <p role="alert" className={styles.problems}>
          {friendlyMessage(save.error)}
        </p>
      )}
    </form>
  );
}

function Timeline({
  entries,
  calendar,
  canEdit,
  campaignId,
  onEdit,
}: {
  entries: TimelineEntry[];
  calendar: CalendarDefinition | null;
  canEdit: boolean;
  campaignId: string;
  onEdit: (event: WorldEvent) => void;
}) {
  const id = useId();
  const [filter, setFilter] = useState<MarkerKind | 'all'>('all');
  const remove = useDeleteWorldEvent(campaignId);
  const shown = entries.filter(e => filter === 'all' || e.kind === filter);
  return (
    <section aria-label="Timeline" className={styles.panel}>
      <div className={styles.timelineHead}>
        <h4>Timeline</h4>
        <div className={styles.field}>
          <label htmlFor={`${id}-filter`}>Show</label>
          <select
            id={`${id}-filter`}
            className={styles.select}
            value={filter}
            onChange={e => setFilter(e.target.value as MarkerKind | 'all')}
          >
            <option value="all">Everything</option>
            <option value="session">Sessions</option>
            <option value="note">Notes</option>
            <option value="event">World events</option>
          </select>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className={styles.hint}>Nothing dated yet.</p>
      ) : (
        <ol className={styles.timeline}>
          {shown.map(e => (
            <li key={e.key}>
              <span className={styles.timelineDate}>{dayLabel(calendar, e.day)}</span>
              <span className={styles.timelineTitle}>{e.title}</span>
              <Tag>{KIND_WORD[e.kind]}</Tag>
              {canEdit && e.hidden && <Tag>HIDDEN</Tag>}
              {e.text && <p className={styles.timelineText}>{e.text}</p>}
              {canEdit && e.event && (
                <span className={styles.actions}>
                  <Button
                    variant="ghost"
                    aria-label={`Change ${e.title}`}
                    onClick={() => onEdit(e.event as WorldEvent)}
                  >
                    <Pencil {...ICON_PROPS} />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Delete ${e.title}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate((e.event as WorldEvent).id)}
                  >
                    <Trash2 {...ICON_PROPS} />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {remove.isError && (
        <p role="alert" className={styles.problems}>
          {friendlyMessage(remove.error)}
        </p>
      )}
    </section>
  );
}

export function CalendarTab({ campaignId, dmMode }: { campaignId: string; dmMode: boolean }) {
  const campaign = useCampaign(campaignId);
  const calendar = useCalendar(campaignId);
  const events = useWorldEvents(campaignId, dmMode);
  const notes = useNotes(campaignId, dmMode);
  const [cursor, setCursor] = useState<{ year: number; monthIndex: number } | null>(null);
  const [editing, setEditing] = useState<WorldEvent | null>(null);
  const seconds = campaign.data?.gameSeconds ?? 0;
  const today = absoluteDayFromSeconds(seconds);
  const cal = calendar.data ?? null;

  const entries = useMemo<TimelineEntry[]>(() => {
    const fromEvents = (events.data ?? []).map(e => ({
      key: `event:${e.id}`,
      day: e.day,
      kind: 'event' as const,
      title: e.title,
      text: e.description,
      hidden: !e.visibleToPlayers,
      event: e,
    }));
    const fromNotes = (notes.data ?? []).flatMap(n =>
      n.ingameDay === null
        ? []
        : [
            {
              key: `note:${n.id}`,
              day: n.ingameDay,
              kind: n.kind,
              title: n.title,
              text: '',
              hidden: !n.visibleToPlayers,
            },
          ],
    );
    return [...fromEvents, ...fromNotes].sort((a, b) => a.day - b.day);
  }, [events.data, notes.data]);

  const markers = useMemo(() => {
    const map = new Map<number, DayMarker[]>();
    for (const e of entries) map.set(e.day, [...(map.get(e.day) ?? []), { kind: e.kind, title: e.title }]);
    return map;
  }, [entries]);

  if (calendar.isPending || campaign.isPending) return <p role="status">Consulting the almanac…</p>;
  if (calendar.isError) return <ErrorNotice error={calendar.error} onRetry={() => void calendar.refetch()} />;

  const now = cal ? absoluteDayToDate(cal, today) : null;
  const shown = cursor ?? (now ? { year: now.year, monthIndex: now.monthIndex } : null);
  const move = (by: number) => {
    if (!cal || !shown) return;
    const count = cal.months.length;
    const total = shown.monthIndex + by;
    setCursor({ year: shown.year + Math.floor(total / count), monthIndex: ((total % count) + count) % count });
  };
  const atStart = !!cal && !!shown && shown.year === cal.epochYear && shown.monthIndex === 0;

  return (
    <div className={styles.tab}>
      <div className={styles.main}>
        <section aria-label="Today" className={styles.panel}>
          <h3 className={styles.today_}>{calendarClock(seconds, cal)}</h3>
          {now && <p>{[now.weekdayName, now.season].filter(Boolean).join(', ')}</p>}
          {!cal && (
            <p className={styles.hint}>
              {dmMode
                ? 'No calendar yet: days are counted by number. Set one up below.'
                : 'Days are counted by number.'}
            </p>
          )}
        </section>

        {cal && shown && (
          <section aria-label="Month" className={styles.panel}>
            <div className={styles.monthNav}>
              <Button variant="ghost" aria-label="Previous month" disabled={atStart} onClick={() => move(-1)}>
                <ChevronLeft {...ICON_PROPS} />
              </Button>
              <Button variant="ghost" onClick={() => setCursor(null)}>
                Today
              </Button>
              <Button variant="ghost" aria-label="Next month" onClick={() => move(1)}>
                <ChevronRight {...ICON_PROPS} />
              </Button>
            </div>
            <MonthGrid calendar={cal} year={shown.year} monthIndex={shown.monthIndex} today={today} markers={markers} />
            <p className={styles.hint}>S session, N note, E world event</p>
          </section>
        )}

        {(events.isError || notes.isError) && (
          <ErrorNotice
            error={events.error ?? notes.error}
            onRetry={() => {
              void events.refetch();
              void notes.refetch();
            }}
          />
        )}
        <Timeline entries={entries} calendar={cal} canEdit={dmMode} campaignId={campaignId} onEdit={setEditing} />
      </div>

      {dmMode && (
        <aside className={styles.side} aria-label="DM calendar tools">
          <SetDate campaignId={campaignId} calendar={cal} gameSeconds={seconds} />
          <EventForm
            key={editing?.id ?? 'new'}
            campaignId={campaignId}
            calendar={cal}
            today={today}
            editing={editing}
            onDone={() => setEditing(null)}
          />
        </aside>
      )}

      {dmMode && (
        <details className={styles.settings}>
          <summary>Calendar settings</summary>
          <CalendarEditor campaignId={campaignId} calendar={cal} today={today} />
        </details>
      )}
    </div>
  );
}
