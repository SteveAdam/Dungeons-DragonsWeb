import type { ContentKind, DiscoveryState } from '@dnd-manager/rules-engine';

export const KIND_LABELS: Record<ContentKind, string> = {
  creature: 'Creature',
  folk: 'Folk',
  find: 'Find',
  shop: 'Shop',
  interactable: 'Interactable',
};

export const STATE_LABELS: Record<DiscoveryState, string> = {
  hidden: 'Hidden',
  hinted: 'Hinted',
  noticed: 'Noticed',
  found: 'Found',
};
