'use strict';
// Replays: (config, packed command log) reproduces a match bit for bit. A replay also stores
// the final hash and a few checkpoint hashes, so a mismatch says *when* two runs diverged.

const REPLAY_CHECK_EVERY = 300;   // ticks between stored checkpoint hashes

function makeReplay(config, log, engine) {
  return {
    v: ENGINE_VERSION, config: { seed: config.seed >>> 0, aiBlue: !!config.aiBlue, aiRed: !!config.aiRed },
    log: log.slice(), endTick: engine.tick, hash: engine.hash(), checks: (engine.checks || []).slice(),
    result: engine.result,
  };
}

/** Group a packed log by tick: tick -> [cmd]. */
function indexLog(log) {
  const by = new Map();
  for (const a of log) {
    const c = unpackCmd(a);
    if (!c) continue;
    let l = by.get(c.tick);
    if (!l) { l = []; by.set(c.tick, l); }
    l.push(c);
  }
  return by;
}

/** Run a replay to `untilTick` (default: its end). Returns { engine, ok, firstBad } where
 *  firstBad is the first checkpoint tick whose hash differs (-1 when all match). */
function runReplay(rep, untilTick, onTick) {
  if (rep.v !== ENGINE_VERSION) throw new Error('replay from engine v' + rep.v + ', this is v' + ENGINE_VERSION);
  const e = new Engine(rep.config);
  const by = indexLog(rep.log);
  const end = untilTick === undefined ? rep.endTick : untilTick;
  const checks = new Map();
  for (const ch of rep.checks || []) checks.set(ch[0], ch[1]);
  let firstBad = -1;
  while (e.tick < end) {
    e.step(by.get(e.tick) || null);
    if (onTick) onTick(e);
    if (checks.has(e.tick) && firstBad < 0 && checks.get(e.tick) !== e.hash()) firstBad = e.tick;
  }
  const ok = firstBad < 0 && (end !== rep.endTick || e.hash() === rep.hash);
  return { engine: e, ok, firstBad };
}

/** Wraps an engine to record the checkpoint hashes a replay stores. */
function recordChecks(engine) {
  engine.checks = engine.checks || [];
  if (engine.tick > 0 && engine.tick % REPLAY_CHECK_EVERY === 0) engine.checks.push([engine.tick, engine.hash()]);
}
