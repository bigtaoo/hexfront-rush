// Headless AI-vs-AI matches: balance numbers (scripts/balanceMatch.ts plays each one).
//   npm run balance              120 seeds (N=… for another count), one report
//   npm run balance -- 5 12 99   those seeds, a line per match and the report
//
// A match has no clock: it ends when a castle falls. The report says how long matches run, how
// often the side that was behind won anyway (comebacks), what each side flipped and rolled, and
// how much each piece of luck (a better barracks roll, a mystery jackpot, more mines) is worth.

import { MYSTERY, TEAM_BLUE, TEAM_RED } from '../src/sim/rules';
import { playBalanceMatch, type MatchStats, type SideStats } from './balanceMatch';

const args = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n >= 0);
const count = Number(process.env.N) || 120;
const seeds = args.length ? args : Array.from({ length: count }, (_, i) => 1000 + i * 7919);
const verbose = args.length > 0;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : '-');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const q = (xs: number[], p: number) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : 0;
};
const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const matches: MatchStats[] = [];
let totalMs = 0;
let totalSecs = 0;
for (const seed of seeds) {
  const m = playBalanceMatch(seed);
  matches.push(m);
  totalMs += m.ms;
  totalSecs += m.secs;
  if (!verbose) continue;
  const line = (S: SideStats) => {
    const f = Object.keys(S.flips).sort().map((k) => k + S.flips[k]).join(',');
    return `${f}  bar ${S.barracks.join('/')}  myst ${S.mystery.join('/')}  castle ${Math.round(S.castleLow * 100)}%`;
  };
  console.log(`seed ${seed}  ${m.winner === TEAM_BLUE ? 'blue' : m.winner === TEAM_RED ? 'red' : 'draw'} ${m.reason} ${mmss(m.secs)}  maxUnits ${m.maxUnits}  hash ${m.hash.toString(16)}`);
  console.log(`   blue ${line(m.side[TEAM_BLUE]!)}\n   red  ${line(m.side[TEAM_RED]!)}`);
}

// ---------- the report ----------
const n = matches.length;
const decided = matches.filter((m) => m.winner);
const lens = matches.map((m) => m.secs);
const out: string[] = [];
out.push(`\n${n} matches, ${Math.round((totalSecs * 30) / (totalMs / 1000))} ticks/s`);
const reasons: Record<string, number> = {};
for (const m of matches) reasons[m.reason] = (reasons[m.reason] ?? 0) + 1;
out.push(`length   median ${mmss(q(lens, 0.5))}  p10 ${mmss(q(lens, 0.1))}  p90 ${mmss(q(lens, 0.9))}  max ${mmss(Math.max(...lens))}  | ends ${Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(', ')}`);
const stuck = matches.filter((m) => m.reason === 'time').map((m) => m.seed);
if (stuck.length) out.push(`stalemates (the safety valve ended them): seeds ${stuck.join(' ')}`);
out.push(`sides    blue ${pct(matches.filter((m) => m.winner === TEAM_BLUE).length, n)}  red ${pct(matches.filter((m) => m.winner === TEAM_RED).length, n)}`);

// comebacks: the tiles bar after the first minute, and the winner's own castle
let trailed = 0, deep = 0, castle50 = 0, castle25 = 0;
const swings: number[] = [];
for (const m of decided) {
  const mine = m.share.map((s) => (m.winner === TEAM_BLUE ? s : 1 - s)).slice(60);
  if (mine.some((s) => s < 0.4)) trailed++;
  if (mine.some((s) => s < 0.3)) deep++;
  const low = m.side[m.winner]!.castleLow;
  if (low < 0.5) castle50++;
  if (low < 0.25) castle25++;
  // the tiles lead changing hands, with a margin (55/45) so a tie does not count
  let lead = 0, k = 0;
  for (const s of m.share.slice(30)) {
    const now = s > 0.55 ? 1 : s < 0.45 ? -1 : 0;
    if (now && now !== lead) {
      if (lead) k++;
      lead = now;
    }
  }
  swings.push(k);
}
const d = decided.length;
out.push(`comeback winner behind on tiles after 1:00: <40% ${pct(trailed, d)}, <30% ${pct(deep, d)} | winner's castle under 50% ${pct(castle50, d)}, under 25% ${pct(castle25, d)} | tile lead changed hands ${f1(avg(swings))}x a match`);

