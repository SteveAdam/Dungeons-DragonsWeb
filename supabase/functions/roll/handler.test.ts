// P2-2: tests for the roll function, with the database replaced by an in-memory stand-in.
//   pnpm test:functions
import assert from 'node:assert/strict';
import { BRANNOC, successChance } from '../_shared/rules-engine/index.ts';
import { handle, type CharacterRecord, type EffectRow, type RollD20Args, type RollDeps } from './handler.ts';

const CAMPAIGN = '00000000-0000-4000-8000-000000000001';
const BRANNOC_ID = '00000000-0000-4000-8000-0000000000b1';
const SERA_ID = '00000000-0000-4000-8000-0000000000b2';
const USERS = { 'token-dm': 'dm', 'token-player': 'player', 'token-sera': 'sera', 'token-outsider': 'outsider' };

const { name: _name, xp: _xp, ...brannocSheet } = BRANNOC;
// another player's character in the same campaign
const SERA: CharacterRecord = {
  id: SERA_ID,
  campaignId: CAMPAIGN,
  ownerId: 'sera',
  name: 'Sera',
  sheet: brannocSheet,
  xp: 900,
  levelApplied: 3,
  conditions: [],
  exhaustion: 0,
};

function world(
  over: {
    brannoc?: Partial<CharacterRecord>;
    effects?: EffectRow[];
    rollError?: { code: string; message: string };
  } = {},
) {
  const calls: RollD20Args[] = [];
  const characters: Record<string, CharacterRecord> = {
    [BRANNOC_ID]: {
      id: BRANNOC_ID,
      campaignId: CAMPAIGN,
      ownerId: 'player',
      name: 'Brannoc',
      sheet: brannocSheet,
      xp: 6900,
      levelApplied: 5,
      conditions: [],
      exhaustion: 0,
      ...over.brannoc,
    },
    [SERA_ID]: { ...SERA },
  };
  const deps: RollDeps = {
    userFromToken: token => Promise.resolve(USERS[token as keyof typeof USERS] ?? null),
    roleIn: (_c, user) => Promise.resolve(user === 'dm' ? 'dm' : user === 'outsider' ? null : 'player'),
    loadCharacter: id => Promise.resolve(characters[id] ?? null),
    loadEffects: () => Promise.resolve(over.effects ?? []),
    gameSeconds: () => Promise.resolve(0),
    rollD20: args => {
      calls.push(args);
      if (over.rollError) return Promise.resolve({ data: null, error: over.rollError });
      // what roll_d20 stores: exactly the bonus it was given, with a fixed die
      const kept = 10;
      return Promise.resolve({
        data: {
          bonus: args.p_bonus,
          bonus_breakdown: args.p_breakdown,
          mode: args.p_mode,
          kept,
          total: kept + args.p_bonus,
        },
        error: null,
      });
    },
  };
  return { deps, calls };
}

const athletics = { campaignId: CAMPAIGN, characterId: BRANNOC_ID, kind: 'check', key: 'athletics', target: 14 };

