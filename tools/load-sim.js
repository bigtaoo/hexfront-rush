// Loads the deterministic sim (classic browser scripts) into a fresh Node vm context.
// The context gets no Date, no timers and no Math.random override: the sim must not need them.
const fs = require('fs'), path = require('path'), vm = require('vm');

const SIM_FILES = ['sim/fixed.js', 'sim/prng.js', 'sim/hash.js', 'sim/rules.js', 'sim/engine.js', 'sim/input.js', 'sim/replay.js'];
const NET_FILES = ['net/frameBroadcast.js', 'net/netInput.js'];

function loadSim(opts) {
  const root = path.join(__dirname, '..', 'js');
  const ctx = { console, Math, JSON, Map, Set, Array, Object, Number, Error, Uint8Array, Int16Array, ArrayBuffer };
  vm.createContext(ctx);
  const files = SIM_FILES.concat(opts && opts.net ? NET_FILES : []);
  // classic scripts share one global lexical scope; concatenating keeps const/class visible to callers
  const src = files.map((f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/^'use strict';/, '')).join('\n;\n');
  const exportNames = ['Engine', 'makeCmd', 'packCmd', 'unpackCmd', 'InputCollector', 'LocalInput', 'makeReplay', 'runReplay',
    'recordChecks', 'hashState', 'Prng', 'streamSeed', 'ENGINE_VERSION', 'TICK_RATE', 'MATCH_TICKS', 'PHASE_END', 'PHASE_PLAY',
    'TEAM_BLUE', 'TEAM_RED', 'NTILES', 'UNITS', 'OFFER_LIST', 'worldToHex', 'hexX', 'hexY', 'idx', 'inMap']
    .concat(opts && opts.net ? ['FrameBroadcast', 'NetInput', 'catchUpRate'] : []);
  vm.runInContext('"use strict";' + src + '\n;this.__sim = {' + exportNames.join(',') + '};', ctx, { filename: 'sim-bundle.js' });
  return ctx.__sim;
}

module.exports = { loadSim, SIM_FILES, NET_FILES };
