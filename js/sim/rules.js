'use strict';
// Rules for Hexfront Rush: constants, fixed-point hex math, unit/building tables, map generation.
// Every value the sim reads is an integer: world units x FP, time in ticks, speeds per tick.
// Design numbers stay readable (seconds, tiles) and are converted once at load time.

const ENGINE_VERSION = 1;   // bump when a rules change alters the outcome of a replay

const COLS = 11;
const ROWS = 19;
const NTILES = COLS * ROWS;
const MATCH_TICKS = ticks(180);
const INTRO_TICKS = ticks(3.6);

const TEAM_NONE = 0, TEAM_BLUE = 1, TEAM_RED = 2;
const TEAMS = [TEAM_BLUE, TEAM_RED];
const enemyOf = (t) => (t === TEAM_BLUE ? TEAM_RED : TEAM_BLUE);
const PHASE_INTRO = 0, PHASE_PLAY = 1, PHASE_END = 2;

// ---------- hex math (odd-r offset, pointy top, hex radius 1 world unit) ----------
const HALF_W = 866;          // sqrt(3)/2 x FP
const TILE = 2 * HALF_W;     // centre-to-centre distance of neighbours, fixed point
const ROW_H = 1500;          // 1.5 x FP
const NB_EVEN = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
const NB_ODD = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];

function hexX(c, r) { return HALF_W * (2 * c + (r & 1) + 1); }
function hexY(r) { return ROW_H * r + FP; }
function inMap(c, r) { return c >= 0 && r >= 0 && c < COLS && r < ROWS; }
function idx(c, r) { return r * COLS + c; }

/** The hex whose centre is nearest (x, y), exact in integers. Rows r0-1..r0+2 bracket y, and
 *  within a row the nearest centre by x is the nearest by distance. Ties keep the first row. */
function worldToHex(x, y) {
  const r0 = Math.floor((y - FP) / ROW_H);
  let bc = 0, br = 0, bd = -1;
  for (let r = r0 - 1; r <= r0 + 2; r++) {
    const c = Math.floor((x - HALF_W * (r & 1)) / TILE);
    const dx = x - hexX(c, r), dy = y - hexY(r);
    const d = dx * dx + dy * dy;
    if (bd < 0 || d < bd) { bd = d; bc = c; br = r; }
  }
  return { c: bc, r: br };
}
function toCube(c, r) { const x = c - (r - (r & 1)) / 2; return { x, y: -x - r, z: r }; }
function hexDist(c1, r1, c2, r2) {
  const a = toCube(c1, r1), b = toCube(c2, r2);
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}
function neighbors(c, r) {
  const d = (r & 1) ? NB_ODD : NB_EVEN;
  const out = [];
  for (let k = 0; k < 6; k++) {
    const nc = c + d[k][0], nr = r + d[k][1];
    if (inMap(nc, nr)) out.push(idx(nc, nr));
  }
  return out;
}

// ---------- tables (design units -> integers) ----------
const BUILD = {
  base:     { hp: 2000, income: 10, incomeEvery: ticks(3), dmg: 18, rate: ticks(0.9), range: Math.round(2.8 * TILE) },
  mine:     { hp: 240, income: 10, incomeEvery: ticks(4) },
  tower:    { hp: 340, dmg: 15, rate: ticks(0.8), range: Math.round(2.6 * TILE) },
  barracks: { hp: 300 },
};
const BLD_RADIUS = 800;

// Offers live in a fixed order: the index is what the sim stores per tile.
const OFFER_LIST = [
  { key: 'mine',  kind: 'mine',     cost: 50,  w: 25 },
  { key: 'tower', kind: 'tower',    cost: 50,  w: 19 },
  { key: 'bar1',  kind: 'barracks', cost: 50,  w: 23, odds: [74, 20, 5, 1] },
  { key: 'bar2',  kind: 'barracks', cost: 100, w: 13, odds: [30, 60, 8, 2] },
  { key: 'bar3',  kind: 'barracks', cost: 250, w: 6,  odds: [0, 0, 90, 10] },
  { key: 'myst',  kind: 'mystery',  cost: 25,  w: 14 },
];
const OFFER_W_TOTAL = 100;
const OF_MINE = 0, OF_TOWER = 1, OF_BAR1 = 2, OF_BAR2 = 3, OF_BAR3 = 4, OF_MYST = 5;

