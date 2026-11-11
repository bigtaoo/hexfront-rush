// Rules for Hexfront Rush: constants and the unit, building and offer tables. Every value the sim
// reads is an integer: world units x FP, time in ticks, speeds per tick. Design numbers stay
// readable (seconds, tiles) and are converted once at load time.

import { perTick, TICK_RATE, ticks, toFp } from './fixed';
import { TILE } from './hex';

/** Bump when a rules change alters the outcome of a replay. */
export const ENGINE_VERSION = 13;

/** No clock: a match ends when a castle falls (or a player leaves). This is only a safety valve
 *  for a stalemate, far past any real match; then the tiles decide. */
export const MAX_PLAY_TICKS = ticks(25 * 60);
/** Siege: a long match must end, so from `after` on, each `every` both sides' troops hit
 *  buildings `dmgStep` percent harder and the troop cap rises by `capStep`. The same for both: the
 *  side with more and better barracks fills the new room first and breaks through. A normal match
 *  is over long before. */
export const SIEGE = { after: ticks(8 * 60), every: ticks(60), dmgStep: 25, capStep: 10 };
/** How many siege steps have come after `playT` ticks of play (0 before the siege). */
export const siegeLevel = (playT: number, after: number = SIEGE.after): number =>
  playT < after ? 0 : 1 + Math.trunc((playT - after) / SIEGE.every);
/** The siege bonus on damage to buildings, in percent (100 = none). */
export const siegePct = (playT: number, after: number = SIEGE.after): number => 100 + SIEGE.dmgStep * siegeLevel(playT, after);
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
  base: { hp: 3000, income: 10, incomeEvery: ticks(3) },
  mine: { hp: 240, income: 10, incomeEvery: ticks(5) },
  tower: { hp: 500, dmg: 22, rate: ticks(0.8), range: Math.round(2.8 * TILE) },
  barracks: { hp: 300 },
};
export const BLD_RADIUS = 800;

// ---------- offers: a fixed order, the index is what the sim stores per tile ----------
export type OfferKind = 'mine' | 'tower' | 'barracks' | 'mystery';
export interface Offer {
  key: string;
  kind: OfferKind;
  /** The price with none of its kind standing. */
  cost: number;
  /** Added to the price for each building of its kind the team has standing (a mystery: 0). */
  step: number;
  /** Weight among the filler cards (cardLayout.ts): every tile that is not a quota spot, and a
   *  tile that comes free again (rubble). 0: only on quota spots (mines, the best barracks). */
  w: number;
  /** A barracks on a filler tile: percent rare (the rest common). Epic and legendary barracks
   *  stand only on the quota spots of CARD_LAYOUT. */
  rare?: number;
}
export const OFFER_LIST: readonly Offer[] = [
  { key: 'mine', kind: 'mine', cost: 50, step: 15, w: 0 },
  { key: 'tower', kind: 'tower', cost: 50, step: 25, w: 28 },
  { key: 'bar1', kind: 'barracks', cost: 50, step: 5, w: 34, rare: 20 },
  { key: 'bar2', kind: 'barracks', cost: 100, step: 5, w: 22, rare: 65 },
  { key: 'bar3', kind: 'barracks', cost: 200, step: 5, w: 0 },
  { key: 'myst', kind: 'mystery', cost: 25, step: 0, w: 16 },
];
export const OF_MINE = 0, OF_TOWER = 1, OF_BAR1 = 2, OF_BAR2 = 3, OF_BAR3 = 4, OF_MYST = 5;
export const OFFER_W_TOTAL = OFFER_LIST.reduce((sum, o) => sum + o.w, 0);

/** The cards are laid out when the match starts, from its seed (cardLayout.ts): the same seed is
 *  the same map, card for card, and both teams get the same layout mirrored. The gold mines and
 *  the epic and legendary barracks go on quota spots, counted per zone by hex distance from the
 *  team's own castle; every other tile gets a filler card by weight (OFFER_LIST.w).
 *    zones   upper bound of each zone: home, near, middle, far (the far zone is the enemy's half)
 *    mine, epic, legend   how many per zone (their sum is the cap for the match)
 *    gap     quota spots of one kind keep at least this hex distance from each other
 *    card    which card an epic / legendary spot shows: weights for bar1, bar2, bar3 (a cheap card
 *            can hide a jackpot; a bar3 card is always epic or better) */
export const CARD_LAYOUT = {
  zones: [2, 4, 7, 99],
  mine: [2, 3, 3, 3],
  epic: [0, 1, 2, 2],
  legend: [0, 0, 1, 1],
  gap: 2,
  card: [15, 25, 60],
  /** The six tiles around the castle (the first cards a team sees) always hold these, in a seeded
   *  order; the mine counts toward the home zone's mines. */
  opening: [OF_MINE, OF_BAR1, OF_MYST],
};

// ---------- map events ----------
/** Map events stand on tiles from the start, laid out with the cards (cardLayout.ts), and both
 *  teams see them. The first team to flip the card on an event's tile (a building or a mystery)
 *  claims it: gold, or troops that set off at once (on top of the cap, like a mystery's). A tile
 *  stores the event's index; 0 is none. */
