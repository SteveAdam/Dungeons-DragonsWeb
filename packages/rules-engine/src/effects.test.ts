import { describe, expect, it } from 'vitest';
import {
  advanceRounds,
  advanceTime,
  applyRest,
  effectiveStat,
  endConcentration,
  isActive,
  type Effect,
  type GameClock,
} from './effects';

/** Deep-freezes a test value, so any attempt to change an input throws. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

const clock: GameClock = deepFreeze({ seconds: 1000 });
const effect = (over: Partial<Effect>): Effect =>
  deepFreeze({
    id: over.id ?? 'e',
    name: 'Effect',
    source: 'Test',
    stat: 'str',
    mode: 'add',
    value: 0,
    duration: { kind: 'permanent' },
    ...over,
  } as Effect);

const hillGiant = effect({
  id: 'hill-giant',
  name: 'Potion of Hill Giant Strength',
  source: 'Potion',
  mode: 'set_at_least',
  value: 21,
  duration: { kind: 'until', atSeconds: clock.seconds + 3600 },
});

describe('effectiveStat', () => {
  it('Potion of Hill Giant Strength: Str 16 becomes 21; Str 22 stays 22 and the potion is ignored', () => {
    const weak = effectiveStat(16, 'str', [hillGiant], clock);
    expect(weak).toEqual({ value: 21, base: 16, applied: [hillGiant], ignored: [] });
    const strong = effectiveStat(22, 'str', [hillGiant], clock);
    expect(strong).toEqual({ value: 22, base: 22, applied: [], ignored: [hillGiant] });
    expect(effectiveStat(21, 'str', [hillGiant], clock).ignored).toEqual([hillGiant]); // equal is no effect
  });

  it('adds after setting: +2 on 16 is 18; set_at_least 21 then +2 is 23', () => {
    const plusTwo = effect({ id: 'plus-two', value: 2 });
    expect(effectiveStat(16, 'str', [plusTwo], clock).value).toBe(18);
    // listed in the "wrong" order on purpose: the order of the list must not matter
    const r = effectiveStat(16, 'str', [plusTwo, hillGiant], clock);
    expect(r.value).toBe(23);
    expect(r.applied).toEqual([hillGiant, plusTwo]);
  });

  it('several sets: the highest wins, the rest are ignored', () => {
    const low = effect({ id: 'low', mode: 'set', value: 19 });
    const high = effect({ id: 'high', mode: 'set', value: 25 });
    const r = effectiveStat(10, 'str', [low, high], clock);
    expect(r.value).toBe(25);
    expect(r.applied).toEqual([high]);
    expect(r.ignored).toEqual([low]);
  });

  it('caps ability scores at 30 and floors them at 1; speed and AC do not go below 0', () => {
    expect(effectiveStat(28, 'str', [effect({ value: 5 })], clock).value).toBe(30);
    expect(effectiveStat(3, 'dex', [effect({ stat: 'dex', value: -6 })], clock).value).toBe(1);
    expect(effectiveStat(10, 'speed', [effect({ stat: 'speed', value: -30 })], clock).value).toBe(0);
    expect(effectiveStat(12, 'ac', [effect({ stat: 'ac', value: -20 })], clock).value).toBe(0);
    expect(effectiveStat(30, 'speed', [effect({ stat: 'speed', value: 10 })], clock).value).toBe(40); // no cap
  });

  it('ignores inactive effects and effects on other stats', () => {
    const otherStat = effect({ stat: 'dex', value: 4 });
    const over = effect({ value: 4, duration: { kind: 'rounds', remaining: 0 } });
    expect(effectiveStat(16, 'str', [otherStat, over], clock)).toEqual({
      value: 16,
      base: 16,
      applied: [],
      ignored: [],
    });
  });
});

describe('isActive', () => {
  it('an effect ending at atSeconds is inactive at exactly that second', () => {
    const end = (hillGiant.duration as { atSeconds: number }).atSeconds;
    expect(isActive(hillGiant, { seconds: end - 1 })).toBe(true);
    expect(isActive(hillGiant, { seconds: end })).toBe(false);
    expect(effectiveStat(16, 'str', [hillGiant], { seconds: end }).value).toBe(16);
  });
});

describe('durations', () => {
  const bless = effect({ id: 'bless', duration: { kind: 'rounds', remaining: 10 }, concentration: true });
  const shortRest = effect({ id: 'short', duration: { kind: 'rest', rest: 'short' } });
  const longRest = effect({ id: 'long', duration: { kind: 'rest', rest: 'long' } });
  const forever = effect({ id: 'forever' });

  it('advanceRounds counts round effects down and expires them at 0', () => {
    const after3 = advanceRounds([bless, forever], 3);
    expect(after3.effects[0].duration).toEqual({ kind: 'rounds', remaining: 7 });
    expect(after3.expired).toEqual([]);
    const after10 = advanceRounds([bless, forever], 10);
    expect(after10.effects).toEqual([forever]);
    expect(after10.expired).toEqual([bless]);
  });

  it('advanceTime counts whole rounds and expires clock effects', () => {
    const minute = advanceTime([bless, hillGiant], clock, 60); // 10 rounds
    expect(minute.expired).toEqual([bless]);
    expect(minute.effects).toEqual([hillGiant]);
    expect(minute.clock).toEqual({ seconds: 1060 });
    const hour = advanceTime([hillGiant], clock, 3600);
    expect(hour.expired).toEqual([hillGiant]);
  });

  it('a short rest does not end a long-rest effect; a long rest ends both', () => {
    expect(applyRest([shortRest, longRest, forever], 'short')).toEqual({
      effects: [longRest, forever],
      expired: [shortRest],
    });
    expect(applyRest([shortRest, longRest, forever], 'long')).toEqual({
      effects: [forever],
      expired: [shortRest, longRest],
    });
  });

  it('endConcentration removes concentration effects only', () => {
    expect(endConcentration([bless, forever])).toEqual({ effects: [forever], expired: [bless] });
  });

  it('never changes its inputs (everything here is frozen, so a change would throw)', () => {
    const list = deepFreeze([bless, shortRest, hillGiant]);
    expect(() => {
      advanceRounds(list, 2);
      advanceTime(list, clock, 120);
      applyRest(list, 'long');
      endConcentration(list);
      effectiveStat(10, 'str', list, clock);
    }).not.toThrow();
    expect(bless.duration).toEqual({ kind: 'rounds', remaining: 10 });
  });
});
