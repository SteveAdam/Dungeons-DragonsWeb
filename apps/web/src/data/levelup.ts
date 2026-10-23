// P2-10: the level-up flow's data. The Hit Point Die is rolled by the database (once per level); the level is
// applied by the apply-level-up Edge Function, which checks the choices and builds the new sheet itself.
import type { LevelUpChoices, LevelUpProblem } from '@dnd-manager/rules-engine';
import { supabase } from '../lib/supabase';
import { DataError, toDataError } from './errors';

export interface HitDieRoll {
  id: string;
  /** The number rolled on the Hit Point Die. */
  die: number;
}

/** The character's Hit Point Die roll for a level, if they rolled one (it stays until the level is applied). */
export async function getHitDieRoll(characterId: string, level: number): Promise<HitDieRoll | null> {
  const { data, error } = await supabase
    .from('rolls')
    .select('id, dice')
    .eq('character_id', characterId)
    .eq('kind', 'hit_die')
    .eq('target', level)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw toDataError(error);
  return data ? { id: data.id, die: data.dice[0] } : null;
}

/** Rolls the character's Hit Point Die for their pending level. Refused while an earlier roll is unused. */
export async function rollHitDie(characterId: string): Promise<HitDieRoll> {
  const { data, error } = await supabase.rpc('roll_hit_die', { p_character: characterId });
  if (error) {
    if (error.code === '22023') throw new DataError('validation', error.message);
    throw toDataError(error);
  }
  const row = data as { id: string; dice: number[] };
  return { id: row.id, die: row.dice[0] };
}

/** The server refused the level-up; `problems` says which rule each choice breaks. */
export class LevelUpRejected extends DataError {
  readonly problems: LevelUpProblem[];
  constructor(message: string, problems: LevelUpProblem[]) {
    super('validation', message);
    this.problems = problems;
  }
}

export interface AppliedLevel {
  level: number;
  hitPoints: number;
  hitPointsGained: number;
  proficiencyBonus: number;
}

/** Applies the next level through the apply-level-up Edge Function. */
export async function applyLevelUp(characterId: string, choices: LevelUpChoices): Promise<AppliedLevel> {
  const { data, error } = await supabase.functions.invoke('apply-level-up', { body: { characterId, choices } });
  if (!error) return data as AppliedLevel;
  const e = error as { name?: string; context?: Response };
  if (e.name === 'FunctionsHttpError' && e.context) {
    const status = e.context.status;
    const body = (await e.context.json().catch(() => ({}))) as { error?: string; problems?: LevelUpProblem[] };
    if (status === 401) throw new DataError('signed-out');
    if (status === 403) throw new DataError('forbidden', body.error);
    if ([400, 409, 422].includes(status)) {
      throw new LevelUpRejected(body.error ?? 'These choices cannot be applied', body.problems ?? []);
    }
    throw new DataError('unknown', body.error);
  }
  if (e.name === 'FunctionsRelayError' || e.name === 'FunctionsFetchError') {
    throw new DataError('unknown', 'The server that applies levels is not answering. Try again in a moment.');
  }
  throw toDataError(error);
}
