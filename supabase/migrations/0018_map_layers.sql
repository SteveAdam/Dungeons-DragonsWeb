-- =====================================================================
-- 0018: layered maps (P3-1, MAP-2 and MAP-8). A map can now hang beneath a region as well as beneath a pin,
-- never both. The chain of maps above a map can be read with map_ancestors, a map can never end up above
-- itself, and a map stays hidden from players while anything above it is hidden, at any depth, whether the
-- link is a pin or a region.
-- =====================================================================

alter table public.maps
  add column parent_region_id uuid references public.regions (id) on delete set null,
  add constraint maps_one_parent check (parent_pin_id is null or parent_region_id is null);
create index maps_parent_region_idx on public.maps (parent_region_id);

create function public.region_campaign(r uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select mp.campaign_id from regions rg join maps mp on mp.id = rg.map_id where rg.id = r
$$;

-- The map that holds the pin or region a map hangs beneath; null for a top-level map.
create function public.parent_map(m uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pn.map_id from maps mp join pins pn on pn.id = mp.parent_pin_id where mp.id = m),
    (select rg.map_id from maps mp join regions rg on rg.id = mp.parent_region_id where mp.id = m)
  )
$$;

-- A map is revealed when it is flagged visible, and so is every pin or region and every map above it, all the
-- way to the top. A chain longer than 20 maps counts as hidden: only a malformed cycle could make one, and the
-- trigger below stops cycles from being made.
create or replace function public.map_is_revealed(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with recursive chain (map_id, ok, depth) as (
    select id, visible_to_players, 0 from maps where id = m
    union all
    select up.id, up.visible_to_players and coalesce(pn.visible_to_players, rg.visible_to_players, false),
           chain.depth + 1
    from chain
    join maps cur on cur.id = chain.map_id
    left join pins pn on pn.id = cur.parent_pin_id
    left join regions rg on rg.id = cur.parent_region_id
    join maps up on up.id = coalesce(pn.map_id, rg.map_id)
    where chain.depth < 20
  )
  select coalesce(bool_and(ok), false) and coalesce(max(depth), 0) < 20 from chain
$$;

-- The maps above this one, nearest first (depth 1 is the parent), each with the pin or region that leads down
-- from it. Stops at the top, or after 20 steps.
--   DMs get the whole chain, unless as_player is set (a DM previewing as a player).
--   Players, and a DM previewing, get nothing for a map they cannot see. For a map they can see the whole chain
--   above it is visible too (that is what revealed means), so nothing hidden is ever returned.
create function public.map_ancestors(p_map uuid, as_player boolean default false)
returns table (map_id uuid, name text, depth int, via_kind text, via_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare
  c uuid := map_campaign(p_map);
begin
  if c is null or not is_member(c) then
    raise exception 'We could not find that map' using errcode = '42501';
  end if;
  if (as_player or not is_dm(c)) and not map_is_revealed(p_map) then
    raise exception 'We could not find that map' using errcode = '42501';
  end if;
  return query
    with recursive chain (id, depth, kind, link) as (
      select mp.id, 0, null::text, null::uuid from maps mp where mp.id = p_map
      union all
      select up.id, chain.depth + 1,
             case when pn.id is not null then 'pin' else 'region' end,
             coalesce(pn.id, rg.id)
      from chain
      join maps cur on cur.id = chain.id
      left join pins pn on pn.id = cur.parent_pin_id
      left join regions rg on rg.id = cur.parent_region_id
      join maps up on up.id = coalesce(pn.map_id, rg.map_id)
      where chain.depth < 20
    )
    select chain.id, mp.name, chain.depth, chain.kind, chain.link
    from chain join maps mp on mp.id = chain.id
    where chain.depth > 0
    order by chain.depth;
end $$;

-- A detail map must hang beneath a pin or region from its own campaign, and never beneath itself or one of its
-- own detail maps (at any depth). Moving a map that players cannot see keeps it hidden: without this, unlinking
-- a map from a hidden pin, or moving it under a visible one, would publish it.
create or replace function public.maps_check_parent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  above uuid;
  steps int := 0;
begin
  if new.parent_pin_id is not null and pin_campaign(new.parent_pin_id) is distinct from new.campaign_id then
    raise exception 'A sub-map must belong to the same campaign as its parent pin';
  end if;
  if new.parent_region_id is not null and region_campaign(new.parent_region_id) is distinct from new.campaign_id then
    raise exception 'A sub-map must belong to the same campaign as its parent region';
  end if;

  above := coalesce(
    (select map_id from pins where id = new.parent_pin_id),
    (select map_id from regions where id = new.parent_region_id)
  );
  while above is not null loop
    if above = new.id then
      raise exception 'A map cannot be placed beneath itself or one of its own detail maps' using errcode = '22023';
    end if;
    steps := steps + 1;
    if steps >= 20 then
      raise exception 'Maps can be nested at most 20 levels deep' using errcode = '22023';
    end if;
    above := parent_map(above);
  end loop;

  if tg_op = 'UPDATE'
     and (new.parent_pin_id is distinct from old.parent_pin_id
          or new.parent_region_id is distinct from old.parent_region_id)
     and not map_is_revealed(old.id) then
    new.visible_to_players := false;
  end if;
  return new;
end $$;
drop trigger maps_check_parent_trg on public.maps;
create trigger maps_check_parent_trg
  before insert or update of parent_pin_id, parent_region_id, campaign_id on public.maps
  for each row execute function public.maps_check_parent();

-- Deleting a region players cannot see must not publish its detail maps (as for pins in 0002): once the parent
-- is gone they are top-level maps with their own flag, so hide them first.
create function public.regions_hide_orphaned_submaps() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not (old.visible_to_players and map_is_revealed(old.map_id)) then
    update maps set visible_to_players = false where parent_region_id = old.id;
  end if;
  return old;
end $$;
create trigger regions_hide_orphaned_submaps_trg before delete on public.regions
  for each row execute function public.regions_hide_orphaned_submaps();

revoke execute on function
  public.region_campaign(uuid), public.parent_map(uuid), public.map_ancestors(uuid, boolean)
from public, anon;
grant execute on function
  public.region_campaign(uuid), public.parent_map(uuid), public.map_ancestors(uuid, boolean)
to authenticated;
revoke execute on function public.regions_hide_orphaned_submaps() from public, anon, authenticated;
