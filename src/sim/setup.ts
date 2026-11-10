// A match's setup: the seed, which sides the built-in AI plays, and per side the AI's skill and
// the handicaps a campaign stage gives (starting gold, castle strength, income, a barracks and
// towers to start with), plus when the siege comes. It is part of the state (hashed) and of every replay,
// so a stage plays the same on every machine. No value imports: the relay's replay check
// (replayShape.ts) runs this file as is under Node.

export interface SideSetup {
  /** The built-in AI's skill, 0 (a beginner) to AI_SKILL_MAX; read only when the AI plays this side. */
  skill: number;
  /** The built-in AI's style (ai.ts AI_STYLES): 0 balanced, 1 builder, 2 warlord, 3 turtle, 4 gambler. */
  style: number;
  /** Gold at the start. */
  gold: number;
  /** The castle's hp, percent of the standard castle. */
  castle: number;
  /** The castle's and the mines' payouts, percent. */
  income: number;
  /** A barracks of this rarity stands next to the castle from the start; -1: none. */
  barracks: number;
  /** Watchtowers standing next to the castle from the start. */
  towers: number;
}

export interface EngineConfig {
  seed: number;
  aiBlue: boolean;
  aiRed: boolean;
  blue: SideSetup;
  red: SideSetup;
  /** Seconds of play before the siege starts. */
  siege: number;
}

/** What a caller may leave out: everything but the seed has a standard value. */
export interface ConfigInput {
  seed: number;
  aiBlue?: boolean;
  aiRed?: boolean;
  blue?: Partial<SideSetup>;
  red?: Partial<SideSetup>;
  siege?: number;
}

export const AI_SKILL_MAX = 3;
/** The standard (and best) AI: the menu's demo, and Normal in a quick match. */
export const AI_SKILL_STD = 3;
export const STD_SIEGE = 8 * 60;

/** Each field's standard value and its allowed range. */
const SIDE_RANGE: Record<keyof SideSetup, readonly [number, number, number]> = {
  skill: [AI_SKILL_STD, 0, AI_SKILL_MAX],
  style: [0, 0, 4],
  gold: [60, 0, 5000],
  castle: [100, 10, 1000],
  income: [100, 10, 1000],
  barracks: [-1, -1, 3],
  towers: [0, 0, 3],
};
const SIEGE_RANGE = [60, 60 * 60] as const;
const SIDE_KEYS: readonly (keyof SideSetup)[] = ['skill', 'style', 'gold', 'castle', 'income', 'barracks', 'towers'];

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.trunc(v)));

export function sideSetup(s: Partial<SideSetup> = {}): SideSetup {
  const out = {} as SideSetup;
  for (const k of SIDE_KEYS) {
    const [std, lo, hi] = SIDE_RANGE[k];
    const v = s[k];
    out[k] = typeof v === 'number' && Number.isFinite(v) ? clampInt(v, lo, hi) : std;
  }
  return out;
}

/** A full, clamped config: missing fields take their standard value. */
export function makeConfig(c: ConfigInput): EngineConfig {
  const siege = typeof c.siege === 'number' && Number.isFinite(c.siege) ? clampInt(c.siege, SIEGE_RANGE[0], SIEGE_RANGE[1]) : STD_SIEGE;
  return { seed: c.seed >>> 0, aiBlue: !!c.aiBlue, aiRed: !!c.aiRed, blue: sideSetup(c.blue), red: sideSetup(c.red), siege };
}

const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isSafeInteger(v) && (v as number) >= lo && (v as number) <= hi;

/** A stored config, checked strictly (a replay from outside): a field out of range is a refusal;
 *  a setup left out entirely is the standard one. */
export function parseConfig(c: unknown): EngineConfig | null {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const x = c as Record<string, unknown>;
  if (!isInt(x.seed, 0, 0xffffffff) || typeof x.aiBlue !== 'boolean' || typeof x.aiRed !== 'boolean') return null;
  const side = (v: unknown): SideSetup | null => {
    if (v === undefined) return sideSetup();
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const o = v as Record<string, unknown>;
    for (const k of SIDE_KEYS) if (!isInt(o[k], SIDE_RANGE[k][1], SIDE_RANGE[k][2])) return null;
    return sideSetup(o as Partial<SideSetup>);
  };
  const blue = side(x.blue), red = side(x.red);
  if (!blue || !red) return null;
  if (x.siege !== undefined && !isInt(x.siege, SIEGE_RANGE[0], SIEGE_RANGE[1])) return null;
  return { seed: x.seed, aiBlue: x.aiBlue, aiRed: x.aiRed, blue, red, siege: (x.siege as number | undefined) ?? STD_SIEGE };
}
