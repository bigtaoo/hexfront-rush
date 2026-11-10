// Phone vibration on the big moments of a match the player plays (solo or online, not a replay
// or the menu's demo): a legendary barracks, one of their buildings lost, their castle hit (at
// most every CASTLE_GAP seconds), the end. Only where the browser has navigator.vibrate (Android;
// not iOS, not most desktops), and only while Save.vibrate is on (the settings panel).

import type { Engine } from '../sim/engine';
import type { SimEvent } from '../sim/types';

export type Buzz = 'legend' | 'lost' | 'castle' | 'win' | 'lose';

/** Milliseconds on, off, on... */
export const PATTERN: Record<Buzz, number[]> = {
  legend: [30, 50, 30, 50, 90],
  lost: [45],
  castle: [25],
  win: [40, 70, 40, 70, 140],
  lose: [220],
};
const CASTLE_GAP = 0.8;

type Vibrate = (pattern: number[]) => boolean;
const browserVibrate = (): Vibrate | null => {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  return nav && typeof nav.vibrate === 'function' ? (p) => nav.vibrate(p) : null;
};

export class Haptics {
  /** Whether a buzz may play now (the save's switch, a match the player plays). */
  on: () => boolean = () => false;
  private castleAt = -Infinity;

  constructor(
    private readonly vibrate: Vibrate | null = browserVibrate(),
    private readonly now: () => number = () => performance.now() / 1000,
  ) {}

  /** The device can vibrate at all (the settings panel hides the switch otherwise). */
  get available(): boolean {
    return this.vibrate !== null;
  }

  buzz(b: Buzz): void {
    if (!this.vibrate || !this.on()) return;
    if (b === 'castle') {
      const t = this.now();
      if (t - this.castleAt < CASTLE_GAP) return;
      this.castleAt = t;
    }
    try {
      this.vibrate(PATTERN[b]);
    } catch {
      /* blocked (no user gesture yet, a frame without permission): no buzz */
    }
  }

  /** A short buzz when the switch is turned on, so the player feels what it does. */
  test(): void {
    try {
      this.vibrate?.(PATTERN.lost);
    } catch {
      /* no buzz */
    }
  }

  /** The buzz a sim event means to the local player, if any. */
  onEvent(e: SimEvent, eng: Engine, me: number): void {
    const mine = e.team === me;
    if ((e.type === 'barracks' || e.type === 'mysteryWin') && mine && e.rarity === 3 && e.unit) this.buzz('legend');
    else if (e.type === 'bldDown' && mine && e.kind !== 'base') this.buzz('lost');
    else if (e.type === 'dmg' && mine && eng.blds.find((b) => b.id === e.id)?.type === 'base') this.buzz('castle');
    else if (e.type === 'end' && e.winner) this.buzz(e.winner === me ? 'win' : 'lose');
  }
}

export const haptics = new Haptics();
