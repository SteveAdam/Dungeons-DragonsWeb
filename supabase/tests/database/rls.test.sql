-- =====================================================================
-- Row level security tests (P0-6). Run with: pnpm db:test
-- Everything happens inside one transaction that is rolled back at the end.
-- Test ids (T1 to T18) match the ticket and are used by scripts/mutation-check.mjs.
-- =====================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(113);

-- HELPERS --------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

-- A stable uuid for a label, so the fixture and the tests can name rows without variables.
create function tests.u(label text) returns uuid language sql immutable as $$
  select md5('rls-test:' || label)::uuid
$$;

-- Act as a signed-in user: the authenticated role plus that user's JWT claims.
-- Stop acting with a plain `reset role;`.
create function tests.act_as(who text) returns void language plpgsql as $$
declare uid text := tests.u('user:' || who)::text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid, true);
  set local role authenticated;
end $$;

-- Act as a signed-out visitor.
create function tests.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
end $$;

-- FIXTURE (built as the database owner, so row level security does not apply) ------
-- people: dm, player (a member), outsider (not a member), joiner (used by the join tests)
insert into auth.users (id, email)
select tests.u('user:' || n), n || '@test.local' from unnest(array['dm', 'player', 'outsider', 'joiner']) n;
insert into profiles (id, display_name)
select tests.u('user:' || n), n from unnest(array['dm', 'player', 'outsider', 'joiner']) n
on conflict (id) do nothing;

-- one campaign. The insert trigger makes the DM a member and creates the invite code.
insert into campaigns (id, owner_id, name) values (tests.u('campaign'), tests.u('user:dm'), 'Fixture campaign');
update campaign_secrets set invite_code = 'FIXTURE-CODE-1' where campaign_id = tests.u('campaign');
insert into members (campaign_id, user_id, role) values (tests.u('campaign'), tests.u('user:player'), 'player');

-- a visible map and a hidden map
insert into maps (id, campaign_id, name, image_path, width, height, visible_to_players) values
  (tests.u('map:visible'), tests.u('campaign'), 'Visible map', tests.u('campaign') || '/visible.png', 100, 100, true),
  (tests.u('map:hidden'),  tests.u('campaign'), 'Hidden map',  tests.u('campaign') || '/hidden.png',  100, 100, false);

-- on the visible map: a visible pin, a hidden pin, and a second visible pin (a control)
insert into pins (id, map_id, title, x, y, visible_to_players) values
  (tests.u('pin:visible'), tests.u('map:visible'), 'Visible pin',       10, 10, true),
  (tests.u('pin:hidden'),  tests.u('map:visible'), 'Hidden pin',        20, 20, false),
  (tests.u('pin:control'), tests.u('map:visible'), 'Second visible pin', 30, 30, true);

-- a sub-map under the hidden pin. Its own flag says visible, so only the parent pin hides it.
insert into maps (id, campaign_id, parent_pin_id, name, image_path, width, height, visible_to_players)
values (tests.u('map:sub'), tests.u('campaign'), tests.u('pin:hidden'), 'Sub-map under the hidden pin',
        tests.u('campaign') || '/sub.png', 100, 100, true);

-- DM notes, on the VISIBLE pin so only the table's policy can be what hides them
insert into pin_secrets (pin_id, dm_notes) values (tests.u('pin:visible'), 'DM-only note');

insert into pages (id, campaign_id, title, visible_to_players) values
  (tests.u('page:visible'), tests.u('campaign'), 'Visible page', true),
  (tests.u('page:hidden'),  tests.u('campaign'), 'Hidden page',  false);
insert into folders (id, campaign_id, name) values (tests.u('folder'), tests.u('campaign'), 'A folder');

-- a link touching the hidden pin, and a control link between two visible pins
insert into links (id, campaign_id, from_pin_id, to_pin_id) values
  (tests.u('link:touches-hidden'), tests.u('campaign'), tests.u('pin:visible'), tests.u('pin:hidden')),
  (tests.u('link:control'),        tests.u('campaign'), tests.u('pin:visible'), tests.u('pin:control'));

