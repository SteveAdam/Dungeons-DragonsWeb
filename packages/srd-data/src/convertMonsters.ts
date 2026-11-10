// P3-4: turns the SRD's Monsters A-Z and Animals chapters (pages 258 to 364) into records. The raw text
// (`pdftotext -raw`) gives each stat block in reading order: its name, a size and type line, an AC line, then its
// labelled details up to the CR line, then the Traits, Actions, Bonus Actions, Reactions and Legendary Actions. The
// flow text (`pdftotext`) says where paragraphs end and which line-end hyphens are real. Anything the parser cannot
// read throws: a stat block is never guessed at.
import { joiner } from './convertSpells.ts';
import { flowParagraphEnds } from './convertSpecies.ts';
import type { SrdMonster } from './schemas';

const SOURCE = 'srd-5.2' as const;
const SIZES = 'Tiny|Small|Medium|Large|Huge|Gargantuan';
const SIZE_LINE = new RegExp(`^(${SIZES})(?: or (${SIZES}))? (.+?)(?: \\((.+)\\))?, (.+)$`);
const PAGE_FOOTER = /^(?:\d+ )?System Reference Document 5\.2\.1(?: \d+)?$/;
const SECTIONS = ['Traits', 'Actions', 'Bonus Actions', 'Reactions', 'Legendary Actions'] as const;
const DETAIL_LABELS = ['Skills', 'Vulnerabilities', 'Resistances', 'Immunities', 'Gear', 'Senses', 'Languages', 'CR'];
const DAMAGE_TYPES = new Set([
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
]);
const ABILITY_NAMES = {
  Strength: 'str',
  Dexterity: 'dex',
  Constitution: 'con',
  Intelligence: 'int',
  Wisdom: 'wis',
  Charisma: 'cha',
} as const;
/** An entry's bold name at the start of a line: "Multiattack. ", "Whirlwind (Recharge 4–6). ", "Eye Rays. ". */
const ENTRY_NAME =
  /^((?:[A-Z][\w'’-]*)(?: (?:[A-Z0-9][\w'’-]*|of|the|a|an|and|or|in|to|with|for|on|from|by|at))*)(?: \(([^)]*)\))?\.(?: |$)/;
/** Lines of a spell list, which stay on lines of their own inside the entry. */
const SPELL_LIST_LINE = /^(?:At Will|\d+\/Day(?: Each)?):/;
const SENTENCE_END = /[.:)”]$/;

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const integer = (text: string) => Number(text.replace(/[,−]/g, m => (m === '−' ? '-' : '')));
const list = (text: string) =>
  text
    .split(/, (?:and )?/)
    .map(v => v.trim())
    .filter(Boolean);

type Monster = SrdMonster;
type Entry = Monster['traits'][number];
type Attack = Monster['attacks'][number];

function pageLines(raw: string): string[] {
  return raw
    .replace(/\u200b/g, '')
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l && !PAGE_FOOTER.test(l));
}

/**
 * A heading printed between stat blocks ("Animated Objects", "Black Dragons"), or a chapter title. A comma means it
 * is the wrapped end of a spell list instead ("Image, Plane Shift"), which also has no full stop.
 */
const isHeadingLine = (line: string | undefined) =>
  !!line && !SENTENCE_END.test(line) && /^[A-Z]/.test(line) && !/[:,]/.test(line) && line.length < 50;

/** Reads the labelled details between the size line and the CR line. Each may run over several lines. */
function readDetails(name: string, lines: string[]) {
  const text = lines.join('\n').replace(/\n(?=Initiative )/, ' ');
  const out: Record<string, string> = {};
  const parts: { label: string; value: string[] }[] = [];
  for (const line of text.split('\n')) {
    const label = ['AC', 'HP', 'Speed', ...DETAIL_LABELS].find(l => line.startsWith(`${l} `));
    if (label) parts.push({ label, value: [line.slice(label.length + 1)] });
    else if (/^MOD SAVE/.test(line) || /^(Str|Int) \d/.test(line) || /^(Dex|Con|Wis|Cha) \d/.test(line)) continue;
    else if (!parts.length) throw new Error(`${name}: unreadable line "${line}"`);
    else parts[parts.length - 1].value.push(line);
  }
  for (const p of parts) out[p.label] = p.value.join(' ');
  return { details: out, abilities: text };
}

