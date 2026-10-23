// P2-10: levelling up, one level at a time, following the SRD 5.2.1 class tables ("Character Advancement" and each
// class's features table). Levels come from XP; level_applied is the level the sheet is built to; each level-up
// builds the next level. The wizard-style flow in the app and the apply-level-up Edge Function both use this
// module, so the rules are checked the same way on both sides.
//
// This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast
// LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons
// Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
import { ABILITY_KEYS, abilityModifier, levelFromXp, type Ability } from './core';
import type { CreationClass, CreationSpell } from './creation';
import { hitDieSize, hitPointsGain, type ClassFeature, type HitDie } from './progression';
import type { CharacterSheet } from './sheet';
import { slotsFor } from './spellcasting';

/** A class as the level-up reads it: the creation fields plus the features table and subclasses. */
export interface LevelUpClass extends CreationClass {
  levels: {
    level: number;
    proficiencyBonus: number;
    features: ClassFeature[];
    columns: Record<string, number | string>;
  }[];
  subclasses: { id: string; name: string; features: ClassFeature[] }[];
}

export interface LevelUpChoices {
  /** The level being gained: always the sheet's applied level plus one. */
  toLevel: number;
  hitPoints: { method: 'average' } | { method: 'roll'; rollId: string };
  /** The subclass's id, at the level the class gains one. */
  subclass?: string;
  /** At an Ability Score Improvement: +2 to one score, or +1 to two, or a feat (when the campaign allows feats). */
  improvement?: { plus2: Ability } | { plus1: [Ability, Ability] } | { feat: string };
  /** What this level adds: new cantrips, newly prepared spells, and (Wizards) spells added to the spellbook. */
  spells: { cantrips: string[]; prepared: string[]; spellbook: string[] };
}

export const LEVEL_UP_STEPS = ['hitPoints', 'features', 'improvement', 'spells'] as const;
export type LevelUpStep = (typeof LEVEL_UP_STEPS)[number];
export interface LevelUpProblem {
  step: LevelUpStep;
  message: string;
}

/** A Wizard adds two spells to the spellbook at every Wizard level after 1 (SRD Wizard, Spellbook). */
export const WIZARD_SPELLBOOK_PER_LEVEL = 2;
export const ABILITY_SCORE_MAX = 20;

const count = (v: number | string | undefined) => (typeof v === 'number' ? v : 0);
const isSubclassFeature = (f: ClassFeature) => / Subclass$/.test(f.name);
const isImprovement = (f: ClassFeature) => f.name === 'Ability Score Improvement';

/** The level the sheet is built to (Phase 1 sheets have none: their level by XP). */
export const appliedLevel = (sheet: CharacterSheet) => sheet.levelApplied ?? levelFromXp(sheet.xp);

/** Levels reached by XP and not yet applied. */
export const pendingLevels = (sheet: CharacterSheet) => Math.max(0, levelFromXp(sheet.xp) - appliedLevel(sheet));

export interface LevelUpPlan {
  fromLevel: number;
  toLevel: number;
  /** False when the SRD data for the new level is not in the app yet (levels 4 and up for now). */
  available: boolean;
  hitDie: HitDie;
  /** The fixed hit point gain before the Constitution modifier: half the die plus 1. */
  averageRoll: number;
  /** The class features gained at the new level (and the subclass's, once there is one). */
  features: ClassFeature[];
  /** The subclasses to choose from, when this level gives one; otherwise null. */
  subclassChoice: { id: string; name: string; features: ClassFeature[] }[] | null;
  improvement: boolean;
  spells: {
    cantrips: number;
    prepared: number;
    spellbook: number;
    /** The highest spell level the class has slots for at the new level (0 for none). */
    maxSpellLevel: number;
  };
  /** Spell slots by level (index 0 is level 1) at the new level. */
  slots: number[];
}

