// P2-4: turns a class's SRD pages into a record. Two extractions of the same pages are used (see
// ../source/README.md): the flow text (`pdftotext`), which keeps paragraphs whole and words unbroken, for the
// Core Traits table and the feature descriptions; and the raw text (`pdftotext -raw`), which keeps each row of the
// class table on one line, for the table. Levels 1 to 3 only.
import type { ClassSource } from './classSources';
import type { SrdClass, SrdFeature } from './schemas';

const SOURCE = 'srd-5.2' as const;
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const MAX_LEVEL = 3;

const ABILITIES: Record<string, SrdClass['saveProficiencies'][number]> = {
  Strength: 'str',
  Dexterity: 'dex',
  Constitution: 'con',
  Intelligence: 'int',
  Wisdom: 'wis',
  Charisma: 'cha',
};
const SKILLS: Record<string, SrdClass['skillChoices']['from'][number]> = {
  Acrobatics: 'acrobatics',
  'Animal Handling': 'animalHandling',
  Arcana: 'arcana',
  Athletics: 'athletics',
  Deception: 'deception',
  History: 'history',
  Insight: 'insight',
  Intimidation: 'intimidation',
  Investigation: 'investigation',
  Medicine: 'medicine',
  Nature: 'nature',
  Perception: 'perception',
  Performance: 'performance',
  Persuasion: 'persuasion',
  Religion: 'religion',
  'Sleight of Hand': 'sleightOfHand',
  Stealth: 'stealth',
  Survival: 'survival',
};

/** "Strength and Constitution" -> ['str', 'con']; every word must be an ability. */
function abilityList(text: string) {
  return text.split(/, | and | or /).map(name => {
    const key = ABILITIES[name.trim()];
    if (!key) throw new Error(`"${name}" is not an ability`);
    return key;
  });
}

/** "Choose A or B: (A) Greataxe, 4 Handaxes, Explorer's Pack, and 15 GP; or (B) 75 GP" */
export function equipmentOptions(text: string) {
  const parts = text.replace(/^Choose [A-C](?:, [A-C])*,? or [A-C]: /, '').split(/(?:;? or |; )?\(([A-C])\) /);
  const out: { option: string; text: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) out.push({ option: parts[i], text: parts[i + 1].trim() });
  if (!out.length) throw new Error(`Unreadable equipment choice "${text}"`);
  return out;
}

const PAGE_FOOTER = 'System Reference Document 5.2.1';

