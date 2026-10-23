// P2-9: the create-character Edge Function. The logic is in handler.ts; this file connects it to the database.
//
// It reads with the service role (the caller's token is checked first, and handler.ts decides what they may do),
// and calls public.create_character_from_wizard, which only the service role may execute.
import { createClient } from '@supabase/supabase-js';
import type { CreationSrd } from '../_shared/rules-engine/index.ts';
import { handle, type CreateDeps } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function orThrow<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

/** Every row's data from one SRD table (they were checked against the data package's schemas on import). */
async function srdTable<T>(table: string): Promise<T[]> {
  const rows = orThrow(await admin.from(table).select('data'));
  return ((rows ?? []) as { data: T }[]).map(r => r.data);
}

const deps: CreateDeps = {
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
  async loadSrd() {
    const [species, classes, backgrounds, spells, weapons, armor] = await Promise.all([
      srdTable<CreationSrd['species'][number]>('srd_species'),
      srdTable<CreationSrd['classes'][number]>('srd_classes'),
      srdTable<CreationSrd['backgrounds'][number]>('srd_backgrounds'),
      srdTable<CreationSrd['spells'][number]>('srd_spells'),
      srdTable<CreationSrd['weapons'][number]>('srd_weapons'),
      srdTable<CreationSrd['armor'][number]>('srd_armor'),
    ]);
    return { species, classes, backgrounds, spells, weapons, armor };
  },
  async unusedAbilityRoll(userId, campaignId) {
    const row = orThrow(await admin.rpc('unused_ability_roll', { p_user: userId, p_campaign: campaignId }));
    const roll = row as { id: string | null; dice: number[] | null } | null;
    return roll?.id && roll.dice ? { id: roll.id, dice: roll.dice } : null;
  },
  async createCharacter(args) {
    const { data, error } = await admin.rpc('create_character_from_wizard', args);
    return { data, error: error ? { code: error.code, message: error.message } : null };
  },
};

Deno.serve(req => handle(req, deps));
