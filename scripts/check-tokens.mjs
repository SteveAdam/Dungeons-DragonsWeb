#!/usr/bin/env node
// P0-3: colours live in apps/web/src/styles/tokens.css only. This fails if any other CSS file contains a hex colour.
//
//   pnpm check:tokens
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOTS = ['apps/web/src', 'packages'];
const ALLOWED = join('apps', 'web', 'src', 'styles', 'tokens.css');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo']);
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

function* cssFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* cssFiles(path);
    } else if (name.endsWith('.css')) {
      yield path;
    }
  }
}

const problems = [];
for (const root of ROOTS) {
  for (const file of cssFiles(root)) {
    if (relative('.', file) === ALLOWED) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const match of line.matchAll(HEX)) problems.push(`${file.split(sep).join('/')}:${i + 1}  ${match[0]}`);
      });
  }
}

if (problems.length) {
  console.error(`Hex colours found outside ${ALLOWED.split(sep).join('/')} (use a token instead):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('check:tokens: no hex colours outside tokens.css');
