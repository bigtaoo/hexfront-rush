// Each solo match's replay (src/sim/replay.ts: the seed and the player's flips) to the relay's
// POST /r (server/collector.ts), where `npm run replays` plays it again to see how matches really
// go: what players build, where they lose, how long they last. Ported from Potion Siege's
// replayUpload (D:\fang src/analytics/replayUpload.ts), cut to what Hexfront needs:
//   - no player ID: each match gets a random id of its own, made here and stored nowhere, so
//     two uploads of one match (hidden, then ended) replace each other and nothing links matches;
//   - the player can turn it off in the menu (Save.shareReplays);
//   - online matches never come this way: the relay records them itself.
//
// A match goes when it ends (won, lost or drawn), when the player leaves it for the menu (quit),
// and when the page is hidden mid-match, since a player who closes the tab never reaches the end:
// then what was played so far, at most once per HIDDEN_TICKS of play.

import type { Engine } from '../sim/engine';
import type { PackedCmd } from '../sim/input';
import { makeReplay, type Replay } from '../sim/replay';
import { enemyOf } from '../sim/rules';

export type ReplayEnd = 'won' | 'lost' | 'drawn' | 'quit' | 'hidden';

/** What POST /r takes (server/replayShelf.ts cleanUpload). */
export interface ReplayPost {
  id: string;
  end: ReplayEnd;
  build: string;
  platform: string;
  replay: Replay;
}

/** keepalive requests share about 64 KB in flight per page; a bigger body goes as a plain fetch. */
const KEEPALIVE_MAX = 60_000;
/** A hidden page sends the match again only after this much more play (30 s at 30 Hz). */
export const HIDDEN_TICKS = 900;

export type Post = (url: string, body: string) => void;

const fetchPost: Post = (url, body) => {
  // text/plain (a string body's type) avoids a CORS preflight
  void fetch(url, { method: 'POST', body, mode: 'no-cors', keepalive: body.length <= KEEPALIVE_MAX }).catch(() => {});
};

/** 16 random hex digits: the one match's id. */
export function randomId(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

interface Live {
  id: string;
  engine: Engine;
  log: readonly PackedCmd[];
  team: number;
}

export class ReplayUpload {
  private live: Live | null = null;
  /** The tick and end of the live match's last upload. */
  private sent: { ticks: number; end: ReplayEnd } | null = null;

  constructor(
    readonly url: string,
    /** Whether the player shares replays now (the menu's switch). */
    private readonly sharing: () => boolean,
    private readonly build: string,
    private readonly platform: string,
    private readonly post: Post = fetchPost,
    private readonly newId: () => string = randomId,
  ) {}

  /** Hidden and leaving pages send the match so far (boot() calls this once with `document`). */
  listen(doc: Pick<Document, 'addEventListener' | 'visibilityState'>, win: Pick<Window, 'addEventListener'>): this {
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden') this.hidden();
    });
    win.addEventListener('pagehide', () => this.hidden());
    return this;
  }

  /** A solo match began: `engine` plays it, `log` is its input's command log, `team` the player's. */
  start(engine: Engine, log: readonly PackedCmd[], team: number): void {
    this.live = { id: this.newId(), engine, log, team };
    this.sent = null;
  }

  /** The live match ended (its result) or was left (quit); after this it is no longer live. */
  end(): void {
    const live = this.live;
    if (!live) return;
    const r = live.engine.result;
    this.send(live, !r ? 'quit' : r.winner === live.team ? 'won' : r.winner === enemyOf(live.team) ? 'lost' : 'drawn');
    this.live = null;
  }

  /** The page was hidden: the live match so far, unless little was played since the last send. */
  hidden(): void {
    const live = this.live;
    if (!live || live.engine.result) return;
    if (this.sent && live.engine.tick - this.sent.ticks < HIDDEN_TICKS) return;
    this.send(live, 'hidden');
  }

  private send(live: Live, end: ReplayEnd): void {
    const ticks = live.engine.tick;
    if (!this.sharing() || ticks === 0) return;
    if (this.sent && this.sent.ticks === ticks && this.sent.end === end) return;
    this.sent = { ticks, end };
    try {
      const body: ReplayPost = { id: live.id, end, build: this.build, platform: this.platform, replay: makeReplay(live.engine.config, live.log, live.engine) };
      this.post(this.url, JSON.stringify(body));
    } catch {
      // a replay lost, never the game
    }
  }
}

/** The collector's privacy page beside its /r (server/privacy.ts), for the menu's link. Null for
 *  an address that does not end in /r. */
export function privacyUrl(upload: string | null | undefined): string | null {
  if (!upload) return null;
  try {
    const u = new URL(upload);
    if (!u.pathname.endsWith('/r')) return null;
    u.pathname = `${u.pathname.slice(0, -1)}privacy`;
    u.search = '';
    return u.href;
  } catch {
    return null;
  }
}

/** Where replays go: VITE_REPLAY_URL when the build sets one, else the relay's /r beside its
 *  WebSocket (the same host and port, http for ws). Null when there is neither. */
export function replayUrl(relay: string | null, override: string | undefined): string | null {
  if (override) return override;
  if (!relay) return null;
  try {
    const u = new URL(relay);
    return `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}/r`;
  } catch {
    return null;
  }
}
