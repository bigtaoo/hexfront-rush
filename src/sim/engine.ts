// Deterministic lockstep simulation for Hexfront Rush.
//
// Contract (after Holy Kicker's engine): the whole match is a pure function of
// (config, command stream). step(cmds) advances exactly one tick of 1/TICK_RATE s; state is
// integers only (fixed point, ticks, ids); randomness comes from named Prng streams; nothing
// reads the clock, the DOM or Math.random. Two machines that feed the same commands at the
// same ticks compute the same hash() at every tick, which is what online lockstep, replays,
// snapshots and the golden tests rely on. Entities reference each other by id, never by object,
// so the state serialises as plain data. The sim emits events (with fixed-point positions and
// teams) and the view decides what to draw or play: no effects, strings or audio live here.
//
// The class holds the state and the step; the systems live beside it as functions of the engine:
// economy.ts (gold, map events, quests, buying), combat.ts (buildings, damage, claiming tiles),
// guard.ts (the castle guards), troops.ts (marching, separation, projectiles) and ai.ts.

import { aiUpdate } from './ai';
import { cardLayout, fillerCard, type CardLayout } from './cardLayout';
import { spawnUnit, updateBuildings } from './combat';
import { tryBuy, updateEconomy, updateQuests } from './economy';
import { ticks, TICK_RATE } from './fixed';
import { hashState } from './hash';
import { idx, inMap, NTILES, worldToHex } from './hex';
import type { Cmd } from './input';
import { baseTile, generateMap, type ThemeKey, type Tile } from './map';
import { Prng, streamSeed } from './prng';
import { makeConfig, type ConfigInput, type SideSetup } from './setup';
import {
  BLD_RADIUS, BUILD, ENGINE_VERSION, enemyOf, GUARD, INTRO_TICKS, MAX_PLAY_TICKS, SIEGE, siegeLevel, WAVE_TICKS,
  PHASE_END, PHASE_INTRO, PHASE_PLAY, TEAM_BLUE, TEAM_NONE, TEAM_RED, TEAMS, UNITS, UNITS_BY_RARITY,
  type BuildingType, type UnitKey,
} from './rules';
import { updateProjectiles, updateUnits } from './troops';
import { guardSpots, updateGuard, type GuardSpots } from './guard';
import {
  isDown, type AiState, type Building, type EndReason, type EngineConfig, type Entity, type Guard, type MatchResult,
  type Projectile, type SimEvent, type SimEventType, type TeamState, type Unit,
} from './types';

const RNG_KEYS = ['offer', 'loot', 'unit', 'ai1', 'ai2', 'quest', 'guard1', 'guard2'] as const;
type RngKey = (typeof RNG_KEYS)[number];

/** Every mutable field of the engine, as plain data (JSON-safe once copied). */
export interface EngineState {
  v: number;
  config: EngineConfig;
  tick: number;
  phase: number;
  introT: number;
  playT: number;
  lastCount: number;
  nextId: number;
  result: MatchResult | null;
  tiles: { owner: number[]; bld: number[]; rubble: number[]; event: number[] };
  guards: Guard[];
  units: Unit[];
  blds: Building[];
  projs: Projectile[];
  team: TeamState[];
  ai: AiState[];
  quests: number[];
  rng: Record<RngKey, number>;
}

export class Engine {
  readonly config: EngineConfig;
  readonly tiles: Tile[];
  readonly themeKey: ThemeKey;
  /** Per team, each tile's walking distance to that team's castle (static). */
  readonly flow: (Int16Array | null)[];
  /** Per team, where the guard may wander around its castle, and how much it likes each (static). */
  readonly spots: (GuardSpots | null)[];
  /** The cards each team finds on each tile (static, from the seed: cardLayout.ts). */
  readonly layout: CardLayout;
  rng: Record<RngKey, Prng>;
  tick = 0;
  phase = PHASE_INTRO;
  introT = INTRO_TICKS;
  /** Ticks of play so far (no clock runs down: a match ends when a castle falls). */
  playT = 0;
  lastCount = 4;
  nextId = 1;
  result: MatchResult | null = null;
  units: Unit[] = [];
  blds: Building[] = [];
  projs: Projectile[] = [];
  events: SimEvent[] = [];
  /** id -> entity; lookup only, never walked (rebuilt on restore). */
  ents = new Map<number, Entity>();
  team: TeamState[] = [];
  guards: Guard[] = [];
  questList: number[];
  ai: AiState[];
  /** Checkpoint hashes a replay stores (replay.ts recordChecks); not part of the state. */
  checks: [number, number][] = [];

