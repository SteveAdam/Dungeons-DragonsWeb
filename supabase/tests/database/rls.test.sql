-- =====================================================================
-- Row level security tests (P0-6). Run with: pnpm db:test
-- Everything happens inside one transaction that is rolled back at the end.
-- Test ids (T1 to T89) match the ticket and are used by scripts/mutation-check.mjs.
-- =====================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(779);

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

-- Act as the service role, which is how the roll Edge Function calls roll_d20 (P2-2). It has no auth.uid(), so
-- roll_d20 is told who is rolling (p_actor).
grant usage on schema tests to service_role;
create function tests.act_as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;
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

-- T19 to T24: server dice and the append-only roll log (P1-5, 0004_rolls.sql) ----------

-- T19: members roll, strangers cannot, and nobody rolls for someone else's character
-- (since P2-2 every roll comes through the Edge Function, as the service role, naming the roller as p_actor)
select tests.act_as_service();
select lives_ok($$ select roll_d20(tests.u('user:player'), tests.u('campaign'), null, 'check', 'Perception', 3, 14, 'normal') $$, 'T19: a member can roll');
select throws_ok($$ select roll_d20(tests.u('user:player'), tests.u('campaign'), tests.u('someone-elses-character'), 'check', 'Stealth', 2, 12, 'normal') $$, '42501', 'You can only roll for your own character', 'T19: a player cannot roll for another character');
select throws_ok($$ select roll_d20(tests.u('user:outsider'), tests.u('campaign'), null, 'check', 'Perception', 3, 14, 'normal') $$, '42501', 'Only members of this campaign can roll here', 'T19: a non-member cannot roll');
reset role;
select tests.act_as('player');
select is((select count(*)::int from rolls where label = 'Perception'), 1, 'T19: and sees the roll in the log');
reset role;
select tests.act_as('outsider');
select is((select count(*)::int from rolls), 0, 'T19: a non-member reads no rolls');
reset role;

-- T20: the log cannot be written directly, edited or deleted, by anyone
select tests.act_as('player');
select throws_ok($$ insert into rolls (campaign_id, kind, label, bonus, mode, dice, kept, total) values (tests.u('campaign'), 'check', 'Forged', 0, 'normal', '{20}', 20, 20) $$, '42501', null, 'T20: a player cannot insert a roll directly');
select throws_ok($$ update rolls set total = 99 $$, '42501', null, 'T20: a player cannot update a roll');
select throws_ok($$ delete from rolls $$, '42501', null, 'T20: a player cannot delete a roll');
reset role;
select tests.act_as('dm');
select throws_ok($$ update rolls set total = 99 $$, '42501', null, 'T20: a DM cannot update a roll');
select throws_ok($$ delete from rolls $$, '42501', null, 'T20: a DM cannot delete a roll');
reset role;
-- as the database owner, who bypasses row level security and grants: only the trigger stands in the way
select throws_ok($$ update rolls set total = 99 $$, 'P0001', 'The roll log is append-only: rolls cannot be changed or deleted', 'T20: even the database owner cannot update a roll');
select throws_ok($$ delete from rolls $$, 'P0001', 'The roll log is append-only: rolls cannot be changed or deleted', 'T20: even the database owner cannot delete a roll');
select throws_ok($$ truncate rolls $$, 'P0001', 'The roll log is append-only: rolls cannot be changed or deleted', 'T20: even the database owner cannot truncate the log');
insert into rolls (campaign_id, rolled_by, kind, label, bonus, mode, dice, kept, total)
values (tests.u('campaign2'), tests.u('user:outsider'), 'check', 'Doomed', 0, 'normal', '{7}', 7, 7);
select lives_ok($$ delete from campaigns where id = tests.u('campaign2') $$, 'T20: deleting a whole campaign still removes its rolls');

-- T21: hidden rolls are for the DM alone
select tests.act_as_service();
select throws_ok($$ select roll_d20(tests.u('user:player'), tests.u('campaign'), null, 'check', 'Sneaky', 3, 14, 'normal', true) $$, '42501', 'Only the DM can make a hidden roll', 'T21: a player cannot make a hidden roll');
select lives_ok($$ select roll_d20(tests.u('user:dm'), tests.u('campaign'), null, 'save', 'Secret save', 2, 15, 'normal', true) $$, 'T21: a DM can make a hidden roll');
reset role;
select tests.act_as('dm');
select is((select count(*)::int from rolls where hidden), 1, 'T21: the DM sees the hidden roll');
reset role;
select tests.act_as('player');
select is((select count(*)::int from rolls where hidden), 0, 'T21: players do not see hidden rolls');
select is((select count(*)::int from rolls), 1, 'T21: but still see the open ones');
reset role;

-- T22: the dice follow the roll mode, and the outcome follows the rules
select tests.act_as_service();
select ok((select cardinality(dice) = 1 and kept = dice[1] from roll_d20(tests.u('user:dm'), tests.u('campaign'), null, 'check', 'Normal', 0, null, 'normal')), 'T22: a normal roll has one die');
select ok((select cardinality(dice) = 2 and kept = greatest(dice[1], dice[2]) from roll_d20(tests.u('user:dm'), tests.u('campaign'), null, 'check', 'Advantage', 0, null, 'advantage')), 'T22: advantage keeps the higher of two dice');
select ok((select cardinality(dice) = 2 and kept = least(dice[1], dice[2]) from roll_d20(tests.u('user:dm'), tests.u('campaign'), null, 'check', 'Disadvantage', 0, null, 'disadvantage')), 'T22: disadvantage keeps the lower of two dice');
select ok((select total = kept + 4 from roll_d20(tests.u('user:dm'), tests.u('campaign'), null, 'check', 'Total', 4, null, 'normal')), 'T22: total is the kept die plus the bonus');
select is((select kept from roll_outcome('check', 'advantage', '{5,17}', 0, 10)), 17, 'T22: advantage of 5 and 17 keeps 17');
select is((select kept from roll_outcome('check', 'disadvantage', '{5,17}', 0, 10)), 5, 'T22: disadvantage of 5 and 17 keeps 5');
select is((select (success, crit, fumble)::text from roll_outcome('attack', 'normal', '{20}', 0, 30)), '(t,t,f)', 'T22: an attack with a natural 20 is a critical hit, whatever the AC');
select is((select (success, crit, fumble)::text from roll_outcome('attack', 'normal', '{1}', 30, 5)), '(f,f,t)', 'T22: an attack with a natural 1 is a fumble and misses, whatever the bonus');
select is((select (success, crit, fumble)::text from roll_outcome('check', 'normal', '{20}', 0, 25)), '(f,f,f)', 'T22: a check with a 20 below the DC fails (no automatic success)');
select is((select (success, crit, fumble)::text from roll_outcome('save', 'normal', '{1}', 10, 5)), '(t,f,f)', 'T22: a save with a 1 that meets the DC succeeds (no automatic failure)');
select is((select success from roll_outcome('check', 'normal', '{12}', 3, null)), null, 'T22: with no target there is no verdict');
reset role;

-- T23: at most 30 rolls a minute per person
insert into auth.users (id, email) values (tests.u('user:roller'), 'roller@test.local');
insert into members (campaign_id, user_id, role) values (tests.u('campaign'), tests.u('user:roller'), 'player');
select tests.act_as_service();
select lives_ok($$ do $do$ begin
    for i in 1..30 loop perform roll_d20(tests.u('user:roller'), tests.u('campaign'), null, 'other', 'Spam', 0, null, 'normal'); end loop;
  end $do$ $$, 'T23: 30 rolls in a minute are fine');
select throws_ok($$ select roll_d20(tests.u('user:roller'), tests.u('campaign'), null, 'other', 'Spam', 0, null, 'normal') $$, 'PT429', 'Too many rolls in the last minute. Wait a moment and roll again.', 'T23: the 31st roll within a minute is refused');
reset role;
select tests.act_as('roller');
select throws_ok($$ select d20() $$, '42501', null, 'T23: the die itself cannot be called directly, only through roll_d20');
reset role;

-- T24: the die is fair: 20,000 draws give every face between 4% and 6% (expected 5%, 1,000 draws each).
-- d20() is the die roll_d20 uses for every die. It is drawn here directly, as the owner, because 20,000 calls
-- of roll_d20 would (rightly) hit the rate limit.
create temp table draws as select d20() as face from generate_series(1, 20000);
select is((select count(distinct face)::int from draws where face between 1 and 20), 20, 'T24: every face from 1 to 20 comes up, and nothing else');
select is((select count(*)::int from draws where face not between 1 and 20), 0, 'T24: no value outside 1 to 20');
select ok((select bool_and(n between 800 and 1200) from (select count(*) n from draws group by face) f), 'T24: every face is between 4.0% and 6.0% of 20,000 draws');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'rolls'), 'T24: new rolls are published to realtime');

-- T25 to T28: characters, effects and DM-only effect details (P1-7, 0005_characters.sql) ------
-- fixture: Brannoc for the player, Sera for the second player (roller), one effect on Brannoc with a secret.
-- `reset role` keeps the last user's claims, so clear them: this is the database owner seeding, with no user.
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
insert into characters (id, campaign_id, owner_id, name, sheet, xp) values
  (tests.u('char:brannoc'), tests.u('campaign'), tests.u('user:player'), 'Brannoc', '{"className":"Fighter"}', 6900),
  (tests.u('char:sera'),    tests.u('campaign'), tests.u('user:roller'), 'Sera',    '{"className":"Wizard"}', 900);
insert into effects (id, character_id, name, stat, mode, value, duration) values
  (tests.u('effect:potion'), tests.u('char:brannoc'), 'Potion of Hill Giant Strength', 'str', 'set_at_least', 21, '{"kind":"until","atSeconds":3600}');
insert into effect_secrets (effect_id, hidden_detail) values (tests.u('effect:potion'), 'Brewed by a hag: it curses on the third sip');

-- T25: players read only their own characters
select tests.act_as('player');
select is((select count(*)::int from characters where id = tests.u('char:brannoc')), 1, 'T25: a player reads their own character');
select is((select count(*)::int from characters where id = tests.u('char:sera')), 0, 'T25: a player cannot read another player''s character');
reset role;
select tests.act_as('outsider');
select is((select count(*)::int from characters), 0, 'T25: a non-member reads no characters');
reset role;
select tests.act_as('dm');
select is((select count(*)::int from characters), 2, 'T25: the DM reads every character');
reset role;

-- T26: only the DM changes XP or the sheet; players do not create characters directly (P2-2: the server
-- computes roll bonuses from the sheet, so a player editing it would be the same as sending a bonus)
select tests.act_as('player');
select throws_ok($$ update characters set sheet = sheet || '{"abilityScores":{"str":30}}' where id = tests.u('char:brannoc') $$, 'P0001', 'Only the DM can change a character sheet', 'T26: a player cannot edit their own sheet');
select lives_ok($$ do $do$ begin
    update characters set name = 'Stolen' where id = tests.u('char:sera');
    if found then raise exception 'update applied'; end if;
  end $do$ $$, 'T26: a player cannot edit another player''s character');
select throws_ok($$ update characters set xp = 99999 where id = tests.u('char:brannoc') $$, 'P0001', 'Only the DM can change XP', 'T26: a player cannot change their own XP');
select throws_ok($$ insert into characters (campaign_id, name, xp) values (tests.u('campaign'), 'Instant hero', 355000) $$, 'P0001', 'Only the DM can change XP', 'T26: a player cannot create a character with XP');
select throws_ok($$ insert into characters (campaign_id, name, sheet) values (tests.u('campaign'), 'Fresh recruit', '{"abilityScores":{"str":30}}') $$, '42501', null, 'T26: a player cannot create a character directly, even at 0 XP');
select throws_ok($$ insert into characters (campaign_id, owner_id, name) values (tests.u('campaign'), tests.u('user:roller'), 'Puppet') $$, '42501', null, 'T26: a player cannot create a character for someone else');
reset role;
select tests.act_as('dm');
select lives_ok($$ do $do$ begin
    update characters set xp = 14000 where id = tests.u('char:brannoc');
    if not found then raise exception 'update did not apply'; end if;
  end $do$ $$, 'T26: the DM can change XP');
select throws_ok($$ insert into characters (campaign_id, owner_id, name) values (tests.u('campaign'), tests.u('user:outsider'), 'Gatecrasher') $$, 'P0001', 'A character''s owner must be a member of its campaign', 'T26: a character''s owner must be a member');
select throws_ok($$ update characters set owner_id = tests.u('user:roller') where id = tests.u('char:brannoc') $$, 'P0001', 'A character keeps its owner and its campaign', 'T26: a character cannot be handed to someone else');
reset role;

-- T27: effects are read by the owner and the DM, written by the DM; their secrets are the DM's alone
select tests.act_as('player');
select is((select count(*)::int from effects where character_id = tests.u('char:brannoc')), 1, 'T27: a player reads the effects on their own character');
select is((select count(*)::int from effect_secrets), 0, 'T27: a player cannot read effect secrets');
select throws_ok($$ insert into effects (character_id, name, stat, mode, value) values (tests.u('char:brannoc'), 'Self-buff', 'str', 'add', 10) $$, '42501', null, 'T27: a player cannot give themself an effect');
reset role;
select tests.act_as('roller');
select is((select count(*)::int from effects), 0, 'T27: a player cannot read the effects on another player''s character');
reset role;
select tests.act_as('dm');
select is((select hidden_detail from effect_secrets where effect_id = tests.u('effect:potion')), 'Brewed by a hag: it curses on the third sip', 'T27: the DM reads effect secrets');
select lives_ok($$ do $do$ begin
    insert into effects (id, character_id, name, stat, mode, value) values (tests.u('effect:bless'), tests.u('char:sera'), 'Shield of Faith', 'ac', 'add', 2);
    insert into effect_secrets (effect_id, hidden_detail) values (tests.u('effect:bless'), 'Ends early if she lies');
    delete from effects where id = tests.u('effect:bless');
    if not found then raise exception 'delete did not apply'; end if;
  end $do$ $$, 'T27: the DM can add and remove effects and their secrets');
reset role;

-- T28: rolls name characters: your own, or any for the DM; deleting a character keeps its rolls
select tests.act_as_service();
select lives_ok($$ select roll_d20(tests.u('user:player'), tests.u('campaign'), tests.u('char:brannoc'), 'check', 'Athletics', 6, 15, 'normal') $$, 'T28: a player rolls for their own character');
select throws_ok($$ select roll_d20(tests.u('user:player'), tests.u('campaign'), tests.u('char:sera'), 'check', 'Arcana', 5, 15, 'normal') $$, '42501', 'You can only roll for your own character', 'T28: a player cannot roll for another player''s character');
select lives_ok($$ select roll_d20(tests.u('user:dm'), tests.u('campaign'), tests.u('char:sera'), 'save', 'Wisdom save', 3, 13, 'normal') $$, 'T28: the DM can roll for any character');
reset role;
select tests.act_as('dm');
select lives_ok($$ delete from characters where id = tests.u('char:sera') $$, 'T28: a character with rolls can still be deleted');
reset role;
select is((select count(*)::int from rolls where label = 'Wisdom save' and character_id is null), 1, 'T28: its rolls stay in the log, unlinked');
select throws_ok($$ update rolls set character_id = null where label = 'Athletics' $$, 'P0001', 'The roll log is append-only: rolls cannot be changed or deleted', 'T28: unlinking a roll from a character that still exists is refused');


-- T29: map tools (0006_map_tools.sql): only the DM sets them, and the values stay sensible ---------------
select tests.act_as('player');
select lives_ok($$ do $do$ begin
    update maps set scale_width = 1 where id = tests.u('map:visible');
    if found then raise exception 'update applied'; end if;
  end $do$ $$, 'T29: a player cannot set a map''s scale');
reset role;
select tests.act_as('dm');
select lives_ok($$ do $do$ begin
    update maps set scale_width = 600, scale_unit = 'mi', north_degrees = 45, grid_size = 6 where id = tests.u('map:visible');
    if not found then raise exception 'update did not apply'; end if;
  end $do$ $$, 'T29: the DM sets scale, north and grid');
select throws_ok($$ update maps set scale_width = 0 where id = tests.u('map:visible') $$, '23514', null, 'T29: a scale must be above zero');
select throws_ok($$ update maps set north_degrees = 360 where id = tests.u('map:visible') $$, '23514', null, 'T29: north is 0 to 359 degrees');
select throws_ok($$ update maps set scale_unit = 'leagues' where id = tests.u('map:visible') $$, '23514', null, 'T29: the unit is miles or feet');
reset role;

-- T30 to T34: the entity registry (P2-1, 0007_entities.sql) -------------------------------------------
-- fixture, as the database owner: Mira and Port Vellum are visible, the Cult is hidden; one open link, one
-- hidden link, and one open link that touches the hidden Cult
-- (each campaign also has its official Party entity from P2-6, which these counts leave out)
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
insert into entities (id, campaign_id, type, name, visible_to_players) values
  (tests.u('ent:mira'), tests.u('campaign'), 'npc', 'Mira', true),
  (tests.u('ent:port'), tests.u('campaign'), 'location', 'Port Vellum', true),
  (tests.u('ent:cult'), tests.u('campaign'), 'faction', 'The Drowned Cult', false);
insert into entity_links (id, campaign_id, a_id, b_id, label_ab, label_ba, hidden) values
  (tests.u('link:open'),   tests.u('campaign'), tests.u('ent:mira'), tests.u('ent:port'), 'lives in', 'is home to', false),
  (tests.u('link:secret'), tests.u('campaign'), tests.u('ent:mira'), tests.u('ent:port'), 'secretly rules', 'is secretly ruled by', true),
  (tests.u('link:cult'),   tests.u('campaign'), tests.u('ent:mira'), tests.u('ent:cult'), 'serves', 'is served by', false);

-- T30: players see visible entities only; strangers see none
select tests.act_as('player');
select is((select count(*)::int from entities where type <> 'party'), 2, 'T30: a player sees only the visible entities');
select is((select count(*)::int from entities where id = tests.u('ent:cult')), 0, 'T30: a player cannot see the hidden entity');
reset role;
select tests.act_as('outsider');
select is((select count(*)::int from entities), 0, 'T30: a non-member sees no entities');
reset role;
select tests.act_as('dm');
select is((select count(*)::int from entities where type <> 'party'), 3, 'T30: the DM sees every entity');
reset role;

-- T31: hidden links, and links touching hidden entities, stay hidden
select tests.act_as('player');
select is((select count(*)::int from entity_links where id = tests.u('link:open')), 1, 'T31: a player sees an open link between visible entities');
select is((select count(*)::int from entity_links where id = tests.u('link:secret')), 0, 'T31: a player cannot see a hidden link');
select is((select count(*)::int from entity_links where id = tests.u('link:cult')), 0, 'T31: a player cannot see a link to a hidden entity, even when the link is not hidden');
reset role;
select tests.act_as('dm');
select is((select count(*)::int from entity_links), 3, 'T31: the DM sees every link');
reset role;

