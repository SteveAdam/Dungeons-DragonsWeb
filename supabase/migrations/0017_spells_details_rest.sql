-- =====================================================================
-- 0017 (ticket P2-11): the Spells tab, the Details tab and the simple long rest.
--
--   * character_spell_state: spent spell slots, the spell being concentrated on, and whether prepared spells may
--     change now. Nobody writes it directly: cast_spell, break_concentration, set_prepared_spells and the rest do.
--   * spell_casts and rest_events are logs, append-only like the roll log.
--   * cast_spell spends the lowest slot asked for (none for a cantrip or a ritual), refuses one that is not there,
--     and starts concentration when the spell needs it, ending any earlier one.
--   * set_prepared_spells changes sheet.spells.prepared within the class's limit, from the class list (a Wizard's
--     from the spellbook) and only at spell levels the character has slots for. With the campaign's
--     prepareAfterRestOnly setting (on unless set false), the list can change only between a long rest (or the
--     character's creation) and the next spell cast with a slot.
--   * character_details holds the Details tab, which the owner edits (the sheet itself stays the DM's and the
--     server functions'); it starts from what the creation wizard put in the sheet.
--   * simple_long_rest (DM only, one character or the whole Party) does what the SRD 5.2.1's Long Rest gives:
--     all hit points and all spent Hit Point Dice back, Exhaustion down by 1, every spell slot back, concentration
--     ends, and effects that last until a rest end. (The 2014 rule gave back only half the Hit Point Dice; 5.2.1
--     gives back all of them.)
-- =====================================================================

-- THE SHEET MAY BE WRITTEN BY THESE FUNCTIONS -------------------------------------------

-- Same as 0012, plus one way through: the functions below set app.sheet_write while they change a player's sheet.
create or replace function public.characters_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  by_player boolean := auth.uid() is not null and not is_dm(new.campaign_id);
begin
  if tg_op = 'UPDATE' and (new.owner_id is distinct from old.owner_id or new.campaign_id is distinct from old.campaign_id) then
    raise exception 'A character keeps its owner and its campaign';
  end if;
  if not exists (select 1 from members where campaign_id = new.campaign_id and user_id = new.owner_id) then
    raise exception 'A character''s owner must be a member of its campaign';
  end if;
  if by_player and ((tg_op = 'INSERT' and new.xp <> 0) or (tg_op = 'UPDATE' and new.xp is distinct from old.xp)) then
    raise exception 'Only the DM can change XP';
  end if;
  if by_player and ((tg_op = 'INSERT' and new.level_applied <> 1)
                    or (tg_op = 'UPDATE' and new.level_applied is distinct from old.level_applied)) then
    raise exception 'Only the DM can change the applied level';
  end if;
  if by_player and tg_op = 'UPDATE' and coalesce(current_setting('app.sheet_write', true), '') <> 'on' and (
    new.sheet is distinct from old.sheet
    or new.conditions is distinct from old.conditions
    or new.exhaustion is distinct from old.exhaustion
  ) then
    raise exception 'Only the DM can change a character sheet';
  end if;
  return new;
end $$;

-- CASTERS RECORD THEIR SPELLCASTING ABILITY -----------------------------------------------

-- characters made before this know their class only by name; the class table says the ability
update public.characters c
   set sheet = c.sheet || jsonb_build_object('spellcastingAbility', k.data -> 'spellcasting' ->> 'ability')
  from public.srd_classes k
 where k.name = c.sheet ->> 'className' and k.data ? 'spellcasting' and not c.sheet ? 'spellcastingAbility';

-- SPELL STATE ------------------------------------------------------------------------------

create table public.character_spell_state (
  character_id uuid primary key references public.characters (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- spent slots by spell level, index 1 is level 1
  slots_used int[] not null default array_fill(0, array[9])
    check (cardinality(slots_used) = 9 and 0 <= all (slots_used)),
  -- { "spell": "Blur", "slotLevel": 2, "sinceSeconds": 3600 } or null
  concentration jsonb check (concentration is null or jsonb_typeof(concentration) = 'object'),
  prepare_open boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.character_spell_state enable row level security;
create policy "read spell state" on public.character_spell_state for select to authenticated
  using (is_dm(campaign_id) or owns_character(character_id));
revoke insert, update, delete on public.character_spell_state from anon, authenticated;

create table public.spell_casts (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  character_id uuid not null,
  spell text not null,
  spell_level int not null check (spell_level between 0 and 9),
  -- null for a cantrip or a ritual
  slot_level int check (slot_level between 1 and 9),
  ritual boolean not null default false,
  concentration boolean not null default false,
  -- the spell whose concentration this cast ended, if any
  ended_concentration text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index spell_casts_character_idx on public.spell_casts (character_id, seq desc);

create table public.rest_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  character_id uuid not null,
  kind text not null check (kind in ('long')),
  -- what the rest restored, for the record
  details jsonb not null default '{}',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index rest_events_character_idx on public.rest_events (character_id, created_at desc);

-- both logs are append-only for every role; rows go only with their campaign
create function public.log_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from campaigns where id = old.campaign_id) then
    return old;
  end if;
  raise exception 'This log is append-only: entries cannot be changed or deleted';
end $$;
create trigger spell_casts_append_only_trg before update or delete on public.spell_casts
  for each row execute function public.log_append_only();
create trigger rest_events_append_only_trg before update or delete on public.rest_events
  for each row execute function public.log_append_only();

alter table public.spell_casts enable row level security;
alter table public.rest_events enable row level security;
create policy "read spell casts" on public.spell_casts for select to authenticated
  using (is_dm(campaign_id) or owns_character(character_id));
create policy "read rests" on public.rest_events for select to authenticated
  using (is_dm(campaign_id) or owns_character(character_id));
revoke insert, update, delete on public.spell_casts, public.rest_events from anon, authenticated;

-- DETAILS ------------------------------------------------------------------------------------

-- Every field is text with its own limit; the symbol is one of the app's built-in icons.
create function public.details_ok(d jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(d) = 'object'
    and not exists (
      select 1 from jsonb_each(d) e
      left join (values ('age', 40), ('height', 40), ('weight', 40), ('eyes', 40), ('skin', 40), ('hair', 40),
                        ('alignment', 40), ('languages', 500), ('personalityTraits', 1000), ('ideals', 1000),
                        ('bonds', 1000), ('flaws', 1000), ('appearance', 4000), ('backstory', 8000),
                        ('allies', 4000), ('treasure', 4000), ('symbol', 40)) l (key, max) on l.key = e.key
      where l.key is null or jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > l.max
    )
    and coalesce(d ->> 'symbol', 'shield') in ('shield', 'sword', 'crown', 'skull', 'flame', 'moon', 'sun', 'star',
                                                'feather', 'leaf', 'anchor', 'book', 'gem', 'key', 'mountain', 'paw')
$$;

create table public.character_details (
  character_id uuid primary key references public.characters (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  data jsonb not null default '{}' check (details_ok(data)),
  updated_at timestamptz not null default now()
);
alter table public.character_details enable row level security;
create policy "owners and DMs read details" on public.character_details for select to authenticated
  using (is_dm(campaign_id) or owns_character(character_id));
create policy "owners and DMs write details" on public.character_details for insert to authenticated
  with check ((is_dm(campaign_id) or owns_character(character_id)) and character_campaign(character_id) = campaign_id);
create policy "owners and DMs update details" on public.character_details for update to authenticated
  using (is_dm(campaign_id) or owns_character(character_id))
  with check (is_dm(campaign_id) or owns_character(character_id));

-- what the wizard recorded in the sheet starts the Details tab, for new characters and those already made
create function public.details_from_sheet(s jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'alignment', left(s ->> 'alignment', 40),
    'personalityTraits', left(s -> 'details' ->> 'personalityTraits', 1000),
    'ideals', left(s -> 'details' ->> 'ideals', 1000),
    'bonds', left(s -> 'details' ->> 'bonds', 1000),
    'flaws', left(s -> 'details' ->> 'flaws', 1000),
    'appearance', left(s -> 'details' ->> 'appearance', 4000),
    'backstory', left(s -> 'details' ->> 'backstory', 8000)))
$$;

create function public.characters_seed_details() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into character_details (character_id, campaign_id, data)
  values (new.id, new.campaign_id, details_from_sheet(new.sheet))
  on conflict do nothing;
  return new;
end $$;
create trigger characters_seed_details_trg after insert on public.characters
  for each row execute function public.characters_seed_details();

insert into public.character_details (character_id, campaign_id, data)
select id, campaign_id, details_from_sheet(sheet) from public.characters
on conflict do nothing;

-- RULES FROM THE CLASS TABLE -----------------------------------------------------------------

-- Spell slots by level (index 1 is level 1) for a class at a level, from its table (Pact Magic included).
create function public.class_slots(p_class text, p_level int) returns int[]
language plpgsql stable security definer set search_path = public as $$
declare
  cols jsonb;
  out int[] := array_fill(0, array[9]);
  n int;
begin
  select l -> 'columns' into cols
    from srd_classes k, jsonb_array_elements(k.data -> 'levels') l
   where k.name = p_class and (l ->> 'level')::int = p_level;
  if cols is null then
    return out;
  end if;
  if cols ? 'slotLevel' then
    if jsonb_typeof(cols -> 'slotLevel') = 'number' and jsonb_typeof(cols -> 'spellSlots') = 'number' then
      out[(cols ->> 'slotLevel')::int] := (cols ->> 'spellSlots')::int;
    end if;
    return out;
  end if;
  for n in 1..9 loop
    if jsonb_typeof(cols -> ('slots' || n)) = 'number' then
      out[n] := (cols ->> ('slots' || n))::int;
    end if;
  end loop;
  return out;
end $$;

-- The highest spell level a class has slots for at a level (0 for none).
create function public.max_spell_level(p_class text, p_level int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(max(n), 0) from generate_subscripts(class_slots(p_class, p_level), 1) n
   where (class_slots(p_class, p_level))[n] > 0
$$;

-- The spell state row, made the first time it is needed.
create function public.spell_state_for(p_character uuid) returns public.character_spell_state
language plpgsql security definer set search_path = public as $$
declare s character_spell_state;
begin
  insert into character_spell_state (character_id, campaign_id)
  values (p_character, character_campaign(p_character))
  on conflict (character_id) do nothing;
  select * into s from character_spell_state where character_id = p_character for update;
  return s;
end $$;

-- The caller may act for this character: its owner, or the campaign's DM.
create function public.require_owner_or_dm(p_character uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_character is null or character_campaign(p_character) is null
     or not (owns_character(p_character) or is_dm(character_campaign(p_character))) then
    raise exception 'You can only do that for your own character' using errcode = '42501';
  end if;
end $$;

-- FUNCTIONS -------------------------------------------------------------------------------

-- Casts a spell the character knows: a cantrip, a prepared spell, or (as a ritual) a prepared ritual spell or, for
-- a Wizard, a ritual spell in the spellbook. A levelled spell needs a slot of its level or higher, unless cast as a
-- ritual. A concentration spell ends the concentration before it.
create function public.cast_spell(
  p_character uuid, p_spell text, p_slot_level int default null, p_ritual boolean default false
) returns public.character_spell_state
language plpgsql security definer set search_path = public as $$
declare
  ch characters;
  sp jsonb;
  lvl int;
  slots int[];
  st character_spell_state;
  conc boolean;
  ended text;
  known jsonb;
begin
  perform require_owner_or_dm(p_character);
  select * into ch from characters where id = p_character;
  select data into sp from srd_spells where name = p_spell;
  if sp is null then
    raise exception 'There is no SRD spell called %', p_spell using errcode = '22023';
  end if;
  lvl := (sp ->> 'level')::int;
  conc := coalesce((sp ->> 'concentration')::boolean, false);
  known := coalesce(ch.sheet -> 'spells', '{}');
  if lvl = 0 then
    if not coalesce(known -> 'cantrips' ? p_spell, false) then
      raise exception '% is not one of your cantrips', p_spell using errcode = '22023';
    end if;
  elsif coalesce(p_ritual, false) then
    if not coalesce((sp ->> 'ritual')::boolean, false) then
      raise exception '% is not a ritual', p_spell using errcode = '22023';
    end if;
    if not (coalesce(known -> 'prepared' ? p_spell, false) or coalesce(known -> 'spellbook' ? p_spell, false)) then
      raise exception 'You can cast % as a ritual only when it is prepared (or, for a Wizard, in your spellbook)', p_spell
        using errcode = '22023';
    end if;
  else
    if not coalesce(known -> 'prepared' ? p_spell, false) then
      raise exception '% is not prepared', p_spell using errcode = '22023';
    end if;
    if p_slot_level is null or p_slot_level < lvl or p_slot_level > 9 then
      raise exception 'Cast % with a slot of level % or higher', p_spell, lvl using errcode = '22023';
    end if;
  end if;

  st := spell_state_for(p_character);
  if lvl > 0 and not coalesce(p_ritual, false) then
    slots := class_slots(ch.sheet ->> 'className', ch.level_applied);
    if st.slots_used[p_slot_level] >= slots[p_slot_level] then
      raise exception 'No level % spell slot left', p_slot_level using errcode = '22023';
    end if;
    st.slots_used[p_slot_level] := st.slots_used[p_slot_level] + 1;
    -- with prepareAfterRestOnly, the prepared list is settled once a slot is spent
    st.prepare_open := false;
  end if;
  if conc then
    ended := st.concentration ->> 'spell';
    st.concentration := jsonb_build_object(
      'spell', p_spell,
      'slotLevel', case when lvl > 0 and not coalesce(p_ritual, false) then p_slot_level end,
      'sinceSeconds', (select game_seconds from campaigns where id = ch.campaign_id));
  end if;
  update character_spell_state
     set slots_used = st.slots_used, concentration = st.concentration, prepare_open = st.prepare_open, updated_at = now()
   where character_id = p_character
  returning * into st;
  insert into spell_casts (campaign_id, character_id, spell, spell_level, slot_level, ritual, concentration,
                           ended_concentration)
  values (ch.campaign_id, p_character, p_spell, lvl,
          case when lvl > 0 and not coalesce(p_ritual, false) then p_slot_level end,
          coalesce(p_ritual, false) and lvl > 0, conc, ended);
  return st;
end $$;

create function public.break_concentration(p_character uuid) returns public.character_spell_state
language plpgsql security definer set search_path = public as $$
declare st character_spell_state;
begin
  perform require_owner_or_dm(p_character);
  perform spell_state_for(p_character);
  update character_spell_state set concentration = null, updated_at = now()
   where character_id = p_character
  returning * into st;
  return st;
end $$;

-- Sets the prepared list (levelled spells; cantrips are known, not prepared).
create function public.set_prepared_spells(p_character uuid, p_prepared text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ch characters;
  cls jsonb;
  cls_name text;
  lim int;
  top int;
  spell_name text;
  st character_spell_state;
  after_rest_only boolean;
begin
  perform require_owner_or_dm(p_character);
  select * into ch from characters where id = p_character;
  cls_name := ch.sheet ->> 'className';
  select data into cls from srd_classes where name = cls_name;
  if cls is null or not cls ? 'spellcasting' then
    raise exception 'A % does not prepare spells', coalesce(cls_name, 'character') using errcode = '22023';
  end if;
  select (l -> 'columns' ->> 'preparedSpells')::int into lim
    from jsonb_array_elements(cls -> 'levels') l where (l ->> 'level')::int = ch.level_applied;
  if lim is null then
    raise exception 'The SRD data has no % level %', cls_name, ch.level_applied using errcode = '22023';
  end if;
  p_prepared := coalesce(p_prepared, '{}');
  if (select count(distinct x) from unnest(p_prepared) x) <> cardinality(p_prepared) then
    raise exception 'Prepare each spell only once' using errcode = '22023';
  end if;
  if cardinality(p_prepared) > lim then
    raise exception 'A level % % prepares at most % spells', ch.level_applied, cls_name, lim using errcode = '22023';
  end if;
  top := max_spell_level(cls_name, ch.level_applied);
  foreach spell_name in array p_prepared loop
    if not exists (select 1 from srd_spells s where s.name = spell_name and (s.data -> 'classes') ? cls_name
                     and (s.data ->> 'level')::int between 1 and top) then
      raise exception '% is not a % spell of a level you have slots for', spell_name, cls_name using errcode = '22023';
    end if;
    if cls -> 'spellcasting' ->> 'preparation' = 'spellbook'
       and not coalesce(ch.sheet -> 'spells' -> 'spellbook' ? spell_name, false) then
      raise exception 'Prepare % from your spellbook: it is not in it', spell_name using errcode = '22023';
    end if;
  end loop;
  st := spell_state_for(p_character);
  after_rest_only := coalesce(((select settings from campaigns where id = ch.campaign_id) ->> 'prepareAfterRestOnly')::boolean, true);
  if after_rest_only and not st.prepare_open and not is_dm(ch.campaign_id) then
    raise exception 'Prepared spells change after a long rest, before you cast with a slot' using errcode = '22023';
  end if;
  perform set_config('app.sheet_write', 'on', true);
  update characters
     set sheet = jsonb_set(sheet, '{spells}',
                           coalesce(sheet -> 'spells', '{"cantrips": []}') || jsonb_build_object('prepared', to_jsonb(p_prepared)))
   where id = p_character;
  perform set_config('app.sheet_write', '', true);
  return to_jsonb(p_prepared);
end $$;

-- DM only: the simple long rest for one character (see the header for what it restores).
create function public.simple_long_rest(p_character uuid) returns public.rest_events
language plpgsql security definer set search_path = public as $$
declare
  ch characters;
  st character_spell_state;
  removed int;
  result rest_events;
begin
  perform require_dm(character_campaign(p_character));
  select * into ch from characters where id = p_character for update;
  st := spell_state_for(p_character);
  update characters
     set sheet = jsonb_set(jsonb_set(sheet, '{hp,current}', coalesce(sheet -> 'hp' -> 'max', '1')),
                           '{hitDice,spent}', '0'),
         exhaustion = greatest(0, exhaustion - 1)
   where id = p_character and sheet ? 'hp' and sheet ? 'hitDice';
  update character_spell_state
     set slots_used = array_fill(0, array[9]), concentration = null, prepare_open = true, updated_at = now()
   where character_id = p_character;
  delete from effects where character_id = p_character and duration ->> 'kind' = 'rest';
  get diagnostics removed = row_count;
  insert into rest_events (campaign_id, character_id, kind, details)
  values (ch.campaign_id, p_character, 'long', jsonb_build_object(
    'hpBefore', ch.sheet -> 'hp' -> 'current', 'hitDiceSpentBefore', ch.sheet -> 'hitDice' -> 'spent',
    'exhaustionBefore', ch.exhaustion, 'slotsUsedBefore', to_jsonb(st.slots_used),
    'concentrationEnded', st.concentration ->> 'spell', 'effectsEnded', removed))
  returning * into result;
  return result;
end $$;

-- DM only: the simple long rest for every member of the official Party. Returns how many rested.
create function public.simple_long_rest_party(p_campaign uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  m uuid;
  n int := 0;
begin
  perform require_dm(p_campaign);
  for m in select character_id from party_members where party_id = official_party(p_campaign) loop
    perform simple_long_rest(m);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function
  public.log_append_only(), public.details_ok(jsonb), public.details_from_sheet(jsonb), public.characters_seed_details(),
  public.class_slots(text, int), public.max_spell_level(text, int), public.spell_state_for(uuid),
  public.require_owner_or_dm(uuid), public.cast_spell(uuid, text, int, boolean), public.break_concentration(uuid),
  public.set_prepared_spells(uuid, text[]), public.simple_long_rest(uuid), public.simple_long_rest_party(uuid)
from public, anon, authenticated;
grant execute on function
  public.details_ok(jsonb), public.cast_spell(uuid, text, int, boolean), public.break_concentration(uuid),
  public.set_prepared_spells(uuid, text[]), public.simple_long_rest(uuid), public.simple_long_rest_party(uuid)
to authenticated;
