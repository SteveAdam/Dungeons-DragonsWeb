// P2-3: the shape of every SRD record. The JSON in ../data is checked against these at build time (pnpm build)
// and in the tests; the engine's own types (WeaponDef, ArmorDef) must accept the parsed records.
import { z } from 'zod';

/** Every record says where it came from. Only SRD 5.2 content (CC-BY-4.0) may be bundled. */
export const SOURCE = 'srd-5.2';

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are lower-case words joined by hyphens');
const coin = z.enum(['cp', 'sp', 'ep', 'gp', 'pp']);
const cost = z.object({ amount: z.number().positive(), coin }).strict();
/** null where the SRD shows "--" (the Sling). */
const weightLb = z.number().positive().nullable();
const dice = z.string().regex(/^(\d+d\d+|\d+)$/, 'dice look like 1d8, or a flat number');

export const weaponSchema = z
  .object({
    id,
    name: z.string().min(1),
    source: z.literal(SOURCE),
    category: z.enum(['simple', 'martial']),
    kind: z.enum(['melee', 'ranged']),
    damage: z.object({ dice, type: z.enum(['bludgeoning', 'piercing', 'slashing']) }).strict(),
    properties: z.array(
      z.enum(['ammunition', 'finesse', 'heavy', 'light', 'loading', 'reach', 'thrown', 'two-handed', 'versatile']),
    ),
    versatileDice: dice.optional(),
    range: z.object({ normal: z.number().int().positive(), long: z.number().int().positive() }).strict().optional(),
    ammunition: z.enum(['arrow', 'bolt', 'bullet', 'needle']).optional(),
    mastery: z.enum(['cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex']),
    weightLb,
    cost,
    /** The Properties column exactly as the SRD prints it, for checking by eye. */
    propertiesText: z.string(),
    notes: z.array(z.string()).optional(),
  })
  .strict()
  .superRefine((w, ctx) => {
    const has = (p: string) => w.properties.includes(p as never);
    if (has('versatile') !== !!w.versatileDice)
      ctx.addIssue({ code: 'custom', message: 'versatile needs versatileDice, and only versatile has it' });
    if ((has('thrown') || has('ammunition')) !== !!w.range)
      ctx.addIssue({ code: 'custom', message: 'thrown and ammunition weapons, and only they, have a range' });
    if (has('ammunition') !== !!w.ammunition)
      ctx.addIssue({ code: 'custom', message: 'ammunition weapons, and only they, name their ammunition' });
    if (w.range && w.range.long < w.range.normal)
      ctx.addIssue({ code: 'custom', message: 'long range is shorter than normal range' });
  });

export const armorSchema = z
  .object({
    id,
    name: z.string().min(1),
    source: z.literal(SOURCE),
    category: z.enum(['light', 'medium', 'heavy', 'shield']),
    /** Base armour class; for a shield, the bonus it adds. */
    baseAc: z.number().int().positive(),
    /** The Armor Class column exactly as printed, e.g. "12 + Dex modifier (max 2)". */
    acText: z.string(),
    strength: z.number().int().positive().nullable(),
    stealthDisadvantage: z.boolean(),
    /** e.g. "1 Minute to Don or Doff". */
    donDoff: z.string(),
    weightLb,
    cost,
  })
  .strict();

export const coinSchema = z
  .object({
    id: coin,
    name: z.string(),
    abbreviation: z.string().regex(/^[A-Z]{2}$/),
    source: z.literal(SOURCE),
    /** Its worth in gold pieces as the SRD prints it, e.g. "1/100". */
    valueInGpText: z.string(),
    valueInCp: z.number().int().positive(),
  })
  .strict();

export const currencySchema = z
  .object({
    source: z.literal(SOURCE),
    coins: z.array(coinSchema).length(5),
    coinsPerPound: z.number().int().positive(),
  })
  .strict();

export type SrdWeapon = z.infer<typeof weaponSchema>;
export type SrdArmor = z.infer<typeof armorSchema>;
export type SrdCoin = z.infer<typeof coinSchema>;
export type SrdCurrency = z.infer<typeof currencySchema>;

// P2-4: classes, species and backgrounds, levels 1 to 3. Text is kept in the SRD's own words.

const ability = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);
const skill = z.enum([
  'acrobatics',
  'animalHandling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleightOfHand',
  'stealth',
  'survival',
]);
/** 'later': the feature has game mechanics the app does not run yet (listed in docs/features-pending.md). */
const mechanics = z.enum(['later', 'none']);
const option = z.object({ option: z.string().regex(/^[A-C]$/), text: z.string().min(1) }).strict();