function readSpeeds(name: string, text: string): Monster['speeds'] {
  const speeds: Monster['speeds'] = {};
  for (const part of text.split(/, /)) {
    // "Climb or Fly 20 ft. (GM’s choice)" (Swarm of Insects): the choice stays in speedText
    if (/ or /.test(part) && /\(GM’s choice\)$/.test(part)) continue;
    const m = /^(?:(Burrow|Climb|Fly|Swim) )?(\d+) ft\.(?: \((.+)\))?$/.exec(part);
    if (!m) throw new Error(`${name}: unreadable speed "${part}" in "${text}"`);
    // a speed with a condition ("40 ft. (bear form only)") stays in speedText only
    if (m[3] && m[3] !== 'hover') continue;
    speeds[(m[1]?.toLowerCase() ?? 'walk') as 'walk'] = Number(m[2]);
    if (m[3]) speeds.hover = true;
  }
  return speeds;
}

/** "Poison, Thunder; Exhaustion, Grappled": damage types, then conditions; either half may stand alone. */
function readImmunities(text: string | undefined) {
  if (!text) return { damage: [] as string[], conditions: [] as string[] };
  const halves = text.split('; ');
  if (halves.length === 2) return { damage: list(halves[0]), conditions: list(halves[1]) };
  const all = list(text);
  return DAMAGE_TYPES.has(all[0].toLowerCase()) ? { damage: all, conditions: [] } : { damage: [], conditions: all };
}

/** Splits a section's lines into entries, each with its name, how often it can be used, and its text. */
function readEntries(
  lines: string[],
  join: (lines: string[]) => string,
  ends: Set<string>,
): { intro?: string; entries: Entry[] } {
  const blocks: { name: string; usage?: string; paragraphs: string[][] }[] = [];
  const introLines: string[] = [];
  lines.forEach((line, i) => {
    const previous = lines[i - 1];
    const name = ENTRY_NAME.exec(line);
    const startsEntry = name && (i === 0 || (previous !== undefined && SENTENCE_END.test(previous)));
    if (startsEntry) {
      blocks.push({
        name: name[1],
        ...(name[2] ? { usage: name[2] } : {}),
        paragraphs: [[line.slice(name[0].length)].filter(Boolean)],
      });
      return;
    }
    const block = blocks[blocks.length - 1];
    if (!block) {
      introLines.push(line);
      return;
    }
    const paragraph = block.paragraphs[block.paragraphs.length - 1];
    const text = join(paragraph);
    const flowEnded = [...ends].some(e => text.endsWith(e) || e.endsWith(text.slice(-40)));
    const newParagraph =
      SPELL_LIST_LINE.test(line) ||
      (SENTENCE_END.test(previous) && flowEnded && !/^(Success|Failure|Hit|Miss)\b/.test(line));
    if (newParagraph && paragraph.length) block.paragraphs.push([line]);
    else paragraph.push(line);
  });
  const entries = blocks.map(b => ({
    name: b.name,
    ...(b.usage ? { usage: b.usage } : {}),
    description: b.paragraphs
      .map(p => join(p))
      .reduce((text, p) => (!text ? p : SPELL_LIST_LINE.test(p) ? `${text}\n${p}` : `${text}\n\n${p}`), ''),
  }));
  return { ...(introLines.length ? { intro: join(introLines) } : {}), entries };
}

/** The damage in a clause: "12 (2d6 + 5) Bludgeoning damage plus 3 (1d6) Fire damage". An "or" alternative stops it. */
function readDamage(clause: string) {
  const first = clause.split(/,? or \d/)[0];
  const out: Attack['damage'] = [];
  for (const m of first.matchAll(/(\d+)(?: \(([^)]+)\))? ([A-Z][a-z]+) damage/g)) {
    if (DAMAGE_TYPES.has(m[3].toLowerCase())) {
      // minus signs are printed three ways: a hyphen, a minus (−) and, for the Jackal, an en dash
      out.push({
        average: Number(m[1]),
        dice: (m[2] ?? m[1]).replace(/[−–]/g, '-'),
        type: m[3].toLowerCase() as never,
      });
    }
  }
  return out;
}

