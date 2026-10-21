import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DmModeState {
  /** The DM's own preference. It only has an effect in campaigns where they are the DM. */
  dmMode: boolean;
  setDmMode: (on: boolean) => void;
}

/** The one global store for DM mode. Persisted in localStorage. DMs start with it on. */
export const useDmModeStore = create<DmModeState>()(
  persist(set => ({ dmMode: true, setDmMode: dmMode => set({ dmMode }) }), {
    name: 'dm-manager:dm-mode',
    partialize: state => ({ dmMode: state.dmMode }),
  }),
);