-- the three map images in storage
insert into storage.objects (bucket_id, name) values
  ('maps', tests.u('campaign') || '/visible.png'),
  ('maps', tests.u('campaign') || '/hidden.png'),
  ('maps', tests.u('campaign') || '/sub.png');

-- scripts/mutation-check.mjs injects its deliberately broken policies on the next line.
-- @mutation-point

-- T1: a player can read the visible pin and cannot read the hidden pin ------------
select tests.act_as('player');
select is((select count(*)::int from pins where id = tests.u('pin:visible')), 1, 'T1: player can read the visible pin');
select is((select count(*)::int from pins where id = tests.u('pin:hidden')), 0, 'T1: player cannot read the hidden pin');
select is((select count(*)::int from pins), 2, 'T1: player sees exactly the two visible pins');

-- T2: a player cannot read any pin_secrets row ---------------------------------------
select is_empty($$ select * from pin_secrets $$, 'T2: player cannot read any pin_secrets row, even for a visible pin');
select is_empty($$ select * from campaign_secrets $$, 'T2: player cannot read the invite code');

-- T3: a player cannot read the hidden map or the sub-map under the hidden pin --------
select is((select count(*)::int from maps where id = tests.u('map:visible')), 1, 'T3: player can read the visible map');
select is((select count(*)::int from maps where id = tests.u('map:hidden')), 0, 'T3: player cannot read the hidden map');
select is((select count(*)::int from maps where id = tests.u('map:sub')), 0, 'T3: player cannot read the sub-map under the hidden pin');

-- T4: a player cannot read the hidden page and can read the visible page -------------
select is((select count(*)::int from pages where id = tests.u('page:visible')), 1, 'T4: player can read the visible page');
select is((select count(*)::int from pages where id = tests.u('page:hidden')), 0, 'T4: player cannot read the hidden page');

-- T5: a player cannot read the link that touches the hidden pin ----------------------
select is((select count(*)::int from links where id = tests.u('link:touches-hidden')), 0, 'T5: player cannot read the link that touches the hidden pin');
select is((select count(*)::int from links where id = tests.u('link:control')), 1, 'T5: player can read a link between two visible pins');
reset role;

-- T6: a non-member can read nothing in the campaign ----------------------------------
select tests.act_as('outsider');
select is((select count(*)::int from campaigns), 0, 'T6: non-member reads no campaign');
select is((select count(*)::int from campaign_secrets), 0, 'T6: non-member reads no invite code');
select is((select count(*)::int from members), 0, 'T6: non-member reads no members');
select is((select count(*)::int from maps), 0, 'T6: non-member reads no maps');
select is((select count(*)::int from pins), 0, 'T6: non-member reads no pins');
select is((select count(*)::int from pin_secrets), 0, 'T6: non-member reads no pin_secrets');
select is((select count(*)::int from folders), 0, 'T6: non-member reads no folders');
select is((select count(*)::int from pages), 0, 'T6: non-member reads no pages');
select is((select count(*)::int from links), 0, 'T6: non-member reads no links');
select is((select count(*)::int from storage.objects), 0, 'T6: non-member reads no map images');
reset role;