/** What gaining the next level means for this character and class. */
export function levelUpPlan(sheet: CharacterSheet, cls: LevelUpClass): LevelUpPlan {
  const fromLevel = appliedLevel(sheet);
  const toLevel = fromLevel + 1;
  const row = cls.levels.find(l => l.level === toLevel);
  const prev = cls.levels.find(l => l.level === fromLevel);
  const hitDie = cls.hitDie;
  const base = {
    fromLevel,
    toLevel,
    hitDie,
    averageRoll: Math.floor(hitDieSize(hitDie) / 2) + 1,
  };
  if (!row || !prev) {
    return {
      ...base,
      available: false,
      features: [],
      subclassChoice: null,
      improvement: false,
      spells: { cantrips: 0, prepared: 0, spellbook: 0, maxSpellLevel: 0 },
      slots: [],
    };
  }
  const subclass = cls.subclasses.find(s => s.id === sheet.subclass);
  const caster = !!cls.spellcasting;
  const slots = caster ? slotsFor(cls, toLevel) : [];
  const maxSpellLevel = slots.reduce((top, n, i) => (n > 0 ? i + 1 : top), 0);
  return {
    ...base,
    available: true,
    features: [...row.features, ...(subclass?.features.filter(f => f.level === toLevel) ?? [])],
    subclassChoice: !subclass && row.features.some(isSubclassFeature) ? cls.subclasses : null,
    improvement: row.features.some(isImprovement),
    spells: {
      cantrips: Math.max(0, count(row.columns.cantrips) - count(prev.columns.cantrips)),
      prepared: Math.max(0, count(row.columns.preparedSpells) - count(prev.columns.preparedSpells)),
      spellbook: cls.spellcasting?.preparation === 'spellbook' ? WIZARD_SPELLBOOK_PER_LEVEL : 0,
      maxSpellLevel,
    },
    slots,
  };
}

/** The ability scores after an improvement, or the reason it cannot be made. */
function improved(
  scores: CharacterSheet['abilityScores'],
  imp: NonNullable<LevelUpChoices['improvement']>,
): { scores: CharacterSheet['abilityScores'] } | { problem: string } {
  if ('feat' in imp) return { scores };
  const out = { ...scores };
  const raise = 'plus2' in imp ? [[imp.plus2, 2] as const] : imp.plus1.map(a => [a, 1] as const);
  if ('plus1' in imp && imp.plus1[0] === imp.plus1[1])
    return { problem: 'Choose two different abilities for +1 each.' };
  for (const [a, by] of raise) {
    if (!ABILITY_KEYS.includes(a)) return { problem: `${a} is not an ability.` };
    if (out[a] + by > ABILITY_SCORE_MAX) return { problem: `That would raise ${a} to ${out[a] + by}; the most is 20.` };
    out[a] += by;
  }
  return { scores: out };
}

/**
 * Every rule a level-up's choices break. `rolledHitDie` is the server's roll of the Hit Point Die when the
 * method is 'roll'; `optionalFeats` is the campaign's setting. An empty list means the level can be applied.
 */
