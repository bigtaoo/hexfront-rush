// `npm run axes`: the exchange-rate table. What is one design axis worth, in production cost?
//
// A unit's cost is its spawn time (a barracks makes one troop every `spawn` seconds), so the
// honest unit of account is spawn-seconds. This bench asks: if I give a unit +10% hp, how many
// fewer of them is that worth? The answer is the price of that axis.
//
// How: clone the unit with the axis changed, and send an equal-cost squad of the clone against an
// equal-cost squad of the original. The margin (the winner's surviving value, as a share of one
// side's budget) says the clone is better, but not by how much in cost. So first calibrate the
// same unit against itself with 5/10/20/35% MORE bodies, which gives a margin-per-cost curve, and
// read the axis's margin back through it. Both squads swap colours, so position cannot bias it.
//
// This retires the old `sqrt(hp x dps)` value model, which priced what a unit is made of rather
// than what it does. It is the ruler a ninth unit's numbers get derived from.
//
//   npm run axes             2 seeds a cell
//   N=4 npm run axes         steadier, slower

import { Engine } from '../src/sim/engine';
import { updateProjectiles, updateUnits } from '../src/sim/troops';
import { TICK_RATE } from '../src/sim/fixed';
import { hexX, hexY, idx, MID_ROW, TILE } from '../src/sim/hex';
import { TEAM_BLUE, TEAM_RED, UNIT_KEYS, UNITS, type UnitDef, type UnitKey } from '../src/sim/rules';

const BUDGET = 360; // spawn-seconds a side: big squads, so a 5% change in bodies is resolvable
const MAX_SECS = 120;
const MOD = 'xmod' as UnitKey; // the clone's slot; nothing iterating UNIT_KEYS ever sees it
const seeds = Array.from({ length: Number(process.env.N) || 2 }, (_, i) => 11 + 37 * i);

const count = (k: UnitKey) => Math.max(1, Math.trunc((BUDGET * TICK_RATE) / UNITS[k].spawn));

function spot(e: Engine, r: number): { x: number; y: number } {
  for (const c of [6, 5, 7, 4, 8]) if (!e.tiles[idx(c, r)]?.obst) return { x: hexX(c, r), y: hexY(r) };
  return { x: hexX(6, r), y: hexY(r) };
}

function place(e: Engine, team: number, type: UnitKey, n: number, r: number): void {
  const p = spot(e, r);
  const dir = team === TEAM_BLUE ? 1 : -1;
  for (let k = 0; k < n; k++) e.spawnUnit(team, type, p.x + ((k % 9) - 4) * 400, p.y + Math.trunc(k / 9) * 400 * dir, 0);
}

const valueOf = (e: Engine, team: number): number => {
  let v = 0;
  for (const u of e.units) if (u.alive && u.team === team) v += UNITS[u.type].spawn;
  return v / TICK_RATE;
};

/** One fight. Returns (value left to the first squad - value left to the second) / BUDGET. */
function fight(aK: UnitKey, aN: number, bK: UnitKey, bN: number, seed: number, swap: boolean): number {
  const e = new Engine({ seed, aiBlue: false, aiRed: false });
  const [t1, t2] = swap ? [TEAM_RED, TEAM_BLUE] : [TEAM_BLUE, TEAM_RED];
  place(e, t1, aK, aN, t1 === TEAM_BLUE ? MID_ROW + 2 : MID_ROW - 2);
  place(e, t2, bK, bN, t2 === TEAM_BLUE ? MID_ROW + 2 : MID_ROW - 2);
  for (let t = 0; t < MAX_SECS * TICK_RATE; t++) {
    updateUnits(e);
    updateProjectiles(e);
    e.tick++;
    let a = 0, b = 0;
    for (const u of e.units) if (u.alive) (u.team === t1 ? a++ : b++);
    if (!a || !b) break;
  }
  return (valueOf(e, t1) - valueOf(e, t2)) / BUDGET;
}

/** The margin averaged over the seeds and both colour assignments. */
function margin(aK: UnitKey, aN: number, bK: UnitKey, bN: number): number {
  let s = 0;
  for (const sd of seeds) s += fight(aK, aN, bK, bN, sd, false) + fight(aK, aN, bK, bN, sd, true);
  return s / (2 * seeds.length);
}

/** Register the clone: the unit `k` with `patch` applied on top. */
function clone(k: UnitKey, patch: Partial<UnitDef>): void {
  UNITS[MOD] = { ...UNITS[k], ...patch, key: MOD };
}

