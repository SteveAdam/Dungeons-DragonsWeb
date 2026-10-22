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
