import { describe, expect, it, vi } from 'vitest';
import { SafeStore } from './types';
import { WebPlatform } from './web';

describe('WebPlatform', () => {
  it('plays a pretend ad only with ?ads=fake on a local host, and only once one is due', async () => {
    vi.useFakeTimers();
    const web = new WebPlatform('?ads=fake', 'localhost');
    const start = vi.fn();
    await web.midgame(start);
    expect(start).not.toHaveBeenCalled();
    web.played(10 * 60_000);
    const done = web.midgame(start);
    expect(start).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    const remote = new WebPlatform('?ads=fake', 'example.com');
    remote.played(10 * 60_000);
    const start2 = vi.fn();
    await remote.midgame(start2);
    expect(start2).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('SafeStore', () => {
  it('falls back to memory when the store throws', () => {
    const s = new SafeStore({
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    s.setItem('k', 'v');
    expect(s.getItem('k')).toBe('v');
    expect(new SafeStore(null).getItem('nope')).toBeNull();
  });
});
