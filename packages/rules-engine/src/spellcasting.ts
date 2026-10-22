// P2-5: spellcasting, following the SRD 5.2.1 ("Spells", the class Spellcasting features, the Rules Glossary's
// Concentration and Ritual entries, and the Wizard's "Expanding and Replacing a Spellbook").
//
// This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast
// LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons
// Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
import type { ClassDef } from './progression';

/** What the engine needs from a spell (the full records are in packages/srd-data). */
export interface SpellDef {
  id: string;
  name: string;
  /** 0 for a cantrip. */
  level: number;
  concentration: boolean;
  ritual: boolean;
  /** The classes whose spell list has it, e.g. ['Sorcerer', 'Wizard']. */
  classes: string[];
  mechanics?: {
    damage?: { dice: string; type: string; perSlotLevel?: string };
    healing?: { dice: string; addAbilityModifier: boolean; perSlotLevel?: string };
    cantripScaling?: boolean;
  };
}

// SPELL SAVE DC AND ATTACK ------------------------------------------------

/** "Spell save DC = 8 + spellcasting ability modifier + Proficiency Bonus" */
export const spellSaveDc = (proficiencyBonus: number, abilityModifier: number) =>
  8 + abilityModifier + proficiencyBonus;
/** "Spell attack bonus = spellcasting ability modifier + Proficiency Bonus" */
export const spellAttackBonus = (proficiencyBonus: number, abilityModifier: number) =>
  abilityModifier + proficiencyBonus;

// SPELL SLOTS ----------------------------------------------------------------

/** Spell slots by level: index 0 is level 1, index 8 is level 9. */
export interface SlotState {
  max: number[];
  used: number[];
}

const SLOT_LEVELS = 9;
const asCount = (v: number | string | undefined) => (typeof v === 'number' ? v : 0);

/**
 * The spell slots a class has at a level, from its class table: the Spell Slots columns (1 to 9), or for Pact Magic
 * the number of slots and their one level (the Warlock's Spell Slots and Slot Level columns).
 */
export function slotsFor(def: ClassDef, level: number): number[] {
  const row = def.levels.find(l => l.level === level);
  if (!row) throw new RangeError(`${def.name} is not described at level ${level}`);
  const slots = Array<number>(SLOT_LEVELS).fill(0);
  if ('slotLevel' in row.columns) {
    const at = asCount(row.columns.slotLevel);
    if (at >= 1) slots[at - 1] = asCount(row.columns.spellSlots);
    return slots;
  }
  for (let l = 1; l <= SLOT_LEVELS; l++) slots[l - 1] = asCount(row.columns[`slots${l}`]);
  return slots;
}

export const freshSlots = (max: number[]): SlotState => ({ max: [...max], used: max.map(() => 0) });
const available = (s: SlotState, level: number) => (s.max[level - 1] ?? 0) - (s.used[level - 1] ?? 0);

export interface CastResult {
  slotState: SlotState;
  errors: string[];
  /** The slot spent, or null for a cantrip (or a failed cast). */
  slotLevel: number | null;
  /** Damage and healing dice at the level cast, with the "Using a Higher-Level Spell Slot" increase. */
  damageDice?: string;
  healingDice?: string;
}

/** "3d4" plus 2 x "1d4" is "5d4"; dice of different sizes are listed: "8d6 + 2d8". */
export function addDice(base: string, per: string, times: number): string {
  if (times <= 0) return base;
  const a = /^(\d+)d(\d+)$/.exec(base);
  const b = /^(\d+)d(\d+)$/.exec(per);
  if (a && b && a[2] === b[2]) return `${Number(a[1]) + Number(b[1]) * times}d${a[2]}`;
  if (!b) throw new RangeError(`"${per}" is not a number of dice`);
  return `${base} + ${Number(b[1]) * times}d${b[2]}`;
}

/**
 * Casts a spell. A cantrip spends nothing. A spell of level 1 or higher needs an unspent slot of its level or
 * higher: the one asked for, or the lowest that is free. The state passed in is not changed.
 */
export function castSpell(slotState: SlotState, spell: SpellDef, slotLevel?: number): CastResult {
  const fail = (error: string): CastResult => ({ slotState, errors: [error], slotLevel: null });
  if (spell.level === 0) return { slotState, errors: [], slotLevel: null, ...dice(spell, 0) };
  let level = slotLevel;
  if (level === undefined) {
    level = Array.from({ length: SLOT_LEVELS }, (_, i) => i + 1).find(
      l => l >= spell.level && available(slotState, l) > 0,
    );
    if (level === undefined) return fail(`No spell slot of level ${spell.level} or higher is left for ${spell.name}`);
  }
  if (!Number.isInteger(level) || level < 1 || level > SLOT_LEVELS)
    return fail(`There is no level ${level} spell slot`);
  if (level < spell.level) return fail(`${spell.name} needs a slot of level ${spell.level} or higher`);
  if (available(slotState, level) <= 0) return fail(`No level ${level} spell slot is left`);
  const used = [...slotState.used];
  used[level - 1] = (used[level - 1] ?? 0) + 1;
  return {
    slotState: { max: [...slotState.max], used },
    errors: [],
    slotLevel: level,
    ...dice(spell, level - spell.level),
  };
}

