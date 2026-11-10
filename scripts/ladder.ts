// `npm run ladder`: how the AI's skill levels (ai.ts AI_SKILLS) stand against each other.
// Every pair plays the same seeds twice, colours swapped, so neither side's map decides it.
//   npm run ladder                 every level against the standard one (3)
//   npm run ladder -- 0 3 40       level 0 against level 3, 40 seeds
//   npm run ladder -- all 20       the whole table, 20 seeds a pair
//   npm run ladder -- styles 30    each AI style against the balanced one (all level 3)

import { AI_STYLES } from '../src/sim/ai';
import { AI_SKILL_MAX, AI_SKILL_STD, type SideSetup } from '../src/sim/setup';
import { TEAM_BLUE, TEAM_RED } from '../src/sim/rules';
import { playBalanceMatch } from './balanceMatch';

interface Pair { wins: number; games: number; secs: number[]; castleLow: number[] }

/** Level a (with setup sa) against level b (sb) over n seeds, both colours. */
export function duel(a: Partial<SideSetup>, b: Partial<SideSetup>, n: number, seed0 = Number(process.env.SEED0 ?? 1000), siege?: number): Pair {
  const p: Pair = { wins: 0, games: 0, secs: [], castleLow: [] };
  for (let i = 0; i < n; i++) {
    const seed = seed0 + i * 7919;
    for (const aBlue of [true, false]) {
      const m = playBalanceMatch(seed, { blue: aBlue ? a : b, red: aBlue ? b : a, siege });
      const aTeam = aBlue ? TEAM_BLUE : TEAM_RED;
      p.games++;
      if (m.winner === aTeam) p.wins++;
      p.secs.push(m.secs);
      p.castleLow.push(m.side[aTeam]!.castleLow);
    }
  }
  return p;
}

const median = (xs: number[]) => [...xs].sort((x, y) => x - y)[xs.length >> 1] ?? 0;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function line(label: string, p: Pair): string {
  const pct = Math.round((100 * p.wins) / p.games);
  return `${label.padEnd(14)} ${String(pct).padStart(3)}%  (${p.wins}/${p.games})  median ${fmt(median(p.secs))}  castle low median ${Math.round(100 * median(p.castleLow))}%`;
}

if (process.argv[1]?.endsWith('ladder.ts')) {
  const args = process.argv.slice(2);
  if (args[0] === 'styles') {
    const n = Number(args[1] ?? 30);
    for (let st = 1; st < AI_STYLES.length; st++) console.log(line(`style ${st} vs 0`, duel({ style: st }, { style: 0 }, n)));
  } else if (args[0] === 'all') {
    const n = Number(args[1] ?? 12);
    for (let a = 0; a <= AI_SKILL_MAX; a++)
      for (let b = a + 1; b <= AI_SKILL_MAX; b++) console.log(line(`L${a} vs L${b}`, duel({ skill: a }, { skill: b }, n)));
  } else if (args.length >= 2) {
    const n = Number(args[2] ?? 30);
    console.log(line(`L${args[0]} vs L${args[1]}`, duel({ skill: Number(args[0]) }, { skill: Number(args[1]) }, n)));
  } else {
    const n = Number(args[0] ?? 20);
    for (let a = 0; a <= AI_SKILL_MAX; a++) if (a !== AI_SKILL_STD) console.log(line(`L${a} vs L${AI_SKILL_STD}`, duel({ skill: a }, { skill: AI_SKILL_STD }, n)));
  }
}
