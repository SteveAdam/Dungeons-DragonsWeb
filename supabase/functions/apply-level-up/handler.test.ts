// P2-10: tests for the apply-level-up function, with the database replaced by an in-memory stand-in and the real
// SRD records from packages/srd-data.
//   pnpm test:functions
import assert from 'node:assert/strict';
import armor from '../../../packages/srd-data/data/armor.json' with { type: 'json' };
import backgrounds from '../../../packages/srd-data/data/backgrounds.json' with { type: 'json' };
import classes from '../../../packages/srd-data/data/classes.json' with { type: 'json' };
import species from '../../../packages/srd-data/data/species.json' with { type: 'json' };
import spells from '../../../packages/srd-data/data/spells.json' with { type: 'json' };
import weapons from '../../../packages/srd-data/data/weapons.json' with { type: 'json' };
import {
  buildCharacter,
  type CreationSrd,
  type LevelUpChoices,
  type LevelUpClass,
} from '../_shared/rules-engine/index.ts';
import { handle, type ApplyArgs, type LevelUpDeps, type StoredCharacter } from './handler.ts';

const CHARACTER = '00000000-0000-4000-8000-0000000000c1';
const SRD = { species, classes, backgrounds, spells, weapons, armor } as unknown as CreationSrd;
const noDetails = { personalityTraits: '', ideals: '', bonds: '', flaws: '', appearance: '', backstory: '' };

// a level 1 Fighter (Constitution 15, +2) from the creation rules, stored as the database keeps it
const built = buildCharacter(
  {
    name: 'Aldric',
    species: 'dwarf',
    class: 'fighter',
    background: 'soldier',
    abilities: { method: 'standard', base: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 } },
    backgroundBonus: { plus2: 'str', plus1: 'con' },
    skills: ['perception', 'survival'],
    equipment: { class: 'A', background: 'A' },
    spells: { cantrips: [], prepared: [], spellbook: [] },
    alignment: '',
    details: noDetails,
  },
  SRD,
);
const { name: _n, xp: _x, levelApplied: _l, ...storedSheet } = built.sheet;

function world(over: Partial<StoredCharacter> = {}, roll: { id: string; die: number } | null = null) {
  const calls: ApplyArgs[] = [];
  const deps: LevelUpDeps = {
    userFromToken: t =>
      Promise.resolve({ 'token-owner': 'owner', 'token-other': 'other', 'token-dm': 'dm' }[t] ?? null),
    roleIn: (_c, user) =>
      Promise.resolve(user === 'dm' ? 'dm' : user === 'other' || user === 'owner' ? 'player' : null),
    loadCharacter: id =>
      Promise.resolve(
        id === CHARACTER
          ? {
              id,
              campaignId: 'c1',
              ownerId: 'owner',
              name: 'Aldric',
              sheet: storedSheet,
              xp: 900,
              levelApplied: 1,
              ...over,
            }
          : null,
      ),
    loadClass: name => Promise.resolve((classes as unknown as LevelUpClass[]).find(c => c.name === name) ?? null),
    loadSpells: () => Promise.resolve(SRD.spells),
    unusedHitDieRoll: () => Promise.resolve(roll),
    optionalFeats: () => Promise.resolve(false),
    apply: args => {
      calls.push(args);
      return Promise.resolve({ data: { id: 'event' }, error: null });
    },
  };
  return { deps, calls };
}

const average = (toLevel: number, extra: Partial<LevelUpChoices> = {}): LevelUpChoices => ({
  toLevel,
  hitPoints: { method: 'average' },
  spells: { cantrips: [], prepared: [], spellbook: [] },
  ...extra,
});

