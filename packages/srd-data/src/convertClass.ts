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

/** The flow text without page numbers, page footers and the class table (which is read from the raw text). */
function cleanFlow(flow: string, tableTitle: string): string[] {
  const lines = flow.replace(/\f/g, '\n').split('\n');
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
    if (inTable) {
      if (pageNumber) inTable = false;
      continue;
    }
    if (pageNumber || line === PAGE_FOOTER) continue;
    out.push(line);
  }
  return out;
}

/** Paragraphs in the SRD's words: a line is a paragraph, unless it starts in lower case (broken by a page). */
function describe(lines: string[]): string {
  const paragraphs: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (/^[a-z]/.test(line) && paragraphs.length) paragraphs[paragraphs.length - 1] += ` ${line}`;
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

const tail = (n: number) => new RegExp(`^(\\d{1,2}) \\+(\\d) (.+?)((?: \\S+){${n}})$`);

export function convertClass(source: ClassSource, flowText: string, rawText: string): SrdClass {
  const { name } = source;
  const lines = cleanFlow(flowText, `${name} Features`);
  const traits = coreTraits(lines, name);
  for (const label of TRAIT_LABELS.filter(l => l !== 'Tool Proficiencies')) {
    if (!traits[label]) throw new Error(`${name}: no "${label}" in the Core Traits table`);
  }

  const hitDie = /^D(6|8|10|12) per .+ level$/.exec(traits['Hit Point Die']);
  if (!hitDie) throw new Error(`${name}: unreadable Hit Point Die "${traits['Hit Point Die']}"`);
  const skills = /^Choose (\d+): (.+)$/.exec(traits['Skill Proficiencies']);
  if (!skills) throw new Error(`${name}: unreadable Skill Proficiencies "${traits['Skill Proficiencies']}"`);
  const skillFrom = skills[2].split(/, or |, | or /).map(s => {
    const key = SKILLS[s.trim()];
    if (!key) throw new Error(`${name}: "${s}" is not a skill`);
    return key;
  });
  const armorText = traits['Armor Training'];
  const armorCategories = (['light', 'medium', 'heavy', 'shield'] as const).filter(c =>
    new RegExp(c === 'shield' ? '\\bShields\\b' : `\\b${c}\\b`, 'i').test(armorText),
  );

  // the class features run from "<Name> Class Features" to the subclass; the subclass follows
  const classStart = lines.indexOf(`${name} Class Features`);
  const subclassStart = lines.findIndex(l => l.startsWith(`${name} Subclass: `));
  if (classStart < 0 || subclassStart < 0) throw new Error(`${name}: class or subclass features not found`);
  const classFeatures = features(lines.slice(classStart + 1, subclassStart), source.mechanics, name);

  const subclassName = lines[subclassStart].slice(`${name} Subclass: `.length);
  const subLines = lines.slice(subclassStart + 1).filter(Boolean);
  const firstFeature = subLines.findIndex(l => HEADING.test(l));
  const subclass = {
    id: slug(subclassName),
    name: subclassName,
    tagline: subLines[0],
    description: describe(subLines.slice(1, firstFeature)),
    features: features(subLines.slice(firstFeature), source.mechanics, subclassName),
  };

  // the class table, from the raw text: one row per level
  const row = tail(source.columns.length);
  const rows = rawText
    .split('\n')
    .map(l => row.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m && Number(m[1]) <= MAX_LEVEL);
  if (rows.map(m => Number(m[1])).join() !== '1,2,3') throw new Error(`${name}: class table rows 1 to 3 not found`);
  const levels = rows.map(m => {
    const level = Number(m[1]);
    const names = m[3].split(', ');
    const cells = m[4].trim().split(' ');
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
    skillChoices: { count: Number(skills[1]), from: skillFrom },
    weaponProficiencies: traits['Weapon Proficiencies'],
    ...(traits['Tool Proficiencies'] ? { toolProficiencies: traits['Tool Proficiencies'] } : {}),
    armorTraining: { text: armorText, categories: [...armorCategories] },
    startingEquipmentOptions: equipmentOptions(traits['Starting Equipment']),
    ...(source.spellcasting ? { spellcasting: source.spellcasting } : {}),
    columns: source.columns,
    levels,
    subclasses: [subclass],
  };
}
