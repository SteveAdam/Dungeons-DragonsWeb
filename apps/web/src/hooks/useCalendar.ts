import type { CalendarDefinition } from '@dnd-manager/rules-engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Campaign } from '../data/campaigns';
import {
  deleteWorldEvent,
  getCalendar,
  listWorldEvents,
  saveCalendar,
  saveWorldEvent,
  setGameDate,
  type WorldEventDraft,
} from '../data/calendar';
import { deleteNote, listNotes, saveNote, type NoteDraft } from '../data/notes';
import { queryKeys } from './queryKeys';

export const useCalendar = (campaignId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.calendar(campaignId ?? ''),
    queryFn: () => getCalendar(campaignId as string),
    enabled: !!campaignId,
  });

export function useSaveCalendar(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (calendar: CalendarDefinition) => saveCalendar(campaignId, calendar),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.calendar(campaignId) }),
  });
}

/** DM only: puts the clock at a date, and moves every screen's cached time with it. */
export function useSetGameDate(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: { day: number; secondsIntoDay: number; reason: string; confirmRewind: boolean }) =>
      setGameDate(campaignId, change),
    onSuccess: gameSeconds => {
      client.setQueryData<Campaign>(queryKeys.campaign(campaignId), old => (old ? { ...old, gameSeconds } : old));
      return client.invalidateQueries({ queryKey: queryKeys.campaign(campaignId), exact: true });
    },
  });
}

export const useWorldEvents = (campaignId: string, includeHidden: boolean) =>
  useQuery({
    queryKey: queryKeys.worldEvents(campaignId, includeHidden),
    queryFn: () => listWorldEvents(campaignId, { includeHidden }),
  });

const eventsKey = (campaignId: string) => ['campaigns', campaignId, 'world-events'];

export function useSaveWorldEvent(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ draft, id }: { draft: WorldEventDraft; id?: string }) => saveWorldEvent(campaignId, draft, id),
    onSuccess: () => client.invalidateQueries({ queryKey: eventsKey(campaignId) }),
  });
}

export function useDeleteWorldEvent(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deleteWorldEvent,
    onSuccess: () => client.invalidateQueries({ queryKey: eventsKey(campaignId) }),
  });
}

export const useNotes = (campaignId: string, includeHidden: boolean) =>
  useQuery({
    queryKey: queryKeys.notes(campaignId, includeHidden),
    queryFn: () => listNotes(campaignId, { includeHidden }),
  });

const notesKey = (campaignId: string) => ['campaigns', campaignId, 'notes'];

export function useSaveNote(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ draft, id }: { draft: NoteDraft; id?: string }) => saveNote(campaignId, draft, id),
    onSuccess: () => client.invalidateQueries({ queryKey: notesKey(campaignId) }),
  });
}

export function useDeleteNote(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deleteNote,
    onSuccess: () => client.invalidateQueries({ queryKey: notesKey(campaignId) }),
  });
}
