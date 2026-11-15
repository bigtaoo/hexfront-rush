// Walking the hex grid: the two breadth-first searches the sim lives on. Both see the map as a
// plain graph of tiles — a tile with an obstacle on it is a wall, anything else is open — so a
// building or a unit standing somewhere never blocks a path. That is on purpose: troops walk
// through each other and push past, and a path that changed every time a mine went up would send
// the whole army back to the drawing board every few seconds.
//
// Integer work only, no randomness, and the tile order is the grid's own, so both give the same
// answer on every machine (the whole sim rests on that: see fixed.ts).

import { NTILES } from './hex';
import type { Tile } from './map';

/** The unreachable mark distanceField leaves: far past any real walk across the map. */
export const FAR = 9999;

/** Walking distance in tiles from `start` to every tile, FAR where there is no way round the
 *  obstacles. Static for a match (the map's obstacles never move), so the engine takes one per
 *  castle at the start and reads it for the rest of the match. */
export function distanceField(tiles: readonly Tile[], start: number): Int16Array {
  const d = new Int16Array(NTILES).fill(FAR);
  d[start] = 0;
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const i = q[h]!;
    for (const n of tiles[i]!.nb) {
      if (d[n] === FAR && !tiles[n]!.obst) {
        d[n] = d[i]! + 1;
        q.push(n);
      }
    }
  }
  return d;
}

/** The breadth-first search both walkers share. It writes its prev-tree into scratch arrays kept
 *  between calls rather than a fresh Int16Array(NTILES) each time — `pGen` says which call a cell
 *  belongs to, so nothing is cleared. Returns 1 when `from` is already `to`, -1 when the target is
 *  a wall or walled off, 0 when the tree in `pPrev` reaches it. Visit order is the tile order, so
 *  the tree is the same on every machine. */
const pPrev = new Int16Array(NTILES);
const pGen = new Int32Array(NTILES);
let pG = 0;
const pQ: number[] = [];

function bfs(tiles: readonly Tile[], from: number, to: number): number {
  if (from === to) return 1;
  if (to < 0 || to >= NTILES || tiles[to]!.obst) return -1;
  if (pG === 0x7fffffff) {
    pGen.fill(0);
    pG = 0;
  }
  const gen = ++pG;
  pGen[from] = gen;
  pPrev[from] = from;
  pQ.length = 0;
  pQ.push(from);
  for (let h = 0; h < pQ.length; h++) {
    const i = pQ[h]!;
    if (i === to) break;
    for (const n of tiles[i]!.nb) {
      if (pGen[n] !== gen && !tiles[n]!.obst) {
        pGen[n] = gen;
        pPrev[n] = i;
        pQ.push(n);
      }
    }
  }
  return pGen[to] === gen ? 0 : -1;
}

/** The tiles to walk to get from `from` to `to`, `to` last and `from` left out; empty when it is
 *  already there, null when the target is a wall or walled off. */
export function bfsPath(tiles: readonly Tile[], from: number, to: number): number[] | null {
  const r = bfs(tiles, from, to);
  if (r !== 0) return r === 1 ? [] : null;
  const path: number[] = [];
  for (let i = to; i !== from; i = pPrev[i]!) path.push(i);
  path.reverse();
  return path;
}

/** Just the first tile to step onto, for the caller that only ever wanted that: -1 when there is
 *  nowhere to go. Saves the path array and its reverse on the sim's hot path. */
export function bfsStep(tiles: readonly Tile[], from: number, to: number): number {
  if (bfs(tiles, from, to) !== 0) return -1;
  let i = to;
  while (pPrev[i] !== from) i = pPrev[i]!;
  return i;
}
