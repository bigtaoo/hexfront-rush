// Rules for Hexfront Rush: constants and the unit, building and offer tables. Every value the sim
// reads is an integer: world units x FP, time in ticks, speeds per tick. Design numbers stay
// readable (seconds, tiles) and are converted once at load time.

import { perTick, TICK_RATE, ticks, toFp } from './fixed';
import { TILE } from './hex';

/** Bump when a rules change alters the outcome of a replay. */
export const ENGINE_VERSION = 5;

export const MATCH_TICKS = ticks(180);
export const INTRO_TICKS = ticks(3.6);

export const TEAM_NONE = 0, TEAM_BLUE = 1, TEAM_RED = 2;
export type Team = 1 | 2;
export const TEAMS: readonly Team[] = [TEAM_BLUE, TEAM_RED];
export const enemyOf = (t: number): Team => (t === TEAM_BLUE ? TEAM_RED : TEAM_BLUE);
export const PHASE_INTRO = 0, PHASE_PLAY = 1, PHASE_END = 2;

// ---------- buildings ----------
export type BuildingType = 'base' | 'mine' | 'tower' | 'barracks';
export interface BuildingDef {
  hp: number;
  income?: number;
  incomeEvery?: number;
  dmg?: number;
  rate?: number;
  range?: number;
}
export const BUILD: Record<BuildingType, BuildingDef> = {
  // a gold mine with a castle on top; its guard defends it
  base: { hp: 2000, income: 10, incomeEvery: ticks(3) },
  mine: { hp: 240, income: 10, incomeEvery: ticks(4) },
  tower: { hp: 340, dmg: 15, rate: ticks(0.8), range: Math.round(2.6 * TILE) },
  barracks: { hp: 300 },
};
export const BLD_RADIUS = 800;

// ---------- offers: a fixed order, the index is what the sim stores per tile ----------
export type OfferKind = 'mine' | 'tower' | 'barracks' | 'mystery';
export interface Offer {
  key: string;
  kind: OfferKind;
  cost: number;
  w: number;
  odds?: readonly number[];
}
export const OFFER_LIST: readonly Offer[] = [
  { key: 'mine', kind: 'mine', cost: 50, w: 25 },
  { key: 'tower', kind: 'tower', cost: 50, w: 19 },
  { key: 'bar1', kind: 'barracks', cost: 50, w: 23, odds: [74, 20, 5, 1] },
  { key: 'bar2', kind: 'barracks', cost: 100, w: 13, odds: [30, 60, 8, 2] },
  { key: 'bar3', kind: 'barracks', cost: 250, w: 6, odds: [0, 0, 90, 10] },
  { key: 'myst', kind: 'mystery', cost: 25, w: 14 },
];
export const OFFER_W_TOTAL = 100;
export const OF_MINE = 0, OF_TOWER = 1, OF_BAR1 = 2, OF_BAR2 = 3, OF_BAR3 = 4, OF_MYST = 5;

export const RARITY = ['common', 'rare', 'epic', 'legendary'] as const;
export const RARITY_COLOR = ['#9aa5b1', '#38bdf8', '#c084fc', '#fbbf24'] as const;

// ---------- units ----------
// Design table: hp, damage, attack every (s), range (tiles), speed (tiles/s), train every (s),
// body size (world units), splash radius (tiles). A barracks trains on its timer for the whole
// match; only the team cap (UNIT_CAP) holds it back.
export const UNIT_KEYS = ['militia', 'slinger', 'shield', 'bowman', 'ogre', 'adept', 'colossus', 'drake'] as const;
export type UnitKey = (typeof UNIT_KEYS)[number];
export type Missile = '' | 'stone' | 'arrow' | 'orb' | 'fire' | 'bolt' | 'tower';

interface UnitDesign {
  rarity: number;
  hp: number;
  dmg: number;
  rate: number;
  range: number;
  speed: number;
  spawn: number;
  size: number;
  ranged?: Missile;
  splash?: number;
  bldMult?: number;
}
const UNIT_DESIGN: Record<UnitKey, UnitDesign> = {
  militia: { rarity: 0, hp: 70, dmg: 9, rate: 0.9, range: 0.9, speed: 1.3, spawn: 7, size: 0.3 },
  slinger: { rarity: 0, hp: 45, dmg: 7, rate: 1.0, range: 1.8, speed: 1.3, spawn: 7, size: 0.28, ranged: 'stone' },
  shield: { rarity: 1, hp: 170, dmg: 11, rate: 1.0, range: 0.9, speed: 1.1, spawn: 9, size: 0.34 },
  bowman: { rarity: 1, hp: 70, dmg: 12, rate: 1.1, range: 2.5, speed: 1.2, spawn: 9, size: 0.3, ranged: 'arrow' },
  ogre: { rarity: 2, hp: 360, dmg: 26, rate: 1.3, range: 1.0, speed: 1.0, spawn: 12, size: 0.44 },
  adept: { rarity: 2, hp: 110, dmg: 20, rate: 1.4, range: 3.0, speed: 1.1, spawn: 12, size: 0.32, ranged: 'orb', splash: 0.8 },
  colossus: { rarity: 3, hp: 900, dmg: 45, rate: 1.6, range: 1.1, speed: 0.8, spawn: 18, size: 0.56, bldMult: 2 },
  drake: { rarity: 3, hp: 380, dmg: 22, rate: 0.9, range: 2.2, speed: 1.7, spawn: 18, size: 0.46, ranged: 'fire', splash: 1.0 },
};

