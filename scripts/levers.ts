// `npm run levers`: what one advantage is worth, in win rate.
//
// Every line is a side given one head start, against an otherwise identical standard side, over
// the same seeds with the colours swapped — so the map never decides it. Reading a lever against
// `start gold` turns it into a price: `free barracks r2` at 85% sits between 180 and 300 starting
// gold, so an epic barracks is worth something like 200 gold of head start.
//
// This is the measurement a balance number should be argued from. A value model built out of the
// unit table (hp, dps, spawn time) prices what a building fights with; it cannot price what the
// building does to the rest of the match, and in this game that is most of the value.
//
// The last column is the quest loop (COUNTERPLAY.md §7.6): quests handed in by the side with the
// head start against the standard side, and the ratio. The loop rebates about half of what a
// building costs, but only to a side that can front the capital, so a head start buys quests too.
// A line marked `!` crossed 1.6× and is worth acting on; the rest are noise to leave alone.
//
//   npm run levers            50 seeds a line (100 matches)
//   N=20 npm run levers       quicker, noisier

import { duel } from './ladder';
import type { SideSetup } from '../src/sim/setup';

const median = (xs: number[]) => [...xs].sort((x, y) => x - y)[xs.length >> 1] ?? 0;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const one = (x: number) => `${Math.round(10 * x) / 10}`;
/** COUNTERPLAY.md §7.6: the quest loop rebates the leader first. Only a line marked `!` is worth acting on. */
const QUEST_GAP = 1.6;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const N = Number(process.env.N) || 50;

function show(label: string, a: Partial<SideSetup>, siege?: number): void {
  const p = duel(a, {}, N, undefined, siege);
  const pct = Math.round((100 * p.wins) / p.games);
  const [qa, qb] = [mean(p.quests), mean(p.questsB)];
  const ratio = qb > 0 ? qa / qb : 0;
  console.log(
    `${label.padEnd(24)} ${String(pct).padStart(3)}%  median ${fmt(median(p.secs))}  own castle low ${String(Math.round(100 * median(p.castleLow))).padStart(3)}%` +
      `  quests ${one(qa)}v${one(qb)}${ratio ? ` ×${one(ratio)}` : ''}${ratio > QUEST_GAP ? ' !' : ''}`,
  );
}

console.log(`each line: that head start vs the standard side, ${N * 2} matches, colours swapped\n`);
console.log('gold, and what it compounds into');
for (const g of [120, 180, 300, 405, 540]) show(`start gold ${g} (std 60)`, { gold: g });
for (const i of [110, 125, 150]) show(`income ${i}%`, { income: i });
console.log('\na building standing from the start (it takes an opening card tile with it)');
for (const r of [0, 1, 2, 3]) show(`free barracks r${r}`, { barracks: r });
for (const t of [1, 2, 3]) show(`free towers ${t}`, { towers: t });
console.log('\nwhat the match is supposed to be about');
for (const c of [130, 200, 400]) show(`castle hp ${c}%`, { castle: c });
console.log('\nthe siege clock (both sides the same; watch the length, not the 50%)');
for (const s of [60, 180, 480]) show(`siege at ${fmt(s)}`, {}, s);
