import { describe, expect, it } from 'vitest';
import { hillGiantStrength } from './fixtures';
import { armorClass, weaponProfile, type ArmorDef, type WeaponDef } from './equipment';
import type { AbilityScores } from './requirements';

// SRD 5.2.1 Armor table rows (the full data set is in packages/srd-data, which runs these rules over every record)
const leather: ArmorDef = {
  id: 'leather-armor',
  name: 'Leather Armor',
  category: 'light',
  baseAc: 11,
  strength: null,
  stealthDisadvantage: false,
};
const padded: ArmorDef = {
  id: 'padded-armor',
  name: 'Padded Armor',
  category: 'light',
  baseAc: 11,
  strength: null,
  stealthDisadvantage: true,
};
const breastplate: ArmorDef = {
  id: 'breastplate',
  name: 'Breastplate',
  category: 'medium',
  baseAc: 14,
  strength: null,
  stealthDisadvantage: false,
};
const halfPlate: ArmorDef = {
  id: 'half-plate-armor',
  name: 'Half Plate Armor',
  category: 'medium',
  baseAc: 15,
  strength: null,
  stealthDisadvantage: true,
};
const chainMail: ArmorDef = {
  id: 'chain-mail',
  name: 'Chain Mail',
  category: 'heavy',
  baseAc: 16,
  strength: 13,
  stealthDisadvantage: true,
};
const plate: ArmorDef = {
  id: 'plate-armor',
  name: 'Plate Armor',
  category: 'heavy',
  baseAc: 18,
  strength: 15,
  stealthDisadvantage: true,
};
const shield: ArmorDef = {
  id: 'shield',
  name: 'Shield',
  category: 'shield',
  baseAc: 2,
  strength: null,
  stealthDisadvantage: false,
};

const scores = (over: Partial<AbilityScores> = {}): AbilityScores => ({
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
  ...over,
});

describe('armour class by category (SRD 5.2.1)', () => {
  it('Chain Mail with Dexterity 14 is AC 16: heavy armour ignores Dexterity', () => {
    const ac = armorClass({ armor: chainMail, abilityScores: scores({ str: 13, dex: 14 }) });
    expect(ac.value).toBe(16);
    expect(ac.parts).toEqual([{ label: 'Chain Mail', value: 16 }]);
  });

  it('light armour adds all of Dexterity', () => {
    expect(armorClass({ armor: leather, abilityScores: scores({ dex: 18 }) }).value).toBe(15);
    expect(armorClass({ armor: leather, abilityScores: scores({ dex: 8 }) }).value).toBe(10);
  });

  it('medium armour adds Dexterity up to +2', () => {
    expect(armorClass({ armor: breastplate, abilityScores: scores({ dex: 18 }) }).value).toBe(16);
    expect(armorClass({ armor: breastplate, abilityScores: scores({ dex: 12 }) }).value).toBe(15);
    expect(armorClass({ armor: breastplate, abilityScores: scores({ dex: 6 }) }).value).toBe(12);
  });

  it('no armour is 10 + Dexterity', () => {
    expect(armorClass({ armor: null, abilityScores: scores({ dex: 16 }) }).value).toBe(13);
  });

  it('a shield adds its +2, with or without armour, but only with training', () => {
    expect(armorClass({ armor: chainMail, shield, abilityScores: scores({ str: 16 }) }).value).toBe(18);
    expect(armorClass({ armor: null, shield, abilityScores: scores({ dex: 14 }) }).value).toBe(14);
    const untrained = armorClass({ armor: null, shield, abilityScores: scores(), trainedWithShield: false });
    expect(untrained.value).toBe(10);
    expect(untrained.notes).toContain('No training with shields: the Shield adds nothing');
  });

  it('heavy armour without the Strength for it costs 10 feet of speed, and stealth notes show', () => {
    const ac = armorClass({ armor: plate, abilityScores: scores({ str: 14 }) });
    expect(ac.value).toBe(18);
    expect(ac.speedPenaltyFt).toBe(10);
    expect(ac.stealthDisadvantage).toBe(true);
    expect(ac.notes).toEqual([
      'Plate Armor needs Strength 15: speed is 10 feet lower',
      'Plate Armor: disadvantage on Dexterity (Stealth) checks',
    ]);
    expect(armorClass({ armor: plate, abilityScores: scores({ str: 15 }) }).speedPenaltyFt).toBe(0);
  });

  it('an effect that raises Strength lifts the penalty while it lasts (the P1-3 requirement rules)', () => {
    const potion = hillGiantStrength(0);
    expect(
      armorClass({ armor: plate, abilityScores: scores({ str: 8 }), effects: [potion], clock: { seconds: 60 } })
        .speedPenaltyFt,
    ).toBe(0);
    expect(
      armorClass({ armor: plate, abilityScores: scores({ str: 8 }), effects: [potion], clock: { seconds: 3600 } })
        .speedPenaltyFt,
    ).toBe(10);
  });

  it('stealth disadvantage comes with some light and medium armour too, and with no penalty to speed', () => {
    for (const armor of [padded, halfPlate]) {
      const ac = armorClass({ armor, abilityScores: scores() });
      expect(ac.stealthDisadvantage).toBe(true);
      expect(ac.speedPenaltyFt).toBe(0);
    }
    expect(armorClass({ armor: leather, abilityScores: scores() }).notes).toEqual([]);
  });

  it('untrained armour gets a note', () => {
    expect(armorClass({ armor: chainMail, abilityScores: scores({ str: 13 }), trained: false }).notes).toContain(
      'No training with heavy armour: disadvantage on Strength and Dexterity rolls, and no spells',
    );
  });

  it('a shield is not body armour, and body armour is not a shield', () => {
    expect(() => armorClass({ armor: shield, abilityScores: scores() })).toThrow(RangeError);
    expect(() => armorClass({ armor: null, shield: leather, abilityScores: scores() })).toThrow(RangeError);
  });
});

