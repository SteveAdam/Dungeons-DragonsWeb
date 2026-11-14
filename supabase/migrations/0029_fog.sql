-- =====================================================================
-- 0029: fog of war drawn with a brush (P4-3, MAP-6).
--
-- THIS FOG IS COSMETIC. It hides parts of the map on screen, but a determined player can still open the map image
-- itself. It is not a security boundary and must never be described as one.
--
--   * maps.fog_enabled turns fog on for a map (off by default). Once on, players start with the whole map hidden.
--   * fog_strokes is the history of brush strokes for a map: in shared mode (maps.fog_mode = 'shared') the strokes have
--     no group; in per_group mode each group has its own. Switching mode keeps both sets.
--   * A stroke reveals or hides along a line of points (image pixels) with a radius. clear_fog writes one marker row
--     (reveal everything, or hide everything) instead of deleting history, so the order stays the whole story.
--   * simplify_fog replaces one map and group's history with an equivalent, shorter one worked out by the app.
--   * The DM writes everything. A member reads strokes of maps they can read, shared ones and their own group's only.
-- =====================================================================

-- Fog is off on a map until the DM turns it on, so maps made before fog existed look the same to players as before.
alter table public.maps add column fog_enabled boolean not null default false;

-- A stroke's points: an array of [x, y] pairs of numbers, on the image, at most max_points of them.
create function public.fog_points_valid(p jsonb, max_points int) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) <= max_points
     and not exists (
       select 1 from jsonb_array_elements(p) e
       where jsonb_typeof(e) <> 'array'
          or jsonb_array_length(e) <> 2
          or jsonb_typeof(e -> 0) <> 'number'
          or jsonb_typeof(e -> 1) <> 'number'
          or (e ->> 0)::numeric not between 0 and 100000
          or (e ->> 1)::numeric not between 0 and 100000
     )
$$;

create table public.fog_strokes (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps (id) on delete cascade,
  -- null: the shared fog; otherwise this group's own fog (per_group mode)
  group_id uuid references public.party_groups (id) on delete cascade,
  -- the order strokes are drawn in
  seq bigint generated always as identity,
  mode text not null check (mode in ('reveal', 'hide', 'reveal_all', 'hide_all')),
  radius integer not null default 0,
  points jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint fog_strokes_shape check (
    (mode in ('reveal_all', 'hide_all') and radius = 0 and points = '[]'::jsonb)
    or (mode in ('reveal', 'hide') and radius between 1 and 4000 and jsonb_array_length(points) >= 1
        and fog_points_valid(points, 2000))
  )
);
create index fog_strokes_map_idx on public.fog_strokes (map_id, group_id, seq);

-- A group's fog belongs to a group of the map's campaign.
create function public.fog_strokes_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.group_id is not null and group_campaign(new.group_id) is distinct from map_campaign(new.map_id) then
    raise exception 'That group is not in this map''s campaign' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger fog_strokes_check_trg before insert or update on public.fog_strokes
  for each row execute function public.fog_strokes_check();

alter table public.fog_strokes enable row level security;
create policy "read fog" on public.fog_strokes for select to authenticated
  using (
    is_dm(map_campaign(map_id))
    or (is_member(map_campaign(map_id)) and map_is_revealed(map_id) and (group_id is null or in_group(group_id)))
  );
create policy "dm writes fog" on public.fog_strokes for all to authenticated
  using (is_dm(map_campaign(map_id))) with check (is_dm(map_campaign(map_id)));
revoke all on public.fog_strokes from anon;

-- DM only: reveal or hide the whole map for one fog (p_group null: the shared fog). Returns the marker's place in the
-- order.
create function public.clear_fog(p_map uuid, p_group uuid, p_mode text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  s bigint;
begin
  if not is_dm(map_campaign(p_map)) then
    raise exception 'Only the DM can do that' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('reveal', 'hide') then
    raise exception 'Reveal or hide' using errcode = '22023';
  end if;
  insert into fog_strokes (map_id, group_id, mode) values (p_map, p_group, p_mode || '_all') returning seq into s;
  return s;
end $$;

-- DM only: replaces one fog's history (one map, one group or the shared fog) with the given strokes, in order. The app
-- works out an equivalent shorter history (see apps/web/src/lib/fog.ts); every stroke is checked like any other.
-- Returns how many strokes the fog now has.
create function public.simplify_fog(p_map uuid, p_group uuid, p_strokes jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if not is_dm(map_campaign(p_map)) then
    raise exception 'Only the DM can do that' using errcode = '42501';
  end if;
  if p_strokes is null or jsonb_typeof(p_strokes) <> 'array' or jsonb_array_length(p_strokes) = 0 then
    raise exception 'A fog needs at least one stroke' using errcode = '22023';
  end if;
  delete from fog_strokes where map_id = p_map and group_id is not distinct from p_group;
  insert into fog_strokes (map_id, group_id, mode, radius, points)
    select p_map, p_group, s.value ->> 'mode', coalesce((s.value ->> 'radius')::int, 0), coalesce(s.value -> 'points', '[]'::jsonb)
    from jsonb_array_elements(p_strokes) with ordinality as s(value, n)
    order by s.n;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.clear_fog(uuid, uuid, text), public.simplify_fog(uuid, uuid, jsonb) from public, anon;
grant execute on function public.clear_fog(uuid, uuid, text), public.simplify_fog(uuid, uuid, jsonb) to authenticated;
