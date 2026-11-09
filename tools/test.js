// Determinism test suite for the lockstep sim.
//   node tools/test.js            run everything
//   node tools/test.js --update   rewrite tools/golden.json (only after an intended rules change,
//                                 together with an ENGINE_VERSION bump)
const fs = require('fs'), path = require('path');
const { loadSim } = require('./load-sim');

const S = loadSim({ net: true });
const GOLDEN = path.join(__dirname, 'golden.json');
const update = process.argv.includes('--update');
let failed = 0;
const ok = (name, cond, info) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : ''));
  if (!cond) failed++;
};
const hex = (h) => (h >>> 0).toString(16).padStart(8, '0');

/** A scripted player: a seeded random mix of clicks and held keys, deciding from the state it sees. */
function scriptedPlayer(sim, owner, seed) {
  const rng = new sim.Prng(seed);
  let next = 0, holdUntil = -1;
  return (engine) => {
    if (engine.tick < next) return null;
    next = engine.tick + 6 + rng.int(40);
    const r = rng.int(10);
    if (r < 6) return sim.makeCmd(owner, rng.int(sim.NTILES), 0, 0, 0);
    if (r < 9) { holdUntil = engine.tick + 20; return sim.makeCmd(owner, -1, rng.int(3) - 1, rng.int(3) - 1, 0); }
    return sim.makeCmd(owner, -1, 0, 0, 0);
  };
}

/** Play a whole match: AI red, scripted blue (or AI both). Returns { engine, log, hashes }. */
function playMatch(sim, seed, opts) {
  const o = opts || {};
  const config = { seed, aiBlue: !!o.aiBlue, aiRed: true };
  let e = new sim.Engine(config);
  const input = new sim.LocalInput();
  const bot = o.aiBlue ? null : scriptedPlayer(sim, sim.TEAM_BLUE, seed ^ 0x5a5a);
  const hashes = [];
  while (e.phase !== sim.PHASE_END) {
    if (bot) input.push(bot(e));
    e.step(input.take(e.tick));
    sim.recordChecks(e);
    if (o.hashEvery && e.tick % o.hashEvery === 0) hashes.push(e.hash());
    if (o.restoreEvery && e.tick % o.restoreEvery === 0) {
      const checks = e.checks;
      e = sim.Engine.restore(e.snapshot());
      e.checks = checks;
    }
  }
  return { engine: e, log: input.log, hashes, config };
}

// ---------- 1. golden hashes ----------
const goldenSeeds = [1, 42, 9001];
const now = { v: S.ENGINE_VERSION, ai: {}, human: {} };
for (const seed of goldenSeeds) {
  now.ai[seed] = hex(playMatch(S, seed, { aiBlue: true }).engine.hash());
  now.human[seed] = hex(playMatch(S, seed).engine.hash());
}
if (update || !fs.existsSync(GOLDEN)) {
  fs.writeFileSync(GOLDEN, JSON.stringify(now, null, 2) + '\n');
  console.log('golden.json written for engine v' + S.ENGINE_VERSION);
} else {
  const g = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  if (g.v !== S.ENGINE_VERSION) ok('golden: engine version', false, 'golden is v' + g.v + ', engine is v' + S.ENGINE_VERSION + ' - run with --update');
  else for (const seed of goldenSeeds) {
    ok('golden ai seed ' + seed, g.ai[seed] === now.ai[seed], now.ai[seed] + ' vs ' + g.ai[seed]);
    ok('golden human seed ' + seed, g.human[seed] === now.human[seed], now.human[seed] + ' vs ' + g.human[seed]);
  }
}

// ---------- 2. same run twice, in two separate VM contexts ----------
{
  const S2 = loadSim({ net: true });
  const a = playMatch(S, 77, { hashEvery: 30 }), b = playMatch(S2, 77, { hashEvery: 30 });
  let first = -1;
  for (let i = 0; i < a.hashes.length; i++) if (a.hashes[i] !== b.hashes[i]) { first = i * 30; break; }
  ok('two contexts, every-30-tick hashes equal', first < 0 && a.hashes.length === b.hashes.length, first >= 0 ? 'diverged at tick ' + first : a.hashes.length + ' checkpoints');
}

