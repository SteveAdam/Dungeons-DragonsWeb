#!/usr/bin/env node
// Mutation check for the row level security suite: proves the tests fail when a protection is removed.
//
// For each mutation it copies supabase/tests/database/rls.test.sql, injects broken SQL at the line marked
// "@mutation-point", runs that copy, and checks that the tests guarding that protection (T1 to T89) fail.
// Other tests may fail too: removing a write protection lets earlier tests change data, which breaks later ones.
// The broken SQL runs inside the test's own transaction, which is rolled back, so your real policies are
// never touched and there is nothing to restore.
//
//   pnpm db:test:mutations
//
// Needs the local stack running (pnpm db:start). MUTATION_RUNNER can replace the command; {file} is the test file.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const SUITE = 'supabase/tests/database/rls.test.sql';
const TMP_DIR = 'supabase/tests-mutations';
const MARKER = '-- @mutation-point';
const MARKER_LINE = /^-- @mutation-point.*$/m;
const RUNNER = process.env.MUTATION_RUNNER ?? 'pnpm exec supabase test db "{file}"';

// `fails` lists the tests that must fail when the protection is removed.
const MUTATIONS = [
  {
    name: 'pin_secrets policy removed (ticket)',
    why: 'with no policy the table denies everyone, so the DM loses access',
    sql: `drop policy "dm only pin secrets" on pin_secrets;`,
    fails: ['T10'],
  },
  {
    name: 'row level security switched off on pin_secrets',
    why: 'players and strangers could read DM notes',
    sql: `alter table pin_secrets disable row level security;`,
    fails: ['T2', 'T6'],
  },
  {
    name: 'hidden-pin filter removed (ticket)',
    why: 'players could read pins the DM has not revealed',
    sql: `drop policy "read pins" on pins;
create policy "read pins" on pins for select using (is_dm(map_campaign(map_id)) or is_member(map_campaign(map_id)));`,
    fails: ['T1'],
  },
  {
    name: "map policy checks only the map's own flag",
    why: 'a sub-map under a hidden pin would be readable',
    sql: `drop policy "read maps" on maps;
create policy "read maps" on maps for select using (is_dm(campaign_id) or (is_member(campaign_id) and visible_to_players));`,
    fails: ['T3'],
  },
  {
    name: 'map visibility checks only one level up (the original draft)',
    why: 'a map two levels under a hidden pin would be readable',
    sql: `create or replace function map_is_revealed(m uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select mp.visible_to_players and (mp.parent_pin_id is null or coalesce((select visible_to_players from pins where id = mp.parent_pin_id), false)) from maps mp where mp.id = m), false) $$;`,
    fails: ['T13'],
  },
  {
    name: 'page visibility filter removed',
    why: 'players could read hidden pages',
    sql: `drop policy "read pages" on pages;
create policy "read pages" on pages for select using (is_dm(campaign_id) or is_member(campaign_id));`,
    fails: ['T4'],
  },
  {
    name: 'link visibility filter removed',
    why: 'players could see links that expose hidden pins',
    sql: `drop policy "read links" on links;
create policy "read links" on links for select using (is_dm(campaign_id) or is_member(campaign_id));`,
    fails: ['T5'],
  },
  {
    name: 'folders readable by members',
    why: "players would see the DM's filing system",
    sql: `create policy "read folders" on folders for select using (is_member(campaign_id));`,
    fails: ['T7'],
  },
  {
    name: 'any member can write pins',
    why: 'players could add, change and delete pins (and read hidden ones)',
    sql: `drop policy "dm writes pins" on pins;
create policy "dm writes pins" on pins for all using (is_member(map_campaign(map_id))) with check (is_member(map_campaign(map_id)));`,
    fails: ['T1', 'T7'],
  },
  {
    name: 'any member can write members',
    why: 'a player could make themselves a DM',
    sql: `drop policy "dm manages members" on members;
create policy "dm manages members" on members for all using (is_member(campaign_id)) with check (is_member(campaign_id));`,
    fails: ['T8'],
  },
  {
    name: 'invite code readable by members',
    why: 'players would see the DM-only invite code',
    sql: `drop policy "dm only campaign secrets" on campaign_secrets;
create policy "dm only campaign secrets" on campaign_secrets for select using (is_member(campaign_id));`,
    fails: ['T2'],
  },
  {
    name: 'map images readable by anyone in the bucket',
    why: 'players and strangers could read the image of a hidden map',
    sql: `drop policy "maps: read what the map policy lets you read" on storage.objects;
create policy "maps: read what the map policy lets you read" on storage.objects for select to authenticated using (bucket_id = 'maps');`,
    fails: ['T6', 'T11', 'T13'],
  },
  {
    name: 'profiles readable by everyone',
    why: "strangers could read each other's profiles",
    sql: `drop policy "read profiles of fellow members" on profiles;
create policy "read profiles of fellow members" on profiles for select to authenticated using (true);`,
    fails: ['T12'],
  },
  {
    name: 'orphan-sub-map trigger removed',
    why: 'deleting a hidden pin would publish its sub-map',
    sql: `drop trigger pins_hide_orphaned_submaps_trg on pins;`,
    fails: ['T14'],
  },
  {
    name: 'image-folder constraint removed',
    why: "a map could point at another campaign's image",
    sql: `alter table maps drop constraint maps_image_in_campaign_folder;`,
    fails: ['T15'],
  },
  {
    name: 'last-DM trigger removed',
    why: 'a campaign could be left with no DM',
    sql: `drop trigger members_keep_a_dm_trg on members;`,
    fails: ['T16'],
  },
  {
    name: 'hidden-region filter removed',
    why: 'players could read weather zones the DM has not revealed, or zones on hidden maps',
    sql: `drop policy "read regions" on regions;
create policy "read regions" on regions for select using (is_dm(map_campaign(map_id)) or is_member(map_campaign(map_id)));`,
    fails: ['T18'],
  },
  {
    name: 'any member can write regions',
    why: 'players could add, change and delete weather zones',
    sql: `drop policy "dm writes regions" on regions;
create policy "dm writes regions" on regions for all using (is_member(map_campaign(map_id))) with check (is_member(map_campaign(map_id)));`,
    fails: ['T18'],
  },
  {
    name: 'hidden-roll filter removed',
    why: "players would see the DM's secret rolls",
    sql: `drop policy "read rolls" on rolls;
create policy "read rolls" on rolls for select using (is_dm(campaign_id) or is_member(campaign_id));`,
    fails: ['T21'],
  },
  {
    name: 'append-only trigger removed from the roll log',
    why: 'rolls could be edited or deleted after the fact',
    sql: `drop trigger rolls_append_only_trg on rolls;`,
    fails: ['T20'],
  },
  {
    name: 'checks succeed automatically on a natural 20',
    why: 'the 2024 rules give automatic success only to attack rolls',
    sql: `create or replace function roll_outcome(p_kind text, p_mode text, p_dice int[], p_bonus int, p_target int,
  out kept int, out total int, out success boolean, out crit boolean, out fumble boolean) language plpgsql immutable as $f$
begin
  kept := case p_mode when 'advantage' then greatest(p_dice[1], p_dice[2]) when 'disadvantage' then least(p_dice[1], p_dice[2]) else p_dice[1] end;
  total := kept + p_bonus; crit := p_kind = 'attack' and kept = 20; fumble := p_kind = 'attack' and kept = 1;
  success := case when p_target is null then null when kept = 20 then true when kept = 1 then false else total >= p_target end;
end $f$;`,
    fails: ['T22'],
  },
  {
    name: 'characters readable by every member',
    why: "players could read each other's character sheets",
    sql: `drop policy "read characters" on characters;
create policy "read characters" on characters for select using (is_member(campaign_id));`,
    fails: ['T25'],
  },
  {
    name: 'XP guard removed',
    why: 'players could level themselves up by editing their XP',
    sql: `create or replace function characters_guard() returns trigger language plpgsql as $f$ begin return new; end $f$;`,
    fails: ['T26'],
  },
  {
    name: 'effect secrets readable by the character owner',
    why: "players would see the DM's hidden details about their effects",
    sql: `create policy "owners read effect secrets" on effect_secrets for select using (owns_character((select character_id from effects where id = effect_id)));`,
    fails: ['T27'],
  },
  {
    name: 'roll_d20 lets anyone roll for any character',
    why: "a player could roll in another player's name",
    sql: `create or replace function roll_d20(p_actor uuid, p_campaign uuid, p_character uuid, p_kind text, p_label text, p_bonus int, p_target int, p_mode text, p_hidden boolean default false, p_breakdown jsonb default null)
returns rolls language plpgsql volatile security definer set search_path = public as $f$
declare dice int[]; o record; result rolls;
begin
  if p_actor is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from members where campaign_id = p_campaign and user_id = p_actor) then raise exception 'Only members of this campaign can roll here' using errcode = '42501'; end if;
  dice := case when p_mode = 'normal' then array[d20()] else array[d20(), d20()] end;
  o := roll_outcome(p_kind, p_mode, dice, p_bonus, p_target);
  insert into rolls (campaign_id, character_id, rolled_by, kind, label, bonus, bonus_breakdown, target, mode, dice, kept, total, success, crit, fumble, hidden)
  values (p_campaign, p_character, p_actor, p_kind, p_label, p_bonus, p_breakdown, p_target, p_mode, dice, o.kept, o.total, o.success, o.crit, o.fumble, coalesce(p_hidden, false))
  returning * into result;
  return result;
end $f$;`,
    fails: ['T28'],
  },
  {
    name: 'roll_d20 open to signed-in users again (P2-2)',
    why: 'a player could skip the Edge Function and send their own bonus',
    sql: `grant execute on function roll_d20(uuid, uuid, uuid, text, text, int, int, text, boolean, jsonb) to authenticated;`,
    fails: ['T35'],
  },
  {
    name: 'roll_d20 no longer checks the bonus against its breakdown (P2-2)',
    why: 'the log could show a breakdown that does not explain the bonus',
    sql: `create or replace function roll_d20(p_actor uuid, p_campaign uuid, p_character uuid, p_kind text, p_label text, p_bonus int, p_target int, p_mode text, p_hidden boolean default false, p_breakdown jsonb default null)
returns rolls language plpgsql volatile security definer set search_path = public as $f$
declare dice int[]; o record; result rolls;
begin
  if p_actor is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from members where campaign_id = p_campaign and user_id = p_actor) then raise exception 'Only members of this campaign can roll here' using errcode = '42501'; end if;
  if p_character is not null and not exists (select 1 from characters where id = p_character and campaign_id = p_campaign and (owner_id = p_actor or exists (select 1 from members where campaign_id = p_campaign and user_id = p_actor and role = 'dm'))) then
    raise exception 'You can only roll for your own character' using errcode = '42501'; end if;
  dice := case when p_mode = 'normal' then array[d20()] else array[d20(), d20()] end;
  o := roll_outcome(p_kind, p_mode, dice, p_bonus, p_target);
  insert into rolls (campaign_id, character_id, rolled_by, kind, label, bonus, bonus_breakdown, target, mode, dice, kept, total, success, crit, fumble, hidden)
  values (p_campaign, p_character, p_actor, p_kind, p_label, p_bonus, p_breakdown, p_target, p_mode, dice, o.kept, o.total, o.success, o.crit, o.fumble, coalesce(p_hidden, false))
  returning * into result;
  return result;
end $f$;`,
    fails: ['T35'],
  },
  {
    name: 'sheet lock removed: only XP is guarded again (P2-2)',
    why: 'a player could set their Strength to 30, and the server would compute a +10 from it',
    sql: `create or replace function characters_guard() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if auth.uid() is not null and not is_dm(new.campaign_id) and tg_op = 'UPDATE' and new.xp is distinct from old.xp then
    raise exception 'Only the DM can change XP';
  end if;
  return new;
end $f$;`,
    fails: ['T26', 'T36'],
  },
  {
    name: 'players create their own characters directly again (P2-2)',
    why: 'a player could create a character with any ability scores they like',
    sql: `create policy "members create their own characters" on characters for insert to authenticated with check (is_member(campaign_id) and owner_id = auth.uid());`,
    fails: ['T26'],
  },
  {
    name: 'SRD equipment writable by signed-in users (P2-3)',
    why: 'a player could give the Club 9d12 damage for everyone',
    sql: `grant insert, update, delete on srd_weapons, srd_armor to authenticated;
create policy "anyone writes srd weapons" on srd_weapons for all to authenticated using (true) with check (true);
create policy "anyone writes srd armor" on srd_armor for all to authenticated using (true) with check (true);`,
    fails: ['T38'],
  },
  {
    name: 'SRD classes writable by signed-in users (P2-4)',
    why: 'a player could give their class a bigger hit die for everyone',
    sql: `grant insert, update, delete on srd_classes to authenticated;
create policy "anyone writes srd classes" on srd_classes for all to authenticated using (true) with check (true);`,
    fails: ['T39'],
  },
  {
    name: 'SRD spells writable by signed-in users (P2-5)',
    why: 'a player could make Fireball a cantrip for everyone',
    sql: `grant insert, update, delete on srd_spells to authenticated;
create policy "anyone writes srd spells" on srd_spells for all to authenticated using (true) with check (true);`,
    fails: ['T40'],
  },
  {
    name: 'award_xp no longer checks for the DM (P2-6)',
    why: 'a player could award themself XP',
    sql: `create or replace function require_dm(c uuid) returns void language plpgsql stable security definer set search_path = public as $f$
begin
  if c is null or not is_member(c) then raise exception 'Only the DM can do that' using errcode = '42501'; end if;
end $f$;`,
    fails: ['T41'],
  },
  {
    name: 'party XP given in full to every member (P2-6)',
    why: '100 XP to three members would become 300',
    sql: `create or replace function award_xp(p_target_type text, p_target_id uuid, p_amount int, p_source text, p_note text default '')
returns void language plpgsql security definer set search_path = public as $f$
begin
  perform require_dm(target_campaign(p_target_type, p_target_id));
  perform check_source(p_source);
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception 'Award from 1 to 1,000,000 XP' using errcode = '22023'; end if;
  perform ledger_reason(p_source, p_note);
  if p_target_type = 'character' then
    update characters set xp = xp + p_amount where id = p_target_id;
  else
    update characters set xp = xp + p_amount where id in (select character_id from party_members where party_id = p_target_id);
  end if;
  perform ledger_reason(null, null);
end $f$;`,
    fails: ['T42'],
  },
  {
    name: 'ledger no longer append-only (P2-6)',
    why: 'the service role or the database owner could rewrite the record of awards',
    sql: `drop trigger ledger_append_only_trg on ledger;`,
    fails: ['T43'],
  },
  {
    name: 'wallet balance check removed from move_coins (P2-6)',
    why: 'a deposit larger than the wallet would only be stopped by the check constraint, with no clear message',
    sql: `create or replace function move_coins(p_owner_type text, p_owner_id uuid, p_cp int, p_sp int, p_gp int, p_pp int, p_sign int, p_source text, p_note text)
returns void language plpgsql security definer set search_path = public as $f$
begin
  perform ledger_reason(p_source, p_note);
  update wallets set cp = cp + p_sign * p_cp, sp = sp + p_sign * p_sp, gp = gp + p_sign * p_gp, pp = pp + p_sign * p_pp
   where owner_type = p_owner_type and owner_id = p_owner_id;
  perform ledger_reason(null, null);
end $f$;`,
    fails: ['T44'],
  },
  {
    name: 'every wallet readable by members (P2-6)',
    why: 'players would see each other’s purses',
    sql: `drop policy "read wallets" on wallets;
create policy "read wallets" on wallets for select to authenticated using (is_member(campaign_id));`,
    fails: ['T44'],
  },
  {
    name: 'one-official-party index dropped (P2-6)',
    why: 'a campaign could have two official parties, and awards would not know which to use',
    sql: `drop index parties_one_official_key;`,
    fails: ['T45'],
  },
  {
    name: 'applied level no longer guarded (P2-6)',
    why: 'a player could apply levels they have not been given',
    sql: `create or replace function characters_guard() returns trigger language plpgsql security definer set search_path = public as $f$
declare by_player boolean := auth.uid() is not null and not is_dm(new.campaign_id);
begin
  if by_player and ((tg_op = 'INSERT' and new.xp <> 0) or (tg_op = 'UPDATE' and new.xp is distinct from old.xp)) then
    raise exception 'Only the DM can change XP';
  end if;
  if by_player and tg_op = 'UPDATE' and (new.sheet is distinct from old.sheet or new.conditions is distinct from old.conditions or new.exhaustion is distinct from old.exhaustion) then
    raise exception 'Only the DM can change a character sheet';
  end if;
  return new;
end $f$;`,
    fails: ['T46'],
  },
  {
    name: 'every item readable by members (P2-7)',
    why: 'players would see what other characters carry and what lies hidden in the world',
    sql: `drop policy "read items" on items;
create policy "read items" on items for select to authenticated using (is_member(campaign_id));`,
    fails: ['T47'],
  },
  {
    name: 'item secrets readable by members (P2-7)',
    why: 'players would learn which items are cursed',
    sql: `create policy "members read item secrets" on item_secrets for select to authenticated using (is_member(item_campaign(item_id)));`,
    fails: ['T47'],
  },
  {
    name: 'bound items can be offered (P2-7)',
    why: 'a quest item meant to stay with one character could be handed on',
    sql: `create or replace function offer_transfer(p_item uuid, p_to_character uuid, p_quantity int default null)
returns item_transfers language plpgsql security definer set search_path = public as $f$
declare it items; q int; result item_transfers;
begin
  select * into it from items where entity_id = p_item;
  if it.entity_id is null or it.owner_type <> 'character' or not (owns_character(it.owner_id) or is_dm(it.campaign_id)) then
    raise exception 'You can only give items your own character carries' using errcode = '42501'; end if;
  q := coalesce(p_quantity, it.quantity);
  if q < 1 or q > it.quantity then raise exception 'Give between 1 and % of these', it.quantity using errcode = '22023'; end if;
  if exists (select 1 from item_transfers where item_id = p_item and status = 'pending') then
    raise exception 'This item has already been offered: cancel that offer first' using errcode = '22023'; end if;
  insert into item_transfers (campaign_id, item_id, item_name, from_type, from_id, from_name, to_type, to_id, to_name, quantity)
  values (it.campaign_id, p_item, (select name from entities where id = p_item), 'character', it.owner_id,
          owner_name('character', it.owner_id), 'character', p_to_character, owner_name('character', p_to_character), q)
  returning * into result;
  return result;
end $f$;`,
    fails: ['T48'],
  },
  {
    name: 'an offer moves the item at once (P2-7)',
    why: 'items would change hands without the recipient accepting',
    sql: `create function give_now() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if new.status = 'pending' then perform move_item(new.item_id, 'character', new.to_id, new.quantity); end if;
  return new;
end $f$;
create trigger give_now_trg after insert on item_transfers for each row execute function give_now();`,
    fails: ['T48'],
  },
  {
    name: 'item guard dropped (P2-7)',
    why: 'a fourth attuned item, or two suits of armour, would be accepted',
    sql: `drop trigger items_guard_trg on items;`,
    fails: ['T49'],
  },
  {
    name: 'equip and attune no longer check the owner (P2-7)',
    why: 'a player could take off another character’s armour',
    sql: `create or replace function set_item_worn(p_item uuid, p_field text, p_value boolean) returns items
language plpgsql security definer set search_path = public as $f$
declare result items;
begin
  if p_field = 'equipped' then update items set equipped = p_value where entity_id = p_item returning * into result;
  else update items set attuned = p_value where entity_id = p_item returning * into result; end if;
  return result;
end $f$;`,
    fails: ['T50'],
  },
  {
    name: 'giving part of a stack moves all of it (P2-7)',
    why: 'giving 4 arrows of 10 would hand over all 10',
    sql: `create or replace function move_item(p_item uuid, p_to_type text, p_to_id uuid, p_quantity int) returns uuid
language plpgsql security definer set search_path = public as $f$
begin
  perform set_config('app.item_move', 'on', true);
  update items set owner_type = p_to_type, owner_id = case when p_to_type = 'world' then null else p_to_id end where entity_id = p_item;
  perform set_config('app.item_move', '', true);
  return p_item;
end $f$;`,
    fails: ['T51'],
  },
  {
    name: 'advance_clock open to every member (P2-8)',
    why: 'a player could skip time until a curse wears off',
    sql: `create or replace function advance_clock(p_campaign uuid, p_seconds bigint, p_reason text default '') returns bigint
language plpgsql security definer set search_path = public as $f$
declare was bigint; now_at bigint;
begin
  if not is_member(p_campaign) then raise exception 'Only the DM can do that' using errcode = '42501'; end if;
  if p_seconds is null or p_seconds < 1 or p_seconds > 31536000 then raise exception 'Advance the clock by between 1 second and 365 days' using errcode = '22023'; end if;
  select game_seconds into was from campaigns where id = p_campaign;
  now_at := was + p_seconds;
  perform set_config('app.clock_move', 'on', true);
  update campaigns set game_seconds = now_at where id = p_campaign;
  perform set_config('app.clock_move', '', true);
  insert into game_clock_events (campaign_id, from_seconds, to_seconds, reason) values (p_campaign, was, now_at, coalesce(p_reason, ''));
  return now_at;
end $f$;`,
    fails: ['T52'],
  },
  {
    name: 'clock guard dropped (P2-8)',
    why: 'the clock could be set without a log entry',
    sql: `drop trigger campaigns_clock_guard_trg on campaigns;`,
    fails: ['T52'],
  },
  {
    name: 'clock log no longer append-only (P2-8)',
    why: 'the record of how much time passed could be rewritten',
    sql: `drop trigger game_clock_events_append_only_trg on game_clock_events;`,
    fails: ['T53'],
  },
  {
    name: 'apply_effect open to every member (P2-8)',
    why: 'a player could give themself Strength 30',
    sql: `create or replace function require_dm(c uuid) returns void language plpgsql stable security definer set search_path = public as $f$
begin
  if c is null or not is_member(c) then raise exception 'Only the DM can do that' using errcode = '42501'; end if;
end $f$;`,
    fails: ['T54'],
  },
  {
    name: 'effect secrets readable by members (P2-8)',
    why: 'players would learn which potion is cursed',
    sql: `create policy "members read effect secrets" on effect_secrets for select to authenticated using (true);`,
    fails: ['T54'],
  },
  {
    name: 'ability scores can be re-rolled at will (P2-9)',
    why: 'a player could refresh the wizard until they rolled three 18s',
    sql: `create or replace function unused_ability_roll(p_user uuid, p_campaign uuid) returns rolls
language sql stable security definer set search_path = public as $f$ select * from rolls where false $f$;`,
    fails: ['T55'],
  },
  {
    name: 'wizard drafts readable by every member (P2-9)',
    why: 'players could read each other’s unfinished characters',
    sql: `create policy "members read drafts" on character_drafts for select to authenticated using (is_member(campaign_id));`,
    fails: ['T56'],
  },
  {
    name: 'the creation function open to signed-in users (P2-9)',
    why: 'a player could skip the Edge Function’s checks and write any sheet',
    sql: `grant execute on function create_character_from_wizard(uuid, uuid, text, jsonb, jsonb, int, uuid) to authenticated;`,
    fails: ['T57'],
  },
  {
    name: 'creation no longer checks the ability roll (P2-9)',
    why: 'one lucky roll could make any number of characters, or someone else’s roll could be used',
    sql: `create or replace function create_character_from_wizard(p_actor uuid, p_campaign uuid, p_name text, p_sheet jsonb, p_items jsonb, p_gp int, p_roll uuid default null)
returns uuid language plpgsql security definer set search_path = public as $f$
declare ch uuid; e uuid;
begin
  if p_actor is null or not exists (select 1 from members where campaign_id = p_campaign and user_id = p_actor) then
    raise exception 'Only members of this campaign can create a character here' using errcode = '42501'; end if;
  insert into entities (campaign_id, type, name, visible_to_players) values (p_campaign, 'player', free_entity_name(p_campaign, p_name), true) returning id into e;
  insert into characters (campaign_id, owner_id, name, sheet, xp, level_applied, entity_id) values (p_campaign, p_actor, btrim(p_name), p_sheet - 'name' - 'xp' - 'levelApplied', 0, 1, e) returning id into ch;
  return ch;
end $f$;`,
    fails: ['T57'],
  },
  {
    name: 'hit point rolls can be repeated (P2-10)',
    why: 'a player could roll their Hit Point Die until it showed the maximum',
    sql: `create or replace function unused_hit_die_roll(p_character uuid, p_level int) returns rolls
language sql stable security definer set search_path = public as $f$ select * from rolls where false $f$;`,
    fails: ['T58'],
  },
  {
    name: 'the level-up function open to signed-in users (P2-10)',
    why: 'a player could skip the Edge Function and write any sheet with a new level',
    sql: `grant execute on function apply_level_up_from_function(uuid, uuid, int, jsonb, jsonb, int, uuid) to authenticated;`,
    fails: ['T59'],
  },
  {
    name: 'level-up no longer checks the owner or the level (P2-10)',
    why: 'anyone could level up anyone, or apply a level twice',
    sql: `create or replace function apply_level_up_from_function(p_actor uuid, p_character uuid, p_from int, p_sheet jsonb, p_choices jsonb, p_hp_gain int, p_roll uuid default null)
returns level_up_events language plpgsql security definer set search_path = public as $f$
declare ch characters; result level_up_events;
begin
  select * into ch from characters where id = p_character;
  update characters set sheet = p_sheet - 'name' - 'xp' - 'levelApplied', level_applied = p_from + 1 where id = p_character;
  insert into level_up_events (campaign_id, character_id, from_level, to_level, choices, hp_gain, roll_id, created_by)
  values (ch.campaign_id, p_character, p_from, p_from + 1, p_choices, p_hp_gain, null, p_actor) returning * into result;
  return result;
end $f$;`,
    fails: ['T59'],
  },
  {
    name: 'level-up log no longer append-only (P2-10)',
    why: 'the record of hit points gained could be rewritten',
    sql: `drop trigger level_up_events_append_only_trg on level_up_events;`,
    fails: ['T60'],
  },
  {
    name: 'anyone in the campaign can cast for a character (P2-11)',
    why: 'a player could spend another player’s spell slots',
    sql: `create or replace function require_owner_or_dm(p_character uuid) returns void language plpgsql stable security definer set search_path = public as $f$
begin
  if not is_member(character_campaign(p_character)) then raise exception 'You can only do that for your own character' using errcode = '42501'; end if;
end $f$;`,
    fails: ['T61'],
  },
  {
    name: 'spell slots writable directly (P2-11)',
    why: 'a player could reset their spent slots without resting',
    sql: `grant insert, update on character_spell_state to authenticated;
create policy "owners write spell state" on character_spell_state for all to authenticated using (owns_character(character_id)) with check (owns_character(character_id));`,
    fails: ['T61'],
  },
  {
    name: 'casting no longer checks for a free slot (P2-11)',
    why: 'a caster could cast without end',
    sql: `create or replace function class_slots(p_class text, p_level int) returns int[] language sql stable security definer set search_path = public as $f$ select array_fill(99, array[9]) $f$;`,
    fails: ['T62'],
  },
  {
    name: 'prepared spells change at any time (P2-11)',
    why: 'the campaign’s "only after a rest" rule would mean nothing',
    sql: `create or replace function spell_state_for(p_character uuid) returns character_spell_state language plpgsql security definer set search_path = public as $f$
declare s character_spell_state;
begin
  insert into character_spell_state (character_id, campaign_id) values (p_character, character_campaign(p_character)) on conflict (character_id) do nothing;
  select * into s from character_spell_state where character_id = p_character;
  s.prepare_open := true;
  return s;
end $f$;`,
    fails: ['T63'],
  },
  {
    name: 'the simple long rest open to players (P2-11)',
    why: 'players could rest whenever they liked',
    sql: `create or replace function require_dm(c uuid) returns void language plpgsql stable security definer set search_path = public as $f$
begin
  if c is null or not is_member(c) then raise exception 'Only the DM can do that' using errcode = '42501'; end if;
end $f$;`,
    fails: ['T64'],
  },
  {
    name: 'details readable by every member (P2-11)',
    why: 'players would read each other’s private backstories',
    sql: `create policy "members read details" on character_details for select to authenticated using (is_member(campaign_id));`,
    fails: ['T65'],
  },
  {
    name: 'details limits removed (P2-11)',
    why: 'a field could hold any amount of text, or unknown fields',
    sql: `alter table character_details drop constraint character_details_data_check;`,
    fails: ['T65'],
  },
  {
    name: 'hidden entities readable by members',
    why: 'players would see NPCs and places the DM has not revealed',
    sql: `drop policy "read entities" on entities;
create policy "read entities" on entities for select using (is_dm(campaign_id) or is_member(campaign_id));`,
    fails: ['T30'],
  },
  {
    name: 'link policy ignores hidden entities',
    why: 'an open link would reveal the hidden entity at its other end',
    sql: `drop policy "read entity links" on entity_links;
create policy "read entity links" on entity_links for select using (is_dm(campaign_id) or (is_member(campaign_id) and not hidden));`,
    fails: ['T31'],
  },
  {
    name: 'duplicate-relationship index removed',
    why: 'the same relationship could be stored twice, once from each side',
    sql: `drop index entity_links_same_relationship_key;`,
    fails: ['T32'],
  },
  {
    name: 'any member can create entities',
    why: 'players could add NPCs and places to the DM registry',
    sql: `create or replace function require_dm(c uuid) returns void language plpgsql stable security definer set search_path = public as $f$
begin if c is null or not is_member(c) then raise exception 'Only the DM can do that' using errcode = '42501'; end if; end $f$;`,
    fails: ['T34'],
  },
  {
    name: 'helper function opened to signed-out visitors',
    why: 'visitors could call is_dm over the REST API',
    sql: `grant execute on function is_dm(uuid) to anon;`,
    fails: ['T16'],
  },
  {
    name: 'map visibility walks up through pins only (P3-1)',
    why: 'a map beneath a hidden region, and everything beneath it, would be readable',
    sql: `create or replace function map_is_revealed(m uuid) returns boolean language sql stable security definer set search_path = public as $$
  with recursive chain (map_id, ok, parent_pin_id, depth) as (
    select id, visible_to_players, parent_pin_id, 0 from maps where id = m
    union all
    select up.id, up.visible_to_players and pn.visible_to_players, up.parent_pin_id, chain.depth + 1
    from chain join pins pn on pn.id = chain.parent_pin_id join maps up on up.id = pn.map_id where chain.depth < 32)
  select coalesce(bool_and(ok), false) from chain $$;`,
    fails: ['T66'],
  },
  {
    name: 'cycle check removed (P3-1)',
    why: 'a map could be linked beneath its own detail map, and moving a hidden map could publish it',
    sql: `create or replace function maps_check_parent() returns trigger language plpgsql security definer set search_path = public as $f$
begin return new; end $f$;`,
    fails: ['T67'],
  },
  {
    name: 'map_ancestors ignores visibility (P3-1)',
    why: 'a player could read the names of hidden maps above a hidden map',
    sql: `create or replace function map_ancestors(p_map uuid, as_player boolean default false)
returns table (map_id uuid, name text, depth int, via_kind text, via_id uuid)
language sql stable security definer set search_path = public as $f$
  with recursive chain (id, depth) as (
    select p_map, 0 union all select parent_map(chain.id), chain.depth + 1 from chain where parent_map(chain.id) is not null and chain.depth < 20)
  select chain.id, mp.name, chain.depth, 'pin'::text, null::uuid from chain join maps mp on mp.id = chain.id where chain.depth > 0 $f$;`,
    fails: ['T68'],
  },
  {
    name: 'deleting a hidden region publishes its detail map (P3-1)',
    why: 'the map beneath a hidden region would become a visible top-level map',
    sql: `drop trigger regions_hide_orphaned_submaps_trg on regions;`,
    fails: ['T69'],
  },
  {
    name: 'region content readable by members (P3-2)',
    why: 'players would read hidden creatures, finds and their discovery DCs',
    sql: `create policy "members read region content" on region_content for select to authenticated using (is_member(region_campaign(region_id)));`,
    fails: ['T70'],
  },
  {
    name: 'region content DM notes readable by members (P3-2)',
    why: 'players would read the DM notes on region content',
    sql: `create policy "members read content secrets" on region_content_secrets for select to authenticated using (is_member(content_campaign(content_id)));`,
    fails: ['T70'],
  },
  {
    name: 'spawn pins readable by members (P3-2)',
    why: 'players would see where the DM has placed creatures and traps',
    sql: `create policy "members read spawn pins" on spawn_pins for select to authenticated using (is_member(map_campaign(map_id)));`,
    fails: ['T70'],
  },
  {
    name: 'anyone in the campaign can roll a random encounter (P3-2)',
    why: 'players could roll encounters and learn what lives in a region from the result',
    sql: `create or replace function require_dm(c uuid) returns void language plpgsql stable security definer set search_path = public as $f$
begin if c is null or not is_member(c) then raise exception 'Only the DM can do that' using errcode = '42501'; end if; end $f$;`,
    fails: ['T70'],
  },
  {
    name: 'spawn rule ignores the time of day (P3-2)',
    why: 'night-only creatures would turn up at noon',
    sql: `create or replace function evaluate_spawn(rule jsonb, daytime boolean) returns int language plpgsql volatile set search_path = public as $f$
begin
  if rule ->> 'mode' = 'chance' and roll_die(100) > (rule ->> 'chance')::int then return 0; end if;
  return (rule -> 'count' ->> 'min')::int;
end $f$;`,
    // T72 fails too when the 35% thornwolves happen to come at noon; T71's night-at-noon check always fails
    fails: ['T71'],
  },
  {
    name: 'spawn rule check removed (P3-2)',
    why: 'a chance above 100% or an impossible count could be saved',
    sql: `alter table region_content drop constraint region_content_spawn_rule_check;`,
    fails: ['T73'],
  },
  {
    name: 'region content link check removed (P3-2)',
    why: 'region content could point at lore entries or at another campaign’s NPCs',
    sql: `drop trigger region_content_check_trg on region_content;`,
    fails: ['T73'],
  },
  {
    name: 'every member reads every party group (P3-3)',
    why: 'a player would see where the other groups are and who is in them',
    sql: `drop policy "read visible groups" on party_groups;
create policy "read visible groups" on party_groups for select to authenticated using (is_member(campaign_id));`,
    fails: ['T74'],
  },
  {
    name: 'discoveries readable by members (P3-3)',
    why: 'players would learn which entries exist in a region from the discovery table',
    sql: `create policy "members read discoveries" on content_discoveries for select to authenticated using (is_member(group_campaign(group_id)));`,
    fails: ['T76'],
  },
  {
    name: 'get_here returns hidden entries (P3-3)',
    why: 'the Here tab would list hidden names before anyone found them',
    sql: `create or replace function get_here(p_character uuid) returns jsonb language sql stable security definer set search_path = public as $f$
  select jsonb_build_object('group', null, 'region', null,
    'entries', (select jsonb_agg(jsonb_build_object('name', rc.name, 'actions', '["talk"]'::jsonb) order by rc.sort_order)
                from region_content rc join party_groups pg on pg.region_id = rc.region_id
                join party_group_members pm on pm.group_id = pg.id where pm.character_id = p_character),
    'hints', '[]'::jsonb) $f$;`,
    fails: ['T76'],
  },
  {
    name: 'passive scores ignored on entering a region (P3-3)',
    why: 'every hidden entry would be revealed when a group walks in',
    sql: `create or replace function move_group(p_actor uuid, p_group uuid, p_map uuid, p_region uuid, p_passives jsonb) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare e record; revealed jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from members where campaign_id = group_campaign(p_group) and user_id = p_actor and role = 'dm') then
    raise exception 'Only the DM can do that' using errcode = '42501'; end if;
  update party_groups set map_id = p_map, region_id = p_region where id = p_group;
  for e in select id, name from region_content where region_id = p_region order by sort_order loop
    if record_discovery(e.id, p_group, 'noticed') then revealed := revealed || to_jsonb(e.name); end if;
  end loop;
  return revealed;
end $f$;`,
    fails: ['T75'],
  },
  {
    name: 'search cooldown removed (P3-3)',
    why: 'a player could search again and again until the dice came good',
    sql: `drop trigger region_searches_append_only_trg on region_searches;
alter table region_searches rename to region_searches_old;
create table region_searches (like region_searches_old);
create rule never_store as on insert to region_searches do instead nothing;`,
    fails: ['T77'],
  },
  {
    name: 'SRD monsters writable by signed-in users (P3-4)',
    why: 'a player could rewrite a stat block for everyone',
    sql: `grant insert, update, delete on srd_monsters to authenticated;
create policy "anyone writes srd monsters" on srd_monsters for all to authenticated using (true) with check (true);`,
    fails: ['T79'],
  },
  {
    name: 'custom content readable by every member (P3-6)',
    why: "players could read the DM's unrevealed monsters and items",
    sql: `create policy "members read custom content" on custom_content for select to authenticated using (true);`,
    fails: ['T80'],
  },
  {
    name: 'custom content writable by every member (P3-6)',
    why: 'a player could add to or rewrite the DM library',
    sql: `create policy "members add custom content" on custom_content for insert to authenticated with check (true);`,
    fails: ['T80'],
  },
  {
    name: 'custom content deletable while in use (P3-6)',
    why: 'a monster in a region or an item would point at nothing',
    sql: `create or replace function public.delete_custom_content(p_id uuid) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform require_dm((select campaign_id from custom_content where id = p_id));
  delete from custom_content where id = p_id;
end $fn$;`,
    fails: ['T80'],
  },
  {
    name: 'hidden world events readable by every member (P3-7)',
    why: "players could read the DM's unannounced events",
    sql: `create policy "members read every world event" on world_events for select to authenticated using (true);`,
    fails: ['T81'],
  },
  {
    name: 'calendar writable by every member (P3-7)',
    why: 'a player could rewrite the calendar for the whole table',
    sql: `create policy "members write the calendar" on calendars for update to authenticated using (true) with check (true);`,
    fails: ['T81'],
  },
  {
    name: 'clock rewinds without confirmation (P3-7)',
    why: 'a mistyped date could silently undo time, and with it effect durations',
    sql: `create or replace function public.set_game_date(
  p_campaign uuid, p_day integer, p_seconds_into_day integer default 0, p_reason text default '',
  p_confirm_rewind boolean default false
) returns bigint
language plpgsql security definer set search_path = public as $fn$
declare
  was bigint;
  target bigint := (p_day::bigint - 1) * 86400 + p_seconds_into_day;
begin
  perform require_dm(p_campaign);
  if p_day < 1 or p_seconds_into_day < 0 or p_seconds_into_day >= 86400 then
    raise exception 'bad date' using errcode = '22023';
  end if;
  select game_seconds into was from campaigns where id = p_campaign for update;
  if target = was then return was; end if;
  perform set_config('app.clock_move', 'on', true);
  update campaigns set game_seconds = target where id = p_campaign;
  perform set_config('app.clock_move', '', true);
  insert into game_clock_events (campaign_id, from_seconds, to_seconds, reason)
  values (p_campaign, was, target, case when target < was then 'Rewind: ' || p_reason else p_reason end);
  return target;
end $fn$;`,
    fails: ['T81'],
  },
  {
    name: 'players can set the game date (P3-7)',
    why: 'any player could move the clock and end effects',
    sql: `create or replace function public.set_game_date(
  p_campaign uuid, p_day integer, p_seconds_into_day integer default 0, p_reason text default '',
  p_confirm_rewind boolean default false
) returns bigint
language plpgsql security definer set search_path = public as $fn$
declare
  was bigint;
  target bigint := (p_day::bigint - 1) * 86400 + p_seconds_into_day;
begin
  if p_day < 1 or p_seconds_into_day < 0 or p_seconds_into_day >= 86400 then
    raise exception 'bad date' using errcode = '22023';
  end if;
  select game_seconds into was from campaigns where id = p_campaign for update;
  if target = was then return was; end if;
  if target < was and not coalesce(p_confirm_rewind, false) then
    raise exception 'past' using errcode = 'PT409';
  end if;
  perform set_config('app.clock_move', 'on', true);
  update campaigns set game_seconds = target where id = p_campaign;
  perform set_config('app.clock_move', '', true);
  insert into game_clock_events (campaign_id, from_seconds, to_seconds, reason)
  values (p_campaign, was, target, p_reason);
  return target;
end $fn$;`,
    fails: ['T81'],
  },
  {
    name: 'the old in-game date text can be rewritten (P3-7)',
    why: 'the legacy text is meant to stay as it was until converted',
    sql: `drop trigger pages_legacy_date_guard_trg on pages;`,
    fails: ['T81'],
  },
  {
    name: 'weather zones on hidden maps readable by members (P3-8)',
    why: 'a zone would give away a map the DM has not revealed',
    sql: `create policy "members read every zone" on weather_zones for select to authenticated using (is_member(campaign_id));`,
    fails: ['T82'],
  },
  {
    name: 'weather zones writable by members (P3-8)',
    why: 'a player could redraw the weather',
    sql: `create policy "members draw zones" on weather_zones for insert to authenticated with check (true);`,
    fails: ['T82'],
  },
  {
    name: 'weather days writable by members (P3-8)',
    why: 'a player could rewrite the sky, or change what the DM decided',
    sql: `create policy "members write days" on weather_days for all to authenticated using (true) with check (true);`,
    fails: ['T82'],
  },
  {
    name: 'discovery notices readable by every member (P3-3)',
    why: 'the other group would be told what this group noticed',
    sql: `create policy "members read notices" on discovery_notices for select to authenticated using (is_member(campaign_id));`,
    fails: ['T78'],
  },
  {
    name: 'any signed-in person can listen on campaign: (P4-1)',
    why: 'strangers could join a campaign channel and hear every event',
    sql: `create or replace function realtime_can_read(p_topic text) returns boolean language sql stable security definer set search_path = public as $$ select auth.uid() is not null and p_topic ~ '^(campaign|dm|user|rolls|clock|discoveries):[0-9a-f-]{36}(:[0-9a-f-]{36})?$' $$;`,
    fails: ['T83'],
  },
  {
    name: 'players can listen on dm: (P4-1)',
    why: 'DM-only events would reach players',
    sql: `create or replace function realtime_can_read(p_topic text) returns boolean language plpgsql stable security definer set search_path = public as $$ declare parts text[] := string_to_array(p_topic, ':'); begin if p_topic is null or auth.uid() is null or array_length(parts, 1) not in (2, 3) or parts[2] !~ '^[0-9a-f-]{36}$' then return false; end if; if parts[1] = 'discoveries' then return exists (select 1 from party_groups g where g.id = parts[2]::uuid and is_member(g.campaign_id)); end if; if parts[1] in ('campaign', 'rolls', 'clock', 'dm') and array_length(parts, 1) = 2 then return is_member(parts[2]::uuid); end if; if parts[1] = 'user' and array_length(parts, 1) = 3 then return is_dm(parts[2]::uuid) or (parts[3]::uuid = auth.uid() and is_member(parts[2]::uuid)); end if; return false; end $$;`,
    fails: ['T83'],
  },
  {
    name: 'any member can listen on any user: (P4-1)',
    why: "one player could read another player's private channel",
    sql: `create or replace function realtime_can_read(p_topic text) returns boolean language plpgsql stable security definer set search_path = public as $$ declare parts text[] := string_to_array(p_topic, ':'); begin if p_topic is null or auth.uid() is null or array_length(parts, 1) not in (2, 3) or parts[2] !~ '^[0-9a-f-]{36}$' then return false; end if; if parts[1] = 'dm' then return is_dm(parts[2]::uuid); end if; if parts[1] = 'discoveries' then return exists (select 1 from party_groups g where g.id = parts[2]::uuid and is_member(g.campaign_id)); end if; if parts[1] in ('campaign', 'rolls', 'clock') and array_length(parts, 1) = 2 then return is_member(parts[2]::uuid); end if; if parts[1] = 'user' and array_length(parts, 1) = 3 then return is_member(parts[2]::uuid); end if; return false; end $$;`,
    fails: ['T83'],
  },
  {
    name: 'clients can broadcast directly (P4-1)',
    why: 'any member could forge any event, with any sender',
    sql: `drop policy "publish presence only" on realtime.messages;
create policy "publish presence only" on realtime.messages for insert to authenticated with check (public.realtime_can_track((select realtime.topic())));`,
    fails: ['T83'],
  },
  {
    name: 'read policy removed from realtime.messages (P4-1)',
    why: 'nobody could join a private channel',
    sql: `drop policy "listen on allowed topics" on realtime.messages;`,
    fails: ['T83'],
  },
  {
    name: 'the sender is taken from the payload (P4-1)',
    why: 'a player could send as the DM',
    sql: `create or replace function send_realtime_event(p_campaign uuid, p_channel text, p_event text, p_payload jsonb, p_target uuid default null) returns jsonb language sql volatile security definer set search_path = public as $$ select jsonb_build_object('sender', coalesce(p_payload ->> 'sender', auth.uid()::text), 'senderRole', coalesce(p_payload ->> 'senderRole', 'player'), 'data', p_payload) $$;`,
    fails: ['T84'],
  },
  {
    name: 'players can send any event (P4-1)',
    why: 'a player could send reveals and toasts to the table',
    sql: `create or replace function send_realtime_event(p_campaign uuid, p_channel text, p_event text, p_payload jsonb, p_target uuid default null) returns jsonb language plpgsql volatile security definer set search_path = public as $$ begin if auth.uid() is null or not is_member(p_campaign) then raise exception 'no' using errcode = '42501'; end if; if p_event not in ('reveal','ping','toast','message','handout') or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 16384 or p_channel not in ('campaign','dm','user') or (p_channel = 'user' and p_target is null) then raise exception 'bad' using errcode = '22023'; end if; return jsonb_build_object('sender', auth.uid(), 'senderRole', case when is_dm(p_campaign) then 'dm' else 'player' end, 'data', p_payload); end $$;`,
    fails: ['T84'],
  },
  {
    name: 'send_realtime_event open to signed-out visitors (P4-1)',
    why: 'the function must refuse anyone who is not a member',
    sql: `create or replace function send_realtime_event(p_campaign uuid, p_channel text, p_event text, p_payload jsonb, p_target uuid default null) returns jsonb language plpgsql volatile security definer set search_path = public as $$ declare dm boolean := is_dm(p_campaign); begin if p_event not in ('reveal','ping','toast','message','handout') or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 16384 or p_channel not in ('campaign','dm','user') or (p_channel = 'user' and p_target is null) then raise exception 'bad' using errcode = '22023'; end if; if not dm and (p_channel = 'dm' or (p_channel = 'campaign' and p_event <> 'ping') or (p_channel = 'user' and (p_target <> auth.uid() or p_event <> 'message'))) and is_member(p_campaign) then raise exception 'no' using errcode = '42501'; end if; return jsonb_build_object('sender', auth.uid(), 'senderRole', case when dm then 'dm' else 'player' end, 'data', p_payload); end $$;`,
    fails: ['T84'],
  },
  {
    name: 'every member reads every group (P4-2)',
    why: 'a player could see where the other groups are while positions are not shared',
    sql: `drop policy "read visible groups" on party_groups;
create policy "read visible groups" on party_groups for select to authenticated using (is_member(campaign_id));`,
    fails: ['T86'],
  },
  {
    name: 'group positions shared whatever the setting says (P4-2)',
    why: 'the DM switch would do nothing',
    sql: `create or replace function group_positions_shared(c uuid) returns boolean language sql stable security definer set search_path = public as $$ select true $$;`,
    fails: ['T86', 'T88'],
  },
  {
    name: 'a group keeps its old spot on another map (P4-2)',
    why: 'a token would be drawn at a spot that belongs to a different map',
    sql: `drop trigger party_groups_clear_position_trg on party_groups;`,
    fails: ['T85'],
  },
  {
    name: 'members read the spotlight table directly (P4-2)',
    why: 'a player could read which group has the spotlight without the banner rules',
    sql: `create policy "members read the spotlight" on campaign_spotlight for select to authenticated using (is_member(campaign_id));`,
    fails: ['T87'],
  },
  {
    name: 'anyone can give the spotlight (P4-2)',
    why: 'a player could put their own group in the spotlight',
    sql: `create or replace function set_spotlight(p_campaign uuid, p_group uuid, p_summary text default '') returns void language plpgsql security definer set search_path = public as $$ begin insert into campaign_spotlight (campaign_id, group_id, summary) values (p_campaign, p_group, coalesce(p_summary, '')) on conflict (campaign_id) do update set group_id = excluded.group_id, summary = excluded.summary; end $$;`,
    fails: ['T87'],
  },
  {
    name: 'the entrance counts include entrances a player cannot see (P4-2)',
    why: 'a player would be told there is a group behind a hidden door',
    sql: `create or replace function group_entrance_counts(p_map uuid) returns table (kind text, entrance_id uuid, members integer) language plpgsql stable security definer set search_path = public as $$ declare c uuid := map_campaign(p_map); begin if c is null or auth.uid() is null or not is_member(c) then raise exception 'Only a member can do that' using errcode = '42501'; end if; return query with recursive chain (gid, mid, depth, ekind, eid, emap) as (select g.id, g.map_id, 0, null::text, null::uuid, null::uuid from party_groups g where g.campaign_id = c and g.map_id is not null union all select ch.gid, e.map_id, ch.depth + 1, e.kind, e.id, e.map_id from chain ch join maps m on m.id = ch.mid cross join lateral (select 'pin'::text as kind, pn.id, pn.map_id from pins pn where pn.id = m.parent_pin_id union all select 'region'::text, rg.id, rg.map_id from regions rg where rg.id = m.parent_region_id) e where ch.depth < 20) select ch.ekind, ch.eid, sum((select count(*) from party_group_members pm where pm.group_id = ch.gid))::integer from chain ch where ch.emap = p_map and ch.ekind is not null and (is_dm(c) or in_group(ch.gid) or group_positions_shared(c)) group by ch.ekind, ch.eid; end $$;`,
    fails: ['T88'],
  },
  {
    name: 'the entrance counts stop at the first level (P4-2)',
    why: 'a group two maps down would not be counted on the top map',
    sql: `create or replace function group_entrance_counts(p_map uuid) returns table (kind text, entrance_id uuid, members integer) language plpgsql stable security definer set search_path = public as $$ declare c uuid := map_campaign(p_map); begin if c is null or auth.uid() is null or not is_member(c) then raise exception 'Only a member can do that' using errcode = '42501'; end if; if not is_dm(c) and not map_is_revealed(p_map) then return; end if; return query select e.kind, e.id, sum((select count(*) from party_group_members pm where pm.group_id = g.id))::integer from party_groups g join maps m on m.id = g.map_id cross join lateral (select 'pin'::text as kind, pn.id, pn.map_id, pn.visible_to_players as visible from pins pn where pn.id = m.parent_pin_id union all select 'region'::text, rg.id, rg.map_id, rg.visible_to_players from regions rg where rg.id = m.parent_region_id) e where g.campaign_id = c and e.map_id = p_map and (is_dm(c) or e.visible) and (is_dm(c) or in_group(g.id) or group_positions_shared(c)) group by e.kind, e.id; end $$;`,
    fails: ['T88'],
  },
  {
    name: 'every member reads every fog (P4-3)',
    why: 'a player would see the fog the DM drew for another group',
    sql: `drop policy "read fog" on fog_strokes;
create policy "read fog" on fog_strokes for select to authenticated using (is_member(map_campaign(map_id)));`,
    fails: ['T89'],
  },
  {
    name: 'fog of hidden maps readable (P4-3)',
    why: 'a player would read the fog of a map they cannot see',
    sql: `drop policy "read fog" on fog_strokes;
create policy "read fog" on fog_strokes for select to authenticated using (is_dm(map_campaign(map_id)) or (is_member(map_campaign(map_id)) and (group_id is null or in_group(group_id))));`,
    fails: ['T89'],
  },
  {
    name: 'players can draw fog (P4-3)',
    why: 'a player could reveal the whole map for themselves',
    sql: `drop policy "dm writes fog" on fog_strokes;
create policy "dm writes fog" on fog_strokes for all to authenticated using (is_member(map_campaign(map_id))) with check (is_member(map_campaign(map_id)));`,
    fails: ['T89'],
  },
  {
    name: 'clear_fog open to players (P4-3)',
    why: 'a player could reveal the whole map',
    sql: `create or replace function clear_fog(p_map uuid, p_group uuid, p_mode text) returns bigint language plpgsql security definer set search_path = public as $$ declare s bigint; begin if p_mode is null or p_mode not in ('reveal', 'hide') then raise exception 'Reveal or hide' using errcode = '22023'; end if; insert into fog_strokes (map_id, group_id, mode) values (p_map, p_group, p_mode || '_all') returning seq into s; return s; end $$;`,
    fails: ['T89'],
  },
  {
    name: 'simplify_fog wipes every fog of the map (P4-3)',
    why: 'simplifying one group would erase the other groups and the shared fog',
    sql: `create or replace function simplify_fog(p_map uuid, p_group uuid, p_strokes jsonb) returns integer language plpgsql security definer set search_path = public as $$ declare n integer; begin if not is_dm(map_campaign(p_map)) then raise exception 'Only the DM can do that' using errcode = '42501'; end if; if p_strokes is null or jsonb_typeof(p_strokes) <> 'array' or jsonb_array_length(p_strokes) = 0 then raise exception 'empty' using errcode = '22023'; end if; delete from fog_strokes where map_id = p_map; insert into fog_strokes (map_id, group_id, mode, radius, points) select p_map, p_group, s.value ->> 'mode', coalesce((s.value ->> 'radius')::int, 0), coalesce(s.value -> 'points', '[]'::jsonb) from jsonb_array_elements(p_strokes) with ordinality as s(value, n) order by s.n; get diagnostics n = row_count; return n; end $$;`,
    fails: ['T89'],
  },
  {
    name: 'fog stroke shape not checked (P4-3)',
    why: 'malformed points would reach every client that draws the fog',
    sql: `alter table fog_strokes drop constraint fog_strokes_shape;`,
    fails: ['T89'],
  },
];

