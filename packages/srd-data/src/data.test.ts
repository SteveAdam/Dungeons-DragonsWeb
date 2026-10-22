import { readFileSync } from 'node:fs';
import {
  ARMOR_CATEGORY_RULES,
  armorClass,
  COIN_VALUE_CP,
  COINS_PER_POUND,
  weaponProfile,
  type ArmorDef,
  type WeaponDef,
} from '@dnd-manager/rules-engine';
import { describe, expect, it } from 'vitest';
import { convertArmor, convertCurrency, convertWeapons } from './convert';
import { SRD_ARMOR, SRD_ATTRIBUTION, SRD_CURRENCY, SRD_WEAPONS } from './index';

const source = (file: string) => readFileSync(new URL(`../source/${file}`, import.meta.url), 'utf8');
const scores = { str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10 };

describe('the SRD 5.2.1 data', () => {
  it('has every weapon, armour and coin in the SRD tables, each tagged with its source', () => {
    expect(SRD_WEAPONS).toHaveLength(38);
    expect(SRD_ARMOR).toHaveLength(13);
    expect(SRD_CURRENCY.coins.map(c => c.abbreviation)).toEqual(['CP', 'SP', 'EP', 'GP', 'PP']);
    for (const r of [...SRD_WEAPONS, ...SRD_ARMOR, ...SRD_CURRENCY.coins]) expect(r.source).toBe('srd-5.2');
    const counts: Record<string, number> = {};
    for (const w of SRD_WEAPONS) {
      const key = `${w.category} ${w.kind}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    expect(counts).toEqual({
      'simple melee': 10,
      'simple ranged': 4,
      'martial melee': 18,
      'martial ranged': 6,
    });
  });

  it('is exactly what the SRD text in ../source gives (nothing typed in by hand)', () => {
    expect(convertWeapons(source('weapons.txt'))).toEqual(SRD_WEAPONS);
    expect(convertArmor(source('armor.txt'))).toEqual(SRD_ARMOR);
    expect(convertCurrency(source('coins.txt'))).toEqual(SRD_CURRENCY);
  });

  it('carries the attribution statement word for word', () => {
    expect(source('attribution.txt').trim()).toBe(SRD_ATTRIBUTION);
    const file = readFileSync(new URL('../../../ATTRIBUTION.md', import.meta.url), 'utf8');
    expect(file).toContain(SRD_ATTRIBUTION);
  });

  it("agrees with the engine's rules: each armour's printed AC matches its category, coins match COIN_VALUE_CP", () => {
    for (const a of SRD_ARMOR.filter(a => a.category !== 'shield')) {
      const rule = ARMOR_CATEGORY_RULES[a.category as Exclude<typeof a.category, 'shield'>];
      const printed = !rule.addsDex
        ? `${a.baseAc}`
        : `${a.baseAc} + Dex modifier${rule.dexMax === null ? '' : ` (max ${rule.dexMax})`}`;
      expect(a.acText, a.name).toBe(printed);
    }
    for (const c of SRD_CURRENCY.coins) expect(c.valueInCp).toBe(COIN_VALUE_CP[c.id]);
    expect(SRD_CURRENCY.coinsPerPound).toBe(COINS_PER_POUND);
  });

  it('feeds the engine directly: Chain Mail with Dexterity 14 is AC 16, and a Shield makes it 18', () => {
    const byId = (id: string): ArmorDef => SRD_ARMOR.find(a => a.id === id)!;
    expect(armorClass({ armor: byId('chain-mail'), abilityScores: { ...scores, str: 13 } }).value).toBe(16);
    expect(
      armorClass({ armor: byId('chain-mail'), shield: byId('shield'), abilityScores: { ...scores, str: 13 } }).value,
    ).toBe(18);
    expect(armorClass({ armor: byId('studded-leather-armor'), abilityScores: scores }).value).toBe(14);
    expect(armorClass({ armor: byId('hide-armor'), abilityScores: { ...scores, dex: 18 } }).value).toBe(14);
  });

  it('every SRD weapon has a profile; the Dagger, Longsword and Longbow behave as the SRD says', () => {
    const byId = (id: string): WeaponDef => SRD_WEAPONS.find(w => w.id === id)!;
    for (const w of SRD_WEAPONS) expect(() => weaponProfile(w, scores)).not.toThrow();
    expect(weaponProfile(byId('dagger'), { ...scores, str: 8, dex: 16 }).ability).toBe('dex');
    expect(weaponProfile(byId('longsword'), scores, { twoHanded: true }).damageDice).toBe('1d10');
    expect(weaponProfile(byId('longbow'), { ...scores, str: 18 }).ability).toBe('dex');
  });
});