function dice(spell: SpellDef, above: number): Pick<CastResult, 'damageDice' | 'healingDice'> {
  const m = spell.mechanics;
  return {
    ...(m?.damage
      ? { damageDice: m.damage.perSlotLevel ? addDice(m.damage.dice, m.damage.perSlotLevel, above) : m.damage.dice }
      : {}),
    ...(m?.healing
      ? {
          healingDice: m.healing.perSlotLevel ? addDice(m.healing.dice, m.healing.perSlotLevel, above) : m.healing.dice,
        }
      : {}),
  };
}

/** Every spent slot comes back (a Long Rest, or a Short Rest for Pact Magic). */
export const regainSlots = (s: SlotState): SlotState => freshSlots(s.max);

// CANTRIPS ---------------------------------------------------------------------

/** "Cantrip Upgrade. The damage increases by 1d6 when you reach levels 5 (2d6), 11 (3d6), and 17 (4d6)." */
export const CANTRIP_UPGRADE_LEVELS = [5, 11, 17] as const;

/** A damage cantrip's dice at a character level: one more set of the base dice at each upgrade level. */
export function cantripDamageDice(baseDice: string, characterLevel: number): string {
  const m = /^(\d+)d(\d+)$/.exec(baseDice);
  if (!m) throw new RangeError(`"${baseDice}" is not a number of dice`);
  if (!Number.isInteger(characterLevel) || characterLevel < 1 || characterLevel > 20) {
    throw new RangeError(`A character level is 1 to 20, not ${characterLevel}`);
  }
  const tier = 1 + CANTRIP_UPGRADE_LEVELS.filter(l => characterLevel >= l).length;
  return `${Number(m[1]) * tier}d${m[2]}`;
}

// CONCENTRATION -------------------------------------------------------------

export interface ConcentrationState {
  /** The spell being concentrated on, if any. */
  spellId: string | null;
}

/** Starting a Concentration spell ends the one already being concentrated on. Other spells change nothing. */
export function startConcentration(
  state: ConcentrationState,
  spell: SpellDef,
): { state: ConcentrationState; ended: string | null } {
  if (!spell.concentration) return { state, ended: null };
  return { state: { spellId: spell.id }, ended: state.spellId };
}

export const loseConcentration = (state: ConcentrationState): { state: ConcentrationState; ended: string | null } => ({
  state: { spellId: null },
  ended: state.spellId,
});

/** "The DC equals 10 or half the damage taken (round down), whichever number is higher, up to a maximum DC of 30." */
export function concentrationSaveDc(damage: number): number {
  if (!Number.isFinite(damage) || damage < 0) throw new RangeError(`Damage cannot be ${damage}`);
  return Math.min(30, Math.max(10, Math.floor(damage / 2)));
}

// PREPARATION ---------------------------------------------------------------

/** How many level 1+ spells a class can have prepared at a level: the Prepared Spells column of its table. */
export function preparedLimit(def: ClassDef, level: number): number {
  const row = def.levels.find(l => l.level === level);
  if (!row) throw new RangeError(`${def.name} is not described at level ${level}`);
  const n = row.columns.preparedSpells;
  if (typeof n !== 'number') throw new RangeError(`${def.name} does not prepare spells`);
  return n;
}

/**
 * Whether a class can prepare a spell: it is on the class's list and is level 1 or higher (cantrips are known, not
 * prepared), and, given a class level, the class has slots of the spell's level (Pact Magic: up to its slot level).
 */
export function canPrepare(spell: SpellDef, def: ClassDef, level?: number): boolean {
  if (spell.level === 0 || !spell.classes.includes(def.name)) return false;
  if (level === undefined) return true;
  return slotsFor(def, level).some((n, i) => n > 0 && i + 1 >= spell.level);
}

// RITUALS -------------------------------------------------------------------

/** "The Ritual version of a spell takes 10 minutes longer to cast than normal. It also doesn't expend a spell slot." */
export const RITUAL_EXTRA_MINUTES = 10;

export function castAsRitual(spell: SpellDef): {
  ok: boolean;
  errors: string[];
  extraMinutes: number;
  slotSpent: false;
} {
  return spell.ritual
    ? { ok: true, errors: [], extraMinutes: RITUAL_EXTRA_MINUTES, slotSpent: false }
    : { ok: false, errors: [`${spell.name} does not have the Ritual tag`], extraMinutes: 0, slotSpent: false };
}

// WIZARD SPELLBOOK -------------------------------------------------------

/**
 * "For each level of the spell, the transcription takes 2 hours and costs 50 GP." Copying a spell already in your
 * spellbook into another book: "1 hour and 10 GP for each level of the copied spell."
 */
export function spellbookCopy(spellLevel: number, from: 'found' | 'own book' = 'found'): { hours: number; gp: number } {
  if (!Number.isInteger(spellLevel) || spellLevel < 1 || spellLevel > 9) {
    throw new RangeError(`Only spells of level 1 to 9 are copied into a spellbook, not level ${spellLevel}`);
  }
  return from === 'found' ? { hours: 2 * spellLevel, gp: 50 * spellLevel } : { hours: spellLevel, gp: 10 * spellLevel };
}
