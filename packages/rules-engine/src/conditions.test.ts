import { describe, expect, it } from 'vitest';
import {
  combineWithEffects,
  CONDITION_INFO,
  conditionEffects,
  CONDITIONS,
  exhaustionAfterLongRest,
  type Condition,
} from './conditions';

const state = (conditions: Condition[], exhaustion = 0) => ({ conditions, exhaustion });
const modeOf = (r: { advantage: string[]; disadvantage: string[] }) => combineWithEffects(r).mode;

describe('ticket cases', () => {
  it('Poisoned: disadvantage attacking and checking, a Wisdom save rolls normally', () => {
    const poisoned = state(['poisoned']);
    const attack = conditionEffects(poisoned, { kind: 'attack', role: 'self' });
    expect(attack.disadvantage).toEqual(['Poisoned: disadvantage on attack rolls']);
    expect(modeOf(attack)).toBe('disadvantage');
    expect(modeOf(conditionEffects(poisoned, { kind: 'check', ability: 'wis', role: 'self' }))).toBe('disadvantage');
    const save = conditionEffects(poisoned, { kind: 'save', ability: 'wis', role: 'self' });
    expect(modeOf(save)).toBe('normal');
    expect(save.autoFail).toBe(false);
  });

  it('Prone target: advantage from 5 feet, disadvantage from 30 feet', () => {
    const prone = state(['prone']);
    expect(modeOf(conditionEffects(prone, { kind: 'attack', role: 'against', attackerWithin5ft: true }))).toBe(
      'advantage',
    );
    expect(modeOf(conditionEffects(prone, { kind: 'attack', role: 'against', attackerWithin5ft: false }))).toBe(
      'disadvantage',
    );
  });

  it('Paralyzed: attacks have advantage and a hit from 5 feet is a crit; Str and Dex saves fail, Wis rolls', () => {
    const paralyzed = state(['paralyzed']);
    const close = conditionEffects(paralyzed, { kind: 'attack', role: 'against', attackerWithin5ft: true });
    expect(modeOf(close)).toBe('advantage');
    expect(close.critOnHit).toBe(true);
    expect(conditionEffects(paralyzed, { kind: 'attack', role: 'against', attackerWithin5ft: false }).critOnHit).toBe(
      false,
    );
    for (const ability of ['str', 'dex'] as const) {
      const save = conditionEffects(paralyzed, { kind: 'save', ability, role: 'self' });
      expect(save.autoFail).toBe(true);
      expect(save.autoFailReason).toBe('Paralyzed: Strength and Dexterity saving throws fail automatically');
    }
    expect(conditionEffects(paralyzed, { kind: 'save', ability: 'wis', role: 'self' }).autoFail).toBe(false);
    expect(close.cannotAct).toBe(true);
    expect(close.speedFactor).toBe(0);
  });

  it('Poisoned plus an advantage source cancels to normal, and the reasons show it', () => {
    const r = conditionEffects(state(['poisoned']), { kind: 'attack', role: 'self' });
    const final = combineWithEffects(r, ['High ground']);
    expect(final.mode).toBe('normal');
    expect(final.reasons).toEqual([
      { text: 'High ground', kind: 'advantage', cancelled: true },
      { text: 'Poisoned: disadvantage on attack rolls', kind: 'disadvantage', cancelled: true },
    ]);
  });

  it('Exhaustion 2: -4 on d20 tests and 10 ft slower; Exhaustion 6 is death', () => {
    const tired = conditionEffects(state([], 2), { kind: 'check', role: 'self' });
    expect(tired.d20Penalty).toBe(-4);
    expect(tired.speedPenaltyFt).toBe(10);
    const dead = conditionEffects(state([], 6), { kind: 'save', ability: 'con', role: 'self' });
    expect(dead.notes).toContain('dead');
    expect(dead.cannotAct).toBe(true);
    expect(() => conditionEffects(state([], 7), { kind: 'check', role: 'self' })).toThrow(RangeError);
  });

  it('Restrained: speed 0 and Dexterity saves have disadvantage', () => {
    const r = conditionEffects(state(['restrained']), { kind: 'save', ability: 'dex', role: 'self' });
    expect(r.speedFactor).toBe(0);
    expect(r.disadvantage).toEqual(['Restrained: disadvantage on Dexterity saving throws']);
    expect(modeOf(conditionEffects(state(['restrained']), { kind: 'save', ability: 'con', role: 'self' }))).toBe(
      'normal',
    );
  });
});

