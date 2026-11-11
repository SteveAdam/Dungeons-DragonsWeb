// P4-1: the realtime foundation against the real server: who can join what, presence timing, event delivery, and the
// shell keeping one socket across navigation. It uses the development test bench at /campaigns/:id/dev/realtime.
import { expect, test, type Page } from '@playwright/test';
import { createCampaignWithPlayers, person } from './helpers';

const bench = (id: string) => `/campaigns/${id}/dev/realtime`;

async function probe(page: Page, label: string) {
  await page.getByRole('button', { name: `Try ${label}`, exact: true }).click();
  const answer = page.getByTestId(`probe-${label}`);
  await expect(answer).toHaveText(/allowed|refused/, { timeout: 15_000 });
  return answer.textContent();
}

test('Realtime: channel rules, presence, delivery and one socket across navigation', async ({ browser }) => {
  const dm = await person(browser, 'dm-rt');
  const player = await person(browser, 'player-rt');
  const outsider = await person(browser, 'outsider-rt');
  const campaignId = await createCampaignWithPlayers(dm, [player]);
  const avatars = (p: Page) =>
    p.getByRole('banner').getByRole('img', { name: /, (Active|Away|In scene)$/, includeHidden: true });

  await test.step('Both see each other within a second of the second one arriving', async () => {
    await player.page.goto('/campaigns'); // joining left them on the campaign, so they start away from it
    await dm.page.goto(bench(campaignId));
    await expect(dm.page.getByText('Connected')).toBeVisible();
    await expect(avatars(dm.page)).toHaveCount(1);
    await player.page.goto(bench(campaignId));
    await expect(player.page.getByText('Connected')).toBeVisible();
    await expect(avatars(dm.page)).toHaveCount(2, { timeout: 1000 });
    await expect(avatars(player.page)).toHaveCount(2, { timeout: 1000 });
  });

  await test.step('A table event reaches the player; a DM-only event never does', async () => {
    await dm.page.getByRole('button', { name: 'Send to the table' }).click();
    const playerHeard = player.page.getByRole('list', { name: 'Heard' });
    await expect(playerHeard).toContainText('Hello, table (from dm)');
    await dm.page.waitForTimeout(1100); // toasts are limited to one a second
    await dm.page.getByRole('button', { name: 'Send to DMs only' }).click();
    await expect(dm.page.getByRole('list', { name: 'Heard' })).toContainText('For DM eyes only');
    await player.page.waitForTimeout(1500);
    await expect(playerHeard).not.toContainText('For DM eyes only');
  });

  await test.step('The server enforces who can join what', async () => {
    expect(await probe(dm.page, 'campaign')).toBe('allowed');
    expect(await probe(dm.page, 'dm')).toBe('allowed');
    expect(await probe(dm.page, 'other user')).toBe('allowed');
    expect(await probe(player.page, 'campaign')).toBe('allowed');
    expect(await probe(player.page, 'own user')).toBe('allowed');
    expect(await probe(player.page, 'dm')).toBe('refused');
    expect(await probe(player.page, 'other user')).toBe('refused');
  });

  await test.step('A player cannot use the DM-only send', async () => {
    await player.page.getByRole('button', { name: 'Send to the table' }).click();
    await expect(player.page.getByText('Not sent: failed')).toBeVisible();
  });

  await test.step('Moving between screens keeps the header and the socket', async () => {
    const sockets: string[] = [];
    dm.page.on('websocket', ws => {
      if (ws.url().includes('/realtime/')) sockets.push(ws.url());
    });
    await dm.page.getByRole('banner').evaluate(el => {
      (el as HTMLElement).dataset.marker = 'same-element';
    });
    await dm.page.evaluate(path => {
      history.pushState({}, '', path);
      dispatchEvent(new PopStateEvent('popstate'));
    }, `/campaigns/${campaignId}/entities`);
    await expect(dm.page).toHaveURL(new RegExp(`/campaigns/${campaignId}/entities`));
    await dm.page.waitForTimeout(1000);
    await expect(dm.page.getByRole('banner')).toHaveAttribute('data-marker', 'same-element');
    await expect(dm.page.getByText('Connected')).toBeVisible();
    expect(sockets).toEqual([]);
  });

  await test.step('A closed tab leaves the list within five seconds', async () => {
    await player.page.close();
    await expect(avatars(dm.page)).toHaveCount(1, { timeout: 5000 });
  });

  await test.step('Someone outside the campaign is not let in', async () => {
    await outsider.page.goto('/login');
    await outsider.page.getByRole('button', { name: /Create an account/ }).click();
    await outsider.page.getByLabel('Email', { exact: true }).fill(outsider.email);
    await outsider.page.getByLabel('Password', { exact: true }).fill(`e2e-outsider-${Date.now()}`);
    await outsider.page.getByRole('button', { name: 'Create account' }).click();
    await outsider.page.waitForURL('**/campaigns');
    await outsider.page.goto(bench(campaignId));
    expect(await probe(outsider.page, 'campaign')).toBe('refused');
    expect(await probe(outsider.page, 'dm')).toBe('refused');
  });
});
