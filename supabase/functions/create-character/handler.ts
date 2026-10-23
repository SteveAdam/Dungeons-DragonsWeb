// P2-9: the create-character Edge Function's logic, kept apart from the database (index.ts) so it can be tested.
//
// A player sends their wizard choices. The server reads the payload's shape, checks every choice against the SRD
// rows in the database with the rules engine's creation rules (the same ones the wizard uses), checks rolled
// scores against the player's own unused ability roll, then builds the level 1 sheet and starting kit itself and
// works the sheet out with computeSheet. Any numbers the client computed are never read. The character, its
// entity, items, gold and Party place are written in one transaction by create_character_from_wizard.
import {
  abilityRollTotals,
  buildCharacter,
  computeSheet,
  creationProblems,
  previewItems,
  readCreationChoices,
  type CreationProblem,
  type CreationSrd,
} from '../_shared/rules-engine/index.ts';

export interface CreateArgs {
  p_actor: string;
  p_campaign: string;
  p_name: string;
  p_sheet: unknown;
  p_items: unknown;
  p_gp: number;
  p_roll: string | null;
}

export interface CreateDeps {
  /** The user id for an access token, or null when the token is missing, expired or forged. */
  userFromToken(token: string): Promise<string | null>;
  /** The caller's role in the campaign, or null when they are not a member. */
  roleIn(campaignId: string, userId: string): Promise<'dm' | 'player' | null>;
  /** The SRD rows (srd_species, srd_classes, srd_backgrounds, srd_spells, srd_weapons, srd_armor). */
  loadSrd(): Promise<CreationSrd>;
  /** The player's unused ability roll in the campaign: its id and its 24 d6. */
  unusedAbilityRoll(userId: string, campaignId: string): Promise<{ id: string; dice: number[] } | null>;
  /** Calls public.create_character_from_wizard with the service role. */
  createCharacter(args: CreateArgs): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
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
    readonly problems?: CreationProblem[],
  ) {
    super(message);
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The database's own refusals, as HTTP statuses. */
const DB_ERRORS: Record<string, number> = { '42501': 403, '22023': 422, '23505': 409 };

export async function handle(req: Request, deps: CreateDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const userId = token ? await deps.userFromToken(token) : null;
    if (!userId) throw new HttpError(401, 'Sign in first');

    const body = (await req.json().catch(() => null)) as { campaignId?: unknown; choices?: unknown } | null;
    if (typeof body?.campaignId !== 'string' || !UUID.test(body.campaignId)) {
      throw new HttpError(400, 'campaignId is missing');
    }
    const read = readCreationChoices(body.choices);
    if ('error' in read) throw new HttpError(400, read.error);
    const choices = read.choices;

    const role = await deps.roleIn(body.campaignId, userId);
    if (!role) throw new HttpError(403, 'Only members of this campaign can create a character here');

    const srd = await deps.loadSrd();
    if (srd.classes.length === 0) throw new HttpError(503, 'The SRD has not been imported yet (pnpm srd:import)');

    // rolled scores must be the player's own unused roll, exactly as the server rolled it
    let rolledTotals: number[] | undefined;
    let rollId: string | null = null;
    if (choices.abilities.method === 'roll') {
      const roll = await deps.unusedAbilityRoll(userId, body.campaignId);
      if (!roll || roll.id !== choices.abilities.rollId) {
        throw new HttpError(422, 'Those ability scores do not come from your unused ability roll');
      }
      rolledTotals = abilityRollTotals(roll.dice);
      rollId = roll.id;
    }

    const problems = creationProblems(choices, srd, rolledTotals);
    if (problems.length) throw new HttpError(422, 'Some choices break the rules', problems);

    const built = buildCharacter(choices, srd);
    // worked out here, from the server's own build: if the engine cannot compute it, nothing is written
    const sheet = computeSheet(built.sheet, [], { seconds: 0 }, undefined, previewItems(built));

    const { data, error } = await deps.createCharacter({
      p_actor: userId,
      p_campaign: body.campaignId,
      p_name: built.sheet.name,
      p_sheet: built.sheet,
      p_items: built.items.map(i => ({
        name: i.name,
        kind: i.kind,
        definition: i.definition,
        weight: i.weight,
        quantity: i.quantity,
        value_cp: i.valueCp,
        srd_ref: i.srdRef,
        equipped: i.equipped,
      })),
      p_gp: built.gp,
      p_roll: rollId,
    });
    if (error) throw new HttpError(DB_ERRORS[error.code ?? ''] ?? 500, error.message);
    return json(201, {
      characterId: data,
      hitPoints: sheet.hp.max,
      armorClass: sheet.armorClass.value,
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return json(e.status, { error: e.message, ...(e.problems ? { problems: e.problems } : {}) });
    }
    console.error(e);
    return json(500, { error: 'Something went wrong on the server' });
  }
}
