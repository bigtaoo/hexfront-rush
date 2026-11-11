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

/** The tiles to walk to get from `from` to `to`, `to` last and `from` left out; empty when it is
 *  already there, null when the target is a wall or walled off. */
export function bfsPath(tiles: readonly Tile[], from: number, to: number): number[] | null {
  if (from === to) return [];
  if (to < 0 || to >= NTILES || tiles[to]!.obst) return null;
  const prev = new Int16Array(NTILES).fill(-1);
  prev[from] = from;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const i = q[h]!;
    if (i === to) break;
    for (const n of tiles[i]!.nb) {
      if (prev[n] === -1 && !tiles[n]!.obst) {
        prev[n] = i;
        q.push(n);
      }
    }
  }
  if (prev[to] === -1) return null;
  const path: number[] = [];
  for (let i = to; i !== from; i = prev[i]!) path.push(i);
  path.reverse();
  return path;
}
