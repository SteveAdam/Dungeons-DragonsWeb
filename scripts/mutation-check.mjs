#!/usr/bin/env node
// Mutation check for the row level security suite: proves the tests fail when a protection is removed.
//
// For each mutation it copies supabase/tests/database/rls.test.sql, injects broken SQL at the line marked
// "@mutation-point", runs that copy, and checks that the tests guarding that protection (T1 to T54) fail.
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

  let bad = 0;
  MUTATIONS.forEach((m, i) => {
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

  console.log(`\n${MUTATIONS.length - bad} of ${MUTATIONS.length} mutations caught`);
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