-- T7: a player cannot insert, update or delete pins, maps, pages, links or folders ----
select tests.act_as('player');
select throws_ok($$ insert into pins (map_id, title, x, y) values (tests.u('map:visible'), 'Planted', 1, 1) $$, '42501', null, 'T7: player cannot insert a pin');
select is_empty($$ update pins set title = 'Hacked' where id = tests.u('pin:visible') returning id $$, 'T7: player cannot update a pin');
select is_empty($$ delete from pins where id = tests.u('pin:visible') returning id $$, 'T7: player cannot delete a pin');
select throws_ok($$ insert into maps (campaign_id, name, image_path, width, height) values (tests.u('campaign'), 'Planted', tests.u('campaign') || '/planted.png', 1, 1) $$, '42501', null, 'T7: player cannot insert a map');
select is_empty($$ update maps set name = 'Hacked' where id = tests.u('map:visible') returning id $$, 'T7: player cannot update a map');
select is_empty($$ delete from maps where id = tests.u('map:visible') returning id $$, 'T7: player cannot delete a map');
select throws_ok($$ insert into pages (campaign_id, title) values (tests.u('campaign'), 'Planted') $$, '42501', null, 'T7: player cannot insert a page');
select is_empty($$ update pages set title = 'Hacked' where id = tests.u('page:visible') returning id $$, 'T7: player cannot update a page');
select is_empty($$ delete from pages where id = tests.u('page:visible') returning id $$, 'T7: player cannot delete a page');
select throws_ok($$ insert into links (campaign_id, from_pin_id, to_pin_id) values (tests.u('campaign'), tests.u('pin:control'), tests.u('pin:visible')) $$, '42501', null, 'T7: player cannot insert a link');
select is_empty($$ update links set label = 'Hacked' where id = tests.u('link:control') returning id $$, 'T7: player cannot update a link');
select is_empty($$ delete from links where id = tests.u('link:control') returning id $$, 'T7: player cannot delete a link');
select throws_ok($$ insert into folders (campaign_id, name) values (tests.u('campaign'), 'Planted') $$, '42501', null, 'T7: player cannot insert a folder');
select is_empty($$ select * from folders $$, 'T7: player cannot read folders (they are the DM''s filing system)');
select is_empty($$ update folders set name = 'Hacked' where id = tests.u('folder') returning id $$, 'T7: player cannot update a folder');
select is_empty($$ delete from folders where id = tests.u('folder') returning id $$, 'T7: player cannot delete a folder');
reset role;
select is((select title from pins where id = tests.u('pin:visible')), 'Visible pin', 'T7: the pin is unchanged');
select is((select name from maps where id = tests.u('map:visible')), 'Visible map', 'T7: the map is unchanged');
select is((select title from pages where id = tests.u('page:visible')), 'Visible page', 'T7: the page is unchanged');
select is((select count(*)::int from links where campaign_id = tests.u('campaign')), 2, 'T7: both links are still there');
select is((select name from folders where id = tests.u('folder')), 'A folder', 'T7: the folder is unchanged');

-- T8: a player cannot make themselves a DM or change their own role ------------------
select tests.act_as('player');
select throws_ok($$ insert into members (campaign_id, user_id, role) values (tests.u('campaign'), tests.u('user:player'), 'dm') $$, '42501', null, 'T8: a member cannot insert themselves as dm');
select is_empty($$ update members set role = 'dm' where user_id = tests.u('user:player') returning user_id $$, 'T8: a member cannot change their own role');
select is_empty($$ delete from members where user_id = tests.u('user:dm') returning user_id $$, 'T8: a player cannot remove a member');
reset role;
select is((select role from members where campaign_id = tests.u('campaign') and user_id = tests.u('user:player')), 'player', 'T8: the member is still a player');
select tests.act_as('outsider');
select throws_ok($$ insert into members (campaign_id, user_id, role) values (tests.u('campaign'), tests.u('user:outsider'), 'dm') $$, '42501', null, 'T8: a non-member cannot insert themselves as dm');
reset role;

-- T9: join_campaign works with the right code and fails with a wrong one -------------
select tests.act_as('joiner');
select is(join_campaign('FIXTURE-CODE-1'), tests.u('campaign'), 'T9: the right code returns the campaign id');
reset role;
select is((select role from members where campaign_id = tests.u('campaign') and user_id = tests.u('user:joiner')), 'player', 'T9: the joiner became a player');
select tests.act_as('outsider');
select throws_ok($$ select join_campaign('wrong-code') $$, 'P0001', 'Invalid invite code', 'T9: a wrong code fails');
reset role;
select tests.act_as_anon();
select throws_ok($$ select join_campaign('FIXTURE-CODE-1') $$, '42501', null, 'T9: a signed-out visitor cannot call join_campaign');
reset role;
select tests.act_as('dm');
select join_campaign('FIXTURE-CODE-1');
reset role;
select is((select role from members where campaign_id = tests.u('campaign') and user_id = tests.u('user:dm')), 'dm', 'T9: joining your own campaign does not demote the DM');

