-- move_group listed what a group discovered in whatever order the table scan gave, so the same move could report its
-- finds differently from one call to the next. It now uses the DM's order, as search_region and get_here already do.
-- Nothing else about the function changes.
create or replace function public.move_group(p_actor uuid, p_group uuid, p_map uuid, p_region uuid, p_passives jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c uuid := group_campaign(p_group);
  e record;
  revealed jsonb := '[]'::jsonb;
begin
  if c is null or not exists (select 1 from members where campaign_id = c and user_id = p_actor and role = 'dm') then
    raise exception 'Only the DM can do that' using errcode = '42501';
  end if;
  if p_passives is null or jsonb_typeof(p_passives) <> 'object' then
    raise exception 'Passive scores are an object of skill to score' using errcode = '22023';
  end if;
  update party_groups set map_id = p_map, region_id = p_region where id = p_group;
  if p_region is null then
    return revealed;
  end if;
  for e in
    select id, name, state, discovery_dc, discovery_skill from region_content where region_id = p_region
    order by sort_order, created_at
  loop
    if e.state in ('noticed', 'found') then
      if record_discovery(e.id, p_group, e.state) then
        revealed := revealed || to_jsonb(e.name);
      end if;
    elsif e.discovery_dc is not null
          and coalesce((p_passives ->> e.discovery_skill)::int, (p_passives ->> 'perception')::int, 10) >= e.discovery_dc then
      if record_discovery(e.id, p_group, 'noticed') then
        revealed := revealed || to_jsonb(e.name);
      end if;
    end if;
  end loop;
  return revealed;
end $$;