function runFile(path) {
  const cmd = RUNNER.replace('{file}', path);
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const failed = new Set([...out.matchAll(/Failed test \d+: "(T\d+):/g)].map(m => m[1]));
  return { ok: r.status === 0, failed, out };
}

const suite = readFileSync(SUITE, 'utf8');
if (!MARKER_LINE.test(suite)) {
  console.error(`Marker "${MARKER}" not found in ${SUITE}`);
  process.exit(2);
}

function main() {
  mkdirSync(TMP_DIR, { recursive: true });

  const baseFile = `${TMP_DIR}/baseline.test.sql`;
  writeFileSync(baseFile, suite);
  const base = runFile(baseFile);
  if (!base.ok) {
    console.error(
      'The unmodified suite does not pass, so the mutation check cannot run. Fix that first (pnpm db:test).',
    );
    console.error(base.out.split('\n').slice(-15).join('\n'));
    return 2;
  }
  console.log('baseline: suite passes\n');
  // MUTATION_ONLY="(P4-2)" runs only the mutations whose name contains that text
  const only = process.env.MUTATION_ONLY;
  const chosen = only ? MUTATIONS.filter(m => m.name.includes(only)) : MUTATIONS;
  if (only) console.log(`only the ${chosen.length} mutations whose name contains "${only}"\n`);

  let bad = 0;
  chosen.forEach((m, i) => {
    const file = `${TMP_DIR}/m${String(i + 1).padStart(2, '0')}.test.sql`;
    writeFileSync(
      file,
      suite.replace(MARKER_LINE, () => `${MARKER}\n${m.sql}`),
    );
    const r = runFile(file);
    const want = [...m.fails].sort();
    const got = [...r.failed].sort();
    const missing = want.filter(t => !r.failed.has(t));
    const extra = got.filter(t => !m.fails.includes(t));
    const caught = !r.ok && missing.length === 0;
    if (!caught) bad++;
    console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${m.name}`);
    console.log(`         ${m.why}`);
    console.log(
      `         must fail: ${want.join(', ')}${extra.length ? `   also failed (knock-on): ${extra.join(', ')}` : ''}${missing.length ? `   DID NOT FAIL: ${missing.join(', ')}` : ''}`,
    );
    if (!caught && r.ok) console.log('         the suite still PASSED with this protection removed: add a test for it');
    if (!caught && !r.ok && got.length === 0)
      console.log(
        `         the runner failed without naming a test (is the SQL valid?): ${r.out.trim().split('\n').slice(-3).join(' | ')}`,
      );
  });

  console.log(`\n${chosen.length - bad} of ${chosen.length} mutations caught`);
  return bad ? 1 : 0;
}

// process.exit would skip `finally`, so the exit code is returned and used last.
let code = 2;
try {
  code = main();
} finally {
  rmSync(TMP_DIR, { recursive: true, force: true });
}
process.exit(code);
