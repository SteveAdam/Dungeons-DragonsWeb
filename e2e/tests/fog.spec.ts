// P4-3: fog of war, end to end. The DM brushes an area and a player sees it revealed live; hiding it covers it again; in
// per-group mode two groups see different fog on the same map. What a player is shown is read from the screen-reader
// summary ("Fog: about 35 percent revealed"), which is worked out from exactly the strokes drawn on their screen.
import { expect, test, type Page } from '@playwright/test';
import { createCampaignWithPlayers, createCharacter, insert, person, rest, rows, rpc, stack } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const FIGHTER = {
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
  ] as [string, string][],
  plus2: 'Constitution',
  plus1: 'Strength',
  skills: ['Perception', 'Survival'],
};

const HIDDEN = 'Fog: the whole map is hidden';
const SOME = /^Fog: about \d+ percent revealed$/;
const summary = (page: Page) => page.getByText(/^Fog: /);

/** Drags across the middle of the map, from a quarter of the way in to three quarters. */
async function brush(page: Page, row = 0.5) {
  const box = await page.locator('.leaflet-container').boundingBox();
  if (!box) throw new Error('no map on the page');
  const y = box.y + box.height * row;
  await page.mouse.move(box.x + box.width * 0.25, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, y, { steps: 12 });
  await page.mouse.up();
}

test('Phase 4: fog of war, shared and per group', async ({ browser }) => {
  const dm = await person(browser, 'dm-fog');
  const a = await person(browser, 'player-a-fog');
  const b = await person(browser, 'player-b-fog');
  let campaignId = '';
  let aldric = '';
  let sera = '';
  let mapId = '';
  let group1 = '';
  let group2 = '';

  await test.step('0. A campaign, a Fighter for each player, and a map with fog turned on', async () => {
    campaignId = await createCampaignWithPlayers(dm, [a, b]);
    aldric = await createCharacter(a, campaignId, { name: 'Aldric', ...FIGHTER });
    sera = await createCharacter(b, campaignId, { name: 'Sera', ...FIGHTER });
    const token = await dm.token();
    const image = `${campaignId}/fog.png`;
    const upload = await fetch(`${stack.url}/storage/v1/object/maps/${image}`, {
      method: 'POST',
      headers: { apikey: stack.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
      body: PNG,
    });
    expect(upload.status, await upload.clone().text()).toBe(200);
    mapId = (
      await insert(token, 'maps', {
        campaign_id: campaignId,
        name: 'E2E Moors',
        image_path: image,
        width: 2000,
        height: 1400,
        visible_to_players: true,
        fog_enabled: true,
      })
    ).id as string;
    for (const [name, character, set] of [
      ['The Vanguard', aldric, (id: string) => (group1 = id)],
      ['The Rearguard', sera, (id: string) => (group2 = id)],
    ] as const) {
      const made = await rpc(token, 'create_group', { p_campaign: campaignId, p_name: name });
      expect(made.status, JSON.stringify(made.body)).toBe(200);
      set(made.body as string);
      const assigned = await rpc(token, 'assign_character', { p_character: character, p_group: made.body });
      expect(assigned.status, JSON.stringify(assigned.body)).toBe(204);
    }
  });

  await test.step('1. A player starts with the whole map hidden', async () => {
    await a.page.goto(`/campaigns/${campaignId}/maps/${mapId}`);
    await expect(summary(a.page)).toHaveText(HIDDEN);
  });

  await test.step('2. The DM brushes an area, and the player sees it revealed live', async () => {
    const page = dm.page;
    await page.goto(`/campaigns/${campaignId}/maps/${mapId}`);
    await page.getByRole('button', { name: 'Fog of war' }).click();
    const tools = page.getByRole('region', { name: 'Fog of war' });
    await expect(tools.getByText(/Fog is cosmetic/)).toBeVisible();
    await tools.getByRole('button', { name: 'Reveal brush' }).click();
    await brush(page);
    await expect(summary(page)).toHaveText(SOME);
    await expect(summary(a.page)).toHaveText(SOME, { timeout: 10_000 });
  });

  await test.step('3. Hiding it covers it again', async () => {
    const page = dm.page;
    const tools = page.getByRole('region', { name: 'Fog of war' });
    await tools.getByRole('button', { name: 'Hide brush' }).click();
    // a wider brush, so the hide covers every edge of the reveal
    await page.keyboard.press(']');
    await page.keyboard.press(']');
    await page.keyboard.press(']');
    await brush(page);
    await expect(summary(a.page)).toHaveText(HIDDEN, { timeout: 10_000 });
    // and the history is all there: a reveal then a hide
    const saved = await rows(await dm.token(), `fog_strokes?map_id=eq.${mapId}&select=mode&order=seq`);
    expect(saved.map(s => s.mode)).toEqual(['reveal', 'hide']);
  });

  await test.step('4. Per group: the Vanguard is shown a revealed area, the Rearguard is not', async () => {
    const page = dm.page;
    await page.getByRole('button', { name: 'Map settings' }).click();
    const settings = page.getByRole('complementary', { name: 'Map settings' });
    // the radio follows the saved setting, so it turns on once the save comes back
    const perGroup = settings.getByRole('radio', { name: /Per group/ });
    await perGroup.click();
    await expect(perGroup).toBeChecked();
    const tools = page.getByRole('region', { name: 'Fog of war' });
    await expect(tools.getByLabel('Drawing the fog of')).toBeVisible();
    await tools.getByLabel('Drawing the fog of').selectOption({ label: 'The Vanguard' });
    await tools.getByRole('button', { name: 'Reveal brush' }).click();
    await brush(page, 0.3);
    await b.page.goto(`/campaigns/${campaignId}/maps/${mapId}`);
    await expect(summary(a.page)).toHaveText(SOME, { timeout: 10_000 });
    await expect(summary(b.page)).toHaveText(HIDDEN);
  });

  await test.step("5. And the database agrees: the Rearguard cannot read the Vanguard's fog, nor draw any", async () => {
    const tokenB = await b.token();
    const theirs = await rows(tokenB, `fog_strokes?map_id=eq.${mapId}&group_id=eq.${group1}&select=id`);
    expect(theirs).toEqual([]);
    const tokenA = await a.token();
    const own = await rows(tokenA, `fog_strokes?map_id=eq.${mapId}&group_id=eq.${group1}&select=id`);
    expect(own.length).toBeGreaterThan(0);
    const write = await rest(tokenB, 'fog_strokes', {
      method: 'POST',
      body: JSON.stringify({ map_id: mapId, group_id: group2, mode: 'reveal', radius: 500, points: [[1, 1]] }),
    });
    expect(write.status).toBeGreaterThanOrEqual(401);
  });
});
