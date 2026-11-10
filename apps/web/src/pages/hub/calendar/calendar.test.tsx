import { dateToAbsoluteDay, DEFAULT_CALENDAR, type CalendarDefinition } from '@dnd-manager/rules-engine';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameDatePicker } from '../../../components/GameDatePicker';
import * as calendarApi from '../../../data/calendar';
import * as notesApi from '../../../data/notes';
import type { Note } from '../../../data/notes';
import { axeViolations } from '../../../test/axe';
import { CalendarEditor } from './CalendarEditor';
import { CalendarTab } from './CalendarTab';
import { NotesTab } from './NotesTab';

vi.mock('../../../data/calendar');
vi.mock('../../../data/notes');
let gameSeconds = 0;
vi.mock('../../../hooks/useCampaigns', () => ({
  useCampaign: () => ({ isPending: false, data: { gameSeconds } }),
}));

const harptos: CalendarDefinition = {
  name: 'Harptos',
  months: [
    { name: 'Hammer', days: 30 },
    { name: 'Alturiak', days: 30 },
    { name: 'Mirtul', days: 31 },
  ],
  weekdays: ['One', 'Two', 'Three', 'Four', 'Five'],
  yearLabel: 'DR',
  epochYear: 1492,
  startWeekdayIndex: 0,
  seasons: [{ name: 'Thaw', startMonthIndex: 0, endMonthIndex: 2 }],
};
const MIRTUL_14 = dateToAbsoluteDay(harptos, { year: 1492, monthIndex: 2, dayOfMonth: 14 });

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const blankNote: Note = {
  id: 'n1',
  campaignId: 'c1',
  kind: 'session',
  title: 'The Vault',
  body: 'We went in.',
  visibleToPlayers: true,
  sessionNo: 3,
  ingameDay: null,
  legacyDate: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  gameSeconds = 0;
  vi.mocked(calendarApi.getCalendar).mockResolvedValue(harptos);
  vi.mocked(calendarApi.listWorldEvents).mockResolvedValue([]);
  vi.mocked(calendarApi.saveCalendar).mockResolvedValue();
  vi.mocked(calendarApi.saveWorldEvent).mockResolvedValue();
  vi.mocked(calendarApi.setGameDate).mockResolvedValue(0);
  vi.mocked(notesApi.listNotes).mockResolvedValue([]);
  vi.mocked(notesApi.saveNote).mockResolvedValue();
});

function Picker({
  start,
  calendar,
  onDay,
}: {
  start: number | null;
  calendar: CalendarDefinition | null;
  onDay: (d: number | null) => void;
}) {
  const [value, setValue] = useState(start);
  return (
    <GameDatePicker
      legend="When"
      calendar={calendar}
      value={value}
      onChange={d => {
        setValue(d);
        onDay(d);
      }}
    />
  );
}

describe('GameDatePicker', () => {
  it('shows an existing date in day, month and year', () => {
    wrap(<Picker start={MIRTUL_14} calendar={harptos} onDay={vi.fn()} />);
    expect(screen.getByLabelText('Day')).toHaveValue(14);
    expect(screen.getByLabelText('Month')).toHaveValue('2');
    expect(screen.getByLabelText('Year')).toHaveValue(1492);
  });

  it('turns a chosen date into the absolute day, and back', async () => {
    const user = userEvent.setup();
    const onDay = vi.fn();
    wrap(<Picker start={null} calendar={harptos} onDay={onDay} />);
    await user.selectOptions(screen.getByLabelText('Month'), 'Mirtul');
    await user.type(screen.getByLabelText('Day'), '14');
    expect(onDay).toHaveBeenLastCalledWith(MIRTUL_14);
  });

  it('reports no day for a date the calendar does not have', async () => {
    const user = userEvent.setup();
    const onDay = vi.fn();
    wrap(<Picker start={null} calendar={harptos} onDay={onDay} />);
    await user.type(screen.getByLabelText('Day'), '31');
    expect(onDay).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('alert')).toHaveTextContent('not in this calendar');
  });

  it('asks for a plain day number without a calendar', async () => {
    const user = userEvent.setup();
    const onDay = vi.fn();
    wrap(<Picker start={null} calendar={null} onDay={onDay} />);
    await user.type(screen.getByLabelText('Day number'), '42');
    expect(onDay).toHaveBeenLastCalledWith(42);
  });
});

describe('CalendarEditor', () => {
  it('previews the date live as months are named, and saves', async () => {
    const user = userEvent.setup();
    const { container } = wrap(<CalendarEditor campaignId="c1" calendar={null} today={1} />);
    const preview = screen.getByRole('region', { name: 'Preview' });
    expect(preview).toHaveTextContent('Firstday, 1 Month 1 1');

    await user.clear(screen.getByLabelText('Month 1: name'));
    await user.type(screen.getByLabelText('Month 1: name'), 'Hammer');
    await user.type(screen.getByLabelText('Year label'), 'DR');
    expect(preview).toHaveTextContent('1 Hammer 1 DR');
    expect(within(preview).getByRole('table')).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Save calendar' }));
    expect(calendarApi.saveCalendar).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ yearLabel: 'DR', months: expect.arrayContaining([{ name: 'Hammer', days: 30 }]) }),
    );
  });

  it('says what is wrong instead of previewing, and will not save', async () => {
    const user = userEvent.setup();
    wrap(<CalendarEditor campaignId="c1" calendar={DEFAULT_CALENDAR} today={1} />);
    await user.clear(screen.getByLabelText('Month 2: days'));
    expect(screen.getByRole('alert')).toHaveTextContent('at least one day');
    expect(screen.getByRole('button', { name: 'Save calendar' })).toBeDisabled();
  });

  it('adds a leap rule', async () => {
    const user = userEvent.setup();
    wrap(<CalendarEditor campaignId="c1" calendar={harptos} today={1} />);
    await user.click(screen.getByRole('checkbox', { name: /leap years/ }));
    await user.click(screen.getByRole('button', { name: 'Save calendar' }));
    expect(calendarApi.saveCalendar).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ leapRule: { everyYears: 4, monthIndex: 0, extraDays: 1 } }),
    );
  });
});

