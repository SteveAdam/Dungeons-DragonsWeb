import { describe, expect, it } from 'vitest';
import { BRANNOC, BRANNOC_ITEMS, hillGiantStrength } from './fixtures';
import { carriedWeight, itemEffects, type InventoryItem } from './items';
import { computeSheet } from './sheet';

const clock = { seconds: 0 };
const equip = (ids: string[], items = BRANNOC_ITEMS) =>
  items.map(i => (ids.includes(i.id) ? { ...i, equipped: true } : i));
const ring: InventoryItem = {
  id: 'ring',
  name: 'Ring of Protection',
  kind: 'magic',
  definition: { effects: [{ stat: 'ac', mode: 'add', value: 1 }] },
  weight: null,
  quantity: 1,
  requiresAttunement: true,
  equipped: true,
  attuned: false,
};

describe('items on the sheet (P2-7)', () => {
  it('Brannoc in chain mail with a shield has armour class 18; without them, 11', () => {
    const dressed = computeSheet(BRANNOC, [], clock, undefined, equip(['chain-mail', 'shield']));
    expect(dressed.armorClass.value).toBe(18);
    expect(dressed.armorClass.parts).toEqual([
      { label: 'Chain Mail', value: 16 },
      { label: 'Shield', value: 2 },
    ]);
    expect(computeSheet(BRANNOC, [], clock, undefined, BRANNOC_ITEMS).armorClass.value).toBe(11);
    expect(computeSheet(BRANNOC, [], clock, undefined, equip(['chain-mail'])).armorClass.value).toBe(16);
  });

  it('heavy armour ignores a negative Dexterity modifier', () => {
    const clumsy = { ...BRANNOC, abilityScores: { ...BRANNOC.abilityScores, dex: 6 } };
    expect(computeSheet(clumsy, [], clock, undefined, equip(['chain-mail'])).armorClass.value).toBe(16);
  });

  it('equipped weapons are the attacks; the Greatsword of the Drowned is locked until the potion', () => {
    const items = equip(['longsword', 'greatsword-drowned']);
    const sheet = computeSheet(BRANNOC, [], clock, undefined, items);
    expect(sheet.attacks.map(a => [a.name, a.bonus, a.damage, a.usable])).toEqual([
      ['Longsword +1', 7, '1d8+4', true],
      ['Greatsword of the Drowned', 7, '2d6+4', false],
    ]);
    expect(sheet.attacks[1].lockReasons).toEqual(['Strength 17 needed, you have 16']);
    const strong = computeSheet(BRANNOC, [hillGiantStrength(0)], clock, undefined, items);
    expect(strong.attacks[1]).toMatchObject({
      usable: true,
      bonus: 9,
      unlockedBy: { name: 'Potion of Hill Giant Strength' },
    });
  });

  it('weapon training comes from the sheet when it records it', () => {
    const wizard = { ...BRANNOC, weaponProficiencies: ['simple' as const] };
    const sheet = computeSheet(wizard, [], clock, undefined, equip(['longsword']));
    expect([sheet.attacks[0].proficient, sheet.attacks[0].bonus]).toEqual([false, 4]);
  });

  it('an item that needs attunement grants its effect only when equipped and attuned, named after it', () => {
    expect(itemEffects([ring])).toEqual([]);
    expect(itemEffects([{ ...ring, attuned: true, equipped: false }])).toEqual([]);
    const worn = { ...ring, attuned: true };
    expect(itemEffects([worn])).toEqual([
      {
        id: 'item:ring:0',
        name: 'Ring of Protection',
        source: 'Item',
        stat: 'ac',
        mode: 'add',
        value: 1,
        duration: { kind: 'permanent' },
      },
    ]);
    const sheet = computeSheet(BRANNOC, [], clock, undefined, [...equip(['chain-mail', 'shield']), worn]);
    expect(sheet.armorClass.value).toBe(19);
    expect(sheet.activeEffects.map(e => e.name)).toEqual(['Ring of Protection']);
  });

  it('without items, the Phase 1 sheet fields are used as before', () => {
    expect(computeSheet(BRANNOC, [], clock).armorClass.value).toBe(18);
  });

  it('carriedWeight adds weight times quantity, for display', () => {
    expect(carriedWeight(BRANNOC_ITEMS)).toBe(55 + 6 + 3 + 2 + 6 + 1);
    expect(carriedWeight([{ weight: null, quantity: 3 }])).toBe(0);
  });
});
