// P4-6: the NPC dialogue tool, end to end. The DM says a prepared line to group 1 and only group 1's player sees it;
// the DM offers Persuasion DC 13 with the odds shown, the player sees 40% for a +0 bonus and the roll is stored once;
// with the odds hidden the percentage goes but the bonus stays.
import { expect, test } from '@playwright/test';
import { createCampaignWithPlayers, createCharacter, insert, person, rows, rpc, stack } from './helpers';

// Charisma 10 and no Persuasion: +0, so DC 13 needs a 13 or higher on the d20 (8 in 20: 40%)
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

const rollFunction = (token: string, body: object) =>
  fetch(`${stack.url}/functions/v1/roll`, {
    method: 'POST',
    headers: { apikey: stack.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));

test('Phase 4: the NPC dialogue tool', async ({ browser }) => {
  const dm = await person(browser, 'dm-dlg');
  const a = await person(browser, 'player-a-dlg');
  const b = await person(browser, 'player-b-dlg');
  let campaignId = '';
  let aldric = '';
  let orsa = '';

  await test.step('0. A campaign; a Fighter in each of two groups; Orsa the NPC with a prepared line', async () => {
    campaignId = await createCampaignWithPlayers(dm, [a, b]);
    aldric = await createCharacter(a, campaignId, { name: 'Aldric', ...FIGHTER });
    const sera = await createCharacter(b, campaignId, { name: 'Sera', ...FIGHTER });
    const token = await dm.token();
    for (const [name, character] of [
      ['The Vanguard', aldric],
      ['The Rearguard', sera],
    ] as const) {
      const made = await rpc(token, 'create_group', { p_campaign: campaignId, p_name: name });
      expect(made.status, JSON.stringify(made.body)).toBe(200);
      const assigned = await rpc(token, 'assign_character', { p_character: character, p_group: made.body });
      expect(assigned.status, JSON.stringify(assigned.body)).toBe(204);
    }
    orsa = (
      await insert(token, 'entities', { campaign_id: campaignId, type: 'npc', name: 'Orsa', visible_to_players: true })
    ).id as string;
    await insert(token, 'dialogue_lines', {
      npc_entity_id: orsa,
      campaign_id: campaignId,
      text: 'Mind the roots, travellers. The wood remembers who walks it.',
      tag: 'greeting',
    });
  });

  await test.step('1. The DM says the prepared line to group 1; only group 1’s player sees it', async () => {
    for (const p of [a, b]) {
      await p.page.goto(`/campaigns/${campaignId}`);
      await expect(p.page.getByText('Connected')).toBeVisible({ timeout: 15_000 });
    }
    const page = dm.page;
    await page.goto(`/campaigns/${campaignId}/dialogue/${orsa}`);
    await expect(page.getByRole('checkbox', { name: 'The Vanguard' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'The Rearguard' })).not.toBeChecked();
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 15_000 });
    const said = Date.now();
    await page.getByRole('button', { name: /^Say: Mind the roots/ }).click();
    const scroll = a.page.getByRole('region', { name: 'Orsa speaks' });
    await expect(scroll.getByText(/Mind the roots, travellers/)).toBeVisible({ timeout: 5_000 });
    const took = Date.now() - said;
    expect(took, `the line took ${took} ms to reach the player`).toBeLessThan(1000);
    await expect(page.getByRole('button', { name: /^Say: Mind the roots/ })).toHaveText('Said');

    // the other group saw nothing, and cannot read it from the log
    await b.page.waitForTimeout(1500);
    await expect(b.page.getByRole('region', { name: 'Orsa speaks' })).toHaveCount(0);
    expect(await rows(await b.token(), `dialogue_log?campaign_id=eq.${campaignId}&select=id`)).toEqual([]);
    expect((await rows(await a.token(), `dialogue_log?campaign_id=eq.${campaignId}&select=text`)).length).toBe(1);
    // nor the prepared lines
    expect(await rows(await a.token(), `dialogue_lines?npc_entity_id=eq.${orsa}&select=id`)).toEqual([]);
  });

  await test.step('2. Persuasion DC 13, odds shown: the player sees 40% for +0, and the roll is stored once', async () => {
    const form = dm.page.getByRole('form', { name: 'Offer a check' });
    await form.getByLabel('What is it for?').fill('Haggle over the price');
    await form.getByRole('button', { name: 'Offer to players' }).click();
    await expect(form.getByRole('status')).toHaveText('Offered to Aldric.');

    const card = a.page.getByRole('region', { name: 'Checks for you' });
    await expect(card.getByText(/Haggle over the price/)).toBeVisible({ timeout: 5_000 });
    await expect(card.getByText(/Persuasion DC 13/)).toBeVisible();
    await card.getByRole('button', { name: 'Roll Persuasion for Aldric' }).click();
    const popup = a.page.getByRole('dialog');
    await expect(popup.getByText('40%')).toBeVisible({ timeout: 15_000 });
    await expect(popup.getByText(/your bonus \+0/)).toBeVisible();
    await popup.getByRole('button', { name: 'Roll', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Roll again' })).toBeVisible();
    await a.page.keyboard.press('Escape');

    const [request] = await rows(
      await dm.token(),
      `check_requests?campaign_id=eq.${campaignId}&select=id,check_answers(roll_id,rolls(target,label))`,
    );
    const answers = request.check_answers as { rolls: { target: number; label: string } }[];
    expect(answers).toHaveLength(1);
    expect(answers[0].rolls).toEqual({ target: 13, label: 'Persuasion check' });
    // and a second answer is refused
    const again = await rollFunction(await a.token(), {
      action: 'roll',
      campaignId,
      characterId: aldric,
      requestId: request.id,
    });
    expect(again.status).toBe(409);
    // the DM sees the result
    await expect(dm.page.getByRole('list', { name: 'Answers to Haggle over the price' })).toContainText(/Aldric: \d+/);
  });

  await test.step('3. With the odds hidden the percentage is gone, but not the bonus', async () => {
    const form = dm.page.getByRole('form', { name: 'Offer a check' });
    await form.getByRole('checkbox', { name: 'Show players the DC and their odds' }).uncheck();
    await form.getByLabel('What is it for?').fill('Talk her down');
    await form.getByRole('button', { name: 'Offer to players' }).click();
    await expect(form.getByRole('status')).toHaveText('Offered to Aldric.');

    const card = a.page.getByRole('region', { name: 'Checks for you' });
    await expect(card.getByText(/Talk her down/)).toBeVisible({ timeout: 5_000 });
    await expect(card.getByText(/DC/)).toHaveCount(0);
    await card.getByRole('button', { name: 'Roll Persuasion for Aldric' }).click();
    const popup = a.page.getByRole('dialog');
    await expect(popup.getByText(/your bonus \+0/)).toBeVisible({ timeout: 15_000 });
    await expect(popup.getByText(/%/)).toHaveCount(0);

    // and the API gives the player neither the DC nor the chance
    const tokenA = await a.token();
    const mine = await rpc(tokenA, 'my_check_requests', { p_campaign: campaignId });
    const hidden = (mine.body as { prompt: string; dc: number | null; id: string }[]).find(
      r => r.prompt === 'Talk her down',
    )!;
    expect(hidden.dc).toBeNull();
    const preview = await rollFunction(tokenA, {
      action: 'preview',
      campaignId,
      characterId: aldric,
      requestId: hidden.id,
    });
    expect(preview.status).toBe(200);
    expect(preview.body.chance).toBeNull();
    expect(preview.body.bonus).toBe(0);
  });
});