export function levelUpProblems(
  sheet: CharacterSheet,
  choices: LevelUpChoices,
  cls: LevelUpClass,
  spells: readonly CreationSpell[],
  options: { rolledHitDie?: number; optionalFeats?: boolean } = {},
): LevelUpProblem[] {
  const problems: LevelUpProblem[] = [];
  const add = (step: LevelUpStep, message: string) => problems.push({ step, message });
  if (cls.name !== sheet.className) {
    add('features', `This character is a ${sheet.className}, not a ${cls.name}.`);
    return problems;
  }
  if (pendingLevels(sheet) < 1) {
    add('features', 'No level-up is waiting: the character needs more XP.');
    return problems;
  }
  const plan = levelUpPlan(sheet, cls);
  if (choices.toLevel !== plan.toLevel) {
    add('features', `These choices are for level ${choices.toLevel}; the next level is ${plan.toLevel}.`);
    return problems;
  }
  if (!plan.available) {
    add('features', 'Content for this level is not available yet.');
    return problems;
  }

  if (choices.hitPoints.method === 'roll') {
    const size = hitDieSize(plan.hitDie);
    const r = options.rolledHitDie;
    if (r === undefined) add('hitPoints', 'Roll your Hit Point Die first.');
    else if (!Number.isInteger(r) || r < 1 || r > size) add('hitPoints', `A ${plan.hitDie} roll is from 1 to ${size}.`);
  }

  if (plan.subclassChoice) {
    if (!plan.subclassChoice.some(s => s.id === choices.subclass)) add('features', `Choose your ${cls.name} subclass.`);
  } else if (choices.subclass !== undefined && choices.subclass !== sheet.subclass) {
    add('features', `Level ${plan.toLevel} gives no subclass choice.`);
  }

  if (plan.improvement) {
    const imp = choices.improvement;
    if (!imp) add('improvement', 'Choose an Ability Score Improvement.');
    else if ('feat' in imp) {
      if (!options.optionalFeats) add('improvement', 'This campaign does not use feats: improve your ability scores.');
      else add('improvement', 'Feats arrive later: improve your ability scores for now.');
    } else {
      const r = improved(sheet.abilityScores, imp);
      if ('problem' in r) add('improvement', r.problem);
    }
  } else if (choices.improvement) add('improvement', `Level ${plan.toLevel} gives no Ability Score Improvement.`);

  const known = sheet.spells ?? { cantrips: [], prepared: [], spellbook: [] };
  const onList = (name: string, test: (level: number) => boolean) =>
    spells.some(s => s.name === name && s.classes.includes(cls.name) && test(s.level));
  const checkNew = (list: string[], size: number, what: string, have: string[], test: (l: number) => boolean) => {
    if (new Set(list).size !== list.length) add('spells', `Choose each ${what} only once.`);
    for (const n of list) {
      if (have.includes(n)) add('spells', `You already have ${n}.`);
      else if (!onList(n, test))
        add('spells', `${n} is not a ${cls.name} ${what} you can take at level ${plan.toLevel}.`);
    }
    if (list.length !== size)
      add(
        'spells',
        size ? `Choose ${size} new ${what}${size === 1 ? '' : 's'}.` : `Level ${plan.toLevel} adds no ${what}s.`,
      );
  };
  const levelled = (l: number) => l >= 1 && l <= plan.spells.maxSpellLevel;
  checkNew(choices.spells.cantrips, plan.spells.cantrips, 'cantrip', known.cantrips, l => l === 0);
  checkNew(choices.spells.spellbook, plan.spells.spellbook, 'spellbook spell', known.spellbook ?? [], levelled);
  checkNew(choices.spells.prepared, plan.spells.prepared, 'prepared spell', known.prepared, levelled);
  if (plan.spells.spellbook) {
    const book = [...(known.spellbook ?? []), ...choices.spells.spellbook];
    if (choices.spells.prepared.some(p => !book.includes(p))) add('spells', 'Prepare spells from your spellbook.');
  }
  return problems;
}

/** Hit points this level adds: the average (half the die plus 1) or the roll, plus the Constitution modifier. */
export function levelUpHitPoints(
  sheet: CharacterSheet,
  choices: LevelUpChoices,
  cls: LevelUpClass,
  rolledHitDie?: number,
) {
  const scores =
    choices.improvement && !('feat' in choices.improvement) ? improved(sheet.abilityScores, choices.improvement) : null;
  const after = scores && 'scores' in scores ? scores.scores : sheet.abilityScores;
  const con = abilityModifier(after.con);
  const gain =
    choices.hitPoints.method === 'roll'
      ? hitPointsGain(cls.hitDie, con, 'rolled', rolledHitDie)
      : hitPointsGain(cls.hitDie, con, 'average');
  // a higher Constitution modifier raises the hit point maximum for every earlier level too (SRD "Constitution")
  const earlier = (con - abilityModifier(sheet.abilityScores.con)) * appliedLevel(sheet);
  return gain + earlier;
}

