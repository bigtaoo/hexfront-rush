// Headless AI-vs-AI matches: balance numbers plus determinism checks.
//   node tools/sim.js            8 seeds, summary per match
//   node tools/sim.js 5 12 99    those seeds
const { loadSim } = require('./load-sim');
const S = loadSim();

const seeds = process.argv.slice(2).map(Number).filter((n) => n >= 0);
const list = seeds.length ? seeds : [11, 222, 3333, 44444, 5, 66, 777, 8888];
let totalTicks = 0, totalMs = 0;
const wins = [0, 0, 0];
for (const seed of list) {
  const t0 = Date.now();
  const e = new S.Engine({ seed, aiBlue: true, aiRed: true });
  const built = { 1: {}, 2: {} };
  let maxU = 0;
  while (e.phase !== S.PHASE_END && e.tick < S.MATCH_TICKS + 400) {
    e.step(null);
    if (e.units.length > maxU) maxU = e.units.length;
    for (const ev of e.events) if (ev.type === 'built' || ev.type === 'barracks') built[ev.team][ev.kind || 'barracks'] = (built[ev.team][ev.kind || 'barracks'] || 0) + 1;
    if (e.tick % 30 === 0) e.hash();   // throws on any float in the state
  }
  const ms = Date.now() - t0;
  totalTicks += e.tick; totalMs += ms;
  const r = e.result || {};
  wins[r.winner || 0]++;
  console.log('seed', seed, 'winner', r.winner, r.reason, 'tiles', r.blue + ':' + r.red, 's', Math.round(e.tick / 30),
    'maxUnits', maxU, 'bld', e.blds.filter((b) => b.team === 1).length + ':' + e.blds.filter((b) => b.team === 2).length,
    'gold', e.team[1].gold + ':' + e.team[2].gold, 'hash', e.hash().toString(16), ms + 'ms');
}
console.log('wins blue/red/draw', wins[1], wins[2], wins[0], '| sim speed', Math.round(totalTicks / (totalMs / 1000)), 'ticks/s');
