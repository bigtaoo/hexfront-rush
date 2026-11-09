// The sim's state as plain data. Entities reference each other by id, never by object, so the
// state serialises as JSON (snapshots) and hashes field by field: every field here is hashed, so
// adding one changes every hash (bump ENGINE_VERSION and the golden hashes when that is meant).

import type { BuildingType, Missile, OfferKind, UnitKey } from './rules';

export interface EngineConfig {
  seed: number;
  aiBlue: boolean;
  aiRed: boolean;
}

export interface Guard {
  kind: 'guard';
  team: number;
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  maxhp: number;
  cd: number;
  dead: number;
  respT: number;
  wp: number;
  waitT: number;
  face: number;
  lastHit: number;
  hitT: number;
  aim: number;
  moving: number;
  regen: number;
}

export interface Unit {
  kind: 'unit';
  type: UnitKey;
  team: number;
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  maxhp: number;
  cd: number;
  alive: number;
  tgt: number;
  retT: number;
  step: number;
  tile: number;
  bar: number;
  hitT: number;
  lungeT: number;
  face: number;
  lane: number;
  bornT: number;
  /** 1 while it waits where it was trained for the next wave (it still fights what comes near). */
  hold: number;
}

export interface Building {
  kind: 'bld';
  type: BuildingType;
  team: number;
  id: number;
  tile: number;
  x: number;
  y: number;
  hp: number;
  maxhp: number;
  timer: number;
  cd: number;
  alive: number;
  hitT: number;
  bornT: number;
  /** The troop a barracks trains, '' for other buildings. */
  unit: UnitKey | '';
  rarity: number;
  spawnT: number;
}

export type Entity = Guard | Unit | Building;

export interface Projectile {
  x: number;
  y: number;
  px: number;
  py: number;
  tgt: number;
  team: number;
  dmg: number;
  kind: Missile;
  speed: number;
  splash: number;
  bm: number;
  tx: number;
  ty: number;
  life: number;
}

export interface TeamState {
  gold: number;
  tiles: number;
  units: number;
  built: Record<OfferKind, number>;
  offers: number[];
  /** 1 on each tile this team has flipped (its castle counts), 0 elsewhere: the cards stand on
   *  the tiles next to these. A building that falls closes its tile again. */
  open: number[];
  questIdx: number;
  questT: number;
}

export interface AiState {
  decideT: number;
}

export type EndReason = 'base' | 'time' | 'forfeit';
export interface MatchResult {
  winner: number;
  reason: EndReason;
  blue: number;
  red: number;
  tick: number;
}

export type SimEventType =
  | 'count' | 'fight' | 'wave' | 'siege' | 'end' | 'quest' | 'income' | 'mapEvent'
  | 'needGold' | 'mysteryNothing' | 'mysteryWin' | 'burst' | 'barracks' | 'built' | 'spawn' | 'dmg'
  | 'guardDown' | 'guardBack' | 'unitDown' | 'bldDown' | 'shoot' | 'melee' | 'ring' | 'hit';

/** What a step tells the view: fixed-point positions and teams, never strings to show. */
export interface SimEvent {
  type: SimEventType;
  team?: number;
  x?: number;
  y?: number;
  n?: number;
  id?: number;
  unit?: UnitKey;
  rarity?: number;
  kind?: string;
  amount?: number;
  color?: string;
  gold?: number;
  reward?: number;
  winner?: number;
  reason?: EndReason;
  blue?: number;
  red?: number;
  a?: number;
  b?: number;
  r?: number;
  victim?: number;
  guard?: number;
}

/** Guards fall and come back (dead); troops and buildings are removed (alive). */
export const isDown = (e: Entity): boolean => (e.kind === 'guard' ? !!e.dead : !e.alive);