/**
 * The sheet one level higher. Call it only when levelUpProblems finds none (it throws on choices it cannot apply).
 * Maximum and current hit points rise by the gain, the Hit Point Dice by one; the proficiency bonus and spell
 * slots follow from the new applied level.
 */
export function applyLevelUp(
  sheet: CharacterSheet,
  choices: LevelUpChoices,
  cls: LevelUpClass,
  rolledHitDie?: number,
): CharacterSheet {
  const plan = levelUpPlan(sheet, cls);
  if (!plan.available || choices.toLevel !== plan.toLevel) throw new RangeError('That level cannot be applied');
  let abilityScores = sheet.abilityScores;
  if (choices.improvement && !('feat' in choices.improvement)) {
    const r = improved(sheet.abilityScores, choices.improvement);
    if ('problem' in r) throw new RangeError(r.problem);
    abilityScores = r.scores;
  }
  const gain = levelUpHitPoints(sheet, choices, cls, rolledHitDie);
  const known = sheet.spells ?? { cantrips: [], prepared: [] };
  return {
    ...sheet,
    levelApplied: plan.toLevel,
    abilityScores,
    hp: { ...sheet.hp, max: sheet.hp.max + gain, current: sheet.hp.current + gain },
    hitDice: { ...sheet.hitDice, total: sheet.hitDice.total + 1 },
    ...(plan.subclassChoice && choices.subclass ? { subclass: choices.subclass } : {}),
    ...(cls.spellcasting
      ? {
          spells: {
            cantrips: [...known.cantrips, ...choices.spells.cantrips],
            prepared: [...known.prepared, ...choices.spells.prepared],
            ...(plan.spells.spellbook || known.spellbook
              ? { spellbook: [...(known.spellbook ?? []), ...choices.spells.spellbook] }
              : {}),
          },
        }
      : {}),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const names = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= 20 && v.every(s => typeof s === 'string' && s.length <= 80);

/** The shape check for a level-up payload (types and lengths); the rules come from levelUpProblems. */
export function readLevelUpChoices(v: unknown): { choices: LevelUpChoices } | { error: string } {
  if (!isObj(v)) return { error: 'The choices must be an object' };
  if (!Number.isInteger(v.toLevel)) return { error: 'toLevel must be a whole number' };
  const hp = v.hitPoints;
  if (!isObj(hp) || !(hp.method === 'average' || (hp.method === 'roll' && typeof hp.rollId === 'string')))
    return { error: 'hitPoints must be { method: "average" } or { method: "roll", rollId }' };
  if (v.subclass !== undefined && (typeof v.subclass !== 'string' || v.subclass.length > 80))
    return { error: 'subclass must be an id' };
  const imp = v.improvement;
  if (
    imp !== undefined &&
    !(
      isObj(imp) &&
      (typeof imp.plus2 === 'string' ||
        (Array.isArray(imp.plus1) && imp.plus1.length === 2 && imp.plus1.every(a => typeof a === 'string')) ||
        typeof imp.feat === 'string')
    )
  )
    return { error: 'improvement must be { plus2 }, { plus1: [a, b] } or { feat }' };
  const sp = v.spells;
  if (!isObj(sp) || !names(sp.cantrips) || !names(sp.prepared) || !names(sp.spellbook))
    return { error: 'spells needs cantrips, prepared and spellbook lists' };
  return {
    choices: {
      toLevel: v.toLevel as number,
      hitPoints: hp.method === 'roll' ? { method: 'roll', rollId: hp.rollId as string } : { method: 'average' },
      ...(v.subclass !== undefined ? { subclass: v.subclass as string } : {}),
      ...(imp !== undefined ? { improvement: imp as LevelUpChoices['improvement'] } : {}),
      spells: { cantrips: sp.cantrips, prepared: sp.prepared, spellbook: sp.spellbook },
    },
  };
}
