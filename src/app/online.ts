// Online 1v1 through the lockstep relay (server/relay.ts): the lobby (create a room, join one
// by its 4-letter code), the match (own taps go to the relay, confirmed frames come back as
// NetInput batches), state checkpoints, the leave flag, and resuming after a reload or a
// dropped link (the room, the seat and a token live in sessionStorage).

import { NetClient, relayUrl, type NetMsg } from '../net/netClient';
import type { FrameBatch } from '../net/frameBroadcast';
import { NetInput } from '../net/netInput';
import type { Engine } from '../sim/engine';
import type { PackedCmd } from '../sim/input';
import { ENGINE_VERSION, PHASE_END, TEAM_BLUE } from '../sim/rules';
import type { SimEvent } from '../sim/types';
import type { Status } from '../view/hud';
import { COL } from '../view/viewConst';
import { $ } from './dom';
import type { Game } from './game';
import { T } from './i18n';

/** sessionStorage: { code, seat, token } of the live online match. */
export const ROOM_KEY = 'hexfront_room';
/** Two taps on the leave flag inside this window forfeit. */
const LEAVE_ARM_MS = 2500;

export type OnlinePhase = 'off' | 'lobby' | 'waiting' | 'match' | 'over';

interface SavedRoom {
  code: string;
  seat: number;
  token: string;
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function loadRoom(raw: string | null): SavedRoom | null {
  try {
    const o = JSON.parse(raw ?? 'null') as Partial<SavedRoom> | null;
    if (!o || typeof o.code !== 'string' || typeof o.token !== 'string' || !o.code || !o.token) return null;
    return { code: o.code, seat: num(o.seat), token: o.token };
  } catch {
    return null;
  }
}

export class Online {
  client: NetClient | null = null;
  readonly url: string | null;
  phase: OnlinePhase = 'off';
  /** The create / join message to send once connected. */
  private pending: NetMsg | null = null;
  code = '';
  seat = 0;
  token = '';
  net: NetInput | null = null;
  peerOnline = true;
  desync = false;
  private leaveArm = 0;
  private lobbyMsg = '';

  constructor(private readonly g: Game, url: string | null = relayUrl()) {
    this.url = url;
  }

  available(): boolean {
    return !!this.url;
  }

  private ensureClient(): NetClient {
    if (this.client) return this.client;
    if (!this.url) throw new Error('no relay');
    this.client = new NetClient(this.url, {
      onOpen: () => this.onOpen(),
      onMessage: (m) => this.onMessage(m),
      onState: () => this.lobbyText(),
    });
    return this.client;
  }

  /** Drop the link and everything about the room (a no-op when there is no link). */
  stop(): void {
    if (!this.client) return;
    if (this.phase === 'waiting') this.client.send({ t: 'leave' });
    this.client.close();
    this.client = null;
    this.phase = 'off';
    this.pending = null;
    this.forget();
  }

  private remember(): void {
    try {
      sessionStorage.setItem(ROOM_KEY, JSON.stringify({ code: this.code, seat: this.seat, token: this.token }));
    } catch {
      /* private mode: no resume after a reload */
    }
  }
  private forget(): void {
    try {
      sessionStorage.removeItem(ROOM_KEY);
    } catch {
      /* private mode */
    }
  }
  private saved(): SavedRoom | null {
    try {
      return loadRoom(sessionStorage.getItem(ROOM_KEY));
    } catch {
      return null;
    }
  }

  /** At boot: a reload in the middle of an online match goes back into it. */
  resume(): void {
    const s = this.available() ? this.saved() : null;
    if (!s) return;
    Object.assign(this, { code: s.code, seat: s.seat, token: s.token, phase: 'match' });
    this.ensureClient().connect();
  }

  // ---------------- lobby ----------------
  open(): void {
    const g = this.g;
    g.sound.unlock();
    g.sound.play('tap');
    g.state = 'online';
    this.phase = 'lobby';
    this.lobbyMsg = '';
    g.show('online');
    this.lobbyText();
  }

  private request(m: NetMsg): void {
    this.pending = m;
    this.lobbyMsg = '';
    const c = this.ensureClient();
    if (c.state === 'open') this.flushPending();
    else c.connect();
    this.lobbyText();
  }

  create(): void {
    this.g.sound.play('tap');
    this.request({ t: 'create', ev: ENGINE_VERSION });
  }

  join(): void {
    const input = $<HTMLInputElement>('codeIn');
    const code = input.value.trim().toUpperCase();
    if (code.length !== 4) {
      input.focus();
      this.g.sound.play('error');
      return;
    }
    this.g.sound.play('tap');
    this.request({ t: 'join', code, ev: ENGINE_VERSION });
  }

  cancel(): void {
    this.g.sound.play('tap');
    this.stop();
    this.g.toMenu();
  }

  private flushPending(): void {
    if (this.pending && this.client?.send(this.pending)) this.pending = null;
  }

  lobbyText(): void {
    if (this.g.state !== 'online') return;
    const st = this.client ? this.client.state : 'idle';
    const waiting = this.phase === 'waiting';
    const code = $('roomCode');
    code.textContent = waiting ? this.code : '';
    code.classList.toggle('hidden', !waiting);
    $('onlineForm').classList.toggle('hidden', waiting);
    let msg = this.lobbyMsg;
    if (!msg) {
      if (waiting) msg = T('shareCode') + '\n' + T('waitingRival');
      else if (this.pending && (st === 'connecting' || st === 'retry')) msg = st === 'retry' ? T('noServer') : T('connecting');
    }
    $('onlineMsg').textContent = msg;
  }

