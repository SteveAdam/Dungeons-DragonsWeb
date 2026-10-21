-- =====================================================================
-- 0005 (ticket P1-7): characters, their effects, and DM-only effect details.
--
-- Players read only their own characters and effects; DMs read everything in their campaigns. The owner edits
-- their own sheet, but only a DM changes XP (levels come from XP, so this is what stops a player levelling
-- themself). Effects are applied by the DM. A character's owner must be a member of its campaign.
-- Also: rolls can now name a character (the roller's own, or any for a DM), replacing the Phase 1 stopgap in
-- 0004 where only a DM could pass a character.
-- =====================================================================

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- the sheet (see CharacterSheet in packages/rules-engine), validated by the app before it is saved
  sheet jsonb not null default '{}' check (jsonb_typeof(sheet) = 'object'),
  xp int not null default 0 check (xp >= 0),
  created_at timestamptz not null default now()
);
create index characters_campaign_idx on public.characters (campaign_id);
create index characters_owner_idx on public.characters (owner_id);

create table public.effects (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  source text not null default '' check (char_length(source) <= 120),
  stat text not null check (stat in ('str', 'dex', 'con', 'int', 'wis', 'cha', 'speed', 'ac')),
  mode text not null check (mode in ('add', 'set', 'set_at_least')),
  value int not null check (value between -100 and 100),
  -- {"kind":"rounds","remaining":n} | {"kind":"until","atSeconds":n} | {"kind":"rest","rest":"short"|"long"} | {"kind":"permanent"}
  duration jsonb not null default '{"kind":"permanent"}'
    check (duration ->> 'kind' in ('rounds', 'until', 'rest', 'permanent')),
  concentration boolean not null default false,
  created_at timestamptz not null default now()
);
create index effects_character_idx on public.effects (character_id);

-- What the DM knows about an effect and the player does not (a cursed potion, a hidden drawback).
create table public.effect_secrets (
  effect_id uuid primary key references public.effects (id) on delete cascade,
  hidden_detail text not null default ''
);

-- HELPERS (security definer, so policies can look a character up without tripping over its own policy) -----

create function public.character_campaign(c uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select campaign_id from characters where id = c
$$;

create function public.owns_character(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from characters where id = c and owner_id = auth.uid())
$$;

-- TRIGGERS -------------------------------------------------------------

-- The owner must be a member; owner and campaign never change; only a DM sets XP.
-- auth.uid() is null only for the database owner and the service role (seeding, admin work), which may set XP.
create function public.characters_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.owner_id is distinct from old.owner_id or new.campaign_id is distinct from old.campaign_id) then
    raise exception 'A character keeps its owner and its campaign';
  end if;
  if not exists (select 1 from members where campaign_id = new.campaign_id and user_id = new.owner_id) then
    raise exception 'A character''s owner must be a member of its campaign';
  end if;
  if auth.uid() is not null and not is_dm(new.campaign_id)
     and ((tg_op = 'INSERT' and new.xp <> 0) or (tg_op = 'UPDATE' and new.xp is distinct from old.xp)) then
    raise exception 'Only the DM can change XP';
  end if;
  return new;
end $$;
create trigger characters_guard_trg before insert or update on public.characters
  for each row execute function public.characters_guard();

-- ROW LEVEL SECURITY ---------------------------------------------------

alter table public.characters enable row level security;
alter table public.effects enable row level security;
alter table public.effect_secrets enable row level security;

create policy "read characters" on public.characters for select to authenticated
  using (is_dm(campaign_id) or (owner_id = auth.uid() and is_member(campaign_id)));
create policy "members create their own characters" on public.characters for insert to authenticated
  with check (is_member(campaign_id) and (owner_id = auth.uid() or is_dm(campaign_id)));
create policy "owners and DMs edit characters" on public.characters for update to authenticated
  using (owner_id = auth.uid() or is_dm(campaign_id))
  with check (owner_id = auth.uid() or is_dm(campaign_id));
create policy "owners and DMs delete characters" on public.characters for delete to authenticated
  using (owner_id = auth.uid() or is_dm(campaign_id));

create policy "read effects" on public.effects for select to authenticated
  using (is_dm(character_campaign(character_id)) or owns_character(character_id));
create policy "dm writes effects" on public.effects for all to authenticated
  using (is_dm(character_campaign(character_id))) with check (is_dm(character_campaign(character_id)));

create policy "dm only effect secrets" on public.effect_secrets for all to authenticated
  using (is_dm(character_campaign((select character_id from effects where id = effect_id))))
  with check (is_dm(character_campaign((select character_id from effects where id = effect_id))));

-- ROLLS NOW NAME CHARACTERS -------------------------------------------

alter table public.rolls
  add constraint rolls_character_fk foreign key (character_id) references public.characters (id) on delete set null;

-- The log stays append-only, with one narrow exception: when a character is deleted, its rolls keep everything
-- but lose the link to it (the foreign key above sets character_id to null, which is an update).
create or replace function public.rolls_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from campaigns where id = old.campaign_id) then
    return old;
  end if;
  if tg_op = 'UPDATE' and old.character_id is not null and new.character_id is null
     and to_jsonb(new) - 'character_id' = to_jsonb(old) - 'character_id'
     and not exists (select 1 from characters where id = old.character_id) then
    return new;
  end if;
  raise exception 'The roll log is append-only: rolls cannot be changed or deleted';
end $$;

create or replace function public.roll_d20(
  p_campaign uuid, p_character uuid, p_kind text, p_label text, p_bonus int, p_target int, p_mode text,
  p_hidden boolean default false
) returns public.rolls
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  dice int[];
  o record;
  result public.rolls;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not is_member(p_campaign) then
    raise exception 'Only members of this campaign can roll here' using errcode = '42501';
  end if;
  if coalesce(p_hidden, false) and not is_dm(p_campaign) then
    raise exception 'Only the DM can make a hidden roll' using errcode = '42501';
  end if;
  -- a character must be in this campaign, and be yours unless you are the DM
  if p_character is not null and not exists (
    select 1 from characters
    where id = p_character and campaign_id = p_campaign and (owner_id = me or is_dm(p_campaign))
  ) then
    raise exception 'You can only roll for your own character' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('normal', 'advantage', 'disadvantage') then
    raise exception 'The roll mode must be normal, advantage or disadvantage' using errcode = '22023';
  end if;
  if (select count(*) from rolls where rolled_by = me and created_at > now() - interval '60 seconds') >= 30 then
    raise exception 'Too many rolls in the last minute. Wait a moment and roll again.' using errcode = 'PT429';
  end if;

  dice := case when p_mode = 'normal' then array[d20()] else array[d20(), d20()] end;
  o := roll_outcome(p_kind, p_mode, dice, p_bonus, p_target);

  insert into rolls (campaign_id, character_id, rolled_by, kind, label, bonus, target, mode, dice, kept, total,
                     success, crit, fumble, hidden)
  values (p_campaign, p_character, me, p_kind, p_label, p_bonus, p_target, p_mode, dice, o.kept, o.total,
          o.success, o.crit, o.fumble, coalesce(p_hidden, false))
  returning * into result;
  return result;
end $$;

-- FUNCTION PRIVILEGES --------------------------------------------------

revoke execute on function public.character_campaign(uuid), public.owns_character(uuid) from public, anon;
grant execute on function public.character_campaign(uuid), public.owns_character(uuid) to authenticated;
revoke execute on function public.characters_guard() from public, anon, authenticated;
