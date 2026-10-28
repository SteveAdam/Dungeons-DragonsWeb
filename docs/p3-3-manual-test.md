# P3-3 manual test: party groups, discovery and the Here tab

Three browsers (or one normal window and two private ones): **A** signed in as the DM, **B** as player 1, **C** as
player 2, all in the same campaign. Each player needs a character.

## Setup (local stack)

1. `pnpm db:start`, then `pnpm exec supabase migration up` (applies `0019` and `0020` without wiping data).
2. Serve the Edge Functions (searches and group moves go through the roll function), then the app:

   ```bash
   pnpm functions:serve
   ```

   ```bash
   pnpm dev
   ```

3. If the players have no characters yet:

   ```bash
   pnpm db:seed:dev <player 1 email>
   ```

   ```bash
   pnpm db:seed:dev <player 2 email> Kael
   ```

## The region (browser A, DM mode on)

4. Open a map, draw a region named **Mourning Wood** (or use one you have) and make it visible to players.
5. In the region panel, **In this region**:
   - **Folk** › _Add folk_: `Orsa the hedge witch`, Discovery _Noticed_. Save.
   - **Finds** › _Add find_: `Mossy shrine`, Discovery _Hinted_, Discovery DC `14`, Hint `Something glints`. Save.
   - **Finds** › _Add find_: `Old tracks`, Discovery _Hidden_, Discovery DC `12`. Save.
   - **Finds** › _Add find_: `Zephyr vault`, Discovery _Hidden_, Discovery DC `30`, DM notes `cursed`. Save.

## Groups (browser A, hub › Party, DM mode on; acceptance 1)

6. Under **Party groups**, create `Group 1` and `Group 2`.
7. Drag player 1's character onto _Group 1_ (or choose _Group 1_ in its menu: the keyboard way). Put player 2's
   character in _Group 2_.
8. In _Group 1_ choose the map and **Mourning Wood**, then **Move group here**. The panel says what the members
   noticed on arrival: _Orsa the hedge witch_, and _Old tracks_ when the best passive Perception in the group is 12
   or more (10 + the Perception bonus). The group's discovery list shows them with NOTICED.
9. Move _Group 2_ to the same map, **No region**.

## The Here tab (browser B, player 1; acceptance 1)

10. Open your character. A red **Here** ribbon sits on the right edge (on a phone, at the bottom). Open it: the
    heading is _Mourning Wood_ with the tag _Group 1_.
11. _Folk_ lists **Orsa the hedge witch** with a disabled _Talk_ button. _Undiscovered_ shows **Something glints**.
    The shrine's name, the hidden tracks (unless passives found them) and the vault appear nowhere.
12. Open the browser's network tab and look at the `get_here` response: it holds no `Zephyr vault`, no `cursed`, no
    DC and no spawn rule. No request to `region_content` or `content_discoveries` is made.

## Searching (browser B; acceptance 2)

13. **Search** opens the odds popup with _The DM has not shown the difficulty_: your Perception bonus shows, but no
    DC and no percentage. **Roll**.
    - Total 14 or more: _You notice Mossy shrine_. The shrine moves to _Finds_, the hint disappears, and a notice
      shows at the bottom of the screen. (Total 30 or more also finds the vault.)
    - Lower: _You find nothing new_.
14. Search again at once: _You searched here in the last 10 minutes…_ (the cooldown is per character per region;
    `campaigns.settings.searchCooldownMinutes` changes it).
15. To force a result while testing, the DM can use **Discovery** _Noticed_ on the shrine (step 5), or move the
    group out and back in after raising the DC.

## The other group (browser C, player 2; acceptance 3)

16. Open player 2's character and the **Here** tab: _Your group is not in a region the DM has placed it in._ Nothing
    from Mourning Wood shows, and no notice appeared when group 1 found the shrine.
17. (DM) Move _Group 2_ into Mourning Wood. Player 2 now sees Orsa and _Something glints_ (group 1's search does not
    count for group 2), unless their own passives reveal more.

## Notes

- Realtime notices need the hosted project or a local stack with realtime running; without it the list still
  updates after a search, and on the next page load for the other members.
- Talk, Act and Buy are disabled placeholders until dialogue, combat and shops arrive.
