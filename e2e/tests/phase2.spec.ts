// P2-12: the Phase 2 scenario, end to end, with three people: a DM and two players, each in their own browser
// context. Every step is named, so a failure says where it happened. The accounts are made fresh for each run
// (local stack only), so runs never collide.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { localStack } from '../stack';

const stack = localStack();
const run = Date.now().toString(36);
// a throwaway password for this run's local test accounts
const PASSWORD = `e2e-${randomBytes(9).toString('base64url')}`;

interface Person {
  page: Page;
  email: string;
  token: () => Promise<string>;
}

async function person(browser: Browser, who: string): Promise<Person> {
  const context = await browser.newContext();
  const page = await context.newPage();
  return {
    page,
    email: `e2e-${who}-${run}@example.test`,
    token: () =>
      page.evaluate(() => {
        const key = Object.keys(localStorage).find(k => k.endsWith('-auth-token'));
        return key ? (JSON.parse(localStorage.getItem(key) as string) as { access_token: string }).access_token : '';
      }),
  };
}

async function signUp(p: Person) {
  await p.page.goto('/login');
  await p.page.getByRole('button', { name: /Create an account/ }).click();
  await p.page.getByLabel('Email', { exact: true }).fill(p.email);
  await p.page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await p.page.getByRole('button', { name: 'Create account' }).click();
  await p.page.waitForURL('**/campaigns');
}

