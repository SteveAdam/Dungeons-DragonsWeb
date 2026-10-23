# P2-7 manual test: items, the pack and transfers with two players

Three browsers (or one normal window and two private ones): **A** signed in as the DM, **B** as player 1, **C** as
player 2, all in the same campaign. The Pack is a tab on each character page
(`/campaigns/<id>/characters/<id>/pack`).

## Setup (local stack)

1. `pnpm db:start`, then `pnpm exec supabase migration up` (applies `0013_items.sql` without wiping data), then
   `pnpm dev`.
2. If the players have no characters yet, seed them:

   ```bash
   pnpm db:seed:dev <player 1 email>
   ```

   ```bash
   pnpm db:seed:dev <player 2 email> Kael
   ```

   Each new character gets Brannoc's gear as items: chain mail, a shield, a longsword +1, a handaxe and the
   Greatsword of the Drowned equipped, and 20 arrows carried. (Characters that existed before the migration had
   their Phase 1 armour, shield and weapons turned into equipped items instead.)

## Equipment and armour class (browser B, Brannoc; acceptance 1)

3. Open Brannoc's **Sheet**: _Armour_ reads **18** (chain mail 16 + shield 2).
4. Open **Pack**. _Carrying …_ shows the total weight. The Greatsword of the Drowned reads _Locked: needs STR 17,
   you have 16_ with a lock icon.
5. Switch off _Equip Chain Mail_ and _Equip Shield_. Back on the **Sheet**, _Armour_ reads **11** (10 + Dexterity
   +1). Switch both on again: **18**.
6. Switch on _Equip Plate Armor_ if you have one (the DM can create it, step 10): _Only one suit of armour can be
   worn at a time: take the other off first._
7. (DM, browser A, DM mode on, Brannoc's Sheet) switch on the development-only _Potion of Hill Giant Strength_. The
   greatsword's attack becomes usable, _usable for 1 hour (Potion of Hill Giant Strength)_, and in the Pack it reads
   _Usable thanks to Potion of Hill Giant Strength_. Switch the potion off again.

## Attunement (browser A or B)

8. (DM) Create four items for Brannoc from scratch (step 10) with _Requires attunement_ ticked, e.g. `Ring 1` to
   `Ring 4`, kind `magic`.
9. (Brannoc) Switch on _Attune to_ for three of them: _Attuned to 3 of 3 items._ The fourth says _You are attuned to
   3 items already, the most anyone can be. End attunement to one first._ An attuned ring with an effect (e.g. AC
   adds 1) changes the sheet only while it is also equipped.

## The DM's tools (browser A, DM mode on, Brannoc's Pack)

10. **Create an item.** _Start from_ **Scratch**, Name `Scroll of Fog Cloud`, Kind `consumable`, **Add a
    requirement**: Intelligence 10. _Place with_ Brannoc. **Create item**: _Created Scroll of Fog Cloud._ It appears
    under _Carried_ with _Locked: needs INT 10, you have 9_, and the history shows _Scroll of Fog Cloud · Found →
    Brannoc · accepted_.
11. _Start from_ **Chain Mail** fills the name, kind, weight (55) and value (75 GP) from the SRD record; the rules
    (AC 16, Strength 13, Stealth disadvantage) come with it.
12. Open _DM: Crown Shard_ (create one first, kind `quest`), tick **Bound**, **Save rules**. In Brannoc's Pack it
    now reads _Bound, can't give_ and has no Give button.
13. In _DM: Scroll of Fog Cloud_, type DM notes and a hidden effect, **Save secrets**. Players never see them.

## Giving (browsers B and C; acceptance 2)

14. (B) **Give Scroll of Fog Cloud**. The dialog lists the other party members with their Intelligence and
    _can use_ / _locked_, and says _They must accept before it moves._ Choose Kael, **Offer to Kael**. The scroll
    stays in Brannoc's Pack: _Offered to Kael, waiting_ with **Cancel offer**.
15. (C) Open Kael's **Pack**: a banner reads _Brannoc offers you Scroll of Fog Cloud._ with **Accept** and
    **Decline**. Choose **Decline**: the banner goes and the scroll is still Brannoc's (refresh B).
16. (B) Offer it again. (C) **Accept**: the scroll moves to Kael's _Carried_, and his history reads _Scroll of Fog
    Cloud · Brannoc → Kael · accepted_. Brannoc's history shows the declined offer and the accepted one.
17. **Part of a stack.** (B) **Give Arrows**, choose Kael, _How many (of 20)_ `4`, **Offer to Kael**. (C) Accept:
    Brannoc keeps 16 arrows; Kael has a new stack of 4, named _Arrows (2)_.
18. (A) In _DM: Chain Mail_ on Brannoc's Pack, _Move to_ **The party**, **Move now**: it leaves Brannoc at once and
    appears under _Party inventory_ for everyone (no longer worn: the sheet's armour class drops).

## The database refuses

The screens never offer a player these, so the database tests check them: `pnpm db:test` runs T47 to T51 (players
see only their own and the Party's items and never the secrets; bound items cannot be offered; an offer moves
nothing until it is accepted, and declining leaves it; the fourth attunement and a second suit of armour or shield
are refused; a player cannot equip an item they do not own; giving 4 of 10 arrows leaves 6 and makes a stack of 4).
`pnpm db:test:mutations` proves each test fails when its protection is removed.
