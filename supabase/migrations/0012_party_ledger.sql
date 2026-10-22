-- =====================================================================
-- 0012 (ticket P2-6): the Party, wallets, the XP and coin ledger, and applied levels.
--
--   * Every campaign has one official Party: an entity of type 'party' with a row in parties. It is made with
--     the campaign. New characters join it when campaigns.settings.autoJoinParty is true (the default).
--   * characters.level_applied is the level the sheet has been built to. levelFromXp(xp) above it means
--     level-ups are pending (the level-up flow is P2-10).
--   * Wallets hold coins for a character or a party. Nobody writes them directly; the functions below move coins.
--   * The ledger is append-only, like the roll log. It is written by triggers on characters.xp and on wallets, so
--     every XP or coin change is in it, whichever way it was made, and the totals always equal the ledger's sum.
--     The award functions only tell the trigger which source and note to record.
-- Coins are the SRD's copper, silver, gold and platinum pieces. Electrum is left out, as in the rules engine's
-- makeChange: the SRD treats it as unusual, and a DM can award its worth in silver or gold.
-- =====================================================================

-- PARTIES -------------------------------------------------------------------

create table public.parties (
  entity_id uuid primary key references public.entities (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  is_official boolean not null default false
);
create unique index parties_one_official_key on public.parties (campaign_id) where is_official;

create table public.party_members (
  party_id uuid not null references public.parties (entity_id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (party_id, character_id)
);
create index party_members_character_idx on public.party_members (character_id);

alter table public.characters
  add column level_applied int not null default 1 check (level_applied between 1 and 20);

-- WALLETS AND THE LEDGER -------------------------------------------------------

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  owner_type text not null check (owner_type in ('character', 'party')),
  -- a character's id or a party's entity id (removed with its owner by the triggers below)
  owner_id uuid not null,
  cp int not null default 0 check (cp >= 0),
  sp int not null default 0 check (sp >= 0),
  gp int not null default 0 check (gp >= 0),
  pp int not null default 0 check (pp >= 0),
  unique (owner_type, owner_id)
);
create index wallets_campaign_idx on public.wallets (campaign_id);

create table public.ledger (
  id uuid primary key default gen_random_uuid(),
  -- the order entries were written in (one award writes several rows at the same created_at)
  seq bigint generated always as identity,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  kind text not null check (kind in ('xp', 'coin')),
  target_type text not null check (target_type in ('character', 'party')),
  target_id uuid not null,
  -- xp: {"xp": 33}, plus "remainder" on the note row of a Party award.
  -- coin: the change to the wallet, {"cp": 0, "sp": 0, "gp": -5, "pp": 0}, plus "remainder" on a split's note row.
  amount jsonb not null check (jsonb_typeof(amount) = 'object'),
  source text not null check (source in ('encounter', 'quest', 'milestone', 'other')),
  note text not null default '' check (char_length(note) <= 500),
  -- no foreign key: the log is append-only, so it cannot be cleared when an account is deleted
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index ledger_campaign_idx on public.ledger (campaign_id, seq desc);
create index ledger_target_idx on public.ledger (target_type, target_id);

-- HELPERS ----------------------------------------------------------------------

create function public.party_campaign(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select campaign_id from parties where entity_id = p
$$;

create function public.official_party(c uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select entity_id from parties where campaign_id = c and is_official
$$;

-- Makes a campaign's official Party: the entity (visible to players), its parties row and its wallet.
-- "The Party" unless an entity already has that name.
create function public.create_official_party(c uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  party_name text := 'The Party';
  n int := 1;
  e uuid;
begin
  while exists (select 1 from entities where campaign_id = c and lower(name) = lower(party_name)) loop
    n := n + 1;
    party_name := 'The Party ' || n;
  end loop;
  insert into entities (campaign_id, type, name, visible_to_players) values (c, 'party', party_name, true)
  returning id into e;
  insert into parties (entity_id, campaign_id, is_official) values (e, c, true);
  insert into wallets (campaign_id, owner_type, owner_id) values (c, 'party', e);
  return e;
end $$;

-- The award functions set these for one change, so the ledger trigger records why it happened.
create function public.ledger_reason(p_source text, p_note text) returns void
language plpgsql set search_path = public as $$
begin
  perform set_config('app.ledger_source', coalesce(p_source, ''), true);
  perform set_config('app.ledger_note', coalesce(p_note, ''), true);
end $$;

create function public.ledger_source() returns text
language sql stable set search_path = public as $$
  select coalesce(nullif(current_setting('app.ledger_source', true), ''), 'other')
$$;

create function public.ledger_note(fallback text) returns text
language sql stable set search_path = public as $$
  select coalesce(nullif(current_setting('app.ledger_note', true), ''), fallback)
$$;

-- {"gp": 10, "sp": 5} -> checked coins. Only cp, sp, gp and pp, whole numbers of 0 or more, at least one above 0.
create function public.coins_of(p_coins jsonb) returns table (cp int, sp int, gp int, pp int)
language plpgsql immutable set search_path = public as $$
declare k text;
begin
  if p_coins is null or jsonb_typeof(p_coins) <> 'object' then
    raise exception 'Coins look like {"gp": 10}' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_coins) loop
    if k not in ('cp', 'sp', 'gp', 'pp') then
      raise exception 'Coins are cp, sp, gp or pp (not %)', k using errcode = '22023';
    end if;
    if jsonb_typeof(p_coins -> k) <> 'number' or (p_coins ->> k)::numeric <> floor((p_coins ->> k)::numeric)
       or (p_coins ->> k)::numeric < 0 or (p_coins ->> k)::numeric > 1000000 then
      raise exception 'Each coin amount is a whole number from 0 to 1,000,000' using errcode = '22023';
    end if;
  end loop;
  cp := coalesce((p_coins ->> 'cp')::int, 0);
  sp := coalesce((p_coins ->> 'sp')::int, 0);
  gp := coalesce((p_coins ->> 'gp')::int, 0);
  pp := coalesce((p_coins ->> 'pp')::int, 0);
  if cp + sp + gp + pp = 0 then
    raise exception 'Give at least one coin' using errcode = '22023';
  end if;
  return next;
end $$;

-- GUARDS -------------------------------------------------------------------------

-- A party is a 'party' entity from its own campaign. The official one stays official and is never deleted
-- (except with its campaign).
create function public.parties_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_official and exists (select 1 from campaigns where id = old.campaign_id) then
      raise exception 'The official Party cannot be deleted';
    end if;
    return old;
  end if;
  if (select type from entities where id = new.entity_id) is distinct from 'party'
     or entity_campaign(new.entity_id) is distinct from new.campaign_id then
    raise exception 'A party must be a party entity from its own campaign';
  end if;
  if tg_op = 'UPDATE' and (new.is_official is distinct from old.is_official
                           or new.campaign_id is distinct from old.campaign_id) then
    raise exception 'A party keeps its campaign, and the official Party stays official';
  end if;
  return new;
end $$;
create trigger parties_guard_trg before insert or update or delete on public.parties
  for each row execute function public.parties_guard();

-- Deleting a party (with its entity) removes its wallet; deleting a character removes theirs.
create function public.drop_wallet() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'parties' then
    delete from wallets where owner_type = 'party' and owner_id = old.entity_id;
  else
    delete from wallets where owner_type = 'character' and owner_id = old.id;
  end if;
  return old;
end $$;
create trigger parties_drop_wallet_trg after delete on public.parties
  for each row execute function public.drop_wallet();
create trigger characters_drop_wallet_trg after delete on public.characters
  for each row execute function public.drop_wallet();

create function public.party_members_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if party_campaign(new.party_id) is distinct from character_campaign(new.character_id) then
    raise exception 'A character can only join a party from its own campaign';
  end if;
  return new;
end $$;
create trigger party_members_guard_trg before insert or update on public.party_members
  for each row execute function public.party_members_guard();

-- The ledger is append-only for every role. Rows go only when their campaign is deleted.
create function public.ledger_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from campaigns where id = old.campaign_id) then
    return old;
  end if;
  raise exception 'The ledger is append-only: entries cannot be changed or deleted';
end $$;
create trigger ledger_append_only_trg before update or delete on public.ledger
  for each row execute function public.ledger_append_only();

-- Only a DM (or the service role) changes level_applied, like XP. Same function as 0008, plus that one check.
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
  if by_player and tg_op = 'UPDATE' and (
    new.sheet is distinct from old.sheet
    or new.conditions is distinct from old.conditions
    or new.exhaustion is distinct from old.exhaustion
  ) then
    raise exception 'Only the DM can change a character sheet';
  end if;
  return new;
end $$;

-- THE LEDGER WRITES ITSELF ----------------------------------------------------------

-- Every change to a character's XP: an award, or the DM setting it directly (recorded as "other").
create function public.ledger_xp() returns trigger
language plpgsql security definer set search_path = public as $$
declare delta int := new.xp - case when tg_op = 'INSERT' then 0 else old.xp end;
begin
  if delta <> 0 then
    insert into ledger (campaign_id, kind, target_type, target_id, amount, source, note)
    values (new.campaign_id, 'xp', 'character', new.id, jsonb_build_object('xp', delta), ledger_source(),
            ledger_note(case when tg_op = 'INSERT' then 'Starting XP' else 'XP set directly' end));
  end if;
  return new;
end $$;
create trigger characters_ledger_xp_trg after insert or update of xp on public.characters
  for each row execute function public.ledger_xp();

-- Every change to a wallet, as the change in each coin.
create function public.ledger_coins() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d jsonb := jsonb_build_object(
    'cp', new.cp - case when tg_op = 'INSERT' then 0 else old.cp end,
    'sp', new.sp - case when tg_op = 'INSERT' then 0 else old.sp end,
    'gp', new.gp - case when tg_op = 'INSERT' then 0 else old.gp end,
    'pp', new.pp - case when tg_op = 'INSERT' then 0 else old.pp end);
begin
  if d <> '{"cp": 0, "sp": 0, "gp": 0, "pp": 0}'::jsonb then
    insert into ledger (campaign_id, kind, target_type, target_id, amount, source, note)
    values (new.campaign_id, 'coin', new.owner_type, new.owner_id, d, ledger_source(),
            ledger_note(case when tg_op = 'INSERT' then 'Starting coins' else 'Coins changed directly' end));
  end if;
  return new;
end $$;
create trigger wallets_ledger_trg after insert or update on public.wallets
  for each row execute function public.ledger_coins();

-- NEW CAMPAIGNS AND CHARACTERS --------------------------------------------------------

create function public.campaigns_create_party() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform create_official_party(new.id);
  return new;
end $$;
create trigger campaigns_create_party_trg after insert on public.campaigns
  for each row execute function public.campaigns_create_party();

-- A new character gets a wallet and, unless the campaign turned it off, joins the official Party.
create function public.characters_join_party() returns trigger
language plpgsql security definer set search_path = public as $$
declare auto_join boolean;
begin
  insert into wallets (campaign_id, owner_type, owner_id) values (new.campaign_id, 'character', new.id);
  select coalesce((settings ->> 'autoJoinParty')::boolean, true) into auto_join from campaigns where id = new.campaign_id;
  if auto_join and official_party(new.campaign_id) is not null then
    insert into party_members (party_id, character_id) values (official_party(new.campaign_id), new.id);
  end if;
  return new;
end $$;
create trigger characters_join_party_trg after insert on public.characters
  for each row execute function public.characters_join_party();

-- EXISTING DATA -----------------------------------------------------------------------
-- Every campaign gets its Party; every character a wallet, a place in the Party (when auto-join is on), an
-- applied level matching its XP (Phase 1 sheets were built to it), and an opening XP entry so the ledger adds up.

select create_official_party(c.id) from campaigns c where official_party(c.id) is null;

insert into wallets (campaign_id, owner_type, owner_id)
select campaign_id, 'character', id from characters ch
where not exists (select 1 from wallets w where w.owner_type = 'character' and w.owner_id = ch.id);

insert into party_members (party_id, character_id)
select official_party(ch.campaign_id), ch.id
from characters ch join campaigns c on c.id = ch.campaign_id
where coalesce((c.settings ->> 'autoJoinParty')::boolean, true)
on conflict do nothing;

update characters set level_applied = (
  select count(*) from unnest(array[300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000,
                                    120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]) t
  where characters.xp >= t
) + 1;

insert into ledger (campaign_id, kind, target_type, target_id, amount, source, note, created_by)
select campaign_id, 'xp', 'character', id, jsonb_build_object('xp', xp), 'other', 'XP before the ledger', null
from characters where xp > 0;

-- ROW LEVEL SECURITY ------------------------------------------------------------------

alter table public.parties enable row level security;
alter table public.party_members enable row level security;
alter table public.wallets enable row level security;
alter table public.ledger enable row level security;

create policy "read parties" on public.parties for select to authenticated
  using (is_member(campaign_id));
create policy "dm writes parties" on public.parties for all to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));

create policy "read party members" on public.party_members for select to authenticated
  using (is_member(party_campaign(party_id)));
create policy "dm writes party members" on public.party_members for all to authenticated
  using (is_dm(party_campaign(party_id))) with check (is_dm(party_campaign(party_id)));

-- Players read their characters' wallets and their campaign's party wallets. No write policy: functions only.
create policy "read wallets" on public.wallets for select to authenticated
  using (is_dm(campaign_id)
         or (owner_type = 'character' and owns_character(owner_id))
         or (owner_type = 'party' and is_member(campaign_id)));

create policy "read ledger" on public.ledger for select to authenticated
  using (is_dm(campaign_id)
         or (target_type = 'character' and owns_character(target_id))
         or (target_type = 'party' and is_member(campaign_id)));

revoke insert, update, delete on public.wallets, public.ledger from anon, authenticated;

-- FUNCTIONS --------------------------------------------------------------------------

-- Who an award or deposit is for, checked against the campaign. Returns the campaign.
create function public.target_campaign(p_target_type text, p_target_id uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare c uuid;
begin
  if p_target_type = 'party' then
    c := party_campaign(p_target_id);
  elsif p_target_type = 'character' then
    c := character_campaign(p_target_id);
  else
    raise exception 'An award goes to the party or to a character' using errcode = '22023';
  end if;
  if c is null then
    raise exception 'We could not find that %', p_target_type using errcode = '22023';
  end if;
  return c;
end $$;

create function public.check_source(p_source text) returns void
language plpgsql immutable set search_path = public as $$
begin
  if p_source is null or p_source not in ('encounter', 'quest', 'milestone', 'other') then
    raise exception 'The source is encounter, quest, milestone or other' using errcode = '22023';
  end if;
end $$;

-- Adds coins to (or, with p_sign -1, takes them from) a wallet, recording why. Raises when a wallet would run short.
create function public.move_coins(
  p_owner_type text, p_owner_id uuid, p_cp int, p_sp int, p_gp int, p_pp int, p_sign int, p_source text, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ledger_reason(p_source, p_note);
  update wallets
     set cp = cp + p_sign * p_cp, sp = sp + p_sign * p_sp, gp = gp + p_sign * p_gp, pp = pp + p_sign * p_pp
   where owner_type = p_owner_type and owner_id = p_owner_id
     and (p_sign > 0 or (cp >= p_cp and sp >= p_sp and gp >= p_gp and pp >= p_pp));
  if not found then
    perform ledger_reason(null, null);
    if p_sign < 0 then
      raise exception 'Not enough coins: the wallet holds less than that' using errcode = '22023';
    end if;
    raise exception 'That wallet does not exist' using errcode = '22023';
  end if;
  perform ledger_reason(null, null);
end $$;

-- DM only. To the Party: each current member gets floor(amount / members); a note row records the remainder,
-- which nobody gets (the DM can award it separately). To a character: all of it.
create function public.award_xp(
  p_target_type text, p_target_id uuid, p_amount int, p_source text, p_note text default ''
) returns void
language plpgsql security definer set search_path = public as $$
declare
  c uuid := target_campaign(p_target_type, p_target_id);
  ids uuid[];
  each_gets int;
  left_over int;
  m uuid;
begin
  perform require_dm(c);
  perform check_source(p_source);
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then
    raise exception 'Award from 1 to 1,000,000 XP' using errcode = '22023';
  end if;
  if p_target_type = 'character' then
    perform ledger_reason(p_source, p_note);
    update characters set xp = xp + p_amount where id = p_target_id;
    perform ledger_reason(null, null);
    return;
  end if;
  select array_agg(character_id order by character_id) into ids from party_members where party_id = p_target_id;
  if ids is null then
    raise exception 'The party has no members to share the XP' using errcode = '22023';
  end if;
  each_gets := p_amount / array_length(ids, 1);
  left_over := p_amount - each_gets * array_length(ids, 1);
  if each_gets > 0 then
    foreach m in array ids loop
      perform ledger_reason(p_source, p_note);
      update characters set xp = xp + each_gets where id = m;
    end loop;
    perform ledger_reason(null, null);
  end if;
  if left_over > 0 then
    insert into ledger (campaign_id, kind, target_type, target_id, amount, source, note)
    values (c, 'xp', 'party', p_target_id, jsonb_build_object('xp', 0, 'remainder', left_over), p_source,
            format('%s XP left over from %s XP shared by %s (not awarded)', left_over, p_amount, array_length(ids, 1)));
  end if;
end $$;

-- DM only: coins into a character's wallet or the party pool.
create function public.award_coins(
  p_target_type text, p_target_id uuid, p_coins jsonb, p_note text default '', p_source text default 'other'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  c uuid := target_campaign(p_target_type, p_target_id);
  k record;
begin
  perform require_dm(c);
  perform check_source(p_source);
  select * into k from coins_of(p_coins);
  perform move_coins(p_target_type, p_target_id, k.cp, k.sp, k.gp, k.pp, 1, p_source, p_note);
end $$;

-- DM only: shares the pool among the current members, coin by coin. What does not divide evenly stays in the
-- pool, and a note row records it.
create function public.split_party_gold(p_party uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c uuid := party_campaign(p_party);
  ids uuid[];
  n int;
  w wallets;
  m uuid;
begin
  perform require_dm(c);
  select array_agg(character_id order by character_id) into ids from party_members where party_id = p_party;
  n := coalesce(array_length(ids, 1), 0);
  if n = 0 then
    raise exception 'The party has no members to share the coins' using errcode = '22023';
  end if;
  select * into w from wallets where owner_type = 'party' and owner_id = p_party;
  if w.cp / n + w.sp / n + w.gp / n + w.pp / n = 0 then
    raise exception 'There is not enough in the pool to give every member a coin' using errcode = '22023';
  end if;
  perform move_coins('party', p_party, (w.cp / n) * n, (w.sp / n) * n, (w.gp / n) * n, (w.pp / n) * n, -1,
                     'other', format('Shared among %s members', n));
  foreach m in array ids loop
    perform move_coins('character', m, w.cp / n, w.sp / n, w.gp / n, w.pp / n, 1, 'other', 'Share of the party pool');
  end loop;
  if w.cp % n + w.sp % n + w.gp % n + w.pp % n > 0 then
    insert into ledger (campaign_id, kind, target_type, target_id, amount, source, note)
    values (c, 'coin', 'party', p_party,
            jsonb_build_object('cp', 0, 'sp', 0, 'gp', 0, 'pp', 0, 'remainder',
                               jsonb_build_object('cp', w.cp % n, 'sp', w.sp % n, 'gp', w.gp % n, 'pp', w.pp % n)),
            'other', 'Left in the pool: it does not divide evenly');
  end if;
end $$;

-- A player (or the DM) moves coins from their character's wallet into the party pool.
create function public.deposit_to_party(p_character uuid, p_coins jsonb, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  c uuid := character_campaign(p_character);
  p uuid;
  k record;
begin
  if c is null or not (owns_character(p_character) or is_dm(c)) then
    raise exception 'You can only deposit from your own character' using errcode = '42501';
  end if;
  p := official_party(c);
  select * into k from coins_of(p_coins);
  perform move_coins('character', p_character, k.cp, k.sp, k.gp, k.pp, -1, 'other',
                     coalesce(nullif(btrim(p_note), ''), 'Deposited into the party pool'));
  perform move_coins('party', p, k.cp, k.sp, k.gp, k.pp, 1, 'other',
                     coalesce(nullif(btrim(p_note), ''), 'Deposit'));
end $$;

-- DM only: coins from the party pool to one character.
create function public.withdraw_from_party(p_character uuid, p_coins jsonb, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  c uuid := character_campaign(p_character);
  p uuid;
  k record;
begin
  perform require_dm(c);
  p := official_party(c);
  select * into k from coins_of(p_coins);
  perform move_coins('party', p, k.cp, k.sp, k.gp, k.pp, -1, 'other',
                     coalesce(nullif(btrim(p_note), ''), 'Withdrawn from the party pool'));
  perform move_coins('character', p_character, k.cp, k.sp, k.gp, k.pp, 1, 'other',
                     coalesce(nullif(btrim(p_note), ''), 'From the party pool'));
end $$;

-- FUNCTION PRIVILEGES ----------------------------------------------------------------

revoke execute on function
  public.party_campaign(uuid), public.official_party(uuid), public.create_official_party(uuid),
  public.ledger_reason(text, text), public.ledger_source(), public.ledger_note(text), public.coins_of(jsonb),
  public.target_campaign(text, uuid), public.check_source(text),
  public.move_coins(text, uuid, int, int, int, int, int, text, text),
  public.award_xp(text, uuid, int, text, text), public.award_coins(text, uuid, jsonb, text, text),
  public.split_party_gold(uuid), public.deposit_to_party(uuid, jsonb, text), public.withdraw_from_party(uuid, jsonb, text),
  public.parties_guard(), public.drop_wallet(), public.party_members_guard(), public.ledger_append_only(),
  public.ledger_xp(), public.ledger_coins(), public.campaigns_create_party(), public.characters_join_party()
from public, anon, authenticated;

-- the helpers policies use, and the functions people call
grant execute on function
  public.party_campaign(uuid), public.official_party(uuid),
  public.award_xp(text, uuid, int, text, text), public.award_coins(text, uuid, jsonb, text, text),
  public.split_party_gold(uuid), public.deposit_to_party(uuid, jsonb, text), public.withdraw_from_party(uuid, jsonb, text)
to authenticated;