const RARITY = ['common', 'rare', 'epic', 'legendary'];
const RARITY_COLOR = ['#9aa5b1', '#38bdf8', '#c084fc', '#fbbf24'];

// Design table: hp, damage, attack every (s), range (tiles), speed (tiles/s), spawn every (s),
// cap alive per barracks, body size (world units), splash radius (tiles).
const UNIT_KEYS = ['militia', 'slinger', 'shield', 'bowman', 'ogre', 'adept', 'colossus', 'drake'];
const UNIT_DESIGN = {
  militia:  { rarity: 0, hp: 70,  dmg: 9,  rate: 0.9, range: 0.9, speed: 1.3, spawn: 6,  cap: 3, size: 0.30 },
  slinger:  { rarity: 0, hp: 45,  dmg: 7,  rate: 1.0, range: 1.8, speed: 1.3, spawn: 6,  cap: 3, size: 0.28, ranged: 'stone' },
  shield:   { rarity: 1, hp: 170, dmg: 11, rate: 1.0, range: 0.9, speed: 1.1, spawn: 8,  cap: 3, size: 0.34 },
  bowman:   { rarity: 1, hp: 70,  dmg: 12, rate: 1.1, range: 2.5, speed: 1.2, spawn: 8,  cap: 3, size: 0.30, ranged: 'arrow' },
  ogre:     { rarity: 2, hp: 360, dmg: 26, rate: 1.3, range: 1.0, speed: 1.0, spawn: 11, cap: 2, size: 0.44 },
  adept:    { rarity: 2, hp: 110, dmg: 20, rate: 1.4, range: 3.0, speed: 1.1, spawn: 11, cap: 2, size: 0.32, ranged: 'orb', splash: 0.8 },
  colossus: { rarity: 3, hp: 900, dmg: 45, rate: 1.6, range: 1.1, speed: 0.8, spawn: 16, cap: 1, size: 0.56, bldMult: 2 },
  drake:    { rarity: 3, hp: 380, dmg: 22, rate: 0.9, range: 2.2, speed: 1.7, spawn: 16, cap: 1, size: 0.46, ranged: 'fire', splash: 1.0 },
};
const UNITS = {};
const UNITS_BY_RARITY = [[], [], [], []];
for (let i = 0; i < UNIT_KEYS.length; i++) {
  const k = UNIT_KEYS[i], d = UNIT_DESIGN[k];
  UNITS[k] = {
    key: k, rarity: d.rarity, hp: d.hp, dmg: d.dmg, rate: ticks(d.rate), range: Math.round(d.range * TILE),
    speed: Math.round(d.speed * TILE / TICK_RATE), spawn: ticks(d.spawn), cap: d.cap, size: toFp(d.size),
    ranged: d.ranged || '', splash: Math.round((d.splash || 0) * TILE), bldMult: d.bldMult || 1,
    aggroMobile: Math.round(Math.max(3.2, d.range + 0.6) * TILE),
    aggroBuilding: Math.round(Math.max(2.2, d.range + 0.6) * TILE),
  };
  UNITS_BY_RARITY[d.rarity].push(k);
}

const HERO = {
  hp: 260, dmg: 16, rate: ticks(0.55), range: 3 * TILE, speed: Math.round(2.8 * TILE / TICK_RATE),
  respawn: ticks(5), radius: 420, homeRadius: Math.round(2.2 * TILE),
  regenHome: 30, regenIdle: 3, idleAfter: ticks(4),
};
const PROJ = { bolt: perTick(16), tower: perTick(14), unit: perTick(10), life: ticks(2), launchDy: 300, aimDy: 200 };
const CHEST = { first: ticks(12), every: ticks(20), gold: 40 };
const MYSTERY_ODDS = [70, 10, 15, 5];   // nothing / common squad / epic / legendary, in percent
const HIT_FLASH = 4;                      // ticks a hit flash shows (render reads hitT)
const LUNGE_TICKS = 5;