-- T32: links stay inside their campaign, never point at themselves, and are never stored twice
insert into campaigns (id, owner_id, name) values (tests.u('campaign3'), tests.u('user:outsider'), 'Third campaign');
insert into entities (id, campaign_id, type, name) values (tests.u('ent:foreign'), tests.u('campaign3'), 'npc', 'Stranger');
select tests.act_as('dm');
select throws_ok($$ select add_link(tests.u('ent:mira'), tests.u('ent:foreign'), 'knows', 'is known by') $$, 'P0001', 'Both ends of a relationship must belong to its campaign', 'T32: a link between two campaigns is rejected');
select throws_ok($$ select add_link(tests.u('ent:mira'), tests.u('ent:mira'), 'admires', 'is admired by') $$, '23514', null, 'T32: a link from an entity to itself is rejected');
select throws_ok($$ select add_link(tests.u('ent:mira'), tests.u('ent:port'), 'Lives In', 'Is Home To') $$, '23505', null, 'T32: the same relationship again (any case) is rejected');
select throws_ok($$ select add_link(tests.u('ent:port'), tests.u('ent:mira'), 'is home to', 'lives in') $$, '23505', null, 'T32: the same relationship in the other direction is rejected');
select lives_ok($$ select add_link(tests.u('ent:port'), tests.u('ent:mira'), 'taxes', 'is taxed by') $$, 'T32: a different relationship between the same two entities is allowed');
select throws_ok($$ insert into entities (campaign_id, type, name) values (tests.u('campaign'), 'npc', 'MIRA') $$, '23505', null, 'T32: entity names are unique in a campaign, ignoring case');
reset role;

-- T33: deleting a folder moves its contents up and deletes no entity
select tests.act_as('dm');
select lives_ok($$ do $do$
  declare outer_f uuid; inner_f uuid;
  begin
    outer_f := (select id from create_folder(tests.u('campaign'), 'Sword Coast'));
    inner_f := (select id from create_folder(tests.u('campaign'), 'Port Vellum', outer_f));
    perform move_entity(tests.u('ent:mira'), inner_f);
    perform move_entity(tests.u('ent:port'), outer_f);
    perform set_config('tests.outer', outer_f::text, true);
    perform set_config('tests.inner', inner_f::text, true);
  end $do$ $$, 'T33: the DM builds folders and files entities in them');
select throws_ok($$ select move_folder(current_setting('tests.outer')::uuid, current_setting('tests.inner')::uuid) $$, 'P0001', 'A folder cannot go inside itself or one of its own subfolders', 'T33: a folder cannot be moved inside its own subfolder');
select lives_ok($$ select delete_folder(current_setting('tests.outer')::uuid) $$, 'T33: the DM deletes the outer folder');
select is((select parent_id from entity_folders where id = current_setting('tests.inner')::uuid), null, 'T33: its subfolder moved up to the top level');
select is((select folder_id from entities where id = tests.u('ent:port')), null, 'T33: its entities moved up to the top level');
select is((select folder_id from entities where id = tests.u('ent:mira')), current_setting('tests.inner')::uuid, 'T33: entities in the subfolder stay in the subfolder');
select is((select count(*)::int from entities where campaign_id = tests.u('campaign') and type <> 'party'), 3, 'T33: no entity was deleted');
reset role;

-- T34: players cannot create, move or delete anything
select tests.act_as('player');
select throws_ok($$ select create_entity(tests.u('campaign'), 'npc', 'Player-made NPC') $$, '42501', 'Only the DM can do that', 'T34: a player cannot create an entity');
select throws_ok($$ select move_entity(tests.u('ent:port'), null) $$, '42501', 'Only the DM can do that', 'T34: a player cannot move an entity');
select throws_ok($$ select delete_entity(tests.u('ent:port')) $$, '42501', 'Only the DM can do that', 'T34: a player cannot delete an entity');
select throws_ok($$ select set_entity_visibility(tests.u('ent:cult'), true) $$, '42501', 'Only the DM can do that', 'T34: a player cannot reveal an entity');
select throws_ok($$ select create_folder(tests.u('campaign'), 'Player folder') $$, '42501', 'Only the DM can do that', 'T34: a player cannot create a folder');
select throws_ok($$ select add_link(tests.u('ent:mira'), tests.u('ent:port'), 'loves', 'is loved by') $$, '42501', 'Only the DM can do that', 'T34: a player cannot add a link');
select throws_ok($$ select reveal_link(tests.u('link:secret')) $$, '42501', 'Only the DM can do that', 'T34: a player cannot reveal a hidden link');
select throws_ok($$ insert into entities (campaign_id, type, name) values (tests.u('campaign'), 'npc', 'Sneaky') $$, '42501', null, 'T34: a player cannot insert an entity directly');
select lives_ok($$ do $do$ begin
    update entities set name = 'Renamed' where id = tests.u('ent:port');
    if found then raise exception 'update applied'; end if;
    delete from entity_links where id = tests.u('link:open');
    if found then raise exception 'delete applied'; end if;
  end $do$ $$, 'T34: a player cannot change entities or links directly');
select is((select count(*)::int from entity_folders), 0, 'T34: a player sees no folders');
reset role;

-- T35 to T37: the server computes the roll bonus (P2-2, 0008_roll_security.sql) -------------------------

-- T35: roll_d20 is for the service role (the roll Edge Function) alone; the bonus matches its breakdown
select tests.act_as('player');
select throws_ok($$ select roll_d20(tests.u('user:player'), tests.u('campaign'), null, 'check', 'Inflated', 30, 10, 'normal') $$, '42501', null, 'T35: a player cannot call roll_d20 directly');
reset role;
select tests.act_as('dm');
select throws_ok($$ select roll_d20(tests.u('user:dm'), tests.u('campaign'), null, 'check', 'Inflated', 30, 10, 'normal') $$, '42501', null, 'T35: nor can a DM');
reset role;
select tests.act_as_anon();
select throws_ok($$ select roll_d20(tests.u('user:player'), tests.u('campaign'), null, 'check', 'Inflated', 30, 10, 'normal') $$, '42501', null, 'T35: nor a signed-out visitor');
reset role;
select ok(not has_function_privilege('authenticated', 'public.roll_d20(uuid, uuid, uuid, text, text, int, int, text, boolean, jsonb)', 'execute'), 'T35: authenticated has no execute grant on roll_d20');
select hasnt_function('public', 'roll_d20', array['uuid', 'uuid', 'text', 'text', 'integer', 'integer', 'text', 'boolean'], 'T35: the Phase 1 roll_d20, which took the bonus from the browser, is gone');
select tests.act_as_service();
select lives_ok($$ select roll_d20(tests.u('user:player'), tests.u('campaign'), tests.u('char:brannoc'), 'check', 'Athletics check', 6, 14, 'normal', false, '[{"label":"Strength","value":3},{"label":"Proficiency","value":3}]') $$, 'T35: the service role rolls for a player, with the breakdown');
select throws_ok($$ select roll_d20(tests.u('user:player'), tests.u('campaign'), null, 'check', 'Padded', 30, 14, 'normal', false, '[{"label":"Strength","value":3}]') $$, '22023', 'The bonus must add up to its breakdown', 'T35: a bonus that does not match its breakdown is refused');
select throws_ok($$ select roll_d20(null, tests.u('campaign'), null, 'check', 'Nobody', 0, 14, 'normal') $$, '42501', 'Sign in first', 'T35: a roll must name who is rolling');
reset role;
select is((select bonus_breakdown from rolls where label = 'Athletics check' and campaign_id = tests.u('campaign')), '[{"label":"Strength","value":3},{"label":"Proficiency","value":3}]'::jsonb, 'T35: the breakdown is stored with the roll');

-- T36: conditions and exhaustion are the DM's to set, and only real ones
select tests.act_as('player');
select throws_ok($$ update characters set conditions = '{invisible}' where id = tests.u('char:brannoc') $$, 'P0001', 'Only the DM can change a character sheet', 'T36: a player cannot give themself a condition');
select throws_ok($$ update characters set exhaustion = 1 where id = tests.u('char:brannoc') $$, 'P0001', 'Only the DM can change a character sheet', 'T36: a player cannot change their own exhaustion');
reset role;
select tests.act_as('dm');
select lives_ok($$ do $do$ begin
    update characters set conditions = '{poisoned,prone}', exhaustion = 2 where id = tests.u('char:brannoc');
    if not found then raise exception 'update did not apply'; end if;
  end $do$ $$, 'T36: the DM sets conditions and exhaustion');
select throws_ok($$ update characters set conditions = '{sleepy}' where id = tests.u('char:brannoc') $$, '23514', null, 'T36: a condition must be one of the SRD conditions');
select throws_ok($$ update characters set exhaustion = 7 where id = tests.u('char:brannoc') $$, '23514', null, 'T36: exhaustion runs from 0 to 6');
reset role;

-- T37: the game clock starts at 0 and only the DM moves it
select is((select game_seconds from campaigns where id = tests.u('campaign')), 0::bigint, 'T37: the game clock starts at 0');
select tests.act_as('player');
select lives_ok($$ do $do$ begin
    update campaigns set game_seconds = 999999 where id = tests.u('campaign');
    if found then raise exception 'update applied'; end if;
  end $do$ $$, 'T37: a player cannot move the game clock');
reset role;
select tests.act_as('dm');
-- (P2-8: the DM moves it with advance_clock, which logs the move)
select lives_ok($$ select advance_clock(tests.u('campaign'), 3600, 'Test hour') $$, 'T37: the DM moves the game clock');
select throws_ok($$ select advance_clock(tests.u('campaign'), -1) $$, '22023', 'Advance the clock by between 1 second and 365 days', 'T37: the game clock never runs backwards');
reset role;

-- T38: SRD equipment (P2-3, 0009_srd_equipment.sql): every signed-in user reads it, nobody writes it ---------
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
insert into srd_weapons (id, name, source, category, kind, data) values
  ('test-club', 'Test Club', 'srd-5.2', 'simple', 'melee', '{"id":"test-club"}');
insert into srd_armor (id, name, source, category, data) values
  ('test-shield', 'Test Shield', 'srd-5.2', 'shield', '{"id":"test-shield"}');
select throws_ok($$ insert into srd_weapons (id, name, source, category, kind, data) values ('home-brew', 'Home Brew', 'homebrew', 'simple', 'melee', '{"id":"home-brew"}') $$, '23514', null, 'T38: only SRD 5.2 content goes in');
select tests.act_as('player');
select is((select count(*)::int from srd_weapons where id = 'test-club'), 1, 'T38: a player reads SRD weapons');
select is((select count(*)::int from srd_armor where id = 'test-shield'), 1, 'T38: a player reads SRD armour');
select throws_ok($$ insert into srd_weapons (id, name, source, category, kind, data) values ('vorpal', 'Vorpal', 'srd-5.2', 'martial', 'melee', '{"id":"vorpal"}') $$, '42501', null, 'T38: a player cannot add a weapon');
select throws_ok($$ update srd_weapons set data = data || '{"damage":{"dice":"9d12"}}' where id = 'test-club' $$, '42501', null, 'T38: a player cannot change a weapon');
select throws_ok($$ delete from srd_armor where id = 'test-shield' $$, '42501', null, 'T38: a player cannot delete armour');
reset role;
select tests.act_as('dm');
select throws_ok($$ update srd_armor set data = '{"id":"test-shield","baseAc":10}' where id = 'test-shield' $$, '42501', null, 'T38: nor can a DM change it');
reset role;
select tests.act_as_anon();
select is((select count(*)::int from srd_weapons), 0, 'T38: a signed-out visitor reads nothing');
reset role;

-- T39: SRD species, classes and backgrounds (P2-4, 0010_srd_characters.sql): read by all signed in, written by none
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
insert into srd_species (id, name, source, data) values ('test-species', 'Test Species', 'srd-5.2', '{"id":"test-species"}');
insert into srd_classes (id, name, source, data) values ('test-class', 'Test Class', 'srd-5.2', '{"id":"test-class"}');
insert into srd_backgrounds (id, name, source, data) values ('test-background', 'Test Background', 'srd-5.2', '{"id":"test-background"}');
select throws_ok($$ insert into srd_classes (id, name, source, data) values ('home-brew', 'Home Brew', 'homebrew', '{"id":"home-brew"}') $$, '23514', null, 'T39: only SRD 5.2 content goes in');
select tests.act_as('player');
select is((select count(*)::int from srd_species where id = 'test-species'), 1, 'T39: a player reads SRD species');
select is((select count(*)::int from srd_classes where id = 'test-class'), 1, 'T39: a player reads SRD classes');
select is((select count(*)::int from srd_backgrounds where id = 'test-background'), 1, 'T39: a player reads SRD backgrounds');
select throws_ok($$ update srd_classes set data = data || '{"hitDie":"d20"}' where id = 'test-class' $$, '42501', null, 'T39: a player cannot change a class');
select throws_ok($$ insert into srd_species (id, name, source, data) values ('dragonkin', 'Dragonkin', 'srd-5.2', '{"id":"dragonkin"}') $$, '42501', null, 'T39: a player cannot add a species');
select throws_ok($$ delete from srd_backgrounds where id = 'test-background' $$, '42501', null, 'T39: a player cannot delete a background');
reset role;
select tests.act_as('dm');
select throws_ok($$ update srd_species set data = '{"id":"test-species","speed":60}' where id = 'test-species' $$, '42501', null, 'T39: nor can a DM change them');
reset role;
select tests.act_as_anon();
select is((select count(*)::int from srd_classes), 0, 'T39: a signed-out visitor reads nothing');
reset role;

-- T40: SRD spells (P2-5, 0011_srd_spells.sql): read by all signed in, written by none ----------------------------
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
insert into srd_spells (id, name, source, level, data) values ('test-spell', 'Test Spell', 'srd-5.2', 1, '{"id":"test-spell","level":1}');
select throws_ok($$ insert into srd_spells (id, name, source, level, data) values ('mislevelled', 'Mislevelled', 'srd-5.2', 9, '{"id":"mislevelled","level":1}') $$, '23514', null, 'T40: the level column matches the record');
select tests.act_as('player');
select is((select level from srd_spells where id = 'test-spell'), 1, 'T40: a player reads SRD spells');
select throws_ok($$ update srd_spells set data = data || '{"level":0}' where id = 'test-spell' $$, '42501', null, 'T40: a player cannot change a spell');
select throws_ok($$ insert into srd_spells (id, name, source, level, data) values ('wish-plus', 'Wish Plus', 'srd-5.2', 9, '{"id":"wish-plus","level":9}') $$, '42501', null, 'T40: a player cannot add a spell');
select throws_ok($$ delete from srd_spells where id = 'test-spell' $$, '42501', null, 'T40: a player cannot delete a spell');
reset role;
select tests.act_as('dm');
select throws_ok($$ update srd_spells set level = 0 where id = 'test-spell' $$, '42501', null, 'T40: nor can a DM change one');
reset role;
select tests.act_as_anon();
select is((select count(*)::int from srd_spells), 0, 'T40: a signed-out visitor reads nothing');
reset role;

-- T41 to T46: the Party, wallets, the XP and coin ledger (P2-6, 0012_party_ledger.sql) ------------------------
-- fixture: the campaign's official Party (made with the campaign); Brannoc (player) is in it. Kael (roller) and
-- Wren (player) join it on creation, making three members. Pip joins nothing: his campaign turned auto-join off.
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
insert into characters (id, campaign_id, owner_id, name) values
  (tests.u('char:kael'), tests.u('campaign'), tests.u('user:roller'), 'Kael'),
  (tests.u('char:wren'), tests.u('campaign'), tests.u('user:player'), 'Wren');
insert into campaigns (id, owner_id, name, settings) values (tests.u('campaign:solo'), tests.u('user:dm'), 'Solo campaign', '{"autoJoinParty": false}');
insert into members (campaign_id, user_id, role) values (tests.u('campaign:solo'), tests.u('user:player'), 'player');
insert into characters (id, campaign_id, owner_id, name) values (tests.u('char:pip'), tests.u('campaign:solo'), tests.u('user:player'), 'Pip');
create function tests.party() returns uuid language sql stable security definer set search_path = public as $$ select official_party(tests.u('campaign')) $$;
grant execute on function tests.party() to anon, authenticated, service_role;

-- T41: only DMs award; players cannot call award_xp, award_coins, split_party_gold or withdraw_from_party
select tests.act_as('player');
select throws_ok($$ select award_xp('character', tests.u('char:brannoc'), 1000, 'quest') $$, '42501', 'Only the DM can do that', 'T41: a player cannot award XP');
select throws_ok($$ select award_xp('party', tests.party(), 1000, 'quest') $$, '42501', 'Only the DM can do that', 'T41: a player cannot award XP to the party');
select throws_ok($$ select award_coins('character', tests.u('char:brannoc'), '{"pp": 100}') $$, '42501', 'Only the DM can do that', 'T41: a player cannot award coins');
select throws_ok($$ select split_party_gold(tests.party()) $$, '42501', 'Only the DM can do that', 'T41: a player cannot split the party pool');
select throws_ok($$ select withdraw_from_party(tests.u('char:brannoc'), '{"gp": 1}') $$, '42501', 'Only the DM can do that', 'T41: a player cannot withdraw from the party pool');
reset role;
select tests.act_as('outsider');
select throws_ok($$ select award_coins('party', tests.party(), '{"gp": 5}') $$, '42501', 'Only the DM can do that', 'T41: nor can someone outside the campaign');
reset role;
select tests.act_as_anon();
select throws_ok($$ select award_xp('party', tests.party(), 1000, 'quest') $$, '42501', null, 'T41: nor a signed-out visitor');
reset role;
select tests.act_as('dm');
select throws_ok($$ select award_xp('character', tests.u('char:brannoc'), 0, 'quest') $$, '22023', 'Award from 1 to 1,000,000 XP', 'T41: an award is at least 1 XP');
select throws_ok($$ select award_xp('character', tests.u('char:brannoc'), 10, 'bribe') $$, '22023', 'The source is encounter, quest, milestone or other', 'T41: the source is one of the four');
select throws_ok($$ select award_coins('character', tests.u('char:brannoc'), '{"ep": 3}') $$, '22023', 'Coins are cp, sp, gp or pp (not ep)', 'T41: coins are cp, sp, gp or pp');
select throws_ok($$ select award_coins('character', tests.u('char:brannoc'), '{"gp": -3}') $$, '22023', 'Each coin amount is a whole number from 0 to 1,000,000', 'T41: an award of coins is never negative');
select lives_ok($$ select award_xp('character', tests.u('char:brannoc'), 50, 'encounter', 'Goblin ambush') $$, 'T41: the DM awards XP to a character');
reset role;
select is((select xp from characters where id = tests.u('char:brannoc')), 14050, 'T41: the character gets all of it');
select is((select note || ' / ' || source from ledger where target_id = tests.u('char:brannoc') and amount = '{"xp": 50}'), 'Goblin ambush / encounter', 'T41: the ledger records the source and the note');

