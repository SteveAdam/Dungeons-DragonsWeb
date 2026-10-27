import type { SpawnPinKind } from '@dnd-manager/rules-engine';
import { Gem, Hand, PawPrint, Skull, type LucideIcon } from 'lucide-react';

/** One icon per spawn pin kind (P3-2), shared by the map markers and the spawn pin panel. */
export const SPAWN_PIN_ICONS: Record<SpawnPinKind, LucideIcon> = {
  creature: PawPrint,
  find: Gem,
  interactable: Hand,
  trap: Skull,
};

export const SPAWN_PIN_LABELS: Record<SpawnPinKind, string> = {
  creature: 'Creature',
  find: 'Find',
  interactable: 'Interactable',
  trap: 'Trap',
};
