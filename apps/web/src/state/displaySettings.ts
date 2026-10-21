import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DisplaySettings {
  /** Flat surfaces: no paper textures, stains or shadows. */
  reduceTexture: boolean;
  /** A plain readable font for body text instead of IM Fell English. */
  plainFont: boolean;
}

interface DisplaySettingsState extends DisplaySettings {
  setReduceTexture: (on: boolean) => void;
  setPlainFont: (on: boolean) => void;
}

export const DISPLAY_SETTINGS_KEY = 'dm-manager:display';

/** Writes the settings onto <html> as data attributes; tokens.css reacts to them. */
export function applyDisplaySettings({ reduceTexture, plainFont }: DisplaySettings, root = document.documentElement) {
  root.dataset.reduceTexture = String(reduceTexture);
  root.dataset.plainFont = String(plainFont);
}

/** The display settings, saved in localStorage. Changing one applies it to the page at once. */
export const useDisplaySettings = create<DisplaySettingsState>()(
  persist(
    set => ({
      reduceTexture: false,
      plainFont: false,
      setReduceTexture: reduceTexture => set({ reduceTexture }),
      setPlainFont: plainFont => set({ plainFont }),
    }),
    {
      name: DISPLAY_SETTINGS_KEY,
      partialize: ({ reduceTexture, plainFont }) => ({ reduceTexture, plainFont }),
    },
  ),
);

// localStorage is read synchronously when the store is created, so the saved settings are on <html>
// before the first render (no flash of textures). After that, every change is mirrored.
applyDisplaySettings(useDisplaySettings.getState());
useDisplaySettings.subscribe(state => applyDisplaySettings(state));