  // ---------------- link ----------------
  private onOpen(): void {
    if (this.phase === 'match' || this.phase === 'over') {
      this.client?.send({ t: 'resume', code: this.code, seat: this.seat, token: this.token, have: this.net ? this.net.confirmedTo : -1 });
    } else this.flushPending();
  }

  private onMessage(m: NetMsg): void {
    const g = this.g;
    switch (m.t) {
      case 'room':
        this.code = str(m.code);
        this.seat = num(m.seat);
        this.token = str(m.token);
        this.phase = 'waiting';
        this.lobbyText();
        break;
      case 'match_start':
        this.begin(num(m.seed), num(m.seat), num(m.startFrame));
        break;
      case 'frame_batch':
        this.net?.onBatch(m as unknown as FrameBatch);
        break;
      case 'conn_resync': {
        // the same match after a reconnect; or a page reload, where it is rebuilt from the seed
        const seed = num(m.seed) >>> 0;
        if (!this.net || g.mode !== 'online' || g.eng.config.seed !== seed) {
          this.code = str(m.code) || this.code;
          this.seat = num(m.seat);
          this.begin(num(m.seed), this.seat, num(m.startFrame));
        }
        const log = Array.isArray(m.log) ? (m.log as PackedCmd[]) : [];
        this.net?.onResync({ ...m, log, curFrame: num(m.curFrame) } as Parameters<NetInput['onResync']>[0]);
        break;
      }
      case 'peer_status':
        if (m.seat !== this.seat) this.peerOnline = !!m.online;
        break;
      case 'desync':
        this.desync = true;
        g.renderer.banner(T('desync'), { size: 34, life: 2.5, color: '#fca5a5', y: 0.3 });
        break;
      case 'match_over':
        this.phase = 'over';
        if (!m.agree) this.desync = true;
        break;
      case 'room_closed':
        if (this.phase === 'match') this.lobbyMsg = T('roomClosed');
        this.drop();
        if (this.phase === 'waiting' || this.phase === 'lobby') {
          this.phase = 'lobby';
          this.lobbyText();
        } else if (g.state === 'match' && g.eng.phase !== PHASE_END) {
          this.phase = 'off';
          g.toMenu();
        } else this.phase = 'off';
        break;
      case 'error':
        if (m.code === 'no_room' || m.code === 'version') {
          // version: the room's creator runs another build, whose sim would drift from ours
          this.lobbyMsg = T(m.code === 'version' ? 'otherVersion' : 'noRoom');
          this.pending = null;
          g.sound.play('error');
          this.lobbyText();
        } else if (m.code === 'no_resume') {
          this.drop();
          const inMatch = g.state === 'match' && g.mode === 'online';
          this.phase = 'off';
          if (inMatch || g.state === 'online') g.toMenu();
        }
        break;
      default:
        break;
    }
  }

  /** Close the link and forget the room, keeping the phase for the caller to decide. */
  private drop(): void {
    this.forget();
    this.client?.close();
    this.client = null;
  }

  // ---------------- match ----------------
  private begin(seed: number, seat: number, startFrame: number): void {
    const g = this.g;
    this.phase = 'match';
    this.seat = seat;
    this.peerOnline = true;
    this.desync = false;
    this.leaveArm = 0;
    this.remember();
    g.mode = 'online';
    g.tut = null;
    this.net = new NetInput({ seat, startFrame: startFrame | 0 });
    g.setupEngine({ seed, aiBlue: false, aiRed: false }, seat, this.net);
    g.show(null);
    g.state = 'match';
    const blue = seat === TEAM_BLUE;
    g.renderer.banner(blue ? T('sideBlue') : T('sideRed'), { size: 40, life: 2.2, color: blue ? '#93c5fd' : '#fca5a5', y: 0.62 });
    g.sound.music('battle');
    g.platform.level('level_started');
    g.platform.gameplayStart();
  }

  /** The player's taps since the last frame go to the relay (it stamps the frame). */
  sendInput(): void {
    const c = this.g.collector.drain();
    if (c && this.client?.send({ t: 'cmd', c: [c.flip, 0, 0, c.ff] })) this.net?.noteSent();
  }

  sendHash(eng: Engine): void {
    this.client?.send({ t: 'hash', tick: eng.tick, h: eng.hash() });
  }

  matchOver(eng: Engine, e: SimEvent): void {
    this.client?.send({ t: 'over', tick: eng.tick, winner: e.winner ?? 0, h: eng.hash() });
    this.phase = 'over';
    this.forget();
    $('leaveBtn').classList.add('hidden');
  }

  /** The leave flag: the first tap arms it, a second within LEAVE_ARM_MS forfeits. */
  leave(): void {
    const g = this.g;
    if (!(g.state === 'match' && g.mode === 'online')) return;
    const now = performance.now();
    if (now - this.leaveArm > LEAVE_ARM_MS) {
      this.leaveArm = now;
      g.renderer.banner(T('leaveConfirm'), { size: 26, life: 2.4, color: COL.coin, y: 0.3 });
      g.sound.play('tap');
      return;
    }
    this.leaveArm = 0;
    g.collector.forfeit();
  }

  /** The HUD's link line during an online match. */
  statusLine(): Status {
    if (this.desync) return { text: T('desync'), color: '#fca5a5' };
    if (!this.client || this.client.state !== 'open') return { text: T('reconnecting'), color: COL.coin };
    if (!this.peerOnline) return { text: T('rivalOffline'), color: '#fdba74' };
    if (this.g.backlog() > 30) return { text: T('syncing'), color: COL.coin };
    return { text: `${Math.round(this.client.rtt)} ms`, color: 'rgba(203,213,225,0.8)' };
  }
}
