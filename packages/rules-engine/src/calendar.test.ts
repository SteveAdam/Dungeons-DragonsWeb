import { describe, expect, it } from 'vitest';
import {
  absoluteDayFromSeconds,
  absoluteDayToDate,
  addDays,
  addMonths,
  dateToAbsoluteDay,
  daysBetween,
  DEFAULT_CALENDAR,
  formatDate,
  isValidDate,
  monthLength,
  secondsFromDay,
  validateCalendar,
  type CalendarDefinition,
} from './calendar';

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
  startWeekdayIndex: 2,
  seasons: [
    { name: 'Thaw', startMonthIndex: 0, endMonthIndex: 1 },
    { name: 'Bloom', startMonthIndex: 2, endMonthIndex: 2 },
  ],
};
const leapy: CalendarDefinition = { ...harptos, leapRule: { everyYears: 4, monthIndex: 1, extraDays: 2 } };
const yearDays = 91;

// a seeded generator, so a failure can be reproduced
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('round trips', () => {
  it.each([
    ['the default calendar', DEFAULT_CALENDAR],
    ['a custom calendar', harptos],
    ['a calendar with a leap rule', leapy],
    ['a leap rule every year', { ...harptos, leapRule: { everyYears: 1, monthIndex: 0, extraDays: 1 } }],
    ['a long leap cycle', { ...harptos, leapRule: { everyYears: 400, monthIndex: 2, extraDays: 5 } }],
  ] as [string, CalendarDefinition][])('%s holds for 20,000 random days', (_, calendar) => {
    const next = random(7);
    for (let i = 0; i < 20000; i++) {
      const day = 1 + Math.floor(next() * 2000000);
      expect(dateToAbsoluteDay(calendar, absoluteDayToDate(calendar, day))).toBe(day);
    }
  });

  it('every consecutive day is the next date, across many leap years', () => {
    let last = absoluteDayToDate(leapy, 1);
    for (let day = 2; day < 2000; day++) {
      const d = absoluteDayToDate(leapy, day);
      const newMonth = d.dayOfMonth === 1;
      if (newMonth) expect(last.dayOfMonth).toBe(monthLength(leapy, last.year, last.monthIndex));
      else expect(d.dayOfMonth).toBe(last.dayOfMonth + 1);
      last = d;
    }
  });
});

describe('absoluteDayToDate', () => {
  it('day 1 is the first day of the epoch year', () => {
    expect(absoluteDayToDate(harptos, 1)).toEqual({
      year: 1492,
      monthIndex: 0,
      monthName: 'Hammer',
      dayOfMonth: 1,
      weekdayIndex: 2,
      weekdayName: 'Three',
      season: 'Thaw',
    });
  });

  it('crosses month boundaries', () => {
    expect(absoluteDayToDate(harptos, 30)).toMatchObject({ monthName: 'Hammer', dayOfMonth: 30 });
    expect(absoluteDayToDate(harptos, 31)).toMatchObject({ monthName: 'Alturiak', dayOfMonth: 1 });
  });

  it('crosses year boundaries', () => {
    expect(absoluteDayToDate(harptos, yearDays)).toMatchObject({ year: 1492, monthName: 'Mirtul', dayOfMonth: 31 });
    expect(absoluteDayToDate(harptos, yearDays + 1)).toMatchObject({ year: 1493, monthName: 'Hammer', dayOfMonth: 1 });
  });

  it('adds leap days to the right month of a leap year only', () => {
    // 1492 is divisible by 4, 1493 is not
    expect(monthLength(leapy, 1492, 1)).toBe(32);
    expect(monthLength(leapy, 1493, 1)).toBe(30);
    expect(monthLength(leapy, 1492, 0)).toBe(30);
    expect(absoluteDayToDate(leapy, 62)).toMatchObject({ monthName: 'Alturiak', dayOfMonth: 32 });
    expect(absoluteDayToDate(leapy, 63)).toMatchObject({ monthName: 'Mirtul', dayOfMonth: 1 });
  });

  it('wraps the weekdays', () => {
    expect(absoluteDayToDate(harptos, 3).weekdayName).toBe('Five');
    expect(absoluteDayToDate(harptos, 4).weekdayName).toBe('One');
  });

  it('finds a season that runs over the new year', () => {
    const winter = { ...harptos, seasons: [{ name: 'Winter', startMonthIndex: 2, endMonthIndex: 0 }] };
    expect(absoluteDayToDate(winter, 1).season).toBe('Winter');
    expect(absoluteDayToDate(winter, 31).season).toBeNull();
    expect(absoluteDayToDate(winter, 61).season).toBe('Winter');
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects day %s', day => {
    expect(() => absoluteDayToDate(harptos, day)).toThrow(RangeError);
  });
});

