// P2-10: the apply-level-up Edge Function's logic, kept apart from the database (index.ts) so it can be tested.
//
// The player sends the choices for their character's next level. The server checks that a level is pending and
// that the choices are for that level, checks them against the SRD class table and spell list with the rules
// engine's level-up rules (the same ones the app uses), uses its own record of any Hit Point Die roll, builds the
// new sheet itself and works it out with computeSheet. The sheet, level_applied and the audit row are written in
// one step by apply_level_up_from_function, which also refuses a level that was applied in the meantime.
import {
  applyLevelUp,
  computeSheet,
  levelUpHitPoints,
  levelUpProblems,
  readLevelUpChoices,
  type CharacterSheet,
  type CreationSpell,
  type LevelUpClass,
  type LevelUpProblem,
} from '../_shared/rules-engine/index.ts';

export interface StoredCharacter {
  id: string;
  campaignId: string;
  ownerId: string;
  name: string;
  sheet: unknown;
  xp: number;
  levelApplied: number;
}

export interface ApplyArgs {
  p_actor: string;
  p_character: string;
  p_from: number;
  p_sheet: unknown;
  p_choices: unknown;
  p_hp_gain: number;
  p_roll: string | null;
}

export interface LevelUpDeps {
  userFromToken(token: string): Promise<string | null>;
  roleIn(campaignId: string, userId: string): Promise<'dm' | 'player' | null>;
  loadCharacter(characterId: string): Promise<StoredCharacter | null>;
  /** The SRD class by name (srd_classes), or null. */
  loadClass(name: string): Promise<LevelUpClass | null>;
  loadSpells(): Promise<CreationSpell[]>;
  /** The character's unused Hit Point Die roll for a level: its id and the number rolled. */
  unusedHitDieRoll(characterId: string, level: number): Promise<{ id: string; die: number } | null>;
  /** Whether the campaign lets players take a feat instead of an Ability Score Improvement. */
  optionalFeats(campaignId: string): Promise<boolean>;
  /** Calls public.apply_level_up_from_function with the service role. */
  apply(args: ApplyArgs): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly problems?: LevelUpProblem[],
  ) {
    super(message);
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DB_ERRORS: Record<string, number> = { '42501': 403, '22023': 409 };
const isInt = (v: unknown) => Number.isInteger(v);

/** The stored sheet, checked enough for the level-up rules. Name, XP and level come from their columns. */
function sheetOf(c: StoredCharacter): CharacterSheet {
  const s = (c.sheet ?? {}) as Record<string, unknown>;
  const scores = (s.abilityScores ?? {}) as Record<string, unknown>;
  const hp = (s.hp ?? {}) as Record<string, unknown>;
  const dice = (s.hitDice ?? {}) as Record<string, unknown>;
  const ok =
    typeof s.className === 'string' &&
    ['str', 'dex', 'con', 'int', 'wis', 'cha'].every(a => isInt(scores[a])) &&
    isInt(hp.max) &&
    isInt(hp.current) &&
    isInt(dice.total);
  if (!ok) throw new HttpError(422, 'This character sheet is damaged, so it cannot be levelled up');
  return { ...(s as unknown as CharacterSheet), name: c.name, xp: c.xp, levelApplied: c.levelApplied };
}

export async function handle(req: Request, deps: LevelUpDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const userId = token ? await deps.userFromToken(token) : null;
    if (!userId) throw new HttpError(401, 'Sign in first');

    const body = (await req.json().catch(() => null)) as { characterId?: unknown; choices?: unknown } | null;
    if (typeof body?.characterId !== 'string' || !UUID.test(body.characterId)) {
      throw new HttpError(400, 'characterId is missing');
    }
    const read = readLevelUpChoices(body.choices);
    if ('error' in read) throw new HttpError(400, read.error);
    const choices = read.choices;

    const character = await deps.loadCharacter(body.characterId);
    if (!character) throw new HttpError(404, 'We could not find that character');
    const role = await deps.roleIn(character.campaignId, userId);
    if (character.ownerId !== userId && role !== 'dm') {
      throw new HttpError(403, 'You can only level up your own character');
    }

    const sheet = sheetOf(character);
    const cls = await deps.loadClass(sheet.className);
    if (!cls) throw new HttpError(422, `The SRD has no class called ${sheet.className}`);

    // once the die is rolled for a level, that roll is the gain: no swapping a low roll for the average
    const unused = await deps.unusedHitDieRoll(character.id, choices.toLevel);
    let rolled: { id: string; die: number } | null = null;
    if (choices.hitPoints.method === 'roll') {
      if (!unused || unused.id !== choices.hitPoints.rollId) {
        throw new HttpError(422, 'That hit point roll is not this level’s unused roll');
      }
      rolled = unused;
    } else if (unused) {
      throw new HttpError(422, 'You rolled your Hit Point Die for this level: that roll is your gain');
    }
    const [spells, optionalFeats] = await Promise.all([deps.loadSpells(), deps.optionalFeats(character.campaignId)]);
    const problems = levelUpProblems(sheet, choices, cls, spells, { rolledHitDie: rolled?.die, optionalFeats });
    if (problems.length) throw new HttpError(422, 'These choices cannot be applied', problems);

    const next = applyLevelUp(sheet, choices, cls, rolled?.die);
    const gain = levelUpHitPoints(sheet, choices, cls, rolled?.die);
    // worked out here: if the engine cannot compute the new sheet, nothing is written
    const computed = computeSheet(next, [], { seconds: 0 });

    const { error } = await deps.apply({
      p_actor: userId,
      p_character: character.id,
      p_from: sheet.levelApplied!,
      p_sheet: next,
      p_choices: choices,
      p_hp_gain: gain,
      p_roll: rolled?.id ?? null,
    });
    if (error) throw new HttpError(DB_ERRORS[error.code ?? ''] ?? 500, error.message);
    return json(200, {
      level: next.levelApplied,
      hitPoints: computed.hp.max,
      hitPointsGained: gain,
      proficiencyBonus: computed.proficiencyBonus,
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return json(e.status, { error: e.message, ...(e.problems ? { problems: e.problems } : {}) });
    }
    console.error(e);
    return json(500, { error: 'Something went wrong on the server' });
  }
}
