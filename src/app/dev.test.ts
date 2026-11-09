import { describe, expect, it } from 'vitest';
import { devSwitches } from './dev';

describe('devSwitches', () => {
  it('reads the switches on a local host', () => {
    expect(devSwitches('localhost', '?autoplay&speed=4&seed=123&upload')).toEqual({ autoplay: true, speed: 4, seed: 123, upload: true });
    expect(devSwitches('127.0.0.1', '?speed=99').speed).toBe(16);
  });

  it('ignores them anywhere else and on bad values', () => {
    expect(devSwitches('example.com', '?autoplay&speed=4&seed=1')).toEqual({ autoplay: false, speed: 1, seed: null, upload: false });
    expect(devSwitches('localhost', '?speed=-2&seed=x')).toEqual({ autoplay: false, speed: 1, seed: null, upload: false });
  });
});
