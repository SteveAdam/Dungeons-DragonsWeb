// P2-4: class progression, hit points and background ability scores, following the SRD 5.2.1 ("Character
// Creation" and the class descriptions). Levels 1 to 3 for now; the class records live in packages/srd-data.
//
// This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast
// LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons
// Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
import type { Ability } from './core';
import type { AbilityScores } from './requirements';

export type HitDie = 'd6' | 'd8' | 'd10' | 'd12';

export interface ClassFeature {
  level: number;
  name: string;
  /** SRD text. */
  description: string;
  /** 'later': has game mechanics the app does not run yet (shown as text only). */
  mechanics?: 'later' | 'none';
}

export interface ClassLevel {
  level: number;
  proficiencyBonus: number;
  features: ClassFeature[];
  /** The class table's other columns at this level, e.g. { rages: 2, rageDamage: '+2' }. */
  columns: Record<string, number | string>;
}

export interface ClassDef {
  id: string;
  name: string;
  hitDie: HitDie;
  levels: ClassLevel[];
  subclasses: { id: string; name: string; features: ClassFeature[] }[];
}

export interface ClassProgression {
  level: number;
  proficiencyBonus: number;
  /** Gained at exactly this level (with the subclass's, once one is chosen). */
  features: ClassFeature[];
  /** Everything gained from level 1 up to this level. */
  featuresSoFar: ClassFeature[];
  columns: Record<string, number | string>;
}

/** What a class gives at a level. Only levels the data covers (1 to 3 for now) can be asked for. */
export function classProgression(def: ClassDef, level: number, subclassId?: string): ClassProgression {
  const row = def.levels.find(l => l.level === level);
  if (!Number.isInteger(level) || !row) {
    const top = Math.max(...def.levels.map(l => l.level));
    throw new RangeError(`${def.name} is described for levels 1 to ${top}, not ${level}`);
  }
  const subclass = subclassId === undefined ? undefined : def.subclasses.find(s => s.id === subclassId);
  if (subclassId !== undefined && !subclass) throw new RangeError(`${def.name} has no subclass ${subclassId}`);
  const upTo = (l: number) => [
    ...def.levels.filter(x => x.level <= l).flatMap(x => x.features),
    ...(subclass?.features.filter(f => f.level <= l) ?? []),
  ];
  return {
    level,
    proficiencyBonus: row.proficiencyBonus,
    features: [...row.features, ...(subclass?.features.filter(f => f.level === level) ?? [])],
    featuresSoFar: upTo(level),
    columns: { ...row.columns },
  };
}

const DIE_SIZE: Record<HitDie, number> = { d6: 6, d8: 8, d10: 10, d12: 12 };
export const hitDieSize = (die: HitDie): number => {
  const size = DIE_SIZE[die];
  if (!size) throw new RangeError(`${die} is not a Hit Point Die`);
  return size;
};

/** Level 1 hit points: the highest number on the Hit Point Die plus the Constitution modifier. */
export function hitPointsAtLevel1(hitDie: HitDie, conModifier: number): number {
  return Math.max(1, hitDieSize(hitDie) + conModifier);
}

/**
 * Hit points gained at each level after the first: the fixed value (half the die, plus 1) or a roll of the die,
 * plus the Constitution modifier. A level always adds at least 1.
 */
export function hitPointsGain(
  hitDie: HitDie,
  conModifier: number,
  method: 'average' | 'rolled',
  roll?: number,
): number {
  const size = hitDieSize(hitDie);
  let base: number;
  if (method === 'average') base = Math.floor(size / 2) + 1;
  else {
    if (roll === undefined || !Number.isInteger(roll) || roll < 1 || roll > size) {
      throw new RangeError(`A ${hitDie} roll must be a whole number from 1 to ${size}, got ${roll}`);
    }
    base = roll;
  }
  return Math.max(1, base + conModifier);
}

/** Background ability score increases: +2 to one listed ability and +1 to another, or +1 to all three. */
export type BackgroundChoice = { plus2: Ability; plus1: Ability } | { plusOneEach: true };

/** No background increase can raise a score above this. */
export const BACKGROUND_SCORE_MAX = 20;

/**
 * Applies a background's ability score increases. The background lists three abilities; only those can rise,
 * as +2 and +1 to two different ones or +1 to each, and none above 20. Returns new scores (the input is unchanged).
 */
export function applyBackground(
  scores: AbilityScores,
  background: { name: string; abilityScores: readonly Ability[] },
  choice: BackgroundChoice,
): AbilityScores {
  const listed = background.abilityScores;
  if (listed.length !== 3 || new Set(listed).size !== 3) {
    throw new RangeError(`${background.name} must list three different abilities`);
  }
  const increases: Partial<Record<Ability, number>> =
    'plusOneEach' in choice
      ? Object.fromEntries(listed.map(a => [a, 1]))
      : choice.plus2 === choice.plus1
        ? (() => {
            throw new RangeError('The +2 and the +1 must go to two different abilities');
          })()
        : { [choice.plus2]: 2, [choice.plus1]: 1 };
  const out = { ...scores };
  for (const [ability, by] of Object.entries(increases) as [Ability, number][]) {
    if (!listed.includes(ability)) {
      throw new RangeError(`${background.name} can raise only ${listed.join(', ')}, not ${ability}`);
    }
    if (out[ability] + by > BACKGROUND_SCORE_MAX) {
      throw new RangeError(`That would raise ${ability} to ${out[ability] + by}; the most is ${BACKGROUND_SCORE_MAX}`);
    }
    out[ability] += by;
  }
  return out;
}
