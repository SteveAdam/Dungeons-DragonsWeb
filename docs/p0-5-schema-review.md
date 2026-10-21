# P0-5 schema review

These are the problems found in the draft `0002_core_schema.sql` from the prototype, and what the final migration does
instead. No policy was weakened. Each fix is covered by the pgTAP suite (`supabase/tests/database/rls.test.sql`), and
`pnpm db:test:mutations` proves the suite fails when the fix is removed.

## Leaks (players could see DM-only data)

1. **The invite code was a column on `campaigns`.** Every member can read their campaign row, so every player could read
   the code. It now lives in `campaign_secrets`, readable by DMs only (T2, T6).
2. **Sub-map visibility checked only one level up.** `pin_visible(parent_pin_id)` ignored the parent pin's own map and
   anything above it. A pin flagged visible on a hidden map, or a map two levels under a hidden pin, leaked.
   `map_is_revealed()` now walks the whole chain to the top (T13).
3. **Pins ignored their map's visibility.** A visible pin on a hidden map was readable. Pins now also require
   `map_is_revealed(map_id)` (T13).
4. **Deleting a hidden parent pin published its sub-map.** `on delete set null` turned the sub-map into a top-level map
   with its own (often visible) flag. A trigger now hides sub-maps first when the deleted pin was not revealed (T14).
5. **Links used `pin_visible`,** with the same one-level gap. They now use `pin_is_revealed` (T5).
6. **`maps.visible_to_players` defaulted to `true`,** so an upload was public until the DM hid it. It now defaults to
   `false`.
7. **`can_read_map_image` duplicated the map rule** and had the same one-level gap. It now reuses the map policy's
   logic (T11, T13). DMs can also read any file in their own campaign's folder, so a fresh upload can be
   previewed before a map uses it. Found in P0-9 while testing against real storage (T11).
8. **Helper functions were callable by signed-out visitors.** Supabase grants new functions to `anon`. Execute is now
   revoked from `public` and `anon` and granted to `authenticated` only, and every policy is `to authenticated` (T9,
   T16).

## Integrity gaps (data could point across campaigns)

9. A map's `image_path` could name another campaign's folder. Now there is a check constraint
   `maps_image_in_campaign_folder` (T15).
10. A sub-map could hang off another campaign's pin; a page could sit in another campaign's folder; a folder's parent
    could belong to another campaign; a link's pins could come from another campaign (the draft said so in words only).
    Each now has a trigger (T15).
11. Storage upload paths were not validated. `folder_campaign()` parses the first path segment safely, so a malformed
    path is refused instead of raising a cast error (T15).
12. **A campaign could lose its last DM** by the DM leaving or demoting themselves. A trigger now prevents it (T16).
13. **`owner_id` could be reassigned** by a DM update. It is now fixed (T16).
14. **`campaigns` insert with `returning`** would fail, because the select policy needed membership that the
    after-insert trigger had not created yet. The select policy also allows `owner_id = auth.uid()`.
15. `join_campaign` did not handle a signed-out caller and compared codes case-sensitively. It now raises
    "Sign in first" and compares upper-cased, trimmed codes (T9).

## Missing constraints and indexes

16. Added `on delete cascade` from members and campaigns to `auth.users`, so deleting a user cleans up.
17. Added length checks on names and titles, `rules_edition in ('2014','2024')`, `session_no > 0`, a `music_url` that
    must be https, and `from_pin_id <> to_pin_id` (T17).
18. Added indexes for every foreign key that is filtered or cascaded on: `maps(parent_pin_id)`, `folders(parent_id)`,
    `pages(folder_id)` and `links(to_pin_id)`. `from_pin_id` is covered by the unique index. The draft's five indexes
    are kept.

## Kept exactly as drafted

The `settings` jsonb, `fog_mode` (`shared` or `per_group`), the pin colour pattern `^#[0-9a-f]{6}$`, pin size 16 to 80,
`unique (from_pin_id, to_pin_id)`, and folders readable by DMs only.
