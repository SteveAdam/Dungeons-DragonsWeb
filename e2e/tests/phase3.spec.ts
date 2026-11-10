// P3-9: the Phase 3 scenario, end to end, with a DM and two players each in their own browser context. Fixed content
// is laid down through the API as the DM (the same rules apply: it is the DM's own token); the screens under test are
// driven by hand. Step 8 is the security check: it must fail if a read policy is weakened.
import { expect, test, type Page } from '@playwright/test';
import {
  createCampaignWithPlayers,
  createCharacter,
  insert,
  person,
  rest,
  rollFunction,
  rows,
  rpc,
  stack,
  type Person,
} from './helpers';

// 1 x 1 transparent PNG: a map only needs an image to open
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const SECRETS = ['SECRET-VAULT', 'DM-ONLY-NOTE', 'Thornwolf pack'];
const FIGHTER = {
  species: 'Dwarf',
  cls: 'Fighter',
  background: 'Soldier',
  // Wisdom 12: passive Perception 13, which stays below the shrine's DC 14 on arrival
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

async function openHere(page: Page) {
  await page.getByRole('button', { name: 'Here', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Here' });
  await expect(panel).toBeVisible();
  return panel;
}

test('Phase 3: layered maps, region content, the library, groups, discovery, calendar, weather and security', async ({
  browser,
}) => {
  const dm = await person(browser, 'dm3');
  const a = await person(browser, 'player-a3');
  const b = await person(browser, 'player-b3');
  let campaignId = '';
  let aldric = '';
  let sera = '';
  let world = '';
  let regionMap = '';
  let town = '';
  let wood = '';
  const content: Record<string, string> = {};
  let group1 = '';
  let group2 = '';
  const players: Person[] = [a, b];

  await test.step('0. A campaign, and a Fighter for each player', async () => {
    campaignId = await createCampaignWithPlayers(dm, players);
    aldric = await createCharacter(a, campaignId, { name: 'Aldric', ...FIGHTER });
    sera = await createCharacter(b, campaignId, { name: 'Sera', ...FIGHTER });
  });

  await test.step('1. World, region and town maps in layers: a hidden link hides the town from players', async () => {
    const token = await dm.token();
    const image = `${campaignId}/world.png`;
    const upload = await fetch(`${stack.url}/storage/v1/object/maps/${image}`, {
      method: 'POST',
      headers: { apikey: stack.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
      body: PNG,
    });
    expect(upload.status, await upload.clone().text()).toBe(200);
    const map = (name: string, extra: object = {}) =>
      insert(token, 'maps', {
        campaign_id: campaignId,
        name,
        image_path: image,
        width: 2000,
        height: 1400,
        visible_to_players: true,
        ...extra,
      });
    world = (await map('E2E World')).id as string;
    wood = (
      await insert(token, 'regions', {
        map_id: world,
        name: 'Mourning Wood',
        cx: 500,
        cy: 500,
        radius: 200,
        terrain: 'temperate_forest',
        visible_to_players: true,
      })
    ).id as string;
    regionMap = (await map('E2E Wood', { parent_region_id: wood })).id as string;
    const hiddenPin = await insert(token, 'pins', {
      map_id: regionMap,
      title: 'The way to town',
      x: 100,
      y: 100,
      visible_to_players: false,
    });
    town = (await map('E2E Town', { parent_pin_id: hiddenPin.id })).id as string;

    for (const p of players) {
      const names = (await rows(await p.token(), `maps?campaign_id=eq.${campaignId}&select=name`)).map(m => m.name);
      expect(names.sort()).toEqual(['E2E Wood', 'E2E World']);
    }
    await a.page.goto(`/campaigns/${campaignId}/maps`);
    await expect(a.page.getByText('E2E World').first()).toBeVisible();
    await expect(a.page.getByText('E2E Town')).toHaveCount(0);
  });

  await test.step('2. The DM fills the Mourning Wood: a pack, a witch, a shrine, a secret and a spawn pin', async () => {
    const token = await dm.token();
    const entry = async (key: string, row: object) => {
      content[key] = (await insert(token, 'region_content', { region_id: wood, ...row })).id as string;
    };
    await entry('pack', {
      kind: 'creature',
      name: 'Thornwolf pack',
      state: 'hidden',
      sort_order: 1,
      spawn_rule: { mode: 'chance', chance: 35, timeOfDay: 'night', count: { min: 1, max: 3 } },
    });
    await entry('orsa', { kind: 'folk', name: 'Orsa the hedge witch', state: 'noticed', sort_order: 2 });
    await entry('shrine', {
      kind: 'interactable',
      name: 'Mossy shrine',
      state: 'hinted',
      hint_text: 'Something glints',
      discovery_dc: 14,
      sort_order: 3,
    });
    await entry('vault', { kind: 'find', name: 'SECRET-VAULT', state: 'hidden', sort_order: 4 });
    await insert(token, 'region_content_secrets', { content_id: content.vault, dm_notes: 'DM-ONLY-NOTE' });
    await insert(token, 'spawn_pins', { map_id: world, x: 520, y: 480, kind: 'creature', content_id: content.pack });
  });

  await test.step('3. The DM clones the Wolf into a Thornwolf, sees the comparison, and links it to the pack', async () => {
    const page = dm.page;
    await page.goto(`/campaigns/${campaignId}/library`);
    await page.getByRole('tab', { name: 'Monsters' }).click();
    await page.getByLabel('Search monsters', { exact: true }).fill('Wolf');
    await page.getByRole('region', { name: 'monsters list' }).getByRole('button', { name: /^Wolf/ }).click();
    await page.getByRole('button', { name: 'Clone and modify' }).click();

    const form = page.getByRole('form', { name: 'Clone Wolf' });
    await form.getByLabel('Name', { exact: true }).fill('Thornwolf');
    await form.getByLabel('Hit points', { exact: true }).fill('22');
    await form.getByRole('button', { name: 'Add trait' }).click();
    await form.getByLabel('Traits 2: Name', { exact: true }).fill('Thorn Hide');
    await form.getByLabel('Traits 2: Text', { exact: true }).fill('A creature that hits it takes 2 piercing damage.');

    const compare = page.getByRole('region', { name: 'Compare with the baseline' });
    await expect(compare.locator('tr[data-changed]')).toHaveCount(2);
    await expect(compare.locator('tr[data-changed]').first()).toContainText('22');
    await expect(page.getByRole('region', { name: 'Balance guide' })).toContainText('rule of thumb');
    await form.getByRole('button', { name: 'Save monster' }).click();
    await expect(page.getByRole('article', { name: 'Thornwolf stat block' })).toBeVisible();

    const token = await dm.token();
    const [custom] = await rows(
      token,
      `custom_content?campaign_id=eq.${campaignId}&name=eq.Thornwolf&select=id,parent_ref`,
    );
    expect(custom.parent_ref).toBe('wolf');
    const linked = await rest(token, `region_content?id=eq.${content.pack}`, {
      method: 'PATCH',
      body: JSON.stringify({ monster_ref: `custom:${custom.id}` }),
    });
    expect(linked.status).toBe(200);
  });

  await test.step('4. Two party groups, one player in each; group 1 moves into the region', async () => {
    const token = await dm.token();
    const made = async (name: string) => {
      const r = await rpc(token, 'create_group', { p_campaign: campaignId, p_name: name });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      return r.body as string;
    };
    group1 = await made('The Vanguard');
    group2 = await made('The Rearguard');
    for (const [character, group] of [
      [aldric, group1],
      [sera, group2],
    ]) {
      const r = await rpc(token, 'assign_character', { p_character: character, p_group: group });
      expect(r.status, JSON.stringify(r.body)).toBe(204);
    }
    const moved = await rollFunction(token, {
      action: 'move-group',
      campaignId,
      groupId: group1,
      mapId: world,
      regionId: wood,
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body.revealed).toEqual(['Orsa the hedge witch']);
  });

  await test.step('5. Player A sees Orsa and the hint, and nothing hidden; player B sees nothing of the region', async () => {
    await a.page.goto(`/campaigns/${campaignId}/characters/${aldric}`);
    const here = await openHere(a.page);
    await expect(here.getByText('Orsa the hedge witch')).toBeVisible();
    await expect(here.getByText('Something glints')).toBeVisible();
    await expect(here.getByText('Mossy shrine')).toHaveCount(0);
    for (const secret of SECRETS) await expect(a.page.getByText(secret)).toHaveCount(0);

    await b.page.goto(`/campaigns/${campaignId}/characters/${sera}`);
    const there = await openHere(b.page);
    await expect(there.getByText('Orsa the hedge witch')).toHaveCount(0);
    await expect(there.getByText('Something glints')).toHaveCount(0);
  });

  await test.step('6. Player A searches: the server rolls, and the shrine is noticed by group 1 only', async () => {
    // The roll stays the server's; a towering Wisdom means even a natural 1 beats DC 14, so the outcome is certain
    // without any test switch in the game itself.
    const dmToken = await dm.token();
    const effect = await rpc(dmToken, 'apply_effect', {
      p_character: aldric,
      p_name: 'Trance of the Seer',
      p_source: 'E2E',
      p_stat: 'wis',
      p_mode: 'set',
      p_value: 40,
      p_duration: { kind: 'permanent' },
    });
    expect(effect.status, JSON.stringify(effect.body)).toBe(200);

    const token = await a.token();
    // a forged bonus in the request changes nothing
    const search = await rollFunction(token, { action: 'search', campaignId, characterId: aldric, bonus: -99 });
    expect(search.status, JSON.stringify(search.body)).toBe(200);
    const { roll, found } = search.body;
    expect(found.map((f: { name: string }) => f.name)).toEqual(['Mossy shrine']);
    const [logged] = await rows(token, `rolls?id=eq.${roll.id}&select=kept,bonus,total`);
    expect(logged.kept).toBe(roll.kept);
    expect(logged.total).toBe((logged.kept as number) + (logged.bonus as number));
    expect(logged.total as number).toBeGreaterThanOrEqual(14);

    const discovered = await rows(dmToken, `content_discoveries?content_id=eq.${content.shrine}&select=group_id,state`);
    expect(discovered).toEqual([{ group_id: group1, state: 'noticed' }]);

    await a.page.reload();
    const here = await openHere(a.page);
    await expect(here.getByText('Mossy shrine')).toBeVisible();
    await b.page.reload();
    const there = await openHere(b.page);
    await expect(there.getByText('Mossy shrine')).toHaveCount(0);
  });

  await test.step('7. Calendar, date and weather: two climates differ, and the next day is what was forecast', async () => {
    const page = dm.page;
    await page.goto(`/campaigns/${campaignId}/calendar`);
    await page.getByText('Calendar settings').click();
    const settings = page.getByRole('form', { name: 'Calendar settings' });
    await settings.getByLabel('Month 1: name', { exact: true }).fill('Hammer');
    await settings.getByLabel('Month 2: name', { exact: true }).fill('Alturiak');
    await settings.getByLabel('Year label', { exact: true }).fill('DR');
    await settings.getByLabel('Year of day 1', { exact: true }).fill('1492');
    await settings.getByRole('button', { name: 'Save calendar' }).click();
    await expect(settings.getByText('Calendar saved.')).toBeVisible();

    // winter: arctic is only ever freezing or cold there, and tropical never is, so the two cannot match by chance
    const setDate = page.getByRole('form', { name: 'Set the date' });
    await setDate.getByLabel('Month', { exact: true }).selectOption({ label: 'Month 12' });
    await setDate.getByLabel('Day', { exact: true }).fill('14');
    await setDate.getByLabel('Year', { exact: true }).fill('1492');
    await setDate.getByLabel('Hour', { exact: true }).fill('18');
    await setDate.getByRole('button', { name: 'Set the date' }).click();
    await expect(setDate.getByText('The date is now 14 Month 12 1492 DR.')).toBeVisible();
    await expect(page.getByRole('heading', { name: '14 Month 12 1492 DR, 18:00' })).toBeVisible();
    await expect(page.getByText('In the world it is 14 Month 12 1492 DR, 18:00')).toBeVisible();

    const token = await dm.token();
    const zone = (name: string, map: string, x: number, climate: string) =>
      insert(token, 'weather_zones', {
        campaign_id: campaignId,
        map_id: map,
        name,
        center_x: x,
        center_y: 500,
        radius: 300,
        climate,
      });
    await zone('Frostmark', world, 500, 'arctic');
    await zone('Sunbelt', world, 1500, 'tropical');
    await zone('SECRET-ZONE', town, 100, 'boreal');

    const openWeather = async () => {
      await page.goto(`/campaigns/${campaignId}/maps/${world}`);
      await page.getByRole('button', { name: 'Weather', exact: true }).click();
      return (name: string) => page.getByRole('region', { name, exact: true });
    };
    let section = await openWeather();
    const today = (name: string) =>
      section(name)
        .getByText(/^Today: /)
        .innerText();
    const frost = await today('Frostmark');
    expect(frost).not.toEqual(await today('Sunbelt'));
    expect(frost).toMatch(/freezing|cold/);
    const forecast = await section('Frostmark')
      .locator('li', { hasText: '15 Month 12 1492 DR' })
      .locator('span')
      .nth(1)
      .innerText();

    await page.goto(`/campaigns/${campaignId}/calendar`);
    const clock = page.getByRole('region', { name: 'Game clock' });
    await page.goto(`/campaigns/${campaignId}`);
    await clock.getByRole('button', { name: '+1 day' }).click();
    await expect(clock.getByText('15 Month 12 1492 DR, 18:00')).toBeVisible();

    section = await openWeather();
    expect(await today('Frostmark')).toBe(`Today: ${forecast}`);

    // the player's card, where their group is
    await a.page.goto(`/campaigns/${campaignId}`);
    const card = a.page.getByRole('region', { name: "Today's weather" });
    await expect(card).toContainText('15 Month 12 1492 DR');
    await expect(card).toContainText(/Freezing|Cold/);
  });

  await test.step('8. Security, by direct API calls with each player’s own token', async () => {
    const dmToken = await dm.token();
    // something for group 2 alone, for group 1's player not to see
    const revealed = await rpc(dmToken, 'reveal_content', {
      p_content: content.orsa,
      p_group: group2,
      p_state: 'noticed',
    });
    expect(revealed.status, JSON.stringify(revealed.body)).toBe(204);

    for (const [p, own, other] of [
      [a, group1, group2],
      [b, group2, group1],
    ] as const) {
      const token = await p.token();
      const empty = async (path: string) => expect(await rows(token, path), path).toEqual([]);
      await empty(`region_content?region_id=eq.${wood}&select=id`);
      await empty(`region_content_secrets?select=content_id`);
      await empty(`spawn_pins?map_id=eq.${world}&select=id`);
      await empty(`custom_content?campaign_id=eq.${campaignId}&select=id`);
      await empty(`weather_zones?map_id=eq.${town}&select=id`);
      await empty(`content_discoveries?group_id=eq.${other}&select=content_id`);
      expect(Array.isArray(await rows(token, `content_discoveries?group_id=eq.${own}&select=content_id`))).toBe(true);

      for (const [table, row] of [
        ['custom_content', { campaign_id: campaignId, kind: 'item', name: 'Mine', definition: {} }],
        [
          'weather_zones',
          {
            campaign_id: campaignId,
            map_id: world,
            name: 'Mine',
            center_x: 1,
            center_y: 1,
            radius: 5,
            climate: 'arid',
          },
        ],
        ['world_events', { campaign_id: campaignId, day: 1, title: 'Mine', visible_to_players: true }],
        ['region_content', { region_id: wood, kind: 'find', name: 'Mine' }],
      ] as const) {
        const denied = await rest(token, table, { method: 'POST', body: JSON.stringify(row) });
        expect(denied.status, `${table}: ${JSON.stringify(denied.body)}`).toBeGreaterThanOrEqual(401);
      }
      const clockMove = await rpc(token, 'set_game_date', { p_campaign: campaignId, p_day: 1, p_confirm_rewind: true });
      expect(clockMove.status).toBeGreaterThanOrEqual(401);
    }

    const here = await rpc(await a.token(), 'get_here', { p_character: aldric });
    expect(here.status).toBe(200);
    const text = JSON.stringify(here.body);
    expect(text).toContain('Orsa the hedge witch');
    for (const secret of SECRETS) expect(text).not.toContain(secret);
    expect(text).not.toContain('discovery_dc');

    const nosy = await rpc(await a.token(), 'get_here', { p_character: sera });
    expect(nosy.status, JSON.stringify(nosy.body)).toBeGreaterThanOrEqual(401);
  });

  await test.step('9. A random encounter at midday never turns up the night-only pack; at midnight it can', async () => {
    const token = await dm.token();
    const setClock = async (seconds: number, reason: string) => {
      const r = await rpc(token, 'set_game_date', {
        p_campaign: campaignId,
        p_day: 400,
        p_seconds_into_day: seconds,
        p_reason: reason,
        p_confirm_rewind: true,
      });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    };
    const packFound = async () => {
      for (let i = 0; i < 40; i++) {
        const r = await rpc(token, 'roll_random_encounter', { p_region: wood });
        expect(r.status, JSON.stringify(r.body)).toBe(200);
        if (r.body.results.some((x: { name: string }) => x.name === 'Thornwolf pack')) return true;
      }
      return false;
    };
    await setClock(12 * 3600, 'Midday');
    expect(await packFound()).toBe(false);
    // without this the check above would pass even if the pack could never turn up
    await setClock(0, 'Midnight');
    expect(await packFound()).toBe(true);
  });
});
