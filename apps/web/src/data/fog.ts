// P4-3: fog of war strokes. The DM writes them; a member reads those of maps they can read, shared ones and their own
// group's only (the database decides). THIS FOG IS COSMETIC: the map image itself can still be opened.
import type { FogMode, FogPoint, FogStroke } from '../lib/fog';
import { supabase } from '../lib/supabase';
import type { Json } from '../types/database';
import { DataError, toDataError } from './errors';

export interface SavedFogStroke extends FogStroke {
  id: string;
  /** Null for the shared fog; otherwise the party group whose fog this is. */
  groupId: string | null;
  /** The order it was drawn in. */
  seq: number;
}

interface FogRow {
  id: string;
  group_id: string | null;
  seq: number;
  mode: string;
  radius: number;
  points: unknown;
}

const MODES: FogMode[] = ['reveal', 'hide', 'reveal_all', 'hide_all'];
const PAGE = 1000;

const toPoints = (raw: unknown): FogPoint[] =>
  Array.isArray(raw)
    ? raw.flatMap(p =>
        Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' ? [[p[0], p[1]] as FogPoint] : [],
      )
    : [];

const toStroke = (r: FogRow): SavedFogStroke => ({
  id: r.id,
  groupId: r.group_id,
  seq: Number(r.seq),
  mode: MODES.includes(r.mode as FogMode) ? (r.mode as FogMode) : 'hide',
  radius: r.radius,
  points: toPoints(r.points),
});

/** Every stroke of a map the viewer may read, in drawing order (read a page at a time: a fog can be long). */
export async function listFogStrokes(mapId: string): Promise<SavedFogStroke[]> {
  const out: SavedFogStroke[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('fog_strokes')
      .select('id, group_id, seq, mode, radius, points')
      .eq('map_id', mapId)
      .order('seq', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw toDataError(error);
    const rows = (data ?? []) as FogRow[];
    out.push(...rows.map(toStroke));
    if (rows.length < PAGE) return out;
  }
}

/** DM only: saves one brush stroke. */
export async function addFogStroke(mapId: string, groupId: string | null, stroke: FogStroke): Promise<SavedFogStroke> {
  if (stroke.mode !== 'reveal' && stroke.mode !== 'hide') throw new DataError('validation');
  const { data, error } = await supabase
    .from('fog_strokes')
    .insert({
      map_id: mapId,
      group_id: groupId,
      mode: stroke.mode,
      radius: Math.max(1, Math.round(stroke.radius)),
      points: stroke.points as unknown as NonNullable<Json>,
    })
    .select('id, group_id, seq, mode, radius, points')
    .single();
  if (error) throw toDataError(error);
  return toStroke(data as FogRow);
}

/** DM only: reveals or hides the whole map for one fog, as a single marker (history is kept). */
export async function clearFog(mapId: string, groupId: string | null, mode: 'reveal' | 'hide'): Promise<void> {
  const { error } = await supabase.rpc('clear_fog', { p_map: mapId, p_group: groupId as string, p_mode: mode });
  if (error) throw toDataError(error);
}

/** DM only: replaces one fog's history with an equivalent shorter one (see simplifyFog in lib/fog). */
export async function replaceFog(
  mapId: string,
  groupId: string | null,
  strokes: readonly FogStroke[],
): Promise<number> {
  const { data, error } = await supabase.rpc('simplify_fog', {
    p_map: mapId,
    p_group: groupId as string,
    p_strokes: strokes.map(s => ({ mode: s.mode, radius: s.radius, points: s.points })) as unknown as Json,
  });
  if (error) throw toDataError(error);
  return Number(data);
}
