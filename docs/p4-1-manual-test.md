# P4-1 manual two-window test

Set up: `pnpm db:start`, then `pnpm dev`. Use two different browsers, or one normal and one private window, so that each
has its own sign-in. You need a campaign with a DM account and a player account.

The test bench below exists only in development: `/campaigns/<campaign id>/dev/realtime`.

## 1. Presence

1. Sign in as the DM in window A and open the campaign.
2. Sign in as the player in window B and open the same campaign.
3. Within a second, both headers show two avatars. Each has a status dot, and its label reads "name, Active".
4. Click the avatars in the header: the list shows each name and status in words.
5. Leave window B untouched for 3 minutes. Window A shows the player as Away, with an empty ring for the dot.
6. Move the mouse over window B. The player is Active again.
7. Close window B. The player's avatar leaves window A within 5 seconds.

## 2. Events

Open window B again as the player. Open the test bench in both windows.

1. In A, press **Send to the table**. A toast appears in both windows, and B's Heard list says "(from dm)".
2. In A, press **Send to DMs only**. It appears in A. Wait a few seconds: B shows nothing.
3. In B, press **Send to the table**. B says "Not sent: failed", and A hears nothing.

## 3. Who can join what

On the bench, press each **Try** button:

| Button     | DM      | Player  |
| ---------- | ------- | ------- |
| campaign   | allowed | allowed |
| dm         | allowed | refused |
| own user   | allowed | allowed |
| other user | allowed | refused |

A third account that is not in the campaign gets "refused" for all of them.

## 4. One connection across screens

1. In A, open the browser's developer tools, go to Network and filter by **WS**. Reload: one `realtime` socket opens.
2. Move between the campaign's screens (hub, a map, a character sheet, the library).
3. The socket's row stays open and no new one appears. The header does not flicker.

The **Try** buttons open a separate socket on purpose, so don't press them during this step.

## 5. Reconnecting

1. In A, set Network to **Offline**. The header says "Offline".
2. Set it back to **No throttling**. The header says "Reconnecting…", then "Connected".
3. While A was offline, advance the game clock in B. After A reconnects, A shows the new time without a reload.

## Hosted project

After `db:push` and deploying the app, turn off **Allow public access** in the Supabase dashboard under Realtime
Settings. Without that, Supabase does not enforce private channels.