/** The attacks directly readable from the text: an attack roll, or a saving throw with damage on a failure. */
function readAttacks(entries: Entry[]): Attack[] {
  const attacks: Attack[] = [];
  for (const entry of entries) {
    const limited = entry.usage ? ({ limited: true } as const) : {};
    const roll = /Attack Roll: \+(\d+)[^,.]*, (.+?)\.? Hit: (.+?)(?:\. |\.$|$)/s.exec(entry.description);
    if (roll) {
      attacks.push({
        name: entry.name,
        attackBonus: Number(roll[1]),
        reachOrRange: roll[2].endsWith('ft') ? `${roll[2]}.` : roll[2],
        damage: readDamage(roll[3]),
        ...limited,
      });
      continue;
    }
    const save = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw: DC (\d+)/.exec(
      entry.description,
    );
    if (save) {
      const failure = /Failure: (.+?)(?:\. |\.$|$)/s.exec(entry.description);
      const damage = failure ? readDamage(failure[1]) : [];
      if (damage.length) {
        attacks.push({
          name: entry.name,
          damage,
          saveDc: Number(save[2]),
          saveAbility: ABILITY_NAMES[save[1] as keyof typeof ABILITY_NAMES],
          ...limited,
        });
      }
    }
  }
  return attacks;
}

