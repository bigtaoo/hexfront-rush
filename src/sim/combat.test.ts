// Fighting (combat.ts), the parts the golden hashes pin but do not describe: the troop cap and
// which barracks fills a freed slot, what a building's fall leaves behind, the castle ending the
// match, and who may claim a tile.

import { describe, expect, it } from 'vitest';
import { claimTile, damage, spawnUnit, updateBuildings } from './combat';
import { Engine } from './engine';
import { PHASE_END, TEAM_BLUE, TEAM_NONE, TEAM_RED, UNIT_CAP, type UnitKey } from './rules';
import { baseTile } from './map';
import type { Building } from './types';

const fresh = () => new Engine({ seed: 31, aiBlue: false, aiRed: false });

/** A free tile of the team's half, nowhere near the castle. */
function freeTile(e: Engine, from = 0): number {
  for (let i = from; i < e.tiles.length; i++) {
    const t = e.tiles[i]!;
    if (!t.obst && !t.bld) return i;
  }
  throw new Error('no free tile');
}

/** A barracks that will train `unit` the moment updateBuildings looks at it. */
function readyBarracks(e: Engine, team: number, unit: UnitKey, rarity: number, from: number): Building {
  const b = e.addBuilding(team, 'barracks', freeTile(e, from), { unit, rarity });
  b.spawnT = 0;
  return b;
}

const aliveOf = (e: Engine, team: number) => e.units.filter((u) => u.alive && u.team === team).length;

describe('the troop cap', () => {
  it('stops a barracks, and the freed slot goes to the rarest one waiting', () => {
    const e = fresh();
    const common = readyBarracks(e, TEAM_BLUE, 'militia', 0, 0);
    const best = readyBarracks(e, TEAM_BLUE, 'colossus', 3, common.tile + 1);
    while (aliveOf(e, TEAM_BLUE) < UNIT_CAP) spawnUnit(e, TEAM_BLUE, 'militia', 1000, 1000, 0);
    expect(aliveOf(e, TEAM_BLUE)).toBe(UNIT_CAP);

    updateBuildings(e);
    expect(aliveOf(e, TEAM_BLUE)).toBe(UNIT_CAP); // full: nobody trains
    expect(best.spawnT).toBe(0); // and the timer stays run out, so a slot fills at once

    e.units.find((u) => u.alive)!.alive = 0;
    common.spawnT = 0;
    best.spawnT = 0;
    updateBuildings(e);
    expect(aliveOf(e, TEAM_BLUE)).toBe(UNIT_CAP);
    expect(e.units.at(-1)!.type).toBe('colossus'); // the better troop, not the first barracks
    expect(best.spawnT).toBeGreaterThan(0);
    expect(common.spawnT).toBe(0); // still waiting its turn
  });

  it('belongs to one side: a full blue army does not stop red', () => {
    const e = fresh();
    const red = readyBarracks(e, TEAM_RED, 'militia', 0, 0);
    while (aliveOf(e, TEAM_BLUE) < UNIT_CAP) spawnUnit(e, TEAM_BLUE, 'militia', 1000, 1000, 0);
    updateBuildings(e);
    expect(aliveOf(e, TEAM_RED)).toBe(1);
    expect(red.spawnT).toBeGreaterThan(0);
  });
});

describe('a building falls', () => {
  it('leaves rubble the other side holds, and takes its card back', () => {
    const e = fresh();
    const ti = freeTile(e);
    const b = e.addBuilding(TEAM_BLUE, 'mine', ti, null);
    const t = e.tiles[ti]!;
    expect(t.owner).toBe(TEAM_BLUE);
    expect(e.team[TEAM_BLUE]!.open[ti]).toBe(1);

    e.events.length = 0;
    damage(e, b, b.maxhp * 99, TEAM_RED, 1);
    expect(b.alive).toBe(0);
    expect(t.bld).toBe(0);
    expect(t.rubble).toBe(1);
    expect(t.owner).toBe(TEAM_RED);
    expect(e.team[TEAM_BLUE]!.open[ti]).toBe(0);
    expect(e.blds).not.toContain(b);
    expect(e.ent(b.id)).toBeFalsy();
    expect(e.events.map((x) => x.type)).toContain('bldDown');
  });

  it('takes twice as long from a troop with no siege strength', () => {
    const e = fresh();
    const plain = e.addBuilding(TEAM_BLUE, 'mine', freeTile(e), null);
    const hard = e.addBuilding(TEAM_RED, 'mine', freeTile(e, plain.tile + 1), null);
    damage(e, plain, 100, TEAM_RED, 1);
    damage(e, hard, 100, TEAM_BLUE, 2);
    expect(plain.maxhp - plain.hp).toBe((hard.maxhp - hard.hp) / 2);
  });

  it('the castle ends the match for the side that broke it', () => {
    const e = fresh();
    const home = e.blds.find((b) => b.type === 'base' && b.team === TEAM_BLUE)!;
    expect(home.tile).toBe(baseTile(TEAM_BLUE));
    damage(e, home, home.maxhp * 99, TEAM_RED, 1);
    expect(e.phase).toBe(PHASE_END);
    expect(e.result?.winner).toBe(TEAM_RED);
    expect(e.result?.reason).toBe('base');
  });
});

describe('claiming a tile', () => {
  it('takes open ground, never a rock and never the ground an enemy building stands on', () => {
    const e = fresh();
    const open = e.tiles[freeTile(e)]!;
    open.owner = TEAM_NONE;
    claimTile(e, TEAM_RED, open);
    expect(open.owner).toBe(TEAM_RED);

    const rock = e.tiles.find((t) => t.obst)!;
    const was = rock.owner;
    claimTile(e, TEAM_RED, rock);
    expect(rock.owner).toBe(was);

    const theirs = e.tiles[e.addBuilding(TEAM_BLUE, 'mine', freeTile(e, open.i + 1), null).tile]!;
    claimTile(e, TEAM_RED, theirs);
    expect(theirs.owner).toBe(TEAM_BLUE);
  });

  it('a tile under your own building is still yours to stand on', () => {
    const e = fresh();
    const mine = e.tiles[e.addBuilding(TEAM_RED, 'mine', freeTile(e), null).tile]!;
    mine.owner = TEAM_NONE;
    claimTile(e, TEAM_RED, mine);
    expect(mine.owner).toBe(TEAM_RED);
  });
});