export interface MapEvent {
  key: 'none' | 'chest' | 'hoard' | 'camp' | 'warband';
  gold: number;
  /** Troops of one kind of this rarity. */
  troops: number;
  rarity: number;
}
export const EVENT_LIST: readonly MapEvent[] = [
  { key: 'none', gold: 0, troops: 0, rarity: 0 },
  { key: 'chest', gold: 60, troops: 0, rarity: 0 },
  { key: 'hoard', gold: 150, troops: 0, rarity: 0 },
  { key: 'camp', gold: 0, troops: 3, rarity: 1 },
  { key: 'warband', gold: 0, troops: 2, rarity: 2 },
];
export const EV_CHEST = 1, EV_HOARD = 2, EV_CAMP = 3, EV_WARBAND = 4;
/** Where the events go.
 *    side    each team's own, mirrored for red: [event, zone of CARD_LAYOUT.zones]
 *    middle  on the middle row, as far from one castle as from the other: a race
 *    gap     events keep at least this hex distance from each other */
export const EVENT_LAYOUT = {
  side: [[EV_CHEST, 1], [EV_CHEST, 2], [EV_CAMP, 2]] as readonly (readonly [number, number])[],
  middle: [EV_HOARD, EV_WARBAND] as readonly number[],
  gap: 3,
};

export const RARITY = ['common', 'rare', 'epic', 'legendary'] as const;
export const RARITY_COLOR = ['#9aa5b1', '#38bdf8', '#c084fc', '#fbbf24'] as const;

// ---------- units ----------
// Design table: hp, damage, attack every (s), range (tiles), speed (tiles/s), train every (s),
// body size (world units), splash radius (tiles). A barracks trains on its timer for the whole
// match; only the team cap (unitCap) holds it back.
//
// The militia is the standard soldier: every other troop is read against it. Speed sets each
// kind's feel on the field: light troops keep the standard pace, armoured ones lag, giants plod
// and only the drake (it flies) is quicker. A march from castle to castle takes the standard
// soldier about 18 s (it took 11 s before engine 10).
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
  militia: { rarity: 0, hp: 70, dmg: 9, rate: 0.9, range: 0.9, speed: 0.75, spawn: 7, size: 0.3 },
  slinger: { rarity: 0, hp: 45, dmg: 7, rate: 1.0, range: 1.8, speed: 0.75, spawn: 7, size: 0.28, ranged: 'stone' },
  shield: { rarity: 1, hp: 170, dmg: 11, rate: 1.0, range: 0.9, speed: 0.6, spawn: 9, size: 0.34 },
  bowman: { rarity: 1, hp: 70, dmg: 12, rate: 1.1, range: 2.5, speed: 0.7, spawn: 9, size: 0.3, ranged: 'arrow' },
  ogre: { rarity: 2, hp: 360, dmg: 26, rate: 1.3, range: 1.0, speed: 0.55, spawn: 12, size: 0.44 },
  adept: { rarity: 2, hp: 110, dmg: 20, rate: 1.4, range: 3.0, speed: 0.65, spawn: 12, size: 0.32, ranged: 'orb', splash: 0.8 },
  colossus: { rarity: 3, hp: 900, dmg: 45, rate: 1.6, range: 1.1, speed: 0.45, spawn: 18, size: 0.56, bldMult: 2 },
  drake: { rarity: 3, hp: 380, dmg: 22, rate: 0.9, range: 2.2, speed: 1.0, spawn: 18, size: 0.46, ranged: 'fire', splash: 1.0 },
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

/** Barracks troops gather where they were trained (fighting whatever comes near) and set off
 *  together, both teams at once, every WAVE_TICKS of play: armies meet armies, not a trickle. */
export const WAVE_TICKS = ticks(15);
/** Troops alive per team; barracks wait (timer full) while the team is at the cap. */
export const UNIT_CAP = 50;
/** The troop cap after `playT` ticks of play (it rises in a siege). */
export const unitCap = (playT: number, after: number = SIEGE.after): number => UNIT_CAP + SIEGE.capStep * siegeLevel(playT, after);
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
  /** An unhurried walk between spots; it hurries only toward an intruder. */
  speed: Math.round((0.6 * TILE) / TICK_RATE),
  chaseSpeed: Math.round((1.2 * TILE) / TICK_RATE),
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
  pauseMin: ticks(4),
  pauseSpan: ticks(4),
  /** Its path keeps this far from the castle's centre. */
  castleClear: Math.round(0.6 * TILE),
  regen: 12,
  idleAfter: ticks(3),
};
/** Hex distance around each castle kept free of obstacles. */
export const HOME_RADIUS = 3;
export const PROJ = { bolt: perTick(16), tower: perTick(14), unit: perTick(10), life: ticks(2), launchDy: 300, aimDy: 200 };
/** What a mystery card can give, by weight (out of 100): nothing, a squad of troops that sets
 *  off at once (on top of the cap), or a barracks standing on the tile that trains for good. */
export interface MysteryRoll {
  w: number;
  /** Troops: how many, of what rarity. */
  squad?: { n: number; rarity: number };
  /** A barracks of this rarity. */
  barracks?: number;
}
export const MYSTERY: readonly MysteryRoll[] = [
  { w: 60 },
  { w: 10, squad: { n: 3, rarity: 0 } },
  { w: 12, squad: { n: 2, rarity: 2 } },
  { w: 4, squad: { n: 2, rarity: 3 } },
  { w: 9, barracks: 1 },
  { w: 4, barracks: 2 },
  { w: 1, barracks: 3 },
];
export const MYSTERY_W_TOTAL = MYSTERY.reduce((sum, m) => sum + m.w, 0);
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
/** Once a match's three listed quests are done, the quests keep coming: these three, round after
 *  round, each counted from what the team had when it was handed out (TeamState.questBase), so
 *  "build 3 barracks" means three more, whether the team is ahead or behind. Half a match used to
 *  run with no quest at all and an empty panel; the board keeps asking now. Tiles is not in the
 *  loop: a team losing ground could never finish it, and would sit on it for the rest of the
 *  match. */
export const QUEST_LOOP: readonly number[] = [0, 1, 2];