-- T42: 100 XP to a 3-member party gives 33 each, one ledger row per member and a remainder row of 1
select is((select count(*)::int from party_members where party_id = tests.party()), 3, 'T42: the party has three members');
select tests.act_as('dm');
select lives_ok($$ select award_xp('party', tests.party(), 100, 'quest', 'Rescued the miller') $$, 'T42: the DM awards 100 XP to the party');
reset role;
select is((select array_agg(xp order by name) from characters where id in (tests.u('char:brannoc'), tests.u('char:kael'), tests.u('char:wren'))), array[14083, 33, 33], 'T42: each member gets 33');
select is((select count(*)::int from ledger where kind = 'xp' and target_type = 'character' and note = 'Rescued the miller' and amount = '{"xp": 33}'), 3, 'T42: one ledger row per member');
select is((select (amount ->> 'remainder')::int from ledger where target_type = 'party' and target_id = tests.party() and kind = 'xp'), 1, 'T42: a note row records the remainder of 1');
select is((select (amount ->> 'xp')::int from ledger where target_type = 'party' and target_id = tests.party() and kind = 'xp'), 0, 'T42: the remainder is not awarded');
select tests.act_as('dm');
select lives_ok($$ select award_xp('party', tests.party(), 2700, 'milestone') $$, 'T42: the DM awards 2700 XP to the party');
reset role;
select is((select array_agg(xp || ':' || level_applied order by name) from characters where id in (tests.u('char:kael'), tests.u('char:wren'))), array['933:1', '933:1'], 'T42: 933 XP is level 3 by XP, with the sheet still at level 1 (two levels pending)');
select is((select count(*)::int from characters ch where xp <> (select coalesce(sum((amount ->> 'xp')::int), 0) from ledger l where l.kind = 'xp' and l.target_type = 'character' and l.target_id = ch.id)), 0, 'T42: every character''s XP is the sum of their ledger rows');

-- T43: the ledger cannot be changed or deleted, by any role
select tests.act_as('player');
select throws_ok($$ update ledger set amount = '{"xp": 99999}' where target_id = tests.u('char:brannoc') $$, '42501', null, 'T43: a player cannot change the ledger');
select throws_ok($$ insert into ledger (campaign_id, kind, target_type, target_id, amount, source) values (tests.u('campaign'), 'xp', 'character', tests.u('char:brannoc'), '{"xp": 99999}', 'other') $$, '42501', null, 'T43: a player cannot write to the ledger');
reset role;
select tests.act_as('dm');
select throws_ok($$ delete from ledger where target_id = tests.u('char:brannoc') $$, '42501', null, 'T43: nor can the DM delete from it');
reset role;
select tests.act_as_service();
select throws_ok($$ update ledger set note = 'edited' where target_id = tests.u('char:brannoc') $$, 'P0001', 'The ledger is append-only: entries cannot be changed or deleted', 'T43: nor the service role change it');
select throws_ok($$ delete from ledger where target_id = tests.u('char:brannoc') $$, 'P0001', 'The ledger is append-only: entries cannot be changed or deleted', 'T43: nor the service role delete from it');
reset role;
select throws_ok($$ delete from ledger $$, 'P0001', 'The ledger is append-only: entries cannot be changed or deleted', 'T43: nor the database owner');

-- T44: wallets never go negative; deposits move coins from your own wallet to the pool; totals match the ledger
select tests.act_as('dm');
select lives_ok($$ select award_coins('character', tests.u('char:brannoc'), '{"gp": 10, "sp": 4}', 'Goblin purse') $$, 'T44: the DM gives Brannoc 10 gp 4 sp');
reset role;
select tests.act_as('player');
select is((select gp || ' gp ' || sp || ' sp' from wallets where owner_id = tests.u('char:brannoc')), '10 gp 4 sp', 'T44: the player reads their own wallet');
select throws_ok($$ select deposit_to_party(tests.u('char:brannoc'), '{"gp": 11}') $$, '22023', 'Not enough coins: the wallet holds less than that', 'T44: a deposit larger than the wallet fails');
select throws_ok($$ select deposit_to_party(tests.u('char:kael'), '{"gp": 1}') $$, '42501', 'You can only deposit from your own character', 'T44: a player cannot deposit from someone else''s character');
select throws_ok($$ update wallets set gp = 1000 where owner_id = tests.u('char:brannoc') $$, '42501', null, 'T44: a player cannot write to a wallet');
select lives_ok($$ select deposit_to_party(tests.u('char:brannoc'), '{"gp": 7, "sp": 1}') $$, 'T44: a player deposits 7 gp 1 sp');
select is((select gp || ' gp ' || sp || ' sp' from wallets where owner_type = 'party' and owner_id = tests.party()), '7 gp 1 sp', 'T44: the player reads the party pool, which holds the deposit');
select is((select gp || ' gp ' || sp || ' sp' from wallets where owner_id = tests.u('char:brannoc')), '3 gp 3 sp', 'T44: and their wallet holds the rest');
select is((select count(*)::int from wallets where owner_id = tests.u('char:kael')), 0, 'T44: a player cannot read another player''s wallet');
select is((select count(*)::int from ledger where target_id = tests.u('char:kael')), 0, 'T44: nor the ledger rows about another player''s character');
reset role;
select throws_ok($$ update wallets set gp = -1 where owner_id = tests.u('char:brannoc') $$, '23514', null, 'T44: a wallet never holds a negative number of coins');
select tests.act_as('dm');
select lives_ok($$ select split_party_gold(tests.party()) $$, 'T44: the DM splits the pool (7 gp 1 sp) among the three members');
reset role;
select is((select gp || ' gp ' || sp || ' sp' from wallets where owner_type = 'party' and owner_id = tests.party()), '1 gp 1 sp', 'T44: what does not divide evenly stays in the pool');
select is((select array_agg(gp || ' gp ' || sp || ' sp' order by owner_id) from wallets where owner_id in (tests.u('char:kael'), tests.u('char:wren'))), array['2 gp 0 sp', '2 gp 0 sp'], 'T44: each member gets 2 gp');
select is((select amount -> 'remainder' from ledger where kind = 'coin' and target_id = tests.party() and amount ? 'remainder'), '{"cp": 0, "sp": 1, "gp": 1, "pp": 0}'::jsonb, 'T44: a note row records the remainder');
select is((select count(*)::int from wallets w where (w.cp, w.sp, w.gp, w.pp) <> (
    select coalesce(sum((amount ->> 'cp')::int), 0), coalesce(sum((amount ->> 'sp')::int), 0), coalesce(sum((amount ->> 'gp')::int), 0), coalesce(sum((amount ->> 'pp')::int), 0)
    from ledger l where l.kind = 'coin' and l.target_type = w.owner_type and l.target_id = w.owner_id)), 0, 'T44: every wallet is the sum of its ledger rows');

-- T45: one official party per campaign, made with it; new characters join it unless the campaign says not to
select is((select count(*)::int from parties p join entities e on e.id = p.entity_id where p.campaign_id = tests.u('campaign') and p.is_official and e.type = 'party'), 1, 'T45: a new campaign has its official Party, a party entity');
select is((select count(*)::int from party_members where party_id = tests.party() and character_id in (tests.u('char:kael'), tests.u('char:wren'))), 2, 'T45: new characters join the official Party');
select is((select count(*)::int from party_members where character_id = tests.u('char:pip')), 0, 'T45: unless the campaign turned autoJoinParty off');
select tests.act_as('dm');
select throws_ok($$ with e as (insert into entities (campaign_id, type, name) values (tests.u('campaign'), 'party', 'Rival party') returning id) insert into parties (entity_id, campaign_id, is_official) select id, tests.u('campaign'), true from e $$, '23505', null, 'T45: a campaign has only one official Party');
select lives_ok($$ with e as (insert into entities (id, campaign_id, type, name) values (tests.u('party:scouts'), tests.u('campaign'), 'party', 'Scouting party') returning id) insert into parties (entity_id, campaign_id) select id, tests.u('campaign') from e $$, 'T45: the DM can add other parties');
select throws_ok($$ select delete_entity(tests.party()) $$, 'P0001', 'The official Party cannot be deleted', 'T45: the official Party cannot be deleted');
reset role;
select tests.act_as('player');
select throws_ok($$ insert into party_members (party_id, character_id) values (tests.u('party:scouts'), tests.u('char:wren')) $$, '42501', null, 'T45: a player cannot add characters to a party');
reset role;

-- T46: players cannot change XP or the applied level themselves
select tests.act_as('player');
select throws_ok($$ update characters set xp = 355000 where id = tests.u('char:wren') $$, 'P0001', 'Only the DM can change XP', 'T46: a player cannot change their XP');
select throws_ok($$ update characters set level_applied = 3 where id = tests.u('char:wren') $$, 'P0001', 'Only the DM can change the applied level', 'T46: a player cannot apply levels themself');
reset role;
select tests.act_as('dm');
select lives_ok($$ do $do$ begin
    update characters set level_applied = 3 where id = tests.u('char:wren');
    if not found then raise exception 'update did not apply'; end if;
  end $do$ $$, 'T46: the DM can set the applied level');
select throws_ok($$ update characters set level_applied = 21 where id = tests.u('char:wren') $$, '23514', null, 'T46: the applied level runs from 1 to 20');
reset role;

-- T47 to T51: items, equipment, attunement and transfers (P2-7, 0013_items.sql) ----------------------------------
-- fixture, made by the DM with create_item: Brannoc (player) carries chain mail, plate armour, a shield, a second
-- shield, a scroll, 10 arrows, a bound crown and four rings that need attunement; Kael (roller) a dagger; the
-- Party a rope; the world a lost idol. The scroll has a DM secret.
create function tests.item(n text) returns uuid language sql stable security definer set search_path = public as $$
  select id from entities where campaign_id = tests.u('campaign') and type = 'item' and name = n
$$;
grant execute on function tests.item(text) to anon, authenticated, service_role;
select tests.act_as('dm');
select lives_ok($$ do $do$ begin
    perform create_item(tests.u('campaign'), 'Chain Mail', 'armor', '{"armor":{"category":"heavy","baseAc":16,"strength":13,"stealthDisadvantage":true}}', 'character', tests.u('char:brannoc'), 1, 55, 7500, null, false, false, 'chain-mail');
    perform create_item(tests.u('campaign'), 'Plate Armor', 'armor', '{"armor":{"category":"heavy","baseAc":18,"strength":15,"stealthDisadvantage":true}}', 'character', tests.u('char:brannoc'));
    perform create_item(tests.u('campaign'), 'Shield', 'shield', '{"armor":{"category":"shield","baseAc":2,"strength":null,"stealthDisadvantage":false}}', 'character', tests.u('char:brannoc'));
    perform create_item(tests.u('campaign'), 'Spare Shield', 'shield', '{"armor":{"category":"shield","baseAc":2,"strength":null,"stealthDisadvantage":false}}', 'character', tests.u('char:brannoc'));
    perform create_item(tests.u('campaign'), 'Scroll of Fog Cloud', 'consumable', '{"requirements":[{"stat":"int","min":10,"onUnmet":"lock"}]}', 'character', tests.u('char:brannoc'));
    perform create_item(tests.u('campaign'), 'Arrows', 'gear', '{}', 'character', tests.u('char:brannoc'), 10, 0.05);
    perform create_item(tests.u('campaign'), 'Crown Shard', 'quest', '{}', 'character', tests.u('char:brannoc'), 1, null, 0, null, false, true);
    perform create_item(tests.u('campaign'), 'Ring ' || n, 'magic', '{"effects":[{"stat":"ac","mode":"add","value":1}]}', 'character', tests.u('char:brannoc'), 1, null, 0, 'rare', true) from generate_series(1, 4) n;
    perform create_item(tests.u('campaign'), 'Dagger', 'weapon', '{}', 'character', tests.u('char:kael'));
    perform create_item(tests.u('campaign'), 'Rope', 'gear', '{}', 'party', tests.party());
    perform create_item(tests.u('campaign'), 'Lost Idol', 'quest', '{}', 'world', null);
    insert into item_secrets (item_id, dm_notes, hidden_effect) values (tests.item('Scroll of Fog Cloud'), 'Forged by the cult', 'Summons the cult instead');
  end $do$ $$, 'T47: the DM creates items for characters, the party and the world');
reset role;
select is((select count(*)::int from item_transfers where campaign_id = tests.u('campaign') and item_name = 'Dagger' and from_name = 'Found' and to_name = 'Kael' and status = 'accepted'), 1, 'T47: placing an item records where it went');

-- T47: a player sees only their own characters' items and the party's; never item secrets
select tests.act_as('player');
select is((select count(*)::int from items where owner_id = tests.u('char:brannoc')), 11, 'T47: a player reads the items their character carries');
select is((select count(*)::int from items where owner_type = 'party'), 1, 'T47: and the party''s items');
select is((select count(*)::int from items where entity_id = tests.item('Dagger')), 0, 'T47: but not another player''s items');
select is((select count(*)::int from items where owner_type = 'world'), 0, 'T47: nor items left in the world');
select is((select name from entities where id = tests.item('Scroll of Fog Cloud')), 'Scroll of Fog Cloud', 'T47: a player reads their item''s name, though its Codex entry is hidden');
select is((select count(*)::int from item_secrets), 0, 'T47: a player never reads item secrets');
select lives_ok($$ do $do$ begin
    update items set quantity = 99 where entity_id = tests.item('Arrows');
    if found then raise exception 'update applied'; end if;
  end $do$ $$, 'T47: a player cannot change an item directly');
select throws_ok($$ insert into items (entity_id, campaign_id, kind, owner_type, owner_id) values (tests.u('ent:mira'), tests.u('campaign'), 'gear', 'character', tests.u('char:brannoc')) $$, '42501', null, 'T47: a player cannot create items');
select throws_ok($$ select create_item(tests.u('campaign'), 'Vorpal Sword', 'magic', '{}', 'character', tests.u('char:brannoc')) $$, '42501', 'Only the DM can do that', 'T47: nor call create_item');
reset role;
select tests.act_as('dm');
select is((select hidden_effect from item_secrets where item_id = tests.item('Scroll of Fog Cloud')), 'Summons the cult instead', 'T47: the DM reads item secrets');
select throws_ok($$ update items set owner_type = 'character', owner_id = tests.u('char:kael') where entity_id = tests.item('Rope') $$, 'P0001', 'Items move with offer_transfer or force_move_item, so every move is recorded', 'T47: even the DM moves items only through the functions');
reset role;

-- T48: bound items cannot be offered; ownership moves only on accept; declining leaves it where it was
select tests.act_as('player');
select throws_ok($$ select offer_transfer(tests.item('Crown Shard'), tests.u('char:kael')) $$, '22023', 'This item is bound: it cannot be given', 'T48: a bound item cannot be offered');
select throws_ok($$ select offer_transfer(tests.item('Dagger'), tests.u('char:wren')) $$, '42501', 'You can only give items your own character carries', 'T48: a player cannot offer someone else''s item');
select lives_ok($$ select offer_transfer(tests.item('Scroll of Fog Cloud'), tests.u('char:kael')) $$, 'T48: a player offers the scroll to Kael');
select is((select owner_id from items where entity_id = tests.item('Scroll of Fog Cloud')), tests.u('char:brannoc'), 'T48: the scroll stays with Brannoc until Kael accepts');
select throws_ok($$ select offer_transfer(tests.item('Scroll of Fog Cloud'), tests.u('char:wren')) $$, '22023', 'This item has already been offered: cancel that offer first', 'T48: one open offer per item');
select throws_ok($$ select accept_transfer((select id from item_transfers where campaign_id = tests.u('campaign') and item_name = 'Scroll of Fog Cloud' and status = 'pending')) $$, '42501', 'Only the recipient can accept this', 'T48: the giver cannot accept their own offer');
reset role;
select tests.act_as('roller');
select is((select count(*)::int from item_transfers where campaign_id = tests.u('campaign') and status = 'pending' and to_id = tests.u('char:kael')), 1, 'T48: the offer is in Kael''s inbox, with its name');
select is((select count(*)::int from items where entity_id = tests.item('Scroll of Fog Cloud')), 0, 'T48: Kael''s player cannot read the scroll itself before accepting');
select lives_ok($$ select decline_transfer((select id from item_transfers where campaign_id = tests.u('campaign') and item_name = 'Scroll of Fog Cloud' and status = 'pending')) $$, 'T48: Kael declines');
reset role;
select is((select owner_id from items where entity_id = tests.item('Scroll of Fog Cloud')), tests.u('char:brannoc'), 'T48: declining leaves the scroll with Brannoc');
select tests.act_as('player');
select lives_ok($$ select offer_transfer(tests.item('Scroll of Fog Cloud'), tests.u('char:kael')) $$, 'T48: Brannoc offers it again');
reset role;
select tests.act_as('roller');
select lives_ok($$ select accept_transfer((select id from item_transfers where campaign_id = tests.u('campaign') and item_name = 'Scroll of Fog Cloud' and status = 'pending')) $$, 'T48: Kael accepts');
select is((select count(*)::int from items where entity_id = tests.item('Scroll of Fog Cloud') and owner_id = tests.u('char:kael')), 1, 'T48: now the scroll is Kael''s, and his player reads it');
reset role;
select is((select string_agg(status, ',' order by seq) from item_transfers where campaign_id = tests.u('campaign') and item_name = 'Scroll of Fog Cloud' and from_name = 'Brannoc'), 'declined,accepted', 'T48: the history keeps the declined offer and the accepted one');
select tests.act_as('outsider');
select is((select count(*)::int from item_transfers), 0, 'T48: someone outside the campaign reads no transfers');
reset role;

-- T49: no fourth attuned item; one suit of armour and one shield at a time
select tests.act_as('player');
select lives_ok($$ select attune_item(tests.item('Ring ' || n)) from generate_series(1, 3) n $$, 'T49: Brannoc attunes to three rings');
select throws_ok($$ select attune_item(tests.item('Ring 4')) $$, 'P0001', 'A character can be attuned to no more than three items: end attunement to another first', 'T49: the fourth attuned item is refused');
select throws_ok($$ select attune_item(tests.item('Chain Mail')) $$, '22023', 'This item does not need attunement', 'T49: only items that need attunement can be attuned');
select lives_ok($$ select unattune_item(tests.item('Ring 1')); select attune_item(tests.item('Ring 4')) $$, 'T49: ending one attunement frees a place');
select lives_ok($$ select equip_item(tests.item('Chain Mail')); select equip_item(tests.item('Shield')) $$, 'T49: Brannoc puts on chain mail and takes up a shield');
select throws_ok($$ select equip_item(tests.item('Plate Armor')) $$, 'P0001', 'Only one suit of armour can be worn at a time: take the other off first', 'T49: a second suit of armour is refused');
select throws_ok($$ select equip_item(tests.item('Spare Shield')) $$, 'P0001', 'Only one shield can be carried at a time: put the other down first', 'T49: a second shield is refused');
select throws_ok($$ select equip_item(tests.item('Arrows')) $$, 'P0001', 'Only weapons, armour, shields and magic items can be equipped', 'T49: gear is carried, not equipped');
reset role;
select tests.act_as('dm');
select throws_ok($$ update items set attuned = true where entity_id = tests.item('Dagger') $$, '23514', null, 'T49: an item that does not need attunement is never attuned, even set directly');
reset role;

-- T50: a player cannot equip or attune an item they do not own
select tests.act_as('player');
select throws_ok($$ select equip_item(tests.item('Dagger')) $$, '42501', 'You can only equip or attune items your own character carries', 'T50: a player cannot equip another player''s item');
select throws_ok($$ select equip_item(tests.item('Rope')) $$, '42501', 'You can only equip or attune items your own character carries', 'T50: nor a party item');
reset role;
select tests.act_as('roller');
select throws_ok($$ select unequip_item(tests.item('Chain Mail')) $$, '42501', 'You can only equip or attune items your own character carries', 'T50: nor take off someone else''s armour');
reset role;