describe('SRD 5.2.1 details beyond the ticket summary', () => {
  it('Grappled: disadvantage only against someone other than the grappler', () => {
    const g = state(['grappled']);
    expect(conditionEffects(g, { kind: 'attack', role: 'self', targetIsGrappler: true }).disadvantage).toEqual([]);
    expect(modeOf(conditionEffects(g, { kind: 'attack', role: 'self', targetIsGrappler: false }))).toBe('disadvantage');
    expect(conditionEffects(g, { kind: 'attack', role: 'self' }).notes[0]).toMatch(/anyone but the grappler/);
    expect(conditionEffects(g, { kind: 'check', role: 'self' }).speedFactor).toBe(0);
  });

  it('Initiative: Incapacitated gives disadvantage, Invisible advantage', () => {
    expect(
      modeOf(conditionEffects(state(['stunned']), { kind: 'check', ability: 'dex', role: 'self', initiative: true })),
    ).toBe('disadvantage');
    expect(
      modeOf(conditionEffects(state(['invisible']), { kind: 'check', ability: 'dex', role: 'self', initiative: true })),
    ).toBe('advantage');
    // an ordinary Dexterity check is not affected
    expect(modeOf(conditionEffects(state(['invisible']), { kind: 'check', ability: 'dex', role: 'self' }))).toBe(
      'normal',
    );
  });

  it('Invisible gives nothing against someone who can see it', () => {
    const inv = state(['invisible']);
    expect(modeOf(conditionEffects(inv, { kind: 'attack', role: 'self', targetCanSeeYou: true }))).toBe('normal');
    expect(
      modeOf(
        conditionEffects(inv, { kind: 'attack', role: 'against', attackerWithin5ft: false, attackerCanSeeYou: true }),
      ),
    ).toBe('normal');
    expect(modeOf(conditionEffects(inv, { kind: 'attack', role: 'against', attackerWithin5ft: false }))).toBe(
      'disadvantage',
    );
  });

  it('Unconscious: any hit from within 5 feet is a crit, and it is also prone', () => {
    const u = state(['unconscious']);
    const close = conditionEffects(u, { kind: 'attack', role: 'against', attackerWithin5ft: true });
    expect(close.critOnHit).toBe(true);
    expect(modeOf(close)).toBe('advantage');
    // from afar: Unconscious gives advantage, Prone disadvantage, so they cancel
    const far = conditionEffects(u, { kind: 'attack', role: 'against', attackerWithin5ft: false });
    expect(modeOf(far)).toBe('normal');
    expect(far.critOnHit).toBe(false);
  });

  it('Petrified ignores Poisoned (immunity) and notes its damage resistance', () => {
    const r = conditionEffects(state(['petrified', 'poisoned']), { kind: 'check', role: 'self' });
    expect(r.disadvantage).toEqual([]);
    expect(r.notes).toContain('Petrified: resistance to all damage, immune to poison');
  });

  it('Frightened applies only while the source of fear is in sight', () => {
    const f = state(['frightened']);
    expect(modeOf(conditionEffects(f, { kind: 'check', role: 'self' }))).toBe('disadvantage');
    expect(modeOf(conditionEffects(f, { kind: 'check', role: 'self', fearSourceInSight: false }))).toBe('normal');
  });

  it('Blinded fails checks that need sight; Deafened fails checks that need hearing', () => {
    expect(conditionEffects(state(['blinded']), { kind: 'check', role: 'self', requiresSight: true })).toMatchObject({
      autoFail: true,
      autoFailReason: 'Blinded: a check that needs sight fails',
    });
    expect(conditionEffects(state(['deafened']), { kind: 'check', role: 'self', requiresHearing: true }).autoFail).toBe(
      true,
    );
    expect(conditionEffects(state(['deafened']), { kind: 'check', role: 'self' }).autoFail).toBe(false);
  });

  it('Stunned does not stop movement (the 2024 rules dropped that)', () => {
    expect(conditionEffects(state(['stunned']), { kind: 'check', role: 'self' }).speedFactor).toBe(1);
  });

  it('exhaustion only counts when the exhausted creature rolls, and a long rest removes one level', () => {
    expect(
      conditionEffects(state([], 3), { kind: 'attack', role: 'against', attackerWithin5ft: true }).d20Penalty,
    ).toBe(0);
    expect(exhaustionAfterLongRest(3)).toBe(2);
    expect(exhaustionAfterLongRest(0)).toBe(0);
  });

  it('several conditions combine, without stacking', () => {
    const r = conditionEffects(state(['poisoned', 'prone', 'blinded']), { kind: 'attack', role: 'self' });
    expect(r.disadvantage).toHaveLength(3);
    expect(modeOf(r)).toBe('disadvantage');
  });

  it('every condition has a description', () => {
    for (const c of CONDITIONS) expect(CONDITION_INFO[c].length).toBeGreaterThan(20);
  });
});
