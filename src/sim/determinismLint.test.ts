import { describe, expect, it } from 'vitest';

// Keeps the sim deterministic (after Potion Siege's determinismLint.test.ts): no call whose
// result can differ between JS engines or between runs, nothing from the host, no walk whose
// order is not part of the contract. Comments are blanked before scanning (and strings too, bar
// the colour lint, which is hunting for a literal), so prose quoting a rule does not trip it.
// Every non-test file under src/sim is scanned, so a new module cannot slip past it. The
// allowlist carries a reason per entry and must stay minimal: an exception that stops being
// needed fails the test.

const BANNED: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /\bMath\.random\s*\(/, why: 'use a Prng stream' },
  { pattern: /\bMath\.sqrt\s*\(/, why: 'use isqrt (fixed.ts)' },
  {
    pattern: /\bMath\.(?:sin|cos|tan|asin|acos|atan2?|hypot|log\d*|log1p|exp|expm1|pow|cbrt|sinh|cosh|tanh|fround)\s*\(/,
    why: 'transcendental: not bit-identical across engines',
  },
  { pattern: /\*\*/, why: 'exponentiation goes through pow: multiply instead' },
  { pattern: /\bDate\b|\bperformance\b|\bsetTimeout\b|\bsetInterval\b|\brequestAnimationFrame\b/, why: 'clocks: the sim only knows ticks' },
  { pattern: /\bwindow\b|\bdocument\b|\bnavigator\b|\blocalStorage\b/, why: 'browser: the sim runs headless' },
  { pattern: /\bfor\s*\(\s*(?:const|let|var)\s+\w+\s+in\b/, why: 'for..in: key order is not part of the contract' },
  { pattern: /\bObject\.(?:keys|values|entries)\s*\(/, why: 'walk an explicit list instead' },
  { pattern: /\.sort\(\s*\)/, why: 'sort() without a comparator compares as strings' },
  { pattern: /\btoFixed\b|\bparseFloat\b/, why: 'float formatting/parsing' },
  { pattern: /\/\s*FP\b/, why: 'division by FP leaves a float: that is the renderer business, use muldiv' },
];

const ALLOWED: readonly { file: string; pattern: RegExp; why: string }[] = [
  { file: 'fixed.ts', pattern: /\bMath\.sqrt\s*\(/, why: 'first guess of isqrt, corrected to the exact integer root' },
  { file: 'hash.ts', pattern: /\bObject\.keys\s*\(.*\.sort\(\s*\)/, why: 'the hash fixes key order itself (keys are plain identifiers)' },
];

/** Blanks comments, keeping line breaks so line numbers stay true. String literals are blanked
 *  too unless `keepStrings`: a lint hunting for a literal (the colour one below) needs the
 *  strings and only wants the prose out of the way. */
export function strip(src: string, keepStrings = false): string {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) out += src[i++] === '\n' ? '\n' : ' ';
      i++;
    } else if (c === "'" || c === '"' || c === '`') {
      out += c;
      for (i++; i < src.length && src[i] !== c; i++) {
        if (src[i] === '\\') {
          if (keepStrings) out += src[i];
          i++;
        }
        out += keepStrings ? src[i] : src[i] === '\n' ? '\n' : ' ';
      }
      out += c;
    } else out += c;
  }
  return out;
}

const sources = import.meta.glob<string>('./**/*.ts', { query: '?raw', import: 'default', eager: true });
const files = Object.entries(sources)
  .map(([path, text]) => ({ rel: path.slice(2), text }))
  .filter((f) => !f.rel.endsWith('.test.ts'))
  .map((f) => ({ ...f, code: strip(f.text), text: strip(f.text, true) }));

describe('determinism lint', () => {
  it('scans every sim source, tests aside', () => {
    const rels = files.map((f) => f.rel);
    for (const f of ['engine.ts', 'combat.ts', 'troops.ts', 'economy.ts', 'ai.ts', 'map.ts', 'prng.ts', 'fixed.ts', 'hash.ts']) expect(rels).toContain(f);
  });

  it('finds no banned call outside the allowlist', () => {
    const found: string[] = [];
    for (const f of files) {
      f.code.split('\n').forEach((line, i) => {
        for (const b of BANNED) {
          if (!b.pattern.test(line)) continue;
          if (ALLOWED.some((a) => a.file === f.rel && a.pattern.test(line))) continue;
          found.push(`${f.rel}:${i + 1} ${line.trim()}  (${b.why})`);
        }
      });
    }
    expect(found).toEqual([]);
  });

  it('names no colour: how a thing looks is the view layer business', () => {
    // The sim used to emit CSS colours with its burst events and keep the rarity palette in its
    // rules table. Colours belong to the view (view/viewConst.ts, renderer.ts BURST_COL); the sim
    // names the occasion (types.ts BurstKind) and the rarity, and the view decides how it looks.
    const COLOUR = /['"]#[0-9a-fA-F]{3,8}['"]|\brgba?\(/;
    const found = files.flatMap((f) =>
      f.text
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter((x) => COLOUR.test(x.line))
        .map((x) => `${f.rel}:${x.i + 1} ${x.line.trim()}`),
    );
    expect(found).toEqual([]);
  });

  it('imports nothing from outside the sim (no Pixi, no view code)', () => {
    const outside = files.flatMap((f) =>
      [...f.text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)]
        .map((m) => m[1]!)
        .filter((m) => !m.startsWith('./'))
        .map((m) => `${f.rel}: ${m}`),
    );
    expect(outside).toEqual([]);
  });

  it('keeps every allowlist entry in use', () => {
    for (const a of ALLOWED) expect(files.find((f) => f.rel === a.file)?.code).toMatch(a.pattern);
  });

  it('strips comments and strings but keeps code', () => {
    expect(strip("a(); // Math.random()\nb('Math.sqrt(')")).toBe("a(); \nb('          ')");
    expect(strip("a(); /* #fff */ b('#fff')", true)).toBe("a();        b('#fff')");
  });
});
