// P1-7 acceptance 5: no component or page under apps/web does rules maths. The rules live in
// packages/rules-engine; screens only show what it returns. This test fails if a familiar formula appears.
import { describe, expect, it } from 'vitest';

// every component and page, as text (Vite reads them at test time)
const SOURCES = import.meta.glob(['./components/**/*.{ts,tsx}', './pages/**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const FORMULAS: { name: string; pattern: RegExp }[] = [
  { name: 'ability modifier: (score - 10) / 2', pattern: /\(\s*[\w.[\]]+\s*-\s*10\s*\)\s*\/\s*2/ },
  { name: 'proficiency bonus: 2 + floor((level - 1) / 4)', pattern: /\(\s*[\w.]*level[\w.]*\s*-\s*1\s*\)\s*\/\s*4/i },
  { name: 'd20 odds: (21 - needed) / 20', pattern: /\(\s*21\s*-/ },
  { name: 'advantage: 1 - (1 - p)^2', pattern: /1\s*-\s*\(\s*1\s*-\s*[\w.]+\s*\)\s*(\*\*|\*)/ },
  { name: 'success test: roll + bonus >= dc', pattern: /\+\s*[\w.]*bonus\s*>=\s*[\w.]*(dc|target|ac)\b/i },
  { name: 'level from an XP table', pattern: /xp\s*>=\s*[\w.]*(TABLE|THRESHOLDS)/i },
];

describe('no rules maths in components (P1-7)', () => {
  const scanned = Object.keys(SOURCES);

  it('scans the components and pages', () => {
    expect(scanned.length).toBeGreaterThan(20);
  });

  it.each(FORMULAS)('nothing computes $name', ({ pattern }) => {
    const hits = scanned.filter(f => pattern.test(SOURCES[f]));
    expect(hits).toEqual([]);
  });

  it('the guard itself works: it catches a modifier formula', () => {
    expect(FORMULAS[0].pattern.test('const mod = Math.floor((score - 10) / 2);')).toBe(true);
    expect(FORMULAS[2].pattern.test('const p = (21 - (dc - bonus)) / 20;')).toBe(true);
  });
});
