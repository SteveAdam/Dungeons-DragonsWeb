# P2-6 manual test: the Party, XP and coins with two players

Three browsers (or one normal window and two private ones): **A** signed in as the DM, **B** as player 1, **C** as
player 2, all in the same campaign. The Party is the campaign hub's **Party** tab (`/campaigns/<id>/party`).

## Setup (local stack)

1. `pnpm db:start`, then `pnpm exec supabase migration up` (applies `0012_party_ledger.sql` without wiping data),
   then `pnpm dev`.
2. Sign up the DM, create a campaign, and have both players join it with the invite code.
3. Players cannot create characters until the creation wizard (P2-9), so seed one each:

   ```bash
   pnpm db:seed:dev <player 1 email>
   ```

   ```bash
   pnpm db:seed:dev <player 2 email> Kael
   ```

   Brannoc (player 1) is level 5 at 6,900 XP, built to level 5. Kael (player 2) is level 1 at 0 XP. Both joined the
   official Party when they were created.

## DM (browser A, DM mode on)

4. Open **Party**. The heading reads _The Party · 2 members_. Brannoc shows _Level 5 by XP_ and _6,900 of 14,000
   XP_; Kael _Level 1 by XP_ and _0 of 300 XP_. Neither has levels pending. The pool is _0 GP_ and **Split the pool**
   is disabled (_Not enough in the pool to give every member a coin._).
5. The ledger has one row: Brannoc, _+6,900 XP_, _XP before the ledger_ (his XP from before the ledger existed).
6. **Award XP to the Party.** In _Award XP_ leave _To_ on _The Party (shared)_, type `1801`, Source **Encounter**,
   Note `Cleared the sunken crypt`. Before sending, the form says _Each of 2 gets 900 XP; 1 XP is left over and not
   awarded._ Select **Award XP**: _Awarded 1,801 XP to The Party._
7. Kael now shows _Level 3 by XP_ and the tag _2 levels pending_ (acceptance 1: 900 XP for each member is level 3
   by XP, with two levels pending). Brannoc shows _7,800 of 14,000 XP_.
8. The ledger shows _+900 XP_ for Kael and for Brannoc, both _Encounter_ with the note, and a Party row _1 XP left
   over_.
9. **Award XP to one character.** _To_ Brannoc, `200`, **Quest**: only Brannoc's XP changes (_8,000 of 14,000_).
10. **Award coins to the pool.** In _Award coins_ leave _To_ on _The party pool_, Gold `7`, Silver `1`, Note
    `Crypt hoard`, **Award coins**: the pool reads _7 GP, 1 SP_ and the preview says _Splitting gives each of the 2
    members 3 GP; 1 GP, 1 SP stays in the pool._
11. **Split.** Select **Split the pool**: the pool reads _1 GP, 1 SP_; each member's purse (listed under the pool)
    reads _3 GP_. The ledger shows _−6 GP_ for the Party, _+3 GP_ for each member, and _1 GP, 1 SP left in the
    pool_.
12. **Filters.** Kind **Coins** shows only coin rows; Who **Kael** only Kael's rows; Source **Quest** only the
    200 XP award.
13. Open Kael's sheet from the member list. _Class and level_ still reads _… 1_ (the sheet stays at its applied
    level), Experience reads _900 of 2,700 for Level 4_, and below it _Level up available: 2 levels (level 3 by XP)_
    with a disabled **Level up** button (the level-up flow comes in P2-10).

## Player 1 (browser B)

14. Open **Party**. Only Brannoc is listed, then _and 1 other adventurer_. There are no award forms and no split
    button. _Brannoc's purse_ reads _3 GP_; the _Party pool_ reads _1 GP, 1 SP_.
15. The ledger lists only rows about Brannoc and the Party, never Kael's.
16. **Deposit too much.** In _Deposit into the pool_ type Gold `4`: _That is more than the purse holds._ and
    **Deposit** is disabled.
17. **Deposit.** Gold `2`, Note `For the ferryman`, **Deposit**: _Deposited 2 GP into the pool._ The purse reads
    _1 GP_ and the pool _3 GP, 1 SP_.

## Player 2 (browser C)

18. Open **Party**: Kael is listed with _2 levels pending_; Brannoc is not (_and 1 other adventurer_). The pool
    reads _3 GP, 1 SP_ (refresh if it was open before step 17).
19. Open Kael's sheet: the _Level up available_ badge is there, and the **Level up** button is disabled.

## The database refuses

The screens never offer a player the DM's functions, so the refusals are checked by the database tests:
`pnpm db:test` runs T41 to T46 (only DMs award or split; 100 XP to three members is 33 each plus a remainder row of
1; the ledger cannot be changed or deleted by any role; wallets never go negative and a deposit larger than the
wallet fails; one official Party per campaign, joined automatically; players cannot change XP or the applied
level). `pnpm db:test:mutations` proves each of those tests fails when its protection is removed.

20. Optional, by hand: in browser B's developer tools, find a request to `/rest/v1/wallets` in the Network tab and
    repeat it as a PATCH with body `{"gp": 1000}`. It is refused (permission denied), and the purse is unchanged.

## Totals equal the ledger (acceptance 2)

21. In the SQL editor (or `docker exec supabase_db_dnd-manager-web psql -U postgres`):

    ```sql
    select name, xp, (select sum((amount->>'xp')::int) from ledger l
                      where l.kind = 'xp' and l.target_type = 'character' and l.target_id = c.id) as ledger_xp
    from characters c;
    ```

    Every `xp` equals its `ledger_xp`. The same holds for each wallet's coins against the coin rows.
