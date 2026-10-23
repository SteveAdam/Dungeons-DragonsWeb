// P1-7 golden fixtures: Brannoc exactly as the ticket gives him, and the potion that unlocks his greatsword.
// Used by the engine tests, the web tests and the development seed.
import type { Effect } from './effects';
import type { InventoryItem } from './items';
import type { CharacterSheet } from './sheet';

export const BRANNOC: CharacterSheet = {
  name: 'Brannoc',
  species: 'Human',
  className: 'Fighter',
  background: 'Soldier',
  alignment: 'Lawful neutral',
  xp: 6900,
  abilityScores: { str: 16, dex: 12, con: 15, int: 9, wis: 11, cha: 10 },
  skillProficiencies: ['athletics', 'intimidation', 'perception', 'survival'],
  expertise: [],
  saveProficiencies: ['str', 'con'],
  hp: { max: 50, current: 39, temp: 0 },
  hitDice: { die: 'd10', total: 5, spent: 1 },
  speed: 25,
  armor: { name: 'Chain mail', base: 16, dexCap: 0, strReq: 13 },
  shield: true,
  weapons: [
    {
      id: 'longsword',
      name: 'Longsword +1',
      ability: 'str',
      proficient: true,
      magicBonus: 1,
      damage: '1d8',
      damageType: 'slashing',
      mastery: 'Sap',
    },
    {
      id: 'handaxe',
      name: 'Handaxe',
      ability: 'str',
      proficient: true,
      magicBonus: 0,
      damage: '1d6',
      damageType: 'slashing',
      mastery: 'Vex',
    },
    {
      id: 'greatsword-drowned',
      name: 'Greatsword of the Drowned',
      ability: 'str',
      proficient: true,
      magicBonus: 1,
      damage: '2d6',
      damageType: 'slashing',
      mastery: 'Graze',
      requirements: [{ stat: 'str', min: 17, onUnmet: 'lock' }],
    },
  ],
  equipment: ['Chain mail', 'Shield', "Explorer's pack", 'Potion of Hill Giant Strength'],
  inspiration: false,
};

/** Potion of Hill Giant Strength, drunk at `startSeconds`: Strength becomes 21 (if lower) for one hour. */
export function hillGiantStrength(startSeconds: number, id = 'hill-giant-strength'): Effect {
  return {
    id,
    name: 'Potion of Hill Giant Strength',
    source: 'Potion',
    stat: 'str',
    mode: 'set_at_least',
    value: 21,
    duration: { kind: 'until', atSeconds: startSeconds + 3600 },
  };
}

/**
 * P2-7: Brannoc's equipment as items. Weapon and armour numbers are the SRD 5.2.1 records (packages/srd-data);
 * the Greatsword of the Drowned is the P1-3 example (a +1 greatsword that needs Strength 17). Arrows weigh 1 lb.
 * per 20. Everything is carried and nothing equipped: tests and the seed equip what they need.
 */
export const BRANNOC_ITEMS: InventoryItem[] = [
  {
    id: 'chain-mail',
    name: 'Chain Mail',
    kind: 'armor',
    definition: { armor: { category: 'heavy', baseAc: 16, strength: 13, stealthDisadvantage: true } },
    weight: 55,
    quantity: 1,
    requiresAttunement: false,
    equipped: false,
    attuned: false,
  },
  {
    id: 'shield',
    name: 'Shield',
    kind: 'shield',
    definition: { armor: { category: 'shield', baseAc: 2, strength: null, stealthDisadvantage: false } },
    weight: 6,
    quantity: 1,
    requiresAttunement: false,
    equipped: false,
    attuned: false,
  },
  {
    id: 'longsword',
    name: 'Longsword +1',
    kind: 'magic',
    definition: {
      weapon: {
        category: 'martial',
        kind: 'melee',
        damage: { dice: '1d8', type: 'slashing' },
        properties: ['versatile'],
        versatileDice: '1d10',
        mastery: 'sap',
      },
      magicBonus: 1,
    },
    weight: 3,
    quantity: 1,
    requiresAttunement: false,
    equipped: false,
    attuned: false,
  },
  {
    id: 'handaxe',
    name: 'Handaxe',
    kind: 'weapon',
    definition: {
      weapon: {
        category: 'simple',
        kind: 'melee',
        damage: { dice: '1d6', type: 'slashing' },
        properties: ['light', 'thrown'],
        range: { normal: 20, long: 60 },
        mastery: 'vex',
      },
    },
    weight: 2,
    quantity: 1,
    requiresAttunement: false,
    equipped: false,
    attuned: false,
  },
  {
    id: 'greatsword-drowned',
    name: 'Greatsword of the Drowned',
    kind: 'magic',
    definition: {
      weapon: {
        category: 'martial',
        kind: 'melee',
        damage: { dice: '2d6', type: 'slashing' },
        properties: ['heavy', 'two-handed'],
        mastery: 'graze',
      },
      magicBonus: 1,
      requirements: [{ stat: 'str', min: 17, onUnmet: 'lock' }],
    },
    weight: 6,
    quantity: 1,
    requiresAttunement: false,
    equipped: false,
    attuned: false,
  },
  {
    id: 'arrows',
    name: 'Arrows',
    kind: 'gear',
    definition: {},
    weight: 0.05,
    quantity: 20,
    requiresAttunement: false,
    equipped: false,
    attuned: false,
  },
];
