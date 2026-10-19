-- =====================================================================
-- P0-5: core schema and row level security.
--
-- Rules the policies enforce:
--   * Only members of a campaign see anything in it. DMs see and write everything.
--   * Players see a map or pin only when it, and everything above it, is revealed:
--     hiding a pin hides its sub-map, the pins on that sub-map, and so on down.
--   * DM-only data lives in its own tables (campaign_secrets, pin_secrets), so a
--     column can never leak through a row the player is allowed to read.
--   * Map images in the "maps" bucket follow the map they belong to.
-- Every policy is "to authenticated": signed-out visitors get nothing, and the helper
-- functions are not callable by them.
-- The tests are in supabase/tests/database/rls.test.sql (pnpm db:test).
-- =====================================================================

-- TABLES ---------------------------------------------------------------

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  system text not null default '5e',
  rules_edition text not null default '2024' check (rules_edition in ('2014', '2024')),
  next_session_at timestamptz,
  created_at timestamptz not null default now()
);

-- DM-only campaign data. Players never get a row from here.
create table public.campaign_secrets (
  campaign_id uuid primary key references public.campaigns (id) on delete cascade,
  invite_code text not null unique check (char_length(invite_code) between 6 and 40)
);

create table public.members (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'player' check (role in ('dm', 'player')),
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create index members_user_idx on public.members (user_id);

create table public.maps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  parent_pin_id uuid,  -- a sub-map hangs off a pin; the foreign key is added after pins exists
  name text not null check (char_length(name) between 1 and 120),
  image_path text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  visible_to_players boolean not null default false,
  created_at timestamptz not null default now(),
  -- the image must live in the campaign's own folder of the "maps" bucket
  constraint maps_image_in_campaign_folder check (image_path like campaign_id::text || '/%')
);
create index maps_campaign_idx on public.maps (campaign_id);
create index maps_parent_pin_idx on public.maps (parent_pin_id);

create table public.pins (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps (id) on delete cascade,
  type text not null default 'location' check (type in ('location', 'character', 'faction', 'lore')),
  title text not null check (char_length(title) between 1 and 120),
  x double precision not null,
  y double precision not null,
  icon text not null default 'pin',
  color text not null default '#c0392b',
  size integer not null default 32 check (size between 8 and 256),
  visible_to_players boolean not null default false,
  description text not null default '',
  history text not null default '',
  traits text[] not null default '{}',
  tags text[] not null default '{}',
  music_url text,
  created_at timestamptz not null default now()
);
create index pins_map_idx on public.pins (map_id);

alter table public.maps
  add constraint maps_parent_pin_fk foreign key (parent_pin_id) references public.pins (id) on delete set null;

-- DM-only pin data.
create table public.pin_secrets (
  pin_id uuid primary key references public.pins (id) on delete cascade,
  dm_notes text not null default ''
);

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  parent_id uuid references public.folders (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  check (parent_id is distinct from id)
);
create index folders_campaign_idx on public.folders (campaign_id);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  folder_id uuid references public.folders (id) on delete set null,
  kind text not null default 'note' check (kind in ('note', 'npc', 'location', 'item', 'quest', 'handout', 'session')),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '',
  tags text[] not null default '{}',
  visible_to_players boolean not null default false,
  session_no integer check (session_no > 0),
  real_date date,
  ingame_date text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pages_campaign_idx on public.pages (campaign_id);

create table public.links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  from_pin_id uuid not null references public.pins (id) on delete cascade,
  to_pin_id uuid not null references public.pins (id) on delete cascade,
  label text not null default '' check (char_length(label) <= 120),
  created_at timestamptz not null default now(),
  check (from_pin_id <> to_pin_id)
);
create index links_campaign_idx on public.links (campaign_id);

-- HELPER FUNCTIONS -------------------------------------------------------
-- security definer so they can look at members and parent rows without tripping the
-- very policies that call them. All are closed to signed-out visitors (end of file).

create function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where campaign_id = c and user_id = auth.uid())
$$;

create function public.is_dm(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where campaign_id = c and user_id = auth.uid() and role = 'dm')
$$;

