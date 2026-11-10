// P3-6: the form for each kind of custom entry, as data: DefinitionForm draws whatever is listed here.
import {
  ABILITY_KEYS,
  CONDITIONS,
  CUSTOM_ITEM_KINDS,
  DAMAGE_TYPES,
  ITEM_RARITIES,
  SPELL_SCHOOLS,
  WEAPON_MASTERIES,
  WEAPON_PROPERTIES,
  type CustomKind,
} from '@dnd-manager/rules-engine';

export type Option = readonly [value: string, label: string];

export type Column =
  | { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'bool' | 'damage'; optional?: boolean }
  | { key: string; label: string; type: 'select'; options: readonly Option[]; optional?: boolean };

interface Base {
  path: string;
  label: string;
  hint?: string;
  /** Shown in the comparison even when it has not changed. */
  key?: boolean;
  /** Empty means the field is left out or null. */
  optional?: boolean;
}

export type Field =
  | (Base & { type: 'text' | 'textarea' | 'number' | 'bool' | 'strings' | 'effects' })
  | (Base & { type: 'select'; options: readonly Option[] })
  | (Base & { type: 'multi'; options: readonly Option[] })
  | (Base & { type: 'rows'; columns: readonly Column[]; blank: object });

export interface Section {
  title: string;
  fields: readonly Field[];
}

const titled = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const options = (list: readonly string[]): Option[] => list.map(v => [v, titled(v)]);

const ABILITY_OPTIONS = options(ABILITY_KEYS).map(([v]) => [v, v.toUpperCase()] as const);
const DAMAGE_OPTIONS = options(DAMAGE_TYPES);
const COIN_OPTIONS: Option[] = ['cp', 'sp', 'ep', 'gp', 'pp'].map(c => [c, c.toUpperCase()]);
const STAT_OPTIONS: Option[] = [...ABILITY_OPTIONS, ['speed', 'Speed'], ['ac', 'Armour class']];
const CASTERS = options(['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard']);
const ADD_OR_SET: Option[] = [
  ['add', 'adds'],
  ['set', 'becomes'],
];

const ENTRY_COLUMNS: Column[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'usage', label: 'Usage', type: 'text', optional: true },
  { key: 'description', label: 'Text', type: 'textarea' },
];
const entries = (path: string, label: string): Field => ({
  path,
  label,
  type: 'rows',
  columns: ENTRY_COLUMNS,
  blank: { name: '', description: '' },
});

const COST_FIELDS: Field[] = [
  { path: 'cost.amount', label: 'Cost', type: 'number', key: true },
  { path: 'cost.coin', label: 'Coin', type: 'select', options: COIN_OPTIONS },
  { path: 'weightLb', label: 'Weight (lb.)', type: 'number', optional: true, key: true },
];

const ITEM_RULES: Section = {
  title: 'Item rules',
  fields: [
    {
      path: 'itemRules.requirements',
      label: 'Requirements',
      hint: 'A character below the minimum cannot use it.',
      type: 'rows',
      columns: [
        { key: 'stat', label: 'Ability', type: 'select', options: ABILITY_OPTIONS },
        { key: 'min', label: 'Minimum', type: 'number' },
      ],
      blank: { stat: 'str', min: 13, onUnmet: 'lock' },
    },
    {
      path: 'itemRules.effects',
      label: 'Effects while equipped',
      type: 'rows',
      columns: [
        { key: 'stat', label: 'Stat', type: 'select', options: STAT_OPTIONS },
        {
          key: 'mode',
          label: 'How',
          type: 'select',
          options: [...ADD_OR_SET, ['set_at_least', 'at least']],
        },
        { key: 'value', label: 'Value', type: 'number' },
      ],
      blank: { stat: 'ac', mode: 'add', value: 1 },
    },
    { path: 'itemRules.grantedText', label: 'Granted effect', type: 'textarea' },
    { path: 'itemRules.magicBonus', label: 'Magic bonus', type: 'number', optional: true },
    { path: 'itemRules.canBeGiven', label: 'Can be given to others', type: 'bool' },
    { path: 'itemRules.bound', label: 'Bound to a character', type: 'bool' },
  ],
};

