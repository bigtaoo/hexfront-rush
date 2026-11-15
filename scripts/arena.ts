// The unit-balance bench: two squads of equal production cost meet on open ground, nothing else
// on the board. It answers the one question a whole match cannot: does unit A beat unit B?
//
// Why equal *production* cost and not gold: a barracks makes one troop every `spawn` seconds, so
// spawn-seconds are what a side actually pays for an army. A squad's budget is BUDGET
// spawn-seconds (18 militia, 7 colossus, ...), which is also roughly one minute of two barracks.
//
// A cell is blue's share of the surviving value (again in spawn-seconds), 50% = even, run with
// the sides swapped so position cannot bias it. Annihilation is common, so share beats win/lose:
// it says *how* badly, which is what a counter relationship looks like.
//
//   npm run arena            the 8x8 matrix
//   npm run arena -- squad   the same, 3 seeds a cell (slower, steadier)
//   npm run arena -- mix     compositions, not single kinds: where a counter CYCLE can live
//
// Why `mix` exists: the 8x8 matrix of pure squads can only ever be a total order, because every
// stat axis is monotone. A cycle needs compositions and a conditional mechanic (targeting
// preference) that is a strength against one composition and a weakness against another.

import { Engine } from '../src/sim/engine';
import { updateProjectiles, updateUnits } from '../src/sim/troops';
import { TICK_RATE } from '../src/sim/fixed';
import { hexX, hexY, idx, MID_ROW } from '../src/sim/hex';
import { TEAM_BLUE, TEAM_RED, UNIT_KEYS, UNITS, type UnitKey } from '../src/sim/rules';

const BUDGET = 126;
const MAX_SECS = 90;
const COUNT: Record<string, number> = {};
for (const k of UNIT_KEYS) COUNT[k] = Math.max(1, Math.trunc((BUDGET * TICK_RATE) / UNITS[k].spawn));

/** A free tile at the centre column of this row, searching outward if the middle is rock. */
function spot(e: Engine, r: number): { x: number; y: number } {
  for (const c of [6, 5, 7, 4, 8]) {
    const t = e.tiles[idx(c, r)];
    if (t && !t.obst) return { x: hexX(c, r), y: hexY(r) };
  }
  return { x: hexX(6, r), y: hexY(r) };
}

function place(e: Engine, team: number, type: UnitKey, n: number, r: number): void {
  const p = spot(e, r);
  for (let k = 0; k < n; k++) {
    e.spawnUnit(team, type, p.x + ((k % 5) - 2) * 420, p.y + Math.trunc(k / 5) * 420 * (team === TEAM_BLUE ? 1 : -1), 0);
  }
}

const valueOf = (e: Engine, team: number): number => {
  let v = 0;
  for (const u of e.units) if (u.alive && u.team === team) v += UNITS[u.type].spawn;
  return v / TICK_RATE;
};

/** Blue's share of the surviving value after the two squads meet. */
export function clash(blue: UnitKey, red: UnitKey, seed: number): number {
  const e = new Engine({ seed, aiBlue: false, aiRed: false });
  place(e, TEAM_BLUE, blue, COUNT[blue]!, MID_ROW + 2);
  place(e, TEAM_RED, red, COUNT[red]!, MID_ROW - 2);
  for (let t = 0; t < MAX_SECS * TICK_RATE; t++) {
    updateUnits(e);
    updateProjectiles(e);
    e.tick++;
    let b = 0, r = 0;
    for (const u of e.units) if (u.alive) (u.team === TEAM_BLUE ? b++ : r++);
    if (!b || !r) break;
  }
  const b = valueOf(e, TEAM_BLUE), r = valueOf(e, TEAM_RED);
  return b + r === 0 ? 0.5 : b / (b + r);
}

/** A pairing, both ways round, averaged: 50% = even, 100% = `a` wipes `b` without a loss. */
export function matchup(a: UnitKey, b: UnitKey, seeds: number[]): number {
  let s = 0;
  for (const sd of seeds) s += clash(a, b, sd) + (1 - clash(b, a, sd));
  return (100 * s) / (2 * seeds.length);
}

/** A composition spends the same budget, split evenly over its slots: a kind listed twice gets
 *  twice the share. These are the shapes an actual army takes, not every possible mixture. */