-- T10: a DM can read and write everything above ----------------------------------------
select tests.act_as('dm');
select is((select count(*)::int from pins), 3, 'T10: DM reads every pin');
select is((select count(*)::int from maps), 3, 'T10: DM reads every map, including the hidden one and the sub-map');
select is((select count(*)::int from pin_secrets), 1, 'T10: DM reads the DM notes');
select is((select count(*)::int from pages), 2, 'T10: DM reads every page');
select is((select count(*)::int from folders), 1, 'T10: DM reads the folders');
select is((select count(*)::int from links), 2, 'T10: DM reads every link');
select is((select count(*)::int from campaign_secrets), 1, 'T10: DM reads the invite code');
select is((select count(*)::int from members), 3, 'T10: DM reads every member (dm, player, joiner)');
select lives_ok($$ do $do$ declare new_id uuid; begin
    insert into pins (map_id, title, x, y) values (tests.u('map:visible'), 'DM pin', 1, 1) returning pins.id into new_id;
    update pins set title = 'Renamed' where pins.id = new_id;  if not found then raise exception 'update did not apply'; end if;
    delete from pins where pins.id = new_id;                   if not found then raise exception 'delete did not apply'; end if;
  end $do$ $$, 'T10: DM can insert, update and delete pins');
select lives_ok($$ do $do$ declare new_id uuid; begin
    insert into maps (campaign_id, name, image_path, width, height) values (tests.u('campaign'), 'DM map', tests.u('campaign') || '/dm.png', 10, 10) returning maps.id into new_id;
    update maps set name = 'Renamed' where maps.id = new_id;   if not found then raise exception 'update did not apply'; end if;
    delete from maps where maps.id = new_id;                   if not found then raise exception 'delete did not apply'; end if;
  end $do$ $$, 'T10: DM can insert, update and delete maps');
select lives_ok($$ do $do$ declare new_id uuid; begin
    insert into pages (campaign_id, title) values (tests.u('campaign'), 'DM page') returning pages.id into new_id;
    update pages set title = 'Renamed' where pages.id = new_id; if not found then raise exception 'update did not apply'; end if;
    delete from pages where pages.id = new_id;                  if not found then raise exception 'delete did not apply'; end if;
  end $do$ $$, 'T10: DM can insert, update and delete pages');
select lives_ok($$ do $do$ declare new_id uuid; begin
    insert into links (campaign_id, from_pin_id, to_pin_id) values (tests.u('campaign'), tests.u('pin:hidden'), tests.u('pin:control')) returning links.id into new_id;
    update links set label = 'Renamed' where links.id = new_id; if not found then raise exception 'update did not apply'; end if;
    delete from links where links.id = new_id;                  if not found then raise exception 'delete did not apply'; end if;
  end $do$ $$, 'T10: DM can insert, update and delete links');
select lives_ok($$ do $do$ declare new_id uuid; begin
    insert into folders (campaign_id, name) values (tests.u('campaign'), 'DM folder') returning folders.id into new_id;
    update folders set name = 'Renamed' where folders.id = new_id; if not found then raise exception 'update did not apply'; end if;
    delete from folders where folders.id = new_id;                 if not found then raise exception 'delete did not apply'; end if;
  end $do$ $$, 'T10: DM can insert, update and delete folders');
select lives_ok($$ do $do$ begin
    insert into pin_secrets (pin_id, dm_notes) values (tests.u('pin:hidden'), 'note');
    update pin_secrets set dm_notes = 'edited' where pin_id = tests.u('pin:hidden'); if not found then raise exception 'update did not apply'; end if;
    delete from pin_secrets where pin_id = tests.u('pin:hidden');                    if not found then raise exception 'delete did not apply'; end if;
  end $do$ $$, 'T10: DM can write DM notes');
reset role;

