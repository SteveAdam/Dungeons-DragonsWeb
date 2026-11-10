// P3-5: the library's filters, on their own so the rules can be tested without the screen.
import { spellTier, type TierClass, type TierOfPlay } from '@dnd-manager/rules-engine';
import type { SrdMonster, SrdSpell } from '@dnd-manager/srd-data/schemas';

export type LibrarySource = 'srd' | 'campaign';

export interface LibraryFilters {
  /** Which shelves to show. Everything imported is SRD; campaign entries arrive with custom content (P3-6). */
  sources: LibrarySource[];
  /** Spells only. None picked means every tier. */
  tiers: TierOfPlay[];
  /** Spells only: a class name as the SRD prints it, or '' for any. */
  className: string;
  /** Monsters only: the lowest and highest challenge rating, as numbers (1/4 is 0.25). */
  crMin: number | null;
  crMax: number | null;
  /** Weapons (simple, martial) and armour (light, medium, heavy, shield), or '' for any. */
  category: string;
  search: string;
}

export const NO_FILTERS: LibraryFilters = {
  sources: ['srd', 'campaign'],
  tiers: [],
  className: '',
  crMin: null,
  crMax: null,
  category: '',
  search: '',
};

/** Whether a name holds the search text, whatever its case. */
export const matchesSearch = (name: string, search: string) => name.toLowerCase().includes(search.trim().toLowerCase());

/** Whether the entry's shelf is showing: the DM's own entries are marked `custom`. */
const showsSource = (entry: { custom?: unknown }, f: LibraryFilters) =>
  f.sources.includes(entry.custom ? 'campaign' : 'srd');

export function filterSpells<T extends SrdSpell & { custom?: unknown }>(
  spells: T[],
  classes: readonly TierClass[],
  f: LibraryFilters,
): T[] {
  return spells.filter(s => {
    if (!showsSource(s, f) || !matchesSearch(s.name, f.search)) return false;
    if (f.className && !s.classes.includes(f.className)) return false;
    if (f.tiers.length === 0) return true;
    const tier = spellTier(s, classes);
    return tier !== 'unknown' && f.tiers.includes(tier);
  });
}

export function filterMonsters<T extends SrdMonster & { custom?: unknown }>(monsters: T[], f: LibraryFilters): T[] {
  return monsters.filter(
    m =>
      showsSource(m, f) &&
      matchesSearch(m.name, f.search) &&
      (f.crMin === null || m.challengeValue >= f.crMin) &&
      (f.crMax === null || m.challengeValue <= f.crMax),
  );
}

export function filterEquipment<T extends { name: string; category?: string; custom?: unknown }>(
  items: T[],
  f: LibraryFilters,
): T[] {
  return items.filter(
    i => showsSource(i, f) && matchesSearch(i.name, f.search) && (!f.category || i.category === f.category),
  );
}

/** The challenge ratings on the shelves, lowest first, for the range pickers. */
export function challengeRatings(monsters: SrdMonster[]): { label: string; value: number }[] {
  const seen = new Map(monsters.map(m => [m.challengeValue, m.challengeRating]));
  return [...seen].sort(([a], [b]) => a - b).map(([value, label]) => ({ label, value }));
}
