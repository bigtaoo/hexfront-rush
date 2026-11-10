// What the results' table shows of a match, for both sides: the gold mines and barracks built
// (the sim counts those itself, TeamState.built), the map events (chests, camps) taken, the
// biggest army fielded, and whether a legendary troop joined the player. Read from the engine's
// state and events after every tick; nothing here touches the sim.

import type { Engine } from '../sim/engine';
import { TEAMS } from '../sim/rules';

export interface SideStats {
  mines: number;
  barracks: number;
  events: number;
  peak: number;
}

export class MatchStats {
  /** The map events (chests, camps) on the map at the start. */
  eventsTotal = 0;
  /** Per team (index by team id), the map events taken and the most troops on the field at once. */
  private readonly events: number[] = [0, 0, 0];
  private readonly peak: number[] = [0, 0, 0];
  /** A legendary troop joined the player's side (a barracks or a mystery). */
  legend = false;

  reset(eng: Engine): void {
    this.eventsTotal = eng.tiles.filter((t) => t.event).length;
    this.events.fill(0);
    this.peak.fill(0);
    this.legend = false;
  }

  /** After a tick: its events and the army sizes. */
  step(eng: Engine, me: number): void {
    for (const e of eng.events) {
      if (e.type === 'mapEvent' && e.team) this.events[e.team]!++;
      if ((e.type === 'barracks' || e.type === 'mysteryWin') && e.team === me && e.rarity === 3) this.legend = true;
    }
    for (const t of TEAMS) this.peak[t] = Math.max(this.peak[t]!, eng.team[t]!.units);
  }

  taken(team: number): number {
    return this.events[team] ?? 0;
  }

  side(eng: Engine, team: number): SideStats {
    const b = eng.team[team]!.built;
    return { mines: b.mine, barracks: b.barracks, events: this.taken(team), peak: this.peak[team] ?? 0 };
  }
}
