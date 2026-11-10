// What the end-to-end scenarios share: fresh accounts for each run (local stack only), direct API calls with a person's
// own token, and the character creation wizard.
import { expect, type Browser, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { localStack } from '../stack';

export const stack = localStack();
export const run = Date.now().toString(36);
// a throwaway password for this run's local test accounts
const PASSWORD = `e2e-${randomBytes(9).toString('base64url')}`;

export interface Person {
  page: Page;
  email: string;
  token: () => Promise<string>;
}

export async function person(browser: Browser, who: string): Promise<Person> {
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

export async function signUp(p: Person) {
  await p.page.goto('/login');
  await p.page.getByRole('button', { name: /Create an account/ }).click();
  await p.page.getByLabel('Email', { exact: true }).fill(p.email);
  await p.page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await p.page.getByRole('button', { name: 'Create account' }).click();
  await p.page.waitForURL('**/campaigns');
}

/** A REST call to the local stack as a signed-in person. */
export async function rest(token: string, path: string, init: RequestInit = {}) {
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

export const rpc = (token: string, fn: string, args: object) =>
  rest(token, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

export const rows = async (token: string, path: string) => {
  const r = await rest(token, path);
  expect(r.status, `${path}: ${JSON.stringify(r.body)}`).toBe(200);
  return r.body as Record<string, unknown>[];
};

/** Inserts one row and returns it, failing with the database's own words if it is refused. */
export async function insert(token: string, table: string, row: object) {
  const r = await rest(token, table, { method: 'POST', body: JSON.stringify(row) });
  expect(r.status, `${table}: ${JSON.stringify(r.body)}`).toBe(201);
  return (r.body as Record<string, unknown>[])[0];
}

/** Calls the roll Edge Function as a signed-in person. A local worker being restarted (5xx) is tried again. */
export async function rollFunction(token: string, body: object) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${stack.url}/functions/v1/roll`, {
      method: 'POST',
      headers: { apikey: stack.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.status < 500 || attempt === 12) return { status: r.status, body: await r.json().catch(() => null) };
    await r.text();
    await new Promise(resolve => setTimeout(resolve, 6000));
  }
}

/** The DM's campaign, with both players joined by its invite code. Returns the campaign's id. */
export async function createCampaignWithPlayers(dm: Person, players: Person[]) {
  await signUp(dm);
  await dm.page.getByLabel('Campaign name', { exact: true }).fill(`E2E ${run}`);
  await dm.page.getByRole('button', { name: 'Create campaign' }).click();
  await dm.page.waitForURL(/\/campaigns\/[0-9a-f-]{36}/);
  const campaignId = dm.page.url().split('/')[4];
  const [secret] = await rows(await dm.token(), `campaign_secrets?campaign_id=eq.${campaignId}&select=invite_code`);
  for (const p of players) {
    await signUp(p);
    await p.page.getByLabel('Invite code', { exact: true }).fill(secret.invite_code as string);
    await p.page.getByRole('button', { name: 'Join campaign' }).click();
    await p.page.waitForURL(`**/campaigns/${campaignId}**`);
  }
  return campaignId;
}

/** Through the creation wizard (P2-9), from step 1 to the created sheet. Returns the character's id. */
export async function createCharacter(
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
  // A local worker can be restarted mid-request, or be slow to start. Only an error on the screen means press it again,
  // as a player would: a slow answer is left to finish.
  const created = /\/characters\/[0-9a-f-]{36}$/;
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.getByRole('button', { name: 'Create character' }).click();
    const outcome = await Promise.race([
      page.waitForURL(created, { timeout: 90_000 }).then(
        () => 'created',
        () => 'slow',
      ),
      page
        .getByRole('alert')
        .first()
        .waitFor({ timeout: 90_000 })
        .then(
          () => 'error',
          () => 'slow',
        ),
    ]);
    if (outcome === 'created') break;
    await page.waitForTimeout(8_000);
    if (created.test(page.url())) break;
  }
  await page.waitForURL(created, { timeout: 5_000 });
  return page.url().split('/').pop() as string;
}
