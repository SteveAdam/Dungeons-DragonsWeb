// P2-11: the simple long rest (a temporary DM tool; the full rest rules come in Phase 6), following "Long Rest" in
// the SRD 5.2.1: "You regain all lost Hit Points and all spent Hit Point Dice", Exhaustion "decreases by 1", and
// spellcasters "regain all expended spell slots". Effects that last until a rest end (applyRest), and so does
// concentration. The database's simple_long_rest does the same to the stored character; this is its reference.
//
// This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast
// LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons
// Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
import { exhaustionAfterLongRest } from './conditions';
import { applyRest, type Effect } from './effects';
import type { CharacterSheet } from './sheet';

export interface RestState {
  hp: CharacterSheet['hp'];
  hitDice: CharacterSheet['hitDice'];
  exhaustion: number;
  /** Spell slots spent, by level (index 0 is level 1). */
  slotsUsed: number[];
  /** The spell being concentrated on, or null. */
  concentration: string | null;
  effects: readonly Effect[];
}

/** The character after a long rest. Temporary hit points are kept (they last until used or the effect ends). */
export function longRest(s: RestState): RestState {
  return {
    hp: { ...s.hp, current: s.hp.max },
    hitDice: { ...s.hitDice, spent: 0 },
    exhaustion: exhaustionAfterLongRest(s.exhaustion),
    slotsUsed: s.slotsUsed.map(() => 0),
    concentration: null,
    effects: applyRest(s.effects, 'long').effects,
  };
}