const SPELL: Section[] = [
  {
    title: 'Spell',
    fields: [
      { path: 'level', label: 'Level (0 is a cantrip)', type: 'number', key: true },
      { path: 'school', label: 'School', type: 'select', options: options(SPELL_SCHOOLS), key: true },
      { path: 'castingTime', label: 'Casting time', type: 'text', key: true },
      { path: 'range', label: 'Range', type: 'text', key: true },
      { path: 'duration', label: 'Duration', type: 'text', key: true },
      { path: 'components.v', label: 'Verbal', type: 'bool' },
      { path: 'components.s', label: 'Somatic', type: 'bool' },
      { path: 'components.m', label: 'Material', type: 'bool' },
      { path: 'components.materialText', label: 'Material needed', type: 'text', optional: true },
      { path: 'concentration', label: 'Concentration', type: 'bool', key: true },
      { path: 'ritual', label: 'Ritual', type: 'bool' },
      { path: 'classes', label: 'Classes', type: 'multi', options: CASTERS },
    ],
  },
  {
    title: 'What it does',
    fields: [
      { path: 'text', label: 'Text', type: 'textarea' },
      { path: 'higherLevels', label: 'At higher levels', type: 'textarea', optional: true },
      { path: 'effects', label: 'Effects', type: 'effects' },
    ],
  },
];

const ability = (a: string, group: string, label: string): Field => ({
  path: `${group}.${a}`,
  label: `${a.toUpperCase()} ${label}`,
  type: 'number',
});

const MONSTER: Section[] = [
  {
    title: 'Creature',
    fields: [
      {
        path: 'category',
        label: 'Kind',
        type: 'select',
        options: [
          ['monster', 'Monster'],
          ['animal', 'Animal'],
        ],
      },
      { path: 'size', label: 'Sizes', hint: 'Separate with commas.', type: 'strings' },
      { path: 'creatureType', label: 'Creature type', type: 'text', key: true },
      { path: 'creatureTags', label: 'Tags', type: 'text', optional: true },
      { path: 'alignment', label: 'Alignment', type: 'text' },
    ],
  },
  {
    title: 'Defences and movement',
    fields: [
      { path: 'armourClass', label: 'Armour class', type: 'number', key: true },
      { path: 'armourNote', label: 'Armour note', type: 'text', optional: true },
      { path: 'hitPoints', label: 'Hit points', type: 'number', key: true },
      { path: 'hitDice', label: 'Hit dice', type: 'text', key: true },
      { path: 'speedText', label: 'Speed', type: 'text', key: true },
      { path: 'initiative.bonus', label: 'Initiative bonus', type: 'number' },
      { path: 'initiative.score', label: 'Initiative score', type: 'number' },
    ],
  },
  { title: 'Ability scores', fields: ABILITY_KEYS.map(a => ability(a, 'abilityScores', 'score')) },
  { title: 'Saving throws', fields: ABILITY_KEYS.map(a => ability(a, 'saves', 'save')) },
  {
    title: 'Details',
    fields: [
      {
        path: 'skills',
        label: 'Skills',
        type: 'rows',
        columns: [
          { key: 'name', label: 'Skill', type: 'text' },
          { key: 'bonus', label: 'Bonus', type: 'number' },
        ],
        blank: { name: '', bonus: 0 },
      },
      { path: 'damageVulnerabilities', label: 'Vulnerabilities', type: 'strings' },
      { path: 'damageResistances', label: 'Resistances', type: 'strings' },
      { path: 'damageImmunities', label: 'Damage immunities', type: 'strings' },
      { path: 'conditionImmunities', label: 'Condition immunities', type: 'strings' },
      { path: 'gear', label: 'Gear', type: 'strings' },
      { path: 'senses', label: 'Senses', type: 'strings' },
      { path: 'passivePerception', label: 'Passive Perception', type: 'number' },
      { path: 'languages', label: 'Languages', type: 'text' },
      { path: 'challengeRating', label: 'Challenge rating', type: 'select', options: [], key: true },
    ],
  },
  {
    title: 'Traits and actions',
    fields: [
      entries('traits', 'Traits'),
      entries('actions', 'Actions'),
      entries('bonusActions', 'Bonus actions'),
      entries('reactions', 'Reactions'),
      entries('legendaryActions', 'Legendary actions'),
    ],
  },
  {
    title: 'Attack numbers',
    fields: [
      {
        path: 'attacks',
        label: 'Attacks',
        hint: 'The balance guide reads these. They do not rewrite the action text above.',
        type: 'rows',
        columns: [
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'attackBonus', label: 'To hit', type: 'number', optional: true },
          { key: 'reachOrRange', label: 'Reach or range', type: 'text', optional: true },
          { key: 'saveDc', label: 'Save DC', type: 'number', optional: true },
          { key: 'damage', label: 'Damage', type: 'damage' },
          { key: 'limited', label: 'Limited uses', type: 'bool', optional: true },
        ],
        blank: { name: '', attackBonus: 2, reachOrRange: 'reach 5 ft.', damage: [] },
      },
    ],
  },
];

