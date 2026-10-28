-- =====================================================================
-- 0020: party groups, discovery and the Here tab (P3-3, REG-4, REG-6, CHK-1, MAP-7 data).
--   * party_groups are location groups (where a set of characters is), not the official Party of 0012. A
--     character is in at most one group per campaign.
--   * content_discoveries records what each group has noticed or found in a region. discovery_notices is the
--     player-readable side of it: one line ("You notice a mossy shrine") per discovery, sent over realtime.
--   * Players never read region_content, its secrets or content_discoveries. They get masked rows from
--     get_here: what their group has discovered (public fields only), hints as kind + hint text, nothing else.
--   * Passive checks need the rules engine (skill bonuses from computeSheet), so a group is moved by the roll Edge
--     Function (action move-group), which works out the members' passives and calls move_group with the service
--     role. The same function runs searches (action search) through search_region.
--   * campaigns.settings.searchCooldownMinutes (default 10): one search per character per region in that time.
-- =====================================================================

create table public.party_groups (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text not null default '#8E2A22' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  map_id uuid references public.maps (id) on delete set null,
  region_id uuid references public.regions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index party_groups_campaign_idx on public.party_groups (campaign_id);

create table public.party_group_members (
  group_id uuid not null references public.party_groups (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  primary key (group_id, character_id),
  -- a character is in at most one group per campaign
  unique (campaign_id, character_id)
);

create table public.content_discoveries (
  content_id uuid not null references public.region_content (id) on delete cascade,
  group_id uuid not null references public.party_groups (id) on delete cascade,
  state text not null check (state in ('noticed', 'found')),
  created_at timestamptz not null default now(),
  primary key (content_id, group_id)
);
create index content_discoveries_group_idx on public.content_discoveries (group_id);

create table public.discovery_notices (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  group_id uuid not null references public.party_groups (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 200),
  created_at timestamptz not null default now()
);
create index discovery_notices_group_idx on public.discovery_notices (group_id, created_at desc);

-- the search log: rate limit and history. Names are not needed; region and roll ids are enough for the DM.
create table public.region_searches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  character_id uuid not null,
  region_id uuid not null,
  group_id uuid not null,
  roll_id uuid not null,
  found int not null,
  created_at timestamptz not null default now()
);
create index region_searches_recent_idx on public.region_searches (character_id, region_id, created_at desc);
create trigger region_searches_append_only_trg before update or delete on public.region_searches
  for each row execute function public.log_append_only();

-- Does the signed-in user own a character in this group?
create function public.in_group(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from party_group_members pm join characters ch on ch.id = pm.character_id
    where pm.group_id = g and ch.owner_id = auth.uid()
  )
$$;

create function public.group_campaign(g uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select campaign_id from party_groups where id = g
$$;

-- A group's map and region belong to its campaign, and the region lies on the group's map.
create function public.party_groups_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.map_id is not null and map_campaign(new.map_id) is distinct from new.campaign_id then
    raise exception 'The map must belong to the group''s campaign' using errcode = '22023';
  end if;
  if new.region_id is not null and (select map_id from regions where id = new.region_id) is distinct from new.map_id then
    raise exception 'The region must be on the group''s map' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger party_groups_check_trg before insert or update on public.party_groups
  for each row execute function public.party_groups_check();

-- A member's campaign is the group's, and the character must be in it.
create function public.party_group_members_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.campaign_id := group_campaign(new.group_id);
  if (select campaign_id from characters where id = new.character_id) is distinct from new.campaign_id then
    raise exception 'The character must belong to the group''s campaign' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger party_group_members_check_trg before insert or update on public.party_group_members
  for each row execute function public.party_group_members_check();

-- ROW LEVEL SECURITY ---------------------------------------------------------------------
alter table public.party_groups enable row level security;
alter table public.party_group_members enable row level security;
alter table public.content_discoveries enable row level security;
alter table public.discovery_notices enable row level security;
alter table public.region_searches enable row level security;

-- a player sees only the groups their own characters are in
create policy "read own groups" on public.party_groups for select to authenticated
  using (is_dm(campaign_id) or in_group(id));
create policy "dm writes groups" on public.party_groups for all to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));
create policy "read own group members" on public.party_group_members for select to authenticated
  using (is_dm(campaign_id) or in_group(group_id));
create policy "dm writes group members" on public.party_group_members for all to authenticated
  using (is_dm(campaign_id)) with check (is_dm(group_campaign(group_id)));
-- discoveries say what is in a region: DM only. Players get them through get_here.
create policy "dm only discoveries" on public.content_discoveries for all to authenticated
  using (is_dm(group_campaign(group_id))) with check (is_dm(group_campaign(group_id)));
create policy "read own group notices" on public.discovery_notices for select to authenticated
  using (is_dm(campaign_id) or in_group(group_id));