// SRD 5.2.1 Weapons table rows
const dagger: WeaponDef = {
  id: 'dagger',
  name: 'Dagger',
  category: 'simple',
  kind: 'melee',
  damage: { dice: '1d4', type: 'piercing' },
  properties: ['finesse', 'light', 'thrown'],
  range: { normal: 20, long: 60 },
  mastery: 'nick',
};
const longsword: WeaponDef = {
  id: 'longsword',
  name: 'Longsword',
  category: 'martial',
  kind: 'melee',
  damage: { dice: '1d8', type: 'slashing' },
  properties: ['versatile'],
  versatileDice: '1d10',
  mastery: 'sap',
};
const longbow: WeaponDef = {
  id: 'longbow',
  name: 'Longbow',
  category: 'martial',
  kind: 'ranged',
  damage: { dice: '1d8', type: 'piercing' },
  properties: ['ammunition', 'heavy', 'two-handed'],
  range: { normal: 150, long: 600 },
  ammunition: 'arrow',
  mastery: 'slow',
};
const javelin: WeaponDef = {
  id: 'javelin',
  name: 'Javelin',
  category: 'simple',
  kind: 'melee',
  damage: { dice: '1d6', type: 'piercing' },
  properties: ['thrown'],
  range: { normal: 30, long: 120 },
  mastery: 'slow',
};
const glaive: WeaponDef = {
  id: 'glaive',
  name: 'Glaive',
  category: 'martial',
  kind: 'melee',
  damage: { dice: '1d10', type: 'slashing' },
  properties: ['heavy', 'reach', 'two-handed'],
  mastery: 'graze',
};

describe('weaponProfile (SRD 5.2.1)', () => {
  it('a Dagger with Dexterity 16 and Strength 8 attacks with Dexterity (Finesse)', () => {
    const p = weaponProfile(dagger, scores({ str: 8, dex: 16 }));
    expect(p.ability).toBe('dex');
    expect(p.modifier).toBe(3);
    expect(p.range).toEqual({ normal: 20, long: 60 });
    expect(p.mastery).toBe('nick');
    expect(p.reachFt).toBe(5);
  });

  it('Finesse takes Strength when it is the better (or equal) score', () => {
    expect(weaponProfile(dagger, scores({ str: 16, dex: 12 })).ability).toBe('str');
    expect(weaponProfile(dagger, scores({ str: 14, dex: 14 })).ability).toBe('str');
  });

  it('a Longsword does 1d8 in one hand and its Versatile 1d10 in two', () => {
    const one = weaponProfile(longsword, scores({ str: 16 }));
    expect([one.damageDice, one.twoHanded, one.ability]).toEqual(['1d8', false, 'str']);
    const two = weaponProfile(longsword, scores({ str: 16 }), { twoHanded: true });
    expect([two.damageDice, two.twoHanded]).toEqual(['1d10', true]);
  });

  it('a Longbow uses Dexterity, has its range, and is two-handed', () => {
    const p = weaponProfile(longbow, scores({ str: 18, dex: 14 }));
    expect(p.ability).toBe('dex');
    expect(p.modifier).toBe(2);
    expect(p.range).toEqual({ normal: 150, long: 600 });
    expect(p.reachFt).toBeNull();
    expect(p.twoHanded).toBe(true);
    expect(p.notes).toContain('Needs ammunition: arrow');
    expect(p.disadvantage).toEqual([]);
  });

  it('a thrown melee weapon without Finesse uses Strength', () => {
    const p = weaponProfile(javelin, scores({ str: 12, dex: 18 }));
    expect(p.ability).toBe('str');
    expect(p.notes).toContain('Can be thrown');
  });

  it('Heavy weapons give disadvantage below 13 in their ability; Reach adds 5 feet', () => {
    expect(weaponProfile(glaive, scores({ str: 12 })).disadvantage).toEqual(['Heavy: Glaive needs Strength 13']);
    expect(weaponProfile(glaive, scores({ str: 13 })).disadvantage).toEqual([]);
    expect(weaponProfile(longbow, scores({ dex: 12 })).disadvantage).toEqual(['Heavy: Longbow needs Dexterity 13']);
    expect(weaponProfile(glaive, scores({ str: 13 })).reachFt).toBe(10);
  });
});
