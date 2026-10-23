// P2-9: the character creation wizard's data. The draft (one per player per campaign) keeps the wizard's progress,
// including rolled scores; ability scores are rolled by the database; the character is created by the
// create-character Edge Function, which checks every choice against the SRD itself.
import type { CreationChoices, CreationProblem, CreationSrd } from '@dnd-manager/rules-engine';
import { SRD_ARMOR, SRD_WEAPONS } from '@dnd-manager/srd-data/equipment';
import type { SrdArmor, SrdBackground, SrdClass, SrdSpecies, SrdSpell, SrdWeapon } from '@dnd-manager/srd-data/schemas';
import { supabase } from '../lib/supabase';
import type { Json } from '../types/database';
import { DataError, toDataError } from './errors';
import { listSrdBackgrounds, listSrdClasses, listSrdSpecies, listSrdSpells } from './srd';

export interface AbilityRoll {
  id: string;
  /** Six sets of four d6, in order. */
  dice: number[];
}

/** The wizard as saved: where the player is, what they have chosen, and their ability roll if they rolled. */
export interface CreationDraft {
  step: number;
  choices: CreationChoices;
  roll: AbilityRoll | null;
}

/** The SRD records in full (the wizard shows their text); they satisfy the engine's CreationSrd. */
export interface WizardSrd extends CreationSrd {
  classes: SrdClass[];
  species: SrdSpecies[];
  backgrounds: SrdBackground[];
  spells: SrdSpell[];
  weapons: SrdWeapon[];
  armor: SrdArmor[];
}

/** The SRD records the wizard offers: the imported classes, species, backgrounds and spells, and the equipment. */
export async function loadCreationSrd(): Promise<WizardSrd> {
  const [classes, species, backgrounds, spells] = await Promise.all([
    listSrdClasses(),
    listSrdSpecies(),
    listSrdBackgrounds(),
    listSrdSpells(),
  ]);
  return { classes, species, backgrounds, spells, weapons: SRD_WEAPONS, armor: SRD_ARMOR };
}

/** The player's draft for this campaign, or null when they have not started one. */
export async function getDraft(campaignId: string): Promise<CreationDraft | null> {
  const { data, error } = await supabase
    .from('character_drafts')
    .select('data')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (error) throw toDataError(error);
  const d = data?.data as Partial<CreationDraft> | undefined;
  // a draft is only ever written by this app; anything else is treated as no draft
  if (!d || typeof d !== 'object' || !d.choices || typeof d.step !== 'number') return null;
  return { step: d.step, choices: d.choices, roll: d.roll ?? null };
}

export async function saveDraft(campaignId: string, draft: CreationDraft): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new DataError('signed-out');
  const { error } = await supabase.from('character_drafts').upsert({
    user_id: userId,
    campaign_id: campaignId,
    data: draft as unknown as NonNullable<Json>,
    updated_at: new Date().toISOString(),
  });
  if (error) throw toDataError(error);
}

/** Rolls 4d6 six times on the server. Refused while an earlier roll in this campaign is still unused. */
export async function rollAbilityScores(campaignId: string): Promise<AbilityRoll> {
  const { data, error } = await supabase.rpc('roll_ability_scores', { p_campaign: campaignId });
  if (error) {
    if (error.code === '22023') throw new DataError('validation', error.message);
    throw toDataError(error);
  }
  const row = data as { id: string; dice: number[] };
  return { id: row.id, dice: row.dice };
}

/** The server refused the choices; `problems` says which rule each one breaks. */
export class CreationRejected extends DataError {
  readonly problems: CreationProblem[];
  constructor(message: string, problems: CreationProblem[]) {
    super('validation', message);
    this.problems = problems;
  }
}

/** Creates the character through the create-character Edge Function. Returns the new character's id. */
export async function createCharacter(campaignId: string, choices: CreationChoices): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-character', { body: { campaignId, choices } });
  if (!error) return (data as { characterId: string }).characterId;
  const e = error as { name?: string; context?: Response };
  if (e.name === 'FunctionsHttpError' && e.context) {
    const status = e.context.status;
    const body = (await e.context.json().catch(() => ({}))) as { error?: string; problems?: CreationProblem[] };
    if (status === 401) throw new DataError('signed-out');
    if (status === 403) throw new DataError('forbidden', body.error);
    if (status === 422 || status === 400)
      throw new CreationRejected(body.error ?? 'Some choices break the rules', body.problems ?? []);
    throw new DataError('unknown', body.error);
  }
  if (e.name === 'FunctionsRelayError' || e.name === 'FunctionsFetchError') {
    throw new DataError('unknown', 'The server that creates characters is not answering. Try again in a moment.');
  }
  throw toDataError(error);
}