create policy "dm reads searches" on public.region_searches for select to authenticated
  using (is_dm(campaign_id));

alter publication supabase_realtime add table public.discovery_notices;

-- REVEALING -------------------------------------------------------------------------------

-- Records that a group noticed or found an entry (found is never downgraded to noticed) and tells its members.
-- Returns true when this is news to the group.
create function public.record_discovery(p_content uuid, p_group uuid, p_state text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  before text;
  entry record;
begin
  select state into before from content_discoveries where content_id = p_content and group_id = p_group;
  if before = 'found' or before = p_state then
    return false;
  end if;
  insert into content_discoveries (content_id, group_id, state) values (p_content, p_group, p_state)
  on conflict (content_id, group_id) do update set state = excluded.state;
  select name into entry from region_content where id = p_content;
  insert into discovery_notices (campaign_id, group_id, text)
  values (group_campaign(p_group), p_group,
          left(case when p_state = 'found' then 'You find ' else 'You notice ' end || entry.name, 200));
  return true;
end $$;

-- DM only: create a group.
create function public.create_group(p_campaign uuid, p_name text, p_color text default '#8E2A22') returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  perform require_dm(p_campaign);
  insert into party_groups (campaign_id, name, color) values (p_campaign, trim(p_name), p_color) returning id into g;
  return g;
end $$;

-- DM only: put a character in a group (it leaves any other group of the campaign), or in none (p_group null).
create function public.assign_character(p_character uuid, p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c uuid := (select campaign_id from characters where id = p_character);
begin
  perform require_dm(c);
  if p_group is not null and group_campaign(p_group) is distinct from c then
    raise exception 'The character must belong to the group''s campaign' using errcode = '22023';
  end if;
  delete from party_group_members where character_id = p_character;
  if p_group is not null then
    insert into party_group_members (group_id, character_id) values (p_group, p_character);
  end if;
end $$;

-- DM only: reveal an entry to a group by hand.
create function public.reveal_content(p_content uuid, p_group uuid, p_state text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_dm(group_campaign(p_group));
  if content_campaign(p_content) is distinct from group_campaign(p_group) then
    raise exception 'The entry and the group must be in the same campaign' using errcode = '22023';
  end if;
  if p_state not in ('noticed', 'found') then
    raise exception 'Reveal as noticed or found' using errcode = '22023';
  end if;
  perform record_discovery(p_content, p_group, p_state);
end $$;

-- Service role only (the roll Edge Function, action move-group): moves a group, as the DM p_actor. Entering a
-- region reveals its noticed and found entries, and every hidden or hinted entry whose discovery DC is at or below
-- the group's best passive score for that entry's skill (p_passives: { skill: 10 + bonus }, worked out from the
-- members' sheets). Returns the names newly discovered.
create function public.move_group(p_actor uuid, p_group uuid, p_map uuid, p_region uuid, p_passives jsonb)
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
  for e in select id, name, state, discovery_dc, discovery_skill from region_content where region_id = p_region loop
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

-- Service role only (the roll Edge Function, action search): p_actor searches the region their character's group
-- is in. One d20, rolled and logged like any check with the character's Perception bonus (p_bonus and
-- p_breakdown); each undiscovered hidden or hinted entry with a DC compares that die plus the character's bonus
-- in the entry's own skill (p_bonuses) against its DC. One search per character per region per cooldown.
-- Returns { roll, found: [{ name, kind }] } with only what was discovered.
create function public.search_region(
  p_actor uuid, p_character uuid, p_bonus int, p_breakdown jsonb, p_mode text, p_bonuses jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  ch record;
  g record;
  cooldown int;
  r public.rolls;
  e record;
  total int;
  found jsonb := '[]'::jsonb;
begin
  select id, campaign_id, owner_id into ch from characters where id = p_character;
  if ch.id is null then
    raise exception 'We could not find that character' using errcode = '42501';
  end if;
  if ch.owner_id is distinct from p_actor
     and not exists (select 1 from members where campaign_id = ch.campaign_id and user_id = p_actor and role = 'dm') then
    raise exception 'You can only search with your own character' using errcode = '42501';
  end if;
  select pg.id, pg.region_id into g
  from party_group_members pm join party_groups pg on pg.id = pm.group_id
  where pm.character_id = p_character;
  if g.region_id is null then
    raise exception 'Your group is not in a region the DM has placed it in' using errcode = '22023';
  end if;
  cooldown := coalesce(((select settings from campaigns where id = ch.campaign_id) ->> 'searchCooldownMinutes')::int, 10);
  if exists (
    select 1 from region_searches
    where character_id = p_character and region_id = g.region_id
      and created_at > now() - make_interval(mins => cooldown)
  ) then
    raise exception 'You searched here in the last % minutes. Give it a moment before you search again.', cooldown
      using errcode = 'PT429';
  end if;

  r := roll_d20(p_actor, ch.campaign_id, p_character, 'check', 'Search (Perception)', p_bonus, null, p_mode, false,
                p_breakdown);
  for e in
    select rc.id, rc.name, rc.kind, rc.discovery_dc, rc.discovery_skill from region_content rc
    where rc.region_id = g.region_id and rc.state in ('hidden', 'hinted') and rc.discovery_dc is not null
      and not exists (select 1 from content_discoveries d where d.content_id = rc.id and d.group_id = g.id)
    order by rc.sort_order, rc.created_at
  loop
    total := r.kept + coalesce((p_bonuses ->> e.discovery_skill)::int, p_bonus);
    if total >= e.discovery_dc and record_discovery(e.id, g.id, 'noticed') then
      found := found || jsonb_build_object('name', e.name, 'kind', e.kind);
    end if;
  end loop;
  insert into region_searches (campaign_id, character_id, region_id, group_id, roll_id, found)
  values (ch.campaign_id, p_character, g.region_id, g.id, r.id, jsonb_array_length(found));
  return jsonb_build_object('roll', to_jsonb(r), 'found', found);
end $$;

-- THE HERE TAB ----------------------------------------------------------------------------

-- What the character's group knows about the region it is in, masked:
--   * entries the group has discovered, and entries the DM has marked noticed or found: public fields only;
--   * hinted entries not yet discovered: their kind and hint text, nothing else;
--   * hidden entries: nothing at all. Never DM notes, discovery DCs, spawn rules, or other groups' data.
-- For the character's owner or the DM.
create function public.get_here(p_character uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  ch record;
  g record;
  rg record;
begin
  select id, campaign_id, owner_id into ch from characters where id = p_character;
  if ch.id is null or not (ch.owner_id = auth.uid() or is_dm(ch.campaign_id)) then
    raise exception 'We could not find that character' using errcode = '42501';
  end if;
  select pg.id, pg.name, pg.color, pg.map_id, pg.region_id into g
  from party_group_members pm join party_groups pg on pg.id = pm.group_id
  where pm.character_id = p_character;
  if g.id is null then
    return jsonb_build_object('group', null, 'region', null, 'entries', '[]'::jsonb, 'hints', '[]'::jsonb);
  end if;
  select id, name into rg from regions where id = g.region_id;
  return jsonb_build_object(
    'group', jsonb_build_object('id', g.id, 'name', g.name, 'color', g.color, 'mapId', g.map_id),
    'region', case when rg.id is null then null else jsonb_build_object('id', rg.id, 'name', rg.name) end,
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rc.id,
        'kind', rc.kind,
        'name', rc.name,
        'description', coalesce(rc.details ->> 'description', ''),
        'stock', case when rc.kind = 'shop' then coalesce(rc.details -> 'stock', '[]'::jsonb) else '[]'::jsonb end,
        'actions', case rc.kind
          when 'folk' then '["talk"]'::jsonb
          when 'creature' then '["act"]'::jsonb
          when 'interactable' then '["examine"]'::jsonb
          when 'shop' then '["buy"]'::jsonb
          else '[]'::jsonb end
      ) order by rc.sort_order, rc.created_at)
      from region_content rc
      where rc.region_id = g.region_id
        and (rc.state in ('noticed', 'found')
             or exists (select 1 from content_discoveries d where d.content_id = rc.id and d.group_id = g.id))
    ), '[]'::jsonb),
    'hints', coalesce((
      select jsonb_agg(jsonb_build_object('id', rc.id, 'kind', rc.kind, 'hint', rc.hint_text)
                       order by rc.sort_order, rc.created_at)
      from region_content rc
      where rc.region_id = g.region_id and rc.state = 'hinted' and rc.hint_text is not null
        and not exists (select 1 from content_discoveries d where d.content_id = rc.id and d.group_id = g.id)
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function
  public.in_group(uuid), public.group_campaign(uuid), public.party_groups_check(), public.party_group_members_check(),
  public.record_discovery(uuid, uuid, text), public.create_group(uuid, text, text), public.assign_character(uuid, uuid),
  public.reveal_content(uuid, uuid, text), public.move_group(uuid, uuid, uuid, uuid, jsonb),
  public.search_region(uuid, uuid, int, jsonb, text, jsonb), public.get_here(uuid)
from public, anon, authenticated;
grant execute on function
  public.in_group(uuid), public.group_campaign(uuid), public.create_group(uuid, text, text),
  public.assign_character(uuid, uuid), public.reveal_content(uuid, uuid, text), public.get_here(uuid)
to authenticated;
grant execute on function public.move_group(uuid, uuid, uuid, uuid, jsonb),
  public.search_region(uuid, uuid, int, jsonb, text, jsonb)
to service_role;
