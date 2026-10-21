// The zod schema for a stored character sheet (P1-7). It lives here, not in the rules engine, because the
// engine must have no runtime dependencies (P1-1); the engine's CharacterSheet type is the source of truth,
// and the `satisfies` check below fails to compile if the two drift apart.
import { ABILITY_KEYS, SKILL_KEYS, type CharacterSheet, type Effect } from '@dnd-manager/rules-engine';
import { z } from 'zod';

const ability = z.enum(
  ABILITY_KEYS as [CharacterSheet['saveProficiencies'][number], ...CharacterSheet['saveProficiencies']],
);
const skill = z.enum(SKILL_KEYS as [CharacterSheet['expertise'][number], ...CharacterSheet['expertise']]);
const score = z.number().int().min(1).max(30);

const requirement = z.object({
  stat: ability,
  min: z.number().int().min(1).max(30),
  onUnmet: z.enum(['lock', 'speed_penalty']),
  penaltyFt: z.number().int().min(0).optional(),
});

export const characterSheetSchema = z.object({
  name: z.string().trim().min(1).max(80),
  species: z.string().max(80),
  className: z.string().max(80),
  background: z.string().max(80),
  alignment: z.string().max(40),
  xp: z.number().int().min(0),
  abilityScores: z.object({ str: score, dex: score, con: score, int: score, wis: score, cha: score }),
  skillProficiencies: z.array(skill),
  expertise: z.array(skill),
  saveProficiencies: z.array(ability),
  hp: z.object({ max: z.number().int().min(1), current: z.number().int(), temp: z.number().int().min(0) }),
  hitDice: z.object({
    die: z.enum(['d6', 'd8', 'd10', 'd12']),
    total: z.number().int().min(0),
    spent: z.number().int().min(0),
  }),
  speed: z.number().int().min(0),
  armor: z
    .object({
      name: z.string().min(1).max(80),
      base: z.number().int().min(0),
      dexCap: z.number().int().min(0).nullable(),
      strReq: z.number().int().min(1).max(30).optional(),
    })
    .nullable(),
  shield: z.boolean(),
  weapons: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(80),
      ability: z.enum(['str', 'dex', 'finesse']),
      proficient: z.boolean(),
      magicBonus: z.number().int().min(-5).max(5),
      damage: z.string().regex(/^\d+d\d+$/, 'Damage dice look like 1d8'),
      damageType: z.string().max(30),
      mastery: z.string().max(30).optional(),
      requirements: z.array(requirement).optional(),
    }),
  ),
  equipment: z.array(z.string().max(120)),
  inspiration: z.boolean(),
}) satisfies z.ZodType<CharacterSheet>;

export const effectDurationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rounds'), remaining: z.number().int() }),
  z.object({ kind: z.literal('until'), atSeconds: z.number() }),
  z.object({ kind: z.literal('rest'), rest: z.enum(['short', 'long']) }),
  z.object({ kind: z.literal('permanent') }),
]) satisfies z.ZodType<Effect['duration']>;
