// P4-4: pings and handouts, end to end. A ping is read from each person's polite live region ("… pinged near The Old
// Well"), which is filled from exactly the pings shown on their screen. Handouts are checked on screen and through the
// API: a handout shown to one player never reaches the other, nor does its image.
import { expect, test, type Page } from '@playwright/test';
import { createCampaignWithPlayers, insert, person, rest, rows, rpc, stack } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const userIdOf = (token: string) =>
  (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { sub: string }).sub;

/** The words a screen reader hears for the latest ping on this page. */
const pingWords = (page: Page) => page.locator('[aria-live="polite"]', { hasText: 'pinged' });

/** A spot just right of the map's middle (the pin sits in the middle, and a click on it would open the pin). */
async function nearTheMiddle(page: Page) {
  const box = await page.locator('.leaflet-container').boundingBox();
  if (!box) throw new Error('no map on the page');
  return { x: box.x + box.width / 2 + 45, y: box.y + box.height / 2 };
}

async function uploadTo(bucket: string, token: string, path: string) {
  const r = await fetch(`${stack.url}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { apikey: stack.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
    body: PNG,
  });
  expect(r.status, await r.clone().text()).toBe(200);
}

const download = (token: string, path: string) =>
  fetch(`${stack.url}/storage/v1/object/authenticated/handouts/${path}`, {
    headers: { apikey: stack.anonKey, Authorization: `Bearer ${token}` },
  });

test('Phase 4: pings and handouts', async ({ browser }) => {
  const dm = await person(browser, 'dm-ping');
  const a = await person(browser, 'player-a-ping');
  const b = await person(browser, 'player-b-ping');
  let campaignId = '';
  let harbour = '';
  let elsewhere = '';
  const nameA = () => a.email.split('@')[0];
  const nameB = () => b.email.split('@')[0];

  await test.step('0. A campaign, a harbour map with a pin in the middle, and a second map', async () => {
    campaignId = await createCampaignWithPlayers(dm, [a, b]);
    const token = await dm.token();
    for (const [name, set] of [
      ['E2E Harbour', (id: string) => (harbour = id)],
      ['E2E Elsewhere', (id: string) => (elsewhere = id)],
    ] as const) {
      const image = `${campaignId}/${name.replace(/\W/g, '')}.png`;
      await uploadTo('maps', token, image);
      const map = await insert(token, 'maps', {
        campaign_id: campaignId,
        name,
        image_path: image,
        width: 2000,
        height: 1400,
        visible_to_players: true,
      });
      set(map.id as string);
    }
    await insert(token, 'pins', {
      map_id: harbour,
      title: 'The Old Well',
      x: 1000,
      y: 700,
      visible_to_players: true,
    });
  });

  await test.step('1. A ping from one player reaches the other on that map within a second, and nobody elsewhere', async () => {
    await a.page.goto(`/campaigns/${campaignId}/maps/${harbour}`);
    await b.page.goto(`/campaigns/${campaignId}/maps/${harbour}`);
    await dm.page.goto(`/campaigns/${campaignId}/maps/${elsewhere}`);
    for (const p of [a, b, dm]) await expect(p.page.locator('.leaflet-container')).toBeVisible();
    // everyone is live before anyone pings
    for (const p of [a, b, dm]) await expect(p.page.getByText('Connected')).toBeVisible({ timeout: 15_000 });

    await a.page.getByRole('button', { name: 'Ping' }).click();
    const spot = await nearTheMiddle(a.page);
    const sent = Date.now();
    await a.page.mouse.click(spot.x, spot.y);
    await expect(pingWords(b.page)).toHaveText(`${nameA()} pinged near The Old Well`, { timeout: 5_000 });
    const took = Date.now() - sent;
    expect(took, `the ping took ${took} ms to reach the other player`).toBeLessThan(1000);
    await expect(pingWords(a.page)).toHaveText(`${nameA()} pinged near The Old Well`);
    // the ripple shows for three seconds: wait it out on the other map, where nothing may appear
    await a.page.waitForTimeout(1500);
    await expect(pingWords(dm.page)).toHaveCount(0);
  });

  await test.step('2. Pressing and holding still on the map pings too', async () => {
    const spot = await nearTheMiddle(b.page);
    await b.page.mouse.move(spot.x, spot.y);
    await b.page.mouse.down();
    await b.page.waitForTimeout(900);
    await b.page.mouse.up();
    await expect(pingWords(a.page)).toHaveText(`${nameB()} pinged near The Old Well`, { timeout: 5_000 });
  });

  await test.step('3. The DM mutes one player; the database then refuses that player’s pings', async () => {
    await dm.page.goto(`/campaigns/${campaignId}/maps/${harbour}`);
    await dm.page.getByText('Pings', { exact: true }).click();
    const menu = dm.page.getByRole('group', { name: 'Player pings' });
    await menu.getByRole('button', { name: `Mute ${nameB()}'s pings` }).click();
    await expect(menu.getByText(`${nameB()} (muted)`)).toBeVisible();

    const refused = await rpc(await b.token(), 'send_realtime_event', {
      p_campaign: campaignId,
      p_channel: 'campaign',
      p_event: 'ping',
      p_payload: { mapId: harbour, x: 10, y: 10, colour: 'ping-1', name: 'sneaky' },
    });
    expect(refused.status).toBe(403);
    await b.page.reload();
    await expect(b.page.getByText('The DM has muted your pings for this session.')).toBeVisible();
    await expect(b.page.getByRole('button', { name: 'Ping' })).toHaveCount(0);
    // the other player is not affected
    const allowed = await rpc(await a.token(), 'send_realtime_event', {
      p_campaign: campaignId,
      p_channel: 'campaign',
      p_event: 'ping',
      p_payload: { mapId: elsewhere, x: 10, y: 10, colour: 'ping-1', name: nameA() },
    });
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
  });

  await test.step('4. The DM writes a handout and shows it to one player, who sees it at once', async () => {
    const page = dm.page;
    await page.goto(`/campaigns/${campaignId}/handouts`);
    await page.getByRole('button', { name: 'New handout' }).click();
    await page.getByLabel('Title').fill('A letter from the harbourmaster');
    await page.getByLabel(/^Text \(shown/).fill('Meet me at the docks.\nCome alone.');
    await page.getByRole('button', { name: 'Make the handout' }).click();
    await expect(page.getByText('Not shown to anyone yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Show to…' }).click();
    await page.getByRole('radio', { name: 'Chosen players' }).click();
    await page.getByRole('checkbox', { name: nameA() }).click();
    await page.getByRole('button', { name: 'Show it' }).click();
    const library = page.getByRole('tabpanel', { name: 'Handouts' });
    await expect(library.getByRole('status')).toHaveText(`Shown to ${nameA()}.`);

    const notice = a.page.getByRole('dialog', { name: 'A letter from the harbourmaster' });
    // live, it comes at once; if the event is lost, the player's screen still finds it on its next check (20 s)
    await expect(notice.getByText('The DM shows you a handout')).toBeVisible({ timeout: 30_000 });
    await notice.getByRole('button', { name: 'Read it' }).click();
    await expect(a.page.getByText(/Meet me at the docks\.\s+Come alone\./)).toBeVisible();
    await a.page.getByRole('button', { name: 'Done' }).click();
    // the DM's list is not live: it shows who opened what when it is next read
    await expect(async () => {
      await page.reload();
      await expect(page.getByText(`${nameA()} · opened`)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    // the other player was never told
    await expect(b.page.getByRole('dialog')).toHaveCount(0);
  });

  await test.step('5. The API agrees: the other player cannot read the handout, nor an image handout’s file', async () => {
    const tokenDm = await dm.token();
    const tokenA = await a.token();
    const tokenB = await b.token();
    const image = `${campaignId}/letter-seal.png`;
    await uploadTo('handouts', tokenDm, image);
    const sealed = await insert(tokenDm, 'handouts', {
      campaign_id: campaignId,
      title: 'The seal',
      kind: 'image',
      image_path: image,
    });
    const shown = await rpc(tokenDm, 'show_handout', {
      p_handout: sealed.id,
      p_audience: 'players',
      p_users: [userIdOf(tokenA)],
    });
    expect(shown.status, JSON.stringify(shown.body)).toBe(200);

    expect((await rows(tokenA, 'handouts?select=title&order=title')).map(h => h.title)).toEqual([
      'A letter from the harbourmaster',
      'The seal',
    ]);
    expect(await rows(tokenB, 'handouts?select=id')).toEqual([]);
    expect(await rows(tokenB, 'handout_shares?select=handout_id')).toEqual([]);
    expect((await download(tokenA, image)).status).toBe(200);
    expect((await download(tokenB, image)).status).not.toBe(200);

    const sneak = await rpc(tokenB, 'show_handout', { p_handout: sealed.id, p_audience: 'everyone' });
    expect(sneak.status).toBe(403);
    const share = await rest(tokenB, 'handout_shares', {
      method: 'POST',
      body: JSON.stringify({ handout_id: sealed.id, user_id: userIdOf(tokenB) }),
    });
    expect(share.status).toBeGreaterThanOrEqual(401);
  });
});
