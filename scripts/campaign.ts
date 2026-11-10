// `npm run campaign`: calibrates the campaign (src/app/campaign.ts). A stand-in for the player
// (the standard AI, playing blue with the stage's player setup) plays each stage's rival on the
// stage's own map and on n-1 more maps, and the report gives its win rate, the median time of its
// wins (what the par time is drawn from) and how often it took half the map events as well. The stand-in
// is a steady, quick player: a person new to the game is weaker, one who has learnt it is
// stronger (DECISIONS.md), so what matters is the curve, falling from stage to stage.
//   npm run campaign               every stage, 16 maps each
//   npm run campaign -- 24 3       chapter 3 only, 24 maps a stage
//   npm run campaign -- 24 3 5     stage 3-5 only
//   npm run campaign -- maps 2     chapter 2's own maps: is a stage's fixed map fair to blue?
//   npm run campaign -- pick 2     chapter 2: the fairest of 10 fresh maps of its theme per stage
//   PROXY='{"skill":2}'            a weaker stand-in

import { CHAPTERS, STAGES_PER_CHAPTER, eventsGoal, stageAt, stageLabel, type Stage } from '../src/app/campaign';
import { generateMap } from '../src/sim/map';
import { TEAM_BLUE, TEAM_RED } from '../src/sim/rules';
import { playBalanceMatch } from './balanceMatch';

const PROXY = JSON.parse(process.env.PROXY ?? '{}');

export interface StageReport { id: number; wins: number; games: number; winSecs: number[]; eventsOk: number; castleLows: number[]; firstWon: boolean }

/** Stage id over n maps (the stage's own first); `rival` overrides fields of its rival's setup. */
export function calibrate(id: number, n: number, rival: Partial<Stage['rival']> = {}): StageReport {
  const st: Stage = stageAt(id);
  const r: StageReport = { id, wins: 0, games: 0, winSecs: [], eventsOk: 0, castleLows: [], firstWon: false };
  for (let i = 0; i < n; i++) {
    const seed = i === 0 ? st.seed : (st.seed * 7 + i * 7919) >>> 0;
    const m = playBalanceMatch(seed, { blue: { skill: 3, ...PROXY, ...(st.you ?? {}) }, red: { ...st.rival, ...rival }, siege: st.siege });
    r.games++;
    if (m.winner !== TEAM_BLUE) continue;
    r.wins++;
    if (i === 0) r.firstWon = true;
    r.winSecs.push(m.secs);
    r.castleLows.push(m.side[TEAM_BLUE]!.castleLow);
    const taken = (S: (typeof m.side)[number]) => Object.values(S.events).reduce((a, b) => a + b, 0);
    if (eventsGoal(taken(m.side[TEAM_BLUE]!), taken(m.side[TEAM_BLUE]!) + taken(m.side[TEAM_RED]!) + m.eventsLeft)) r.eventsOk++;
  }
  return r;
}

/** The stand-in's target win rate (percent) on chapter c's stage s: falling over the campaign,
 *  a dip at each boss (DECISIONS.md). */
export const TARGET = (c: number, s: number): number => [96, 85, 75, 65, 55, 45][c]! - (s === 6 ? 14 : Math.round(s * 1.5));

/** Stage id's own map only, 15 times: the stand-in in each style, against the rival a little
 *  poorer, as set and a little richer. A map that leans to red shows up as a rate well below
 *  the stage's over many maps (calibrate). */
export function mapRate(id: number, seed = stageAt(id).seed): number {
  const st = stageAt(id);
  let wins = 0;
  for (let style = 0; style < 5; style++) {
    for (const d of [-10, 0, 10]) {
      const red = { ...st.rival, income: (st.rival.income ?? 100) + d };
      const m = playBalanceMatch(seed, { blue: { skill: 3, ...PROXY, ...(st.you ?? {}), style }, red, siege: st.siege });
      if (m.winner === TEAM_BLUE) wins++;
    }
  }
  return Math.round((100 * wins) / 15);
}

export const median = (xs: number[]) => [...xs].sort((x, y) => x - y)[xs.length >> 1] ?? 0;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

if (process.argv[1]?.endsWith('campaign.ts') && process.argv[2] === 'maps') {
  const ch = Number(process.argv[3] ?? 1) - 1;
  for (let s = 0; s < STAGES_PER_CHAPTER; s++) {
    const id = ch * STAGES_PER_CHAPTER + s;
    console.log(`${stageLabel(id).padEnd(5)} seed ${String(stageAt(id).seed).padStart(4)}  own map ${String(mapRate(id)).padStart(3)}%`);
  }
} else if (process.argv[1]?.endsWith('campaign.ts') && process.argv[2] === 'pick') {
  // each stage's own map against 10 unused ones of the chapter's theme; the one whose rate is
  // nearest the stage's target wins (the current map unless another is 10 points nearer)
  const ch = Number(process.argv[3] ?? 1) - 1;
  const used = new Set(CHAPTERS.flatMap((c) => c.stages.map((st) => st.seed)));
  let next = 1000 + ch * 5000;
  for (let s = 0; s < STAGES_PER_CHAPTER; s++) {
    const id = ch * STAGES_PER_CHAPTER + s;
    if (id === 0) continue; // the tutorial's map
    const want = TARGET(ch, s);
    const cur = stageAt(id).seed;
    let best = cur, bestRate = mapRate(id), bestOff = Math.abs(bestRate - want) - 10;
    for (let k = 0; k < 10; k++) {
      while (used.has(next) || generateMap(next).themeKey !== CHAPTERS[ch]!.theme) next++;
      const seed = next++;
      const rate = mapRate(id, seed);
      if (Math.abs(rate - want) < bestOff) [best, bestRate, bestOff] = [seed, rate, Math.abs(rate - want)];
    }
    console.log(`${stageLabel(id).padEnd(5)} want ${want}%  seed ${cur} -> ${best}  own map ${bestRate}%`);
  }
} else if (process.argv[1]?.endsWith('campaign.ts')) {
  const [nArg, chArg, stArg] = process.argv.slice(2);
  const n = Number(nArg ?? 16);
  const ids: number[] = [];
  for (let c = 0; c < CHAPTERS.length; c++) {
    if (chArg && c !== Number(chArg) - 1) continue;
    for (let s = 0; s < STAGES_PER_CHAPTER; s++) if (!stArg || s === Number(stArg) - 1) ids.push(c * STAGES_PER_CHAPTER + s);
  }
  for (const id of ids) {
    const r = calibrate(id, n);
    const st = stageAt(id);
    const pct = Math.round((100 * r.wins) / r.games);
    const ok = r.wins ? Math.round((100 * r.eventsOk) / r.wins) : 0;
    // a par a steady player beats about half the time it wins, rounded up to 15 seconds
    const par = Math.ceil((median(r.winSecs) * 1.1) / 15) * 15;
    console.log(
      `${stageLabel(id).padEnd(5)} win ${String(pct).padStart(3)}%  map ${r.firstWon ? 'won ' : 'lost'}  win time ${fmt(median(r.winSecs))}  chests>half ${String(ok).padStart(3)}%  par ${st.par} -> ${par}`,
    );
  }
}
