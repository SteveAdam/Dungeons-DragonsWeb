// P2-5: turns the SRD's Spell Descriptions (pages 107 to 175) into records. The raw text (`pdftotext -raw`) gives
// each spell in reading order: its name, a heading line ("Level 2 Evocation (Wizard)" or "Evocation Cantrip
// (Sorcerer, Wizard)"), the Casting Time, Range, Components and Duration lines, then its text. The flow text
// (`pdftotext`) says where paragraphs end, and whether a word split at the end of a raw line is really hyphenated.
import { flowParagraphEnds } from './convertSpecies.ts';
import type { SrdSpell } from './schemas';

const SOURCE = 'srd-5.2' as const;
const PAGE_FOOTER = 'System Reference Document 5.2.1';
const SCHOOLS = 'Abjuration|Conjuration|Divination|Enchantment|Evocation|Illusion|Necromancy|Transmutation';
const HEADING = new RegExp(`^(?:Level (\\d) (${SCHOOLS})|(${SCHOOLS}) Cantrip)(?: \\((.*))?$`);
const FIELDS = ['Casting Time', 'Range', 'Components', 'Duration'] as const;
const ABILITIES = {
  Strength: 'str',
  Dexterity: 'dex',
  Constitution: 'con',
  Intelligence: 'int',
  Wisdom: 'wis',
  Charisma: 'cha',
} as const;
const DAMAGE = 'Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder';
/** A heading at the start of a paragraph: "Using a Higher-Level Spell Slot.", "Audible Alarm.", "Cantrip Upgrade." */
const PARAGRAPH_HEADING = /^[A-Z][\w’'-]*(?: (?:[A-Z0-9][\w’'-]*|a|an|of|the|to|and|or|in|on|with))*\. /;

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function rawLines(raw: string): string[] {
  const lines = raw
    .replace(/\u200b/g, '')
    .split('\n')
    .map(l => l.trim());
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === PAGE_FOOTER) {
      if (/^\d+$/.test(lines[i + 1] ?? '')) i++;
      continue;
    }
    if (lines[i]) out.push(lines[i]);
  }
  return out;
}

/**
 * Joins wrapped lines. A word split at the end of a line keeps its hyphen only where the flow text prints it
 * hyphenated ("10-foot-" + "radius"); otherwise the hyphen only marks the break ("sav-" + "ing").
 */
function joiner(flowWords: string) {
  return (lines: string[]) =>
    lines.reduce((text, line) => {
      if (!text) return line;
      // a number and its unit broken after the hyphen ("10-" + "foot radius") close up again
      if (/\d-$/.test(text)) return text + line;
      const split = /([A-Za-z]+)-$/.exec(text);
      if (split && /^[a-z]/.test(line)) {
        const next = /^[a-z]+/.exec(line)![0];
        return flowWords.includes(`${split[1]}-${next}`) ? text + line : text.slice(0, -1) + line;
      }
      return `${text} ${line}`;
    }, '');
}

export function convertSpells(rawText: string, flowText: string): SrdSpell[] {
  const lines = rawLines(rawText);
  const start = lines.indexOf('Spell Descriptions');
  if (start < 0) throw new Error('No "Spell Descriptions" in the spell pages');
  const body = lines.slice(start + 1);
  // the flow text with line breaks closed up, to look a hyphenated word up in
  const flowWords = flowText.replace(/\s*\n\s*/g, ' ');
  const join = joiner(flowWords);
  const ends = flowParagraphEnds(flowText);

  // a spell starts where a line is followed by a heading line
  const starts = body.flatMap((_, i) => (i > 0 && HEADING.test(body[i]) ? [i - 1] : []));
  return starts.map((at, n) => {
    const name = body[at];
    const lines = body.slice(at + 1, starts[n + 1] ?? body.length);

    // the heading, with its class list possibly running onto the next line
    let h = 0;
    let heading = lines[0];
    while (heading.includes('(') && !heading.endsWith(')')) heading = `${heading} ${lines[++h]}`;
    const m = HEADING.exec(heading)!;
    const level = m[1] ? Number(m[1]) : 0;
    const school = (m[2] ?? m[3]).toLowerCase() as SrdSpell['school'];
    const classes = m[4] ? m[4].replace(/\)$/, '').split(', ') : [];

    // Casting Time, Range, Components and Duration, each perhaps over two lines
    const fields: Record<string, string[]> = {};
    let i = h + 1;
    let current: string | null = null;
    for (; i < lines.length; i++) {
      // Barkskin's entry is printed "Component:"
      const label = /^(Casting Time|Range|Components?|Duration): /.exec(lines[i]);
      const f = label ? (label[1] === 'Component' ? 'Components' : (label[1] as (typeof FIELDS)[number])) : null;
      if (f && label) {
        current = f;
        fields[f] = [lines[i].slice(label[0].length)];
      } else if (current === 'Duration' || !current) break;
      else fields[current].push(lines[i]);
    }
    for (const f of FIELDS) if (!fields[f]) throw new Error(`${name}: no ${f}`);
    const field = (f: (typeof FIELDS)[number]) => join(fields[f]);

    // the text: a paragraph ends where the flow text ends a line with the same words, or before a heading
    const paragraphs: string[][] = [];
    for (const line of lines.slice(i)) {
      const last = paragraphs[paragraphs.length - 1];
      const ended = last && /[.:)”]$/.test(last[last.length - 1]) && endsHere(join(last), ends);
      if (!last || ended || (PARAGRAPH_HEADING.test(line) && /[.:)”]$/.test(last[last.length - 1])))
        paragraphs.push([]);
      paragraphs[paragraphs.length - 1].push(line);
    }
    const all = paragraphs.map(join);
    const upgrade = all.findIndex(p => /^(Using a Higher-Level Spell Slot|Cantrip Upgrade)\. /.test(p));
    const text = (upgrade < 0 ? all : all.slice(0, upgrade)).join('\n\n');
    const higherLevels = upgrade < 0 ? undefined : all.slice(upgrade).join('\n\n');

    const castingTime = field('Casting Time');
    const duration = field('Duration');
    const record: SrdSpell = {
      id: slug(name),
      name,
      source: SOURCE,
      level,
      school,
      castingTime,
      range: field('Range'),
      components: components(field('Components')),
      duration,
      concentration: /^Concentration, /.test(duration),
      ritual: /\bor Ritual$/.test(castingTime),
      classes,
      text,
      ...(higherLevels ? { higherLevels } : {}),
    };
    const mechanics = readMechanics(record);
    return mechanics ? { ...record, mechanics } : record;
  });
}