-- T11: map images follow the map policy (storage policy via can_read_map_image) --------
select tests.act_as('player');
select is((select count(*)::int from storage.objects where bucket_id = 'maps' and name = tests.u('campaign') || '/visible.png'), 1, 'T11: player can read the image of a visible map');
select is((select count(*)::int from storage.objects where bucket_id = 'maps' and name = tests.u('campaign') || '/hidden.png'), 0, 'T11: player cannot read the image of the hidden map');
select is((select count(*)::int from storage.objects where bucket_id = 'maps' and name = tests.u('campaign') || '/sub.png'), 0, 'T11: player cannot read the image of the sub-map under the hidden pin');
reset role;
select tests.act_as('dm');
select is((select count(*)::int from storage.objects where bucket_id = 'maps' and name = tests.u('campaign') || '/hidden.png'), 1, 'T11: DM can read the image of the hidden map');
reset role;
-- an image uploaded but not yet used by any map (the moment between upload and creating the map)
insert into storage.objects (bucket_id, name) values ('maps', tests.u('campaign') || '/draft.png');
select tests.act_as('dm');
select is((select count(*)::int from storage.objects where name = tests.u('campaign') || '/draft.png'), 1, 'T11: DM can read a fresh upload that no map uses yet');
reset role;
select tests.act_as('player');
select is((select count(*)::int from storage.objects where name = tests.u('campaign') || '/draft.png'), 0, 'T11: a player cannot read an image that no map uses');
reset role;

-- T12: a player reads profiles of people in the same campaign, not of strangers ---------
select tests.act_as('player');
select is((select count(*)::int from profiles where id = tests.u('user:dm')), 1, 'T12: player can read the DM''s profile');
select is((select count(*)::int from profiles where id = tests.u('user:player')), 1, 'T12: player can read their own profile');
select is((select count(*)::int from profiles where id = tests.u('user:outsider')), 0, 'T12: player cannot read a stranger''s profile');
reset role;
select tests.act_as('outsider');
select is((select count(*)::int from profiles where id = tests.u('user:dm')), 0, 'T12: a stranger cannot read the DM''s profile');
reset role;

-- =====================================================================
-- T13 to T16: extra tests for the leaks found while reviewing 0002_core_schema.sql
-- =====================================================================

-- T13: hiding something hides everything beneath it ------------------------------------
-- extra rows: a pin flagged visible on the hidden map, a pin flagged visible inside the sub-map, and
-- a grandchild map under that pin whose own flags all say visible
insert into pins (id, map_id, title, x, y, visible_to_players) values
  (tests.u('pin:on-hidden-map'), tests.u('map:hidden'), 'Visible flag on a hidden map',   5, 5, true),
  (tests.u('pin:in-sub'),        tests.u('map:sub'),    'Visible flag inside the sub-map', 5, 5, true);
insert into maps (id, campaign_id, parent_pin_id, name, image_path, width, height, visible_to_players)
values (tests.u('map:grandchild'), tests.u('campaign'), tests.u('pin:in-sub'), 'Grandchild map',
        tests.u('campaign') || '/grandchild.png', 100, 100, true);
insert into storage.objects (bucket_id, name) values ('maps', tests.u('campaign') || '/grandchild.png');

select tests.act_as('player');
select is((select count(*)::int from pins where id = tests.u('pin:on-hidden-map')), 0, 'T13: a pin flagged visible on a hidden map stays hidden');
select is((select count(*)::int from pins where id = tests.u('pin:in-sub')), 0, 'T13: a pin flagged visible inside a sub-map under a hidden pin stays hidden');
select is((select count(*)::int from maps where id = tests.u('map:grandchild')), 0, 'T13: a map two levels under a hidden pin stays hidden');
select is((select count(*)::int from storage.objects where name = tests.u('campaign') || '/grandchild.png'), 0, 'T13: its image stays hidden too');
reset role;

update pins set visible_to_players = true where id = tests.u('pin:hidden');   -- the DM reveals the pin
select tests.act_as('player');
select is((select count(*)::int from maps where id in (tests.u('map:sub'), tests.u('map:grandchild'))), 2, 'T13: revealing the parent pin reveals the sub-map and the grandchild map');
select is((select count(*)::int from pins where id = tests.u('pin:in-sub')), 1, 'T13: and the visible pin inside them');
select is((select count(*)::int from storage.objects where name = tests.u('campaign') || '/grandchild.png'), 1, 'T13: and their images');
reset role;
update pins set visible_to_players = false where id = tests.u('pin:hidden');

