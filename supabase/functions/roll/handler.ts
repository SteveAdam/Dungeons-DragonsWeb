// P2-2: the roll Edge Function's logic. The server works out every roll bonus itself, from the stored character,
// its effects, its conditions and the campaign's game clock, with the same rules engine the browser uses (see
// scripts/sync-engine.mjs). Whatever bonus or advantage the request claims is ignored; only a DM may set the
// roll mode.
//
// Actions (POST, JSON body):
//   preview  { campaignId, characterId, kind, key, target }  -> { bonus, bonusBreakdown, mode, reasons, chance, critChance, ... }
//   roll     the same, plus hidden (DM only)                  -> the logged roll row
//
// Everything that touches the database or the token is in RollDeps, so the tests can run without a server.
import {
  ABILITY_KEYS,
  computeSheet,
  ITEM_KINDS,
  conditionEffects,
  critChance,
  resolveRollMode,
  SKILLS,
  successChance,
  type Ability,
  type CharacterSheet,
  type CharacterState,
  type Condition,
  type Effect,
  type InventoryItem,
  type ItemKind,
  type RollMode,
  type RollModeReason,
  type SkillKey,
} from '../_shared/rules-engine/index.ts';

export type RollKind = 'check' | 'save' | 'attack';
const KINDS: readonly RollKind[] = ['check', 'save', 'attack'];
const MODES: readonly RollMode[] = ['normal', 'advantage', 'disadvantage'];

export interface CharacterRecord {
  id: string;
  campaignId: string;
  ownerId: string;
  name: string;
  /** The sheet jsonb, as stored. Checked before use. */
  sheet: unknown;
  xp: number;
  /** The level the sheet is built to (P2-6): bonuses use it, not the level XP has reached. */
  levelApplied: number;
  conditions: string[];
  exhaustion: number;
}

export interface EffectRow {
  id: string;
  name: string;
  source: string;
  stat: string;
  mode: string;
  value: number;
  duration: unknown;
  concentration: boolean;
}

export interface RollD20Args {
  p_actor: string;
  p_campaign: string;
  p_character: string;
  p_kind: RollKind;
  p_label: string;
  p_bonus: number;
  p_target: number;
  p_mode: RollMode;
  p_hidden: boolean;
  p_breakdown: { label: string; value: number }[];
}

export interface ItemRow {
  id: string;
  name: string;
  kind: string;
  definition: unknown;
  weight: number | null;
  quantity: number;
  requiresAttunement: boolean;
  equipped: boolean;
  attuned: boolean;
}

export interface RollDeps {
  /** The user id for an access token, or null when the token is missing, expired or forged. */
  userFromToken(token: string): Promise<string | null>;
  /** The caller's role in the campaign, or null when they are not a member. */
  roleIn(campaignId: string, userId: string): Promise<'dm' | 'player' | null>;
  loadCharacter(characterId: string): Promise<CharacterRecord | null>;
  loadEffects(characterId: string): Promise<EffectRow[]>;
  /** The items the character carries (P2-7): equipped ones give armour class, attacks and effects. */
  loadItems(characterId: string): Promise<ItemRow[]>;
  gameSeconds(campaignId: string): Promise<number>;
  /** Calls public.roll_d20 with the service role. */
  rollD20(args: RollD20Args): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
}

export interface RollInput {
  action: 'preview' | 'roll';
  campaignId: string;
  characterId: string;
  kind: RollKind;
  /** A skill key ('athletics'), an ability key ('str') or a weapon id. */
  key: string;
  /** The DC, or the armour class for an attack. */
  target: number;
  /** Honoured for a DM only. */
  mode?: RollMode;
  /** DM only. */
  hidden?: boolean;
}