describe('CalendarTab', () => {
  const event = {
    id: 'e1',
    campaignId: 'c1',
    day: MIRTUL_14,
    title: 'The Festival',
    description: 'Crowds.',
    visibleToPlayers: true,
  };

  it('shows the date, marks today, and lists events in the timeline', async () => {
    gameSeconds = (MIRTUL_14 - 1) * 86400 + 18 * 3600;
    vi.mocked(calendarApi.listWorldEvents).mockResolvedValue([event]);
    wrap(<CalendarTab campaignId="c1" dmMode={false} />);
    expect(await screen.findByRole('heading', { name: '14 Mirtul 1492 DR, 18:00' })).toBeInTheDocument();
    expect(await screen.findByText('Event: The Festival', { selector: 'span' })).toBeInTheDocument();
    expect(document.querySelector('[aria-current="date"]')).toHaveTextContent('14');
    expect(within(screen.getByRole('region', { name: 'Timeline' })).getByText('The Festival')).toBeInTheDocument();
  });

  it('shows a player no DM tools, and asks only for visible events', async () => {
    wrap(<CalendarTab campaignId="c1" dmMode={false} />);
    await screen.findByRole('region', { name: 'Timeline' });
    expect(screen.queryByRole('form', { name: 'Set the date' })).not.toBeInTheDocument();
    expect(screen.queryByText('Calendar settings')).not.toBeInTheDocument();
    expect(calendarApi.listWorldEvents).toHaveBeenCalledWith('c1', { includeHidden: false });
    expect(notesApi.listNotes).toHaveBeenCalledWith('c1', { includeHidden: false });
  });

  it('counts days by number without a calendar', async () => {
    gameSeconds = 86400 * 4;
    vi.mocked(calendarApi.getCalendar).mockResolvedValue(null);
    wrap(<CalendarTab campaignId="c1" dmMode />);
    expect(await screen.findByRole('heading', { name: 'Day 5, 00:00' })).toBeInTheDocument();
  });

  it('asks for confirmation before moving the clock back', async () => {
    const user = userEvent.setup();
    gameSeconds = (MIRTUL_14 - 1) * 86400;
    const { container } = wrap(<CalendarTab campaignId="c1" dmMode />);
    const form = await screen.findByRole('form', { name: 'Set the date' });
    await user.type(within(form).getByLabelText('Day'), '1');
    const submit = within(form).getByRole('button', { name: 'Set the date' });
    expect(submit).toBeDisabled();
    expect(await axeViolations(container)).toEqual([]);
    await user.click(within(form).getByRole('checkbox', { name: /in the past/ }));
    await user.click(submit);
    expect(calendarApi.setGameDate).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ day: 1, confirmRewind: true }),
    );
  });

  it('adds a world event for the day chosen, hidden unless told otherwise', async () => {
    const user = userEvent.setup();
    wrap(<CalendarTab campaignId="c1" dmMode />);
    const form = await screen.findByRole('form', { name: 'Add a world event' });
    await user.type(within(form).getByLabelText('Title'), 'The Coup');
    await user.click(within(form).getByRole('button', { name: 'Add event' }));
    expect(calendarApi.saveWorldEvent).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ title: 'The Coup', day: 1, visibleToPlayers: false }),
      undefined,
    );
  });
});

describe('NotesTab', () => {
  it('records an in-game date that reads back as the same date', async () => {
    const user = userEvent.setup();
    wrap(<NotesTab campaignId="c1" dmMode />);
    await user.click(await screen.findByRole('button', { name: 'New note' }));
    const form = screen.getByRole('form', { name: 'New note' });
    await user.type(within(form).getByLabelText('Title'), 'Session one');
    await user.selectOptions(await within(form).findByLabelText('Month'), 'Mirtul');
    await user.type(within(form).getByLabelText('Day'), '14');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(notesApi.saveNote).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ title: 'Session one', ingameDay: MIRTUL_14 }),
      undefined,
    );
  });

  it('shows a dated note in the calendar', async () => {
    vi.mocked(notesApi.listNotes).mockResolvedValue([{ ...blankNote, ingameDay: MIRTUL_14 }]);
    wrap(<NotesTab campaignId="c1" dmMode={false} />);
    expect(await screen.findByText('14 Mirtul 1492 DR')).toBeInTheDocument();
  });

  it('shows old date text read-only, with a Convert button that opens the picker', async () => {
    const user = userEvent.setup();
    vi.mocked(notesApi.listNotes).mockResolvedValue([{ ...blankNote, legacyDate: 'Late spring' }]);
    wrap(<NotesTab campaignId="c1" dmMode />);
    await user.click(await screen.findByRole('button', { name: 'Convert the date of The Vault' }));
    const form = screen.getByRole('form', { name: 'Change The Vault' });
    expect(within(form).getByText('Old date text: Late spring')).toBeInTheDocument();
    expect(await within(form).findByLabelText('Month')).toBeInTheDocument();
  });

  it('gives a player no way to convert or change a note', async () => {
    vi.mocked(notesApi.listNotes).mockResolvedValue([{ ...blankNote, legacyDate: 'Late spring' }]);
    wrap(<NotesTab campaignId="c1" dmMode={false} />);
    expect(await screen.findByText(/Late spring/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Convert/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New note' })).not.toBeInTheDocument();
  });
});
