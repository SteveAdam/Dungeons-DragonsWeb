import { describe, expect, it } from 'vitest';
import { abilityModifier, proficiencyBonus } from './core';
import type { ClassDef } from './progression';
import {
  addDice,
  canPrepare,
  cantripDamageDice,
  castAsRitual,
  castSpell,
  concentrationSaveDc,
  freshSlots,
  loseConcentration,
  preparedLimit,
  regainSlots,
  slotsFor,
  spellAttackBonus,
  spellbookCopy,
  spellSaveDc,
  startConcentration,
  type SpellDef,
} from './spellcasting';

const spell = (over: Partial<SpellDef> & Pick<SpellDef, 'id' | 'level'>): SpellDef => ({
  name: over.id,
  concentration: false,
  ritual: false,
  classes: ['Wizard'],
  ...over,
});
const fireball = spell({
  id: 'fireball',
  level: 3,
  mechanics: { damage: { dice: '8d6', type: 'fire', perSlotLevel: '1d6' } },
});
const cureWounds = spell({
  id: 'cure-wounds',
  level: 1,
  classes: ['Cleric'],
  mechanics: { healing: { dice: '2d8', addAbilityModifier: true, perSlotLevel: '2d8' } },
});
const fireBolt = spell({
  id: 'fire-bolt',
  level: 0,
  mechanics: { damage: { dice: '1d10', type: 'fire' }, cantripScaling: true },
});

const slots = (...perLevel: number[]) => freshSlots([...perLevel, ...Array(9 - perLevel.length).fill(0)]);

describe('spell save DC and attack bonus (SRD 5.2.1)', () => {
  it('a level 5 Wizard with Intelligence 18 has save DC 15 and attack +7', () => {
    const pb = proficiencyBonus(5);
    const mod = abilityModifier(18);
    expect(spellSaveDc(pb, mod)).toBe(15);
    expect(spellAttackBonus(pb, mod)).toBe(7);
  });
});

describe('castSpell', () => {
  it('fails a level 3 spell with no slot of level 3 or higher, and spends a level 4 slot when asked', () => {
    const noThird = slots(4, 3);
    const r = castSpell(noThird, fireball);
    expect(r.errors).toEqual(['No spell slot of level 3 or higher is left for fireball']);
    expect(r.slotState).toBe(noThird);

    const withFourth = slots(4, 3, 0, 1);
    const ok = castSpell(withFourth, fireball, 4);
    expect(ok.errors).toEqual([]);
    expect(ok.slotLevel).toBe(4);
    expect(ok.slotState.used).toEqual([0, 0, 0, 1, 0, 0, 0, 0, 0]);
    expect(withFourth.used[3]).toBe(0);
  });

  it('upcasts damage and healing by the per-slot dice', () => {
    expect(castSpell(slots(0, 0, 2, 1), fireball, 4).damageDice).toBe('9d6');
    expect(castSpell(slots(0, 0, 2), fireball).damageDice).toBe('8d6');
    expect(castSpell(slots(1, 1), cureWounds, 2).healingDice).toBe('4d8');
  });

  it('takes the lowest free slot of the spell level or higher when none is named', () => {
    const r = castSpell(slots(0, 1, 1), cureWounds);
    expect(r.slotLevel).toBe(2);
  });

  it('refuses a slot below the spell level, a spent slot, or a slot level that does not exist', () => {
    expect(castSpell(slots(3, 3, 3), fireball, 2).errors).toEqual(['fireball needs a slot of level 3 or higher']);
    const spent = castSpell(castSpell(slots(0, 0, 1), fireball).slotState, fireball, 3);
    expect(spent.errors).toEqual(['No level 3 spell slot is left']);
    expect(castSpell(slots(1), cureWounds, 10).errors).toEqual(['There is no level 10 spell slot']);
  });

  it('casts a cantrip without a slot', () => {
    const empty = slots();
    const r = castSpell(empty, fireBolt);
    expect([r.errors, r.slotLevel, r.slotState]).toEqual([[], null, empty]);
  });

  it('regains every slot', () => {
    expect(regainSlots(castSpell(slots(0, 0, 1), fireball).slotState).used).toEqual(Array(9).fill(0));
  });

  it('adds dice of a different size as a list', () => {
    expect(addDice('3d4', '1d4', 2)).toBe('5d4');
    expect(addDice('8d6', '1d8', 2)).toBe('8d6 + 2d8');
    expect(addDice('2d8', '2d8', 0)).toBe('2d8');
  });
});

