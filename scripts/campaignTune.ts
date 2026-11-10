// `npm run campaigntune -- 3 40`: tunes chapter 3's rivals to the difficulty curve. Each stage
// keeps its idea (its rival's skill, style, gold, barracks, towers, castle; the siege) and its
// rival's income is searched (steps of 5) for the stand-in's win rate closest to the target:
// TARGET (scripts/campaign.ts), falling over the campaign, a dip at each boss. Then copy the incomes and pars
// into src/app/campaign.ts and check with `npm run campaign`.

import { STAGES_PER_CHAPTER, stageAt, stageLabel } from '../src/app/campaign';
import { TARGET, calibrate, median } from './campaign';

const [chArg, nArg] = process.argv.slice(2);
const c = Number(chArg ?? 1) - 1;
const n = Number(nArg ?? 40);
for (let s = 0; s < STAGES_PER_CHAPTER; s++) {
  const id = c * STAGES_PER_CHAPTER + s;
  const want = TARGET(c, s);
  const rate = (inc: number) => {
    const r = calibrate(id, n, { income: inc });
    return { r, pct: (100 * r.wins) / r.games };
  };
  // the stand-in's win rate falls as the rival's income rises: bisect on steps of 5
  // within 25 points of the stage's income now (income / 5)
  const cur = Math.round((stageAt(id).rival.income ?? 100) / 5);
  let lo = Math.max(2, cur - 5), hi = cur + 5;
  const seen = new Map<number, ReturnType<typeof rate>>();
  const at = (k: number) => seen.get(k) ?? (seen.set(k, rate(k * 5)), seen.get(k)!);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (at(mid).pct >= want) lo = mid;
    else hi = mid;
  }
  const k = Math.abs(at(lo).pct - want) <= Math.abs(at(hi).pct - want) ? lo : hi;
  const { r, pct } = at(k);
  const lows = r.castleLows;
  const share = (f: (x: number) => boolean) => (lows.length ? Math.round((100 * lows.filter(f).length) / lows.length) : 0);
  const par = Math.ceil((median(r.winSecs) * 1.1) / 15) * 15;
  console.log(
    `${stageLabel(id).padEnd(5)} want ${String(want).padStart(3)}%  income ${String(k * 5).padStart(3)} (was ${stageAt(id).rival.income ?? 100})  win ${Math.round(pct)}%  par ${par}  map ${r.firstWon ? 'won' : 'lost'}  castle untouched ${share((x) => x >= 1)}% >=90 ${share((x) => x >= 0.9)}% >=75 ${share((x) => x >= 0.75)}%`,
  );
}
