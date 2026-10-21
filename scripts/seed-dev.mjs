#!/usr/bin/env node
// Development seed (P1-7): gives a player account Brannoc, the golden-fixture fighter, in the first campaign
// that player has joined. Local stack only: it refuses any URL that is not 127.0.0.1 or localhost.
//
//   pnpm db:seed:dev <player email>
//
// Sign up the player in the app and join a campaign first. Running it again does nothing if Brannoc is there.
// The Potion of Hill Giant Strength is not seeded: a DM switches it on from the sheet (DM mode, development
// builds only) to watch the numbers change and the greatsword unlock.
import { execSync } from 'node:child_process';
import { BRANNOC } from '../packages/rules-engine/src/fixtures.ts';

const email = process.argv[2];
if (!email) {
  console.error('Usage: pnpm db:seed:dev <player email>');
  process.exit(2);
}

const env = Object.fromEntries(
  execSync('pnpm exec supabase status -o env', { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(line => line.includes('='))
    .map(line => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')];
    }),
);
const api = env.API_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(api ?? '')) {
  console.error(`Refusing to seed ${api}: this script only runs against the local stack (pnpm db:start).`);
  process.exit(2);
}
const headers = {
  apikey: env.SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

async function get(path) {
  const r = await fetch(`${api}${path}`, { headers });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

const { users } = await get('/auth/v1/admin/users?per_page=1000');
const player = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
if (!player) throw new Error(`No account for ${email}: sign it up in the app first.`);

const [membership] = await get(`/rest/v1/members?user_id=eq.${player.id}&role=eq.player&select=campaign_id&limit=1`);
if (!membership) throw new Error(`${email} has not joined a campaign as a player yet.`);
const campaignId = membership.campaign_id;

const existing = await get(
  `/rest/v1/characters?owner_id=eq.${player.id}&campaign_id=eq.${campaignId}&name=eq.Brannoc&select=id`,
);
let id = existing[0]?.id;
if (!id) {
  const { name, xp, ...sheet } = BRANNOC;
  const r = await fetch(`${api}/rest/v1/characters`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ campaign_id: campaignId, owner_id: player.id, name, xp, sheet }),
  });
  if (!r.ok) throw new Error(`insert: ${r.status} ${await r.text()}`);
  id = (await r.json())[0].id;
  console.log(`Brannoc created for ${email}.`);
} else {
  console.log(`Brannoc already exists for ${email}.`);
}
console.log(`Open http://localhost:5173/campaigns/${campaignId}/characters/${id}`);