-- T14: deleting a hidden parent pin does not publish its sub-map ----------------------
select tests.act_as('dm');
delete from pins where id = tests.u('pin:hidden');
reset role;
select tests.act_as('player');
select is((select count(*)::int from maps where id = tests.u('map:sub')), 0, 'T14: player cannot read the sub-map after its hidden parent pin is deleted');
reset role;
select is((select visible_to_players from maps where id = tests.u('map:sub')), false, 'T14: the sub-map is kept, and hidden');
select is((select parent_pin_id from maps where id = tests.u('map:sub')), null, 'T14: the sub-map no longer has a parent pin');

-- T15: nothing can reference another campaign ----------------------------------------
insert into campaigns (id, owner_id, name) values (tests.u('campaign2'), tests.u('user:outsider'), 'Another campaign');
insert into folders (id, campaign_id, name) values (tests.u('folder2'), tests.u('campaign2'), 'Other folder');
insert into maps (id, campaign_id, name, image_path, width, height) values (tests.u('map2'), tests.u('campaign2'), 'Other map', tests.u('campaign2') || '/other.png', 10, 10);
insert into pins (id, map_id, title, x, y) values (tests.u('pin2'), tests.u('map2'), 'Other pin', 1, 1);
select tests.act_as('dm');
select throws_ok($$ insert into maps (campaign_id, name, image_path, width, height) values (tests.u('campaign'), 'Steal', tests.u('campaign2') || '/other.png', 10, 10) $$, '23514', null, 'T15: a map cannot use an image from another campaign''s folder');
select throws_ok($$ insert into maps (campaign_id, parent_pin_id, name, image_path, width, height) values (tests.u('campaign'), tests.u('pin2'), 'Graft', tests.u('campaign') || '/graft.png', 10, 10) $$, 'P0001', 'A sub-map must belong to the same campaign as its parent pin', 'T15: a sub-map cannot hang off another campaign''s pin');
select throws_ok($$ insert into pages (campaign_id, folder_id, title) values (tests.u('campaign'), tests.u('folder2'), 'x') $$, 'P0001', 'A page must be in a folder from its own campaign', 'T15: a page cannot use another campaign''s folder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('maps', tests.u('campaign2') || '/planted.png') $$, '42501', null, 'T15: a DM cannot upload into another campaign''s folder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('maps', 'not-a-uuid/planted.png') $$, '42501', null, 'T15: a malformed upload path is refused cleanly');
reset role;

-- T16: the last DM stays, ownership is fixed, and helpers are closed to visitors ---------
select tests.act_as('dm');
select throws_ok($$ delete from members where campaign_id = tests.u('campaign') and user_id = tests.u('user:dm') $$, 'P0001', 'A campaign must keep at least one DM', 'T16: the only DM cannot leave');
select lives_ok($$ do $do$ begin
    delete from members where campaign_id = tests.u('campaign') and user_id = tests.u('user:joiner');
    if not found then raise exception 'delete did not apply'; end if;
  end $do$ $$, 'T16: a DM can remove a player (CAM-2)');
select throws_ok($$ update campaigns set owner_id = tests.u('user:player') where id = tests.u('campaign') $$, 'P0001', 'The campaign owner cannot be changed', 'T16: the owner cannot be reassigned');
reset role;
select tests.act_as_anon();
select throws_ok($$ select is_dm(tests.u('campaign')) $$, '42501', null, 'T16: a signed-out visitor cannot call the policy helper functions');
reset role;

