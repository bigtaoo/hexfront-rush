// Headless AI-vs-AI matches: balance numbers, plus a hash every second (hash() throws on any
// non-integer in the state, so a float leaking into the sim fails here too).
//   npm run balance              8 seeds, one summary line per match
//   npm run balance -- 5 12 99   those seeds
import { Engine } from '../src/sim/engine';
import { MATCH_TICKS, PHASE_END, TEAM_BLUE, TEAM_RED } from '../src/sim/rules';

const seeds = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n >= 0);
const list = seeds.length ? seeds : [11, 222, 3333, 44444, 5, 66, 777, 8888];
let totalTicks = 0;
let totalMs = 0;
const wins = [0, 0, 0];

for (const seed of list) {
  const t0 = performance.now();
  const e = new Engine({ seed, aiBlue: true, aiRed: true });
  const built: Record<number, Record<string, number>> = { [TEAM_BLUE]: {}, [TEAM_RED]: {} };
  let maxUnits = 0;
  while (e.phase !== PHASE_END && e.tick < MATCH_TICKS + 400) {
    e.step(null);
    if (e.units.length > maxUnits) maxUnits = e.units.length;
    for (const ev of e.events) {
      if (ev.type !== 'built' && ev.type !== 'barracks') continue;
      const d = ev as unknown as { team: number; kind?: string };
      const k = d.kind ?? 'barracks';
      built[d.team]![k] = (built[d.team]![k] ?? 0) + 1;
    }
    if (e.tick % 30 === 0) e.hash();
  }
  const ms = performance.now() - t0;
  totalTicks += e.tick;
  totalMs += ms;
  const r = e.result;
  wins[r?.winner ?? 0]!++;
  const per = (t: number) => Object.entries(built[t]!).map(([k, n]) => k + n).join(',') || '-';
  console.log(
    `seed ${seed}  winner ${r?.winner ?? '-'} ${r?.reason ?? 'none'}  tiles ${r?.blue}:${r?.red}  ${Math.round(e.tick / 30)}s` +
      `  maxUnits ${maxUnits}  built ${per(TEAM_BLUE)} | ${per(TEAM_RED)}` +
      `  gold ${e.team[TEAM_BLUE]!.gold}:${e.team[TEAM_RED]!.gold}  hash ${e.hash().toString(16)}  ${Math.round(ms)}ms`,
  );
}
console.log(`wins blue/red/draw ${wins[1]} ${wins[2]} ${wins[0]} | sim speed ${Math.round(totalTicks / (totalMs / 1000))} ticks/s`);