// ---------- 3. hashing does not disturb the run; snapshot/restore round trips ----------
{
  const plain = playMatch(S, 5150).engine.hash();
  const hashed = playMatch(S, 5150, { hashEvery: 1 }).engine.hash();
  ok('hashing every tick changes nothing', plain === hashed);
  const restored = playMatch(S, 5150, { restoreEvery: 457 }).engine.hash();
  ok('snapshot -> restore every 457 ticks keeps the outcome', plain === restored, hex(plain) + ' / ' + hex(restored));
  const mid = playMatch(S, 5150);
  const snap = JSON.stringify(sim0Snapshot(5150, 2000));
  ok('snapshot is plain JSON', typeof snap === 'string' && snap.length > 1000, Math.round(snap.length / 1024) + ' KB');
  void mid;
}
function sim0Snapshot(seed, atTick) {
  const e = new S.Engine({ seed, aiBlue: true, aiRed: true });
  while (e.tick < atTick) e.step(null);
  return e.snapshot();
}

// ---------- 4. replays ----------
{
  const m = playMatch(S, 31337);
  const rep = S.makeReplay(m.config, m.log, m.engine);
  const text = JSON.stringify(rep);
  const back = S.runReplay(JSON.parse(text));
  ok('replay reproduces the match', back.ok && back.engine.hash() === m.engine.hash(), rep.log.length + ' cmds, ' + Math.round(text.length / 1024) + ' KB');
  // tamper: drop one command -> the replay must notice, and say when
  const bad = JSON.parse(text);
  bad.log.splice(Math.floor(bad.log.length / 2), 1);
  const res = S.runReplay(bad);
  ok('tampered replay is detected', !res.ok, 'first bad checkpoint at tick ' + res.firstBad);
}

// ---------- 5. hostile commands can't break the sim ----------
{
  const e = new S.Engine({ seed: 3, aiRed: true });
  const junk = [
    { owner: 9, goto: 5, kx: 0, ky: 0, ff: 0 }, { owner: 1, goto: 99999, kx: 7, ky: -9, ff: 0 },
    { owner: 1, goto: -5, kx: 1, ky: 1, ff: 0 }, { owner: 2, goto: 0, kx: 0, ky: 0, ff: 0 },
  ];
  let threw = null;
  try { for (let i = 0; i < 600; i++) { e.step(junk); e.hash(); } } catch (err) { threw = err.message; }
  ok('junk commands are clamped, state stays integer', !threw && e.heroes[1].kx === 1, threw || '');
}

