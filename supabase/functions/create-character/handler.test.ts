// P2-9: tests for the create-character function, with the database replaced by an in-memory stand-in and the
// real SRD records from packages/srd-data.
//   pnpm test:functions
import assert from 'node:assert/strict';
import armor from '../../../packages/srd-data/data/armor.json' with { type: 'json' };
import backgrounds from '../../../packages/srd-data/data/backgrounds.json' with { type: 'json' };
import classes from '../../../packages/srd-data/data/classes.json' with { type: 'json' };
import species from '../../../packages/srd-data/data/species.json' with { type: 'json' };
import spells from '../../../packages/srd-data/data/spells.json' with { type: 'json' };
import weapons from '../../../packages/srd-data/data/weapons.json' with { type: 'json' };
import type { CreationChoices, CreationSrd } from '../_shared/rules-engine/index.ts';
import { handle, type CreateArgs, type CreateDeps } from './handler.ts';

const CAMPAIGN = '00000000-0000-4000-8000-000000000001';
const SRD = { species, classes, backgrounds, spells, weapons, armor } as unknown as CreationSrd;
const noDetails = { personalityTraits: '', ideals: '', bonds: '', flaws: '', appearance: '', backstory: '' };

const fighter: CreationChoices = {
  name: 'Brannoc',
  species: 'human',
  size: 'medium',
  class: 'fighter',
  background: 'soldier',
  abilities: { method: 'standard', base: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 } },
  backgroundBonus: { plus2: 'str', plus1: 'con' },
  skills: ['perception', 'survival'],
  equipment: { class: 'A', background: 'A' },
  spells: { cantrips: [], prepared: [], spellbook: [] },
  alignment: 'Lawful neutral',
  details: noDetails,
};
// 6,6,6,1 → 18; 5,5,5,1 → 15; 4,4,4,1 → 12 (twice); 3,3,3,1 → 9; 2,2,2,1 → 6
const DICE = [6, 6, 6, 1, 5, 5, 5, 1, 4, 4, 4, 1, 4, 4, 4, 1, 3, 3, 3, 1, 2, 2, 2, 1];

function world(roll: { id: string; dice: number[] } | null = null) {
  const calls: CreateArgs[] = [];
  const deps: CreateDeps = {
    userFromToken: token =>
      Promise.resolve(token === 'token-player' ? 'player' : token === 'token-outsider' ? 'outsider' : null),
    roleIn: (_c, user) => Promise.resolve(user === 'player' ? 'player' : null),
    loadSrd: () => Promise.resolve(SRD),
    unusedAbilityRoll: () => Promise.resolve(roll),
    createCharacter: args => {
      calls.push(args);
      return Promise.resolve({ data: 'new-character', error: null });
    },
  };
  return { deps, calls };
}