  /** Ticks of play before the siege (config.siege). */
  readonly siegeAt: number;

  /** config: the seed, which teams the built-in AI drives, and each side's setup (setup.ts). */
  constructor(config: ConfigInput) {
    this.config = makeConfig(config);
    this.siegeAt = ticks(this.config.siege);
    const seed = this.config.seed;
    const m = generateMap(seed);
    this.tiles = m.tiles;
    this.themeKey = m.themeKey;
    this.flow = [null, this.distanceField(baseTile(TEAM_BLUE)), this.distanceField(baseTile(TEAM_RED))];
    this.spots = [null, guardSpots(this.tiles, TEAM_BLUE), guardSpots(this.tiles, TEAM_RED)];
    this.layout = cardLayout(this.tiles, seed);
    for (const t of this.tiles) t.event = this.layout.event[t.i];
    this.rng = {
      offer: new Prng(streamSeed(seed, 2)), loot: new Prng(streamSeed(seed, 3)),
      unit: new Prng(streamSeed(seed, 4)),
      ai1: new Prng(streamSeed(seed, 6)), ai2: new Prng(streamSeed(seed, 7)),
      quest: new Prng(streamSeed(seed, 8)),
      guard1: new Prng(streamSeed(seed, 9)), guard2: new Prng(streamSeed(seed, 10)),
    };
    this.team = [null as unknown as TeamState];
    for (let k = 0; k < TEAMS.length; k++) {
      this.team.push({
        gold: this.setupOf(TEAMS[k]!).gold, tiles: 0, units: 0, built: { mine: 0, tower: 0, barracks: 0, mystery: 0 },
        offers: new Array<number>(NTILES).fill(-1), open: new Array<number>(NTILES).fill(0), questIdx: 0, questBase: 0, questT: -1000, incomeCarry: 0,
      });
    }
    for (const t of TEAMS) {
      const b = this.addBuilding(t, 'base', baseTile(t), null);
      b.hp = b.maxhp = Math.max(1, Math.trunc((b.maxhp * this.setupOf(t).castle) / 100));
    }
    this.guards = [null as unknown as Guard, this.makeGuard(TEAM_BLUE), this.makeGuard(TEAM_RED)];
    for (const t of TEAMS) this.startBuildings(t);
    for (const t of TEAMS) this.recomputeOffers(t);

    // quests: one shuffled list for both teams, so neither side gets an easier run
    const qs = [0, 1, 2, 3];
    for (let i = qs.length - 1; i > 0; i--) {
      const j = this.rng.quest.int(i + 1);
      const k = qs[i];
      qs[i] = qs[j];
      qs[j] = k;
    }
    this.questList = qs.slice(0, 3);
    this.ai = [null as unknown as AiState, { decideT: 0 }, { decideT: 0 }];
    this.countTiles();
  }

  // ---------- state: hash, snapshot, restore ----------
  /** Every mutable field, as plain data. Static map data is rebuilt from the seed instead. */
  stateOf(): EngineState {
    const owner: number[] = new Array(NTILES), bld: number[] = new Array(NTILES);
    const rubble: number[] = new Array(NTILES), event: number[] = new Array(NTILES);
    for (let i = 0; i < NTILES; i++) {
      const t = this.tiles[i];
      owner[i] = t.owner;
      bld[i] = t.bld;
      rubble[i] = t.rubble;
      event[i] = t.event;
    }
    const r = this.rng;
    return {
      v: ENGINE_VERSION, config: this.config, tick: this.tick, phase: this.phase, introT: this.introT,
      playT: this.playT, lastCount: this.lastCount,
      nextId: this.nextId, result: this.result,
      tiles: { owner, bld, rubble, event },
      guards: [this.guards[1], this.guards[2]], units: this.units, blds: this.blds, projs: this.projs,
      team: [this.team[1], this.team[2]], ai: [this.ai[1], this.ai[2]], quests: this.questList,
      rng: {
        offer: r.offer.peek(), loot: r.loot.peek(), unit: r.unit.peek(),
        ai1: r.ai1.peek(), ai2: r.ai2.peek(), quest: r.quest.peek(), guard1: r.guard1.peek(), guard2: r.guard2.peek(),
      },
    };
  }