create function public.map_campaign(m uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select campaign_id from maps where id = m
$$;

create function public.pin_campaign(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select mp.campaign_id from pins pn join maps mp on mp.id = pn.map_id where pn.id = p
$$;

-- Do I share a campaign with this user? (Used for profiles.)
create function public.shares_campaign(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members mine join members theirs on theirs.campaign_id = mine.campaign_id
    where mine.user_id = auth.uid() and theirs.user_id = other
  )
$$;

-- A map is revealed when it is flagged visible and so is every pin and map above it,
-- all the way to the top. The depth limit stops a malformed cycle from looping.
create function public.map_is_revealed(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with recursive chain (map_id, ok, parent_pin_id, depth) as (
    select id, visible_to_players, parent_pin_id, 0 from maps where id = m
    union all
    select up.id, up.visible_to_players and pn.visible_to_players, up.parent_pin_id, chain.depth + 1
    from chain
    join pins pn on pn.id = chain.parent_pin_id
    join maps up on up.id = pn.map_id
    where chain.depth < 32
  )
  select coalesce(bool_and(ok), false) from chain
$$;

create function public.pin_is_revealed(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select visible_to_players and map_is_revealed(map_id) from pins where id = p), false)
$$;

-- The campaign that owns a storage path "<campaign id>/<file>", or null for a malformed path.
create function public.folder_campaign(object_name text) returns uuid
language sql immutable set search_path = public as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(object_name, '/', 1)::uuid
  end
$$;

-- A map image is readable exactly when its map is.
create function public.can_read_map_image(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from maps
    where image_path = object_name
      and (is_dm(campaign_id) or (is_member(campaign_id) and map_is_revealed(id)))
  )
$$;

-- TRIGGERS ---------------------------------------------------------------

-- A new campaign: the creator becomes its DM, and it gets an invite code.
create function public.campaigns_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into members (campaign_id, user_id, role) values (new.id, new.owner_id, 'dm');
  insert into campaign_secrets (campaign_id, invite_code)
  values (new.id, upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 10)));
  return new;
end $$;
create trigger campaigns_after_insert_trg after insert on public.campaigns
  for each row execute function public.campaigns_after_insert();

-- The owner is fixed (the DM role can move, ownership cannot).
create function public.campaigns_owner_fixed() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'The campaign owner cannot be changed';
  end if;
  return new;
end $$;
create trigger campaigns_owner_fixed_trg before update on public.campaigns
  for each row execute function public.campaigns_owner_fixed();

-- A campaign always keeps at least one DM. Deleting the whole campaign is still allowed.
create function public.members_keep_a_dm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role <> 'dm' or (tg_op = 'UPDATE' and new.role = 'dm') then
    return coalesce(new, old);
  end if;
  if not exists (select 1 from campaigns where id = old.campaign_id) then
    return coalesce(new, old);  -- the campaign itself is being deleted
  end if;
  if not exists (
    select 1 from members
    where campaign_id = old.campaign_id and role = 'dm' and user_id <> old.user_id
  ) then
    raise exception 'A campaign must keep at least one DM';
  end if;
  return coalesce(new, old);
end $$;
create trigger members_keep_a_dm_trg before update or delete on public.members
  for each row execute function public.members_keep_a_dm();

-- A sub-map must hang off a pin from its own campaign.
create function public.maps_check_parent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parent_pin_id is not null and pin_campaign(new.parent_pin_id) is distinct from new.campaign_id then
    raise exception 'A sub-map must belong to the same campaign as its parent pin';
  end if;
  return new;
end $$;
create trigger maps_check_parent_trg before insert or update of parent_pin_id, campaign_id on public.maps
  for each row execute function public.maps_check_parent();

-- Deleting a pin that players cannot see must not publish its sub-maps: once the parent is
-- gone they would be top-level maps with their own (possibly visible) flag. Hide them first.
create function public.pins_hide_orphaned_submaps() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not (old.visible_to_players and map_is_revealed(old.map_id)) then
    update maps set visible_to_players = false where parent_pin_id = old.id;
  end if;
  return old;
end $$;
create trigger pins_hide_orphaned_submaps_trg before delete on public.pins
  for each row execute function public.pins_hide_orphaned_submaps();

-- A page's folder must come from the page's campaign.
create function public.pages_check_folder() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.folder_id is not null
     and (select campaign_id from folders where id = new.folder_id) is distinct from new.campaign_id then
    raise exception 'A page must be in a folder from its own campaign';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger pages_check_folder_trg before insert or update on public.pages
  for each row execute function public.pages_check_folder();

-- A folder's parent must come from the folder's campaign.
create function public.folders_check_parent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parent_id is not null
     and (select campaign_id from folders where id = new.parent_id) is distinct from new.campaign_id then
    raise exception 'A folder must be inside a folder from its own campaign';
  end if;
  return new;
end $$;
create trigger folders_check_parent_trg before insert or update of parent_id, campaign_id on public.folders
  for each row execute function public.folders_check_parent();

-- Both ends of a link must be pins from the link's campaign.
create function public.links_check_pins() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pin_campaign(new.from_pin_id) is distinct from new.campaign_id
     or pin_campaign(new.to_pin_id) is distinct from new.campaign_id then
    raise exception 'A link must join pins from its own campaign';
  end if;
  return new;
end $$;
create trigger links_check_pins_trg before insert or update on public.links
  for each row execute function public.links_check_pins();

-- JOINING ------------------------------------------------------------------