function endsHere(text: string, ends: Set<string>): boolean {
  const tail = text.slice(-40);
  for (const e of ends) if (text.endsWith(e) || e.endsWith(tail)) return true;
  return false;
}

/** "V, S, M (a diamond worth 300+ GP, which the spell consumes)" */
function components(text: string): SrdSpell['components'] {
  const m = /^(V)?(?:, )?(S)?(?:, )?(?:M \((.+)\))?$/.exec(text);
  if (!m || (!m[1] && !m[2] && !m[3])) throw new Error(`Unreadable components "${text}"`);
  const material = m[3];
  const cost = material && /worth ([\d,]+)\+? GP/.exec(material);
  return {
    v: !!m[1],
    s: !!m[2],
    m: !!material,
    ...(material ? { materialText: material } : {}),
    ...(cost ? { costGp: Number(cost[1].replace(/,/g, '')) } : {}),
    ...(material && /\bthe spell consumes\b/.test(material) ? { consumed: true } : {}),
  };
}

/**
 * Mechanics stated plainly in the text: a spell attack, a saving throw, one kind of damage or healing, and how they
 * grow. Anything less plain is left out, and the spell is text only.
 */
function readMechanics(s: SrdSpell): SrdSpell['mechanics'] | undefined {
  const out: NonNullable<SrdSpell['mechanics']> = {};
  if (/\bmake an? (?:melee|ranged) spell attack\b/i.test(s.text)) out.attack = true;

  const damage = [
    ...new Set([...s.text.matchAll(new RegExp(`(\\d+d\\d+) (${DAMAGE}) damage`, 'g'))].map(m => `${m[1]} ${m[2]}`)),
  ];
  const perSlotDamage =
    s.higherLevels && /damage increases by (\d+d\d+) for each spell slot level above/.exec(s.higherLevels);
  if (damage.length === 1) {
    const [dice, type] = damage[0].split(' ');
    out.damage = {
      dice,
      type: type.toLowerCase() as NonNullable<typeof out.damage>['type'],
      ...(perSlotDamage ? { perSlotLevel: perSlotDamage[1] } : {}),
    };
  }

  const saves = [
    ...new Set(
      [...s.text.matchAll(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/g)].map(
        m => m[1],
      ),
    ),
  ];
  if (saves.length === 1) {
    const onSuccess = /half as much damage/.test(s.text)
      ? 'half'
      : out.damage && /succeed on an? \w+ saving throw or take/.test(s.text) && !/successful save/i.test(s.text)
        ? 'none'
        : 'other';
    out.save = { ability: ABILITIES[saves[0] as keyof typeof ABILITIES], onSuccess };
  }

  const heal = /regains? (?:a number of )?Hit Points equal to (\d+d\d+) plus your spellcasting ability modifier/.exec(
    s.text,
  );
  const perSlotHeal =
    s.higherLevels && /healing increases by (\d+d\d+) for each spell slot level above/.exec(s.higherLevels);
  if (heal) {
    out.healing = { dice: heal[1], addAbilityModifier: true, ...(perSlotHeal ? { perSlotLevel: perSlotHeal[1] } : {}) };
  }

  // only a cantrip whose damage dice grow (other upgrades add beams, change the die or double the range)
  if (
    s.level === 0 &&
    /^Cantrip Upgrade\. The damage increases by \d+d\d+ when you reach levels 5/.test(s.higherLevels ?? '')
  ) {
    out.cantripScaling = true;
  }
  return Object.keys(out).length ? out : undefined;
}