export interface Preview {
  label: string;
  bonus: number;
  bonusBreakdown: { label: string; value: number }[];
  mode: RollMode;
  reasons: RollModeReason[];
  /** The chance to meet the target, 0 to 1. */
  chance: number;
  /** The chance of a natural 20. */
  critChance: number;
  /** Set when a condition makes the roll fail whatever the dice say. */
  autoFail: string | null;
  notes: string[];
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
  ) {
    super(message);
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads the request body. Only these fields are read: a `bonus` or `advantage` sent along is never looked at. */
export function parseInput(body: unknown): RollInput {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.action !== 'preview' && b.action !== 'roll') throw new HttpError(400, 'action must be preview or roll');
  if (typeof b.campaignId !== 'string' || !UUID.test(b.campaignId)) throw new HttpError(400, 'campaignId is missing');
  if (typeof b.characterId !== 'string' || !UUID.test(b.characterId)) {
    throw new HttpError(400, 'characterId is missing');
  }
  if (!KINDS.includes(b.kind as RollKind)) throw new HttpError(400, 'kind must be check, save or attack');
  if (typeof b.key !== 'string' || b.key.length < 1 || b.key.length > 80) throw new HttpError(400, 'key is missing');
  if (!Number.isInteger(b.target) || (b.target as number) < 1 || (b.target as number) > 50) {
    throw new HttpError(400, 'target must be a whole number from 1 to 50');
  }
  if (b.mode !== undefined && b.mode !== null && !MODES.includes(b.mode as RollMode)) {
    throw new HttpError(400, 'mode must be normal, advantage or disadvantage');
  }
  if (b.hidden !== undefined && typeof b.hidden !== 'boolean') throw new HttpError(400, 'hidden must be true or false');
  return {
    action: b.action,
    campaignId: b.campaignId,
    characterId: b.characterId,
    kind: b.kind as RollKind,
    key: b.key,
    target: b.target as number,
    ...(b.mode ? { mode: b.mode as RollMode } : {}),
    ...(b.hidden ? { hidden: true } : {}),
  };
}

const isInt = (v: unknown) => Number.isInteger(v);
const isStringArray = (v: unknown) => Array.isArray(v) && v.every(s => typeof s === 'string');

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * A stored item, checked enough that computeSheet cannot trip over it. A weapon or armour part that is not
 * shaped right is dropped (the item still counts as carried), so one damaged item cannot stop every roll.
 */
export function itemOf(r: ItemRow): InventoryItem {
  const d = isObject(r.definition) ? r.definition : {};
  const w = isObject(d.weapon) ? d.weapon : null;
  const a = isObject(d.armor) ? d.armor : null;
  const weaponOk =
    !!w &&
    (w.category === 'simple' || w.category === 'martial') &&
    (w.kind === 'melee' || w.kind === 'ranged') &&
    isObject(w.damage) &&
    typeof w.damage.dice === 'string' &&
    typeof w.damage.type === 'string' &&
    isStringArray(w.properties) &&
    typeof w.mastery === 'string' &&
    w.mastery.length > 0;
  const armorOk = !!a && ['light', 'medium', 'heavy', 'shield'].includes(a.category as string) && isInt(a.baseAc);
  const effects = Array.isArray(d.effects)
    ? d.effects.filter(
        (e): e is { stat: Effect['stat']; mode: Effect['mode']; value: number } =>
          isObject(e) &&
          ['str', 'dex', 'con', 'int', 'wis', 'cha', 'speed', 'ac'].includes(e.stat as string) &&
          ['add', 'set', 'set_at_least'].includes(e.mode as string) &&
          isInt(e.value),
      )
    : [];
  const requirements = Array.isArray(d.requirements)
    ? d.requirements.filter(
        q =>
          isObject(q) &&
          ABILITY_KEYS.includes(q.stat as Ability) &&
          isInt(q.min) &&
          (q.onUnmet === 'lock' || q.onUnmet === 'speed_penalty'),
      )
    : [];
  return {
    id: r.id,
    name: r.name,
    kind: ((ITEM_KINDS as readonly string[]).includes(r.kind) ? r.kind : 'gear') as ItemKind,
    definition: {
      ...(weaponOk ? { weapon: w as unknown as InventoryItem['definition']['weapon'] } : {}),
      ...(armorOk ? { armor: { strength: null, stealthDisadvantage: false, ...a } as never } : {}),
      ...(isInt(d.magicBonus) ? { magicBonus: d.magicBonus as number } : {}),
      ...(requirements.length ? { requirements: requirements as never } : {}),
      ...(effects.length ? { effects } : {}),
    },
    weight: r.weight,
    quantity: r.quantity,
    requiresAttunement: r.requiresAttunement,
    equipped: r.equipped,
    attuned: r.attuned,
  };
}

