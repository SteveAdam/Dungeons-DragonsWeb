// P2-3: turns the SRD's own table text (../source) into records. Pure: text in, records out, so the build can
// check that the committed JSON is exactly what the SRD text gives.
import type { SrdArmor, SrdCurrency, SrdWeapon } from './schemas';

const SOURCE = 'srd-5.2' as const;
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const COIN = /^(CP|SP|EP|GP|PP)$/;

function parseCost(amount: string, coin: string) {
  if (!COIN.test(coin)) throw new Error(`Unknown coin ${coin}`);
  return { amount: Number(amount.replace(/,/g, '')), coin: coin.toLowerCase() as SrdWeapon['cost']['coin'] };
}

function parseWeight(text: string): number | null {
  if (text === '--') return null;
  const m = /^(\d+)(?:\/(\d+))? lb\.$/.exec(text);
  if (!m) throw new Error(`Unreadable weight "${text}"`);
  return m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
}

/** Splits "Ammunition (Range 80/320; Bolt), Loading, Two-Handed" on the commas outside brackets. */
function splitProperties(text: string): string[] {
  if (text === '--') return [];
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
    } else current += ch;
  }
  out.push(current.trim());
  return out;
}

const WEAPON_ROW =
  /^(.+?) (\d+d\d+|\d+) (Bludgeoning|Piercing|Slashing) (.+) (Cleave|Graze|Nick|Push|Sap|Slow|Topple|Vex) (--|[\d/]+ lb\.) ([\d,]+) (CP|SP|EP|GP|PP)$/;
const WEAPON_HEADING = /^(Simple|Martial) (Melee|Ranged) Weapons$/;

export function convertWeapons(text: string): SrdWeapon[] {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (!lines[0]?.startsWith('Name Damage Properties Mastery Weight Cost')) throw new Error('Not the Weapons table');
  let category: SrdWeapon['category'] | null = null;
  let kind: SrdWeapon['kind'] | null = null;
  const out: SrdWeapon[] = [];
  let pending = '';
  for (const line of lines.slice(1)) {
    const heading = WEAPON_HEADING.exec(line);
    if (heading) {
      category = heading[1].toLowerCase() as SrdWeapon['category'];
      kind = heading[2].toLowerCase() as SrdWeapon['kind'];
      continue;
    }
    // a row whose Properties run onto the next lines ends with its mastery, weight and cost
    pending = pending ? `${pending} ${line}` : line;
    const m = WEAPON_ROW.exec(pending.replace(/, (?=\S)/g, ', ').replace(/,\s+/g, ', '));
    if (!m) continue;
    pending = '';
    if (!category || !kind) throw new Error(`Weapon before any heading: ${line}`);
    const [, name, dice, type, propertiesText, mastery, weight, amount, coin] = m;
    const properties: SrdWeapon['properties'] = [];
    const notes: string[] = [];
    let versatileDice: string | undefined;
    let range: SrdWeapon['range'];
    let ammunition: SrdWeapon['ammunition'];
    for (const p of splitProperties(propertiesText)) {
      let x: RegExpExecArray | null;
      if ((x = /^Versatile \((\d+d\d+)\)$/.exec(p))) {
        properties.push('versatile');
        versatileDice = x[1];
      } else if ((x = /^Thrown \(Range (\d+)\/(\d+)\)$/.exec(p))) {
        properties.push('thrown');
        range = { normal: Number(x[1]), long: Number(x[2]) };
      } else if ((x = /^Ammunition \(Range (\d+)\/(\d+); (Arrow|Bolt|Bullet|Needle)\)$/.exec(p))) {
        properties.push('ammunition');
        range = { normal: Number(x[1]), long: Number(x[2]) };
        ammunition = x[3].toLowerCase() as SrdWeapon['ammunition'];
      } else if (p === 'Two-Handed (unless mounted)') {
        properties.push('two-handed');
        notes.push('Two-Handed unless mounted');
      } else if (/^(Finesse|Heavy|Light|Loading|Reach|Two-Handed)$/.test(p)) {
        properties.push(p.toLowerCase() as SrdWeapon['properties'][number]);
      } else {
        throw new Error(`Unknown weapon property "${p}" on ${name}`);
      }
    }
    out.push({
      id: slug(name),
      name,
      source: SOURCE,
      category,
      kind,
      damage: { dice, type: type.toLowerCase() as SrdWeapon['damage']['type'] },
      properties,
      ...(versatileDice ? { versatileDice } : {}),
      ...(range ? { range } : {}),
      ...(ammunition ? { ammunition } : {}),
      mastery: mastery.toLowerCase() as SrdWeapon['mastery'],
      weightLb: parseWeight(weight),
      cost: parseCost(amount, coin),
      propertiesText,
      ...(notes.length ? { notes } : {}),
    });
  }
  if (pending) throw new Error(`Could not read the weapon row "${pending}"`);
  return out;
}