/** A REST call to the local stack as a signed-in person. */
async function rest(token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`${stack.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: stack.anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
const rpc = (token: string, fn: string, args: object) =>
  rest(token, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
const rows = async (token: string, path: string) => {
  const r = await rest(token, path);
  expect(r.status, `${path}: ${JSON.stringify(r.body)}`).toBe(200);
  return r.body as Record<string, unknown>[];
};

/** Through the creation wizard (P2-9), from step 1 to the created sheet. Returns the character's id. */
async function createCharacter(
  p: Person,
  campaignId: string,
  c: {
    name: string;
    species: string;
    cls: string;
    background: string;
    scores: [string, string][];
    plus2: string;
    plus1: string;
    skills: string[];
    spells?: { cantrips: string[]; spellbook: string[]; prepared: string[] };
  },
) {
  const page = p.page;
  const next = () => page.getByRole('button', { name: 'Next' }).click();
  await page.goto(`/campaigns/${campaignId}/characters/new`);
  await page.getByLabel('Name', { exact: true }).fill(c.name);
  await page.getByLabel('Species', { exact: true }).selectOption({ label: c.species });
  await next();
  await page.getByLabel('Class', { exact: true }).selectOption({ label: c.cls });
  await next();
  await page.getByLabel('Background', { exact: true }).selectOption({ label: c.background });
  await next();
  await expect(page.getByRole('heading', { name: '4. Ability scores' })).toBeVisible();
  for (const [ability, score] of c.scores)
    await page.getByLabel(`${ability} score`, { exact: true }).selectOption(score);
  await page.getByLabel('+2 to', { exact: true }).selectOption({ label: c.plus2 });
  await page.getByLabel('+1 to', { exact: true }).selectOption({ label: c.plus1 });
  await next();
  for (const s of c.skills) await page.getByRole('checkbox', { name: s, exact: true }).check();
  await next();
  await next();
  await expect(page.getByRole('heading', { name: '7. Spells' })).toBeVisible();
  if (c.spells) {
    const pick = async (group: RegExp, names: string[]) => {
      for (const n of names)
        await page.getByRole('group', { name: group }).getByRole('checkbox', { name: n, exact: true }).check();
    };
    await pick(/^Cantrips/, c.spells.cantrips);
    await pick(/^Spellbook/, c.spells.spellbook);
    await pick(/^Prepared from your spellbook/, c.spells.prepared);
  }
  await next();
  await page.getByLabel('Alignment', { exact: true }).selectOption({ label: 'Neutral good' });
  await next();
  await expect(page.getByRole('heading', { name: '9. Review' })).toBeVisible();
  await page.getByRole('button', { name: 'Create character' }).click();
  await page.waitForURL(/\/characters\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop() as string;
}

test('Phase 2: a DM and two players, from campaign to level 3, items, effects, rolls and security', async ({
  browser,
}) => {
  const dm = await person(browser, 'dm');
  const a = await person(browser, 'player-a');
  const b = await person(browser, 'player-b');
  let campaignId = '';
  let fighterId = '';
  let wizardId = '';

  await test.step('1. The DM creates a campaign; both players join with the invite code', async () => {
    await signUp(dm);
    await dm.page.getByLabel('Campaign name', { exact: true }).fill(`E2E ${run}`);
    await dm.page.getByRole('button', { name: 'Create campaign' }).click();
    await dm.page.waitForURL(/\/campaigns\/[0-9a-f-]{36}/);
    campaignId = dm.page.url().split('/')[4];
    const [secret] = await rows(await dm.token(), `campaign_secrets?campaign_id=eq.${campaignId}&select=invite_code`);
    for (const p of [a, b]) {
      await signUp(p);
      await p.page.getByLabel('Invite code', { exact: true }).fill(secret.invite_code as string);
      await p.page.getByRole('button', { name: 'Join campaign' }).click();
      await p.page.waitForURL(`**/campaigns/${campaignId}**`);
    }
    const members = await rows(await dm.token(), `members?campaign_id=eq.${campaignId}&select=role`);
    expect(members.map(m => m.role).sort()).toEqual(['dm', 'player', 'player']);
  });

  await test.step('2. Player A makes a level 1 Fighter and player B a level 1 Wizard, through the wizard', async () => {
    // Strength 15 + 1 = 16 (so the Greatsword of the Drowned stays locked); Constitution 14 + 2 = 16 (+3)
    fighterId = await createCharacter(a, campaignId, {
      name: 'Aldric',
      species: 'Dwarf',
      cls: 'Fighter',
      background: 'Soldier',
      scores: [
        ['Strength', '15'],
        ['Dexterity', '13'],
        ['Constitution', '14'],
        ['Intelligence', '8'],
        ['Wisdom', '12'],
        ['Charisma', '10'],
      ],
      plus2: 'Constitution',
      plus1: 'Strength',
      skills: ['Perception', 'Survival'],
    });
    await expect(a.page.getByText('Fighter 1')).toBeVisible();
    // Intelligence 15 + 2 = 17; Constitution 14 + 1 = 15 (+2)
    wizardId = await createCharacter(b, campaignId, {
      name: 'Sera',
      species: 'Elf',
      cls: 'Wizard',
      background: 'Sage',
      scores: [
        ['Strength', '8'],
        ['Dexterity', '13'],
        ['Constitution', '14'],
        ['Intelligence', '15'],
        ['Wisdom', '12'],
        ['Charisma', '10'],
      ],
      plus2: 'Intelligence',
      plus1: 'Constitution',
      skills: ['Investigation', 'Medicine'],
      spells: {
        cantrips: ['Fire Bolt', 'Light', 'Mage Hand'],
        spellbook: ['Detect Magic', 'Feather Fall', 'Mage Armor', 'Magic Missile', 'Sleep', 'Thunderwave'],
        prepared: ['Mage Armor', 'Magic Missile', 'Sleep', 'Thunderwave'],
      },
    });
    await expect(b.page.getByText('Wizard 1')).toBeVisible();
  });

  await test.step('3. The DM awards 900 XP each to the Party; both become level 3 by XP, with level-ups waiting', async () => {
    await dm.page.goto(`/campaigns/${campaignId}/party`);
    const form = dm.page.getByRole('form', { name: 'Award XP' });
    await form.getByLabel('XP', { exact: true }).fill('1800');
    await expect(form.getByText('Each of 2 gets 900 XP.')).toBeVisible();
    await form.getByRole('button', { name: 'Award XP' }).click();
    await expect(form.getByText('Awarded 1,800 XP to The Party.')).toBeVisible();
    for (const [p, id] of [
      [a, fighterId],
      [b, wizardId],
    ] as const) {
      await p.page.goto(`/campaigns/${campaignId}/characters/${id}`);
      await expect(p.page.getByText('Level up available: 2 levels (level 3 by XP)')).toBeVisible();
    }
  });

  await test.step('4. Both players complete both level-ups: level 3 with the right hit points and spell slots', async () => {
    const next = (p: Person) => p.page.getByRole('button', { name: 'Next' }).click();
    // the Fighter: average hit points both times (d10: 6 + 3), the Champion at level 3
    await a.page.goto(`/campaigns/${campaignId}/characters/${fighterId}/level-up`);
    for (let i = 0; i < 4; i++) await next(a);
    await a.page.getByRole('button', { name: 'Apply level 2' }).click();
    await expect(a.page.getByRole('heading', { name: 'Level 3: Hit points' })).toBeVisible();
    await next(a);
    await a.page.getByRole('radio', { name: 'Champion' }).check();
    for (let i = 0; i < 3; i++) await next(a);
    await a.page.getByRole('button', { name: 'Apply level 3' }).click();
    await expect(a.page.getByText(/is level 3, with no level-up waiting/)).toBeVisible();

    // the Wizard: two spellbook spells and one prepared at each level, level 2 spells at 3, the Evoker
    await b.page.goto(`/campaigns/${campaignId}/characters/${wizardId}/level-up`);
    const learn = async (book: string[], prep: string) => {
      for (const s of book) {
        await b.page
          .getByRole('group', { name: /Add to your spellbook/ })
          .getByRole('checkbox', { name: s, exact: true })
          .check();
      }
      await b.page
        .getByRole('group', { name: /Prepare from your spellbook/ })
        .getByRole('checkbox', { name: prep, exact: true })
        .check();
    };
    for (let i = 0; i < 3; i++) await next(b);
    await learn(['Shield (level 1)', 'Grease (level 1)'], 'Shield (level 1)');
    await next(b);
    await b.page.getByRole('button', { name: 'Apply level 2' }).click();
    await expect(b.page.getByRole('heading', { name: 'Level 3: Hit points' })).toBeVisible();
    await next(b);
    await b.page.getByRole('radio', { name: 'Evoker' }).check();
    await next(b);
    await next(b);
    await learn(['Blur (level 2)', 'Acid Arrow (level 2)'], 'Blur (level 2)');
    await next(b);
    await b.page.getByRole('button', { name: 'Apply level 3' }).click();
    await expect(b.page.getByText(/is level 3, with no level-up waiting/)).toBeVisible();

    // hit points: Fighter 13 + 9 + 9; Wizard 8 + 6 + 6
    const [fighter] = await rows(await a.token(), `characters?id=eq.${fighterId}&select=level_applied,sheet`);
    const [wizard] = await rows(await b.token(), `characters?id=eq.${wizardId}&select=level_applied,sheet`);
    expect([fighter.level_applied, (fighter.sheet as { hp: { max: number } }).hp.max]).toEqual([3, 31]);
    expect([wizard.level_applied, (wizard.sheet as { hp: { max: number } }).hp.max]).toEqual([3, 20]);
    await a.page.goto(`/campaigns/${campaignId}/characters/${fighterId}`);
    await expect(a.page.getByText('Fighter 3')).toBeVisible();
    await b.page.goto(`/campaigns/${campaignId}/characters/${wizardId}/spells`);
    await expect(b.page.getByRole('listitem', { name: '1st level: 4 of 4 left' })).toBeVisible();
    await expect(b.page.getByRole('listitem', { name: '2nd level: 2 of 2 left' })).toBeVisible();
  });

  await test.step('5. The Greatsword of the Drowned: locked, unlocked by the potion, locked again 61 minutes later', async () => {
    await dm.page.goto(`/campaigns/${campaignId}/characters/${fighterId}/pack`);
    const create = dm.page.getByRole('form', { name: 'Create an item' });
    await create.getByLabel('Start from', { exact: true }).selectOption({ label: 'Greatsword' });
    await create.getByLabel('Name', { exact: true }).fill('Greatsword of the Drowned');
    await create.getByLabel('Magic bonus', { exact: true }).fill('1');
    await create.getByRole('button', { name: /Add a requirement/ }).click();
    await create.getByLabel('Requirement 1: minimum score', { exact: true }).fill('17');
    await create.getByRole('button', { name: 'Create item' }).click();
    await expect(create.getByText('Created Greatsword of the Drowned.')).toBeVisible();
    // and a scroll for step 6, on a fresh page (the form re-renders while the new item arrives)
    await dm.page.reload();
    await create.getByLabel('Name', { exact: true }).fill('Scroll of Fog Cloud');
    await create.getByLabel('Kind', { exact: true }).selectOption('consumable');
    await create.getByRole('button', { name: 'Create item' }).click();
    await expect(create.getByText('Created Scroll of Fog Cloud.')).toBeVisible();

    const greatsword = () => a.page.getByRole('listitem').filter({ hasText: 'Greatsword of the Drowned' }).first();
    await a.page.goto(`/campaigns/${campaignId}/characters/${fighterId}/pack`);
    await expect(greatsword().getByText('Locked: needs STR 17, you have 16')).toBeVisible();

    await dm.page.goto(`/campaigns/${campaignId}/characters/${fighterId}`);
    const tool = dm.page.getByRole('form', { name: 'Apply an effect' });
    await tool
      .getByLabel('Preset', { exact: true })
      .selectOption({ label: 'Potion of Hill Giant Strength (Strength at least 21, 1 hour)' });
    await tool.getByLabel('Hidden detail (DMs only)', { exact: true }).fill('Brewed by a hag');
    await tool.getByRole('button', { name: 'Apply effect' }).click();
    await expect(tool.getByText('Applied Potion of Hill Giant Strength.')).toBeVisible();
    await a.page.reload();
    await expect(greatsword().getByText('Usable thanks to Potion of Hill Giant Strength')).toBeVisible();

    const clock = dm.page.getByRole('form', { name: 'Advance by another amount' });
    await clock.getByLabel('Amount', { exact: true }).fill('61');
    await clock.getByRole('button', { name: 'Advance' }).click();
    await expect(dm.page.getByText('Day 1, 01:01')).toBeVisible();
    await a.page.reload();
    await expect(greatsword().getByText('Locked: needs STR 17, you have 16')).toBeVisible();
  });

  await test.step('6. Player A offers the scroll to player B; it moves only when B accepts', async () => {
    await a.page.getByRole('button', { name: 'Give Scroll of Fog Cloud' }).click();
    const give = a.page.getByRole('form', { name: 'Give Scroll of Fog Cloud to…' });
    await give.getByRole('radio', { name: /Sera/ }).check();
    await give.getByRole('button', { name: 'Offer to Sera' }).click();
    await expect(a.page.getByText('Offered to Sera, waiting')).toBeVisible();
    const scroll = async () =>
      (await rows(await dm.token(), `items?campaign_id=eq.${campaignId}&kind=eq.consumable&select=owner_id`))[0]
        .owner_id;
    expect(await scroll()).toBe(fighterId);

    await b.page.goto(`/campaigns/${campaignId}/characters/${wizardId}/pack`);
    const offer = b.page.getByRole('region', { name: 'Offers for you' });
    await expect(offer.getByText('Aldric offers you Scroll of Fog Cloud.')).toBeVisible();
    await offer.getByRole('button', { name: 'Accept' }).click();
    await expect(b.page.getByText('Scroll of Fog Cloud · Aldric → Sera · accepted')).toBeVisible();
    expect(await scroll()).toBe(wizardId);
  });

  await test.step('7. Player A rolls Athletics through the odds popup; a forged bonus is ignored', async () => {
    // Strength 16 (+3) and proficiency +2 (the Soldier's Athletics): +5
    await a.page.goto(`/campaigns/${campaignId}/characters/${fighterId}`);
    await a.page.getByRole('button', { name: /^Athletics \+5/ }).click();
    const popup = a.page.getByRole('dialog');
    await popup.getByRole('button', { name: 'Roll', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Roll again' })).toBeVisible();
    const [stored] = await rows(
      await a.token(),
      `rolls?character_id=eq.${fighterId}&kind=eq.check&select=bonus,label&order=created_at.desc&limit=1`,
    );
    expect(stored).toEqual({ bonus: 5, label: 'Athletics check' });

    const forged = await fetch(`${stack.url}/functions/v1/roll`, {
      method: 'POST',
      headers: {
        apikey: stack.anonKey,
        Authorization: `Bearer ${await a.token()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'roll',
        campaignId,
        characterId: fighterId,
        kind: 'check',
        key: 'athletics',
        target: 10,
        bonus: 30,
        bonusBreakdown: [{ label: 'Forged', value: 30 }],
      }),
    });
    expect(forged.status).toBe(200);
    expect(((await forged.json()) as { bonus: number }).bonus).toBe(5);
  });

  await test.step('8. Security, by direct API calls with each player’s own token', async () => {
    const dmToken = await dm.token();
    const aToken = await a.token();
    const bToken = await b.token();
    // a secret on the greatsword and a hidden entity, for the players not to see
    const [sword] = await rows(dmToken, `items?campaign_id=eq.${campaignId}&kind=eq.weapon&select=entity_id`);
    const secret = await rest(dmToken, 'item_secrets', {
      method: 'POST',
      body: JSON.stringify({ item_id: sword.entity_id, dm_notes: 'Cursed', hidden_effect: 'Drowns the wielder' }),
    });
    expect(secret.status).toBe(201);
    const cult = await rpc(dmToken, 'create_entity', {
      p_campaign: campaignId,
      p_type: 'faction',
      p_name: 'The Drowned Cult',
      p_visible: false,
    });
    expect(cult.status).toBe(200);
    expect((await rows(dmToken, 'item_secrets?select=item_id')).length).toBeGreaterThan(0);
    expect((await rows(dmToken, 'effect_secrets?select=effect_id')).length).toBeGreaterThan(0);

    for (const [who, token, mine, theirs] of [
      ['A', aToken, fighterId, wizardId],
      ['B', bToken, wizardId, fighterId],
    ] as const) {
      // reading what is not theirs
      expect(await rows(token, `characters?id=eq.${theirs}&select=id`), `${who} reads the other character`).toEqual([]);
      expect(await rows(token, 'item_secrets?select=item_id'), `${who} reads item secrets`).toEqual([]);
      expect(await rows(token, 'effect_secrets?select=effect_id'), `${who} reads effect secrets`).toEqual([]);
      expect(await rows(token, `ledger?target_id=eq.${theirs}&select=id`), `${who} reads the other's ledger`).toEqual(
        [],
      );
      expect(
        await rows(token, `entities?campaign_id=eq.${campaignId}&name=eq.The Drowned Cult&select=id`),
        `${who} reads a hidden entity`,
      ).toEqual([]);
      expect(await rows(token, `wallets?owner_id=eq.${theirs}&select=gp`), `${who} reads the other's wallet`).toEqual(
        [],
      );

      // changing what only the DM or the server may change
      const before = (await rows(token, `characters?id=eq.${mine}&select=xp,level_applied`))[0];
      await rest(token, `characters?id=eq.${mine}`, { method: 'PATCH', body: JSON.stringify({ xp: 355000 }) });
      await rest(token, `characters?id=eq.${mine}`, { method: 'PATCH', body: JSON.stringify({ level_applied: 20 }) });
      expect(
        (await rows(token, `characters?id=eq.${mine}&select=xp,level_applied`))[0],
        `${who} changed XP or level`,
      ).toEqual(before);
      const purse = (await rows(token, `wallets?owner_id=eq.${mine}&select=gp`))[0];
      await rest(token, `wallets?owner_id=eq.${mine}`, { method: 'PATCH', body: JSON.stringify({ gp: 99999 }) });
      expect((await rows(token, `wallets?owner_id=eq.${mine}&select=gp`))[0], `${who} changed a wallet`).toEqual(purse);
      const myRolls = await rows(
        token,
        `rolls?campaign_id=eq.${campaignId}&rolled_by=not.is.null&select=id,bonus&order=id`,
      );
      await rest(token, `rolls?campaign_id=eq.${campaignId}`, { method: 'PATCH', body: JSON.stringify({ bonus: 40 }) });
      await rest(token, `rolls?campaign_id=eq.${campaignId}`, { method: 'DELETE' });
      expect(
        await rows(token, `rolls?campaign_id=eq.${campaignId}&rolled_by=not.is.null&select=id,bonus&order=id`),
        `${who} changed rolls`,
      ).toEqual(myRolls);
    }
  });

  await test.step('9. The DM links and files entities; players see only visible entities and links', async () => {
    const dmToken = await dm.token();
    const make = async (name: string, type: string, visible: boolean) =>
      (
        (
          await rpc(dmToken, 'create_entity', {
            p_campaign: campaignId,
            p_type: type,
            p_name: name,
            p_visible: visible,
          })
        ).body as { id: string }
      ).id;
    const mira = await make('Mira', 'npc', true);
    const port = await make('Port Vellum', 'location', true);
    const [cult] = await rows(dmToken, `entities?campaign_id=eq.${campaignId}&name=eq.The Drowned Cult&select=id`);
    const link = (p_a: string, p_b: string, ab: string, ba: string, hidden: boolean) =>
      rpc(dmToken, 'add_link', { p_a, p_b, p_label_ab: ab, p_label_ba: ba, p_hidden: hidden });
    expect((await link(mira, port, 'lives in', 'is home to', false)).status).toBe(200);
    expect((await link(mira, port, 'secretly rules', 'is secretly ruled by', true)).status).toBe(200);
    expect((await link(mira, cult.id as string, 'serves', 'is served by', false)).status).toBe(200);
    const folder = (await rpc(dmToken, 'create_folder', { p_campaign: campaignId, p_name: 'Sword Coast' })).body as {
      id: string;
    };
    expect((await rpc(dmToken, 'move_entity', { p_entity: mira, p_folder: folder.id })).status).toBe(200);
    expect((await rows(dmToken, `entities?id=eq.${mira}&select=folder_id`))[0].folder_id).toBe(folder.id);
    expect(await rows(dmToken, `entity_links?campaign_id=eq.${campaignId}&select=id`)).toHaveLength(3);

    for (const p of [a, b]) {
      const token = await p.token();
      const names = (
        await rows(token, `entities?campaign_id=eq.${campaignId}&type=in.(npc,location,faction)&select=name`)
      )
        .map(e => e.name)
        .sort();
      expect(names).toEqual(['Mira', 'Port Vellum']);
      const links = await rows(token, `entity_links?campaign_id=eq.${campaignId}&select=label_ab`);
      expect(links.map(l => l.label_ab)).toEqual(['lives in']);
      expect(await rows(token, `entity_folders?campaign_id=eq.${campaignId}&select=id`)).toEqual([]);
    }
    // and the Codex shows the same
    await a.page.goto(`/campaigns/${campaignId}/entities`);
    const codex = a.page.getByRole('tabpanel', { name: 'Codex' });
    await expect(codex.getByRole('button', { name: 'Mira NPC' })).toBeVisible();
    await expect(codex.getByRole('button', { name: 'Port Vellum Location' })).toBeVisible();
    await expect(codex.getByText('The Drowned Cult')).toHaveCount(0);
  });
});
