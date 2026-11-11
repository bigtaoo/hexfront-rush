// A match's setup (setup.ts): the ranges every field is clamped to, and the strict check a replay
// from outside has to pass. The ranges are hand-written numbers that have to agree with tables in
// other files, and clamping is silent — an out-of-range value does not throw, it quietly becomes
// something else. That cost a day of AI experiments once: a fifth style pushed onto AI_STYLES was
// clamped back to the fourth, so four sweeps returned the same numbers. These tests tie the
// ranges to the tables, so growing a table without widening its range is a red test, not a lie.

import { describe, expect, it } from 'vitest';
import { AI_STYLES } from './ai';
import { RARITY } from './rules';
import { AI_SKILL_MAX, AI_SKILL_STD, makeConfig, parseConfig, sideSetup, STD_SIEGE } from './setup';

describe('the ranges agree with the tables they stand for', () => {
  it('every AI style is reachable', () => {
    for (let i = 0; i < AI_STYLES.length; i++) expect(sideSetup({ style: i }).style).toBe(i);
    // and one past the end is not: that is the clamp, and it is why this test exists
    expect(sideSetup({ style: AI_STYLES.length }).style).toBe(AI_STYLES.length - 1);
  });

  it('every skill up to AI_SKILL_MAX is reachable, and the standard one is in range', () => {
    for (let i = 0; i <= AI_SKILL_MAX; i++) expect(sideSetup({ skill: i }).skill).toBe(i);
    expect(sideSetup().skill).toBe(AI_SKILL_STD);
    expect(AI_SKILL_STD).toBeLessThanOrEqual(AI_SKILL_MAX);
  });

  it('a starting barracks of any rarity is reachable, and -1 means none', () => {
    for (let i = 0; i < RARITY.length; i++) expect(sideSetup({ barracks: i }).barracks).toBe(i);
    expect(sideSetup().barracks).toBe(-1);
    expect(sideSetup({ barracks: RARITY.length }).barracks).toBe(RARITY.length - 1);
  });
});

describe('sideSetup', () => {
  it('fills in the standard side when nothing is asked for', () => {
    expect(sideSetup()).toEqual({ skill: AI_SKILL_STD, style: 0, gold: 60, castle: 100, income: 100, barracks: -1, towers: 0 });
  });

  it('truncates toward zero and clamps, and ignores what is not a number', () => {
    expect(sideSetup({ gold: 99.9 }).gold).toBe(99);
    expect(sideSetup({ gold: -5 }).gold).toBe(0);
    expect(sideSetup({ castle: 999999 }).castle).toBe(1000);
    expect(sideSetup({ income: NaN }).income).toBe(100);
    expect(sideSetup({ income: Infinity }).income).toBe(100);
    expect(sideSetup({ gold: undefined }).gold).toBe(60);
  });
});

describe('makeConfig', () => {
  it('keeps the seed as a uint32 and both sides full', () => {
    const c = makeConfig({ seed: -1 });
    expect(c.seed).toBe(0xffffffff);
    expect(c.blue).toEqual(sideSetup());
    expect(c.red).toEqual(sideSetup());
    expect(c.aiBlue).toBe(false);
    expect(c.siege).toBe(STD_SIEGE);
  });

  it('clamps the siege to its range', () => {
    expect(makeConfig({ seed: 1, siege: 1 }).siege).toBe(60);
    expect(makeConfig({ seed: 1, siege: 99999 }).siege).toBe(60 * 60);
  });
});

describe('parseConfig: a config from outside', () => {
  const good = makeConfig({ seed: 7, aiBlue: true, blue: { gold: 120 } });

  it('takes a config it made itself, unchanged', () => {
    expect(parseConfig(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });

  it('takes a side left out entirely as the standard one', () => {
    const c = parseConfig({ seed: 7, aiBlue: false, aiRed: true });
    expect(c?.blue).toEqual(sideSetup());
    expect(c?.siege).toBe(STD_SIEGE);
  });

  it('refuses a field out of range rather than clamping it', () => {
    // the difference that matters: sideSetup trusts its caller, parseConfig does not
    expect(sideSetup({ gold: 99999 }).gold).toBe(5000);
    expect(parseConfig({ ...good, blue: { ...good.blue, gold: 99999 } })).toBeNull();
    expect(parseConfig({ ...good, blue: { ...good.blue, style: AI_STYLES.length } })).toBeNull();
    expect(parseConfig({ ...good, siege: 1 })).toBeNull();
  });

  it('refuses a half-written side, a wrong type and a non-object', () => {
    expect(parseConfig({ ...good, blue: { gold: 60 } })).toBeNull();
    expect(parseConfig({ ...good, blue: null })).toBeNull();
    expect(parseConfig({ ...good, blue: [] })).toBeNull();
    expect(parseConfig({ ...good, aiBlue: 1 })).toBeNull();
    expect(parseConfig({ ...good, seed: 1.5 })).toBeNull();
    expect(parseConfig(null)).toBeNull();
    expect(parseConfig([])).toBeNull();
    expect(parseConfig('{}')).toBeNull();
  });
});