describe('cantripDamageDice (Cantrip Upgrade at character levels 5, 11 and 17)', () => {
  it.each([
    [1, '1d10'],
    [4, '1d10'],
    [5, '2d10'],
    [10, '2d10'],
    [11, '3d10'],
    [16, '3d10'],
    [17, '4d10'],
    [20, '4d10'],
  ])('at level %i a 1d10 cantrip does %s', (level, dice) => {
    expect(cantripDamageDice('1d10', level)).toBe(dice);
  });

  it('refuses levels outside 1 to 20 and dice it cannot read', () => {
    expect(() => cantripDamageDice('1d6', 0)).toThrow(RangeError);
    expect(() => cantripDamageDice('1d6', 21)).toThrow(RangeError);
    expect(() => cantripDamageDice('a lot', 5)).toThrow(RangeError);
  });
});

describe('Concentration', () => {
  it('22 damage gives DC 11, 8 damage gives DC 10, and the DC never passes 30', () => {
    expect(concentrationSaveDc(22)).toBe(11);
    expect(concentrationSaveDc(8)).toBe(10);
    expect(concentrationSaveDc(21)).toBe(10);
    expect(concentrationSaveDc(100)).toBe(30);
  });

  it('starting a second Concentration spell ends the first', () => {
    const bless = spell({ id: 'bless', level: 1, concentration: true });
    const haste = spell({ id: 'haste', level: 3, concentration: true });
    const first = startConcentration({ spellId: null }, bless);
    expect(first).toEqual({ state: { spellId: 'bless' }, ended: null });
    expect(startConcentration(first.state, haste)).toEqual({ state: { spellId: 'haste' }, ended: 'bless' });
    expect(startConcentration(first.state, fireball)).toEqual({ state: { spellId: 'bless' }, ended: null });
    expect(loseConcentration(first.state)).toEqual({ state: { spellId: null }, ended: 'bless' });
  });
});

describe('Rituals', () => {
  it('a ritual spell is cast without a slot and 10 minutes longer; a non-ritual spell cannot be', () => {
    const alarm = spell({ id: 'alarm', level: 1, ritual: true });
    expect(castAsRitual(alarm)).toEqual({ ok: true, errors: [], extraMinutes: 10, slotSpent: false });
    expect(castAsRitual(fireball)).toEqual({
      ok: false,
      errors: ['fireball does not have the Ritual tag'],
      extraMinutes: 0,
      slotSpent: false,
    });
  });
});

const row = (level: number, columns: Record<string, number | string>) => ({
  level,
  proficiencyBonus: 2,
  features: [],
  columns,
});
const dash = '—';
const wizard: ClassDef = {
  id: 'wizard',
  name: 'Wizard',
  hitDie: 'd6',
  subclasses: [],
  levels: [
    row(1, { cantrips: 3, preparedSpells: 4, slots1: 2, slots2: dash, slots3: dash }),
    row(3, { cantrips: 3, preparedSpells: 6, slots1: 4, slots2: 2, slots3: dash }),
  ],
};
const warlock: ClassDef = {
  id: 'warlock',
  name: 'Warlock',
  hitDie: 'd8',
  subclasses: [],
  levels: [row(3, { preparedSpells: 4, spellSlots: 2, slotLevel: 2 })],
};

describe('slots and preparation from the class table', () => {
  it('reads the Spell Slots columns, and Pact Magic’s slots at their single level', () => {
    expect(slotsFor(wizard, 3)).toEqual([4, 2, 0, 0, 0, 0, 0, 0, 0]);
    expect(slotsFor(warlock, 3)).toEqual([0, 2, 0, 0, 0, 0, 0, 0, 0]);
    expect(() => slotsFor(wizard, 2)).toThrow(RangeError);
  });

  it('preparedLimit is the Prepared Spells column', () => {
    expect(preparedLimit(wizard, 1)).toBe(4);
    expect(preparedLimit(wizard, 3)).toBe(6);
  });

  it('canPrepare: on the class list, level 1 or higher, and with slots of that level', () => {
    const magicMissile = spell({ id: 'magic-missile', level: 1 });
    const web = spell({ id: 'web', level: 2 });
    expect(canPrepare(magicMissile, wizard)).toBe(true);
    expect(canPrepare(cureWounds, wizard)).toBe(false);
    expect(canPrepare(fireBolt, wizard)).toBe(false);
    expect(canPrepare(web, wizard, 1)).toBe(false);
    expect(canPrepare(web, wizard, 3)).toBe(true);
    expect(canPrepare(spell({ id: 'hold-person', level: 2, classes: ['Warlock'] }), warlock, 3)).toBe(true);
  });
});

describe('spellbookCopy (Expanding and Replacing a Spellbook)', () => {
  it('a found spell costs 2 hours and 50 GP per level; a copy of your own, 1 hour and 10 GP', () => {
    expect(spellbookCopy(3)).toEqual({ hours: 6, gp: 150 });
    expect(spellbookCopy(3, 'own book')).toEqual({ hours: 3, gp: 30 });
    expect(() => spellbookCopy(0)).toThrow(RangeError);
  });
});