describe('dateToAbsoluteDay', () => {
  it('counts from the epoch', () => {
    expect(dateToAbsoluteDay(harptos, { year: 1492, monthIndex: 0, dayOfMonth: 1 })).toBe(1);
    expect(dateToAbsoluteDay(harptos, { year: 1493, monthIndex: 0, dayOfMonth: 1 })).toBe(92);
  });

  it('rejects a date that does not exist or is before the epoch', () => {
    expect(() => dateToAbsoluteDay(harptos, { year: 1492, monthIndex: 0, dayOfMonth: 31 })).toThrow(RangeError);
    expect(() => dateToAbsoluteDay(harptos, { year: 1491, monthIndex: 0, dayOfMonth: 1 })).toThrow(RangeError);
    expect(() => dateToAbsoluteDay(harptos, { year: 1492, monthIndex: 3, dayOfMonth: 1 })).toThrow(RangeError);
  });

  it('knows a leap day exists only in a leap year', () => {
    expect(isValidDate(leapy, { year: 1492, monthIndex: 1, dayOfMonth: 32 })).toBe(true);
    expect(isValidDate(leapy, { year: 1493, monthIndex: 1, dayOfMonth: 32 })).toBe(false);
  });
});

describe('formatDate', () => {
  it('writes day, month, year and label', () => {
    expect(formatDate(harptos, 74)).toBe('14 Mirtul 1492 DR');
  });

  it('leaves no trailing space without a label', () => {
    expect(formatDate(DEFAULT_CALENDAR, 1)).toBe('1 Month 1 1');
  });
});

describe('days', () => {
  it('adds and subtracts', () => {
    expect(addDays(10, 5)).toBe(15);
    expect(addDays(10, -5)).toBe(5);
    expect(() => addDays(3, -3)).toThrow(RangeError);
    expect(daysBetween(10, 15)).toBe(5);
    expect(daysBetween(15, 10)).toBe(-5);
  });

  it('adds months, keeping the day where it can', () => {
    expect(formatDate(harptos, addMonths(harptos, 1, 1))).toBe('1 Alturiak 1492 DR');
    expect(
      formatDate(
        harptos,
        addMonths(harptos, dateToAbsoluteDay(harptos, { year: 1492, monthIndex: 2, dayOfMonth: 31 }), 1),
      ),
    ).toBe('30 Hammer 1493 DR');
  });

  it('works out the day from the clock', () => {
    expect(absoluteDayFromSeconds(0)).toBe(1);
    expect(absoluteDayFromSeconds(86399)).toBe(1);
    expect(absoluteDayFromSeconds(86400)).toBe(2);
    expect(secondsFromDay(2, 3600)).toBe(90000);
  });
});

describe('validateCalendar', () => {
  it('accepts the default and a custom calendar', () => {
    expect(validateCalendar(DEFAULT_CALENDAR)).toEqual([]);
    expect(validateCalendar(leapy)).toEqual([]);
  });

  it.each([
    ['no months', { months: [] }, /at least one month/],
    ['a month with no days', { months: [{ name: 'A', days: 0 }] }, /at least one day/],
    ['a month with no name', { months: [{ name: ' ', days: 3 }] }, /needs a name/],
    ['no weekdays', { weekdays: [] }, /at least one weekday/],
    ['a season past the months', { seasons: [{ name: 'S', startMonthIndex: 0, endMonthIndex: 9 }] }, /start and end/],
    ['a first weekday past the list', { startWeekdayIndex: 9 }, /first day/],
    ['a leap month past the months', { leapRule: { everyYears: 4, monthIndex: 9, extraDays: 1 } }, /leap days/],
    ['a leap rule of no years', { leapRule: { everyYears: 0, monthIndex: 0, extraDays: 1 } }, /leap year/],
  ] as [string, Partial<CalendarDefinition>, RegExp][])('rejects %s', (_, change, message) => {
    expect(validateCalendar({ ...harptos, ...change }).join(' ')).toMatch(message);
  });
});