export interface UnitDef {
  key: UnitKey;
  rarity: number;
  hp: number;
  dmg: number;
  rate: number;
  range: number;
  speed: number;
  spawn: number;
  size: number;
  ranged: Missile;
  splash: number;
  bldMult: number;
  aggroMobile: number;
  aggroBuilding: number;
}

/** Troops alive per team; barracks wait (timer full) while the team is at the cap. */
export const UNIT_CAP = 40;
export const UNITS = {} as Record<UnitKey, UnitDef>;
export const UNITS_BY_RARITY: UnitKey[][] = [[], [], [], []];
for (const k of UNIT_KEYS) {
  const d = UNIT_DESIGN[k];
  UNITS[k] = {
    key: k,
    rarity: d.rarity,
    hp: d.hp,
    dmg: d.dmg,
    rate: ticks(d.rate),
    range: Math.round(d.range * TILE),
    speed: Math.round((d.speed * TILE) / TICK_RATE),
    spawn: ticks(d.spawn),
    size: toFp(d.size),
    ranged: d.ranged || '',
    splash: Math.round((d.splash || 0) * TILE),
    bldMult: d.bldMult || 1,
    // marching troops only turn aside for what is close: they head for the enemy castle
    aggroMobile: Math.round(Math.max(2.4, d.range + 0.5) * TILE),
    aggroBuilding: Math.round(Math.max(1.6, d.range + 0.4) * TILE),
  };
  UNITS_BY_RARITY[d.rarity].push(k);
}

// The castle's own guard (the player has no hero: flipping cards is their only move). It
// wanders the ground around the castle at random (guard.ts), mostly in front and to the sides,
// seldom behind, claims the tiles it walks, and never leaves the home zone (leash).
export const GUARD = {
  hp: 320,
  dmg: 14,
  rate: ticks(0.7),
  range: Math.round(2.4 * TILE),
  speed: Math.round((1.7 * TILE) / TICK_RATE),
  respawn: ticks(12),
  radius: 420,
  leash: Math.round(2.8 * TILE),
  /** Hex distance from the castle it wanders within. */
  wanderRadius: 2,
  /** How much it likes a spot ahead of the castle, level with it, or behind it. */
  wantFront: 6,
  wantSide: 3,
  wantBack: 1,
  /** It stands pauseMin plus up to pauseSpan ticks at each spot. */
  pauseMin: ticks(0.5),
  pauseSpan: ticks(1.3),
  /** Its path keeps this far from the castle's centre. */
  castleClear: Math.round(0.6 * TILE),
  regen: 12,
  idleAfter: ticks(3),
};
/** Hex distance around each castle kept free of obstacles. */
export const HOME_RADIUS = 3;
export const PROJ = { bolt: perTick(16), tower: perTick(14), unit: perTick(10), life: ticks(2), launchDy: 300, aimDy: 200 };
export const CHEST = { first: ticks(12), every: ticks(20), gold: 40 };
/** nothing / common squad / epic / legendary, in percent */
export const MYSTERY_ODDS = [70, 10, 15, 5];
/** Ticks a hit flash shows (the view reads hitT). */
export const HIT_FLASH = 4;
export const LUNGE_TICKS = 5;

export type QuestKind = 'mine' | 'barracks' | 'tower' | 'tiles';
export interface Quest {
  id: string;
  kind: QuestKind;
  need: number;
  reward: number;
}
export const QUESTS: readonly Quest[] = [
  { id: 'mines', kind: 'mine', need: 2, reward: 60 },
  { id: 'barracks', kind: 'barracks', need: 3, reward: 75 },
  { id: 'towers', kind: 'tower', need: 2, reward: 60 },
  { id: 'tiles', kind: 'tiles', need: 55, reward: 60 },
];
