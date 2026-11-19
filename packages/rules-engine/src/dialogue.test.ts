import { describe, expect, it } from 'vitest';
import { describeCondition, evaluateCondition, parseDialogueCondition, type DialogueContext } from './dialogue';

const vanguard: DialogueContext = {
  characterIds: ['brannoc', 'ivo'],
  itemNames: ['Longsword', 'Crown Shard', 'Rope (50 feet)'],
  regionId: 'mourning-wood',
  levels: [5, 1],
};
const rearguard: DialogueContext = { characterIds: ['kael'], itemNames: ['Quarterstaff'], regionId: null, levels: [3] };

describe('evaluateCondition', () => {
  it('always: and a line with no condition at all suits every group', () => {
    expect(evaluateCondition({ type: 'always' }, rearguard)).toBe(true);
    expect(evaluateCondition(null, rearguard)).toBe(true);
    expect(evaluateCondition(undefined, rearguard)).toBe(true);
  });

  it('has_item: someone in the group carries it, whatever the case', () => {
    expect(evaluateCondition({ type: 'has_item', item: 'crown shard' }, vanguard)).toBe(true);
    expect(evaluateCondition({ type: 'has_item', item: 'Crown Shard' }, rearguard)).toBe(false);
    // the whole name, not part of it
    expect(evaluateCondition({ type: 'has_item', item: 'Rope' }, vanguard)).toBe(false);
  });

  it('in_region: the group is there', () => {
    expect(evaluateCondition({ type: 'in_region', regionId: 'mourning-wood' }, vanguard)).toBe(true);
    expect(evaluateCondition({ type: 'in_region', regionId: 'mourning-wood' }, rearguard)).toBe(false);
  });

  it('level_at_least: someone in the group has reached it', () => {
    expect(evaluateCondition({ type: 'level_at_least', level: 5 }, vanguard)).toBe(true);
    expect(evaluateCondition({ type: 'level_at_least', level: 6 }, vanguard)).toBe(false);
    expect(evaluateCondition({ type: 'level_at_least', level: 3 }, rearguard)).toBe(true);
  });

  it('is_party_member: that character is in the group', () => {
    expect(evaluateCondition({ type: 'is_party_member', characterId: 'ivo' }, vanguard)).toBe(true);
    expect(evaluateCondition({ type: 'is_party_member', characterId: 'ivo' }, rearguard)).toBe(false);
  });

  it('a condition it does not understand is never met', () => {
    for (const odd of [
      { type: 'moon_is_full' },
      { type: 'has_item' },
      { type: 'level_at_least', level: 0 },
      { type: 'level_at_least', level: 2.5 },
      'always',
      [],
      42,
    ]) {
      expect(evaluateCondition(odd, vanguard)).toBe(false);
    }
  });
});

describe('parseDialogueCondition', () => {
  it('keeps only the fields a type uses, tidied', () => {
    expect(parseDialogueCondition({ type: 'has_item', item: '  Crown Shard ', extra: 1 })).toEqual({
      type: 'has_item',
      item: 'Crown Shard',
    });
    expect(parseDialogueCondition({ type: 'in_region', regionId: '' })).toBeNull();
  });
});

describe('describeCondition', () => {
  it('says the condition in a few words for the line’s tag', () => {
    expect(describeCondition({ type: 'has_item', item: 'Crown Shard' })).toBe('if Crown Shard');
    expect(describeCondition({ type: 'level_at_least', level: 3 })).toBe('if level 3+');
    expect(describeCondition({ type: 'in_region', regionId: 'r' }, { region: () => 'Mourning Wood' })).toBe(
      'if in Mourning Wood',
    );
    expect(describeCondition({ type: 'is_party_member', characterId: 'c' }, { character: () => 'Ivo' })).toBe(
      'if Ivo is there',
    );
    expect(describeCondition({ type: 'always' })).toBeNull();
    expect(describeCondition(null)).toBeNull();
    expect(describeCondition({ type: 'weird' })).toBe('if (unknown condition)');
  });
});
