// P2-2: the roll Edge Function. The logic is in handler.ts; this file connects it to the database.
//
// It reads with the service role (the caller's token is checked first, and handler.ts decides what they may do),
// and calls public.roll_d20, which only the service role may execute.
import { createClient } from '@supabase/supabase-js';
import { handle, type RollDeps } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function orThrow<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

const deps: RollDeps = {
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
        .select('id, campaign_id, owner_id, name, sheet, xp, level_applied, conditions, exhaustion')
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
          conditions: row.conditions,
          exhaustion: row.exhaustion,
        }
      : null;
  },
  async loadEffects(characterId) {
    const rows = orThrow(
      await admin
        .from('effects')
        .select('id, name, source, stat, mode, value, duration, concentration')
        .eq('character_id', characterId),
    );
    return rows ?? [];
  },
  async loadItems(characterId) {
    const rows = orThrow(
      await admin
        .from('items')
        .select('entity_id, kind, definition, weight, quantity, requires_attunement, equipped, attuned, entities(name)')
        .eq('owner_type', 'character')
        .eq('owner_id', characterId),
    );
    return (rows ?? []).map(r => ({
      id: r.entity_id,
      // the embedded entity comes back as one object (items.entity_id is its primary key)
      name: (r.entities as unknown as { name: string } | null)?.name ?? 'Item',
      kind: r.kind,
      definition: r.definition,
      weight: r.weight === null ? null : Number(r.weight),
      quantity: r.quantity,
      requiresAttunement: r.requires_attunement,
      equipped: r.equipped,
      attuned: r.attuned,
    }));
  },
  async gameSeconds(campaignId) {
    const row = orThrow(await admin.from('campaigns').select('game_seconds').eq('id', campaignId).single());
    return Number(row?.game_seconds ?? 0);
  },
  async rollD20(args) {
    const { data, error } = await admin.rpc('roll_d20', args);
    return { data, error: error ? { code: error.code, message: error.message } : null };
  },
};

Deno.serve(req => handle(req, deps));