/** The stored sheet, checked enough that computeSheet cannot trip over it. Name, XP and level come from columns. */
export function sheetOf(c: CharacterRecord): CharacterSheet {
  const s = (c.sheet ?? {}) as Record<string, unknown>;
  const scores = (s.abilityScores ?? {}) as Record<string, unknown>;
  const ok =
    ABILITY_KEYS.every(a => isInt(scores[a])) &&
    isStringArray(s.skillProficiencies) &&
    isStringArray(s.expertise) &&
    isStringArray(s.saveProficiencies) &&
    Array.isArray(s.weapons) &&
    (s.weapons as unknown[]).every(w => {
      const x = (w ?? {}) as Record<string, unknown>;
      return typeof x.id === 'string' && typeof x.name === 'string' && isInt(x.magicBonus);
    }) &&
    isInt(s.speed) &&
    (s.armor === null || typeof s.armor === 'object') &&
    typeof s.shield === 'boolean';
  if (!ok) throw new HttpError(422, 'This character sheet is damaged, so the server cannot work out the bonus');
  return { ...(s as unknown as CharacterSheet), name: c.name, xp: c.xp, levelApplied: c.levelApplied };
}

/** An effects row as the engine's Effect (the same mapping as the browser's data layer). */
export function effectOf(r: EffectRow): Effect {
  const d = (r.duration ?? {}) as Record<string, unknown>;
  const duration: Effect['duration'] =
    d.kind === 'rounds' && isInt(d.remaining)
      ? { kind: 'rounds', remaining: d.remaining as number }
      : d.kind === 'until' && typeof d.atSeconds === 'number'
        ? { kind: 'until', atSeconds: d.atSeconds }
        : d.kind === 'rest' && (d.rest === 'short' || d.rest === 'long')
          ? { kind: 'rest', rest: d.rest }
          : { kind: 'permanent' };
  return {
    id: r.id,
    name: r.name,
    source: r.source,
    stat: r.stat as Effect['stat'],
    mode: r.mode as Effect['mode'],
    value: r.value,
    duration,
    ...(r.concentration ? { concentration: true } : {}),
  };
}

const isAbility = (key: string): key is Ability => (ABILITY_KEYS as readonly string[]).includes(key);
const isSkill = (key: string): key is SkillKey => key in SKILLS;
/** An attack key naming a spell, e.g. "spell:Fire Bolt" (P2-11). */
export const SPELL_KEY = 'spell:';

/**
 * The bonus, its breakdown, the roll mode and the odds, worked out from what the server knows. `dmMode` is the
 * mode a DM asked for; a player's request never gets this far with one.
 */