// what gets flipped, per side per match
const sides = matches.flatMap((m) => [m.side[TEAM_BLUE]!, m.side[TEAM_RED]!]);
const per = (f: (S: SideStats) => number) => f1(avg(sides.map(f)));
const keys = ['mine', 'tower', 'bar1', 'bar2', 'bar3', 'myst'];
out.push(`flips    ${keys.map((k) => `${k} ${per((S) => S.flips[k] ?? 0)}`).join('  ')}   (per side per match)`);
const bar = [0, 1, 2, 3].map((r) => sum(sides.map((S) => S.barracks[r]!)));
const myst = MYSTERY.map((_, r) => sum(sides.map((S) => S.mystery[r]!)));
const RNAME = ['common', 'rare', 'epic', 'legendary'];
const rollName = (m: (typeof MYSTERY)[number]) => (m.squad ? `${RNAME[m.squad.rarity]} squad` : m.barracks !== undefined ? `${RNAME[m.barracks]} barracks` : 'nothing');
const trained = [0, 1, 2, 3].map((r) => sum(sides.map((S) => S.trained[r]!)));
out.push(`barracks common/rare/epic/legendary ${bar.map((b) => pct(b, sum(bar))).join(' / ')}   trained ${trained.map((b) => pct(b, sum(trained))).join(' / ')}`);
out.push(`mystery  ${sum(myst)} rolls: ${MYSTERY.map((m, r) => `${rollName(m)} ${pct(myst[r]!, sum(myst))}`).join(', ')}`);
out.push(
  `layout   per side: mines ${per((S) => S.laid.mine)} laid, ${per((S) => S.seen.mine)} seen, ${per((S) => S.flips.mine ?? 0)} flipped | epic+ barracks ${per((S) => S.laid.best)} laid, ${per((S) => S.seen.best)} seen, ${per((S) => S.barracks[2]! + S.barracks[3]!)} built`,
);
const evKeys = ['chest', 'hoard', 'camp', 'warband'];
const midAt = sides.flatMap((S) => S.middleAt);
out.push(
  `events   claimed per side: ${evKeys.map((k) => `${k} ${per((S) => S.events[k] ?? 0)}`).join('  ')} | left unclaimed ${f1(avg(matches.map((m) => m.eventsLeft)))} a match | middle row claimed at median ${midAt.length ? mmss(q(midAt, 0.5)) : '-'}, p90 ${midAt.length ? mmss(q(midAt, 0.9)) : '-'}`,
);
out.push(`lost     mines ${per((S) => S.lost.mine ?? 0)}  barracks ${per((S) => S.lost.barracks ?? 0)}  towers ${per((S) => S.lost.tower ?? 0)}   at troop cap ${pct(sum(sides.map((S) => S.capSecs)), 2 * totalSecs)} of play   gold left ${per((S) => S.goldEnd)}`);

// luck: how often the side with more of something won
const edge = (label: string, f: (S: SideStats) => number) => {
  let more = 0, won = 0;
  for (const m of decided) {
    const a = f(m.side[TEAM_BLUE]!), b = f(m.side[TEAM_RED]!);
    if (a === b) continue;
    more++;
    if ((a > b) === (m.winner === TEAM_BLUE)) won++;
  }
  return `${label} ${pct(won, more)} (${more})`;
};
// Conditioned at 1:30, before the match is decided. A whole-match total counts the winner's
// extra flips, so it partly reads back its own result; flips and tiles are the tempo control —
// what a rarity line means is how far above them it sits.
out.push(
  `early    the side with more at 1:30 … won: ${[
    edge('cards flipped', (S) => S.at90.flips),
    edge('tiles', (S) => S.at90.tiles),
    edge('mines', (S) => S.minesAt90),
    edge('barracks', (S) => sum(S.at90.bar)),
    edge('rarity points', (S) => sum(S.at90.bar.map((n, r) => n * r))),
    edge('epic+ barracks', (S) => S.at90.bar[2]! + S.at90.bar[3]!),
  ].join(' | ')}`,
);
// Step 1 of the two-step method: hold the luck equal, and see what is left. The card layout is
// already mirrored tile for tile (cardLayout.ts), so both sides are OFFERED the same thing; what
// still differs by 1:30 is what each side chose to flip and what the flip-time rolls gave it.
// Among the matches where the two sides stand equal at 1:30, a fair game is 50% — anything else
// is structural (the position, or who moves first), not luck.
const eqOn = (m: MatchStats, f: (S: SideStats) => number) => f(m.side[TEAM_BLUE]!) === f(m.side[TEAM_RED]!);
const rpOf = (S: SideStats) => sum(S.at90.bar.map((k, r) => k * r));
const nearOn = (m: MatchStats, f: (S: SideStats) => number, tol: number) =>
  Math.abs(f(m.side[TEAM_BLUE]!) - f(m.side[TEAM_RED]!)) <= tol;
/** The same barracks standing at 1:30, tier for tier — not just the same points. */
const sameBar = (m: MatchStats) =>
  m.side[TEAM_BLUE]!.at90.bar.every((k, r) => k === m.side[TEAM_RED]!.at90.bar[r]);
const fairCut = (name: string, keep: (m: MatchStats) => boolean) => {
  const g = decided.filter(keep);
  return `${name} ${g.length ? pct(g.filter((m) => m.winner === TEAM_BLUE).length, g.length) : '-'} (n=${g.length})`;
};
out.push(
  `fair     with luck held equal at 1:30, blue won: ${[
    fairCut('same rarity points', (m) => eqOn(m, rpOf)),
    fairCut('same barracks, tier for tier', sameBar),
    fairCut('+ same mines', (m) => sameBar(m) && eqOn(m, (S) => S.minesAt90)),
    fairCut('+ tiles within 2', (m) => sameBar(m) && eqOn(m, (S) => S.minesAt90) && nearOn(m, (S) => S.at90.tiles, 2)),
  ].join(' | ')}`,
);
out.push(
  `luck     the side with more … won: ${[
    edge('epic+legendary barracks', (S) => S.barracks[2]! + S.barracks[3]!),
    edge('legendary barracks', (S) => S.barracks[3]!),
    edge('mystery epic+legendary', (S) => sum(MYSTERY.map((m, r) => ((m.squad?.rarity ?? m.barracks ?? 0) >= 2 ? S.mystery[r]! : 0)))),
    edge('mystery barracks', (S) => sum(MYSTERY.map((m, r) => (m.barracks !== undefined ? S.mystery[r]! : 0)))),
    edge('mines at 1:30', (S) => S.minesAt90),
    edge('towers', (S) => S.flips.tower ?? 0),
    edge('map event worth', (S) => S.eventWorth),
    edge('middle events', (S) => S.middleAt.length),
  ].join(' | ')}`,
);
console.log(out.join('\n'));
