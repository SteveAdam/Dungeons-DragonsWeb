import { describe, expect, it } from 'vitest';
import { canAfford, COIN_VALUE_CP, formatPurse, makeChange, pay, priceInCopper, totalInCopper } from './currency';

describe('coins (SRD 5.2.1 Coin Values)', () => {
  it('values every coin against the gold piece as the SRD does: CP 1/100, SP 1/10, EP 1/2, GP 1, PP 10', () => {
    const gp = COIN_VALUE_CP.gp;
    expect([COIN_VALUE_CP.cp / gp, COIN_VALUE_CP.sp / gp, COIN_VALUE_CP.ep / gp, 1, COIN_VALUE_CP.pp / gp]).toEqual([
      1 / 100,
      1 / 10,
      1 / 2,
      1,
      10,
    ]);
  });

  it('150 copper pieces are 1 gold piece and 5 silver pieces', () => {
    expect(makeChange(150)).toEqual({ gp: 1, sp: 5 });
    expect(totalInCopper({ gp: 1, sp: 5 })).toBe(150);
  });

  it('counts a mixed purse in copper', () => {
    expect(totalInCopper({ pp: 1, gp: 2, ep: 1, sp: 3, cp: 4 })).toBe(1000 + 200 + 50 + 30 + 4);
    expect(totalInCopper({})).toBe(0);
  });

  it('makes change with the fewest coins, electrum only when asked', () => {
    expect(makeChange(0)).toEqual({});
    expect(makeChange(1234)).toEqual({ pp: 1, gp: 2, sp: 3, cp: 4 });
    expect(makeChange(150, ['gp', 'ep', 'sp', 'cp'])).toEqual({ gp: 1, ep: 1 });
    expect(() => makeChange(-1)).toThrow(RangeError);
    expect(() => makeChange(1.5)).toThrow(RangeError);
    expect(() => makeChange(5, ['gp'])).toThrow(RangeError);
  });

  it('canAfford: exactly enough is enough, a copper short is not', () => {
    expect(canAfford({ gp: 15 }, { amount: 15, coin: 'gp' })).toBe(true);
    expect(canAfford({ gp: 14, sp: 9, cp: 9 }, { amount: 15, coin: 'gp' })).toBe(false);
    expect(canAfford({ pp: 2 }, { amount: 15, coin: 'gp' })).toBe(true);
    expect(canAfford({}, 0)).toBe(true);
    expect(canAfford({}, { amount: 5, coin: 'cp' })).toBe(false);
  });

  it('pays smallest coins first and gives change, keeping the total right', () => {
    expect(pay({ gp: 1, cp: 5 }, 10)).toEqual({ sp: 9, cp: 5 });
    expect(pay({ gp: 2 }, { amount: 15, coin: 'sp' })).toEqual({ sp: 5 });
    expect(pay({ gp: 1 }, { amount: 2, coin: 'gp' })).toBeNull();
    const before = { pp: 1, gp: 3, sp: 7, cp: 2 };
    const after = pay(before, 457)!;
    expect(totalInCopper(after)).toBe(totalInCopper(before) - 457);
    expect(before).toEqual({ pp: 1, gp: 3, sp: 7, cp: 2 });
  });

  it('prices as the SRD writes them', () => {
    expect(priceInCopper({ amount: 5, coin: 'cp' })).toBe(5);
    expect(priceInCopper({ amount: 1500, coin: 'gp' })).toBe(150000);
  });

  it('formats a purse largest coin first', () => {
    expect(formatPurse({ cp: 3, gp: 12, sp: 5 })).toBe('12 GP, 5 SP, 3 CP');
    expect(formatPurse({ gp: 1500 })).toBe('1,500 GP');
    expect(formatPurse({})).toBe('0 GP');
  });
});
