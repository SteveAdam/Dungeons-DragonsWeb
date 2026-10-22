-- =====================================================================
-- 0007 (ticket P2-1): the entity registry. Every named thing in a campaign (NPCs, places, items, factions,
-- lore, player characters, the party, sessions) is an entity. Entities sit in folders (any mix of types) and
-- are joined by relationships that read correctly from both ends ("owns" / "is owned by").
--
-- Writes go through the DM-only functions at the bottom (and a matching DM-only write policy). Players read
-- visible entities, and relationships only when the link is not hidden and both ends are visible.
-- =====================================================================

create type public.entity_type as enum ('npc', 'location', 'item', 'faction', 'lore', 'player', 'party', 'session');

create table public.entity_folders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- no cascade: delete_folder() moves a folder's children up one level before it deletes the folder, so
  -- deleting any other way, with children still inside, is refused
  parent_id uuid references public.entity_folders (id),
  name text not null check (char_length(name) between 1 and 120),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index entity_folders_campaign_idx on public.entity_folders (campaign_id);
create index entity_folders_parent_idx on public.entity_folders (parent_id);

create table public.entities (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  type public.entity_type not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  folder_id uuid references public.entity_folders (id) on delete set null,
  visible_to_players boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Names are unique within a campaign, ignoring case. Wiki links in notes ("[[Port Vellum]]") find their entity
-- by name, so two entities called "Port Vellum" (or "port vellum") would make a link ambiguous. Distinguish
-- namesakes in the name itself ("Mira (the smith)").
create unique index entities_campaign_name_key on public.entities (campaign_id, lower(name));
create index entities_folder_idx on public.entities (folder_id);

create table public.entity_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  a_id uuid not null references public.entities (id) on delete cascade,
  b_id uuid not null references public.entities (id) on delete cascade,
  -- how the relationship reads from a's side ("owns") and from b's side ("is owned by")
  label_ab text not null check (char_length(btrim(label_ab)) between 1 and 80),
  label_ba text not null check (char_length(btrim(label_ba)) between 1 and 80),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  constraint entity_links_not_self check (a_id <> b_id)
);
-- The same relationship cannot be stored twice, in either direction. A relationship is the pair of entities
-- together with its two labels, so "A owns B" is the same as "B is owned by A" (stored with a and b swapped).
-- The index orders the pair by id and takes each label from the matching side. Two entities can still have
-- several different relationships ("owns" and also "is rival of").
create unique index entity_links_same_relationship_key on public.entity_links (
  least(a_id, b_id),
  greatest(a_id, b_id),
  lower(btrim(case when a_id < b_id then label_ab else label_ba end)),
  lower(btrim(case when a_id < b_id then label_ba else label_ab end))
);
create index entity_links_a_idx on public.entity_links (a_id);
create index entity_links_b_idx on public.entity_links (b_id);

-- Other records can point at the entity they describe (filled in by later tickets; no backfill here).
alter table public.characters add column entity_id uuid unique references public.entities (id) on delete set null;
alter table public.pins add column entity_id uuid references public.entities (id) on delete set null;
alter table public.pages add column entity_id uuid references public.entities (id) on delete set null;

-- HELPERS ------------------------------------------------------------------

create function public.entity_campaign(e uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select campaign_id from entities where id = e
$$;

create function public.entity_visible(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select visible_to_players from entities where id = e), false)
$$;

