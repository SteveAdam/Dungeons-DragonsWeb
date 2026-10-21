import { BookOpen, Castle, Shield, UserRound, type LucideIcon } from 'lucide-react';
import type { PinType } from '../../data/pins';

/** One icon per pin type, shared by the map markers and the pin panel. */
export const PIN_TYPE_ICONS: Record<PinType, LucideIcon> = {
  location: Castle,
  character: UserRound,
  faction: Shield,
  lore: BookOpen,
};

export const PIN_TYPE_LABELS: Record<PinType, string> = {
  location: 'Location',
  character: 'Character',
  faction: 'Faction',
  lore: 'Lore',
};