/** The axes, as a patch on the already-built (engine-unit) definition. */
const AXES: { name: string; of: (d: UnitDef) => Partial<UnitDef> }[] = [
  { name: 'hp +10%', of: (d) => ({ hp: Math.round(d.hp * 1.1) }) },
  { name: 'dmg +10%', of: (d) => ({ dmg: Math.round(d.dmg * 1.1) }) },
  { name: 'rate -10% (faster)', of: (d) => ({ rate: Math.max(1, Math.round(d.rate * 0.9)) }) },
  { name: 'range +0.5 tile', of: (d) => ({ range: d.range + Math.round(TILE / 2) }) },
  { name: 'speed +10%', of: (d) => ({ speed: Math.max(1, Math.round(d.speed * 1.1)) }) },
  { name: 'size -10%', of: (d) => ({ size: Math.round(d.size * 0.9) }) },
  { name: 'splash +0.5 tile', of: (d) => ({ splash: d.splash + Math.round(TILE / 2) }) },
  { name: 'aggro +1 tile', of: (d) => ({ aggroMobile: d.aggroMobile + TILE }) },
];

const pad = (s: string, n: number) => s.padStart(n);
const ks = UNIT_KEYS.slice();

// --- calibration: the same unit, with more bodies ---
const CAL = [1.05, 1.1, 1.2, 1.35];
const curve: Record<string, { m: number; y: number }[]> = {};
for (const k of ks) {
  const n = count(k);
  const pts = [{ m: 1, y: 0 }];
  for (const target of CAL) {
    const nm = Math.round(n * target);
    if (nm <= (pts[pts.length - 1]!.m * n)) continue;
    clone(k, {});
    pts.push({ m: nm / n, y: margin(MOD, nm, k, n) });
  }
  curve[k] = pts;
}

/** Read a margin back through the calibration curve: the cost multiplier it is worth. */
function worth(k: UnitKey, y: number): number {
  const pts = curve[k]!;
  if (y <= 0) {
    const s = (pts[1]!.y - 0) / (pts[1]!.m - 1);
    return s > 0 ? 1 + y / s : NaN;
  }
  for (let i = 1; i < pts.length; i++) {
    if (y <= pts[i]!.y) {
      const a = pts[i - 1]!, b = pts[i]!;
      return b.y === a.y ? b.m : a.m + ((y - a.y) * (b.m - a.m)) / (b.y - a.y);
    }
  }
  const a = pts[pts.length - 2]!, b = pts[pts.length - 1]!;
  return b.y === a.y ? b.m : b.m + ((y - b.y) * (b.m - a.m)) / (b.y - a.y);
}

console.log(`axes  budget ${BUDGET} spawn-seconds a side, ${seeds.length} seeds x 2 colours a cell`);
console.log(`      a cell is what the axis is worth as a % of the unit's production cost`);
console.log(`\ncalibration (margin at +N% bodies)`);
console.log(pad('', 11) + ks.map((k) => pad(k.slice(0, 8), 9)).join(''));
for (let i = 1; i <= CAL.length; i++) {
  const row = ks.map((k) => {
    const p = curve[k]![i];
    return p ? pad(`${Math.round((p.m - 1) * 100)}%:${p.y.toFixed(2)}`, 9) : pad('-', 9);
  });
  console.log(pad(`+${Math.round((CAL[i - 1]! - 1) * 100)}%`, 11) + row.join(''));
}

console.log(`\nexchange rate`);
console.log(pad('', 20) + ks.map((k) => pad(k.slice(0, 8), 9)).join('') + pad('mean', 9));
for (const ax of AXES) {
  const vals: number[] = [];
  const cells = ks.map((k) => {
    const d = UNITS[k];
    const patch = ax.of(d);
    if (Object.entries(patch).every(([f, v]) => (d as unknown as Record<string, number>)[f] === v)) return pad('-', 9);
    clone(k, patch);
    const n = count(k);
    const w = (worth(k, margin(MOD, n, k, n)) - 1) * 100;
    if (Number.isFinite(w)) vals.push(w);
    return pad(`${w > 0 ? '+' : ''}${w.toFixed(0)}%`, 9);
  });
  const mean = vals.length ? vals.reduce((t, v) => t + v, 0) / vals.length : NaN;
  console.log(pad(ax.name, 20) + cells.join('') + pad(`${mean > 0 ? '+' : ''}${mean.toFixed(0)}%`, 9));
}
