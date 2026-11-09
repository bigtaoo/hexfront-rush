'use strict';
// Commands and input sources. A command is the only way a player touches the sim:
//   { owner, tick, goto, kx, ky, ff }
//   goto  tile index to walk to, or -1 (one-shot)
//   kx/ky keyboard direction, -1..1 (held: the engine keeps it until the next command)
//   ff    1 = forfeit (one-shot)
// On the wire and in replays a command is 6 integers: [tick, owner, goto, kx, ky, ff].
//
// An input source answers take(tick): the commands for that tick, or null when they are not
// known yet (online: the relay has not confirmed that frame). The loop stops stepping on null;
// it never guesses. LocalInput confirms instantly; NetInput (js/net) waits for the relay.

function makeCmd(owner, goto, kx, ky, ff) {
  return { owner, tick: 0, goto: goto === undefined ? -1 : goto | 0, kx: kx | 0, ky: ky | 0, ff: ff ? 1 : 0 };
}
function packCmd(c) { return [c.tick | 0, c.owner | 0, c.goto | 0, c.kx | 0, c.ky | 0, c.ff | 0]; }
function unpackCmd(a) {
  if (!Array.isArray(a) || a.length < 6) return null;
  for (let i = 0; i < 6; i++) if (!Number.isSafeInteger(a[i])) return null;
  return { tick: a[0], owner: a[1], goto: a[2], kx: a[3], ky: a[4], ff: a[5] };
}
/** True when the command carries something beyond its held keys. */
function isOneShot(c) { return c.goto >= 0 || c.ff; }
function sameHeld(a, b) { return !!a && !!b && a.kx === b.kx && a.ky === b.ky; }

/** Collects one local player's intent between ticks and turns it into at most one command.
 *  Held keys are sent only when they change; one-shots always go out. Used by both local
 *  play and the net client (which submits instead of queueing). */
class InputCollector {
  constructor(owner) { this.owner = owner; this.kx = 0; this.ky = 0; this.goto = -1; this.ff = 0; this.sent = makeCmd(owner); }
  setKeys(kx, ky) { this.kx = clampI(kx | 0, -1, 1); this.ky = clampI(ky | 0, -1, 1); }
  gotoTile(i) { this.goto = i; this.kx = this.ky = 0; }
  forfeit() { this.ff = 1; }
  /** The command to send now, or null when nothing changed. */
  drain() {
    const c = makeCmd(this.owner, this.goto, this.kx, this.ky, this.ff);
    this.goto = -1; this.ff = 0;
    if (!isOneShot(c) && sameHeld(c, this.sent)) return null;
    this.sent = c;
    return c;
  }
}

/** Single-machine source: commands land on the next tick the loop asks for. */
class LocalInput {
  constructor() { this.queue = []; this.log = []; }
  push(cmd) { if (cmd) this.queue.push(cmd); }
  take(tick) {
    const out = this.queue;
    this.queue = [];
    for (const c of out) { c.tick = tick; this.log.push(packCmd(c)); }
    return out;
  }
  /** Confirmed-ahead frames: always zero locally. */
  backlog() { return 0; }
}