export function computePreview(
  sheet: CharacterSheet,
  effects: readonly Effect[],
  gameSeconds: number,
  state: CharacterState,
  input: Pick<RollInput, 'kind' | 'key' | 'target'>,
  dmMode?: RollMode,
  items?: readonly InventoryItem[],
): Preview {
  const computed = computeSheet(sheet, effects, { seconds: gameSeconds }, state, items);
  let label: string;
  let ability: Ability;
  let bonus: number;
  let breakdown: { label: string; value: number }[];

  if (input.kind === 'check' && isSkill(input.key)) {
    const skill = computed.skills.find(s => s.key === input.key)!;
    ({ label, ability, bonus, breakdown } = { ...skill, label: `${skill.label} check` });
  } else if (input.kind === 'check' && isAbility(input.key)) {
    const a = computed.abilities[input.key];
    label = `${a.label} check`;
    ability = a.ability;
    bonus = a.modifier;
    breakdown = [{ label: a.label, value: a.modifier }];
  } else if (input.kind === 'save' && isAbility(input.key)) {
    const save = computed.saves.find(s => s.ability === input.key)!;
    ({ ability, bonus, breakdown } = save);
    label = `${save.label} save`;
  } else if (input.kind === 'attack' && input.key.startsWith(SPELL_KEY)) {
    // P2-11: a spell attack with a cantrip or prepared spell, at the sheet's spell attack bonus
    const spell = input.key.slice(SPELL_KEY.length);
    const known = sheet.spells ? [...sheet.spells.cantrips, ...sheet.spells.prepared] : [];
    if (!computed.spellcasting || !known.includes(spell)) {
      throw new HttpError(404, `${computed.name} has no spell called ${spell} ready to cast`);
    }
    const sc = computed.spellcasting;
    ability = sc.ability;
    bonus = sc.attackBonus;
    breakdown = [
      { label: sc.label, value: computed.abilities[sc.ability].modifier },
      { label: 'Proficiency', value: computed.proficiencyBonus },
    ];
    label = `${spell} (spell attack)`;
  } else if (input.kind === 'attack') {
    const attack = computed.attacks.find(a => a.id === input.key);
    if (!attack) throw new HttpError(404, `${computed.name} has no weapon called ${input.key}`);
    if (!attack.usable) {
      throw new HttpError(409, `${computed.name} cannot use the ${attack.name} yet: ${attack.lockReasons.join('; ')}`);
    }
    ({ ability, bonus, breakdown } = attack);
    label = `${attack.name} attack`;
  } else {
    throw new HttpError(400, `There is no ${input.kind} called ${input.key}`);
  }

  const conditions = conditionEffects(state, { role: 'self', kind: input.kind, ability });
  breakdown = breakdown.map(p => ({ ...p }));
  if (conditions.d20Penalty) {
    breakdown.push({ label: `Exhaustion ${state.exhaustion}`, value: conditions.d20Penalty });
    bonus += conditions.d20Penalty;
  }

  const resolved = dmMode
    ? {
        mode: dmMode,
        reasons:
          dmMode === 'normal'
            ? []
            : [{ text: 'Set by the DM', kind: dmMode, cancelled: false } satisfies RollModeReason],
      }
    : resolveRollMode(conditions);

  return {
    label,
    bonus,
    bonusBreakdown: breakdown,
    mode: resolved.mode,
    reasons: resolved.reasons,
    chance: conditions.autoFail
      ? 0
      : successChance({ kind: input.kind, bonus, target: input.target, mode: resolved.mode }).final,
    critChance: critChance(resolved.mode),
    autoFail: conditions.autoFail ? (conditions.autoFailReason ?? 'This roll fails automatically') : null,
    notes: conditions.notes,
  };
}

const ROLL_ERRORS: Record<string, number> = { PT429: 429, '42501': 403, '22023': 422 };

/** The whole request: CORS, the token, the body, who may roll for whom, then preview or roll. */
export async function handle(req: Request, deps: RollDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const userId = token ? await deps.userFromToken(token) : null;
    if (!userId) throw new HttpError(401, 'Sign in first');

    const input = parseInput(await req.json().catch(() => null));
    const role = await deps.roleIn(input.campaignId, userId);
    if (!role) throw new HttpError(403, 'Only members of this campaign can roll here');
    const character = await deps.loadCharacter(input.characterId);
    if (!character || character.campaignId !== input.campaignId) {
      throw new HttpError(404, 'That character is not in this campaign');
    }
    if (role !== 'dm' && character.ownerId !== userId) {
      throw new HttpError(403, 'You can only roll for your own character');
    }
    if (input.hidden && role !== 'dm') throw new HttpError(403, 'Only the DM can make a hidden roll');

    const [effectRows, itemRows, gameSeconds] = await Promise.all([
      deps.loadEffects(character.id),
      deps.loadItems(character.id),
      deps.gameSeconds(input.campaignId),
    ]);
    const state: CharacterState = {
      conditions: character.conditions as Condition[],
      exhaustion: character.exhaustion,
    };
    const preview = computePreview(
      sheetOf(character),
      effectRows.map(effectOf),
      gameSeconds,
      state,
      input,
      role === 'dm' ? input.mode : undefined,
      itemRows.map(itemOf),
    );
    if (input.action === 'preview') return json(200, preview);

    if (preview.autoFail) throw new HttpError(409, `No need to roll: ${preview.autoFail}`);
    const { data, error } = await deps.rollD20({
      p_actor: userId,
      p_campaign: input.campaignId,
      p_character: character.id,
      p_kind: input.kind,
      p_label: preview.label,
      p_bonus: preview.bonus,
      p_target: input.target,
      p_mode: preview.mode,
      p_hidden: input.hidden ?? false,
      p_breakdown: preview.bonusBreakdown,
    });
    if (error) throw new HttpError(ROLL_ERRORS[error.code ?? ''] ?? 500, error.message);
    return json(200, data);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: 'Something went wrong on the server' });
  }
}
