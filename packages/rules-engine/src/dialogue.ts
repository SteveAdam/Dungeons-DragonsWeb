// P4-6: when a prepared NPC line suits the group in front of the DM. A line may carry a condition; the DM's dialogue
// tool shows an "eligible" tag on the lines whose condition holds for the group being talked to. The context is built
// from what the server stores (the group's characters, what they carry, where the group is), never from what a
// player claims.

export type DialogueCondition =
  | { type: 'always' }
  /** Someone in the group carries an item of this name (case does not matter). */
  | { type: 'has_item'; item: string }
  /** The group is in this region. */
  | { type: 'in_region'; regionId: string }
  /** Someone in the group has reached this level. */
  | { type: 'level_at_least'; level: number }
  /** This character is in the group. */
  | { type: 'is_party_member'; characterId: string };

export type DialogueConditionType = DialogueCondition['type'];

export const DIALOGUE_CONDITION_TYPES: readonly DialogueConditionType[] = [
  'always',
  'has_item',
  'in_region',
  'level_at_least',
  'is_party_member',
];

export interface DialogueContext {
  /** The characters in the group being talked to. */
  characterIds: readonly string[];
  /** The names of everything those characters carry. */
  itemNames: readonly string[];
  /** Where the group is: its region, or null. */
  regionId: string | null;
  /** Each character's level. */
  levels: readonly number[];
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** A stored condition, checked; null when it is not one this engine knows (such a line is never eligible). */
export function parseDialogueCondition(raw: unknown): DialogueCondition | null {
  if (!isObject(raw)) return null;
  switch (raw.type) {
    case 'always':
      return { type: 'always' };
    case 'has_item':
      return nonEmpty(raw.item) ? { type: 'has_item', item: raw.item.trim() } : null;
    case 'in_region':
      return nonEmpty(raw.regionId) ? { type: 'in_region', regionId: raw.regionId } : null;
    case 'level_at_least':
      return Number.isInteger(raw.level) && (raw.level as number) >= 1 && (raw.level as number) <= 20
        ? { type: 'level_at_least', level: raw.level as number }
        : null;
    case 'is_party_member':
      return nonEmpty(raw.characterId) ? { type: 'is_party_member', characterId: raw.characterId } : null;
    default:
      return null;
  }
}

/**
 * Whether a line's condition holds for this group. No condition means the line always suits; a condition this
 * engine does not understand never does (better to hide a line than to offer one the DM did not mean).
 */
export function evaluateCondition(condition: unknown, context: DialogueContext): boolean {
  if (condition === null || condition === undefined) return true;
  const c = parseDialogueCondition(condition);
  if (!c) return false;
  switch (c.type) {
    case 'always':
      return true;
    case 'has_item': {
      const wanted = c.item.toLocaleLowerCase();
      return context.itemNames.some(name => name.trim().toLocaleLowerCase() === wanted);
    }
    case 'in_region':
      return context.regionId === c.regionId;
    case 'level_at_least':
      return context.levels.some(level => level >= c.level);
    case 'is_party_member':
      return context.characterIds.includes(c.characterId);
  }
}

/** The condition in a few words, for the line's tag ("if Crown Shard"); names come from the caller. */
export function describeCondition(
  condition: unknown,
  names: { region?: (id: string) => string | undefined; character?: (id: string) => string | undefined } = {},
): string | null {
  if (condition === null || condition === undefined) return null;
  const c = parseDialogueCondition(condition);
  if (!c) return 'if (unknown condition)';
  switch (c.type) {
    case 'always':
      return null;
    case 'has_item':
      return `if ${c.item}`;
    case 'in_region':
      return `if in ${names.region?.(c.regionId) ?? 'a region'}`;
    case 'level_at_least':
      return `if level ${c.level}+`;
    case 'is_party_member':
      return `if ${names.character?.(c.characterId) ?? 'a character'} is there`;
  }
}
