import { describe, expect, it } from 'vitest';
import { SafeStore } from '../platform/types';
import { SAVE_KEY, freshSave, loadSave, persist } from './save';

const store = (raw?: string) => {
  const s = new SafeStore(null);
  if (raw !== undefined) s.setItem(SAVE_KEY, raw);
  return s;
};

describe('save', () => {
  it('starts fresh with nothing stored or a corrupt value', () => {
    expect(loadSave(store())).toEqual(freshSave());
    expect(loadSave(store('{nope'))).toEqual(freshSave());
    expect(loadSave(store('42'))).toEqual(freshSave());
  });

  it('round-trips', () => {
    const s = store();
    const save = {
      tutorialDone: true, wins: 3, losses: 2, draws: 1, muted: true, musicOff: false, shareReplays: false,
      stages: [7, 1, 3], best: [95, 0, 210], skirmish: 2, dailyDay: 20400, dailyGoals: 5, streak: 3, streakDay: 20400,
      dailyWins: 9, hints: 5, ach: 0x41,
    };
    persist(s, save);
    expect(loadSave(s)).toEqual(save);
  });

  it('falls back field by field on foreign values', () => {
    const got = loadSave(
      store(JSON.stringify({ tutorialDone: 'yes', wins: -4, losses: 2.7, draws: 'x', muted: 1, shareReplays: 'no', stages: [9, 'a', 3], skirmish: 9, dailyDay: 'x', streak: -1 })),
    );
    expect(got).toEqual({ ...freshSave(), losses: 2, stages: [0, 0, 3] });
  });

  it('reads a save from before the music switch and the daily count', () => {
    const got = loadSave(store(JSON.stringify({ muted: true, streak: 4 })));
    expect(got.musicOff).toBe(true);
    expect(got.dailyWins).toBe(4);
    expect(loadSave(store(JSON.stringify({ muted: true, musicOff: false }))).musicOff).toBe(false);
  });
});
