import { describe, expect, it } from 'vitest';

// Keeps the sim deterministic (after Potion Siege's determinismLint.test.ts): no call whose
// result can differ between JS engines or between runs, nothing from the host, no walk whose
// order is not part of the contract. Comments and strings are blanked before scanning, so prose
// quoting a rule does not trip it. Every non-test file under src/sim is scanned, so a new module
// cannot slip past it. The allowlist carries a reason per entry and must stay minimal: an
// exception that stops being needed fails the test.

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
  { pattern: /\/\s*FP\b/, why: 'division by FP leaves a float: use muldiv' },
  { pattern: /\bfromFp\s*\(/, why: 'fromFp is for the renderer' },
];

const ALLOWED: readonly { file: string; pattern: RegExp; why: string }[] = [
  { file: 'fixed.ts', pattern: /\bMath\.sqrt\s*\(/, why: 'first guess of isqrt, corrected to the exact integer root' },
  { file: 'fixed.ts', pattern: /\bfromFp\b.*\/\s*FP\b/, why: 'definition of the render-only helper' },
  { file: 'hash.ts', pattern: /\bObject\.keys\s*\(.*\.sort\(\s*\)/, why: 'the hash fixes key order itself (keys are plain identifiers)' },
];

/** Blanks comments and string literals, keeping line breaks so line numbers stay true. */
export function strip(src: string): string {
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
        if (src[i] === '\\') i++;
        out += src[i] === '\n' ? '\n' : ' ';
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
  .map((f) => ({ ...f, code: strip(f.text) }));

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
  });
});
