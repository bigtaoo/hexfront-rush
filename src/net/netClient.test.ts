import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEAD_MS, NetClient, PING_MS, RETRY_MS, type NetMsg, type NetState } from './netClient';

// The relay link without a relay: a fake socket the test opens, feeds and kills by hand, on a
// clock the test moves. What matters here is what the player feels — a link that goes quiet must
// not leave the match frozen, and coming back must not wait out the last failure's back-off.

class FakeWS {
  static made: FakeWS[] = [];
  readyState = 0;
  sent: string[] = [];
  closed = 0;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeWS.made.push(this);
  }
  send(s: string): void {
    this.sent.push(s);
  }
  close(): void {
    this.closed++;
  }
  // ---- what the test does to it ----
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  say(m: unknown): void {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  raw(data: string): void {
    this.onmessage?.({ data });
  }
  die(): void {
    this.readyState = 3;
    this.onclose?.();
  }
  get msgs(): NetMsg[] {
    return this.sent.map((s) => JSON.parse(s) as NetMsg);
  }
}

let nowMs = 0;
const adv = (ms: number): void => {
  nowMs += ms;
  vi.advanceTimersByTime(ms);
};

function client(): { c: NetClient; got: NetMsg[]; states: NetState[]; opens: number[] } {
  const got: NetMsg[] = [];
  const states: NetState[] = [];
  const opens: number[] = [];
  const c = new NetClient(
    'ws://relay.test',
    { onMessage: (m) => void got.push(m), onState: (s) => void states.push(s), onOpen: () => void opens.push(nowMs) },
    { now: () => nowMs, make: (u) => new FakeWS(u) as unknown as WebSocket },
  );
  return { c, got, states, opens };
}
const last = (): FakeWS => FakeWS.made[FakeWS.made.length - 1]!;

beforeEach(() => {
  vi.useFakeTimers();
  nowMs = 0;
  FakeWS.made = [];
});
afterEach(() => vi.useRealTimers());

describe('relay link', () => {
  it('opens, pings and passes messages on', () => {
    const { c, got, states, opens } = client();
    c.connect();
    expect(states).toEqual(['connecting']);
    last().open();
    expect(states).toEqual(['connecting', 'open']);
    expect(opens).toEqual([0]);
    expect(last().msgs[0]!.t).toBe('ping');
    adv(PING_MS);
    last().say({ t: 'pong', ts: nowMs - 60 });
    expect(c.rtt).toBe(60);
    last().say({ t: 'frame_batch', to: 3 });
    expect(got).toHaveLength(1);
    expect(got[0]!.t).toBe('frame_batch');
    // the pings keep going out and never reach the caller
    expect(last().msgs.filter((m) => m.t === 'ping')).toHaveLength(2);
  });

  it('ignores a torn message and a pong it cannot read without losing the link', () => {
    const { c, got } = client();
    c.connect();
    last().open();
    last().raw('{not json');
    last().raw('42');
    last().say({ t: 'pong', ts: 'soon' });
    expect(c.rtt).toBe(0);
    expect(Number.isFinite(c.rtt)).toBe(true);
    expect(got).toHaveLength(0);
    expect(c.state).toBe('open');
  });

  it('drops a socket that has gone quiet and reconnects', () => {
    const { c, states } = client();
    c.connect();
    last().open();
    const dead = last();
    adv(DEAD_MS); // still inside the grace: four pings, no answer yet
    expect(c.state).toBe('open');
    expect(dead.closed).toBe(0);
    adv(PING_MS);
    expect(dead.closed).toBe(1);
    expect(c.state).toBe('retry');
    // and it comes back on its own, at the first step of the back-off
    adv(RETRY_MS(0));
    expect(FakeWS.made).toHaveLength(2);
    expect(c.state).toBe('connecting');
    expect(states).toEqual(['connecting', 'open', 'retry', 'connecting']);
  });

  it('leaves a link alone while it is still answering', () => {
    const { c } = client();
    c.connect();
    last().open();
    for (let i = 0; i < 10; i++) {
      adv(PING_MS * 2);
      last().say({ t: 'pong', ts: nowMs });
    }
    expect(c.state).toBe('open');
    expect(FakeWS.made).toHaveLength(1);
  });

  it('backs off further after each failure and starts over once it is in', () => {
    const { c } = client();
    c.connect();
    const waits: number[] = [];
    for (let i = 0; i < 5; i++) {
      last().die();
      waits.push(RETRY_MS(i));
      adv(RETRY_MS(i));
    }
    expect(waits).toEqual([400, 640, 1024, 1638, 2621]);
    expect(RETRY_MS(9)).toBe(4000);
    expect(FakeWS.made).toHaveLength(6);
    last().open();
    expect(c.retries).toBe(0);
  });

  it('close() hangs up for good and leaves nothing behind for the next connect', () => {
    const { c, states } = client();
    c.connect();
    last().open();
    last().say({ t: 'pong', ts: nowMs - 90 });
    last().die();
    expect(c.state).toBe('retry');
    c.close();
    expect(c.state).toBe('idle');
    expect(c.retries).toBe(0);
    expect(c.rtt).toBe(0);
    adv(10000);
    expect(FakeWS.made).toHaveLength(1); // the pending retry was called off
    expect(states).toEqual(['connecting', 'open', 'retry', 'idle']);
  });

  it('says nothing down a socket that is not open', () => {
    const { c } = client();
    expect(c.send({ t: 'cmd' })).toBe(false);
    c.connect();
    expect(c.send({ t: 'cmd' })).toBe(false); // connecting, not open
    last().open();
    expect(c.send({ t: 'cmd' })).toBe(true);
    const was = last();
    was.die();
    expect(c.send({ t: 'cmd' })).toBe(false);
    // the old socket's events no longer count once it has been let go
    const before = c.state;
    was.say({ t: 'frame_batch' });
    expect(c.state).toBe(before);
  });
});