const QUESTS = [
  { id: 'mines', kind: 'mine', need: 2, reward: 60 },
  { id: 'barracks', kind: 'barracks', need: 3, reward: 75 },
  { id: 'towers', kind: 'tower', need: 2, reward: 60 },
  { id: 'tiles', kind: 'tiles', need: 35, reward: 60 },
];

// ---------- themes (static data, picked by the map stream) ----------
const THEME_KEYS = ['meadow', 'desert', 'snow'];
const THEMES = {
  meadow: { name: 'meadow', ground: ['#9bd06a', '#8fc75f'], side: '#5f8f3a', bg: '#3f6b2a', obst: ['tree', 'tree', 'rock'] },
  desert: { name: 'desert', ground: ['#ecd08f', '#e4c47d'], side: '#b48a46', bg: '#8a6630', obst: ['cactus', 'rock', 'cactus'] },
  snow:   { name: 'snow',   ground: ['#e6eef6', '#dbe6f1'], side: '#93a8bf', bg: '#4d6582', obst: ['pine', 'ice', 'pine'] },
};

// ---------- map generation (static: rebuilt from the seed, never hashed or snapshotted) ----------
const BASE_POS = [null, { c: 5, r: 16 }, { c: 5, r: 2 }];
const baseTile = (team) => idx(BASE_POS[team].c, BASE_POS[team].r);

function generateMap(seed) {
  const rng = new Prng(streamSeed(seed, 1));
  const themeKey = THEME_KEYS[rng.int(THEME_KEYS.length)];
  const theme = THEMES[themeKey];
  const tiles = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      tiles.push({
        i: idx(c, r), c, r, x: hexX(c, r), y: hexY(r), obst: '', nb: neighbors(c, r),
        shade: (c * 7 + r * 3) % 2, deco: rng.int(1000),
        owner: TEAM_NONE, bld: 0, rubble: 0, chest: 0,   // dynamic fields: owned by Engine
      });
    }
  }
  const isProtected = (c, r) =>
    hexDist(c, r, BASE_POS[1].c, BASE_POS[1].r) <= 2 || hexDist(c, r, BASE_POS[2].c, BASE_POS[2].r) <= 2;

  for (let attempt = 0; attempt < 30; attempt++) {
    for (const t of tiles) t.obst = '';
    // random clumps in rows 1..9, mirrored onto the bottom half; row 9 is the middle
    const seeds = 6 + rng.int(3);
    for (let s = 0; s < seeds; s++) {
      let c = rng.int(COLS), r = rng.int(9) + 1;
      const len = 1 + rng.int(3);
      for (let k = 0; k < len; k++) {
        if (inMap(c, r) && !isProtected(c, r)) {
          const type = theme.obst[rng.int(theme.obst.length)];
          tiles[idx(c, r)].obst = type;
          tiles[idx(c, ROWS - 1 - r)].obst = type;
        }
        const nb = neighbors(c, r);
        const n = tiles[nb[rng.int(nb.length)]];
        c = n.c; r = Math.min(9, Math.max(1, n.r));
      }
    }
    const seen = new Uint8Array(NTILES);
    const q = [baseTile(TEAM_BLUE)]; seen[q[0]] = 1;
    for (let h = 0; h < q.length; h++) {
      for (const n of tiles[q[h]].nb) if (!seen[n] && !tiles[n].obst) { seen[n] = 1; q.push(n); }
    }
    if (!seen[baseTile(TEAM_RED)]) continue;
    for (const t of tiles) if (!t.obst && !seen[t.i]) t.obst = theme.obst[0];   // fill isolated pockets
    let obst = 0;
    for (const t of tiles) if (t.obst) obst++;
    if (obst * 100 < NTILES * 8) continue;
    break;
  }
  return { tiles, theme, themeKey };
}
