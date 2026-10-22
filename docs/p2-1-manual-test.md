# P2-1 manual test: the entity registry with two accounts

Two browsers (or one normal and one private window): **A** signed in as the DM, **B** as a player in the same
campaign. Local stack: `pnpm db:start`, `pnpm dev`. The Codex is the campaign hub's **Codex** tab
(`/campaigns/<id>/entities`).

## DM (browser A, DM mode on)

1. Open the Codex. It is empty: "All entities", "Top level 0", "Nothing here yet."
2. **Folders.** In "New folder" type `Sword Coast`, choose **Add folder**. Select **Sword Coast** in the tree, type
   `Port Vellum` in "New folder in Sword Coast", **Add folder**. The tree shows Port Vellum under Sword Coast.
3. **Entities.** Choose **All entities**. Create an NPC `Mira`, a Location `Port Vellum` and a Faction
   `The Drowned Cult`. Each is listed with "· hidden" (new entities start hidden).
4. Try to create another NPC called `mira`: the form says _There is already an entity called "mira" in this
   campaign._ (names are unique, ignoring case, so wiki links are never ambiguous).
5. **Reveal.** Select Mira and switch **Visible to players** on; do the same for Port Vellum. Leave the Cult hidden.
6. **Relationships.** With Mira selected, in "Add a relationship": With `Port Vellum`, "Mira …" `lives in`,
   "Port Vellum …" `is home to`, **Add relationship**. Then add `secretly rules` / `is secretly ruled by` with
   **Hidden from players** on, and `serves` / `is served by` with The Drowned Cult (not hidden).
7. Mira's list reads _Mira lives in Port Vellum_, _Mira secretly rules Port Vellum_, _Mira serves The Drowned Cult_.
   Select _Mira lives in Port Vellum_: the detail switches to Port Vellum, which reads _Port Vellum is home to Mira_
   and _Port Vellum is secretly ruled by Mira_.
8. From Port Vellum, try adding `is home to` / `lives in` with Mira: _That relationship already exists between these
   two._ (the same relationship the other way round).
9. **Drag and drop.** Drag Mira by her grip handle onto **Sword Coast** (the folder lights up while you hover): the
   counts change to Top level 2, Sword Coast 1. Drag the **Port Vellum** folder onto **Top level**: it moves out of
   Sword Coast. Drag Sword Coast onto its own subfolder: _A folder cannot go inside itself or one of its own
   subfolders._
10. **Keyboard.** Tab to an entity in the list, press Enter to select it, then use **Move to…** in its detail to
    file it in a folder. With a folder selected, **Move folder to…** does the same for folders.
11. **Delete a folder.** Select Sword Coast, **Delete folder**, **Yes, delete**: Mira moves to the top level and no
    entity disappears.
12. On the eye button next to _Mira secretly rules Port Vellum_, select **Reveal** and then **Hide** again: the
    button's label flips between "Reveal: …" and "Hide: …".

## Player (browser B)

13. Open the Codex: only **Mira** and **Port Vellum** are listed; there is no folder tree and no "New" forms.
14. Select Mira: only _Mira lives in Port Vellum_ is shown. The hidden link (_secretly rules_) and the link to the
    hidden Cult (_serves_) are not there.
15. Search `port`: only Port Vellum remains.
16. In A, reveal the hidden link (step 12). Refresh B: _Mira secretly rules Port Vellum_ now appears. Hide it again.

## Optional: the API directly (B's access token)

In B's browser console, with the Supabase client the app already uses, or with `curl` and B's token:

- `select * from entities` returns 2 rows; `entity_links` returns 1; `entity_folders` returns 0.
- `rpc/create_entity` returns `42501` _Only the DM can do that_.
