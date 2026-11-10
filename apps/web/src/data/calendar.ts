// P3-7: the campaign's calendar, world events and setting the clock to a date (0024_calendar.sql). A calendar is read
// by every member; hidden events are the DM's.
import { validateCalendar, type CalendarDefinition } from '@dnd-manager/rules-engine';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import type { Json } from '../types/database';
import { DataError, toDataError } from './errors';

const calendarSchema = z.object({
  name: z.string(),
  months: z.array(z.object({ name: z.string(), days: z.number() })),
  weekdays: z.array(z.string()),
  yearLabel: z.string(),
  epochYear: z.number(),
  startWeekdayIndex: z.number(),
  seasons: z.array(z.object({ name: z.string(), startMonthIndex: z.number(), endMonthIndex: z.number() })),
  leapRule: z.object({ everyYears: z.number(), monthIndex: z.number(), extraDays: z.number() }).optional(),
}) satisfies z.ZodType<CalendarDefinition>;

/** The campaign's calendar, or null when it has none (or one that can no longer be read). */
export async function getCalendar(campaignId: string): Promise<CalendarDefinition | null> {
  const { data, error } = await supabase
    .from('calendars')
    .select('definition')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (error) throw toDataError(error);
  if (!data) return null;
  const parsed = calendarSchema.safeParse(data.definition);
  if (!parsed.success || validateCalendar(parsed.data).length > 0) {
    console.warn('This campaign has a calendar that cannot be read, so days are shown by number.');
    return null;
  }
  return parsed.data;
}

/** DM only. */
export async function saveCalendar(campaignId: string, calendar: CalendarDefinition): Promise<void> {
  const problems = validateCalendar(calendar);
  if (problems.length > 0) throw new DataError('validation', problems[0]);
  const { error } = await supabase.from('calendars').upsert({
    campaign_id: campaignId,
    definition: calendar as unknown as NonNullable<Json>,
    updated_at: new Date().toISOString(),
  });
  if (error) throw toDataError(error);
}

/** A rewind the DM has not confirmed. */
export const REWIND_NEEDS_CONFIRMING = 'PT409';

/** DM only: puts the clock at this day and time. Returns the new game time. */
export async function setGameDate(
  campaignId: string,
  change: { day: number; secondsIntoDay: number; reason: string; confirmRewind: boolean },
): Promise<number> {
  const { data, error } = await supabase.rpc('set_game_date', {
    p_campaign: campaignId,
    p_day: change.day,
    p_seconds_into_day: change.secondsIntoDay,
    p_reason: change.reason,
    p_confirm_rewind: change.confirmRewind,
  });
  if (error) {
    if (error.code === '22023' || error.code === REWIND_NEEDS_CONFIRMING)
      throw new DataError('validation', error.message);
    throw toDataError(error);
  }
  return Number(data);
}

// WORLD EVENTS --------------------------------------------------------------------

export interface WorldEvent {
  id: string;
  campaignId: string;
  day: number;
  title: string;
  description: string;
  visibleToPlayers: boolean;
}

export type WorldEventDraft = Omit<WorldEvent, 'id' | 'campaignId'>;

const EVENT_COLUMNS = 'id, campaign_id, day, title, description, visible_to_players';

interface EventRow {
  id: string;
  campaign_id: string;
  day: number;
  title: string;
  description: string;
  visible_to_players: boolean;
}

const toEvent = (r: EventRow): WorldEvent => ({
  id: r.id,
  campaignId: r.campaign_id,
  day: r.day,
  title: r.title,
  description: r.description,
  visibleToPlayers: r.visible_to_players,
});

/** World events in day order. With includeHidden false the request itself asks only for visible ones. */
export async function listWorldEvents(campaignId: string, options: { includeHidden: boolean }): Promise<WorldEvent[]> {
  let query = supabase.from('world_events').select(EVENT_COLUMNS).eq('campaign_id', campaignId);
  if (!options.includeHidden) query = query.eq('visible_to_players', true);
  const { data, error } = await query.order('day');
  if (error) throw toDataError(error);
  return ((data ?? []) as EventRow[]).map(toEvent);
}

/** DM only: adds an event, or changes the one with this id. */
export async function saveWorldEvent(campaignId: string, draft: WorldEventDraft, id?: string): Promise<void> {
  const title = draft.title.trim();
  if (!title) throw new DataError('validation', 'Give the event a title.');
  if (!Number.isInteger(draft.day) || draft.day < 1) throw new DataError('validation', 'Choose a date for the event.');
  const row = {
    campaign_id: campaignId,
    day: draft.day,
    title,
    description: draft.description,
    visible_to_players: draft.visibleToPlayers,
  };
  const { error } = await (id
    ? supabase.from('world_events').update(row).eq('id', id)
    : supabase.from('world_events').insert(row));
  if (error) throw toDataError(error);
}

/** DM only. */
export async function deleteWorldEvent(id: string): Promise<void> {
  const { error } = await supabase.from('world_events').delete().eq('id', id);
  if (error) throw toDataError(error);
}