  hash(): number {
    return hashState(this.stateOf());
  }

  /** A deep, JSON-safe copy of the state: survives postMessage, storage and the wire. */
  snapshot(): EngineState {
    return JSON.parse(JSON.stringify(this.stateOf())) as EngineState;
  }

  static restore(snap: EngineState): Engine {
    if (snap.v !== ENGINE_VERSION) throw new Error(`snapshot from engine v${snap.v}, this is v${ENGINE_VERSION}`);
    const s = JSON.parse(JSON.stringify(snap)) as EngineState;
    const e = new Engine(s.config);
    e.tick = s.tick; e.phase = s.phase; e.introT = s.introT; e.playT = s.playT; e.lastCount = s.lastCount;
    e.nextId = s.nextId; e.result = s.result;
    for (let i = 0; i < NTILES; i++) {
      const t = e.tiles[i];
      t.owner = s.tiles.owner[i]; t.bld = s.tiles.bld[i]; t.rubble = s.tiles.rubble[i]; t.event = s.tiles.event[i];
    }
    e.guards = [null as unknown as Guard, s.guards[0], s.guards[1]];
    e.units = s.units;
    e.blds = s.blds;
    e.projs = s.projs;
    e.team = [null as unknown as TeamState, s.team[0], s.team[1]];
    e.ai = [null as unknown as AiState, s.ai[0], s.ai[1]];
    e.questList = s.quests;
    for (const k of RNG_KEYS) e.rng[k] = Prng.resume(s.rng[k]);
    e.ents = new Map();
    for (const t of TEAMS) e.ents.set(e.guards[t].id, e.guards[t]);
    for (const u of e.units) e.ents.set(u.id, u);
    for (const b of e.blds) e.ents.set(b.id, b);
    e.events = [];
    return e;
  }

  // ---------- helpers ----------
  emit(type: SimEventType, data?: Omit<SimEvent, 'type'>): void {
    const ev = (data || {}) as SimEvent;
    ev.type = type;
    this.events.push(ev);
  }
  tileAt(x: number, y: number): Tile | null {
    const h = worldToHex(x, y);
    return inMap(h.c, h.r) ? this.tiles[idx(h.c, h.r)] : null;
  }
  passable(i: number): boolean {
    return i >= 0 && !this.tiles[i].obst;
  }
  /** The live entity with this id, or null (gone or dead). */
  live(id: number): Entity | null {
    if (!id) return null;
    const e = this.ents.get(id);
    if (!e) return null;
    return isDown(e) ? null : e;
  }
  ent(id: number): Entity | null {
    return id ? this.ents.get(id) || null : null;
  }
  elapsed(): number {
    return this.playT;
  }
  radiusOf(e: Entity): number {
    return e.kind === 'guard' ? GUARD.radius : e.kind === 'bld' ? BLD_RADIUS : UNITS[e.type].size;
  }
  setupOf(team: number): SideSetup {
    return team === TEAM_BLUE ? this.config.blue : this.config.red;
  }
  /** The siege steps so far (0 before it). */
  siegeLevel(): number {
    return siegeLevel(this.playT, this.siegeAt);
  }
  rngAi(team: number): Prng {
    return team === TEAM_BLUE ? this.rng.ai1 : this.rng.ai2;
  }
  rngGuard(team: number): Prng {
    return team === TEAM_BLUE ? this.rng.guard1 : this.rng.guard2;
  }