-- T51: giving 4 of 10 arrows leaves 6 and makes a stack of 4
select tests.act_as('player');
select throws_ok($$ select offer_transfer(tests.item('Arrows'), tests.u('char:kael'), 11) $$, '22023', 'Give between 1 and 10 of these', 'T51: you cannot give more than the stack');
select lives_ok($$ select offer_transfer(tests.item('Arrows'), tests.u('char:kael'), 4) $$, 'T51: Brannoc offers 4 arrows');
reset role;
select tests.act_as('roller');
select lives_ok($$ select accept_transfer((select id from item_transfers where campaign_id = tests.u('campaign') and item_name = 'Arrows' and status = 'pending')) $$, 'T51: Kael accepts');
reset role;
select is((select quantity from items where entity_id = tests.item('Arrows')), 6, 'T51: Brannoc keeps 6');
select is((select i.quantity || ' ' || e.name from items i join entities e on e.id = i.entity_id where i.owner_id = tests.u('char:kael') and i.kind = 'gear'), '4 Arrows (2)', 'T51: Kael has a new stack of 4');
select tests.act_as('dm');
select lives_ok($$ select force_move_item(tests.item('Chain Mail'), 'party', tests.party()) $$, 'T51: the DM moves Brannoc''s chain mail to the party at once');
reset role;
select is((select owner_type || ':' || equipped from items where entity_id = tests.item('Chain Mail')), 'party:false', 'T51: a moved item is no longer worn');

-- T52 to T54: the game clock log and the DM's effects tool (P2-8, 0014_clock_effects.sql) ---------------------
-- the test campaign's clock stands at 3600 (T37)

-- T52: only the DM advances the clock, and every move is logged
select tests.act_as('player');
select throws_ok($$ select advance_clock(tests.u('campaign'), 600) $$, '42501', 'Only the DM can do that', 'T52: a player cannot advance the clock');
select is((select count(*)::int from game_clock_events where campaign_id = tests.u('campaign')), 1, 'T52: a player reads the clock log');
reset role;
select tests.act_as('outsider');
select throws_ok($$ select advance_clock(tests.u('campaign'), 600) $$, '42501', 'Only the DM can do that', 'T52: nor can someone outside the campaign');
select is((select count(*)::int from game_clock_events), 0, 'T52: who reads none of its clock log');
reset role;
select tests.act_as_anon();
select throws_ok($$ select advance_clock(tests.u('campaign'), 600) $$, '42501', null, 'T52: nor a signed-out visitor');
reset role;
select tests.act_as('dm');
select is((select advance_clock(tests.u('campaign'), 600, 'Searched the crypt')), 4200::bigint, 'T52: the DM advances the clock 10 minutes, to 4200');
select is((select from_seconds || '->' || to_seconds || ' ' || reason from game_clock_events where campaign_id = tests.u('campaign') order by to_seconds desc limit 1), '3600->4200 Searched the crypt', 'T52: the move is logged with its reason');
select throws_ok($$ update campaigns set game_seconds = 99999 where id = tests.u('campaign') $$, 'P0001', 'The clock moves with advance_clock, so every change is logged', 'T52: even the DM cannot set the clock without logging it');
select throws_ok($$ select advance_clock(tests.u('campaign'), 31536001) $$, '22023', 'Advance the clock by between 1 second and 365 days', 'T52: at most a year at a time');
reset role;

-- T53: the clock log is append-only for every role
select tests.act_as('player');
select throws_ok($$ insert into game_clock_events (campaign_id, from_seconds, to_seconds) values (tests.u('campaign'), 0, 1) $$, '42501', null, 'T53: a player cannot write to the clock log');
reset role;
select tests.act_as('dm');
select throws_ok($$ delete from game_clock_events where campaign_id = tests.u('campaign') $$, '42501', null, 'T53: nor can the DM delete from it');
reset role;
select tests.act_as_service();
select throws_ok($$ update game_clock_events set reason = 'edited' where campaign_id = tests.u('campaign') $$, 'P0001', 'The clock log is append-only: events cannot be changed or deleted', 'T53: nor the service role change it');
reset role;
select throws_ok($$ delete from game_clock_events $$, 'P0001', 'The clock log is append-only: events cannot be changed or deleted', 'T53: nor the database owner');

-- T54: only the DM applies effects; a hidden detail reaches DMs only
select tests.act_as('player');
select throws_ok($$ select apply_effect(tests.u('char:brannoc'), 'Self-blessing', '', 'str', 'add', 10, '{"kind":"permanent"}') $$, '42501', 'Only the DM can do that', 'T54: a player cannot apply an effect');
reset role;
select tests.act_as('dm');
select lives_ok($$ select apply_effect(tests.u('char:brannoc'), 'Potion of Hill Giant Strength', 'Potion', 'str', 'set_at_least', 21, '{"kind":"for","seconds":3600}', false, 'Brewed by a hag: it curses on the third sip') $$, 'T54: the DM applies the potion for an hour, with a hidden detail');
select is((select duration from effects where character_id = tests.u('char:brannoc') and name = 'Potion of Hill Giant Strength' and source = 'Potion' order by created_at desc limit 1), '{"kind": "until", "atSeconds": 7800}'::jsonb, 'T54: "for an hour" ends an hour after the clock''s 4200');
select lives_ok($$ select apply_effect(tests.u('char:brannoc'), 'Shield of Faith', 'Spell', 'ac', 'add', 2, '{"kind":"for","seconds":600}', true) $$, 'T54: an effect without a hidden detail');
select is((select count(*)::int from effect_secrets s join effects e on e.id = s.effect_id where e.name = 'Shield of Faith'), 0, 'T54: makes no secret');
select throws_ok($$ select apply_effect(tests.u('char:brannoc'), 'Blink', '', 'ac', 'add', 1, '{"kind":"for","seconds":0}') $$, '22023', 'An effect lasts between 1 second and 365 days', 'T54: a timed effect lasts at least a second');
reset role;
select tests.act_as('player');
select is((select count(*)::int from effects where character_id = tests.u('char:brannoc') and name = 'Potion of Hill Giant Strength' and duration ->> 'atSeconds' = '7800'), 1, 'T54: the player reads the effect on their character');
select is((select count(*)::int from effects e where e.character_id = tests.u('char:brannoc') and to_jsonb(e)::text like '%hag%'), 0, 'T54: and nothing of its hidden detail');
select is((select count(*)::int from effect_secrets), 0, 'T54: a player reads no effect secrets');
reset role;
select tests.act_as('dm');
select is((select s.hidden_detail from effect_secrets s join effects e on e.id = s.effect_id where e.duration ->> 'atSeconds' = '7800'), 'Brewed by a hag: it curses on the third sip', 'T54: the DM reads the hidden detail');
reset role;

-- T55 to T57: the character creation wizard (P2-9, 0015_character_creation.sql) ------------------------------

-- T55: ability scores are rolled by the server, logged, and cannot be re-rolled while unused
select tests.act_as('outsider');
select throws_ok($$ select roll_ability_scores(tests.u('campaign')) $$, '42501', 'Only members of this campaign can roll here', 'T55: someone outside the campaign cannot roll ability scores there');
reset role;
select tests.act_as_anon();
select throws_ok($$ select roll_ability_scores(tests.u('campaign')) $$, '42501', null, 'T55: nor a signed-out visitor');
reset role;
select tests.act_as('joiner');
select throws_ok($$ select roll_ability_scores(tests.u('campaign')) $$, '42501', 'Only members of this campaign can roll here', 'T55: nor someone who has not joined');
reset role;
select tests.act_as('player');
select lives_ok($$ select roll_ability_scores(tests.u('campaign')) $$, 'T55: a player rolls their ability scores');
select is((select cardinality(dice) || ' d6, ' || kind from rolls where campaign_id = tests.u('campaign') and kind = 'ability_roll'), '24 d6, ability_roll', 'T55: six sets of 4d6 go in the roll log');
select ok((select 6 >= all (dice) and 1 <= all (dice) from rolls where campaign_id = tests.u('campaign') and kind = 'ability_roll'), 'T55: every die is a d6');
select throws_ok($$ select roll_ability_scores(tests.u('campaign')) $$, '22023', 'You have already rolled ability scores for a character here: use those first', 'T55: a second roll is refused while the first is unused');
select throws_ok($$ update rolls set dice = array_fill(6, array[24]) where kind = 'ability_roll' $$, '42501', null, 'T55: the roll cannot be changed');
reset role;

-- T56: a wizard draft is its owner's alone
select tests.act_as('player');
select lives_ok($$ insert into character_drafts (campaign_id, data) values (tests.u('campaign'), '{"step": "abilities", "name": "Wren"}') $$, 'T56: a player saves a draft');
select lives_ok($$ update character_drafts set data = data || '{"step": "skills"}' where campaign_id = tests.u('campaign') $$, 'T56: and saves it again');
select is((select data ->> 'step' from character_drafts where campaign_id = tests.u('campaign')), 'skills', 'T56: and reads it back');
select throws_ok($$ insert into character_drafts (user_id, campaign_id, data) values (tests.u('user:roller'), tests.u('campaign'), '{}') $$, '42501', null, 'T56: a player cannot save a draft as someone else');
reset role;
select tests.act_as('roller');
select is((select count(*)::int from character_drafts), 0, 'T56: another player reads no one else''s draft');
reset role;
select tests.act_as('dm');
select is((select count(*)::int from character_drafts), 0, 'T56: nor does the DM');
reset role;
select tests.act_as('outsider');
select throws_ok($$ insert into character_drafts (campaign_id, data) values (tests.u('campaign'), '{}') $$, '42501', null, 'T56: someone outside the campaign cannot save a draft for it');
reset role;

-- T57: characters are created only by the create-character function (service role), in one step
select tests.act_as('player');
select throws_ok($$ select create_character_from_wizard(tests.u('user:player'), tests.u('campaign'), 'Shortcut', '{}', '[]', 1000) $$, '42501', null, 'T57: a player cannot call the creation function directly');
reset role;
select tests.act_as_service();
select throws_ok($$ select create_character_from_wizard(tests.u('user:outsider'), tests.u('campaign'), 'Gatecrasher', '{}', '[]', 0) $$, '42501', 'Only members of this campaign can create a character here', 'T57: the actor must be a member');
select throws_ok($$ select create_character_from_wizard(tests.u('user:roller'), tests.u('campaign'), 'Borrowed', '{}', '[]', 0, (select id from rolls where kind = 'ability_roll' and campaign_id = tests.u('campaign'))) $$, '22023', 'Those ability scores do not come from your unused ability roll', 'T57: nobody can use another player''s ability roll');
select lives_ok($$ select create_character_from_wizard(tests.u('user:player'), tests.u('campaign'), 'Wren the Second', '{"className":"Fighter","name":"ignored","xp":99999}',
    '[{"name":"Chain Mail","kind":"armor","definition":{"armor":{"category":"heavy","baseAc":16,"strength":13,"stealthDisadvantage":true}},"weight":55,"quantity":1,"value_cp":7500,"srd_ref":"chain-mail","equipped":true},
      {"name":"Javelin","kind":"weapon","definition":{},"weight":2,"quantity":8,"value_cp":50,"srd_ref":"javelin","equipped":true}]',
    18, (select id from rolls where kind = 'ability_roll' and campaign_id = tests.u('campaign'))) $$, 'T57: the service role creates a character from the player''s roll');
reset role;
select is((select xp || ' ' || level_applied || ' ' || (sheet ? 'xp')::text from characters where name = 'Wren the Second'), '0 1 false', 'T57: the new character starts at 0 XP and level 1, whatever the sheet said');
select is((select e.type::text || ' ' || e.name from characters c join entities e on e.id = c.entity_id where c.name = 'Wren the Second'), 'player Wren the Second', 'T57: with its player entity');
select is((select string_agg(e.name || ' x' || i.quantity || case when i.equipped then ' worn' else '' end, ', ' order by e.name) from items i join entities e on e.id = i.entity_id join characters c on c.id = i.owner_id where c.name = 'Wren the Second'), 'Chain Mail (2) x1 worn, Javelin x8 worn', 'T57: its starting items');
select is((select gp from wallets w join characters c on c.id = w.owner_id where c.name = 'Wren the Second'), 18, 'T57: its starting gold, in the ledger');
select is((select count(*)::int from party_members pm join characters c on c.id = pm.character_id where c.name = 'Wren the Second'), 1, 'T57: and its place in the Party');
select is((select count(*)::int from character_drafts where user_id = tests.u('user:player') and campaign_id = tests.u('campaign')), 0, 'T57: the draft is cleared');
select tests.act_as_service();
select throws_ok($$ select create_character_from_wizard(tests.u('user:player'), tests.u('campaign'), 'Wren the Third', '{}', '[]', 0, (select id from rolls where kind = 'ability_roll' and campaign_id = tests.u('campaign'))) $$, '22023', 'Those ability scores do not come from your unused ability roll', 'T57: a roll makes only one character');
reset role;
select tests.act_as('player');
select lives_ok($$ select roll_ability_scores(tests.u('campaign')) $$, 'T57: once used, the player can roll for their next character');
reset role;

-- T58 to T60: the level-up flow (P2-10, 0016_level_up.sql) -------------------------------------------------------
-- fixture: Ivo (player), a level 1 Fighter at 900 XP: two levels pending
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
insert into characters (id, campaign_id, owner_id, name, sheet, xp, level_applied) values
  (tests.u('char:ivo'), tests.u('campaign'), tests.u('user:player'), 'Ivo', '{"className":"Fighter","hitDice":{"die":"d10","total":1,"spent":0},"hp":{"max":12,"current":12,"temp":0}}', 900, 1);

-- T58: the Hit Point Die is rolled by the server, for the owner's pending level, once
select tests.act_as('roller');
select throws_ok($$ select roll_hit_die(tests.u('char:ivo')) $$, '42501', 'You can only roll for your own character', 'T58: another player cannot roll for Ivo');
reset role;
select tests.act_as('player');
select lives_ok($$ select roll_hit_die(tests.u('char:ivo')) $$, 'T58: Ivo''s player rolls his Hit Point Die');
select is((select kind || ' for level ' || target from rolls where character_id = tests.u('char:ivo')), 'hit_die for level 2', 'T58: the roll is logged for level 2');
select ok((select dice[1] between 1 and 10 from rolls where character_id = tests.u('char:ivo')), 'T58: a d10 shows 1 to 10');
select throws_ok($$ select roll_hit_die(tests.u('char:ivo')) $$, '22023', 'You have already rolled for this level: use that roll', 'T58: no second roll for the same level');
select throws_ok($$ select roll_hit_die(tests.u('char:wren')) $$, '22023', 'No level-up is waiting: the character needs more XP', 'T58: no roll without a pending level');
reset role;

-- T59: levels are applied only by the apply-level-up function (service role), for the owner, one at a time
select tests.act_as('player');
select throws_ok($$ select apply_level_up_from_function(tests.u('user:player'), tests.u('char:ivo'), 1, '{}', '{}', 6) $$, '42501', null, 'T59: a player cannot call the apply function directly');
select throws_ok($$ update characters set level_applied = 2 where id = tests.u('char:ivo') $$, 'P0001', 'Only the DM can change the applied level', 'T59: nor set the level themself');
reset role;
select tests.act_as_service();
select throws_ok($$ select apply_level_up_from_function(tests.u('user:roller'), tests.u('char:ivo'), 1, '{}', '{}', 6) $$, '42501', 'You can only level up your own character', 'T59: a second account cannot apply someone else''s level-up');
select throws_ok($$ select apply_level_up_from_function(tests.u('user:player'), tests.u('char:ivo'), 2, '{}', '{}', 6) $$, '22023', 'The character is no longer at level 2: reload and try again', 'T59: choices for the wrong level are refused');
select throws_ok($$ select apply_level_up_from_function(tests.u('user:player'), tests.u('char:ivo'), 1, '{}', '{}', 6, tests.u('roll:fake')) $$, '22023', 'That hit point roll is not this level''s unused roll', 'T59: only the level''s own roll counts');
select lives_ok($$ select apply_level_up_from_function(tests.u('user:player'), tests.u('char:ivo'), 1, '{"className":"Fighter","hp":{"max":19,"current":19,"temp":0},"levelApplied":2}', '{"toLevel":2}', 7, (select id from rolls where character_id = tests.u('char:ivo'))) $$, 'T59: Ivo''s player applies level 2 with the roll');
select lives_ok($$ select apply_level_up_from_function(tests.u('user:player'), tests.u('char:ivo'), 2, '{"className":"Fighter","hp":{"max":25,"current":25,"temp":0},"levelApplied":3}', '{"toLevel":3}', 6) $$, 'T59: then level 3 with the average');
select throws_ok($$ select apply_level_up_from_function(tests.u('user:player'), tests.u('char:ivo'), 3, '{}', '{}', 6) $$, '22023', 'No level-up is waiting: the character needs more XP', 'T59: no level without the XP');
reset role;
select is((select level_applied || ' ' || (sheet -> 'hp' ->> 'max') || ' ' || (sheet ? 'levelApplied')::text from characters where id = tests.u('char:ivo')), '3 25 false', 'T59: Ivo is level 3 with the new sheet (the level lives in its column)');

-- T60: the audit rows exist, are read by the owner and the DM, and cannot be changed
select tests.act_as('player');
select is((select string_agg(from_level || '->' || to_level || ' +' || hp_gain, ', ' order by to_level) from level_up_events where character_id = tests.u('char:ivo')), '1->2 +7, 2->3 +6', 'T60: the owner reads the level-up log');
select throws_ok($$ update level_up_events set hp_gain = 99 where character_id = tests.u('char:ivo') $$, '42501', null, 'T60: and cannot change it');
reset role;
select tests.act_as('roller');
select is((select count(*)::int from level_up_events), 0, 'T60: another player reads none of it');
reset role;
select tests.act_as('dm');
select is((select count(*)::int from level_up_events where character_id = tests.u('char:ivo')), 2, 'T60: the DM reads it');
reset role;
select tests.act_as_service();
select throws_ok($$ update level_up_events set hp_gain = 99 $$, 'P0001', 'The level-up log is append-only: entries cannot be changed or deleted', 'T60: nor can the service role change it');
reset role;
select throws_ok($$ delete from level_up_events $$, 'P0001', 'The level-up log is append-only: entries cannot be changed or deleted', 'T60: nor the database owner delete it');

-- T61 to T65: spells, the long rest and details (P2-11, 0017_spells_details_rest.sql) ----------------------------
-- fixture: a test class and spells (CI starts with no SRD rows), and Lyra (player), a level 3 "Test Wizard" with
-- 4 level 1 slots and 2 level 2 slots, one spell lasting until a long rest, 3 spent Hit Point Dice and Exhaustion 2
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
insert into srd_classes (id, name, source, data) values ('test-wizard', 'Test Wizard', 'srd-5.2',
  '{"id":"test-wizard","name":"Test Wizard","spellcasting":{"ability":"int","preparation":"spellbook"},"levels":[{"level":3,"columns":{"preparedSpells":4,"slots1":4,"slots2":2,"slots3":"—"}}]}');
