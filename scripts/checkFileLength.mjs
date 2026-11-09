// Fails if any file under src/, scripts/ or server/ is over MAX_LINES, test files included
// (CLAUDE.md "File size"). Split long files by what they do instead of raising the limit.
// Same check as D:\standing's build/checkFileLength.mjs, plus a baseline that can hold a file
// over the limit at its count while it waits to be split: such a file may shrink but never grow,
// its number goes down with every change that shortens it, and it leaves the list at MAX_LINES
// or under.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countLines, lengthErrors, MAX_LINES } from './fileLength.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIRS = ['src', 'scripts', 'server'];
const EXTS = ['.ts', '.mts', '.mjs', '.js', '.py', '.sh', '.css', '.html'];

// empty since 2026-10-19, when the files that were over the limit as the rule came in were split
const BASELINE = {};

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (EXTS.some((e) => name.endsWith(e))) yield p;
  }
}

function* counts() {
  for (const d of DIRS) {
    for (const file of walk(join(ROOT, d))) yield [relative(ROOT, file).split(sep).join('/'), countLines(readFileSync(file, 'utf8'))];
  }
}

const errors = lengthErrors(counts(), BASELINE);
if (errors.length) {
  console.error(`File length (max ${MAX_LINES} lines, CLAUDE.md "File size"):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
const left = Object.keys(BASELINE).length;
console.log(`file length ok (<= ${MAX_LINES} lines${left ? `; ${left} older files held at their baseline` : ''})`);
