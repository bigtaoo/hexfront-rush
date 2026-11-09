import { describe, expect, it } from 'vitest';
import { AdPacing } from './adPacing';

describe('AdPacing', () => {
  it('is due only after enough play, and starts over once shown', () => {
    const p = new AdPacing(1000);
    expect(p.due()).toBe(false);
    p.played(600);
    p.played(-50);
    expect(p.due()).toBe(false);
    p.played(400);
    expect(p.due()).toBe(true);
    p.shown();
    expect(p.due()).toBe(false);
  });
});
