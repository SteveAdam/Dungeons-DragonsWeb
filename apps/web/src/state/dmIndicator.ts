import { useEffect } from 'react';
import { create } from 'zustand';

interface DmIndicatorState {
  /** True while the page on screen is showing DM-only content. */
  active: boolean;
  setActive: (active: boolean) => void;
}

/**
 * Tells the app header whether to show the DM mode badge and top rule. DM mode itself is decided per
 * campaign (useDmMode); the page that knows the answer reports it here, and the header reads it.
 */
export const useDmIndicator = create<DmIndicatorState>()(set => ({
  active: false,
  setActive: active => set({ active }),
}));

/** Call from a page: shows the badge while `active` is true and clears it when the page goes away. */
export function useShowDmIndicator(active: boolean) {
  const setActive = useDmIndicator(s => s.setActive);
  useEffect(() => {
    setActive(active);
    return () => setActive(false);
  }, [active, setActive]);
}