function readMonster(
  name: string,
  animal: boolean,
  lines: string[],
  join: (lines: string[]) => string,
  ends: Set<string>,
): Monster {
  const size = SIZE_LINE.exec(lines[0]);
  if (!size) throw new Error(`${name}: unreadable size line "${lines[0]}"`);
  const crAt = lines.findIndex(l => /^CR \d/.test(l));
  if (crAt < 0) throw new Error(`${name}: no CR line`);
  const { details, abilities } = readDetails(name, lines.slice(1, crAt + 1));

  const ac = /^(\d+)(?: \((.+?)\))?(?: Initiative ([+-−]\d+) \((\d+)\))?$/.exec(details.AC ?? '');
  const initiative = /Initiative ([+-−]\d+) \((\d+)\)/.exec(details.AC ?? '');
  if (!ac || !initiative) throw new Error(`${name}: unreadable AC "${details.AC}"`);
  const hp = /^(\d+)(?: \((.+)\))?$/.exec(details.HP ?? '');
  if (!hp) throw new Error(`${name}: unreadable HP "${details.HP}"`);
  // one block (Gold Dragon Wyrmling) prints "700 XP" instead of "XP 700"
  const cr = /^(\d+(?:\/\d+)?) \((?:XP )?([\d,]+)(?: XP)?(?:, or ([\d,]+) in lair)?; PB \+(\d+)\)$/.exec(
    details.CR ?? '',
  );
  if (!cr) throw new Error(`${name}: unreadable CR "${details.CR}"`);

  const scores: Record<string, number> = {};
  const saves: Record<string, number> = {};
  // the Adult White Dragon's Constitution is printed "Con22", without the space
  for (const m of abilities.matchAll(/\b(Str|Dex|Con|Int|Wis|Cha) ?(\d+) ([+-−]\d+) ([+-−]?\d+)/g)) {
    const key = m[1].toLowerCase();
    scores[key] = Number(m[2]);
    // the Young White Dragon's Intelligence save is printed "2" with its sign lost beside a modifier of −2
    const printed = /^\d/.test(m[4]) && m[4] === m[3].slice(1) ? m[3] : m[4];
    saves[key] = integer(printed.replace('+', ''));
  }
  if (Object.keys(scores).length !== 6) throw new Error(`${name}: read ${Object.keys(scores).length} ability scores`);

  const senses = (details.Senses ?? '').split('; ');
  const passive = /Passive Perception (\d+)/.exec(details.Senses ?? '');
  if (!passive) throw new Error(`${name}: no Passive Perception in "${details.Senses}"`);
  const immunities = readImmunities(details.Immunities);

  // the sections after the CR line
  const body = lines.slice(crAt + 1);
  const section: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of body) {
    if ((SECTIONS as readonly string[]).includes(line)) {
      current = line;
      section[line] = [];
    } else if (!current) throw new Error(`${name}: text before the first section: "${line}"`);
    else section[current].push(line);
  }
  const read = (s: (typeof SECTIONS)[number]) => readEntries(section[s] ?? [], join, ends);
  const traits = read('Traits').entries;
  const actions = read('Actions').entries;
  const bonusActions = read('Bonus Actions').entries;
  const reactions = read('Reactions').entries;
  const legendary = read('Legendary Actions');

  return {
    id: slug(name),
    name,
    source: SOURCE,
    category: animal ? 'animal' : 'monster',
    size: (size[2] ? [size[1], size[2]] : [size[1]]) as Monster['size'],
    creatureType: size[3],
    ...(size[4] ? { creatureTags: size[4] } : {}),
    alignment: size[5],
    armourClass: Number(ac[1]),
    ...(ac[2] ? { armourNote: ac[2] } : {}),
    initiative: { bonus: integer(initiative[1].replace('+', '')), score: Number(initiative[2]) },
    hitPoints: Number(hp[1]),
    hitDice: (hp[2] ?? hp[1]).replace(/−/g, '-'),
    speeds: readSpeeds(name, details.Speed ?? ''),
    speedText: details.Speed ?? '',
    abilityScores: scores as Monster['abilityScores'],
    saves: saves as Monster['saves'],
    skills: details.Skills
      ? list(details.Skills).map(s => {
          const m = /^(.+) ([+-−]\d+)$/.exec(s);
          if (!m) throw new Error(`${name}: unreadable skill "${s}"`);
          return { name: m[1], bonus: integer(m[2].replace('+', '')) };
        })
      : [],
    damageVulnerabilities: details.Vulnerabilities ? list(details.Vulnerabilities) : [],
    damageResistances: details.Resistances ? list(details.Resistances) : [],
    damageImmunities: immunities.damage,
    conditionImmunities: immunities.conditions,
    gear: details.Gear ? list(details.Gear) : [],
    senses: senses.filter(s => !s.startsWith('Passive Perception')).flatMap(list),
    passivePerception: Number(passive[1]),
    languages: details.Languages ?? 'None',
    challengeRating: cr[1],
    challengeValue: cr[1].includes('/') ? Number(cr[1].split('/')[0]) / Number(cr[1].split('/')[1]) : Number(cr[1]),
    xp: integer(cr[2]),
    ...(cr[3] ? { xpInLair: integer(cr[3]) } : {}),
    proficiencyBonus: Number(cr[4]),
    traits,
    actions,
    bonusActions,
    reactions,
    ...(legendary.intro ? { legendaryIntro: legendary.intro } : {}),
    legendaryActions: legendary.entries,
    attacks: readAttacks([...actions, ...bonusActions, ...reactions]),
  };
}

export function convertMonsters(rawText: string, flowText: string): SrdMonster[] {
  const lines = pageLines(rawText);
  const flow = flowText.replace(/\u200b/g, '');
  const join = joiner(flow.replace(/\s*\n\s*/g, ' '));
  const ends = flowParagraphEnds(flow);
  const animalsAt = lines.indexOf('Animals');
  if (animalsAt < 0) throw new Error('No "Animals" heading in the monster pages');

  const starts = lines.flatMap((_, i) =>
    SIZE_LINE.test(lines[i + 1] ?? '') && /^AC \d/.test(lines[i + 2] ?? '') ? [i] : [],
  );
  if (!starts.length) throw new Error('No stat blocks found');

  return starts.map((at, n) => {
    // the block ends where the headings above the next one's name begin
    let end = starts[n + 1] ?? lines.length;
    while (n + 1 < starts.length && end - 1 > at && isHeadingLine(lines[end - 1])) end--;
    return readMonster(lines[at], at > animalsAt, lines.slice(at + 1, end), join, ends);
  });
}