-- Join a campaign as a player with its invite code. Returns the campaign id.
-- Joining a campaign you are already in changes nothing (a DM is never demoted).
create function public.join_campaign(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cid uuid;
begin
  if uid is null then
    raise exception 'Sign in first';
  end if;
  select campaign_id into cid from campaign_secrets where invite_code = upper(trim(code));
  if cid is null then
    raise exception 'Invalid invite code';
  end if;
  insert into members (campaign_id, user_id, role) values (cid, uid, 'player')
  on conflict (campaign_id, user_id) do nothing;
  return cid;
end $$;

-- ROW LEVEL SECURITY -------------------------------------------------------

alter table public.campaigns enable row level security;
alter table public.campaign_secrets enable row level security;
alter table public.members enable row level security;
alter table public.maps enable row level security;
alter table public.pins enable row level security;
alter table public.pin_secrets enable row level security;
alter table public.folders enable row level security;
alter table public.pages enable row level security;
alter table public.links enable row level security;

-- campaigns. The owner check lets "insert ... returning" see the new row before the
-- after-insert trigger has made the owner a member.
create policy "read campaigns" on public.campaigns for select to authenticated
  using (owner_id = auth.uid() or is_member(id));
create policy "create own campaigns" on public.campaigns for insert to authenticated
  with check (owner_id = auth.uid());
create policy "dm updates campaigns" on public.campaigns for update to authenticated
  using (is_dm(id)) with check (is_dm(id));
create policy "owner deletes campaigns" on public.campaigns for delete to authenticated
  using (owner_id = auth.uid());

create policy "dm only campaign secrets" on public.campaign_secrets for select to authenticated
  using (is_dm(campaign_id));

create policy "read members" on public.members for select to authenticated
  using (is_member(campaign_id));
create policy "dm manages members" on public.members for all to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));

create policy "read maps" on public.maps for select to authenticated
  using (is_dm(campaign_id) or (is_member(campaign_id) and map_is_revealed(id)));
create policy "dm writes maps" on public.maps for all to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));

create policy "read pins" on public.pins for select to authenticated
  using (is_dm(map_campaign(map_id))
         or (is_member(map_campaign(map_id)) and visible_to_players and map_is_revealed(map_id)));
create policy "dm writes pins" on public.pins for all to authenticated
  using (is_dm(map_campaign(map_id))) with check (is_dm(map_campaign(map_id)));

create policy "dm only pin secrets" on public.pin_secrets for all to authenticated
  using (is_dm(pin_campaign(pin_id))) with check (is_dm(pin_campaign(pin_id)));

create policy "read folders" on public.folders for select to authenticated
  using (is_member(campaign_id));
create policy "dm writes folders" on public.folders for all to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));

create policy "read pages" on public.pages for select to authenticated
  using (is_dm(campaign_id) or (is_member(campaign_id) and visible_to_players));
create policy "dm writes pages" on public.pages for all to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));

create policy "read links" on public.links for select to authenticated
  using (is_dm(campaign_id)
         or (is_member(campaign_id) and pin_is_revealed(from_pin_id) and pin_is_revealed(to_pin_id)));
create policy "dm writes links" on public.links for all to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));

create policy "read profiles of fellow members" on public.profiles for select to authenticated
  using (id = auth.uid() or shares_campaign(id));

-- STORAGE: the private "maps" bucket, one folder per campaign -----------------

insert into storage.buckets (id, name, public) values ('maps', 'maps', false)
on conflict (id) do nothing;

create policy "maps: read what the map policy lets you read" on storage.objects for select to authenticated
  using (bucket_id = 'maps' and can_read_map_image(name));
create policy "maps: DMs upload into their campaign folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'maps' and is_dm(folder_campaign(name)));
create policy "maps: DMs update files in their campaign folder" on storage.objects for update to authenticated
  using (bucket_id = 'maps' and is_dm(folder_campaign(name)))
  with check (bucket_id = 'maps' and is_dm(folder_campaign(name)));
create policy "maps: DMs delete files in their campaign folder" on storage.objects for delete to authenticated
  using (bucket_id = 'maps' and is_dm(folder_campaign(name)));

-- FUNCTION PRIVILEGES --------------------------------------------------------
-- Supabase grants execute on new functions to anon by default. Close them all, then open
-- the ones the app and the policies need to signed-in users only.

revoke execute on function
  public.is_member(uuid), public.is_dm(uuid), public.map_campaign(uuid), public.pin_campaign(uuid),
  public.shares_campaign(uuid), public.map_is_revealed(uuid), public.pin_is_revealed(uuid),
  public.folder_campaign(text), public.can_read_map_image(text), public.join_campaign(text)
from public, anon;

grant execute on function
  public.is_member(uuid), public.is_dm(uuid), public.map_campaign(uuid), public.pin_campaign(uuid),
  public.shares_campaign(uuid), public.map_is_revealed(uuid), public.pin_is_revealed(uuid),
  public.folder_campaign(text), public.can_read_map_image(text), public.join_campaign(text)
to authenticated;

-- trigger functions are never called directly
revoke execute on function
  public.campaigns_after_insert(), public.campaigns_owner_fixed(), public.members_keep_a_dm(),
  public.maps_check_parent(), public.pins_hide_orphaned_submaps(), public.pages_check_folder(), public.folders_check_parent(),
  public.links_check_pins()
from public, anon, authenticated;