async function call(deps: RollDeps, token: string | null, body: unknown) {
  const res = await handle(
    new Request('http://localhost/roll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
    deps,
  );
  return { status: res.status, body: await res.json() };
}

Deno.test(
  'authorised: the owner previews Brannoc’s Athletics (+6) against DC 14 with the engine’s own odds',
  async () => {
    const { deps } = world();
    const { status, body } = await call(deps, 'token-player', { action: 'preview', ...athletics });
    assert.equal(status, 200);
    assert.equal(body.bonus, 6);
    assert.deepEqual(body.bonusBreakdown, [
      { label: 'Strength', value: 3 },
      { label: 'Proficiency', value: 3 },
    ]);
    assert.equal(body.mode, 'normal');
    assert.equal(body.chance, successChance({ kind: 'check', bonus: 6, target: 14, mode: 'normal' }).final);
    assert.equal(body.chance, 0.65);
    assert.equal(body.label, 'Athletics check');
  },
);

Deno.test(
  'pending levels do not count: 14000 XP (level 6) on a sheet built to level 5 keeps proficiency +3; level 9 applied gives +4',
  async () => {
    const { deps } = world({ brannoc: { xp: 14000, levelApplied: 5 } });
    const { body } = await call(deps, 'token-player', { action: 'preview', ...athletics });
    assert.equal(body.bonus, 6);
    const levelled = world({ brannoc: { xp: 48000, levelApplied: 9 } });
    assert.equal((await call(levelled.deps, 'token-player', { action: 'preview', ...athletics })).body.bonus, 7);
  },
);

Deno.test('client bonus ignored: a forged bonus and breakdown do not change the stored roll', async () => {
  const { deps, calls } = world();
  const { status, body } = await call(deps, 'token-player', {
    action: 'roll',
    ...athletics,
    bonus: 30,
    bonusBreakdown: [{ label: 'Trust me', value: 30 }],
    label: 'Forged',
  });
  assert.equal(status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].p_bonus, 6);
  assert.deepEqual(calls[0].p_breakdown, [
    { label: 'Strength', value: 3 },
    { label: 'Proficiency', value: 3 },
  ]);
  assert.equal(calls[0].p_label, 'Athletics check');
  assert.equal(calls[0].p_actor, 'player');
  assert.equal(body.bonus, 6);
  assert.equal(body.total, 16);
});

Deno.test('player mode claim ignored: advantage asked for by a player is not given', async () => {
  const { deps, calls } = world();
  const claim = { mode: 'advantage', advantage: ['I have the high ground'] };
  const preview = await call(deps, 'token-player', { action: 'preview', ...athletics, ...claim });
  assert.equal(preview.body.mode, 'normal');
  assert.deepEqual(preview.body.reasons, []);
  await call(deps, 'token-player', { action: 'roll', ...athletics, ...claim });
  assert.equal(calls[0].p_mode, 'normal');
});

Deno.test('DM mode override: the DM may set the mode, and the roll uses it', async () => {
  const { deps, calls } = world();
  const preview = await call(deps, 'token-dm', { action: 'preview', ...athletics, mode: 'advantage' });
  assert.equal(preview.body.mode, 'advantage');
  assert.deepEqual(preview.body.reasons, [{ text: 'Set by the DM', kind: 'advantage', cancelled: false }]);
  assert.equal(preview.body.chance, successChance({ kind: 'check', bonus: 6, target: 14, mode: 'advantage' }).final);
  await call(deps, 'token-dm', { action: 'roll', ...athletics, mode: 'advantage', hidden: true });
  assert.equal(calls[0].p_mode, 'advantage');
  assert.equal(calls[0].p_hidden, true);
  assert.equal(calls[0].p_actor, 'dm');
  assert.equal(calls[0].p_bonus, 6, 'the DM sets the mode, not the bonus');
});

Deno.test('unauthorised: a player cannot preview or roll for another player’s character', async () => {
  const { deps, calls } = world();
  for (const action of ['preview', 'roll']) {
    const { status, body } = await call(deps, 'token-sera', { action, ...athletics });
    assert.equal(status, 403);
    assert.equal(body.error, 'You can only roll for your own character');
  }
  assert.equal(calls.length, 0);
});

Deno.test('unauthorised: no token, a bad token, or a stranger to the campaign', async () => {
  const { deps, calls } = world();
  assert.equal((await call(deps, null, { action: 'roll', ...athletics })).status, 401);
  assert.equal((await call(deps, 'forged', { action: 'roll', ...athletics })).status, 401);
  const outsider = await call(deps, 'token-outsider', { action: 'roll', ...athletics });
  assert.equal(outsider.status, 403);
  assert.equal(outsider.body.error, 'Only members of this campaign can roll here');
  assert.equal(calls.length, 0);
});

Deno.test('a player cannot make a hidden roll', async () => {
  const { deps, calls } = world();
  const { status } = await call(deps, 'token-player', { action: 'roll', ...athletics, hidden: true });
  assert.equal(status, 403);
  assert.equal(calls.length, 0);
});

