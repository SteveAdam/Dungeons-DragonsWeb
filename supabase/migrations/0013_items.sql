-- =====================================================================
-- 0013 (ticket P2-7): items, the pack, equipment, attunement and transfers.
--
--   * An item is an entity of type 'item' (so folders and relationships work) with a row in items: its kind,
--     rules (definition), weight, value, rarity, stack quantity and owner (a character, a party, or the world).
--   * item_secrets holds what only the DM knows (a curse, a hidden property). The hidden effect is a note: it is
--     not applied to the sheet until the DM writes it into the item's rules.
--   * Equipping and attunement go through functions, and a trigger keeps the rules: attuned only when the item
--     needs it, at most three attuned items, one body armour and one shield equipped per character.
--   * Players give items by offering them; ownership moves only when the recipient accepts. Giving part of a
--     stack splits it. The DM moves items directly (force_move_item). item_transfers is the history; it keeps the
--     names as they were, so a player can read "Tolin → Brannoc" without reading Tolin's character.
--   * Owners change only inside these functions (the item_move flag), so every move is in the history.
--   * Existing characters' armour, shield and weapons (Phase 1 sheet fields) become equipped items.
-- =====================================================================

-- TABLES -------------------------------------------------------------------------

create table public.items (
  entity_id uuid primary key references public.entities (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- the SRD weapon or armour it was cloned from, e.g. 'chain-mail'
  srd_ref text,
  kind text not null check (kind in ('weapon', 'armor', 'shield', 'gear', 'magic', 'consumable', 'quest')),
  -- { weapon?, armor?, magicBonus?, requirements?, effects?, description? } (ItemDefinition in the rules engine)
  definition jsonb not null default '{}' check (jsonb_typeof(definition) = 'object'),
  -- pounds for one of them; null where the SRD gives none
  weight numeric check (weight >= 0),
  value_cp int not null default 0 check (value_cp >= 0),
  rarity text check (rarity in ('common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact')),
  requires_attunement boolean not null default false,
  bound boolean not null default false,
  quantity int not null default 1 check (quantity between 1 and 100000),
  owner_type text not null check (owner_type in ('character', 'party', 'world')),
  owner_id uuid,
  equipped boolean not null default false,
  attuned boolean not null default false,
  created_at timestamptz not null default now(),
  constraint items_owner_present check ((owner_type = 'world') = (owner_id is null)),
  constraint items_attuned_needs_attunement check (not attuned or requires_attunement),
  constraint items_worn_by_a_character check (owner_type = 'character' or not (equipped or attuned))
);
create index items_campaign_idx on public.items (campaign_id);
create index items_owner_idx on public.items (owner_type, owner_id);

create table public.item_secrets (
  item_id uuid primary key references public.items (entity_id) on delete cascade,
  dm_notes text not null default '' check (char_length(dm_notes) <= 4000),
  hidden_effect text not null default '' check (char_length(hidden_effect) <= 1000)
);

create table public.item_transfers (
  id uuid primary key default gen_random_uuid(),
  -- the order they happened in (several can share a created_at)
  seq bigint generated always as identity,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- set null when the item is deleted: the history stays
  item_id uuid references public.items (entity_id) on delete set null,
  item_name text not null,
  from_type text not null check (from_type in ('character', 'party', 'world')),
  from_id uuid,
  from_name text not null,
  to_type text not null check (to_type in ('character', 'party', 'world')),
  to_id uuid,
  to_name text not null,
  quantity int not null check (quantity >= 1),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index item_transfers_campaign_idx on public.item_transfers (campaign_id, seq desc);
create index item_transfers_from_idx on public.item_transfers (from_type, from_id);
create index item_transfers_to_idx on public.item_transfers (to_type, to_id);
-- one open offer per item at a time
create unique index item_transfers_one_pending_key on public.item_transfers (item_id) where status = 'pending';

-- HELPERS --------------------------------------------------------------------------

create function public.item_campaign(i uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select campaign_id from items where entity_id = i
$$;

-- What a player may read: items of their own characters, and their party's.
create function public.can_read_item(i uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from items
    where entity_id = i
      and (is_dm(campaign_id)
           or (owner_type = 'character' and owns_character(owner_id))
           or (owner_type = 'party' and is_member(campaign_id)))
  )
$$;

-- An entity name not yet used in the campaign: the name itself, or "name (2)", "name (3)" and so on.
create function public.free_entity_name(c uuid, base text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  candidate text := btrim(base);
  n int := 1;
begin
  while exists (select 1 from entities where campaign_id = c and lower(name) = lower(candidate)) loop
    n := n + 1;
    candidate := left(btrim(base), 112) || ' (' || n || ')';
  end loop;
  return candidate;
end $$;

-- A character's, party's or the world's name for the history.
create function public.owner_name(p_type text, p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case p_type
    when 'character' then coalesce((select name from characters where id = p_id), 'A character')
    when 'party' then coalesce((select name from entities where id = p_id), 'The Party')
    else 'The world'
  end
$$;

-- The campaign an owner belongs to; null for the world.
create function public.owner_campaign(p_type text, p_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case p_type
    when 'character' then character_campaign(p_id)
    when 'party' then party_campaign(p_id)
  end
$$;

create function public.body_armor(d jsonb) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(d -> 'armor' ->> 'category' in ('light', 'medium', 'heavy'), false)
$$;

create function public.is_shield(d jsonb) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(d -> 'armor' ->> 'category' = 'shield', false)
$$;

-- GUARDS -----------------------------------------------------------------------------

create function public.items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select type from entities where id = new.entity_id) is distinct from 'item'
     or entity_campaign(new.entity_id) is distinct from new.campaign_id then
    raise exception 'An item must be an item entity from its own campaign';
  end if;
  if new.owner_type <> 'world' and owner_campaign(new.owner_type, new.owner_id) is distinct from new.campaign_id then
    raise exception 'An item can only belong to a character or party from its own campaign';
  end if;
  if tg_op = 'UPDATE' then
    if new.campaign_id is distinct from old.campaign_id then
      raise exception 'An item keeps its campaign';
    end if;
    -- moves go through the functions below, which record them
    if (new.owner_type, new.owner_id) is distinct from (old.owner_type, old.owner_id) then
      if coalesce(current_setting('app.item_move', true), '') <> 'on' then
        raise exception 'Items move with offer_transfer or force_move_item, so every move is recorded';
      end if;
      new.equipped := false;
      new.attuned := false;
    end if;
  end if;
  if new.equipped and new.kind not in ('weapon', 'armor', 'shield', 'magic') then
    raise exception 'Only weapons, armour, shields and magic items can be equipped';
  end if;
  if new.equipped and body_armor(new.definition) and exists (
    select 1 from items where owner_type = 'character' and owner_id = new.owner_id and equipped
      and body_armor(definition) and entity_id <> new.entity_id
  ) then
    raise exception 'Only one suit of armour can be worn at a time: take the other off first';
  end if;
  if new.equipped and is_shield(new.definition) and exists (
    select 1 from items where owner_type = 'character' and owner_id = new.owner_id and equipped
      and is_shield(definition) and entity_id <> new.entity_id
  ) then
    raise exception 'Only one shield can be carried at a time: put the other down first';
  end if;
  if new.attuned and (select count(*) from items where owner_type = 'character' and owner_id = new.owner_id
                        and attuned and entity_id <> new.entity_id) >= 3 then
    raise exception 'A character can be attuned to no more than three items: end attunement to another first';
  end if;
  return new;
end $$;
create trigger items_guard_trg before insert or update on public.items
  for each row execute function public.items_guard();

-- A deleted character's or party's items go back to the world, with their history.
create function public.items_orphaned() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t text;
  o uuid;
begin
  if not exists (select 1 from campaigns where id = old.campaign_id) then
    return old;  -- the whole campaign is being deleted, items and all
  end if;
  if tg_table_name = 'characters' then
    t := 'character';
    o := old.id;
  else
    t := 'party';
    o := old.entity_id;
  end if;
  perform set_config('app.item_move', 'on', true);
  update items set owner_type = 'world', owner_id = null where owner_type = t and owner_id = o;
  perform set_config('app.item_move', '', true);
  update item_transfers set status = 'cancelled', resolved_at = now()
   where status = 'pending' and ((from_type = t and from_id = o) or (to_type = t and to_id = o));
  return old;
end $$;
create trigger characters_items_orphaned_trg before delete on public.characters
  for each row execute function public.items_orphaned();
create trigger parties_items_orphaned_trg before delete on public.parties
  for each row execute function public.items_orphaned();

-- ROW LEVEL SECURITY --------------------------------------------------------------------

alter table public.items enable row level security;
alter table public.item_secrets enable row level security;
alter table public.item_transfers enable row level security;

create policy "read items" on public.items for select to authenticated
  using (is_dm(campaign_id)
         or (owner_type = 'character' and owns_character(owner_id))
         or (owner_type = 'party' and is_member(campaign_id)));
-- the DM edits an item's rules directly (owner changes still need the functions); items are created by create_item
create policy "dm edits items" on public.items for update to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));
create policy "dm deletes items" on public.items for delete to authenticated
  using (is_dm(campaign_id));
revoke insert on public.items from anon, authenticated;

create policy "dm only item secrets" on public.item_secrets for all to authenticated
  using (is_dm(item_campaign(item_id))) with check (is_dm(item_campaign(item_id)));

create policy "read item transfers" on public.item_transfers for select to authenticated
  using (is_dm(campaign_id)
         or (from_type = 'character' and owns_character(from_id))
         or (to_type = 'character' and owns_character(to_id)));
revoke insert, update, delete on public.item_transfers from anon, authenticated;

-- A player reads the entity of an item they can read (its name), even while the entity is hidden in the Codex.
create policy "read entities of readable items" on public.entities for select to authenticated
  using (type = 'item' and can_read_item(id));

-- FUNCTIONS -------------------------------------------------------------------------------

-- DM only: a new item, from an SRD clone or from scratch, placed with a character, the party or the world.
create function public.create_item(
  p_campaign uuid, p_name text, p_kind text, p_definition jsonb, p_owner_type text, p_owner_id uuid,
  p_quantity int default 1, p_weight numeric default null, p_value_cp int default 0, p_rarity text default null,
  p_requires_attunement boolean default false, p_bound boolean default false, p_srd_ref text default null
) returns public.items
language plpgsql security definer set search_path = public as $$
declare
  e uuid;
  result items;
begin
  perform require_dm(p_campaign);
  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'Give the item a name' using errcode = '22023';
  end if;
  insert into entities (campaign_id, type, name) values (p_campaign, 'item', free_entity_name(p_campaign, p_name))
  returning id into e;
  insert into items (entity_id, campaign_id, srd_ref, kind, definition, weight, value_cp, rarity,
                     requires_attunement, bound, quantity, owner_type, owner_id)
  values (e, p_campaign, p_srd_ref, p_kind, coalesce(p_definition, '{}'), p_weight, coalesce(p_value_cp, 0),
          p_rarity, coalesce(p_requires_attunement, false), coalesce(p_bound, false), coalesce(p_quantity, 1),
          p_owner_type, case when p_owner_type = 'world' then null else p_owner_id end)
  returning * into result;
  if p_owner_type <> 'world' then
    insert into item_transfers (campaign_id, item_id, item_name, from_type, from_id, from_name, to_type, to_id,
                                to_name, quantity, status, resolved_at)
    values (p_campaign, e, (select name from entities where id = e), 'world', null, 'Found',
            p_owner_type, p_owner_id, owner_name(p_owner_type, p_owner_id), result.quantity, 'accepted', now());
  end if;
  return result;
end $$;

-- Moves p_quantity of an item to a new owner, splitting the stack when it is not all of it. Returns the id of
-- the item the new owner now has. Internal: the callers check who may do this and record the history.
create function public.move_item(p_item uuid, p_to_type text, p_to_id uuid, p_quantity int) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  it items;
  e entities;
  new_id uuid;
begin
  select * into it from items where entity_id = p_item for update;
  if p_quantity is null or p_quantity < 1 or p_quantity > it.quantity then
    raise exception 'Give between 1 and % of these', it.quantity using errcode = '22023';
  end if;
  perform set_config('app.item_move', 'on', true);
  if p_quantity = it.quantity then
    update items set owner_type = p_to_type, owner_id = case when p_to_type = 'world' then null else p_to_id end
     where entity_id = p_item;
    new_id := p_item;
  else
    update items set quantity = quantity - p_quantity where entity_id = p_item;
    select * into e from entities where id = p_item;
    insert into entities (campaign_id, type, name, folder_id, visible_to_players)
    values (e.campaign_id, 'item', free_entity_name(e.campaign_id, e.name), e.folder_id, e.visible_to_players)
    returning id into new_id;
    insert into items (entity_id, campaign_id, srd_ref, kind, definition, weight, value_cp, rarity,
                       requires_attunement, bound, quantity, owner_type, owner_id)
    values (new_id, it.campaign_id, it.srd_ref, it.kind, it.definition, it.weight, it.value_cp, it.rarity,
            it.requires_attunement, it.bound, p_quantity, p_to_type,
            case when p_to_type = 'world' then null else p_to_id end);
    insert into item_secrets (item_id, dm_notes, hidden_effect)
    select new_id, dm_notes, hidden_effect from item_secrets where item_id = p_item;
  end if;
  perform set_config('app.item_move', '', true);
  return new_id;
end $$;

-- The owner of a character's item (or the DM) offers some or all of it to another character. Nothing moves yet.
create function public.offer_transfer(p_item uuid, p_to_character uuid, p_quantity int default null)
returns public.item_transfers
language plpgsql security definer set search_path = public as $$
declare
  it items;
  q int;
  result item_transfers;
begin
  select * into it from items where entity_id = p_item;
  if it.entity_id is null or it.owner_type <> 'character'
     or not (owns_character(it.owner_id) or is_dm(it.campaign_id)) then
    raise exception 'You can only give items your own character carries' using errcode = '42501';
  end if;
  if it.bound then
    raise exception 'This item is bound: it cannot be given' using errcode = '22023';
  end if;
  if character_campaign(p_to_character) is distinct from it.campaign_id or p_to_character = it.owner_id then
    raise exception 'Give it to another character in this campaign' using errcode = '22023';
  end if;
  q := coalesce(p_quantity, it.quantity);
  if q < 1 or q > it.quantity then
    raise exception 'Give between 1 and % of these', it.quantity using errcode = '22023';
  end if;
  if exists (select 1 from item_transfers where item_id = p_item and status = 'pending') then
    raise exception 'This item has already been offered: cancel that offer first' using errcode = '22023';
  end if;
  insert into item_transfers (campaign_id, item_id, item_name, from_type, from_id, from_name, to_type, to_id,
                              to_name, quantity)
  values (it.campaign_id, p_item, (select name from entities where id = p_item), 'character', it.owner_id,
          owner_name('character', it.owner_id), 'character', p_to_character,
          owner_name('character', p_to_character), q)
  returning * into result;
  return result;
end $$;

-- The recipient's owner (or the DM) accepts: the item moves now. Returns the item the recipient now has.
create function public.accept_transfer(p_transfer uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t item_transfers;
  it items;
  moved uuid;
begin
  select * into t from item_transfers where id = p_transfer for update;
  if t.id is null or not (owns_character(t.to_id) or is_dm(t.campaign_id)) then
    raise exception 'Only the recipient can accept this' using errcode = '42501';
  end if;
  if t.status <> 'pending' then
    raise exception 'This offer is no longer open' using errcode = '22023';
  end if;
  select * into it from items where entity_id = t.item_id;
  if it.entity_id is null or it.owner_type <> t.from_type or it.owner_id is distinct from t.from_id
     or it.quantity < t.quantity or it.bound then
    raise exception 'The item has changed since it was offered: ask for it again' using errcode = '22023';
  end if;
  moved := move_item(t.item_id, 'character', t.to_id, t.quantity);
  update item_transfers set status = 'accepted', resolved_at = now() where id = p_transfer;
  return moved;
end $$;

create function public.decline_transfer(p_transfer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t item_transfers;
begin
  select * into t from item_transfers where id = p_transfer for update;
  if t.id is null or not (owns_character(t.to_id) or is_dm(t.campaign_id)) then
    raise exception 'Only the recipient can decline this' using errcode = '42501';
  end if;
  if t.status <> 'pending' then
    raise exception 'This offer is no longer open' using errcode = '22023';
  end if;
  update item_transfers set status = 'declined', resolved_at = now() where id = p_transfer;
end $$;

create function public.cancel_transfer(p_transfer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t item_transfers;
begin
  select * into t from item_transfers where id = p_transfer for update;
  if t.id is null or not (owns_character(t.from_id) or is_dm(t.campaign_id)) then
    raise exception 'Only the giver can cancel this' using errcode = '42501';
  end if;
  if t.status <> 'pending' then
    raise exception 'This offer is no longer open' using errcode = '22023';
  end if;
  update item_transfers set status = 'cancelled', resolved_at = now() where id = p_transfer;
end $$;

-- DM only: moves an item (or part of a stack) at once, bound or not. Open offers for it are cancelled.
create function public.force_move_item(p_item uuid, p_to_type text, p_to_id uuid, p_quantity int default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  it items;
  moved uuid;
begin
  select * into it from items where entity_id = p_item;
  perform require_dm(it.campaign_id);
  if p_to_type not in ('character', 'party', 'world') then
    raise exception 'Move it to a character, the party or the world' using errcode = '22023';
  end if;
  update item_transfers set status = 'cancelled', resolved_at = now() where item_id = p_item and status = 'pending';
  moved := move_item(p_item, p_to_type, p_to_id, coalesce(p_quantity, it.quantity));
  insert into item_transfers (campaign_id, item_id, item_name, from_type, from_id, from_name, to_type, to_id,
                              to_name, quantity, status, resolved_at)
  values (it.campaign_id, moved, (select name from entities where id = moved), it.owner_type, it.owner_id,
          owner_name(it.owner_type, it.owner_id), p_to_type, case when p_to_type = 'world' then null else p_to_id end,
          owner_name(p_to_type, p_to_id), coalesce(p_quantity, it.quantity), 'accepted', now());
  return moved;
end $$;

-- The character's owner (or the DM) equips, unequips, attunes or ends attunement. The guard keeps the limits.
create function public.set_item_worn(p_item uuid, p_field text, p_value boolean) returns public.items
language plpgsql security definer set search_path = public as $$
declare
  it items;
  result items;
begin
  select * into it from items where entity_id = p_item;
  if it.entity_id is null or it.owner_type <> 'character'
     or not (owns_character(it.owner_id) or is_dm(it.campaign_id)) then
    raise exception 'You can only equip or attune items your own character carries' using errcode = '42501';
  end if;
  if p_field = 'equipped' then
    update items set equipped = p_value where entity_id = p_item returning * into result;
  else
    if p_value and not it.requires_attunement then
      raise exception 'This item does not need attunement' using errcode = '22023';
    end if;
    update items set attuned = p_value where entity_id = p_item returning * into result;
  end if;
  return result;
end $$;

create function public.equip_item(p_item uuid) returns public.items
language sql security definer set search_path = public as $$ select set_item_worn(p_item, 'equipped', true) $$;
create function public.unequip_item(p_item uuid) returns public.items
language sql security definer set search_path = public as $$ select set_item_worn(p_item, 'equipped', false) $$;
create function public.attune_item(p_item uuid) returns public.items
language sql security definer set search_path = public as $$ select set_item_worn(p_item, 'attuned', true) $$;
create function public.unattune_item(p_item uuid) returns public.items
language sql security definer set search_path = public as $$ select set_item_worn(p_item, 'attuned', false) $$;

-- Who is in the official Party, with what a Give dialog needs to say who can use an item: names, ability scores
-- and the effects that change them. For members of the campaign; the DM sees the same.
create function public.party_roster(p_campaign uuid) returns table (
  character_id uuid, name text, ability_scores jsonb, effects jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_campaign) then
    raise exception 'Only members of this campaign can see its party' using errcode = '42501';
  end if;
  return query
    select c.id, c.name, coalesce(c.sheet -> 'abilityScores', '{}'::jsonb),
           coalesce((select jsonb_agg(jsonb_build_object('id', ef.id, 'name', ef.name, 'source', ef.source,
                                                         'stat', ef.stat, 'mode', ef.mode, 'value', ef.value,
                                                         'duration', ef.duration))
                     from effects ef
                     where ef.character_id = c.id and ef.stat in ('str', 'dex', 'con', 'int', 'wis', 'cha')),
                    '[]'::jsonb)
    from party_members pm join characters c on c.id = pm.character_id
    where pm.party_id = official_party(p_campaign)
    order by c.name;
end $$;

-- EXISTING CHARACTERS: their Phase 1 armour, shield and weapons become equipped items ----------------------

do $$
declare
  ch record;
  w jsonb;
  srd jsonb;
  e uuid;
  armor_name text;
  base_name text;
  def jsonb;
begin
  -- oldest first, so the first character keeps the plain names ("Chain Mail", then "Chain Mail (2)")
  for ch in select id, campaign_id, sheet from characters order by created_at, id loop
    -- body armour
    if jsonb_typeof(ch.sheet -> 'armor') = 'object' then
      armor_name := coalesce(ch.sheet -> 'armor' ->> 'name', 'Armour');
      select data into srd from srd_armor where lower(name) = lower(armor_name);
      insert into entities (campaign_id, type, name) values (ch.campaign_id, 'item', free_entity_name(ch.campaign_id, armor_name))
      returning id into e;
      insert into items (entity_id, campaign_id, srd_ref, kind, definition, weight, owner_type, owner_id, equipped)
      values (e, ch.campaign_id, srd ->> 'id', 'armor',
              jsonb_build_object('armor', jsonb_build_object(
                'category', case when ch.sheet -> 'armor' -> 'dexCap' = 'null'::jsonb then 'light'
                                 when (ch.sheet -> 'armor' ->> 'dexCap')::int = 2 then 'medium' else 'heavy' end,
                'baseAc', (ch.sheet -> 'armor' ->> 'base')::int,
                'strength', ch.sheet -> 'armor' -> 'strReq',
                'stealthDisadvantage', coalesce((srd ->> 'stealthDisadvantage')::boolean, false))),
              (srd ->> 'weightLb')::numeric, 'character', ch.id, true);
    end if;
    -- shield
    if (ch.sheet ->> 'shield')::boolean then
      select data into srd from srd_armor where id = 'shield';
      insert into entities (campaign_id, type, name) values (ch.campaign_id, 'item', free_entity_name(ch.campaign_id, 'Shield'))
      returning id into e;
      insert into items (entity_id, campaign_id, srd_ref, kind, definition, weight, owner_type, owner_id, equipped)
      values (e, ch.campaign_id, 'shield', 'shield',
              '{"armor": {"category": "shield", "baseAc": 2, "strength": null, "stealthDisadvantage": false}}',
              coalesce((srd ->> 'weightLb')::numeric, 6), 'character', ch.id, true);
    end if;
    -- weapons: the SRD weapon of the same name (without "+1") gives category, kind and properties
    for w in select * from jsonb_array_elements(case when jsonb_typeof(ch.sheet -> 'weapons') = 'array'
                                                     then ch.sheet -> 'weapons' else '[]' end) loop
      base_name := regexp_replace(coalesce(w ->> 'name', 'Weapon'), '\s*\+\d+$', '');
      select data into srd from srd_weapons where lower(name) = lower(base_name);
      def := jsonb_build_object('weapon', jsonb_strip_nulls(jsonb_build_object(
        'category', coalesce(srd ->> 'category', 'martial'),
        'kind', coalesce(srd ->> 'kind', case when w ->> 'ability' = 'dex' then 'ranged' else 'melee' end),
        'damage', jsonb_build_object('dice', coalesce(w ->> 'damage', '1d4'), 'type', coalesce(w ->> 'damageType', 'bludgeoning')),
        'properties', coalesce(srd -> 'properties', case when w ->> 'ability' = 'finesse' then '["finesse"]'::jsonb else '[]'::jsonb end),
        'versatileDice', srd -> 'versatileDice',
        'range', srd -> 'range',
        'ammunition', srd -> 'ammunition',
        'mastery', lower(coalesce(w ->> 'mastery', srd ->> 'mastery', 'sap'))
      )));
      if coalesce((w ->> 'magicBonus')::int, 0) <> 0 then
        def := def || jsonb_build_object('magicBonus', (w ->> 'magicBonus')::int);
      end if;
      if jsonb_typeof(w -> 'requirements') = 'array' and jsonb_array_length(w -> 'requirements') > 0 then
        def := def || jsonb_build_object('requirements', w -> 'requirements');
      end if;
      insert into entities (campaign_id, type, name)
      values (ch.campaign_id, 'item', free_entity_name(ch.campaign_id, coalesce(w ->> 'name', 'Weapon')))
      returning id into e;
      insert into items (entity_id, campaign_id, srd_ref, kind, definition, weight, owner_type, owner_id, equipped)
      values (e, ch.campaign_id, srd ->> 'id', case when def ? 'magicBonus' or def ? 'requirements' then 'magic' else 'weapon' end,
              def, (srd ->> 'weightLb')::numeric, 'character', ch.id, true);
    end loop;
  end loop;
end $$;

-- FUNCTION PRIVILEGES -----------------------------------------------------------------------

revoke execute on function
  public.item_campaign(uuid), public.can_read_item(uuid), public.free_entity_name(uuid, text),
  public.owner_name(text, uuid), public.owner_campaign(text, uuid), public.body_armor(jsonb), public.is_shield(jsonb),
  public.items_guard(), public.items_orphaned(),
  public.create_item(uuid, text, text, jsonb, text, uuid, int, numeric, int, text, boolean, boolean, text),
  public.move_item(uuid, text, uuid, int), public.offer_transfer(uuid, uuid, int), public.accept_transfer(uuid),
  public.decline_transfer(uuid), public.cancel_transfer(uuid), public.force_move_item(uuid, text, uuid, int),
  public.set_item_worn(uuid, text, boolean), public.equip_item(uuid), public.unequip_item(uuid),
  public.attune_item(uuid), public.unattune_item(uuid), public.party_roster(uuid)
from public, anon, authenticated;

grant execute on function
  public.item_campaign(uuid), public.can_read_item(uuid),
  public.create_item(uuid, text, text, jsonb, text, uuid, int, numeric, int, text, boolean, boolean, text),
  public.offer_transfer(uuid, uuid, int), public.accept_transfer(uuid), public.decline_transfer(uuid),
  public.cancel_transfer(uuid), public.force_move_item(uuid, text, uuid, int),
  public.equip_item(uuid), public.unequip_item(uuid), public.attune_item(uuid), public.unattune_item(uuid),
  public.party_roster(uuid)
to authenticated;