insert into srd_spells (id, name, source, level, data) values
  ('test-bolt', 'Test Bolt', 'srd-5.2', 0, '{"id":"test-bolt","name":"Test Bolt","level":0,"classes":["Test Wizard"],"concentration":false,"ritual":false}'),
  ('test-missile', 'Test Missile', 'srd-5.2', 1, '{"id":"test-missile","name":"Test Missile","level":1,"classes":["Test Wizard"],"concentration":false,"ritual":false}'),
  ('test-bless', 'Test Bless', 'srd-5.2', 1, '{"id":"test-bless","name":"Test Bless","level":1,"classes":["Test Wizard"],"concentration":true,"ritual":false}'),
  ('test-alarm', 'Test Alarm', 'srd-5.2', 1, '{"id":"test-alarm","name":"Test Alarm","level":1,"classes":["Test Wizard"],"concentration":false,"ritual":true}'),
  ('test-blur', 'Test Blur', 'srd-5.2', 2, '{"id":"test-blur","name":"Test Blur","level":2,"classes":["Test Wizard"],"concentration":true,"ritual":false}'),
  ('test-ball', 'Test Ball', 'srd-5.2', 3, '{"id":"test-ball","name":"Test Ball","level":3,"classes":["Test Wizard"],"concentration":false,"ritual":false}');
insert into characters (id, campaign_id, owner_id, name, xp, level_applied, exhaustion, sheet) values
  (tests.u('char:lyra'), tests.u('campaign'), tests.u('user:player'), 'Lyra', 900, 3, 2,
   '{"className":"Test Wizard","hp":{"max":20,"current":5,"temp":0},"hitDice":{"die":"d6","total":3,"spent":3},"details":{"personalityTraits":"","ideals":"","bonds":"","flaws":"","appearance":"Ink-stained","backstory":"Apprentice"},"alignment":"Neutral",
     "spells":{"cantrips":["Test Bolt"],"prepared":["Test Missile","Test Bless","Test Blur"],"spellbook":["Test Missile","Test Bless","Test Alarm","Test Blur"]}}');
insert into effects (character_id, name, stat, mode, value, duration) values
  (tests.u('char:lyra'), 'Until a long rest', 'ac', 'add', 1, '{"kind":"rest","rest":"long"}'),
  (tests.u('char:lyra'), 'Mage Armor', 'ac', 'set', 13, '{"kind":"until","atSeconds":999999}');
create function tests.lyra_slots() returns text language sql stable security definer set search_path = public as $$
  select array_to_string(slots_used[1:2], '/') from character_spell_state where character_id = tests.u('char:lyra')
$$;
grant execute on function tests.lyra_slots() to authenticated, service_role;

-- T61: a player cannot spend another player's slots, or change slots directly
select tests.act_as('roller');
select throws_ok($$ select cast_spell(tests.u('char:lyra'), 'Test Missile', 1) $$, '42501', 'You can only do that for your own character', 'T61: another player cannot cast Lyra''s spells');
select throws_ok($$ select set_prepared_spells(tests.u('char:lyra'), '{}') $$, '42501', 'You can only do that for your own character', 'T61: nor change what she has prepared');
reset role;
select tests.act_as('player');
select lives_ok($$ select cast_spell(tests.u('char:lyra'), 'Test Bolt') $$, 'T61: Lyra''s player casts a cantrip');
select is(tests.lyra_slots(), '0/0', 'T61: a cantrip spends no slot');
select throws_ok($$ insert into character_spell_state (character_id, campaign_id) values (tests.u('char:wren'), tests.u('campaign')) $$, '42501', null, 'T61: a player cannot write spell state');
select throws_ok($$ update character_spell_state set slots_used = array_fill(0, array[9]) where character_id = tests.u('char:lyra') $$, '42501', null, 'T61: nor reset spent slots directly');
reset role;

-- T62: casting spends slots and refuses one that is not there; rituals spend none; concentration replaces concentration
select tests.act_as('player');
select lives_ok($$ select cast_spell(tests.u('char:lyra'), 'Test Missile', 1); select cast_spell(tests.u('char:lyra'), 'Test Missile', 1) $$, 'T62: two level 1 casts');
select lives_ok($$ select cast_spell(tests.u('char:lyra'), 'Test Blur', 2) $$, 'T62: one level 2 cast');
select is(tests.lyra_slots(), '2/1', 'T62: the slots spent match: 2 of level 1, 1 of level 2');
select lives_ok($$ select cast_spell(tests.u('char:lyra'), 'Test Missile', 2) $$, 'T62: a level 1 spell cast with a level 2 slot');
select throws_ok($$ select cast_spell(tests.u('char:lyra'), 'Test Missile', 2) $$, '22023', 'No level 2 spell slot left', 'T62: casting without an available slot is refused');
select throws_ok($$ select cast_spell(tests.u('char:lyra'), 'Test Blur', 1) $$, '22023', 'Cast Test Blur with a slot of level 2 or higher', 'T62: a spell needs a slot of its level or higher');
select throws_ok($$ select cast_spell(tests.u('char:lyra'), 'Test Ball', 3) $$, '22023', 'Test Ball is not prepared', 'T62: only prepared spells are cast');
select lives_ok($$ select cast_spell(tests.u('char:lyra'), 'Test Alarm', null, true) $$, 'T62: a ritual from the spellbook, though not prepared');
select is(tests.lyra_slots(), '2/2', 'T62: ritual casting spends nothing');
select throws_ok($$ select cast_spell(tests.u('char:lyra'), 'Test Missile', null, true) $$, '22023', 'Test Missile is not a ritual', 'T62: only ritual spells are cast as rituals');
select is((select concentration ->> 'spell' from character_spell_state where character_id = tests.u('char:lyra')), 'Test Blur', 'T62: Lyra concentrates on Test Blur');
select lives_ok($$ select cast_spell(tests.u('char:lyra'), 'Test Bless', 1) $$, 'T62: then casts Test Bless, another concentration spell');
select is((select concentration ->> 'spell' from character_spell_state where character_id = tests.u('char:lyra')), 'Test Bless', 'T62: the second concentration spell ends the first');
select is((select ended_concentration from spell_casts where character_id = tests.u('char:lyra') and spell = 'Test Bless'), 'Test Blur', 'T62: the cast log records which concentration ended');
select lives_ok($$ select break_concentration(tests.u('char:lyra')) $$, 'T62: she breaks concentration');
select is((select concentration from character_spell_state where character_id = tests.u('char:lyra')), null, 'T62: and concentrates on nothing');
select throws_ok($$ update spell_casts set spell = 'Wish' $$, '42501', null, 'T62: a player cannot change the cast log');
reset role;
select throws_ok($$ delete from spell_casts $$, 'P0001', 'This log is append-only: entries cannot be changed or deleted', 'T62: nor can the database owner');

-- T63: prepared spells keep the class's rules, and change only after a rest (the campaign default)
select tests.act_as('player');
select throws_ok($$ select set_prepared_spells(tests.u('char:lyra'), '{"Test Missile","Test Alarm"}') $$, '22023', 'Prepared spells change after a long rest, before you cast with a slot', 'T63: after spending a slot, the list waits for a rest');
reset role;
select tests.act_as('dm');
select lives_ok($$ select set_prepared_spells(tests.u('char:lyra'), '{"Test Missile","Test Alarm"}') $$, 'T63: the DM can change it at any time');
select is((select sheet -> 'spells' -> 'prepared' from characters where id = tests.u('char:lyra')), '["Test Missile", "Test Alarm"]'::jsonb, 'T63: the sheet holds the new list, with the rest of the spells as they were');
select is((select sheet -> 'spells' -> 'cantrips' from characters where id = tests.u('char:lyra')), '["Test Bolt"]'::jsonb, 'T63: cantrips untouched');
select throws_ok($$ select set_prepared_spells(tests.u('char:lyra'), '{"Test Missile","Test Bless","Test Alarm","Test Blur","Test Missile"}') $$, '22023', 'Prepare each spell only once', 'T63: each spell once');
select throws_ok($$ select set_prepared_spells(tests.u('char:lyra'), '{"Test Ball"}') $$, '22023', 'Test Ball is not a Test Wizard spell of a level you have slots for', 'T63: only spell levels with slots');
reset role;

-- T64: the simple long rest is the DM's, and restores what SRD 5.2.1 says
select tests.act_as('player');
select throws_ok($$ select simple_long_rest(tests.u('char:lyra')) $$, '42501', 'Only the DM can do that', 'T64: a player cannot give themself a long rest');
select throws_ok($$ select simple_long_rest_party(tests.u('campaign')) $$, '42501', 'Only the DM can do that', 'T64: nor the whole party one');
reset role;
select tests.act_as('dm');
select lives_ok($$ select simple_long_rest(tests.u('char:lyra')) $$, 'T64: the DM gives Lyra a simple long rest');
reset role;
select is(tests.lyra_slots(), '0/0', 'T64: every spell slot comes back');
select is((select (sheet -> 'hp' ->> 'current') || ' hp, ' || (sheet -> 'hitDice' ->> 'spent') || ' dice spent, exhaustion ' || exhaustion from characters where id = tests.u('char:lyra')), '20 hp, 0 dice spent, exhaustion 1', 'T64: all hit points and all spent Hit Point Dice back; Exhaustion down by 1');
select is((select string_agg(name, ', ') from effects where character_id = tests.u('char:lyra')), 'Mage Armor', 'T64: effects lasting until a rest end; timed ones stay');
select is((select prepare_open::text || ' ' || coalesce(concentration::text, 'none') from character_spell_state where character_id = tests.u('char:lyra')), 'true none', 'T64: concentration ends and prepared spells may change again');
select is((select details ->> 'hitDiceSpentBefore' from rest_events where character_id = tests.u('char:lyra')), '3', 'T64: the rest is logged with what it restored');
select tests.act_as('player');
select lives_ok($$ select set_prepared_spells(tests.u('char:lyra'), '{"Test Missile","Test Bless"}') $$, 'T64: after the rest, the player prepares again');
reset role;
select tests.act_as('dm');
select is((select simple_long_rest_party(tests.u('campaign'))), (select count(*)::int from party_members where party_id = official_party(tests.u('campaign'))), 'T64: the party long rest rests every member');
reset role;
select throws_ok($$ update rest_events set kind = 'long' $$, 'P0001', 'This log is append-only: entries cannot be changed or deleted', 'T64: the rest log cannot be changed');

-- T65: the Details tab is the owner's (and the DM's) to write, within its limits
select is((select data ->> 'appearance' || ' / ' || (data ->> 'alignment') from character_details where character_id = tests.u('char:lyra')), 'Ink-stained / Neutral', 'T65: details start from what the wizard put in the sheet');
select tests.act_as('player');
select lives_ok($$ update character_details set data = data || '{"age":"23","eyes":"grey","symbol":"moon","allies":"The Lantern Guild"}' where character_id = tests.u('char:lyra') $$, 'T65: the owner edits the details');
select is((select data ->> 'symbol' from character_details where character_id = tests.u('char:lyra')), 'moon', 'T65: and reads them back');
select throws_ok($$ update character_details set data = data || jsonb_build_object('age', repeat('x', 41)) where character_id = tests.u('char:lyra') $$, '23514', null, 'T65: every field has its limit');
select throws_ok($$ update character_details set data = data || '{"symbol":"dragon-logo"}' where character_id = tests.u('char:lyra') $$, '23514', null, 'T65: the symbol is one of the built-in icons');
select throws_ok($$ update character_details set data = data || '{"script":"<b>"}' where character_id = tests.u('char:lyra') $$, '23514', null, 'T65: only the known fields');
reset role;
select tests.act_as('roller');
select is((select count(*)::int from character_details where character_id = tests.u('char:lyra')), 0, 'T65: another player cannot read them');
select lives_ok($$ do $do$ begin
    update character_details set data = '{}' where character_id = tests.u('char:lyra');
    if found then raise exception 'update applied'; end if;
  end $do$ $$, 'T65: nor change them');
reset role;

-- P3-1 FIXTURE: layered maps. A visible world map with a hidden region and a visible region. Beneath the hidden
-- region a region map (flagged visible), beneath its visible pin a hut map (flagged visible): only the hidden
-- region hides them. Beneath the visible region a fully visible chain.
insert into maps (id, campaign_id, name, image_path, width, height, visible_to_players) values
  (tests.u('map:world'), tests.u('campaign'), 'Sword Coast', tests.u('campaign') || '/world.png', 100, 100, true);
insert into regions (id, map_id, name, cx, cy, radius, visible_to_players) values
  (tests.u('region:wood'), tests.u('map:world'), 'Mourning Wood', 10, 10, 5, false),
  (tests.u('region:moor'),   tests.u('map:world'), 'High Moor',     50, 50, 5, true);
insert into maps (id, campaign_id, parent_region_id, name, image_path, width, height, visible_to_players) values
  (tests.u('map:wood'), tests.u('campaign'), tests.u('region:wood'), 'Mourning Wood map', tests.u('campaign') || '/wood.png', 100, 100, true),
  (tests.u('map:moor'), tests.u('campaign'), tests.u('region:moor'),   'High Moor map',     tests.u('campaign') || '/moor.png', 100, 100, true);
insert into pins (id, map_id, title, x, y, visible_to_players) values
  (tests.u('pin:hut'),   tests.u('map:wood'), 'Hermit''s hut', 5, 5, true),
  (tests.u('pin:cairn'), tests.u('map:moor'), 'Old cairn',     5, 5, true);
insert into maps (id, campaign_id, parent_pin_id, name, image_path, width, height, visible_to_players) values
  (tests.u('map:hut'),   tests.u('campaign'), tests.u('pin:hut'),   'Hermit''s hut map', tests.u('campaign') || '/hut.png',   100, 100, true),
  (tests.u('map:cairn'), tests.u('campaign'), tests.u('pin:cairn'), 'Cairn map',         tests.u('campaign') || '/cairn.png', 100, 100, true);

-- T66: a hidden region hides its detail map, the map beneath that, and both images, from players
select tests.act_as('player');
select is((select count(*)::int from maps where id in (tests.u('map:wood'), tests.u('map:hut'))), 0, 'T66: a player cannot read the map beneath a hidden region, nor the map beneath that');
select is(can_read_map_image(tests.u('campaign') || '/wood.png') or can_read_map_image(tests.u('campaign') || '/hut.png'), false, 'T66: nor their images');
select is((select count(*)::int from maps where id in (tests.u('map:moor'), tests.u('map:cairn'))), 2, 'T66: the chain beneath a visible region is readable (control)');
select is(can_read_map_image(tests.u('campaign') || '/cairn.png'), true, 'T66: and so is its deepest image (control)');
reset role;
select tests.act_as('dm');
select is((select count(*)::int from maps where id in (tests.u('map:wood'), tests.u('map:hut'))), 2, 'T66: the DM reads the hidden chain');
reset role;
update regions set visible_to_players = true where id = tests.u('region:wood');
select tests.act_as('player');
select is((select count(*)::int from maps where id = tests.u('map:hut')), 1, 'T66: revealing the region reveals the chain beneath it');
reset role;
update regions set visible_to_players = false where id = tests.u('region:wood');

-- T67: a map can never be its own ancestor, and has at most one parent
select tests.act_as('dm');
select throws_ok($$ update maps set parent_pin_id = tests.u('pin:hut') where id = tests.u('map:world') $$, '22023', 'A map cannot be placed beneath itself or one of its own detail maps', 'T67: linking a map beneath its own grandchild is rejected');
select throws_ok($$ update maps set parent_pin_id = tests.u('pin:hut'), parent_region_id = null where id = tests.u('map:wood') $$, '22023', 'A map cannot be placed beneath itself or one of its own detail maps', 'T67: so is linking a map beneath a pin on itself');
select throws_ok($$ update maps set parent_region_id = tests.u('region:moor') where id = tests.u('map:hut') $$, '23514', null, 'T67: a map cannot have a parent pin and a parent region');
select lives_ok($$ update maps set parent_pin_id = null, parent_region_id = tests.u('region:moor') where id = tests.u('map:hut') $$, 'T67: moving a map beneath another region works');
select is((select visible_to_players from maps where id = tests.u('map:hut')), false, 'T67: a map players could not see stays hidden when it is moved');
select lives_ok($$ update maps set parent_region_id = null, parent_pin_id = tests.u('pin:hut') where id = tests.u('map:hut') $$, 'T67: and back');
reset role;
update maps set visible_to_players = true where id = tests.u('map:hut');

-- T68: map_ancestors gives the chain, and never a hidden ancestor to a player
select tests.act_as('dm');
select is((select string_agg(name || ' via ' || via_kind, ' < ' order by depth) from map_ancestors(tests.u('map:hut'))), 'Mourning Wood map via pin < Sword Coast via region', 'T68: the DM gets the whole chain, nearest first, with the link that leads down');
select throws_ok($$ select * from map_ancestors(tests.u('map:hut'), true) $$, '42501', 'We could not find that map', 'T68: a DM previewing as a player gets what a player gets');
reset role;
select tests.act_as('player');
select throws_ok($$ select * from map_ancestors(tests.u('map:hut')) $$, '42501', 'We could not find that map', 'T68: a player gets nothing for a map beneath a hidden region');
select is((select string_agg(name, ' < ' order by depth) from map_ancestors(tests.u('map:cairn'))), 'High Moor map < Sword Coast', 'T68: and the chain of a map they can see');
reset role;
select tests.act_as('outsider');
select throws_ok($$ select * from map_ancestors(tests.u('map:cairn')) $$, '42501', 'We could not find that map', 'T68: a stranger gets nothing');
reset role;

-- T69: deleting a parent pin or region leaves the detail map as a top-level map, hidden if its parent was
select tests.act_as('dm');
select lives_ok($$ delete from regions where id = tests.u('region:wood') $$, 'T69: the DM deletes the hidden region');
select is((select coalesce(parent_region_id::text, 'top level') || ', visible ' || visible_to_players from maps where id = tests.u('map:wood')), 'top level, visible false', 'T69: its map is kept as a hidden top-level map');
select lives_ok($$ delete from pins where id = tests.u('pin:cairn') $$, 'T69: the DM deletes the visible pin');
select is((select coalesce(parent_pin_id::text, 'top level') || ', visible ' || visible_to_players from maps where id = tests.u('map:cairn')), 'top level, visible true', 'T69: its map is kept as a top-level map, as visible as before');
reset role;

-- P3-2 FIXTURE: the Mourning Wood region on the visible map, with a thornwolf pack (35%, night only), Orsa the
-- hedge witch (folk, noticed), a hidden mossy shrine (DC 14), an always-there bandit pair, a spawn pin and DM notes.
-- The clock is put at noon (12:00 on day 1) through the clock_move flag, as advance_clock would.
insert into regions (id, map_id, name, cx, cy, radius, visible_to_players) values
  (tests.u('region:content'), tests.u('map:visible'), 'Mourning Wood', 40, 40, 10, true);
insert into entities (id, campaign_id, type, name) values
  (tests.u('ent:orsa'), tests.u('campaign'), 'npc', 'Orsa'),
  (tests.u('ent:lore'), tests.u('campaign'), 'lore', 'Old legend');
insert into region_content (id, region_id, kind, name, monster_ref, state, spawn_rule) values
  (tests.u('rc:wolves'), tests.u('region:content'), 'creature', 'Thornwolf pack', 'srd:wolf', 'hidden',
   '{"mode":"chance","chance":35,"timeOfDay":"night","count":{"min":1,"max":3}}'),
  (tests.u('rc:bandits'), tests.u('region:content'), 'creature', 'Bandit pair', null, 'noticed',
   '{"mode":"always","chance":100,"timeOfDay":"any","count":{"min":2,"max":2}}');
insert into region_content (id, region_id, kind, name, entity_id, state) values
  (tests.u('rc:orsa'), tests.u('region:content'), 'folk', 'Orsa the hedge witch', tests.u('ent:orsa'), 'noticed');