-- T17: column rules from the P0-5 draft ---------------------------------------------
select tests.act_as('dm');
select throws_ok($$ insert into pins (map_id, title, x, y, color) values (tests.u('map:visible'), 'Bad colour', 1, 1, 'red') $$, '23514', null, 'T17: a pin colour must be #rrggbb');
select throws_ok($$ insert into pins (map_id, title, x, y, size) values (tests.u('map:visible'), 'Too big', 1, 1, 81) $$, '23514', null, 'T17: a pin size must be 16 to 80');
select throws_ok($$ insert into pins (map_id, title, x, y, music_url) values (tests.u('map:visible'), 'Plain http', 1, 1, 'http://example.com/a.mp3') $$, '23514', null, 'T17: a music link must be https');
select throws_ok($$ insert into links (campaign_id, from_pin_id, to_pin_id) values (tests.u('campaign'), tests.u('pin:visible'), tests.u('pin:control')) $$, '23505', null, 'T17: the same two pins cannot be linked twice');
select throws_ok($$ update maps set fog_mode = 'everyone' where id = tests.u('map:visible') $$, '23514', null, 'T17: fog mode is shared or per_group');
reset role;

-- T18: weather and terrain regions follow the same rules as pins (0003_regions.sql) ------
insert into regions (id, map_id, name, cx, cy, radius, terrain, weather, visible_to_players) values
  (tests.u('region:visible'),       tests.u('map:visible'), 'The Glass Sands', 30, 30, 20, 'desert', 'extreme_heat', true),
  (tests.u('region:hidden'),        tests.u('map:visible'), 'Wraithwood',      70, 70, 20, 'boreal_forest', 'snow', false),
  (tests.u('region:on-hidden-map'), tests.u('map:hidden'),  'Saltmarsh',       50, 50, 20, 'swamp', 'fog', true);
select tests.act_as('player');
select is((select count(*)::int from regions where id = tests.u('region:visible')), 1, 'T18: player can read a revealed region');
select is((select count(*)::int from regions where id = tests.u('region:hidden')), 0, 'T18: player cannot read a hidden region');
select is((select count(*)::int from regions where id = tests.u('region:on-hidden-map')), 0, 'T18: a region flagged visible on a hidden map stays hidden');
select throws_ok($$ insert into regions (map_id, name, cx, cy, radius) values (tests.u('map:visible'), 'Player zone', 1, 1, 5) $$, '42501', null, 'T18: player cannot add a region');
select lives_ok($$ do $do$ begin
    update regions set weather = 'clear' where id = tests.u('region:visible');
    if found then raise exception 'update applied'; end if;
    delete from regions where id = tests.u('region:visible');
    if found then raise exception 'delete applied'; end if;
  end $do$ $$, 'T18: player cannot change or delete a region');
reset role;
select tests.act_as('outsider');
select is((select count(*)::int from regions), 0, 'T18: a non-member reads no region');
reset role;
select tests.act_as('dm');
select is((select count(*)::int from regions), 3, 'T18: DM reads every region');
select lives_ok($$ do $do$ begin
    insert into regions (id, map_id, name, cx, cy, radius) values (tests.u('region:new'), tests.u('map:visible'), 'New zone', 5, 5, 5);
    update regions set weather = 'blizzard' where id = tests.u('region:new');
    if not found then raise exception 'update did not apply'; end if;
    delete from regions where id = tests.u('region:new');
    if not found then raise exception 'delete did not apply'; end if;
  end $do$ $$, 'T18: DM can insert, update and delete regions');
select throws_ok($$ insert into regions (map_id, name, cx, cy, radius) values (tests.u('map2'), 'Foreign zone', 1, 1, 5) $$, '42501', null, 'T18: DM cannot add a region to another campaign''s map');
select throws_ok($$ insert into regions (map_id, name, cx, cy, radius) values (tests.u('map:visible'), 'Flat', 1, 1, 0) $$, '23514', null, 'T18: a region needs a radius above zero');
select throws_ok($$ insert into regions (map_id, name, cx, cy, radius, terrain) values (tests.u('map:visible'), 'Odd', 1, 1, 5, 'lava_lamp') $$, '23514', null, 'T18: terrain must be a known kind');
select throws_ok($$ insert into regions (map_id, name, cx, cy, radius, weather) values (tests.u('map:visible'), 'Odd', 1, 1, 5, 'frogs') $$, '23514', null, 'T18: weather must be a known kind');
reset role;

select * from finish();
rollback;
