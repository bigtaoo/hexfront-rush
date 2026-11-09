// Determinism lint for js/sim (after Holy Kicker's tools/determinism-lint).
// The sim must be a pure function of (config, commands). This bans the usual ways a float, the
// clock or an unordered walk sneaks in. A line may opt out with a trailing or preceding
// `// determinism-lint: allow -- <reason>` comment, and only lines listed in ALLOWED may do so.
//   node tools/lint-sim.js
const fs = require('fs'), path = require('path');

const DIR = path.join(__dirname, '..', 'js', 'sim');
const BANNED = [
  [/Math\.random\b/, 'Math.random: use a Prng stream'],
  [/\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame/, 'clock/timers: the sim only knows ticks'],
  [/Math\.(sin|cos|tan|atan2?|asin|acos|exp|log\d*|pow|hypot|cbrt|sinh|cosh|tanh|fround)\b/, 'transcendental Math: not bit-exact across engines'],
  [/Math\.sqrt\b/, 'Math.sqrt: use isqrt'],
  [/\*\*/, '** operator: use integer multiplication'],
  [/\bfor\s*\(\s*(const|let|var)\s+\w+\s+in\b/, 'for..in: key order is not part of the contract'],
  [/Object\.(keys|values|entries)\b/, 'Object.keys/values/entries: walk an explicit list instead'],
  [/\.sort\(\s*\)/, 'sort() without a comparator compares as strings'],
  [/\bwindow\b|\bdocument\b|localStorage|navigator\b/, 'DOM/browser globals: the sim runs headless'],
  [/\/\s*FP\b(?!\s*\))/, 'division by FP leaves a float: use muldiv or fromFp (render only)'],
  [/\bfromFp\(/, 'fromFp is for the renderer'],
  [/toFixed|parseFloat/, 'float formatting/parsing'],
];
// file:line-fragment pairs allowed to carry the opt-out comment, with the reason they are safe
const ALLOWED = [
  ['fixed.js', 'Math.floor(Math.sqrt(n))', 'isqrt seeds from sqrt and corrects with integer loops'],
  ['fixed.js', 'function fromFp', 'definition of the render-only helper'],
  ['hash.js', 'Object.keys(v).sort()', 'the hash fixes key order itself'],
  ['rules.js', 'Object.keys', 'never'],
];
// load-time conversions (design floats -> integers) are fine: they run once, identically everywhere
const LOAD_TIME_OK = [/Math\.round\(/, /\bticks\(|\bperTick\(|\btoFp\(/];

let bad = 0;
for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.js')).sort()) {
  const text = fs.readFileSync(path.join(DIR, f), 'utf8');
  const lines = text.split('\n');
  // blank out block comments, keeping line numbers
  const code = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).split('\n');
  lines.forEach((raw, i) => {
    const line = code[i].replace(/\/\/.*$/, '').replace(/'(?:[^'\\]|\\.)*'/g, "''");   // code only
    if (!line.trim()) return;
    for (const [re, why] of BANNED) {
      if (!re.test(line)) continue;
      const optOut = /determinism-lint: allow/.test(raw) || (i > 0 && /determinism-lint: allow/.test(lines[i - 1]));
      const allowed = ALLOWED.some(([af, frag]) => af === f && raw.includes(frag) && frag !== 'Object.keys');
      if (allowed) continue;
      if (optOut) { console.log(f + ':' + (i + 1) + '  opt-out not in ALLOWED: ' + raw.trim()); bad++; continue; }
      if (LOAD_TIME_OK.some((r) => r.test(line)) && /^\s*(const|[A-Z_]+\s*[:=]|\w+:)/.test(line) && !/Math\.(random|sqrt)/.test(line)) continue;
      console.log(f + ':' + (i + 1) + '  ' + why + '\n    ' + raw.trim());
      bad++;
    }
  });
}
console.log(bad ? bad + ' determinism problem(s)' : 'determinism lint: clean');
process.exit(bad ? 1 : 0);