create function public.entity_folder_campaign(f uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select campaign_id from entity_folders where id = f
$$;

-- TRIGGERS: nothing may point into another campaign, and folders never form a loop ------------------------

create function public.entities_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.folder_id is not null and entity_folder_campaign(new.folder_id) is distinct from new.campaign_id then
    raise exception 'An entity must be in a folder from its own campaign';
  end if;
  if tg_op = 'UPDATE' and new.campaign_id is distinct from old.campaign_id then
    raise exception 'An entity keeps its campaign';
  end if;
  new.name := btrim(new.name);
  new.updated_at := now();
  return new;
end $$;
create trigger entities_guard_trg before insert or update on public.entities
  for each row execute function public.entities_guard();

create function public.entity_folders_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parent_id is not null then
    if entity_folder_campaign(new.parent_id) is distinct from new.campaign_id then
      raise exception 'A folder must be inside a folder from its own campaign';
    end if;
    -- walking up from the new parent must never reach this folder
    if exists (
      with recursive up as (
        select id, parent_id from entity_folders where id = new.parent_id
        union all
        select f.id, f.parent_id from entity_folders f join up on f.id = up.parent_id
      )
      select 1 from up where id = new.id
    ) then
      raise exception 'A folder cannot go inside itself or one of its own subfolders';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.campaign_id is distinct from old.campaign_id then
    raise exception 'A folder keeps its campaign';
  end if;
  return new;
end $$;
create trigger entity_folders_guard_trg before insert or update on public.entity_folders
  for each row execute function public.entity_folders_guard();

create function public.entity_links_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if entity_campaign(new.a_id) is distinct from new.campaign_id
     or entity_campaign(new.b_id) is distinct from new.campaign_id then
    raise exception 'Both ends of a relationship must belong to its campaign';
  end if;
  new.label_ab := btrim(new.label_ab);
  new.label_ba := btrim(new.label_ba);
  return new;
end $$;
create trigger entity_links_guard_trg before insert or update on public.entity_links
  for each row execute function public.entity_links_guard();

-- ROW LEVEL SECURITY ----------------------------------------------------------

alter table public.entity_folders enable row level security;
alter table public.entities enable row level security;
alter table public.entity_links enable row level security;

create policy "dm only entity folders" on public.entity_folders for all to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));

create policy "read entities" on public.entities for select to authenticated
  using (is_dm(campaign_id) or (is_member(campaign_id) and visible_to_players));
create policy "dm writes entities" on public.entities for all to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));

create policy "read entity links" on public.entity_links for select to authenticated
  using (is_dm(campaign_id)
         or (is_member(campaign_id) and not hidden and entity_visible(a_id) and entity_visible(b_id)));
create policy "dm writes entity links" on public.entity_links for all to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));

-- FUNCTIONS (DM only) --------------------------------------------------------------

