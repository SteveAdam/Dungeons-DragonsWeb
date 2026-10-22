// P2-4: turns the SRD's Background Descriptions (page 83) into records, with each background's Origin feat text from
// "Feats" (page 87). Both come from the raw text (`pdftotext -raw`), where each field starts a line; the feat text's
// paragraph ends come from the flow text, as for species.
import { equipmentOptions } from './convertClass.ts';
import { flowParagraphEnds, joinLines, paragraphs } from './convertSpecies.ts';
import type { SrdBackground } from './schemas';

const SOURCE = 'srd-5.2' as const;
const PAGE_FOOTER = 'System Reference Document 5.2.1';
const FIELDS = ['Ability Scores', 'Feat', 'Skill Proficiencies', 'Tool Proficiency', 'Equipment'] as const;

const ABILITIES: Record<string, SrdBackground['abilityScores'][number]> = {
  Strength: 'str',
  Dexterity: 'dex',
  Constitution: 'con',
  Intelligence: 'int',
  Wisdom: 'wis',
  Charisma: 'cha',
};
const SKILLS: Record<string, SrdBackground['skillProficiencies'][number]> = {
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

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const lines = (raw: string) =>
  raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && l !== PAGE_FOOTER && !/^\d+$/.test(l));

/** A benefit heading at the start of a line: capitalised words and a full stop, e.g. "Level 1 Spell. Choose ...". */
const BENEFIT = /^[A-Z][\w’']*(?: [A-Z0-9][\w’']*)*\. /;

/** An Origin feat's text: from the line after "<Name>" / "Origin Feat" to the next feat or section heading. */
function featText(featLines: string[], name: string, ends: Set<string>): string {
  const at = featLines.findIndex((l, i) => l === name && featLines[i + 1] === 'Origin Feat');
  if (at < 0) throw new Error(`No Origin feat called ${name} in "Feats"`);
  let end = at + 2;
  while (end < featLines.length && featLines[end + 1] !== 'Origin Feat' && featLines[end] !== 'General Feats') end++;
  // each benefit starts a paragraph with its heading ("Two Cantrips.", "Repeatable."); flow text runs some together
  const groups: string[][] = [];
  for (const line of featLines.slice(at + 2, end)) {
    if (!groups.length || BENEFIT.test(line)) groups.push([]);
    groups[groups.length - 1].push(line);
  }
  return groups.map(g => paragraphs(g, ends)).join('\n\n');
}

export function convertBackgrounds(originsRaw: string, featsRaw: string, featsFlow: string): SrdBackground[] {
  const all = lines(originsRaw);
  const from = all.indexOf('Background Descriptions');
  const to = all.indexOf('Character Species');
  if (from < 0 || to < from) throw new Error('No Background Descriptions in the origins pages');
  const block = all.slice(from + 1, to);
  const featLines = lines(featsRaw);
  const ends = flowParagraphEnds(featsFlow);

  // a background is its name followed by its "Ability Scores:" line
  const starts = block.flatMap((_, i) => (block[i + 1]?.startsWith('Ability Scores: ') ? [i] : []));
  return starts.map((start, n) => {
    const name = block[start];
    const body = block.slice(start + 1, starts[n + 1] ?? block.length);
    const fields: Record<string, string[]> = {};
    let current: string | null = null;
    for (const line of body) {
      const field = FIELDS.find(f => line.startsWith(`${f}: `));
      if (field) {
        current = field;
        fields[field] = [line.slice(field.length + 2)];
      } else if (current) fields[current].push(line);
      else throw new Error(`${name}: unexpected line "${line}"`);
    }
    const field = (f: (typeof FIELDS)[number]) => {
      if (!fields[f]) throw new Error(`${name}: no "${f}:" line`);
      return joinLines(fields[f]);
    };

    const abilityScores = field('Ability Scores')
      .split(', ')
      .map(a => {
        const key = ABILITIES[a];
        if (!key) throw new Error(`${name}: "${a}" is not an ability`);
        return key;
      });
    // "Magic Initiate (Cleric) (see “Feats”)": the feat is Magic Initiate, taken with the Cleric list
    const featName = field('Feat').replace(/ \(see “Feats”\)$/, '');
    const skillProficiencies = field('Skill Proficiencies')
      .split(' and ')
      .map(s => {
        const key = SKILLS[s];
        if (!key) throw new Error(`${name}: "${s}" is not a skill`);
        return key;
      });

    return {
      id: slug(name),
      name,
      source: SOURCE,
      abilityScores,
      originFeat: { name: featName, description: featText(featLines, featName.replace(/ \(.+\)$/, ''), ends) },
      skillProficiencies,
      toolProficiency: field('Tool Proficiency'),
      equipmentOptions: equipmentOptions(field('Equipment')),
    };
  });
}
