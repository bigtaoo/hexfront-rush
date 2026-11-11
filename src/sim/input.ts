// Commands and input sources. A command is the only way a player touches the sim, and the
// player has one move: flip (build) a card.
//   { owner, tick, flip, ff }
//   flip  tile index of an own offer to build, or -1 (one-shot)
//   ff    1 = forfeit (one-shot)
// On the wire and in replays a command is 6 integers: [tick, owner, flip, 0, 0, ff]. The two
// zeros are reserved (they held keyboard keys while the player still had a hero), which keeps
// the relay's 4-int message [flip, 0, 0, ff] unchanged.
//
// An input source answers take(tick): the commands for that tick, or null when they are not
// known yet (online: the relay has not confirmed that frame). The loop stops stepping on null;
// it never guesses. LocalInput confirms instantly; NetInput (src/net) waits for the relay.

export interface Cmd {
  owner: number;
  tick: number;
  flip: number;
  ff: number;
}

/** A command as 6 integers: [tick, owner, flip, 0, 0, ff]. */
export type PackedCmd = number[];

export function makeCmd(owner: number, flip?: number, ff?: number | boolean): Cmd {
  return { owner, tick: 0, flip: flip === undefined ? -1 : flip | 0, ff: ff ? 1 : 0 };
}

export const packCmd = (c: Cmd): PackedCmd => [c.tick | 0, c.owner | 0, c.flip | 0, 0, 0, c.ff | 0];

export function unpackCmd(a: unknown): Cmd | null {
  if (!Array.isArray(a) || a.length < 6) return null;
  for (let i = 0; i < 6; i++) if (!Number.isSafeInteger(a[i])) return null;
  return { tick: a[0], owner: a[1], flip: a[2], ff: a[5] };
}

/** What the game loop steps from. */
export interface InputSource {
  /** The commands for `tick`, or null when they are not known yet. */
  take(tick: number): Cmd[] | null;
  /** Confirmed frames waiting to be stepped, from where the loop stands. */
  backlog(tick: number): number;
}

/** Collects one local player's taps between ticks and turns them into commands. Every tap is a
 *  one-shot, so nothing is held or deduplicated: two quick taps on two cards both go out (one
 *  per tick). Used by both local play and the net client (which submits instead of queueing). */
export class InputCollector {
  flips: number[] = [];
  ff = 0;
  owner: number;
  constructor(owner: number) {
    this.owner = owner;
  }
  flipTile(i: number): void {
    if (this.flips.length < 4 && !this.flips.includes(i)) this.flips.push(i | 0);
  }
  forfeit(): void {
    this.ff = 1;
  }
  /** The command to send now, or null when the player did nothing. */
  drain(): Cmd | null {
    if (this.ff) {
      this.ff = 0;
      this.flips.length = 0;
      return makeCmd(this.owner, -1, 1);
    }
    if (!this.flips.length) return null;
    return makeCmd(this.owner, this.flips.shift(), 0);
  }
}

/** Single-machine source: commands land on the next tick the loop asks for. */
export class LocalInput implements InputSource {
  queue: Cmd[] = [];
  log: PackedCmd[] = [];
  push(cmd: Cmd | null): void {
    if (cmd) this.queue.push(cmd);
  }
  take(tick: number): Cmd[] {
    const out = this.queue;
    this.queue = [];
    for (const c of out) {
      c.tick = tick;
      this.log.push(packCmd(c));
    }
    return out;
  }
  /** Confirmed-ahead frames: always zero locally. */
  backlog(): number {
    return 0;
  }
}