insert into region_content (id, region_id, kind, name, state, hint_text, discovery_dc) values
  (tests.u('rc:shrine'), tests.u('region:content'), 'find', 'Mossy shrine', 'hidden', 'Something glints', 14);
insert into region_content_secrets (content_id, dm_notes) values (tests.u('rc:shrine'), 'The shrine holds a cursed idol');
insert into spawn_pins (id, map_id, x, y, kind, label, content_id) values
  (tests.u('spawn:wolves'), tests.u('map:visible'), 45, 45, 'creature', 'Wolf den', tests.u('rc:wolves'));
select set_config('app.clock_move', 'on', true);
update campaigns set game_seconds = 12 * 3600 where id = tests.u('campaign');
select set_config('app.clock_move', '', true);

-- T70: region content, its secrets, spawn pins and the encounter log are the DM's alone
select tests.act_as('player');
select is((select count(*)::int from region_content), 0, 'T70: a player reads no region content');
select is((select count(*)::int from region_content_secrets), 0, 'T70: nor its DM notes');
select is((select count(*)::int from spawn_pins), 0, 'T70: nor spawn pins');
select is((select count(*)::int from encounter_rolls), 0, 'T70: nor the encounter log');
select throws_ok($$ insert into region_content (region_id, kind, name) values (tests.u('region:content'), 'find', 'Fake') $$, '42501', null, 'T70: a player cannot add region content');
select throws_ok($$ insert into spawn_pins (map_id, x, y) values (tests.u('map:visible'), 1, 1) $$, '42501', null, 'T70: nor spawn pins');
select throws_ok($$ select roll_random_encounter(tests.u('region:content')) $$, '42501', 'Only the DM can do that', 'T70: a player cannot roll a random encounter');
select throws_ok($$ select set_daylight_hours(tests.u('campaign'), 5, 20) $$, '42501', 'Only the DM can do that', 'T70: nor set the daylight hours');
reset role;
select tests.act_as('outsider');
select is((select count(*)::int from region_content) + (select count(*)::int from spawn_pins), 0, 'T70: a stranger reads nothing');
select throws_ok($$ select roll_random_encounter(tests.u('region:content')) $$, '42501', 'Only the DM can do that', 'T70: nor rolls');
reset role;
select tests.act_as('dm');
select is((select count(*)::int from region_content where region_id = tests.u('region:content')), 4, 'T70: the DM reads the region content');
select is((select dm_notes from region_content_secrets where content_id = tests.u('rc:shrine')), 'The shrine holds a cursed idol', 'T70: and its DM notes');
select is((select label from spawn_pins where id = tests.u('spawn:wolves')), 'Wolf den', 'T70: and the spawn pins');
select lives_ok($$ update region_content set state = 'hinted' where id = tests.u('rc:shrine') $$, 'T70: and changes them');
reset role;

-- T71: the spawn rules, over many secure rolls (the 35% window is 3.1 standard deviations wide)
select ok((select count(*) filter (where evaluate_spawn('{"mode":"chance","chance":35,"timeOfDay":"any","count":{"min":1,"max":1}}', true) > 0) from generate_series(1, 10000)) between 3350 and 3650, 'T71: a 35% chance triggers between 33.5% and 36.5% of 10,000 times');
select is((select (count(*) filter (where evaluate_spawn('{"mode":"always","chance":0,"timeOfDay":"any","count":{"min":1,"max":1}}', false) > 0))::int from generate_series(1, 500)), 500, 'T71: always always triggers');
select is((select (count(*) filter (where evaluate_spawn('{"mode":"always","chance":100,"timeOfDay":"night","count":{"min":1,"max":3}}', is_daytime(12, 6, 18)) > 0))::int from generate_series(1, 500)), 0, 'T71: a night entry never triggers at noon');
select is((select (count(*) filter (where evaluate_spawn('{"mode":"time","chance":0,"timeOfDay":"night","count":{"min":1,"max":1}}', is_daytime(23, 6, 18)) > 0))::int from generate_series(1, 200)), 200, 'T71: a time entry always triggers at its time of day');
select is((select array[min(n), max(n)] from (select evaluate_spawn('{"mode":"always","chance":100,"timeOfDay":"any","count":{"min":2,"max":5}}', true) n from generate_series(1, 2000)) s), array[2, 5], 'T71: the count stays within min and max, and reaches both');
select is(array[is_daytime(5, 6, 18), is_daytime(6, 6, 18), is_daytime(17, 6, 18), is_daytime(18, 6, 18), is_daytime(23, 20, 4), is_daytime(12, 20, 4)], array[false, true, true, false, true, false], 'T71: daylight runs from the start hour up to the end hour, and may wrap past midnight');

-- T72: the random encounter roll at noon, and its log
select tests.act_as('dm');
select is((select string_agg((r ->> 'name') || ' x' || (r ->> 'count'), ', ') from jsonb_array_elements((select roll_random_encounter(tests.u('region:content')) -> 'results')) r), 'Bandit pair x2', 'T72: at noon only the always-there bandits come; the night-only thornwolves never do');
select is((select (hour, is_day, region_name)::text from encounter_rolls where region_id = tests.u('region:content')), '(12,t,"Mourning Wood")', 'T72: the roll is logged with the hour and the region');
select lives_ok($$ select set_daylight_hours(tests.u('campaign'), 13, 20) $$, 'T72: the DM moves daylight to 13:00');
select is((select (roll_random_encounter(tests.u('region:content')) ->> 'isDay')), 'false', 'T72: and noon is now night');
select throws_ok($$ select set_daylight_hours(tests.u('campaign'), 6, 24) $$, '22023', 'Daylight hours are whole hours from 0 to 23', 'T72: hours run from 0 to 23');
select lives_ok($$ do $do$ begin
    update encounter_rolls set hour = 0;
    if found then raise exception 'update applied'; end if;
  end $do$ $$, 'T72: the DM cannot change the log through the API');
reset role;
select throws_ok($$ delete from encounter_rolls $$, 'P0001', 'This log is append-only: entries cannot be changed or deleted', 'T72: nor can the database owner');

-- T73: entries keep their shape and their links stay in the campaign
select tests.act_as('dm');
select throws_ok($$ update region_content set spawn_rule = '{"mode":"chance","chance":135,"timeOfDay":"any","count":{"min":1,"max":1}}' where id = tests.u('rc:wolves') $$, '23514', null, 'T73: a chance above 100 is refused');
select throws_ok($$ update region_content set spawn_rule = '{"mode":"always","chance":0,"timeOfDay":"any","count":{"min":3,"max":1}}' where id = tests.u('rc:wolves') $$, '23514', null, 'T73: a count with min above max is refused');
select throws_ok($$ update region_content set details = '{"stock":[{"itemRef":"rope","priceCp":-1}]}' where id = tests.u('rc:orsa') $$, '23514', null, 'T73: a shop price cannot be negative');
select throws_ok($$ update region_content set entity_id = tests.u('ent:lore') where id = tests.u('rc:orsa') $$, '22023', 'The linked entry must be an NPC or item of this campaign', 'T73: only an NPC or item can be linked');
select throws_ok($$ update region_content set entity_id = tests.u('ent:foreign') where id = tests.u('rc:orsa') $$, '22023', 'The linked entry must be an NPC or item of this campaign', 'T73: and only from this campaign');
reset role;

-- P3-3 FIXTURE: the Thornwood region with Orsa (folk, noticed), a hinted mossy shrine (DC 14, "Something glints"),
-- hidden old tracks (DC 12) and a hidden vault with a recognisable name (DC 30, DM notes). Group A (Brannoc and
-- Ivo, the player's) and group B (Kael, the roller's) are made by the DM.
insert into regions (id, map_id, name, cx, cy, radius, visible_to_players) values
  (tests.u('region:here'), tests.u('map:visible'), 'Thornwood', 70, 70, 10, true);
insert into region_content (id, region_id, kind, name, state, hint_text, discovery_dc, details, sort_order) values
  (tests.u('rc:h-orsa'),   tests.u('region:here'), 'folk', 'Orsa the hedge witch', 'noticed', null, null, '{"description":"She hums"}', 1),
  (tests.u('rc:h-shrine'), tests.u('region:here'), 'find', 'Mossy shrine', 'hinted', 'Something glints', 14, '{}', 2),
  (tests.u('rc:h-tracks'), tests.u('region:here'), 'find', 'Old tracks', 'hidden', null, 12, '{}', 3),
  (tests.u('rc:h-vault'),  tests.u('region:here'), 'find', 'SECRET-ZEPHYR-VAULT', 'hidden', 'never shown while hidden', 30, '{}', 4);
insert into region_content_secrets (content_id, dm_notes) values (tests.u('rc:h-vault'), 'DM-ONLY-VAULT-NOTE');
select tests.act_as('dm');
select create_group(tests.u('campaign'), 'Group A') as ga \gset
select create_group(tests.u('campaign'), 'Group B') as gb \gset
select assign_character(tests.u('char:brannoc'), :'ga');
select assign_character(tests.u('char:ivo'), :'ga');
select assign_character(tests.u('char:kael'), :'gb');
reset role;
create temporary table here_groups (label text primary key, id uuid);
insert into here_groups values ('a', :'ga'), ('b', :'gb');
grant select on here_groups to authenticated, service_role;

-- T74: groups are private to their members; discoveries and region content stay with the DM
select tests.act_as('player');
select is((select count(*)::int from party_groups where id = (select id from here_groups where label = 'a')), 1, 'T74: a player reads their own group');
select is((select count(*)::int from party_groups where id = (select id from here_groups where label = 'b')), 0, 'T74: but not another group');
select is((select count(*)::int from party_group_members where group_id = (select id from here_groups where label = 'b')), 0, 'T74: nor its members');
select throws_ok($$ select create_group(tests.u('campaign'), 'Mine') $$, '42501', 'Only the DM can do that', 'T74: a player cannot create a group');
select throws_ok($$ select assign_character(tests.u('char:brannoc'), (select id from here_groups where label = 'b')) $$, '42501', 'Only the DM can do that', 'T74: nor move a character between groups');
select throws_ok($$ select move_group(tests.u('user:player'), (select id from here_groups where label = 'a'), tests.u('map:visible'), tests.u('region:here'), '{}') $$, '42501', null, 'T74: nor call move_group');
select throws_ok($$ select search_region(tests.u('user:player'), tests.u('char:brannoc'), 0, null, 'normal', '{}') $$, '42501', null, 'T74: nor call search_region directly');
reset role;
select tests.act_as('roller');
select is((select count(*)::int from party_groups where id = (select id from here_groups where label = 'a')), 0, 'T74: the other player cannot read group A');
reset role;
select tests.act_as('dm');
select lives_ok($$ select assign_character(tests.u('char:kael'), (select id from here_groups where label = 'a')) $$, 'T74: the DM moves Kael to group A');
select is((select string_agg(pg.name, ',') from party_group_members pm join party_groups pg on pg.id = pm.group_id where pm.character_id = tests.u('char:kael')), 'Group A', 'T74: a character is in one group at a time');
select lives_ok($$ select assign_character(tests.u('char:kael'), (select id from here_groups where label = 'b')) $$, 'T74: and back to group B');
reset role;

-- T75: entering a region reveals noticed entries, and passives reveal what they beat (Perception +3: passive 13)
select tests.act_as_service();
select is((select move_group(tests.u('user:dm'), (select id from here_groups where label = 'a'), tests.u('map:visible'), tests.u('region:here'), '{"perception":13}')), '["Orsa the hedge witch", "Old tracks"]'::jsonb, 'T75: passive 13 reveals the DC 12 tracks and the noticed folk, not the DC 14 shrine or the DC 30 vault');
select throws_ok($$ select move_group(tests.u('user:player'), (select id from here_groups where label = 'b'), tests.u('map:visible'), null, '{}') $$, '42501', 'Only the DM can do that', 'T75: move_group acts only for a DM');
select is((select move_group(tests.u('user:dm'), (select id from here_groups where label = 'b'), tests.u('map:visible'), null, '{}')), '[]'::jsonb, 'T75: group B goes to the map, in no region');
reset role;
select is((select string_agg(rc.name || '=' || d.state, ', ' order by rc.sort_order) from content_discoveries d join region_content rc on rc.id = d.content_id where d.group_id = (select id from here_groups where label = 'a')), 'Orsa the hedge witch=noticed, Old tracks=noticed', 'T75: the discoveries are recorded for group A');

-- T76: get_here is masked: discovered entries' public fields, hints as kind and hint, hidden entries never
select tests.act_as('player');
select is((select jsonb_path_query_array(get_here(tests.u('char:brannoc')), '$.entries[*].name')), '["Orsa the hedge witch", "Old tracks"]'::jsonb, 'T76: the player sees what group A has discovered');
select is((select get_here(tests.u('char:brannoc')) -> 'hints'), jsonb_build_array(jsonb_build_object('id', tests.u('rc:h-shrine'), 'kind', 'find', 'hint', 'Something glints')), 'T76: and the hint "Something glints", as kind and hint only');
select is((select get_here(tests.u('char:brannoc'))::text ~ 'SECRET-ZEPHYR-VAULT|DM-ONLY-VAULT-NOTE|never shown while hidden|discovery|spawn|dm_notes|Mossy shrine'), false, 'T76: no hidden name, hidden hint, DM note, DC or spawn rule anywhere in the answer');
select is((select get_here(tests.u('char:brannoc')) -> 'entries' -> 0 -> 'actions'), '["talk"]'::jsonb, 'T76: folk can be talked to');
select throws_ok($$ select get_here(tests.u('char:kael')) $$, '42501', 'We could not find that character', 'T76: a player cannot ask for someone else''s character');
select is((select count(*)::int from region_content) + (select count(*)::int from region_content_secrets) + (select count(*)::int from content_discoveries), 0, 'T76: nor read the base tables or the secrets');
reset role;
select tests.act_as('roller');
select is((select get_here(tests.u('char:kael')) -> 'entries'), '[]'::jsonb, 'T76: group B, elsewhere, sees nothing from the region');
select is((select get_here(tests.u('char:kael')) -> 'region'), 'null'::jsonb, 'T76: and is in no region');
reset role;

-- T77: searching. One search per character per region per cooldown; only members of the campaign; only what is found
select tests.act_as_service();
select throws_ok($$ select search_region(tests.u('user:outsider'), tests.u('char:brannoc'), 0, null, 'normal', '{}') $$, '42501', 'You can only search with your own character', 'T77: a search by someone who is not in the campaign fails');
select throws_ok($$ select search_region(tests.u('user:roller'), tests.u('char:kael'), 0, null, 'normal', '{}') $$, '22023', 'Your group is not in a region the DM has placed it in', 'T77: a group outside any region cannot search');
select is((select search_region(tests.u('user:dm'), tests.u('char:ivo'), 0, null, 'normal', '{"perception":-50}') -> 'found'), '[]'::jsonb, 'T77: a hopeless roll finds nothing new');
select is((select jsonb_path_query_array(search_region(tests.u('user:dm'), tests.u('char:brannoc'), 0, null, 'normal', '{"perception":50}'), '$.found[*].name')), '["Mossy shrine", "SECRET-ZEPHYR-VAULT"]'::jsonb, 'T77: a great roll finds the shrine and the vault, and only those');
select throws_ok($$ select search_region(tests.u('user:dm'), tests.u('char:brannoc'), 0, null, 'normal', '{"perception":50}') $$, 'PT429', 'You searched here in the last 10 minutes. Give it a moment before you search again.', 'T77: a second search within the cooldown is refused');
select is((select count(*)::int from rolls where label = 'Search (Perception)' and character_id in (tests.u('char:brannoc'), tests.u('char:ivo'))), 2, 'T77: each search is a logged roll');
reset role;

-- T78: what a search finds reaches the group, and only the group
select tests.act_as('player');
select is((select jsonb_path_query_array(get_here(tests.u('char:brannoc')), '$.entries[*].name')), '["Orsa the hedge witch", "Mossy shrine", "Old tracks", "SECRET-ZEPHYR-VAULT"]'::jsonb, 'T78: group A now sees the shrine and the vault');
select is((select get_here(tests.u('char:brannoc')) -> 'hints'), '[]'::jsonb, 'T78: and the hint is gone');
select is((select get_here(tests.u('char:brannoc'))::text ~ 'DM-ONLY-VAULT-NOTE'), false, 'T78: the DM notes still never come along');
select ok((select count(*) from discovery_notices where text = 'You notice Mossy shrine') = 1, 'T78: the group gets a notice to show');
reset role;
select tests.act_as('roller');
select is((select count(*)::int from discovery_notices), 0, 'T78: the other group gets none');
select is((select get_here(tests.u('char:kael')) -> 'entries'), '[]'::jsonb, 'T78: and still sees nothing');
reset role;
select tests.act_as('dm');
select lives_ok($$ select reveal_content(tests.u('rc:h-vault'), (select id from here_groups where label = 'a'), 'found') $$, 'T78: the DM marks the vault found for group A');
select is((select state from content_discoveries where content_id = tests.u('rc:h-vault')), 'found', 'T78: and it is found');
reset role;

-- T79: SRD monsters are read-only (P3-4): anyone signed in reads them, nobody but the import writes them
insert into srd_monsters (id, name, source, challenge_value, creature_type, data) values
  ('test-wolf', 'Test Wolf', 'srd-5.2', 0.25, 'Beast', '{"id":"test-wolf","name":"Test Wolf"}');
select tests.act_as('player');
select is((select name from srd_monsters where id = 'test-wolf'), 'Test Wolf', 'T79: a player reads an SRD monster');
select throws_ok($$ insert into srd_monsters (id, name, source, challenge_value, creature_type, data) values ('x', 'X', 'srd-5.2', 1, 'Beast', '{"id":"x"}') $$, '42501', null, 'T79: a player cannot add one');
select throws_ok($$ update srd_monsters set name = 'Tamed' where id = 'test-wolf' $$, '42501', null, 'T79: nor change one');
select throws_ok($$ delete from srd_monsters where id = 'test-wolf' $$, '42501', null, 'T79: nor remove one');
reset role;
select tests.act_as('dm');
select throws_ok($$ update srd_monsters set name = 'Tamed' where id = 'test-wolf' $$, '42501', null, 'T79: nor can a DM');
reset role;
select tests.act_as_anon();
select is((select count(*)::int from srd_monsters), 0, 'T79: a signed-out visitor reads nothing');
reset role;
select throws_ok($$ insert into srd_monsters (id, name, source, challenge_value, creature_type, data) values ('bad', 'Bad', 'homebrew', 1, 'Beast', '{"id":"bad"}') $$, '23514', null, 'T79: only SRD content can be stored here');

