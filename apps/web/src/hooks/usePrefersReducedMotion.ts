// Whether the person asked their system for less motion (prefers-reduced-motion), kept up to date.
import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';
const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null);

function subscribe(onChange: () => void) {
  const list = media();
  list?.addEventListener?.('change', onChange);
  return () => list?.removeEventListener?.('change', onChange);
}

export const usePrefersReducedMotion = () =>
  useSyncExternalStore(
    subscribe,
    () => media()?.matches ?? false,
    () => false,
  );
