// P2-2: the roll Edge Function. The logic is in handler.ts; this file connects it to the database.
//
// It reads with the service role (the caller's token is checked first, and handler.ts decides what they may do),
// and calls public.roll_d20, search_region and move_group, which only the service role may execute.
import { createClient } from '@supabase/supabase-js';
import { handle, type RollDeps, type WeatherZoneRecord } from './handler.ts';

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
  async loadGroup(groupId) {
    const group = orThrow(await admin.from('party_groups').select('campaign_id').eq('id', groupId).maybeSingle());
    if (!group) return null;
    const members = orThrow(await admin.from('party_group_members').select('character_id').eq('group_id', groupId));
    return { campaignId: group.campaign_id, characterIds: (members ?? []).map(m => m.character_id) };
  },
  async loadWeatherContext(campaignId, characterId) {
    const member = orThrow(
      await admin.from('party_group_members').select('group_id').eq('character_id', characterId).maybeSingle(),
    );
    const group = member
      ? orThrow(await admin.from('party_groups').select('map_id, region_id').eq('id', member.group_id).maybeSingle())
      : null;
    const maps =
      orThrow(await admin.from('maps').select('id, parent_pin_id, parent_region_id').eq('campaign_id', campaignId)) ??
      [];
    const mapIds = maps.map(m => m.id);
    const pins = orThrow(await admin.from('pins').select('id, map_id, x, y').in('map_id', mapIds)) ?? [];
    const regions = orThrow(await admin.from('regions').select('id, map_id, cx, cy').in('map_id', mapIds)) ?? [];
    const zones =
      orThrow(
        await admin
          .from('weather_zones')
          .select('id, map_id, center_x, center_y, radius, climate, created_at')
          .eq('campaign_id', campaignId),
      ) ?? [];
    const calendar = orThrow(
      await admin.from('calendars').select('definition').eq('campaign_id', campaignId).maybeSingle(),
    );
    const links: Record<string, { x: number; y: number; mapId: string }> = {};
    for (const p of pins) links[p.id] = { x: p.x, y: p.y, mapId: p.map_id };
    for (const r of regions) links[r.id] = { x: r.cx, y: r.cy, mapId: r.map_id };
    const zonesByMap: Record<string, WeatherZoneRecord[]> = {};
    for (const z of zones) {
      (zonesByMap[z.map_id] ??= []).push({
        id: z.id,
        x: z.center_x,
        y: z.center_y,
        radius: z.radius,
        climate: z.climate,
        createdAt: z.created_at,
      });
    }
    const link = (m: { parent_pin_id: string | null; parent_region_id: string | null }) =>
      m.parent_pin_id ?? m.parent_region_id ?? '';
    const mapRecords = Object.fromEntries(
      maps.map(m => [
        m.id,
        {
          id: m.id,
          parentPinId: m.parent_pin_id,
          parentRegionId: m.parent_region_id,
          parentMapId: links[link(m)]?.mapId ?? null,
        },
      ]),
    );
    const region = group?.region_id ? links[group.region_id] : null;
    return {
      position: group?.map_id ? { mapId: group.map_id, point: region ? { x: region.x, y: region.y } : null } : null,
      maps: mapRecords,
      zonesByMap,
      links,
      calendar: calendar?.definition ?? null,
    };
  },
  async weatherDay(zoneId, day) {
    return orThrow(
      await admin
        .from('weather_days')
        .select('condition, temperature, wind, overridden, note')
        .eq('zone_id', zoneId)
        .eq('day', day)
        .maybeSingle(),
    );
  },
  async recordWeatherDay(zoneId, day, weather) {
    orThrow(
      await admin
        .from('weather_days')
        .upsert(
          { zone_id: zoneId, day, ...weather, overridden: false },
          { onConflict: 'zone_id,day', ignoreDuplicates: true },
        ),
    );
  },
  async rpc(name, args) {
    const { data, error } = await admin.rpc(name, args as never);
    return { data, error: error ? { code: error.code, message: error.message } : null };
  },
  async rollD20(args) {
    const { data, error } = await admin.rpc('roll_d20', args);
    return { data, error: error ? { code: error.code, message: error.message } : null };
  },
};

Deno.serve(req => handle(req, deps));
