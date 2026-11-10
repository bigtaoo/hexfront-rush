import { describe, expect, it } from 'vitest';
import { PlaygamaBridge } from './bridge';
import { PlaygamaPlatform } from './PlaygamaPlatform';
import { fakeBridge } from './testBridge';

const noWait = () => new Promise<void>(() => {});

/** Just enough of document and window: listeners a test can fire. */
function page() {
  const on = new Map<string, (() => void)[]>();
  const target = {
    visibilityState: 'visible',
    addEventListener: (ev: string, fn: () => void) => void on.set(ev, [...(on.get(ev) ?? []), fn]),
  };
  return { doc: target as unknown as Document, win: target as unknown as Window, fire: (ev: string) => on.get(ev)?.forEach((f) => f()), target };
}

async function platform(opts: Parameters<typeof fakeBridge>[0] = {}) {
  const f = fakeBridge(opts);
  const p = page();
  const pg = await PlaygamaPlatform.create(['save'], new PlaygamaBridge(f.global, noWait), p.doc, p.win);
  return { f, p, pg };
}

describe('PlaygamaPlatform', () => {
  it('counts a test platform as web', async () => {
    expect((await platform({ id: 'mock' })).pg.name).toBe('web');
    expect((await platform({ id: 'playgama' })).pg.name).toBe('playgama');
  });

  it("takes the language from Bridge alone, English when it names none", async () => {
    expect((await platform({ language: 'ru' })).pg.languages()).toEqual(['ru']);
    expect((await platform({})).pg.languages()).toEqual(['en']);
  });

  it('holds gameplay_started until game_ready and drops repeats', async () => {
    const { f, pg } = await platform();
    pg.gameplayStart();
    expect(f.messages).toEqual([]);
    pg.loaded();
    pg.gameplayStart();
    pg.gameplayStop();
    pg.gameplayStop();
    pg.level('level_completed');
    expect(f.messages).toEqual(['game_ready', 'gameplay_started', 'gameplay_stopped', 'level_completed']);
  });

  it('reads the save through Bridge and flushes it when the page hides', async () => {
    const { f, p, pg } = await platform({ stored: { save: '{"wins":3}' } });
    expect(pg.storage.getItem('save')).toBe('{"wins":3}');
    pg.storage.setItem('save', '{"wins":4}');
    p.target.visibilityState = 'hidden';
    p.fire('visibilitychange');
    await Promise.resolve();
    expect(f.saved.at(-1)).toEqual([['save'], ['{"wins":4}']]);
  });

  it('mutes for the host sound switch and its pause, and passes the pause on', async () => {
    const { f, pg } = await platform();
    const muted: boolean[] = [];
    const paused: boolean[] = [];
    pg.onHostMute((m) => muted.push(m));
    pg.onHostPause((x) => paused.push(x));
    f.emit('pause_state_changed', true);
    f.emit('pause_state_changed', false);
    f.emit('audio_state_changed', false);
    expect(muted).toEqual([false, true, false, true]);
    expect(paused).toEqual([true, false]);
  });

  it('asks for an interstitial only once one is due', async () => {
    const { f, pg } = await platform();
    await pg.midgame(() => {});
    expect(f.shown).toBe(0);
    pg.played(10 * 60_000);
    let on = 0;
    const done = pg.midgame(() => on++);
    expect(f.shown).toBe(1);
    f.emit('interstitial_state_changed', 'opened');
    f.emit('interstitial_state_changed', 'closed');
    await done;
    expect(on).toBe(1);
    await pg.midgame(() => {});
    expect(f.shown).toBe(1);
  });

  it('sends each board to its own tag, and no empty score', async () => {
    const { f, pg } = await platform({ board: 'in_game' });
    pg.submitScore('stars', 14);
    pg.submitScore('daily', 3);
    pg.submitScore('daily', 0);
    await Promise.resolve();
    expect(f.scores).toEqual([['campaign_stars', 14], ['daily_wins', 3]]);
  });
});
