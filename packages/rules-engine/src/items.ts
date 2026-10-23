// P2-7: items a character carries. Equipped armour and shields feed the armour class, equipped weapons the
// attacks, and equipped items (attuned too, when they need it) grant their effects as permanent effects named
// after the item. Requirements (P1-3) lock what the character cannot use.
import type { EffectMode, Effect, StatKey } from './effects';
import type { ArmorCategory, WeaponMastery, WeaponProperty } from './equipment';
import { ARMOR_CATEGORY_RULES } from './equipment';
import type { Requirement } from './requirements';
import type { SheetArmor, SheetWeapon, WeaponTraining } from './sheet';

export const ITEM_KINDS = ['weapon', 'armor', 'shield', 'gear', 'magic', 'consumable', 'quest'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Kinds that can be equipped (worn or wielded). Gear, consumables and quest items are only carried. */
export const EQUIPPABLE_KINDS: readonly ItemKind[] = ['weapon', 'armor', 'shield', 'magic'];

/** The weapon part of an item: the SRD weapon fields, without its id and name (the item has its own). */
export interface ItemWeapon {
  category: 'simple' | 'martial';
  kind: 'melee' | 'ranged';
  damage: { dice: string; type: string };
  properties: WeaponProperty[];
  versatileDice?: string;
  range?: { normal: number; long: number };
  ammunition?: string;
  mastery: WeaponMastery;
}

/** The armour part of an item: for a shield, baseAc is the bonus it adds. */
export interface ItemArmor {
  category: ArmorCategory;
  baseAc: number;
  strength: number | null;
  stealthDisadvantage: boolean;
}

/** An effect an item grants while equipped (and attuned, when it requires attunement). */
export interface ItemEffect {
  stat: StatKey;
  mode: EffectMode;
  value: number;
}

/** The rules an item carries (items.definition in the database). */
export interface ItemDefinition {
  weapon?: ItemWeapon;
  armor?: ItemArmor;
  /** +1, +2 or +3: to attack and damage for a weapon, to armour class for armour or a shield. */
  magicBonus?: number;
  requirements?: Requirement[];
  effects?: ItemEffect[];
  description?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  kind: ItemKind;
  definition: ItemDefinition;
  /** Pounds for one; null when the SRD gives none. */
  weight: number | null;
  quantity: number;
  requiresAttunement: boolean;
  equipped: boolean;
  attuned: boolean;
}

/** Most items a character can be attuned to at once (SRD "Attunement"). */
export const MAX_ATTUNED = 3;

/** Pounds carried: weight times quantity, summed. For display only (encumbrance is a later optional rule). */
export function carriedWeight(items: readonly Pick<InventoryItem, 'weight' | 'quantity'>[]): number {
  const total = items.reduce((sum, i) => sum + (i.weight ?? 0) * i.quantity, 0);
  return Math.round(total * 100) / 100;
}

/** Whether an item's benefits are working: equipped, and attuned when it needs attunement. */
export const itemActive = (i: InventoryItem) => i.equipped && (!i.requiresAttunement || i.attuned);

/** The permanent effects granted by the items that are working, named after their item. */
export function itemEffects(items: readonly InventoryItem[]): Effect[] {
  return items.filter(itemActive).flatMap(i =>
    (i.definition.effects ?? []).map((e, n): Effect => ({
      id: `item:${i.id}:${n}`,
      name: i.name,
      source: 'Item',
      stat: e.stat,
      mode: e.mode,
      value: e.value,
      duration: { kind: 'permanent' },
    })),
  );
}

export interface EquippedGear {
  armor: SheetArmor | null;
  /** The equipped shield's name and bonus (its base plus any magic). */
  shield: { name: string; bonus: number } | null;
  weapons: SheetWeapon[];
}

/** Whether weapon training covers a weapon (SRD class tables: e.g. Rogue "Martial weapons that have the Finesse or Light property"). */
export function trainedWith(
  w: Pick<ItemWeapon, 'category' | 'properties'>,
  training: readonly WeaponTraining[],
): boolean {
  if (w.category === 'simple') return training.includes('simple');
  return (
    training.includes('martial') ||
    (training.includes('martial-light') && w.properties.includes('light')) ||
    (training.includes('martial-finesse') && w.properties.includes('finesse'))
  );
}

/** Armour, shield and weapons from the equipped items, in the shapes computeSheet works with. */
export function equippedGear(
  items: readonly InventoryItem[],
  weaponProficiencies?: readonly WeaponTraining[],
): EquippedGear {
  const equipped = items.filter(i => i.equipped);
  const body = equipped.find(i => i.definition.armor && i.definition.armor.category !== 'shield');
  const shield = equipped.find(i => i.definition.armor?.category === 'shield');
  let armor: SheetArmor | null = null;
  if (body?.definition.armor) {
    const a = body.definition.armor;
    const rule = ARMOR_CATEGORY_RULES[a.category as Exclude<ArmorCategory, 'shield'>];
    armor = {
      name: body.name,
      base: a.baseAc + (body.definition.magicBonus ?? 0),
      // heavy armour adds no Dexterity at all (0 with a floor, see computeSheet)
      dexCap: rule.addsDex ? rule.dexMax : 0,
      ...(a.strength ? { strReq: a.strength } : {}),
      ...(rule.addsDex ? {} : { noDex: true }),
    };
  }
  const weapons = equipped
    .filter(i => i.definition.weapon)
    .map((i): SheetWeapon => {
      const w = i.definition.weapon!;
      return {
        id: i.id,
        name: i.name,
        ability: w.properties.includes('finesse') ? 'finesse' : w.kind === 'ranged' ? 'dex' : 'str',
        // Phase 1 sheets do not record weapon training, so a weapon counts as proficient there
        proficient: weaponProficiencies ? trainedWith(w, weaponProficiencies) : true,
        magicBonus: i.definition.magicBonus ?? 0,
        damage: w.damage.dice,
        damageType: w.damage.type,
        mastery: w.mastery[0].toUpperCase() + w.mastery.slice(1),
        ...(i.definition.requirements?.length ? { requirements: i.definition.requirements } : {}),
      };
    });
  return {
    armor,
    shield: shield
      ? { name: shield.name, bonus: (shield.definition.armor?.baseAc ?? 2) + (shield.definition.magicBonus ?? 0) }
      : null,
    weapons,
  };
}