create function public.require_dm(c uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if c is null or not is_dm(c) then
    raise exception 'Only the DM can do that' using errcode = '42501';
  end if;
end $$;

create function public.create_entity(
  p_campaign uuid, p_type public.entity_type, p_name text, p_folder uuid default null, p_visible boolean default false
) returns public.entities
language plpgsql security definer set search_path = public as $$
declare result entities;
begin
  perform require_dm(p_campaign);
  insert into entities (campaign_id, type, name, folder_id, visible_to_players,
                        sort_order)
  values (p_campaign, p_type, p_name, p_folder, coalesce(p_visible, false),
          coalesce((select max(sort_order) + 1 from entities where campaign_id = p_campaign
                    and folder_id is not distinct from p_folder), 0))
  returning * into result;
  return result;
end $$;

create function public.rename_entity(p_entity uuid, p_name text) returns public.entities
language plpgsql security definer set search_path = public as $$
declare result entities;
begin
  perform require_dm(entity_campaign(p_entity));
  update entities set name = p_name where id = p_entity returning * into result;
  return result;
end $$;

create function public.delete_entity(p_entity uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_dm(entity_campaign(p_entity));
  delete from entities where id = p_entity;  -- its relationships go with it (on delete cascade)
end $$;

create function public.move_entity(p_entity uuid, p_folder uuid, p_sort_order int default null) returns public.entities
language plpgsql security definer set search_path = public as $$
declare result entities;
begin
  perform require_dm(entity_campaign(p_entity));
  update entities
     set folder_id = p_folder,
         sort_order = coalesce(p_sort_order, (select coalesce(max(sort_order) + 1, 0) from entities e2
                                              where e2.campaign_id = entities.campaign_id
                                                and e2.folder_id is not distinct from p_folder))
   where id = p_entity
  returning * into result;
  return result;
end $$;

create function public.set_entity_visibility(p_entity uuid, p_visible boolean) returns public.entities
language plpgsql security definer set search_path = public as $$
declare result entities;
begin
  perform require_dm(entity_campaign(p_entity));
  update entities set visible_to_players = p_visible where id = p_entity returning * into result;
  return result;
end $$;

create function public.create_folder(p_campaign uuid, p_name text, p_parent uuid default null)
returns public.entity_folders
language plpgsql security definer set search_path = public as $$
declare result entity_folders;
begin
  perform require_dm(p_campaign);
  insert into entity_folders (campaign_id, name, parent_id, sort_order)
  values (p_campaign, btrim(p_name), p_parent,
          coalesce((select max(sort_order) + 1 from entity_folders where campaign_id = p_campaign
                    and parent_id is not distinct from p_parent), 0))
  returning * into result;
  return result;
end $$;

create function public.rename_folder(p_folder uuid, p_name text) returns public.entity_folders
language plpgsql security definer set search_path = public as $$
declare result entity_folders;
begin
  perform require_dm(entity_folder_campaign(p_folder));
  update entity_folders set name = btrim(p_name) where id = p_folder returning * into result;
  return result;
end $$;

create function public.move_folder(p_folder uuid, p_parent uuid, p_sort_order int default null)
returns public.entity_folders
language plpgsql security definer set search_path = public as $$
declare result entity_folders;
begin
  perform require_dm(entity_folder_campaign(p_folder));
  update entity_folders
     set parent_id = p_parent,
         sort_order = coalesce(p_sort_order, sort_order)
   where id = p_folder
  returning * into result;
  return result;
end $$;

-- Deleting a folder moves everything in it (subfolders and entities) up one level, then deletes only the
-- folder itself. No entity is ever deleted with a folder.
create function public.delete_folder(p_folder uuid) returns void
language plpgsql security definer set search_path = public as $$
declare parent uuid;
begin
  perform require_dm(entity_folder_campaign(p_folder));
  select parent_id into parent from entity_folders where id = p_folder;
  update entity_folders set parent_id = parent where parent_id = p_folder;
  update entities set folder_id = parent where folder_id = p_folder;
  delete from entity_folders where id = p_folder;
end $$;

create function public.add_link(
  p_a uuid, p_b uuid, p_label_ab text, p_label_ba text, p_hidden boolean default false
) returns public.entity_links
language plpgsql security definer set search_path = public as $$
declare result entity_links;
begin
  perform require_dm(entity_campaign(p_a));
  insert into entity_links (campaign_id, a_id, b_id, label_ab, label_ba, hidden)
  values (entity_campaign(p_a), p_a, p_b, p_label_ab, p_label_ba, coalesce(p_hidden, false))
  returning * into result;
  return result;
end $$;

create function public.remove_link(p_link uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_dm((select campaign_id from entity_links where id = p_link));
  delete from entity_links where id = p_link;
end $$;

-- Reveals a hidden relationship to players, or (p_hidden true) hides it again.
create function public.reveal_link(p_link uuid, p_hidden boolean default false) returns public.entity_links
language plpgsql security definer set search_path = public as $$
declare result entity_links;
begin
  perform require_dm((select campaign_id from entity_links where id = p_link));
  update entity_links set hidden = p_hidden where id = p_link returning * into result;
  return result;
end $$;

-- FUNCTION PRIVILEGES --------------------------------------------------------

revoke execute on function
  public.entity_campaign(uuid), public.entity_visible(uuid), public.entity_folder_campaign(uuid),
  public.require_dm(uuid),
  public.create_entity(uuid, public.entity_type, text, uuid, boolean), public.rename_entity(uuid, text),
  public.delete_entity(uuid), public.move_entity(uuid, uuid, int), public.set_entity_visibility(uuid, boolean),
  public.create_folder(uuid, text, uuid), public.rename_folder(uuid, text), public.move_folder(uuid, uuid, int),
  public.delete_folder(uuid),
  public.add_link(uuid, uuid, text, text, boolean), public.remove_link(uuid), public.reveal_link(uuid, boolean)
from public, anon;

grant execute on function
  public.entity_campaign(uuid), public.entity_visible(uuid), public.entity_folder_campaign(uuid),
  public.require_dm(uuid),
  public.create_entity(uuid, public.entity_type, text, uuid, boolean), public.rename_entity(uuid, text),
  public.delete_entity(uuid), public.move_entity(uuid, uuid, int), public.set_entity_visibility(uuid, boolean),
  public.create_folder(uuid, text, uuid), public.rename_folder(uuid, text), public.move_folder(uuid, uuid, int),
  public.delete_folder(uuid),
  public.add_link(uuid, uuid, text, text, boolean), public.remove_link(uuid), public.reveal_link(uuid, boolean)
to authenticated;

revoke execute on function public.entities_guard(), public.entity_folders_guard(), public.entity_links_guard()
  from public, anon, authenticated;
