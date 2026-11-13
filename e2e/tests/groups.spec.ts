// P4-2: group tokens and the table, end to end: a DM at the table moves one group into a sub-map, the badge on the parent
// map counts it, and a player in another group sees neither its token nor its count, until the DM shares positions.
import { expect, test } from '@playwright/test';
import { createCampaignWithPlayers, createCharacter, insert, person, rest, rows, rpc, stack } from './helpers';

// 1 x 1 transparent PNG: a map only needs an image to open
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

test('Phase 4: group tokens, the table and the "N inside" badge', async ({ browser }) => {
  const dm = await person(browser, 'dm-gt');
  const a = await person(browser, 'player-a-gt');
  const b = await person(browser, 'player-b-gt');
  let campaignId = '';
  let aldric = '';
  let sera = '';
  let top = '';
  let vault = '';
  let gate = '';
  let group1 = '';
  let group2 = '';

  await test.step('0. A campaign with a Fighter for each player', async () => {
    campaignId = await createCampaignWithPlayers(dm, [a, b]);
    aldric = await createCharacter(a, campaignId, { name: 'Aldric', ...FIGHTER });
    sera = await createCharacter(b, campaignId, { name: 'Sera', ...FIGHTER });
  });

  await test.step('1. A map with a gate, and a vault map beneath the gate', async () => {
    const token = await dm.token();
    const image = `${campaignId}/groups.png`;
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
    top = (await map('E2E Fortress')).id as string;
    const pin = await insert(token, 'pins', {
      map_id: top,
      title: 'The Gate',
      x: 600,
      y: 600,
      visible_to_players: true,
    });
    gate = pin.id as string;
    vault = (await map('E2E Vault', { parent_pin_id: gate })).id as string;
  });

  await test.step('2. Two groups, one character in each', async () => {
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
  });

  await test.step('3. At the table the DM brings the Rearguard to the fortress and the Vanguard into the vault', async () => {
    const page = dm.page;
    await page.goto(`/campaigns/${campaignId}/maps/${top}`);
    await page.getByRole('button', { name: 'Table' }).click();
    const tracker = page.getByRole('complementary', { name: 'Party groups' });
    await expect(tracker).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Map tools' })).toHaveCount(0);
    await tracker.getByRole('button', { name: 'Bring The Rearguard here' }).click();
    await expect(tracker.getByRole('button', { name: 'The Rearguard is on this map' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTitle(/^Group The Rearguard, 1 member/)).toBeVisible();

    // the vault map: the mode is remembered, so it opens at the table
    await page.goto(`/campaigns/${campaignId}/maps/${vault}`);
    const vaultTracker = page.getByRole('complementary', { name: 'Party groups' });
    await expect(vaultTracker).toBeVisible();
    await vaultTracker.getByRole('button', { name: 'Bring The Vanguard here' }).click();
    await expect(vaultTracker.getByRole('button', { name: 'The Vanguard is on this map' })).toBeVisible({
      timeout: 30_000,
    });

    // back on the fortress map, the gate says who is beneath it
    await page.goto(`/campaigns/${campaignId}/maps/${top}`);
    await expect(page.getByText('1 inside')).toBeVisible();
    await expect(page.getByTitle(/^Group The Vanguard/)).toHaveCount(0);
  });

  await test.step('4. The groups are saved with a place, and the Vanguard is in the vault', async () => {
    const dmToken = await dm.token();
    const saved = await rows(
      dmToken,
      `party_groups?campaign_id=eq.${campaignId}&select=id,map_id,x,y&order=created_at`,
    );
    expect(saved.map(g => g.map_id)).toEqual([vault, top]);
    expect(saved.every(g => typeof g.x === 'number' && typeof g.y === 'number')).toBe(true);
  });

  await test.step("5. A player in another group sees neither the Vanguard's token nor its count", async () => {
    await b.page.goto(`/campaigns/${campaignId}/maps/${top}`);
    await expect(b.page.getByTitle(/^Group The Rearguard, 1 member/)).toBeVisible();
    await expect(b.page.getByTitle(/^Group The Vanguard/)).toHaveCount(0);
    await expect(b.page.getByText(/inside/)).toHaveCount(0);
    await expect(b.page.getByRole('button', { name: 'Table' })).toHaveCount(0);
    await expect(b.page.getByRole('complementary', { name: 'Party groups' })).toHaveCount(0);
    // and not from the API either: one group, and no count beneath the gate
    const token = await b.token();
    const groups = await rows(token, `party_groups?campaign_id=eq.${campaignId}&select=id,name`);
    expect(groups).toEqual([{ id: group2, name: 'The Rearguard' }]);
    const counts = await rpc(token, 'group_entrance_counts', { p_map: top });
    expect(counts.body).toEqual([]);
    const hp = await rest(token, `characters?id=eq.${aldric}&select=id`);
    expect(hp.body).toEqual([]);
  });

  await test.step("6. The Vanguard's own player sees the count beneath the gate", async () => {
    await a.page.goto(`/campaigns/${campaignId}/maps/${top}`);
    await expect(a.page.getByText('1 inside')).toBeVisible();
    await expect(a.page.getByTitle(/^Group The Rearguard/)).toHaveCount(0);
  });

  await test.step('7. The DM shares positions: the other player sees it at once, then loses it again', async () => {
    const tracker = dm.page.getByRole('complementary', { name: 'Party groups' });
    await dm.page.goto(`/campaigns/${campaignId}/maps/${top}`);
    await expect(tracker).toBeVisible();
    const share = tracker.getByRole('switch', { name: /Players see where other groups are/ });
    // the switch's box is drawn over its checkbox, so the label is what gets pressed
    await tracker.getByText('Players see where other groups are').click();
    await expect(share).toBeChecked();
    // the player's page is open on the map: no reload
    await expect(b.page.getByText('1 inside')).toBeVisible({ timeout: 10_000 });
    const counts = await rpc(await b.token(), 'group_entrance_counts', { p_map: top });
    expect(counts.body).toEqual([{ kind: 'pin', entrance_id: gate, members: 1 }]);

    await tracker.getByText('Players see where other groups are').click();
    await expect(share).not.toBeChecked();
    await expect(b.page.getByText(/inside/)).toHaveCount(0, { timeout: 10_000 });
  });

  await test.step('8. The spotlight: the other group is told where the Vanguard is', async () => {
    const tracker = dm.page.getByRole('complementary', { name: 'Party groups' });
    await tracker.getByRole('button', { name: 'Spotlight' }).first().click();
    const form = tracker.getByRole('form', { name: /Spotlight for/ });
    await form.getByLabel('A line for the other groups').fill('Picking the vault lock');
    await form.getByRole('button', { name: 'Save line' }).click();
    // the Vanguard is the first group listed
    await expect(b.page.getByRole('status').filter({ hasText: 'The Vanguard is in E2E Vault' })).toContainText(
      'Picking the vault lock',
      { timeout: 10_000 },
    );
    // the group with the spotlight is not shown the banner
    await expect(a.page.getByRole('status').filter({ hasText: 'is in' })).toHaveCount(0);
  });
});