export const featureSchema = z
  .object({
    level: z.number().int().min(1).max(3),
    name: z.string().min(1),
    /** Paragraphs separated by a blank line; bullet lines start with "• ". */
    description: z.string().min(1),
    mechanics,
    /** Tables inside the feature, e.g. Life Domain Spells or Beast Shapes: one row per level. */
    tables: z
      .array(
        z
          .object({ title: z.string(), columns: z.array(z.string()).min(2), rows: z.array(z.array(z.string())).min(1) })
          .strict()
          .refine(t => t.rows.every(r => r.length === t.columns.length), 'every row has a cell per column'),
      )
      .min(1)
      .optional(),
  })
  .strict();

export const classSchema = z
  .object({
    id,
    name: z.string().min(1),
    source: z.literal(SOURCE),
    primaryAbilityText: z.string(),
    primaryAbilities: z.array(ability).min(1),
    hitDie: z.enum(['d6', 'd8', 'd10', 'd12']),
    saveProficiencies: z.array(ability).length(2),
    skillChoices: z
      .object({
        count: z.number().int().positive(),
        from: z.array(skill).min(1),
        /** As printed, e.g. "Choose any 3 skills (see “Playing the Game”)". */
        text: z.string(),
      })
      .strict(),
    weaponProficiencies: z.string(),
    toolProficiencies: z.string().optional(),
    armorTraining: z
      .object({ text: z.string(), categories: z.array(z.enum(['light', 'medium', 'heavy', 'shield'])) })
      .strict(),
    startingEquipmentOptions: z.array(option).min(1),
    spellcasting: z
      .object({ ability, preparation: z.enum(['prepared', 'known', 'spellbook']) })
      .strict()
      .optional(),
    /** The extra columns of the class table, in the SRD's order, e.g. Rages, Rage Damage, Weapon Mastery. */
    columns: z.array(z.object({ key: z.string(), label: z.string() }).strict()),
    levels: z
      .array(
        z
          .object({
            level: z.number().int().min(1).max(3),
            proficiencyBonus: z.number().int().min(2),
            features: z.array(featureSchema),
            columns: z.record(z.union([z.number(), z.string()])),
          })
          .strict(),
      )
      .length(3),
    /** The SRD's sidebar boxes in the class's pages, e.g. "Breaking Your Oath". */
    sidebars: z.array(z.object({ title: z.string(), text: z.string().min(1) }).strict()).optional(),
    subclasses: z
      .array(
        z
          .object({
            id,
            name: z.string(),
            tagline: z.string(),
            description: z.string(),
            features: z.array(featureSchema),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((c, ctx) => {
    c.levels.forEach((l, i) => {
      if (l.level !== i + 1) ctx.addIssue({ code: 'custom', message: `levels must run 1, 2, 3 (found ${l.level})` });
      for (const col of c.columns) {
        if (!(col.key in l.columns)) ctx.addIssue({ code: 'custom', message: `level ${l.level} has no ${col.label}` });
      }
      for (const f of l.features) {
        if (f.level !== l.level) ctx.addIssue({ code: 'custom', message: `${f.name} is filed under the wrong level` });
      }
    });
  });

export const speciesSchema = z
  .object({
    id,
    name: z.string().min(1),
    source: z.literal(SOURCE),
    creatureType: z.string(),
    sizeText: z.string(),
    sizeOptions: z.array(z.enum(['tiny', 'small', 'medium', 'large'])).min(1),
    speed: z.number().int().positive(),
    traits: z.array(featureSchema.omit({ level: true })),
    languages: z.string().optional(),
  })
  .strict();

export const backgroundSchema = z
  .object({
    id,
    name: z.string().min(1),
    source: z.literal(SOURCE),
    /** The three abilities: +2 to one and +1 to another, or +1 to all three; never above 20. */
    abilityScores: z.array(ability).length(3),
    originFeat: z.object({ name: z.string(), description: z.string().optional() }).strict(),
    skillProficiencies: z.array(skill).length(2),
    toolProficiency: z.string(),
    equipmentOptions: z.array(option).min(1),
  })
  .strict();

export type SrdFeature = z.infer<typeof featureSchema>;
export type SrdClass = z.infer<typeof classSchema>;
export type SrdSpecies = z.infer<typeof speciesSchema>;
export type SrdBackground = z.infer<typeof backgroundSchema>;
