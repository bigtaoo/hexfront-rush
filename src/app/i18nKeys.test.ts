import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AI_STYLES } from '../sim/ai';
import { QUESTS, RARITY, UNIT_KEYS } from '../sim/rules';
import { AI_SKILL_MAX } from '../sim/setup';
import { ACHIEVEMENTS } from './achievements';
import { CHAPTERS, SKIRMISH } from './campaign';
import { LOSS_TIPS } from './campaignUi';
import en from './lang/en';

// i18n.test.ts holds the twelve translations to the English table. Nothing held the English table
// to the game: `T('typo')` and `data-t="typo"` both fall back to the key itself (i18n.ts T), so a
// renamed or mistyped key does not throw and does not show English -- it prints "briefGaols" on
// the card, in every language at once. This reads the key out of every literal `T('...')` in the
// source and every data-t / data-ta in index.html, and asks the English table for it.

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function sources(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${f.name}`;
    if (f.isDirectory()) sources(p, out);
    else if (f.name.endsWith('.ts') && !f.name.endsWith('.test.ts') && !p.includes('/lang/')) out.push(p);
  }
  return out;
}

/** Every `T('key')` in the game's own code, with the file it is in. A key built from a template
 *  (`T(`ach_${k}`)`, `T('quest_' + k)`) is not read here -- the second block below builds those
 *  from the lists they are built from in the game. */
function literalKeys(): [string, string][] {
  const found: [string, string][] = [];
  for (const p of sources(`${ROOT}src`)) {
    const s = readFileSync(p, 'utf8');
    for (const m of s.matchAll(/\bT\(\s*'([A-Za-z_]\w*)'\s*[,)]/g)) found.push([m[1]!, p.slice(ROOT.length)]);
  }
  const html = readFileSync(`${ROOT}index.html`, 'utf8');
  for (const m of html.matchAll(/data-ta?="([^"]+)"/g)) found.push([m[1]!, 'index.html']);
  return found;
}

describe('the English table answers the game', () => {
  it('has a string for every key the code and the page ask for by name', () => {
    const table = en as Record<string, string>;
    const missing = [...new Set(literalKeys().filter(([k]) => table[k] === undefined).map(([k, p]) => `${k} (${p})`))];
    expect(missing).toEqual([]);
  });

  it('asks for a fair number of them, so a broken scan is not a green test', () => {
    expect(literalKeys().length).toBeGreaterThan(100);
  });
});

// The other half: the keys the game never writes out, because it builds them from a list -- the
// units, the rarities, the quests, the achievements, the chapters, the rival's five characters,
// the AI's skills, the losing tips. Add a unit or a chapter and the table needs a line for it; the
// game asks for one either way and, finding none, draws the key. These walk the same lists the
// game walks, so a list that grows fails here instead of on the card.
describe('the English table answers the lists the game builds keys from', () => {
  const table = en as Record<string, string>;
  const has = (k: string) => (table[k] === undefined ? k : null);
  const miss = (keys: string[]) => keys.map(has).filter((k): k is string => k !== null);
  const upto = (n: number) => [...Array(n).keys()];

  it('names every troop and every rarity', () => {
    expect(miss([...UNIT_KEYS.map((u) => `u_${u}`), ...RARITY.map((r) => `r_${r}`)])).toEqual([]);
  });

  it('names every quest', () => {
    expect(miss(QUESTS.map((q) => `quest_${q.id}`))).toEqual([]);
  });

  it('names and describes every achievement', () => {
    expect(miss(ACHIEVEMENTS.flatMap((a) => [`ach_${a}`, `ach_${a}_d`]))).toEqual([]);
  });

  it('names every chapter and gives it a tip', () => {
    expect(miss(CHAPTERS.flatMap((c) => [`ch_${c.key}`, `chtip_${c.key}`]))).toEqual([]);
  });

  it('names every rival: a character, a line and a style for each of the AI styles', () => {
    expect(miss(AI_STYLES.flatMap((_, i) => [`rv_n${i}`, `rv_q${i}`, `tw_style${i}`]))).toEqual([]);
  });

  it('names every AI skill the campaign can hand a stage', () => {
    expect(miss(upto(AI_SKILL_MAX + 1).map((i) => `tw_skill${i}`))).toEqual([]);
  });

  it('has the losing tip the loss count asks for', () => {
    expect(miss(upto(LOSS_TIPS).map((i) => `ltip${i}`))).toEqual([]);
  });

  // the difficulties are written out in index.html, one segment each, and boot.ts clamps the
  // chosen one to SKIRMISH: a fifth difficulty in the table would be a level nothing can pick
  it('gives the menu one difficulty segment per quick-match level', () => {
    const html = readFileSync(`${ROOT}index.html`, 'utf8');
    const seg = /<div class="seg" id="diffBtn"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';
    expect([...seg.matchAll(/data-d="(\d+)"/g)].map((m) => Number(m[1]))).toEqual(upto(SKIRMISH.length));
    expect(miss(upto(SKIRMISH.length).map((i) => `diff${i}`))).toEqual([]);
  });
});
