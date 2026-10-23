// P2-10: the apply-level-up Edge Function. The logic is in handler.ts; this file connects it to the database.
//
// It reads with the service role (the caller's token is checked first, and handler.ts decides what they may do),
// and calls public.apply_level_up_from_function, which only the service role may execute.
import { createClient } from '@supabase/supabase-js';
import type { CreationSpell, LevelUpClass } from '../_shared/rules-engine/index.ts';
import { handle, type LevelUpDeps } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function orThrow<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

const deps: LevelUpDeps = {
  async userFromToken(token) {
    const { data, error } = await admin.auth.getUser(token);
    return error ? null : (data.user?.id ?? null);
  },
  async roleIn(campaignId, userId) {
    const row = orThrow(
      await admin.from('members').select('role').eq('campaign_id', campaignId).eq('user_id', userId).maybeSingle(),
    );
    return row ? (row.role as 'dm' | 'player') : null;
  },
  async loadCharacter(characterId) {
    const row = orThrow(
      await admin
        .from('characters')
        .select('id, campaign_id, owner_id, name, sheet, xp, level_applied')
        .eq('id', characterId)
        .maybeSingle(),
    );
    return row
      ? {
          id: row.id,
          campaignId: row.campaign_id,
          ownerId: row.owner_id,
          name: row.name,
          sheet: row.sheet,
          xp: row.xp,
          levelApplied: row.level_applied,
        }
      : null;
  },
  async loadClass(name) {
    const row = orThrow(await admin.from('srd_classes').select('data').eq('name', name).maybeSingle());
    return row ? (row.data as LevelUpClass) : null;
  },
  async loadSpells() {
    const rows = orThrow(await admin.from('srd_spells').select('data'));
    return ((rows ?? []) as { data: CreationSpell }[]).map(r => r.data);
  },
  async unusedHitDieRoll(characterId, level) {
    const row = orThrow(await admin.rpc('unused_hit_die_roll', { p_character: characterId, p_level: level }));
    const roll = row as { id: string | null; dice: number[] | null } | null;
    return roll?.id && roll.dice ? { id: roll.id, die: roll.dice[0] } : null;
  },
  async optionalFeats(campaignId) {
    const row = orThrow(await admin.from('campaigns').select('settings').eq('id', campaignId).maybeSingle());
    return (row?.settings as { optionalFeats?: unknown } | null)?.optionalFeats === true;
  },
  async apply(args) {
    const { data, error } = await admin.rpc('apply_level_up_from_function', args);
    return { data, error: error ? { code: error.code, message: error.message } : null };
  },
};

Deno.serve(req => handle(req, deps));