async function call(deps: LevelUpDeps, token: string | null, body: unknown) {
  const res = await handle(
    new Request('http://localhost/apply-level-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
    deps,
  );
  return { status: res.status, body: await res.json() };
}

Deno.test(
  'the owner applies level 2: the server builds the sheet (d10 average 6 + Con 2 = 8 more hit points)',
  async () => {
    const { deps, calls } = world();
    const { status, body } = await call(deps, 'token-owner', { characterId: CHARACTER, choices: average(2) });
    assert.equal(status, 200);
    assert.deepEqual(body, { level: 2, hitPoints: 20, hitPointsGained: 8, proficiencyBonus: 2 });
    const args = calls[0];
    assert.deepEqual([args.p_actor, args.p_from, args.p_hp_gain, args.p_roll], ['owner', 1, 8, null]);
    const sheet = args.p_sheet as { hp: { max: number }; hitDice: { total: number }; levelApplied: number };
    assert.deepEqual([sheet.hp.max, sheet.hitDice.total, sheet.levelApplied], [20, 2, 2]);
  },
);

Deno.test('a rolled gain uses the server’s own roll of the Hit Point Die, and only this level’s', async () => {
  const roll = (rollId: string) => average(2, { hitPoints: { method: 'roll', rollId } });
  const { deps, calls } = world({}, { id: 'r1', die: 7 });
  const ok = await call(deps, 'token-owner', { characterId: CHARACTER, choices: roll('r1') });
  assert.equal(ok.body.hitPointsGained, 9);
  assert.equal(calls[0].p_roll, 'r1');
  const other = await call(world({}, { id: 'r2', die: 10 }).deps, 'token-owner', {
    characterId: CHARACTER,
    choices: roll('r1'),
  });
  assert.deepEqual([other.status, other.body.error], [422, 'That hit point roll is not this level’s unused roll']);
  const none = await call(world({}, null).deps, 'token-owner', { characterId: CHARACTER, choices: roll('r1') });
  assert.equal(none.status, 422);
  const swap = await call(world({}, { id: 'r1', die: 1 }).deps, 'token-owner', {
    characterId: CHARACTER,
    choices: average(2),
  });
  assert.deepEqual(
    [swap.status, swap.body.error],
    [422, 'You rolled your Hit Point Die for this level: that roll is your gain'],
  );
});

Deno.test('a second account cannot apply someone else’s level-up; the DM can', async () => {
  const { deps, calls } = world();
  assert.equal((await call(deps, 'token-other', { characterId: CHARACTER, choices: average(2) })).status, 403);
  assert.equal(calls.length, 0);
  assert.equal((await call(deps, 'token-dm', { characterId: CHARACTER, choices: average(2) })).status, 200);
  assert.equal((await call(deps, null, { characterId: CHARACTER, choices: average(2) })).status, 401);
});

Deno.test(
  'no pending level, the wrong level, a missing subclass or unknown content: refused, nothing written',
  async () => {
    const cases: [Partial<StoredCharacter>, LevelUpChoices, string][] = [
      [{ xp: 0 }, average(2), 'No level-up is waiting: the character needs more XP.'],
      [{}, average(3), 'These choices are for level 3; the next level is 2.'],
      [{ levelApplied: 2 }, average(3), 'Choose your Fighter subclass.'],
      [{ levelApplied: 3, xp: 2700 }, average(4), 'Content for this level is not available yet.'],
      [
        {},
        average(2, { spells: { cantrips: ['Fire Bolt'], prepared: [], spellbook: [] } }),
        'Level 2 adds no cantrips.',
      ],
    ];
    for (const [over, choices, message] of cases) {
      const { deps, calls } = world(over);
      const { status, body } = await call(deps, 'token-owner', { characterId: CHARACTER, choices });
      assert.equal(status, 422, message);
      assert.ok(
        body.problems.some((p: { message: string }) => p.message === message),
        JSON.stringify(body.problems),
      );
      assert.equal(calls.length, 0);
    }
  },
);

Deno.test('payloads of the wrong shape, and a level applied in the meantime', async () => {
  const { deps } = world();
  assert.deepEqual(await call(deps, 'token-owner', { characterId: 'x', choices: average(2) }), {
    status: 400,
    body: { error: 'characterId is missing' },
  });
  assert.equal((await call(deps, 'token-owner', { characterId: CHARACTER, choices: { toLevel: 2 } })).status, 400);
  deps.apply = () =>
    Promise.resolve({
      data: null,
      error: { code: '22023', message: 'The character is no longer at level 1: reload and try again' },
    });
  assert.equal((await call(deps, 'token-owner', { characterId: CHARACTER, choices: average(2) })).status, 409);
});
