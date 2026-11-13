import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type MapMode = 'prep' | 'table';

interface MapModeState {
  modes: Record<string, MapMode>;
  setMode: (campaignId: string, mode: MapMode) => void;
}

export const MAP_MODE_KEY = 'dm-manager:map-mode';

const useMapModes = create<MapModeState>()(
  persist(
    set => ({
      modes: {},
      setMode: (campaignId, mode) => set(s => ({ modes: { ...s.modes, [campaignId]: mode } })),
    }),
    { name: MAP_MODE_KEY, partialize: ({ modes }) => ({ modes }) },
  ),
);

/** Prep (editing) or table (running the game) for the map views of one campaign, remembered in this browser. */
export function useMapMode(campaignId: string): [MapMode, (mode: MapMode) => void] {
  const mode = useMapModes(s => s.modes[campaignId] ?? 'prep');
  const setMode = useMapModes(s => s.setMode);
  return [mode, (next: MapMode) => setMode(campaignId, next)];
}