-- T80: custom content is the DM's alone (P3-6), and an entry in use cannot be deleted
select tests.act_as('dm');
select lives_ok($$ insert into custom_content (id, campaign_id, kind, name, parent_ref, definition) values (tests.u('cc:thornwolf'), tests.u('campaign'), 'monster', 'Thornwolf', 'wolf', '{"hitPoints":22}') $$, 'T80: a DM adds a custom monster');
select lives_ok($$ insert into custom_content (id, campaign_id, kind, name, definition) values (tests.u('cc:blade'), tests.u('campaign'), 'weapon', 'Drowned Blade', '{}') $$, 'T80: and a custom weapon');
select lives_ok($$ insert into custom_content (id, campaign_id, kind, name, definition) values (tests.u('cc:spare'), tests.u('campaign'), 'item', 'Spare Trinket', '{}') $$, 'T80: and an item');
select is((select count(*)::int from custom_content where campaign_id = tests.u('campaign')), 3, 'T80: the DM reads them');
select is((select parent_ref from custom_content where id = tests.u('cc:thornwolf')), 'wolf', 'T80: a clone remembers its parent');
select lives_ok($$ update custom_content set definition = '{"hitPoints":30}' where id = tests.u('cc:thornwolf') $$, 'T80: the DM changes one');
select is((select definition ->> 'hitPoints' from custom_content where id = tests.u('cc:thornwolf')), '30', 'T80: and the change holds');
select throws_ok($$ insert into custom_content (campaign_id, kind, name) values (tests.u('campaign'), 'monster', 'Thornwolf') $$, '23505', null, 'T80: names are unique per campaign and kind');
select lives_ok($$ insert into custom_content (id, campaign_id, kind, name) values (tests.u('cc:same'), tests.u('campaign'), 'spell', 'Thornwolf') $$, 'T80: another kind may share the name');
select throws_ok($$ insert into custom_content (campaign_id, kind, name) values (tests.u('campaign'), 'feat', 'Nope') $$, '23514', null, 'T80: only the known kinds');
select throws_ok($$ delete from custom_content where id = tests.u('cc:spare') $$, '42501', null, 'T80: deleting goes through the function');
reset role;

select tests.act_as('player');
select is((select count(*)::int from custom_content), 0, 'T80: a player reads none');
select throws_ok($$ insert into custom_content (campaign_id, kind, name) values (tests.u('campaign'), 'item', 'Mine') $$, '42501', null, 'T80: nor adds one');
select is_empty($$ update custom_content set name = 'Mine' where id = tests.u('cc:thornwolf') returning id $$, 'T80: nor changes one');
select throws_ok($$ select delete_custom_content(tests.u('cc:spare')) $$, '42501', null, 'T80: nor deletes one');
reset role;

select tests.act_as_anon();
select throws_ok($$ select * from custom_content $$, '42501', null, 'T80: a signed-out visitor reads nothing');
reset role;

insert into region_content (id, region_id, kind, name, monster_ref) values
  (tests.u('rc:thornwolf'), tests.u('region:here'), 'creature', 'Thornwolf', 'custom:' || tests.u('cc:thornwolf'));
select tests.act_as('dm');
select throws_ok($$ select delete_custom_content(tests.u('cc:thornwolf')) $$, '23503', 'This entry is placed in a region. Remove it from the region first.', 'T80: not while placed in a region');
select lives_ok($$ select create_item(tests.u('campaign'), 'Drowned Blade', 'weapon', '{}', 'world', null, 1, null, 0, null, false, false, 'custom:' || tests.u('cc:blade')) $$, 'T80: an item is made from the weapon');
select throws_ok($$ select delete_custom_content(tests.u('cc:blade')) $$, '23503', 'An item was made from this entry. Remove the item first.', 'T80: not while an item came from it');
select lives_ok($$ select delete_custom_content(tests.u('cc:spare')) $$, 'T80: an unused entry can go');
select is((select count(*)::int from custom_content where id = tests.u('cc:spare')), 0, 'T80: and is gone');
reset role;
delete from region_content where id = tests.u('rc:thornwolf');
select tests.act_as('dm');
select lives_ok($$ select delete_custom_content(tests.u('cc:thornwolf')) $$, 'T80: once out of the region it can go too');
reset role;

-- T81: the calendar, world events and setting the date (P3-7)
select tests.act_as('dm');
select lives_ok($$ insert into calendars (campaign_id, definition) values (tests.u('campaign'), '{"name":"Harptos"}') $$, 'T81: a DM saves a calendar');
select lives_ok($$ insert into world_events (id, campaign_id, day, title, visible_to_players) values (tests.u('we:open'), tests.u('campaign'), 5, 'The Festival', true) $$, 'T81: a DM adds a visible event');
select lives_ok($$ insert into world_events (id, campaign_id, day, title) values (tests.u('we:secret'), tests.u('campaign'), 6, 'SECRET-COUP') $$, 'T81: and a hidden one');
select is((select count(*)::int from world_events where campaign_id = tests.u('campaign')), 2, 'T81: the DM reads both');
select throws_ok($$ insert into calendars (campaign_id, definition) values (tests.u('campaign'), '{}') $$, '23505', null, 'T81: one calendar per campaign');
select throws_ok($$ update calendars set definition = '[]' where campaign_id = tests.u('campaign') $$, '23514', null, 'T81: a calendar is an object');
select throws_ok($$ insert into world_events (campaign_id, day, title) values (tests.u('campaign'), 0, 'Too early') $$, '23514', null, 'T81: days start at 1');
select lives_ok($$ update pages set ingame_day = 40 where id = tests.u('page:visible') $$, 'T81: a DM dates a page');
select is((select ingame_day from pages where id = tests.u('page:visible')), 40, 'T81: and the day holds');
select throws_ok($$ update pages set ingame_day = 0 where id = tests.u('page:visible') $$, '23514', null, 'T81: a page day starts at 1');
select throws_ok($$ update pages set ingame_date = 'Tuesday' where id = tests.u('page:visible') $$, '22023', null, 'T81: the old date text is read-only');
reset role;

select tests.act_as('player');
select is((select definition ->> 'name' from calendars where campaign_id = tests.u('campaign')), 'Harptos', 'T81: a player reads the calendar');
select is((select string_agg(title, ',') from world_events where campaign_id = tests.u('campaign')), 'The Festival', 'T81: and only visible events');
select is_empty($$ update calendars set definition = '{"name":"Mine"}' where campaign_id = tests.u('campaign') returning campaign_id $$, 'T81: a player cannot change the calendar');
select is_empty($$ delete from calendars where campaign_id = tests.u('campaign') returning campaign_id $$, 'T81: nor remove it');
select throws_ok($$ insert into world_events (campaign_id, day, title, visible_to_players) values (tests.u('campaign'), 1, 'Mine', true) $$, '42501', null, 'T81: nor add an event');
select is_empty($$ update world_events set title = 'Mine' where id = tests.u('we:open') returning id $$, 'T81: nor change one');
select is_empty($$ update pages set ingame_day = 2 where id = tests.u('page:visible') returning id $$, 'T81: nor date a page');
select throws_ok($$ select set_game_date(tests.u('campaign'), 1000, 0, 'Mine') $$, '42501', null, 'T81: nor set the date');
select is_empty($$ update campaigns set game_seconds = 0 where id = tests.u('campaign') returning id $$, 'T81: nor touch the clock directly');
reset role;

select tests.act_as_anon();
select throws_ok($$ select * from world_events $$, '42501', null, 'T81: a signed-out visitor reads no events');
select throws_ok($$ select * from calendars $$, '42501', null, 'T81: nor the calendar');
reset role;

select tests.act_as('dm');
select is((select set_game_date(tests.u('campaign'), 1000, 3600, 'Far ahead')), 999*86400::bigint + 3600, 'T81: a DM sets the date ahead');
select is((select game_seconds from campaigns where id = tests.u('campaign')), 999*86400::bigint + 3600, 'T81: the clock moved');
select is((select reason from game_clock_events where campaign_id = tests.u('campaign') and to_seconds = 999*86400::bigint + 3600), 'Far ahead', 'T81: the move is logged');
select throws_ok($$ select set_game_date(tests.u('campaign'), 10, 0, 'Back') $$, 'PT409', null, 'T81: going back needs confirming');
select is((select game_seconds from campaigns where id = tests.u('campaign')), 999*86400::bigint + 3600, 'T81: and without it nothing moves');
select is((select set_game_date(tests.u('campaign'), 10, 0, 'Oops', true)), 9*86400::bigint, 'T81: a confirmed rewind moves back');
select is((select reason from game_clock_events where campaign_id = tests.u('campaign') and to_seconds = 9*86400::bigint and from_seconds > to_seconds), 'Rewind: Oops', 'T81: and is logged as a rewind');
select throws_ok($$ select set_game_date(tests.u('campaign'), 0, 0, 'x') $$, '22023', null, 'T81: day 0 does not exist');
select throws_ok($$ select set_game_date(tests.u('campaign'), 20, 86400, 'x') $$, '22023', null, 'T81: nor a time past the end of the day');
select is((select set_game_date(tests.u('campaign'), 10, 0, 'Same')), 9*86400::bigint, 'T81: the same moment is no move');
reset role;

-- T82: weather zones and days (P3-8): DMs write; members read only what is on maps they can see
select tests.act_as('dm');
select lives_ok($$ insert into weather_zones (id, campaign_id, map_id, name, center_x, center_y, radius, climate) values (tests.u('wz:open'), tests.u('campaign'), tests.u('map:visible'), 'Glass Sands', 10, 10, 50, 'arid') $$, 'T82: a DM draws a zone');
select lives_ok($$ insert into weather_zones (id, campaign_id, map_id, name, center_x, center_y, radius, climate) values (tests.u('wz:hidden'), tests.u('campaign'), tests.u('map:hidden'), 'SECRET-ZONE', 10, 10, 50, 'boreal') $$, 'T82: and one on a hidden map');
select lives_ok($$ insert into weather_days (zone_id, day, condition, temperature, wind, overridden, note) values (tests.u('wz:open'), 5, 'storm', 'cold', 'gale', true, 'The sky breaks') $$, 'T82: a DM overrides a day');
select lives_ok($$ insert into weather_days (zone_id, day, condition, temperature, wind, overridden) values (tests.u('wz:hidden'), 5, 'snow', 'cold', 'calm', true) $$, 'T82: on the hidden map too');
select is((select count(*)::int from weather_zones where campaign_id = tests.u('campaign')), 2, 'T82: the DM reads both zones');
select throws_ok($$ insert into weather_zones (campaign_id, map_id, name, center_x, center_y, radius, climate) values (tests.u('campaign'), tests.u('map:visible'), 'Bad', 1, 1, 5, 'lunar') $$, '23514', null, 'T82: only the known climates');
select throws_ok($$ insert into weather_zones (campaign_id, map_id, name, center_x, center_y, radius, climate) values (tests.u('campaign'), tests.u('map:visible'), 'Bad', 1, 1, 0, 'arid') $$, '23514', null, 'T82: a zone has a size');
select throws_ok($$ insert into weather_days (zone_id, day, condition, temperature, wind) values (tests.u('wz:open'), 6, 'frogs', 'cold', 'calm') $$, '23514', null, 'T82: only the known conditions');
select throws_ok($$ insert into weather_days (zone_id, day, condition, temperature, wind) values (tests.u('wz:open'), 5, 'clear', 'mild', 'calm') $$, '23505', null, 'T82: one row per zone and day');
reset role;

select tests.act_as('player');
select is((select string_agg(name, ',') from weather_zones where campaign_id = tests.u('campaign')), 'Glass Sands', 'T82: a player reads zones on visible maps only');
select is((select count(*)::int from weather_days where zone_id = tests.u('wz:hidden')), 0, 'T82: and no days of a zone on a hidden map');
select is((select condition from weather_days where zone_id = tests.u('wz:open') and day = 5), 'storm', 'T82: a player sees an override');
select throws_ok($$ insert into weather_zones (campaign_id, map_id, name, center_x, center_y, radius, climate) values (tests.u('campaign'), tests.u('map:visible'), 'Mine', 1, 1, 5, 'arid') $$, '42501', null, 'T82: a player cannot draw a zone');
select is_empty($$ update weather_zones set name = 'Mine' where id = tests.u('wz:open') returning id $$, 'T82: nor change one');
select is_empty($$ delete from weather_zones where id = tests.u('wz:open') returning id $$, 'T82: nor remove one');
select throws_ok($$ insert into weather_days (zone_id, day, condition, temperature, wind) values (tests.u('wz:open'), 7, 'clear', 'mild', 'calm') $$, '42501', null, 'T82: nor write a day');
select is_empty($$ update weather_days set condition = 'clear' where zone_id = tests.u('wz:open') returning day $$, 'T82: nor change an override');
select is_empty($$ delete from weather_days where zone_id = tests.u('wz:open') returning day $$, 'T82: nor clear one');
reset role;

select tests.act_as_anon();
select throws_ok($$ select * from weather_zones $$, '42501', null, 'T82: a signed-out visitor reads no zones');
select throws_ok($$ select * from weather_days $$, '42501', null, 'T82: nor any days');
reset role;

select throws_ok($$ insert into weather_zones (campaign_id, map_id, name, center_x, center_y, radius, climate) values (gen_random_uuid(), tests.u('map:visible'), 'Elsewhere', 1, 1, 5, 'arid') $$, '23514', null, 'T82: a zone stays with its own campaign map');

-- T83: who may listen on which Realtime topic (P4-1). The live join is covered in e2e/tests/realtime.spec.ts.
insert into party_groups (id, campaign_id, name) values (tests.u('rt:group'), tests.u('campaign'), 'Realtime group');

select tests.act_as('dm');
select ok(realtime_can_read('campaign:' || tests.u('campaign')), 'T83: a DM can listen on campaign:');
select ok(realtime_can_read('dm:' || tests.u('campaign')), 'T83: a DM can listen on dm:');
select ok(realtime_can_read('user:' || tests.u('campaign') || ':' || tests.u('user:player')), 'T83: a DM can listen on a player''s user:');
select ok(realtime_can_track('campaign:' || tests.u('campaign')), 'T83: a DM can publish presence');
reset role;

select tests.act_as('player');
select ok(realtime_can_read('campaign:' || tests.u('campaign')), 'T83: a player can listen on campaign:');
select ok(not realtime_can_read('dm:' || tests.u('campaign')), 'T83: a player cannot listen on dm:');
select ok(realtime_can_read('user:' || tests.u('campaign') || ':' || tests.u('user:player')), 'T83: a player can listen on their own user:');
select ok(not realtime_can_read('user:' || tests.u('campaign') || ':' || tests.u('user:dm')), 'T83: a player cannot listen on another user:');
select ok(realtime_can_read('rolls:' || tests.u('campaign')), 'T83: a player can follow the rolls feed');
select ok(realtime_can_read('clock:' || tests.u('campaign')), 'T83: and the clock feed');
select ok(realtime_can_read('discoveries:' || tests.u('rt:group')), 'T83: and a group feed in the campaign');
select ok(realtime_can_track('campaign:' || tests.u('campaign')), 'T83: a player can publish presence on campaign:');
select ok(not realtime_can_track('user:' || tests.u('campaign') || ':' || tests.u('user:player')), 'T83: but nowhere else');
select ok(not realtime_can_read('campaign:not-a-uuid'), 'T83: a malformed topic is refused');
select ok(not realtime_can_read('campaign:' || tests.u('campaign') || ':extra'), 'T83: a topic with extra parts is refused');
select ok(not realtime_can_read('other:' || tests.u('campaign')), 'T83: an unknown topic is refused');
select ok(not realtime_can_read(null), 'T83: no topic is refused');
reset role;

select tests.act_as('outsider');
select ok(not realtime_can_read('campaign:' || tests.u('campaign')), 'T83: a non-member cannot listen on campaign:');
select ok(not realtime_can_read('dm:' || tests.u('campaign')), 'T83: nor on dm:');
select ok(not realtime_can_read('user:' || tests.u('campaign') || ':' || tests.u('user:outsider')), 'T83: nor on a user: with their own id');
select ok(not realtime_can_read('rolls:' || tests.u('campaign')), 'T83: nor on the rolls feed');
select ok(not realtime_can_read('discoveries:' || tests.u('rt:group')), 'T83: nor on a group feed');
select ok(not realtime_can_track('campaign:' || tests.u('campaign')), 'T83: nor publish presence');
reset role;

select tests.act_as_anon();
select throws_ok($$ select realtime_can_read('campaign:' || tests.u('campaign')) $$, '42501', null, 'T83: a signed-out visitor cannot ask');
reset role;

-- the policies themselves: reading follows the topic rules, and writing is presence only
select is((select count(*)::int from pg_policies where schemaname = 'realtime' and tablename = 'messages'), 2, 'T83: realtime.messages has exactly its two policies');
select is((select cmd from pg_policies where schemaname = 'realtime' and policyname = 'listen on allowed topics'), 'SELECT', 'T83: the read policy only reads');
select ok((select qual like '%realtime_can_read%' from pg_policies where schemaname = 'realtime' and policyname = 'listen on allowed topics'), 'T83: the read policy applies the topic rules');
select is((select cmd from pg_policies where schemaname = 'realtime' and policyname = 'publish presence only'), 'INSERT', 'T83: the write policy only inserts');
select ok((select with_check like '%''presence''%' and with_check like '%realtime_can_track%' from pg_policies where schemaname = 'realtime' and policyname = 'publish presence only'), 'T83: the write policy allows presence, on allowed topics');
select is((select roles::text from pg_policies where schemaname = 'realtime' and policyname = 'publish presence only'), '{authenticated}', 'T83: for signed-in people only');

-- T84: sending goes through one function, which decides by role and stamps the sender
select tests.act_as('dm');
select is((select send_realtime_event(tests.u('campaign'), 'campaign', 'toast', '{"message":"Hello"}') ->> 'sender'), tests.u('user:dm')::text, 'T84: the DM''s send is stamped with the DM');
select is((select send_realtime_event(tests.u('campaign'), 'campaign', 'toast', '{"message":"Hello"}') ->> 'senderRole'), 'dm', 'T84: and with the role');
select is((select send_realtime_event(tests.u('campaign'), 'dm', 'toast', '{"message":"Hello"}') -> 'data' ->> 'message'), 'Hello', 'T84: a DM can send on dm:');
select lives_ok($$ select send_realtime_event(tests.u('campaign'), 'user', 'handout', '{}', tests.u('user:player')) $$, 'T84: a DM can send on any user:');
select throws_ok($$ select send_realtime_event(tests.u('campaign'), 'campaign', 'made_up', '{}') $$, '22023', null, 'T84: only known events');
select throws_ok($$ select send_realtime_event(tests.u('campaign'), 'nowhere', 'toast', '{}') $$, '22023', null, 'T84: only known channels');
select throws_ok($$ select send_realtime_event(tests.u('campaign'), 'user', 'toast', '{}') $$, '22023', null, 'T84: a user: send needs a target');
select throws_ok($$ select send_realtime_event(tests.u('campaign'), 'campaign', 'toast', '[]') $$, '22023', null, 'T84: the payload is an object');
select throws_ok($$ select send_realtime_event(tests.u('campaign'), 'campaign', 'toast', jsonb_build_object('m', repeat('x', 17000))) $$, '22023', null, 'T84: of a limited size');
reset role;

