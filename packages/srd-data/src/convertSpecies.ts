// P2-4: turns the SRD's species pages into records. Three extractions of the same pages are used (see
// ../source/README.md):
//   raw     (`pdftotext -raw`)     the text in reading order, one trait starting per line: traits and tables
//   flow    (`pdftotext`)          where a paragraph really ends
//   layout  (`pdftotext -layout`)  where one table cell ends and the next begins, by the gap between them
import type { SpeciesSource, SpeciesTable } from './speciesSources';
import type { SrdSpecies } from './schemas';

const SOURCE = 'srd-5.2' as const;
const PAGE_FOOTER = 'System Reference Document 5.2.1';

/** Raw lines without page footers, page numbers and zero-width spaces. */
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
    out.push(lines[i]);
  }
  return out;
}

/** "Black Acid Gold Fire" rows: the left pair of each line first, then the right pair. */
function readPairs(lines: string[], start: number) {
  let i = start + 2; // the title, then "Dragon Damage Type Dragon Damage Type"
  const left: string[][] = [];
  const right: string[][] = [];
  for (; i < lines.length && /^\S+ \S+ \S+ \S+$/.test(lines[i]); i++) {
    const [a, b, c, d] = lines[i].split(' ');
    left.push([a, b]);
    right.push([c, d]);
  }
  return { rows: [...left, ...right], end: i };
}

/** The Level 1 text of a lineage starts with one of these words; what comes before is the lineage's name. */
const LEVEL1_START = /^(.+?) (The|You|Your) (.*)$/;
const ROW_START = /^[A-Z][a-z]+(?: [A-Z][a-z]+)? (?:The|You|Your) /;

/**
 * A lineage table: each row is a name with its level 1 text over one or more lines, then a line with the level 3
 * and level 5 spells. Raw text runs those two spells together ("Detect Magic Misty Step"); the layout text keeps a
 * wide gap between them, which says where the first ends.
 */
function readLineage(lines: string[], start: number, layout: string, stop: (l: string) => boolean) {
  const rows: string[][] = [];
  let pending: string[] = [];
  let i = start + 2; // the title, then "Lineage Level 1 Level 3 Level 5"
  for (; i < lines.length && !stop(lines[i]); i++) {
    const line = lines[i];
    const words = line.split(' ');
    const splits = words
      .slice(1)
      .map((_, k) => [words.slice(0, k + 1).join(' '), words.slice(k + 1).join(' ')])
      .filter(([a, b]) => new RegExp(`${escape(a)} {2,}${escape(b)}(\\s|$)`, 'm').test(layout));
    if (splits.length === 1 && pending.length) {
      const m = LEVEL1_START.exec(pending.join(' '));
      if (!m) throw new Error(`Unreadable lineage row "${pending.join(' ')}"`);
      rows.push([m[1], `${m[2]} ${m[3]}`, splits[0][0], splits[0][1]]);
      pending = [];
      // the table ends unless another row starts: a one- or two-word name, then its level 1 text
      if (!ROW_START.test(lines[i + 1] ?? '')) return { rows, end: i + 1 };
    } else pending.push(line);
  }
  if (pending.length) throw new Error(`A lineage row has no spells: "${pending.join(' ')}"`);
  return { rows, end: i };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Joins wrapped lines, dropping the hyphen of a word split at the end of a line ("sav-" + "ing"). */
export function joinLines(lines: string[]): string {
  return lines.reduce((text, line) => {
    if (!text) return line;
    if (/[A-Za-z]-$/.test(text) && /^[a-z]/.test(line)) return text.slice(0, -1) + line;
    return `${text} ${line}`;
  }, '');
}

/** The flow text with each line's words, so a sentence end can be checked for a paragraph break after it. */
export const flowParagraphEnds = (flow: string) =>
  new Set(
    flow
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => l.slice(-40)),
  );

/**
 * Splits a trait's raw lines into paragraphs. A raw line ending a sentence ends a paragraph when the flow text
 * also ends a line with the same words.
 */
export function paragraphs(lines: string[], ends: Set<string>): string {
  const out: string[][] = [[]];
  for (const line of lines) {
    out[out.length - 1].push(line);
    const text = joinLines(out[out.length - 1]);
    if (/[.:)]$/.test(line) && [...ends].some(e => text.endsWith(e) || e.endsWith(text.slice(-40)))) out.push([]);
  }
  return out
    .filter(p => p.length)
    .map(joinLines)
    .join('\n\n');
}

