// P4-5: whether the messages panel is open, and (for a DM) which player's thread it shows. Kept outside React so the
// live message listener can ask whether a new message is already in view.
import { create } from 'zustand';

interface MessagePanelState {
  open: boolean;
  /** A DM's open thread; null shows the inbox. Players always see their own thread. */
  playerId: string | null;
  setOpen: (open: boolean) => void;
  showThread: (playerId: string | null) => void;
}

export const useMessagePanel = create<MessagePanelState>()(set => ({
  open: false,
  playerId: null,
  setOpen: open => set(open ? { open } : { open, playerId: null }),
  showThread: playerId => set({ open: true, playerId }),
}));
