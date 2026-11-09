// A frame that throws (after Potion Siege's game/faultGuard.ts): one bad frame must never leave a
// frozen canvas. Each fault says whether to report it (once per REPORT_GAP_MS) and what to do:
// recover (end what was running and put the menu up afresh), wait (a recovery just ran, give its
// screen a moment), or, once recoveries stop helping (STRIKES of them inside STRIKE_MS), restart
// the page. Where it cannot restart (it restarted a moment ago and the fault came back), it rests
// for STRIKE_MS and then recovers again, so a fault on every frame never turns into a reload loop.
// Pure.

export const REPORT_GAP_MS = 30_000;
export const RECOVER_GAP_MS = 1_000;
export const STRIKES = 4;
export const STRIKE_MS = 20_000;
/** A restart this soon after the last one is not tried again (the time is kept across the reload). */
export const RESTART_GAP_MS = 10 * 60_000;
/** sessionStorage key of the last restart's time. */
export const RESTART_KEY = 'hexfront_fault_restart';

export type FaultAction = 'recover' | 'wait' | 'restart';

export class FaultGuard {
  private reported = -Infinity;
  private recoveries: number[] = [];
  private restUntil = -Infinity;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly canRestart: () => boolean = () => true,
  ) {}

  fault(): { report: boolean; act: FaultAction } {
    const t = this.now();
    const report = t - this.reported >= REPORT_GAP_MS;
    if (report) this.reported = t;
    const last = this.recoveries[this.recoveries.length - 1] ?? -Infinity;
    if (t < this.restUntil || t - last < RECOVER_GAP_MS) return { report, act: 'wait' };
    this.recoveries = [...this.recoveries.filter((at) => t - at < STRIKE_MS), t];
    if (this.recoveries.length < STRIKES) return { report, act: 'recover' };
    this.recoveries = [];
    if (this.canRestart()) return { report, act: 'restart' };
    this.restUntil = t + STRIKE_MS;
    return { report, act: 'wait' };
  }
}

type SessionStore = Pick<Storage, 'getItem' | 'setItem'>;

function session(): SessionStore | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

/** True when this tab restarted for a fault less than RESTART_GAP_MS ago. */
export function restartedLately(store: SessionStore | undefined = session(), now = Date.now()): boolean {
  try {
    const at = Number(store?.getItem(RESTART_KEY));
    return at > 0 && now - at < RESTART_GAP_MS;
  } catch {
    return false;
  }
}

/** Notes a restart now, for restartedLately after the reload. */
export function markRestart(store: SessionStore | undefined = session(), now = Date.now()): void {
  try {
    store?.setItem(RESTART_KEY, String(now));
  } catch {
    /* without it a fault that comes back restarts again after STRIKES recoveries */
  }
}