async function call(deps: CreateDeps, token: string | null, body: unknown) {
  const res = await handle(
    new Request('http://localhost/create-character', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
    deps,
  );
  return { status: res.status, body: await res.json() };
}

Deno.test(
  'a level 1 Fighter: the server builds the sheet itself (12 hit points, chain mail AC 16, 18 GP)',
  async () => {
    const { deps, calls } = world();
    const { status, body } = await call(deps, 'token-player', { campaignId: CAMPAIGN, choices: fighter });
    assert.equal(status, 201);
    assert.deepEqual(body, { characterId: 'new-character', hitPoints: 12, armorClass: 16 });
    const args = calls[0];
    assert.equal(args.p_actor, 'player');
    assert.equal(args.p_gp, 18);
    assert.equal(args.p_roll, null);
    const sheet = args.p_sheet as { hp: { max: number }; abilityScores: Record<string, number> };
    assert.deepEqual(sheet.hp, { max: 12, current: 12, temp: 0 });
    assert.equal(sheet.abilityScores.str, 17);
    const items = args.p_items as { name: string; equipped: boolean; quantity: number }[];
    assert.deepEqual(
      items.filter(i => i.equipped).map(i => `${i.name} x${i.quantity}`),
      ['Chain Mail x1', 'Greatsword x1', 'Flail x1', 'Javelin x8', 'Spear x1', 'Shortbow x1'],
    );
  },
);

Deno.test('numbers the client sends are never read: a forged sheet in the payload changes nothing', async () => {
  const { deps, calls } = world();
  const forged = { ...fighter, hp: { max: 999 }, abilityScores: { str: 30 }, sheet: { hp: { max: 999 } } };
  const { status } = await call(deps, 'token-player', { campaignId: CAMPAIGN, choices: forged });
  assert.equal(status, 201);
  assert.equal((calls[0].p_sheet as { hp: { max: number } }).hp.max, 12);
});

Deno.test('tampered payloads are rejected with the rule they break, and nothing is written', async () => {
  const cases: [string, Partial<CreationChoices>, string][] = [
    [
      'point buy over 27',
      { abilities: { method: 'pointBuy', base: { str: 15, dex: 15, con: 15, int: 10, wis: 8, cha: 8 } } },
      'That costs 29 points; you have 27.',
    ],
    [
      'the standard array twice',
      { abilities: { method: 'standard', base: { str: 15, dex: 15, con: 14, int: 8, wis: 12, cha: 10 } } },
      "Use each of the standard array's scores once: 15, 14, 13, 12, 10, 8.",
    ],
    ['a skill outside the class list', { skills: ['perception', 'arcana'] }, 'Fighters cannot choose arcana.'],
    ['an unknown class', { class: 'necromancer' }, 'Choose a class.'],
    [
      'a spell for a Fighter',
      { spells: { cantrips: ['Fire Bolt'], prepared: [], spellbook: [] } },
      'Fire Bolt is not a level 0 Fighter spell.',
    ],
    [
      'an equipment option that does not exist',
      { equipment: { class: 'D', background: 'A' } },
      "Choose one of the Fighter's equipment options.",
    ],
    [
      'a background increase it does not offer',
      { backgroundBonus: { plus2: 'cha', plus1: 'str' } },
      'Soldier can raise only str, dex, con, not cha',
    ],
  ];
  for (const [what, change, message] of cases) {
    const { deps, calls } = world();
    const { status, body } = await call(deps, 'token-player', {
      campaignId: CAMPAIGN,
      choices: { ...fighter, ...change },
    });
    assert.equal(status, 422, what);
    assert.ok(
      body.problems.some((p: { message: string }) => p.message === message),
      `${what}: ${JSON.stringify(body.problems)}`,
    );
    assert.equal(calls.length, 0, what);
  }
});

Deno.test('rolled scores must be the player’s own unused roll, exactly as rolled', async () => {
  const rolled = {
    ...fighter,
    abilities: {
      method: 'roll' as const,
      rollId: 'roll-1',
      base: { str: 18, dex: 12, con: 15, int: 6, wis: 12, cha: 9 },
    },
  };
  const none = await call(world(null).deps, 'token-player', { campaignId: CAMPAIGN, choices: rolled });
  assert.equal(none.status, 422);
  const other = await call(world({ id: 'roll-2', dice: DICE }).deps, 'token-player', {
    campaignId: CAMPAIGN,
    choices: rolled,
  });
  assert.deepEqual(
    [other.status, other.body.error],
    [422, 'Those ability scores do not come from your unused ability roll'],
  );
  const inflated = { ...rolled, abilities: { ...rolled.abilities, base: { ...rolled.abilities.base, int: 18 } } };
  const lie = await call(world({ id: 'roll-1', dice: DICE }).deps, 'token-player', {
    campaignId: CAMPAIGN,
    choices: inflated,
  });
  assert.equal(lie.status, 422);
  const { deps, calls } = world({ id: 'roll-1', dice: DICE });
  const ok = await call(deps, 'token-player', { campaignId: CAMPAIGN, choices: rolled });
  assert.equal(ok.status, 201);
  assert.equal(calls[0].p_roll, 'roll-1');
});

Deno.test('who may call it, and payloads of the wrong shape', async () => {
  const { deps } = world();
  assert.equal((await call(deps, null, { campaignId: CAMPAIGN, choices: fighter })).status, 401);
  assert.equal((await call(deps, 'token-forged', { campaignId: CAMPAIGN, choices: fighter })).status, 401);
  assert.equal((await call(deps, 'token-outsider', { campaignId: CAMPAIGN, choices: fighter })).status, 403);
  assert.deepEqual(await call(deps, 'token-player', { campaignId: 'nope', choices: fighter }), {
    status: 400,
    body: { error: 'campaignId is missing' },
  });
  assert.deepEqual(await call(deps, 'token-player', { campaignId: CAMPAIGN, choices: { ...fighter, skills: 'all' } }), {
    status: 400,
    body: { error: 'skills must be a list of skills' },
  });
});

Deno.test('the database’s refusals come back as statuses', async () => {
  const { deps } = world();
  deps.createCharacter = () =>
    Promise.resolve({
      data: null,
      error: { code: '42501', message: 'Only members of this campaign can create a character here' },
    });
  assert.equal((await call(deps, 'token-player', { campaignId: CAMPAIGN, choices: fighter })).status, 403);
});