const WEAPON: Section[] = [
  {
    title: 'Weapon fields',
    fields: [
      {
        path: 'category',
        label: 'Category',
        type: 'select',
        options: options(['simple', 'martial']),
        key: true,
      },
      { path: 'kind', label: 'Melee or ranged', type: 'select', options: options(['melee', 'ranged']), key: true },
      { path: 'damage.dice', label: 'Damage dice', type: 'text', key: true },
      { path: 'damage.type', label: 'Damage type', type: 'select', options: DAMAGE_OPTIONS, key: true },
      { path: 'properties', label: 'Properties', type: 'multi', options: options(WEAPON_PROPERTIES) },
      { path: 'versatileDice', label: 'Versatile damage', type: 'text', optional: true },
      { path: 'range.normal', label: 'Normal range (ft.)', type: 'number', optional: true },
      { path: 'range.long', label: 'Long range (ft.)', type: 'number', optional: true },
      { path: 'mastery', label: 'Mastery', type: 'select', options: options(WEAPON_MASTERIES), key: true },
      ...COST_FIELDS,
    ],
  },
  ITEM_RULES,
];

const ARMOR: Section[] = [
  {
    title: 'Armour fields',
    fields: [
      {
        path: 'category',
        label: 'Category',
        type: 'select',
        options: options(['light', 'medium', 'heavy', 'shield']),
        key: true,
      },
      { path: 'baseAc', label: 'Base armour class', type: 'number', key: true },
      { path: 'acText', label: 'Armour class text', type: 'text', key: true },
      { path: 'strength', label: 'Strength needed', type: 'number', optional: true, key: true },
      { path: 'stealthDisadvantage', label: 'Disadvantage on Stealth', type: 'bool', key: true },
      { path: 'donDoff', label: 'Time to put on', type: 'text' },
      ...COST_FIELDS,
    ],
  },
  ITEM_RULES,
];

const ITEM: Section[] = [
  {
    title: 'Item fields',
    fields: [
      { path: 'itemKind', label: 'Kind', type: 'select', options: options(CUSTOM_ITEM_KINDS), key: true },
      { path: 'rarity', label: 'Rarity', type: 'select', options: options(ITEM_RARITIES), optional: true, key: true },
      { path: 'requiresAttunement', label: 'Needs attunement', type: 'bool', key: true },
      { path: 'description', label: 'Description', type: 'textarea' },
      ...COST_FIELDS,
      { path: 'effects', label: 'Effects', type: 'effects' },
    ],
  },
  ITEM_RULES,
];

export const CUSTOM_FORMS: Record<CustomKind, readonly Section[]> = {
  spell: SPELL,
  monster: MONSTER,
  weapon: WEAPON,
  armor: ARMOR,
  item: ITEM,
};

export const KIND_LABELS: Record<CustomKind, string> = {
  spell: 'spell',
  monster: 'monster',
  weapon: 'weapon',
  armor: 'armour',
  item: 'item',
};