const SIZES = ['Tiny', 'Small', 'Medium', 'Large'] as const;

export function convertSpecies(
  sources: SpeciesSource[],
  rawText: string,
  flowText: string,
  layoutText: string,
): SrdSpecies[] {
  let lines = rawLines(rawText);
  const begin = lines.indexOf('Species Descriptions');
  if (begin < 0) throw new Error('No "Species Descriptions" in the species pages');
  lines = lines.slice(begin + 1);

  const names = sources.map(s => s.name);
  const traitStart = (l: string) => sources.some(s => s.traits.some(t => l.startsWith(`${t}. `)));
  const isStop = (l: string) => names.includes(l) || traitStart(l) || l === PAGE_FOOTER;

  // cut every table out first: the SRD prints them where they fit, sometimes inside another species' text
  const tables = new Map<string, { title: string; columns: string[]; rows: string[][] }>();
  for (const s of sources) {
    for (const t of Object.values(s.tables ?? {}) as SpeciesTable[]) {
      const at = lines.indexOf(t.title);
      if (at < 0) throw new Error(`${s.name}: no "${t.title}" table`);
      const { rows, end } = t.kind === 'pairs' ? readPairs(lines, at) : readLineage(lines, at, layoutText, isStop);
      if (rows.some(r => r.length !== t.columns.length)) throw new Error(`${t.title}: a row has the wrong cell count`);
      tables.set(t.title, { title: t.title, columns: t.columns, rows });
      lines = [...lines.slice(0, at), ...lines.slice(end)];
    }
  }

  const ends = flowParagraphEnds(flowText.replace(/\u200b/g, ''));
  return sources.map((s, n) => {
    const start = lines.indexOf(s.name);
    const next = n + 1 < sources.length ? lines.indexOf(sources[n + 1].name) : lines.length;
    if (start < 0 || next < start) throw new Error(`${s.name}: not found in order`);
    const block = lines.slice(start + 1, next).filter(Boolean);

    // Creature Type, Size (perhaps over two lines) and Speed, then "As a <Name>, you have ... traits."
    const intro = block.findIndex(l => /^As an? .+ traits\.$/.test(l));
    if (intro < 0) throw new Error(`${s.name}: no "As a ${s.name}, you have ... traits." line`);
    const head = joinLines(block.slice(0, intro));
    const m = /^Creature Type: (.+?) Size: (.+?) Speed: (\d+) feet$/.exec(head);
    if (!m) throw new Error(`${s.name}: unreadable Creature Type, Size and Speed "${head}"`);
    const [, creatureType, sizeText, speed] = m;

    const body = block.slice(intro + 1);
    const traits = s.traits.map((name, t) => {
      const at = body.findIndex(l => l.startsWith(`${name}. `));
      const nextName = s.traits[t + 1];
      const until = nextName ? body.findIndex(l => l.startsWith(`${nextName}. `)) : body.length;
      if (at < 0 || until < at) throw new Error(`${s.name}: trait "${name}" not found in order`);
      const mechanics = s.mechanics[name];
      if (!mechanics) throw new Error(`${s.name}: decide the mechanics of "${name}" in speciesSources.ts`);
      const lines = [body[at].slice(name.length + 2), ...body.slice(at + 1, until)];
      const table = s.tables?.[name];
      return {
        name,
        description: paragraphs(lines, ends),
        mechanics,
        ...(table ? { tables: [tables.get(table.title)!] } : {}),
      };
    });
    if (body.findIndex(l => l.startsWith(`${s.traits[0]}. `)) !== 0) {
      throw new Error(`${s.name}: text before the first trait "${body[0]}"`);
    }

    return {
      id: s.id,
      name: s.name,
      source: SOURCE,
      creatureType,
      sizeText,
      sizeOptions: SIZES.filter(size => new RegExp(`\\b${size}\\b`).test(sizeText)).map(
        size => size.toLowerCase() as SrdSpecies['sizeOptions'][number],
      ),
      speed: Number(speed),
      traits,
    };
  });
}