const ARMOR_ROW =
  /^(.+?) (\d+(?: \+ Dex modifier(?: \(max 2\))?)?|\+2) (--|Str \d+) (--|Disadvantage) ([\d/]+ lb\.) ([\d,]+) (CP|SP|EP|GP|PP)$/;
const ARMOR_HEADING = /^(Light Armor|Medium Armor|Heavy Armor|Shield) \((.+)\)$/;
const CATEGORY: Record<string, SrdArmor['category']> = {
  'Light Armor': 'light',
  'Medium Armor': 'medium',
  'Heavy Armor': 'heavy',
  Shield: 'shield',
};

export function convertArmor(text: string): SrdArmor[] {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (!lines[0]?.startsWith('Armor Armor Class (AC) Strength Stealth Weight Cost'))
    throw new Error('Not the Armor table');
  let category: SrdArmor['category'] | null = null;
  let donDoff = '';
  return lines.slice(1).flatMap(line => {
    const heading = ARMOR_HEADING.exec(line);
    if (heading) {
      category = CATEGORY[heading[1]];
      donDoff = heading[2];
      return [];
    }
    const m = ARMOR_ROW.exec(line);
    if (!m || !category) throw new Error(`Could not read the armour row "${line}"`);
    const [, name, acText, strength, stealth, weight, amount, coin] = m;
    return [
      {
        id: slug(name),
        name,
        source: SOURCE,
        category,
        baseAc: Number(acText.replace('+', '').split(' ')[0]),
        acText,
        strength: strength === '--' ? null : Number(strength.slice(4)),
        stealthDisadvantage: stealth === 'Disadvantage',
        donDoff,
        weightLb: parseWeight(weight),
        cost: parseCost(amount, coin),
      },
    ];
  });
}

export function convertCurrency(text: string): SrdCurrency {
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const names = lines.find(l => l.startsWith('Coin Copper Piece'));
  const values = lines.find(l => l.startsWith('Value in GP '));
  if (!names || !values) throw new Error('Not the Coin Values table');
  const coins = [...names.slice('Coin '.length).matchAll(/([A-Z][a-z]+ Piece) \(([A-Z]{2})\)/g)];
  const worth = values.slice('Value in GP '.length).split(' ');
  if (coins.length !== worth.length)
    throw new Error('The Coin Values table has a different number of names and values');
  const perPound = /fifty coins weigh a pound/.test(text) ? 50 : null;
  if (!perPound) throw new Error('The coin weight sentence has changed');
  return {
    source: SOURCE,
    coins: coins.map(([, name, abbreviation], i) => {
      const [num, den = '1'] = worth[i].split('/');
      // value in copper = value in GP x 100; every SRD coin comes out whole
      const valueInCp = (Number(num) * 100) / Number(den);
      if (!Number.isInteger(valueInCp)) throw new Error(`${name} is not a whole number of copper pieces`);
      return {
        id: abbreviation.toLowerCase() as SrdCurrency['coins'][number]['id'],
        name,
        abbreviation,
        source: SOURCE,
        valueInGpText: worth[i],
        valueInCp,
      };
    }),
    coinsPerPound: perPound,
  };
}