select tests.act_as('player');
select is((select send_realtime_event(tests.u('campaign'), 'campaign', 'ping', jsonb_build_object('sender', tests.u('user:dm'), 'senderRole', 'dm')) ->> 'sender'), tests.u('user:player')::text, 'T84: a sender claimed in the payload is ignored');
select is((select send_realtime_event(tests.u('campaign'), 'campaign', 'ping', jsonb_build_object('senderRole', 'dm')) ->> 'senderRole'), 'player', 'T84: and so is a claimed role');
select throws_ok($$ select send_realtime_event(tests.u('campaign'), 'campaign', 'reveal', '{}') $$, '42501', null, 'T84: a player cannot send a reveal');
select throws_ok($$ select send_realtime_event(tests.u('campaign'), 'campaign', 'toast', '{}') $$, '42501', null, 'T84: nor a toast');
select throws_ok($$ select send_realtime_event(tests.u('campaign'), 'dm', 'ping', '{}') $$, '42501', null, 'T84: nor anything on dm:');
select lives_ok($$ select send_realtime_event(tests.u('campaign'), 'user', 'message', '{}', tests.u('user:player')) $$, 'T84: a player can write on their own user:');
select throws_ok($$ select send_realtime_event(tests.u('campaign'), 'user', 'reveal', '{}', tests.u('user:player')) $$, '42501', null, 'T84: only a message');
select throws_ok($$ select send_realtime_event(tests.u('campaign'), 'user', 'message', '{}', tests.u('user:dm')) $$, '42501', null, 'T84: and not on someone else''s user:');
reset role;

select tests.act_as('outsider');
select throws_ok($$ select send_realtime_event(tests.u('campaign'), 'campaign', 'ping', '{}') $$, '42501', null, 'T84: a non-member cannot send');
reset role;

select tests.act_as_anon();
select throws_ok($$ select send_realtime_event(tests.u('campaign'), 'campaign', 'ping', '{}') $$, '42501', null, 'T84: nor a signed-out visitor');
reset role;

-- P4-2 FIXTURE: two maps nested beneath the visible pin of the visible map, a pin on the first with the second beneath
-- it, and one group in each. Group A (Brannoc and Ivo) is on the deepest map, group B (Kael) on the first one.
reset role;
insert into maps (id, campaign_id, parent_pin_id, name, image_path, width, height, visible_to_players) values
  (tests.u('p42:sub'), tests.u('campaign'), tests.u('pin:control'), 'Vault level', tests.u('campaign') || '/p42a.png', 100, 100, true);
insert into pins (id, map_id, title, x, y, visible_to_players) values (tests.u('p42:pin'), tests.u('p42:sub'), 'Stairs down', 10, 10, true);
insert into maps (id, campaign_id, parent_pin_id, name, image_path, width, height, visible_to_players) values
  (tests.u('p42:deep'), tests.u('campaign'), tests.u('p42:pin'), 'Deep vault', tests.u('campaign') || '/p42b.png', 100, 100, true);
insert into pins (id, map_id, title, x, y, visible_to_players) values (tests.u('p42:hiddenpin'), tests.u('map:visible'), 'Secret door', 60, 60, false);
insert into maps (id, campaign_id, parent_pin_id, name, image_path, width, height, visible_to_players) values
  (tests.u('p42:ghostmap'), tests.u('campaign'), tests.u('p42:hiddenpin'), 'Behind the door', tests.u('campaign') || '/p42c.png', 100, 100, true);
insert into party_groups (id, campaign_id, name) values (tests.u('p42:foreign'), tests.u('campaign:solo'), 'Elsewhere');

-- T85: a token has a place on its map; going to another map takes it away; only the DM moves groups
select tests.act_as('dm');
select lives_ok(format($$ update party_groups set map_id = %L, region_id = null, x = 5, y = 6 where id = %L $$, tests.u('p42:deep'), (select id from here_groups where label = 'a')), 'T85: the DM puts group A on the deepest map, at a spot');
select lives_ok(format($$ update party_groups set map_id = %L, region_id = null where id = %L $$, tests.u('p42:sub'), (select id from here_groups where label = 'b')), 'T85: and group B on the first');
select is((select x || ',' || y from party_groups where id = (select id from here_groups where label = 'a')), '5,6', 'T85: the spot is kept');
select lives_ok(format($$ update party_groups set x = 40, y = 50 where id = %L $$, (select id from here_groups where label = 'a')), 'T85: the DM drags the token');
select is((select x || ',' || y from party_groups where id = (select id from here_groups where label = 'a')), '40,50', 'T85: the new spot is saved');
select throws_ok(format($$ update party_groups set x = 40, y = null where id = %L $$, (select id from here_groups where label = 'a')), '23514', null, 'T85: a spot has both numbers or neither');
select throws_ok(format($$ update party_groups set x = -1, y = 5 where id = %L $$, (select id from here_groups where label = 'a')), '23514', null, 'T85: and lies on the map');
select lives_ok(format($$ update party_groups set map_id = %L, region_id = null where id = %L $$, tests.u('p42:sub'), (select id from here_groups where label = 'a')), 'T85: the DM sends group A to another map');
select is((select x is null and y is null from party_groups where id = (select id from here_groups where label = 'a')), true, 'T85: its old spot does not follow it');
select lives_ok(format($$ update party_groups set map_id = %L, region_id = null, x = 7, y = 8 where id = %L $$, tests.u('p42:deep'), (select id from here_groups where label = 'a')), 'T85: unless the same change gives it a new one');
select is((select x || ',' || y from party_groups where id = (select id from here_groups where label = 'a')), '7,8', 'T85: which is kept');
reset role;

select tests.act_as('player');
select is_empty(format($$ update party_groups set x = 1, y = 1 where id = %L returning id $$, (select id from here_groups where label = 'a')), 'T85: a player cannot move their own group');
select is_empty(format($$ update party_groups set map_id = %L where id = %L returning id $$, tests.u('map:visible'), (select id from here_groups where label = 'a')), 'T85: nor send it to another map');
reset role;

-- T86: a player reads only their own group, unless the DM shares group positions
select tests.act_as('player');
select is((select string_agg(name, ',') from party_groups where campaign_id = tests.u('campaign') and name in ('Group A', 'Group B')), 'Group A', 'T86: a player reads one group');
reset role;
select tests.act_as('roller');
select is((select string_agg(name, ',') from party_groups where campaign_id = tests.u('campaign') and name in ('Group A', 'Group B')), 'Group B', 'T86: and another player reads theirs');
reset role;
select tests.act_as('dm');
select lives_ok($$ update campaigns set settings = settings || '{"shareGroupPositions": true}' where id = tests.u('campaign') $$, 'T86: the DM shares group positions');
reset role;
select tests.act_as('player');
select is((select string_agg(name, ',' order by name) from party_groups where campaign_id = tests.u('campaign') and name in ('Group A', 'Group B')), 'Group A,Group B', 'T86: a player now reads both groups');
select is((select group_member_count(g) from party_groups g where id = (select id from here_groups where label = 'b')), 1, 'T86: with the other group''s member count');
select is((select count(*)::int from party_group_members where group_id = (select id from here_groups where label = 'b')), 0, 'T86: but still not who is in it');
select is((select count(*)::int from content_discoveries where group_id = (select id from here_groups where label = 'b')), 0, 'T86: nor what it has found');
select is_empty($$ update campaigns set settings = settings || '{"shareGroupPositions": false}' where id = tests.u('campaign') returning id $$, 'T86: a player cannot change the setting');
reset role;
select tests.act_as('outsider');
select is((select count(*)::int from party_groups where campaign_id = tests.u('campaign')), 0, 'T86: someone outside the campaign reads none, shared or not');
reset role;
select tests.act_as('dm');
select lives_ok($$ update campaigns set settings = settings || '{"shareGroupPositions": false}' where id = tests.u('campaign') $$, 'T86: the DM stops sharing');
reset role;
select tests.act_as('player');
select is((select string_agg(name, ',') from party_groups where campaign_id = tests.u('campaign') and name in ('Group A', 'Group B')), 'Group A', 'T86: and a player reads one group again');
reset role;

-- T87: the spotlight: set by the DM, read by members through get_spotlight, never straight from the table
select tests.act_as('player');
select throws_ok(format($$ select set_spotlight(%L, %L, 'Mine') $$, tests.u('campaign'), (select id from here_groups where label = 'a')), '42501', 'Only the DM can do that', 'T87: a player cannot give anyone the spotlight');
reset role;
select tests.act_as('dm');
select lives_ok(format($$ select set_spotlight(%L, %L, 'Picking the vault lock') $$, tests.u('campaign'), (select id from here_groups where label = 'b')), 'T87: the DM spotlights group B');
select throws_ok(format($$ select set_spotlight(%L, %L, '') $$, tests.u('campaign'), tests.u('p42:foreign')), '22023', null, 'T87: but only a group of this campaign');
select throws_ok(format($$ select set_spotlight(%L, %L, %L) $$, tests.u('campaign'), (select id from here_groups where label = 'b'), repeat('x', 201)), '22023', null, 'T87: with a line of up to 200 characters');
select is((select count(*)::int from campaign_spotlight where campaign_id = tests.u('campaign')), 1, 'T87: the DM reads the spotlight row');
reset role;
select tests.act_as('player');
select is((select group_name || ' / ' || place || ' / ' || summary || ' / ' || mine::text from get_spotlight(tests.u('campaign'))), 'Group B / Vault level / Picking the vault lock / false', 'T87: group A is told who has the spotlight, where, and the DM''s line');
select is((select count(*)::int from campaign_spotlight), 0, 'T87: but cannot read the table');
reset role;
select tests.act_as('roller');
select is((select mine from get_spotlight(tests.u('campaign'))), true, 'T87: the spotlighted group knows it is theirs');
reset role;
select tests.act_as('outsider');
select throws_ok(format($$ select * from get_spotlight(%L) $$, tests.u('campaign')), '42501', null, 'T87: someone outside the campaign is not told');
reset role;
select tests.act_as('dm');
select lives_ok(format($$ select set_spotlight(%L, null) $$, tests.u('campaign')), 'T87: the DM takes the spotlight away');
select is((select count(*)::int from get_spotlight(tests.u('campaign'))), 0, 'T87: and nobody has it');
reset role;

-- T88: how many are beneath each entrance. A is 2 characters two maps down, B is 1 character one map down.
select tests.act_as('dm');
select is((select members from group_entrance_counts(tests.u('map:visible')) where entrance_id = tests.u('pin:control')), 3, 'T88: the DM sees 3 beneath the pin, counting every map below it');
select is((select members from group_entrance_counts(tests.u('p42:sub')) where entrance_id = tests.u('p42:pin')), 2, 'T88: and 2 beneath the pin one level down');
select is((select count(*)::int from group_entrance_counts(tests.u('p42:deep'))), 0, 'T88: nothing is beneath the deepest map');
reset role;
select tests.act_as('player');
select is((select members from group_entrance_counts(tests.u('map:visible')) where entrance_id = tests.u('pin:control')), 2, 'T88: a player counts only their own group');
reset role;
select tests.act_as('roller');
select is((select members from group_entrance_counts(tests.u('map:visible')) where entrance_id = tests.u('pin:control')), 1, 'T88: and another player only theirs');
reset role;
select tests.act_as('dm');
select lives_ok($$ update campaigns set settings = settings || '{"shareGroupPositions": true}' where id = tests.u('campaign') $$, 'T88: the DM shares positions');
reset role;
select tests.act_as('player');
select is((select members from group_entrance_counts(tests.u('map:visible')) where entrance_id = tests.u('pin:control')), 3, 'T88: and a player now counts every group');
select is((select count(*)::int from group_entrance_counts(tests.u('map:hidden'))), 0, 'T88: nothing is told about a hidden map');
reset role;
select tests.act_as('dm');
select lives_ok($$ update campaigns set settings = settings || '{"shareGroupPositions": false}' where id = tests.u('campaign') $$, 'T88: the DM stops sharing');
reset role;
-- a group beneath the hidden pin: the DM counts it, a player is not told
select tests.act_as('dm');
select create_group(tests.u('campaign'), 'Ghosts') as gg \gset
select assign_character(tests.u('char:wren'), :'gg');
select lives_ok(format($$ update party_groups set map_id = %L where id = %L $$, tests.u('p42:ghostmap'), :'gg'), 'T88: a group goes to the map beneath the hidden pin');
select is((select members from group_entrance_counts(tests.u('map:visible')) where entrance_id = tests.u('p42:hiddenpin')), 1, 'T88: the DM counts it');
reset role;
select tests.act_as('player');
select is((select count(*)::int from group_entrance_counts(tests.u('map:visible')) where entrance_id = tests.u('p42:hiddenpin')), 0, 'T88: a player is not told about an entrance they cannot see');
reset role;
select tests.act_as('outsider');
select throws_ok(format($$ select * from group_entrance_counts(%L) $$, tests.u('map:visible')), '42501', null, 'T88: someone outside the campaign is refused');
reset role;

-- T89: fog of war (P4-3). The DM draws a shared stroke and one for each group on the visible map, and one on a hidden map.
select is((select fog_enabled from maps where id = tests.u('map:visible')), false, 'T89: fog is off on a map until the DM turns it on');
select tests.act_as('player');
select is_empty($$ update maps set fog_enabled = true where id = tests.u('map:visible') returning id $$, 'T89: a player cannot turn fog on or off');
reset role;
select tests.act_as('dm');
select lives_ok($$ insert into fog_strokes (id, map_id, mode, radius, points) values (tests.u('fog:shared'), tests.u('map:visible'), 'reveal', 20, '[[10,10],[40,40]]') $$, 'T89: the DM draws on the shared fog');
select lives_ok(format($$ insert into fog_strokes (id, map_id, group_id, mode, radius, points) values (%L, %L, %L, 'reveal', 20, '[[50,50]]') $$, tests.u('fog:a'), tests.u('map:visible'), (select id from here_groups where label = 'a')), 'T89: and on group A''s fog');
select lives_ok(format($$ insert into fog_strokes (id, map_id, group_id, mode, radius, points) values (%L, %L, %L, 'reveal', 20, '[[60,60]]') $$, tests.u('fog:b'), tests.u('map:visible'), (select id from here_groups where label = 'b')), 'T89: and on group B''s');
select lives_ok($$ insert into fog_strokes (map_id, mode, radius, points) values (tests.u('map:hidden'), 'reveal', 20, '[[1,1]]') $$, 'T89: and on a hidden map');
select throws_ok($$ insert into fog_strokes (map_id, mode, radius, points) values (tests.u('map:visible'), 'reveal', 20, '[[1,2,3]]') $$, '23514', null, 'T89: a point is an x and a y');
select throws_ok($$ insert into fog_strokes (map_id, mode, radius, points) values (tests.u('map:visible'), 'reveal', 20, '[["a","b"]]') $$, '23514', null, 'T89: of numbers');
select throws_ok($$ insert into fog_strokes (map_id, mode, radius, points) values (tests.u('map:visible'), 'reveal', 20, '[[-5,2]]') $$, '23514', null, 'T89: on the image');
select throws_ok($$ insert into fog_strokes (map_id, mode, radius, points) values (tests.u('map:visible'), 'reveal', 0, '[[1,2]]') $$, '23514', null, 'T89: a brush stroke has a size');
select throws_ok($$ insert into fog_strokes (map_id, mode, radius, points) values (tests.u('map:visible'), 'hide_all', 0, '[[1,2]]') $$, '23514', null, 'T89: a whole-map marker has no points');
select throws_ok($$ insert into fog_strokes (map_id, mode, radius, points) values (tests.u('map:visible'), 'smudge', 5, '[[1,2]]') $$, '23514', null, 'T89: only reveal and hide');
select throws_ok(format($$ insert into fog_strokes (map_id, group_id, mode, radius, points) values (%L, %L, 'reveal', 5, '[[1,2]]') $$, tests.u('map:visible'), tests.u('p42:foreign')), '22023', null, 'T89: a group of another campaign has no fog here');
select is((select count(*)::int from fog_strokes where map_id = tests.u('map:visible')), 3, 'T89: the DM reads every fog of the map');
select ok((select clear_fog(tests.u('map:visible'), null, 'hide')) > (select max(seq) from fog_strokes where id in (tests.u('fog:shared'), tests.u('fog:a'), tests.u('fog:b'))), 'T89: hiding everything is a marker after the strokes');
select is((select mode from fog_strokes where map_id = tests.u('map:visible') and group_id is null order by seq desc limit 1), 'hide_all', 'T89: written as one row, the history kept');
select is((select count(*)::int from fog_strokes where map_id = tests.u('map:visible') and group_id is null), 2, 'T89: nothing was deleted');
select throws_ok($$ select clear_fog(tests.u('map:visible'), null, 'smudge') $$, '22023', null, 'T89: clearing is reveal or hide');
reset role;

select tests.act_as('player');
select is((select string_agg(id::text, ',' order by seq) from fog_strokes where id in (tests.u('fog:shared'), tests.u('fog:a'), tests.u('fog:b'))), tests.u('fog:shared') || ',' || tests.u('fog:a'), 'T89: a player reads the shared fog and their own group''s, not another group''s');
select is((select count(*)::int from fog_strokes where map_id = tests.u('map:hidden')), 0, 'T89: nor the fog of a map they cannot read');
select throws_ok($$ insert into fog_strokes (map_id, mode, radius, points) values (tests.u('map:visible'), 'reveal', 500, '[[1,1]]') $$, '42501', null, 'T89: a player cannot draw fog');
select is_empty($$ update fog_strokes set mode = 'reveal' where id = tests.u('fog:shared') returning id $$, 'T89: nor change a stroke');
select is_empty($$ delete from fog_strokes where id = tests.u('fog:shared') returning id $$, 'T89: nor remove one');
select throws_ok($$ select clear_fog(tests.u('map:visible'), null, 'reveal') $$, '42501', 'Only the DM can do that', 'T89: nor reveal the whole map');
select throws_ok($$ select simplify_fog(tests.u('map:visible'), null, '[{"mode":"reveal_all"}]') $$, '42501', 'Only the DM can do that', 'T89: nor rewrite the history');
reset role;

select tests.act_as('roller');
select is((select string_agg(id::text, ',' order by seq) from fog_strokes where id in (tests.u('fog:shared'), tests.u('fog:a'), tests.u('fog:b'))), tests.u('fog:shared') || ',' || tests.u('fog:b'), 'T89: the other player reads the shared fog and group B''s');
reset role;

select tests.act_as('outsider');
select is((select count(*)::int from fog_strokes where map_id = tests.u('map:visible')), 0, 'T89: someone outside the campaign reads no fog');
reset role;

select tests.act_as('dm');
select is((select simplify_fog(tests.u('map:visible'), (select id from here_groups where label = 'a'), '[{"mode":"hide_all"},{"mode":"reveal","radius":3,"points":[[5,5],[9,9]]}]')), 2, 'T89: the DM replaces group A''s history with a shorter one');
select is((select string_agg(mode, ',' order by seq) from fog_strokes where map_id = tests.u('map:visible') and group_id = (select id from here_groups where label = 'a')), 'hide_all,reveal', 'T89: in the given order');
select is((select count(*)::int from fog_strokes where id = tests.u('fog:b')), 1, 'T89: group B''s fog is untouched');
select is((select count(*)::int from fog_strokes where map_id = tests.u('map:visible') and group_id is null), 2, 'T89: and so is the shared fog');
select throws_ok(format($$ select simplify_fog(%L, %L, '[{"mode":"reveal","radius":0,"points":[[1,1]]}]') $$, tests.u('map:visible'), (select id from here_groups where label = 'a')), '23514', null, 'T89: the new strokes are checked like any other');
select is((select count(*)::int from fog_strokes where map_id = tests.u('map:visible') and group_id = (select id from here_groups where label = 'a')), 2, 'T89: and a refused rewrite changes nothing');
select throws_ok(format($$ select simplify_fog(%L, null, '[]') $$, tests.u('map:visible')), '22023', null, 'T89: a fog keeps at least one stroke');
reset role;

select * from finish();
rollback;