// ---------- 6. loopback lockstep: relay + two clients over a jittery network ----------
function loopback(seed, opts) {
  const o = opts || {};
  const rng = new S.Prng(seed * 7 + 1);
  const fb = new S.FrameBroadcast({ startFrame: 0 });
  let nowMs = 0;
  const clients = [1, 2].map((seat) => ({
    seat, net: new S.NetInput({ seat, startFrame: 0, now: () => nowMs }),
    engine: new S.Engine({ seed, aiBlue: false, aiRed: false }),
    bot: scriptedPlayer(S, seat, seed * 31 + seat), acc: 0, checks: new Map(), lastSentTick: -1,
    // in-flight messages, FIFO per direction (TCP keeps order)
    down: [], up: [], offline: null,
  }));
  if (o.offline) clients[1].offline = o.offline;   // [fromMs, toMs]: seat 2 disconnects then resumes
  const lat = () => 20 + rng.int(o.jitter || 120);
  const deliver = (q, fn) => { while (q.length && q[0].at <= nowMs) fn(q.shift().msg); };
  let maxBacklog = 0, stalls = 0;
  for (nowMs = 0; nowMs < o.ms; nowMs++) {
    if (nowMs % 100 === 0) {
      const b = fb.tick();
      for (const c of clients) {
        if (c.offline && nowMs >= c.offline[0] && nowMs < c.offline[1]) continue;
        const prev = c.down.length ? c.down[c.down.length - 1].at : 0;
        c.down.push({ at: Math.max(prev, nowMs + lat()), msg: b });
      }
    }
    for (const c of clients) {
      if (c.offline && nowMs === c.offline[1]) {   // resume: the relay resends everything after what we have
        c.down.length = 0;
        c.net.onResync({ log: fb.logSince(c.net.confirmedTo), curFrame: fb.curFrame });
      }
      deliver(c.up, (m) => fb.submit(c.seat, m[0], m[1], m[2], m[3], 0));
      deliver(c.down, (m) => c.net.onBatch(m));
      // the client's render loop at ~60 fps; sim at 30 Hz with the catch-up ladder
      if (nowMs % 16 === 0) {
        const back = c.net.backlog(c.engine.tick);
        if (back > maxBacklog) maxBacklog = back;
        c.acc += 16 * S.TICK_RATE / 1000 * S.catchUpRate(back);
        let steps = 0;
        while (c.acc >= 1 && steps < 40) {
          const cmds = c.net.take(c.engine.tick);
          if (!cmds) { stalls++; c.acc = 0; break; }
          c.engine.step(cmds);
          c.acc -= 1; steps++;
          if (c.engine.tick % 30 === 0) c.checks.set(c.engine.tick, c.engine.hash());
        }
        const off = c.offline && nowMs >= c.offline[0] && nowMs < c.offline[1];
        if (!off && c.engine.tick !== c.lastSentTick) {
          c.lastSentTick = c.engine.tick;
          const cmd = c.bot(c.engine);
          if (cmd) {
            const prev = c.up.length ? c.up[c.up.length - 1].at : 0;
            c.up.push({ at: Math.max(prev, nowMs + lat()), msg: [cmd.goto, cmd.kx, cmd.ky, cmd.ff] });
            c.net.noteSent();
          }
        }
      }
    }
  }
  const [a, b] = clients;
  let compared = 0, mismatch = -1;
  for (const [t, h] of a.checks) if (b.checks.has(t)) { compared++; if (b.checks.get(t) !== h && mismatch < 0) mismatch = t; }
  // the relay's log, replayed offline, must land on the same state too
  const minTick = Math.min(a.engine.tick, b.engine.tick);
  const rep = { v: S.ENGINE_VERSION, config: { seed, aiBlue: false, aiRed: false }, log: fb.log, endTick: minTick, hash: 0, checks: [] };
  const offline = S.runReplay(rep, minTick).engine;
  const ref = a.engine.tick === minTick ? a.engine : b.engine;
  return { compared, mismatch, ticks: [a.engine.tick, b.engine.tick], cmds: fb.log.length, maxBacklog, stalls,
    replayOk: offline.hash() === ref.hash(), delay: [Math.round(a.net.delayMs), Math.round(b.net.delayMs)] };
}
{
  const r = loopback(2024, { ms: 60000, jitter: 120 });
  ok('loopback: both clients identical at every checkpoint', r.mismatch < 0 && r.compared > 50,
    r.compared + ' checkpoints, ticks ' + r.ticks.join('/') + ', ' + r.cmds + ' cmds, input delay ~' + r.delay.join('/') + ' ms');
  ok('loopback: relay log replays to the same state', r.replayOk);
  ok('loopback: clients keep up with the relay', r.ticks[0] > 60 * 30 - 30 && r.ticks[1] > 60 * 30 - 30, 'max backlog ' + r.maxBacklog + ', stalls ' + r.stalls);
  const r2 = loopback(77, { ms: 70000, jitter: 300, offline: [20000, 32000] });
  ok('loopback: 12 s disconnect + resume catches up and stays in sync', r2.mismatch < 0 && r2.replayOk && Math.abs(r2.ticks[0] - r2.ticks[1]) < 20,
    'ticks ' + r2.ticks.join('/') + ', max backlog ' + r2.maxBacklog + ', ' + r2.compared + ' checkpoints');
}

console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
