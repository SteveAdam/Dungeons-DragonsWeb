// P4-5: private messages, whispers and the pause button, end to end. The DM and one player write to each other live; the
// other player sees nothing of it, on screen or through the API. An anonymous X-card shows the DM a banner with no
// name, and nothing the DM can query says who played it.
import { expect, test } from '@playwright/test';
import { createCampaignWithPlayers, person, rest, rows, rpc } from './helpers';

const userIdOf = (token: string) =>
  (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { sub: string }).sub;

test('Phase 4: private messages, whispers and the pause button', async ({ browser }) => {
  const dm = await person(browser, 'dm-msg');
  const a = await person(browser, 'player-a-msg');
  const b = await person(browser, 'player-b-msg');
  let campaignId = '';
  const nameA = () => a.email.split('@')[0];

  await test.step('0. A campaign with two players, everyone on its page', async () => {
    campaignId = await createCampaignWithPlayers(dm, [a, b]);
    for (const p of [dm, a, b]) {
      await p.page.goto(`/campaigns/${campaignId}`);
      await expect(p.page.getByText('Connected')).toBeVisible({ timeout: 15_000 });
    }
  });

  await test.step('1. A player writes to the DM; the DM is told live', async () => {
    await a.page.getByRole('button', { name: 'Messages', exact: true }).click();
    const panel = a.page.getByRole('complementary', { name: 'Message the DM' });
    await panel.getByLabel('Message to the DM').fill('Can I search the cellar?');
    await panel.getByRole('button', { name: 'Send' }).click();
    await expect(panel.getByText('Can I search the cellar?')).toBeVisible();

    await expect(dm.page.getByRole('status', { name: 'Notifications' })).toContainText(`${nameA()} sent you a message`);
    await expect(dm.page.getByRole('button', { name: 'Messages, 1 unread' })).toBeVisible();
  });

  await test.step('2. The DM answers and whispers; the player sees both live, the whisper set apart', async () => {
    const page = dm.page;
    await page.getByRole('button', { name: 'Messages, 1 unread' }).click();
    await page
      .getByRole('list', { name: 'Players' })
      .getByRole('button', { name: new RegExp(`^${nameA()}`) })
      .click();
    const panel = page.getByRole('complementary', { name: `Messages with ${nameA()}` });
    await expect(panel.getByText('Can I search the cellar?')).toBeVisible();
    // opening the thread read it
    await expect(page.getByRole('button', { name: 'Messages', exact: true })).toBeVisible();

    await panel.getByLabel(`Message to ${nameA()}`).fill('Yes, roll Investigation.');
    await panel.getByRole('button', { name: 'Send' }).click();
    await panel.getByRole('checkbox', { name: 'Send as a whisper' }).check();
    await panel.getByRole('checkbox', { name: /private notes/ }).check();
    await panel.getByLabel(`Message to ${nameA()}`).fill('You notice the harbourmaster’s ring');
    await panel.getByRole('button', { name: 'Whisper' }).click();

    const thread = a.page.getByRole('list', { name: 'Messages with the DM' });
    await expect(thread.getByText('Yes, roll Investigation.')).toBeVisible({ timeout: 5_000 });
    await expect(thread.getByText('A whisper: You notice the harbourmaster’s ring')).toBeVisible({ timeout: 5_000 });
  });

  await test.step('3. The other player saw nothing, and the API agrees', async () => {
    await expect(b.page.getByRole('status', { name: 'Notifications' })).not.toContainText('message');
    await expect(b.page.getByRole('button', { name: 'Messages', exact: true })).toBeVisible();
    const tokenB = await b.token();
    const tokenA = await a.token();
    expect(await rows(tokenB, `messages?campaign_id=eq.${campaignId}&select=id`)).toEqual([]);
    expect(await rows(tokenB, 'player_notes?select=id')).toEqual([]);
    const threads = await rpc(tokenB, 'message_threads', { p_campaign: campaignId });
    expect(threads.body).toEqual([]);
    const forged = await rest(tokenB, 'messages', {
      method: 'POST',
      body: JSON.stringify({
        campaign_id: campaignId,
        player_id: userIdOf(tokenA),
        sender_id: userIdOf(tokenA),
        body: 'x',
      }),
    });
    expect(forged.status).toBeGreaterThanOrEqual(401);
    // and the first player's thread cannot be edited, even by them
    const edit = await rest(tokenA, `messages?campaign_id=eq.${campaignId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: 'I never said that' }),
    });
    expect(edit.status).toBeLessThan(300);
    expect(
      (await rows(tokenA, `messages?campaign_id=eq.${campaignId}&select=body&order=created_at`)).map(m => m.body),
    ).toEqual(['Can I search the cellar?', 'Yes, roll Investigation.', 'You notice the harbourmaster’s ring']);
  });

  await test.step('4. The whisper is in the player’s private notes', async () => {
    await a.page.goto(`/campaigns/${campaignId}/notes`);
    const notes = a.page.getByRole('region', { name: 'Your private notes' });
    await expect(notes.getByText('You notice the harbourmaster’s ring')).toBeVisible();
  });

  await test.step('5. An anonymous X-card: the DM sees a banner with no name; everyone sees the table paused', async () => {
    await b.page.getByRole('button', { name: 'Anonymous X-card' }).click();
    await expect(b.page.getByRole('status', { name: 'Notifications' })).toContainText('X-card played');
    const banner = dm.page.getByRole('alert').filter({ hasText: 'Pause requested' });
    await expect(banner).toHaveText(/Pause requested: an anonymous X-card/, { timeout: 5_000 });
    await expect(banner).not.toContainText(b.email.split('@')[0]);
    await expect(a.page.getByRole('alert').filter({ hasText: 'The table is paused' })).toBeVisible({ timeout: 5_000 });

    // nothing the DM can query says who it was
    const tokenDm = await dm.token();
    const events = await rows(tokenDm, `safety_events?campaign_id=eq.${campaignId}&select=user_id,anonymous`);
    expect(events).toEqual([{ user_id: null, anonymous: true }]);
    const rate = await rest(tokenDm, `safety_rate?campaign_id=eq.${campaignId}&select=user_id`);
    expect(rate.status).toBeGreaterThanOrEqual(401);
    const state = await rpc(tokenDm, 'get_table_pause', { p_campaign: campaignId });
    expect((state.body as { name: unknown }).name).toBeNull();

    // asking again at once is refused (one request per five minutes)
    const again = await rpc(await b.token(), 'request_pause', { p_campaign: campaignId, p_anonymous: true });
    expect(again.status).toBe(429);
  });

  await test.step('6. The DM resumes, and the banner goes for everyone', async () => {
    await dm.page.getByRole('button', { name: 'Resume' }).click();
    await expect(dm.page.getByRole('alert').filter({ hasText: 'Pause requested' })).toHaveCount(0);
    await expect(a.page.getByRole('alert').filter({ hasText: 'The table is paused' })).toHaveCount(0, {
      timeout: 5_000,
    });
    await expect(b.page.getByRole('alert').filter({ hasText: 'The table is paused' })).toHaveCount(0, {
      timeout: 5_000,
    });
  });
});