  distanceField(start: number): Int16Array {
    const d = new Int16Array(NTILES).fill(9999);
    d[start] = 0;
    const q = [start];
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      for (const n of this.tiles[i].nb) {
        if (d[n] === 9999 && !this.tiles[n].obst) {
          d[n] = d[i] + 1;
          q.push(n);
        }
      }
    }
    return d;
  }

  bfsPath(from: number, to: number): number[] | null {
    if (from === to) return [];
    if (!this.passable(to)) return null;
    const prev = new Int16Array(NTILES).fill(-1);
    prev[from] = from;
    const q = [from];
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      if (i === to) break;
      for (const n of this.tiles[i].nb) {
        if (prev[n] === -1 && !this.tiles[n].obst) {
          prev[n] = i;
          q.push(n);
        }
      }
    }
    if (prev[to] === -1) return null;
    const path: number[] = [];
    for (let i = to; i !== from; i = prev[i]) path.push(i);
    path.reverse();
    return path;
  }

  makeGuard(team: number): Guard {
    const spots = this.spots[team]!;
    const st = this.tiles[spots.start];
    const g: Guard = {
      kind: 'guard', team, id: this.nextId++, x: st.x, y: st.y, px: st.x, py: st.y, hp: GUARD.hp, maxhp: GUARD.hp,
      cd: 0, dead: 0, respT: 0, wp: spots.start, waitT: 0, face: team === TEAM_BLUE ? -1 : 1,
      lastHit: -1000, hitT: -1000, aim: 0, moving: 0, regen: 0,
    };
    this.ents.set(g.id, g);
    return g;
  }

  addBuilding(team: number, type: BuildingType, ti: number, barracks: { unit: UnitKey; rarity: number } | null): Building {
    const t = this.tiles[ti];
    const def = BUILD[type];
    const b: Building = {
      kind: 'bld', type, team, id: this.nextId++, tile: ti, x: t.x, y: t.y, hp: def.hp, maxhp: def.hp,
      timer: 0, cd: 0, alive: 1, hitT: -1000, bornT: this.tick,
      unit: barracks ? barracks.unit : '', rarity: barracks ? barracks.rarity : -1,
      spawnT: barracks ? ticks(1.5) : 0,
    };
    t.bld = b.id;
    this.team[team].open[ti] = 1;
    t.rubble = 0;
    t.owner = team;
    // a new building also claims the neutral ground around it (never an enemy's)
    for (const n of t.nb) {
      const nt = this.tiles[n];
      if (!nt.obst && nt.owner === TEAM_NONE) nt.owner = team;
    }
    this.blds.push(b);
    this.ents.set(b.id, b);
    return b;
  }

  /** A card on every free tile next to a tile the team has flipped (T.open): the layout's card
   *  (a filler card on rubble); a tile that keeps its card keeps the same one. */
  recomputeOffers(team: number): void {
    const T = this.team[team];
    const cand = new Uint8Array(NTILES);
    for (let i = 0; i < NTILES; i++) {
      if (!T.open[i]) continue;
      for (const n of this.tiles[i].nb) {
        const nt = this.tiles[n];
        if (!nt.obst && !nt.bld && !T.open[n]) cand[n] = 1;
      }
    }
    for (let i = 0; i < NTILES; i++) {
      if (!cand[i]) T.offers[i] = -1;
      else if (T.offers[i] < 0) {
        const lay = this.layout.card[team]![i];
        T.offers[i] = this.tiles[i].rubble || lay < 0 ? fillerCard(this.rng.offer) : lay;
      }
    }
  }

  /** What the side's setup puts next to its castle from the start: a barracks, then towers, each
   *  on the free neighbour nearest the enemy castle. */
  private startBuildings(team: number): void {
    const S = this.setupOf(team);
    const home = this.tiles[baseTile(team)];
    const foe = this.flow[enemyOf(team)]!;
    const spot = (): number => {
      let best = -1;
      for (const n of home.nb) {
        const t = this.tiles[n];
        if (t.obst || t.bld) continue;
        if (best < 0 || foe[n] < foe[best]) best = n;
      }
      return best;
    };
    if (S.barracks >= 0) {
      const ti = spot();
      if (ti >= 0) this.addBuilding(team, 'barracks', ti, { unit: this.pickUnit(S.barracks), rarity: S.barracks });
    }
    for (let k = 0; k < S.towers; k++) {
      const ti = spot();
      if (ti >= 0) this.addBuilding(team, 'tower', ti, null);
    }
  }

  pickUnit(rarity: number): UnitKey {
    const list = UNITS_BY_RARITY[rarity];
    return list[this.rng.loot.int(list.length)];
  }
  spawnUnit(team: number, type: UnitKey, x: number, y: number, barId: number): Unit {
    return spawnUnit(this, team, type, x, y, barId);
  }

  // ---------- commands ----------
  /** One player command: flip (offer tile to build, or -1) or ff (forfeit). Flipping a card is
   *  the player's only move. Everything is validated here: a malformed or hostile command
   *  (another team's tile, no offer there, not enough gold, wrong phase) just does nothing. */
  applyCommand(c: Cmd): void {
    const team = c.owner;
    if (team !== TEAM_BLUE && team !== TEAM_RED) return;
    if (c.ff) {
      if (this.phase !== PHASE_END) this.endMatch(enemyOf(team), 'forfeit');
      return;
    }
    const f = c.flip | 0;
    if (this.phase === PHASE_PLAY && f >= 0 && f < NTILES && this.team[team].offers[f] >= 0) tryBuy(this, team, f);
  }

  // ---------- main step ----------
  /** Advance one tick. cmds: this tick's commands (any order; applied by owner). */
  step(cmds: readonly Cmd[] | null): void {
    this.events.length = 0;
    for (const t of TEAMS) {
      const g = this.guards[t];
      g.px = g.x;
      g.py = g.y;
    }
    for (const u of this.units) { u.px = u.x; u.py = u.y; }
    for (const p of this.projs) { p.px = p.x; p.py = p.y; }
    if (cmds && cmds.length) {
      for (const owner of TEAMS) for (const c of cmds) if (c.owner === owner) this.applyCommand(c);
    }

    if (this.phase === PHASE_INTRO) {
      this.introT--;
      const c = Math.ceil(this.introT / TICK_RATE);
      if (c < this.lastCount && c >= 1 && c <= 3) {
        this.lastCount = c;
        this.emit('count', { n: c });
      }
      if (this.introT <= 0) {
        this.phase = PHASE_PLAY;
        this.emit('fight');
      }
    } else if (this.phase === PHASE_PLAY) {
      this.playT++;
      if (this.playT % WAVE_TICKS === 0) {
        for (const u of this.units) u.hold = 0;
        this.emit('wave');
      }
      if (this.playT >= this.siegeAt && (this.playT - this.siegeAt) % SIEGE.every === 0) this.emit('siege', { n: this.siegeLevel() });
      updateEconomy(this);
      if (this.config.aiRed) aiUpdate(this, TEAM_RED);
      if (this.config.aiBlue) aiUpdate(this, TEAM_BLUE);
      for (const t of TEAMS) updateGuard(this, this.guards[t]);
      updateBuildings(this);
      updateUnits(this);
      updateProjectiles(this);
      this.countTiles();
      updateQuests(this);
      // a safety valve only, far past any real match: a stalemate goes to the tiles
      if (this.phase === PHASE_PLAY && this.playT >= MAX_PLAY_TICKS) {
        const a = this.team[TEAM_BLUE].tiles, b = this.team[TEAM_RED].tiles;
        this.endMatch(a > b ? TEAM_BLUE : b > a ? TEAM_RED : TEAM_NONE, 'time');
      }
    }
    this.tick++;
  }

  endMatch(winner: number, reason: EndReason): void {
    if (this.phase === PHASE_END) return;
    this.phase = PHASE_END;
    if (reason === 'base') {
      // the winner sweeps the map
      for (const t of this.tiles) {
        const b = this.ent(t.bld);
        if (!t.obst && !(b && b.team === winner)) t.owner = winner;
      }
      for (const u of this.units) if (u.team !== winner) u.alive = 0;
      this.units = this.units.filter((u) => u.alive);
    }
    this.countTiles();
    this.result = { winner, reason, blue: this.team[TEAM_BLUE].tiles, red: this.team[TEAM_RED].tiles, tick: this.tick };
    this.emit('end', { winner, reason, blue: this.result.blue, red: this.result.red });
  }

  countTiles(): void {
    let a = 0, b = 0;
    for (const t of this.tiles) {
      if (t.owner === TEAM_BLUE) a++;
      else if (t.owner === TEAM_RED) b++;
    }
    this.team[TEAM_BLUE].tiles = a;
    this.team[TEAM_RED].tiles = b;
    let ua = 0, ub = 0;
    for (const u of this.units) {
      if (!u.alive) continue;
      if (u.team === TEAM_BLUE) ua++;
      else ub++;
    }
    this.team[TEAM_BLUE].units = ua;
    this.team[TEAM_RED].units = ub;
  }
}