export const COMPS: { name: string; of: UnitKey[] }[] = [
  { name: 'rush', of: ['militia', 'militia', 'slinger'] },
  { name: 'line', of: ['slinger', 'bowman', 'bowman'] },
  { name: 'heavy', of: ['shield', 'ogre', 'ogre'] },
  { name: 'magic', of: ['adept', 'adept', 'bowman'] },
  { name: 'mixed', of: ['militia', 'bowman', 'ogre'] },
];

function placeComp(e: Engine, team: number, of: UnitKey[], r: number): void {
  const share = BUDGET / of.length;
  for (let i = 0; i < of.length; i++) {
    const k = of[i];
    const n = Math.max(1, Math.trunc((share * TICK_RATE) / UNITS[k].spawn));
    const p = spot(e, r);
    for (let j = 0; j < n; j++) {
      e.spawnUnit(team, k, p.x + ((j % 5) - 2) * 420 + (i - 1) * 180,
        p.y + (Math.trunc(j / 5) * 420 + i * 260) * (team === TEAM_BLUE ? 1 : -1), 0);
    }
  }
}

/** Blue composition's share of the surviving value, both ways round, averaged. */
export function compMatch(a: UnitKey[], b: UnitKey[], seeds: number[]): number {
  let s = 0;
  for (const sd of seeds) {
    for (const swap of [false, true]) {
      const e = new Engine({ seed: sd, aiBlue: false, aiRed: false });
      const [t1, t2] = swap ? [TEAM_RED, TEAM_BLUE] : [TEAM_BLUE, TEAM_RED];
      placeComp(e, t1, a, t1 === TEAM_BLUE ? MID_ROW + 2 : MID_ROW - 2);
      placeComp(e, t2, b, t2 === TEAM_BLUE ? MID_ROW + 2 : MID_ROW - 2);
      for (let t = 0; t < MAX_SECS * TICK_RATE; t++) {
        updateUnits(e);
        updateProjectiles(e);
        e.tick++;
        let x = 0, y = 0;
        for (const u of e.units) if (u.alive) (u.team === t1 ? x++ : y++);
        if (!x || !y) break;
      }
      const x = valueOf(e, t1), y = valueOf(e, t2);
      s += x + y === 0 ? 0.5 : x / (x + y);
    }
  }
  return (100 * s) / (2 * seeds.length);
}

if (process.argv[1]?.includes('arena') && process.argv.includes('mix')) {
  const seeds = [11, 22, 33];
  const pad = (s: string, n: number) => s.padStart(n);
  console.log(`arena mix  budget ${BUDGET} spawn-seconds a side, ${seeds.length} seeds a cell, colours swapped`);
  for (const c of COMPS) console.log(`  ${c.name.padEnd(7)} ${c.of.join(' + ')}`);
  console.log(`
${pad('', 8)}${COMPS.map((c) => pad(c.name, 8)).join('')}${pad('mean', 8)}${pad('worst', 8)}`);
  for (const a of COMPS) {
    const row = COMPS.map((b) => (a === b ? 50 : compMatch(a.of, b.of, seeds)));
    const off = row.filter((_, i) => COMPS[i] !== a);
    const mean = off.reduce((t, v) => t + v, 0) / off.length;
    console.log(
      pad(a.name, 8) + row.map((v, i) => pad(COMPS[i] === a ? '-' : `${Math.round(v)}%`, 8)).join('') +
      pad(`${Math.round(mean)}%`, 8) + pad(`${Math.round(Math.min(...off))}%`, 8),
    );
  }
} else if (process.argv[1]?.includes('arena')) {
  const seeds = process.argv.includes('squad') ? [11, 22, 33] : [11];
  const ks = UNIT_KEYS.slice();
  const pad = (s: string, n: number) => s.padStart(n);
  console.log(`arena  budget ${BUDGET} spawn-seconds a side  (${ks.map((k) => `${k} x${COUNT[k]}`).join(', ')})`);
  console.log(`\n${pad('', 9)}${ks.map((k) => pad(k.slice(0, 7), 8)).join('')}${pad('mean', 8)}${pad('spread', 8)}`);
  for (const a of ks) {
    const row = ks.map((b) => (a === b ? 50 : matchup(a, b, seeds)));
    const off = row.filter((_, i) => ks[i] !== a);
    const mean = off.reduce((t, v) => t + v, 0) / off.length;
    console.log(
      pad(a, 9) + row.map((v, i) => pad(ks[i] === a ? '-' : `${Math.round(v)}%`, 8)).join('') +
      pad(`${Math.round(mean)}%`, 8) + pad(`${Math.round(Math.max(...off) - Math.min(...off))}`, 8),
    );
  }
}