/** A line of running text: it ends like a sentence and has at least six ordinary lower-case words. */
const isProse = (line: string) =>
  /[.:?!)”]$/.test(line) && line.split(' ').filter(w => /^[a-z’']{3,}[,.;:]?$/.test(w)).length >= 6;

/** The flow text without page numbers, page footers and the class table (which is read from the raw text). */
function cleanFlow(flow: string, tableTitle: string): string[] {
  // the PDF has the odd invisible soft hyphen (U+00AD) where a word may break ("Shortsword"); where the line did
  // break there, the flow text also adds a space after it ("Metam agic"), so both go
  const lines = flow.replace(/\f/g, '\n').replace(/­ */g, '').split('\n');
  const out: string[] = [];
  const nextText = (i: number) =>
    lines
      .slice(i + 1)
      .find(l => l.trim())
      ?.trim();
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // a page number is a line of digits followed by the page footer (or the end of the file)
    const pageNumber = /^\d+$/.test(line) && (nextText(i) === PAGE_FOOTER || nextText(i) === undefined);
    if (line === tableTitle) inTable = true;
    // the table ends at the page's number, or where prose resumes on the same page: a feature heading, or a line
    // that reads as a sentence (table leftovers such as "4 3 3 1—" or "+10 ft. +10 ft." never do)
    if (inTable && (/^Level \d+: /.test(line) || isProse(line))) inTable = false;
    if (inTable) {
      if (pageNumber) inTable = false;
      continue;
    }
    if (pageNumber || line === PAGE_FOOTER) continue;
    out.push(line);
  }
  return out;
}

/** Ordinary lower-case words in a line, a sign of running text rather than a title or table cell. */
const proseWords = (line: string) => line.split(' ').filter(w => /^[a-z’']{3,}[,.;:]?$/.test(w)).length;

/**
 * Paragraphs in the SRD's words: a line is a paragraph, unless a page or column broke it, which shows as a line
 * starting in lower case, or a line of running text that stops mid-sentence ("... Make a Dexterity (Sleight of" /
 * "Hand) check ...").
 */
function describe(lines: string[]): string {
  const paragraphs: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    const last = paragraphs[paragraphs.length - 1];
    // running text that stops on a lower-case word ("Sleight of"): titles and table cells end in capitals or numbers
    const brokenOff =
      last !== undefined && /\s[a-z’']+,?$/.test(last) && !last.startsWith('• ') && proseWords(last) >= 3;
    if (last !== undefined && (/^[a-z]/.test(line) || brokenOff)) paragraphs[paragraphs.length - 1] += ` ${line}`;
    else paragraphs.push(line);
  }
  return (
    paragraphs
      // an em dash broken at the end of a line picks up a space
      .map(p => p.replace(/— /g, '—'))
      // bullets that share a line get one each
      .map(p =>
        p.startsWith('• ')
          ? p
              .split(/ ?• /)
              .filter(Boolean)
              .map(b => `• ${b}`)
              .join('\n')
          : p,
      )
      // bullets on consecutive lines are one list
      .reduce<string[]>((out, p) => {
        if (p.startsWith('• ') && out[out.length - 1]?.startsWith('• ')) out[out.length - 1] += `\n${p}`;
        else out.push(p);
        return out;
      }, [])
      .join('\n\n')
  );
}

const TRAIT_LABELS = [
  'Primary Ability',
  'Hit Point Die',
  'Saving Throw Proficiencies',
  'Skill Proficiencies',
  'Weapon Proficiencies',
  'Tool Proficiencies',
  'Armor Training',
  'Starting Equipment',
];

function coreTraits(lines: string[], name: string): Record<string, string> {
  const start = lines.indexOf(`Core ${name} Traits`);
  const end = lines.findIndex((l, i) => i > start && l.startsWith(`Becoming a`));
  if (start < 0 || end < 0) throw new Error(`No Core ${name} Traits table`);
  const traits: Record<string, string> = {};
  let label: string | null = null;
  for (const line of lines.slice(start + 1, end).filter(Boolean)) {
    const found = TRAIT_LABELS.find(l => line === l || line.startsWith(`${l} `));
    if (found) {
      label = found;
      traits[label] = line.slice(found.length).trim();
    } else if (label) {
      traits[label] = `${traits[label]} ${line}`.trim();
    } else {
      throw new Error(`Unexpected line in the Core ${name} Traits table: "${line}"`);
    }
  }
  return traits;
}

const HEADING = /^Level (\d+): (.+)$/;

/** A paragraph that ends like a sentence; table leftovers in the flow text ("3", "Fly Speed", "No No Yes") do not. */
const SENTENCE_END = /[.:?!)”]$/;

/**
 * Tables inside a feature, such as Life Domain Spells or Wild Shape's Beast Shapes. The flow text breaks a table
 * into loose short paragraphs: from the title up to the next paragraph that ends like a sentence, they are removed
 * from the description, and the text on either side is kept. The rows are read from the raw text instead, where a
 * row starts with a number and may run onto the next line: its first cells are single words, the last one takes the
 * rest.
 */
function withTables(
  feature: SrdFeature,
  tables: NonNullable<ClassSource['tables']>[string] | undefined,
  rawText: string,
): SrdFeature {
  if (!tables) return feature;
  const titles = tables.map(t => t.title);
  let paragraphs = feature.description.split('\n\n');
  for (const title of titles) {
    const from = paragraphs.indexOf(title);
    if (from < 0) throw new Error(`${feature.name}: no "${title}" table in its text`);
    let to = from + 1;
    while (to < paragraphs.length && !SENTENCE_END.test(paragraphs[to]) && !titles.includes(paragraphs[to])) to++;
    paragraphs = [...paragraphs.slice(0, from), ...paragraphs.slice(to)];
  }
  const raw = rawText.split('\n').map(l => l.trim());
  const read = (table: (typeof tables)[number]) => {
    const start = raw.indexOf(table.title);
    if (start < 0) throw new Error(`${feature.name}: no "${table.title}" table in the raw text`);
    const n = table.columns.length;
    const rows: string[][] = [];
    for (const line of raw.slice(start + 1)) {
      if (HEADING.test(line) || line === PAGE_FOOTER || titles.includes(line)) break;
      const words = line.split(' ');
      if (/^\d+$/.test(words[0]) && words.length >= n)
        rows.push([...words.slice(0, n - 1), words.slice(n - 1).join(' ')]);
      else if (rows.length) rows[rows.length - 1][n - 1] += ` ${line}`;
    }
    if (!rows.length) throw new Error(`${feature.name}: the ${table.title} table has no rows`);
    return { title: table.title, columns: table.columns, rows };
  };
  return { ...feature, description: paragraphs.join('\n\n'), tables: tables.map(read) };
}

/** Every "Level N: Name" section between two lines, as features of level 1 to 3. */
function features(lines: string[], mechanics: ClassSource['mechanics'], where: string): SrdFeature[] {
  const out: SrdFeature[] = [];
  let current: { level: number; name: string; lines: string[] } | null = null;
  const close = () => {
    if (current && current.level <= MAX_LEVEL) {
      const m = mechanics[current.name];
      if (!m) throw new Error(`${where}: decide the mechanics of "${current.name}" in classSources.ts`);
      out.push({ level: current.level, name: current.name, description: describe(current.lines), mechanics: m });
    }
  };
  for (const line of lines) {
    const h = HEADING.exec(line);
    if (h) {
      close();
      current = { level: Number(h[1]), name: h[2], lines: [] };
    } else current?.lines.push(line);
  }
  close();
  return out;
}

/**
 * The spellcasting ability comes from the casting feature's own words ("Charisma is your spellcasting ability",
 * or for the Warlock's Pact Magic "Charisma is the spellcasting ability"); how spells are readied (prepared, known
 * or a spellbook) is set in classSources.ts.
 */
function spellcasting(source: ClassSource, classFeatures: SrdFeature[]): Pick<SrdClass, 'spellcasting'> {
  const text = classFeatures.find(f => f.name === (source.castingFeature ?? 'Spellcasting'))?.description;
  const m =
    text &&
    /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) is (?:your|the) spellcasting ability\b/.exec(
      text,
    );
  if (!!m !== !!source.preparation) {
    throw new Error(`${source.name}: a Spellcasting feature and a preparation setting go together`);
  }
  return m && source.preparation ? { spellcasting: { ability: ABILITIES[m[1]], preparation: source.preparation } } : {};
}

// a class table row: level, proficiency bonus, features, then n cells. A cell never holds a comma, so the first line
// of a row whose features run on ("2 +2 Monk’s Focus, Unarmored Movement,") is not mistaken for a whole row
const tail = (n: number) => new RegExp(`^(\\d{1,2}) \\+(\\d) (.+?)((?: [^\\s,]+){${n}})$`);

export function convertClass(source: ClassSource, flowText: string, rawText: string): SrdClass {
  const { name } = source;
  const lines = cleanFlow(flowText, `${name} Features`);
  // a sidebar box (e.g. "Breaking Your Oath") lands in the middle of whichever feature shares its page, sometimes in
  // the middle of a sentence: lift its lines out before paragraphs are made, so the sentence closes up again
  const sidebars: { title: string; text: string }[] = [];
  for (const s of source.sidebars ?? []) {
    const at = lines.indexOf(s.title);
    if (at < 0) throw new Error(`${name}: the "${s.title}" sidebar was not found`);
    const taken: number[] = [];
    for (let i = at + 1; i < lines.length && taken.length < s.paragraphs; i++) if (lines[i]) taken.push(i);
    sidebars.push({ title: s.title, text: taken.map(i => lines[i]).join('\n\n') });
    for (const i of [...taken].reverse()) lines.splice(i, 1);
    lines.splice(at, 1);
  }
  const traits = coreTraits(lines, name);
  for (const label of TRAIT_LABELS.filter(l => l !== 'Tool Proficiencies')) {
    if (!traits[label]) throw new Error(`${name}: no "${label}" in the Core Traits table`);
  }

  const hitDie = /^D(6|8|10|12) per .+ level$/.exec(traits['Hit Point Die']);
  if (!hitDie) throw new Error(`${name}: unreadable Hit Point Die "${traits['Hit Point Die']}"`);
  // "Choose 2: Animal Handling, Athletics, ..." or "Choose any 3 skills (see “Playing the Game”)"
  const skillText = traits['Skill Proficiencies'];
  const skills = /^Choose (\d+): (.+)$/.exec(skillText);
  const anySkills = /^Choose any (\d+) skills\b/.exec(skillText);
  if (!skills && !anySkills) throw new Error(`${name}: unreadable Skill Proficiencies "${skillText}"`);
  const skillCount = Number((skills ?? anySkills)![1]);
  const skillFrom = skills
    ? skills[2].split(/, or |, | or /).map(s => {
        const key = SKILLS[s.trim()];
        if (!key) throw new Error(`${name}: "${s}" is not a skill`);
        return key;
      })
    : Object.values(SKILLS);
  const armorText = traits['Armor Training'];
  const armorCategories = (['light', 'medium', 'heavy', 'shield'] as const).filter(c =>
    new RegExp(c === 'shield' ? '\\bShields\\b' : `\\b${c}\\b`, 'i').test(armorText),
  );

  // the class features run from "<Name> Class Features" to the subclass; the subclass follows
  const classStart = lines.indexOf(`${name} Class Features`);
  const subclassStart = lines.findIndex(l => l.startsWith(`${name} Subclass: `));
  if (classStart < 0 || subclassStart < 0) throw new Error(`${name}: class or subclass features not found`);
  const tables = source.tables ?? {};
  const classFeatures = features(lines.slice(classStart + 1, subclassStart), source.mechanics, name).map(f =>
    withTables(f, tables[f.name], rawText),
  );

  const subclassName = lines[subclassStart].slice(`${name} Subclass: `.length);
  // the subclass runs to the end of the pages, or to the next class's Core Traits table if it starts on the last page
  const nextClass = lines.findIndex((l, i) => i > subclassStart && /^Core .+ Traits$/.test(l));
  const subLines = lines.slice(subclassStart + 1, nextClass < 0 ? undefined : nextClass).filter(Boolean);
  const firstFeature = subLines.findIndex(l => HEADING.test(l));
  const subclass = {
    id: slug(subclassName),
    name: subclassName,
    tagline: subLines[0],
    description: describe(subLines.slice(1, firstFeature)),
    features: features(subLines.slice(firstFeature), source.mechanics, subclassName).map(f =>
      withTables(f, tables[f.name], rawText),
    ),
  };

  // the class table, from the raw text: one row per level, though a long Class Features cell can run onto the
  // next lines ("1 +2 Bardic Inspiration," / "Spellcasting" / "D6 2 4 2 — ...")
  const row = tail(source.columns.length);
  const rows: RegExpExecArray[] = [];
  let pending = '';
  for (const raw of rawText.split('\n')) {
    const line = raw.trim();
    if (/^\d{1,2} \+\d /.test(line)) {
      if (pending) throw new Error(`${name}: could not read the class table row "${pending}"`);
      pending = line;
    } else if (pending) pending += ` ${line}`;
    if (!pending) continue;
    // a distance such as "+10 ft." is one cell: hold it together while the row is split on spaces
    const m = row.exec(pending.replace(/(\d) ft\./g, '$1_ft.'));
    if (m) {
      if (Number(m[1]) <= MAX_LEVEL) rows.push(m);
      pending = '';
    }
  }
  if (rows.map(m => Number(m[1])).join() !== '1,2,3') throw new Error(`${name}: class table rows 1 to 3 not found`);
  const levels = rows.map(m => {
    const level = Number(m[1]);
    // a table cell can add a note to the feature's name, e.g. "Action Surge (one use)" for "Level 2: Action Surge"
    const names = m[3].split(', ').map(n => n.replace(/ \([^)]*\)$/, ''));
    const cells = m[4]
      .trim()
      .split(' ')
      .map(c => c.replace(/_ft\.$/, ' ft.'));
    const byName = (n: string) => classFeatures.find(f => f.level === level && f.name === n);
    for (const f of classFeatures.filter(f => f.level === level)) {
      if (!names.includes(f.name)) throw new Error(`${name}: ${f.name} is described but not in the level ${level} row`);
    }
    return {
      level,
      proficiencyBonus: Number(m[2]),
      features: names.map(n => {
        const f = byName(n);
        if (!f) throw new Error(`${name}: level ${level} lists "${n}" but no "Level ${level}: ${n}" section was found`);
        return f;
      }),
      columns: Object.fromEntries(
        source.columns.map((c, i) => [c.key, /^\d+$/.test(cells[i]) ? Number(cells[i]) : cells[i]]),
      ),
    };
  });

  return {
    id: source.id,
    name,
    source: SOURCE,
    primaryAbilityText: traits['Primary Ability'],
    primaryAbilities: abilityList(traits['Primary Ability']),
    hitDie: `d${hitDie[1]}` as SrdClass['hitDie'],
    saveProficiencies: abilityList(traits['Saving Throw Proficiencies']),
    skillChoices: { count: skillCount, from: skillFrom, text: skillText },
    weaponProficiencies: traits['Weapon Proficiencies'],
    ...(traits['Tool Proficiencies'] ? { toolProficiencies: traits['Tool Proficiencies'] } : {}),
    armorTraining: { text: armorText, categories: [...armorCategories] },
    startingEquipmentOptions: equipmentOptions(traits['Starting Equipment']),
    ...spellcasting(source, classFeatures),
    columns: source.columns,
    levels,
    subclasses: [subclass],
    ...(sidebars.length ? { sidebars } : {}),
  };
}