/** The vocabulary, as the effect rows show it. "text" is the way out: kept, labelled text only, never calculated. */
export const EFFECT_FORMS: Record<string, { label: string; blank: object; columns: readonly Column[] }> = {
  damage: {
    label: 'Deal damage',
    blank: { dice: '1d6', damageType: 'fire' },
    columns: [
      { key: 'dice', label: 'Dice', type: 'text' },
      { key: 'damageType', label: 'Type', type: 'select', options: DAMAGE_OPTIONS },
    ],
  },
  heal: {
    label: 'Restore hit points',
    blank: { dice: '1d8' },
    columns: [{ key: 'dice', label: 'Dice', type: 'text' }],
  },
  ability: {
    label: 'Change an ability score',
    blank: { ability: 'str', mode: 'add', value: 1 },
    columns: [
      { key: 'ability', label: 'Ability', type: 'select', options: ABILITY_OPTIONS },
      { key: 'mode', label: 'How', type: 'select', options: ADD_OR_SET },
      { key: 'value', label: 'Value', type: 'number' },
    ],
  },
  advantage: {
    label: 'Advantage or disadvantage',
    blank: { mode: 'advantage', roll: 'attack' },
    columns: [
      { key: 'mode', label: 'Grants', type: 'select', options: options(['advantage', 'disadvantage']) },
      { key: 'roll', label: 'On', type: 'select', options: options(['attack', 'save', 'check']) },
    ],
  },
  condition: {
    label: 'Apply or remove a condition',
    blank: { action: 'apply', condition: 'prone' },
    columns: [
      { key: 'action', label: 'Action', type: 'select', options: options(['apply', 'remove']) },
      { key: 'condition', label: 'Condition', type: 'select', options: options(CONDITIONS) },
    ],
  },
  resistance: {
    label: 'Grant resistance',
    blank: { damageType: 'fire' },
    columns: [{ key: 'damageType', label: 'Type', type: 'select', options: DAMAGE_OPTIONS }],
  },
  stat: {
    label: 'Change speed or armour class',
    blank: { stat: 'ac', mode: 'add', value: 1 },
    columns: [
      {
        key: 'stat',
        label: 'Stat',
        type: 'select',
        options: [
          ['speed', 'Speed'],
          ['ac', 'Armour class'],
        ],
      },
      { key: 'mode', label: 'How', type: 'select', options: ADD_OR_SET },
      { key: 'value', label: 'Value', type: 'number' },
    ],
  },
  resource: {
    label: 'Spend or restore a resource',
    blank: { action: 'restore', resource: 'Hit Point Dice', amount: 1 },
    columns: [
      { key: 'action', label: 'Action', type: 'select', options: options(['spend', 'restore']) },
      { key: 'resource', label: 'Resource', type: 'text' },
      { key: 'amount', label: 'Amount', type: 'number' },
    ],
  },
  restore_body_part: { label: 'Restore a lost body part', blank: {}, columns: [] },
  check: {
    label: 'Require a check or save',
    blank: { roll: 'save', ability: 'con', dc: 13 },
    columns: [
      { key: 'roll', label: 'Roll', type: 'select', options: options(['check', 'save']) },
      { key: 'ability', label: 'Ability', type: 'select', options: ABILITY_OPTIONS },
      { key: 'dc', label: 'DC', type: 'number' },
    ],
  },
  text: {
    label: 'Something else (text only)',
    blank: { text: '' },
    columns: [{ key: 'text', label: 'What it does', type: 'text' }],
  },
};

// READING AND WRITING A FIELD BY ITS PATH ------------------------------------------------

type Tree = Record<string, unknown>;

export function getPath(tree: Tree, path: string): unknown {
  return path.split('.').reduce<unknown>((at, key) => (at as Tree | undefined)?.[key], tree);
}

/** A copy of the tree with one field changed. `undefined` removes it, and an object left with nothing goes too. */
export function setPath(tree: Tree, path: string, value: unknown): Tree {
  const [head, ...rest] = path.split('.');
  const copy = { ...tree };
  const next = rest.length ? setPath((tree[head] ?? {}) as Tree, rest.join('.'), value) : value;
  if (next === undefined || (rest.length > 0 && Object.keys(next as Tree).length === 0)) delete copy[head];
  else copy[head] = next;
  return copy;
}

const LABELS = new Map(
  Object.values(CUSTOM_FORMS).flatMap(sections => sections.flatMap(s => s.fields.map(f => [f.path, f.label] as const))),
);

/** A changed path in words: "Traits: Thorn Hide". */
export function pathLabel(path: string): string {
  const exact = LABELS.get(path);
  if (exact) return exact;
  const parts = path.split('.');
  for (let cut = parts.length - 1; cut > 0; cut--) {
    const label = LABELS.get(parts.slice(0, cut).join('.'));
    if (label) return `${label}: ${parts.slice(cut).join(' ')}`;
  }
  return path;
}