Deno.test('conditions come from the database: a poisoned character rolls checks with disadvantage', async () => {
  const { deps } = world({ brannoc: { conditions: ['poisoned'] } });
  const { body } = await call(deps, 'token-player', { action: 'preview', ...athletics });
  assert.equal(body.mode, 'disadvantage');
  assert.equal(body.reasons[0].text, 'Poisoned: disadvantage on ability checks');
});

Deno.test('exhaustion is part of the bonus, and shows in the breakdown', async () => {
  const { deps, calls } = world({ brannoc: { exhaustion: 2 } });
  const { body } = await call(deps, 'token-player', { action: 'preview', ...athletics });
  assert.equal(body.bonus, 2);
  assert.deepEqual(body.bonusBreakdown.at(-1), { label: 'Exhaustion 2', value: -4 });
  await call(deps, 'token-player', { action: 'roll', ...athletics });
  assert.equal(calls[0].p_bonus, 2);
});

Deno.test('effects count, on the game clock: the potion unlocks the greatsword until game time passes it', async () => {
  const potion: EffectRow = {
    id: 'potion',
    name: 'Potion of Hill Giant Strength',
    source: 'Potion',
    stat: 'str',
    mode: 'set_at_least',
    value: 21,
    duration: { kind: 'until', atSeconds: 3600 },
    concentration: false,
  };
  const sword = { ...athletics, kind: 'attack', key: 'greatsword-drowned', target: 15 };
  const locked = await call(world().deps, 'token-player', { action: 'preview', ...sword });
  assert.equal(locked.status, 409);
  assert.match(locked.body.error, /Strength 17 needed, you have 16/);
  const { body } = await call(world({ effects: [potion] }).deps, 'token-player', { action: 'preview', ...sword });
  // Strength 21 (+5), proficiency +3, magic +1
  assert.equal(body.bonus, 9);
  assert.equal(body.critChance, 0.05);
});

Deno.test('saves and plain ability checks', async () => {
  const { deps } = world();
  const save = await call(deps, 'token-player', { action: 'preview', ...athletics, kind: 'save', key: 'con' });
  assert.equal(save.body.label, 'Constitution save');
  assert.equal(save.body.bonus, 5);
  const check = await call(deps, 'token-player', { action: 'preview', ...athletics, key: 'int' });
  assert.equal(check.body.label, 'Intelligence check');
  assert.equal(check.body.bonus, -1);
  const nope = await call(deps, 'token-player', { action: 'preview', ...athletics, kind: 'save', key: 'athletics' });
  assert.equal(nope.status, 400);
});

Deno.test('the rate limit comes back as 429', async () => {
  const { deps } = world({ rollError: { code: 'PT429', message: 'Too many rolls in the last minute.' } });
  const { status, body } = await call(deps, 'token-player', { action: 'roll', ...athletics });
  assert.equal(status, 429);
  assert.equal(body.error, 'Too many rolls in the last minute.');
});

Deno.test('bad requests are refused before anything is read', async () => {
  const { deps, calls } = world();
  assert.equal((await call(deps, 'token-player', { ...athletics, action: 'steal' })).status, 400);
  assert.equal((await call(deps, 'token-player', { action: 'roll', ...athletics, target: 'easy' })).status, 400);
  assert.equal((await call(deps, 'token-player', { action: 'roll', ...athletics, characterId: 'x' })).status, 400);
  assert.equal(calls.length, 0);
});

Deno.test('a damaged sheet is refused, not guessed at', async () => {
  const { deps } = world({ brannoc: { sheet: { className: 'Fighter' } } });
  const { status } = await call(deps, 'token-player', { action: 'preview', ...athletics });
  assert.equal(status, 422);
});

Deno.test('the browser’s CORS preflight is answered', async () => {
  const res = await handle(new Request('http://localhost/roll', { method: 'OPTIONS' }), world().deps);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  await res.body?.cancel();
});
