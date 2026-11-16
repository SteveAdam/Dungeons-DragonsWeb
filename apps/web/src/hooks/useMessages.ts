// P4-5: messages and whispers, live. A 'message' event (on the player's own channel and the DMs' channel) carries no
// text: it says which thread changed, and the thread is read again. When the messages panel is not showing that thread,
// a toast says something arrived.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deletePrivateNote,
  listPrivateNotes,
  listThread,
  listThreads,
  markThreadRead,
  sendMessage,
  type SendInput,
} from '../data/messages';
import { useMessagePanel } from '../state/messagePanel';
import { useToasts } from '../state/toasts';
import { queryKeys } from './queryKeys';
import { useRealtimeEvent } from './useRealtime';

const threadsKey = (campaignId: string) => [...queryKeys.campaign(campaignId), 'threads'] as const;
const threadKey = (campaignId: string, playerId: string) =>
  [...queryKeys.campaign(campaignId), 'threads', playerId] as const;
const notesKey = (campaignId: string) => [...queryKeys.campaign(campaignId), 'private-notes'] as const;

export const useThreads = (campaignId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: threadsKey(campaignId ?? ''),
    queryFn: () => listThreads(campaignId as string),
    enabled: !!campaignId && enabled,
  });

export const useThread = (campaignId: string, playerId: string | null) =>
  useQuery({
    queryKey: threadKey(campaignId, playerId ?? ''),
    queryFn: () => listThread(campaignId, playerId as string),
    enabled: !!campaignId && !!playerId,
  });

export function useSendMessage(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<SendInput, 'campaignId'>) => sendMessage({ ...input, campaignId }),
    onSuccess: (_id, input) => {
      void client.invalidateQueries({ queryKey: threadKey(campaignId, input.playerId) });
      void client.invalidateQueries({ queryKey: threadsKey(campaignId), exact: true });
      if (input.saveNote) void client.invalidateQueries({ queryKey: notesKey(campaignId) });
    },
  });
}

export function useMarkThreadRead(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (playerId: string) => markThreadRead(campaignId, playerId),
    onSuccess: (marked, playerId) => {
      if (marked === 0) return;
      void client.invalidateQueries({ queryKey: threadKey(campaignId, playerId) });
      void client.invalidateQueries({ queryKey: threadsKey(campaignId), exact: true });
    },
  });
}

export interface LiveMessageOptions {
  me: string | undefined;
  isDm: boolean;
  /** A member's name, for the DM's toast. */
  nameOf: (userId: string) => string;
}

/** Keeps threads fresh as messages arrive, and toasts one the open panel is not showing. Mount once. */
export function useLiveMessages(campaignId: string, { me, isDm, nameOf }: LiveMessageOptions) {
  const client = useQueryClient();
  const push = useToasts(s => s.push);
  useRealtimeEvent('message', ({ playerId, kind }, meta) => {
    void client.invalidateQueries({ queryKey: threadKey(campaignId, playerId) });
    void client.invalidateQueries({ queryKey: threadsKey(campaignId), exact: true });
    if (meta.sender === me) return;
    const panel = useMessagePanel.getState();
    const showing = panel.open && (isDm ? panel.playerId === playerId : true);
    if (showing) return;
    if (isDm) push(`${nameOf(meta.sender)} sent you a message`);
    else push(kind === 'whisper' ? 'A whisper from the DM' : 'A new message from the DM');
  });
}

export const usePrivateNotes = (campaignId: string, enabled = true) =>
  useQuery({
    queryKey: notesKey(campaignId),
    queryFn: () => listPrivateNotes(campaignId),
    enabled: !!campaignId && enabled,
  });

export function useDeletePrivateNote(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePrivateNote(id),
    onSuccess: () => client.invalidateQueries({ queryKey: notesKey(campaignId) }),
  });
}
