// The quest the board asks for next (economy.ts questOf / updateQuests). A match lists three
// quests; after those the loop (rules.ts QUEST_LOOP) goes round for the rest of the match, so the
// panel is never empty. A looped quest counts from the moment it was handed out, which is what
// TeamState.questBase holds.

import { describe, expect, it } from 'vitest';
import { questOf, updateQuests } from './economy';
import { Engine } from './engine';
import { QUESTS, QUEST_LOOP, TEAM_BLUE, type Quest } from './rules';

const fresh = () => new Engine({ seed: 31, aiBlue: false, aiRed: false });

/** Hands the team exactly what the quest asks for, then lets the step that pays it run. */
function finish(e: Engine, team: number, q: Quest): void {
  const T = e.team[team]!;
  if (q.kind === 'tiles') T.tiles = q.need;
  else T.built[q.kind] = T.questBase + q.need;
  updateQuests(e);
}

/** The ids of the next `n` quests the team is handed, finishing each one. */
function walk(e: Engine, team: number, n: number): string[] {
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const q = questOf(e, team).q;
    out.push(q.id);
    finish(e, team, q);
  }
  return out;
}

describe('quests', () => {
  it('lists three, then goes round: there is always one', () => {
    const e = fresh();
    expect(e.questList.length).toBe(3);
    const ids = walk(e, TEAM_BLUE, 12);
    const listed = e.questList.map((i) => QUESTS[i]!.id);
    expect(ids.slice(0, 3)).toEqual(listed);
    // and from there the loop, over and over
    const loop = QUEST_LOOP.map((i) => QUESTS[i]!.id);
    for (let k = 3; k < ids.length; k++) expect(ids[k]).toBe(loop[(k - 3) % loop.length]);
  });

  it('never asks for tiles again: a team losing ground could not finish it', () => {
    const e = fresh();
    const ids = walk(e, TEAM_BLUE, 24).slice(3);
    expect(ids).not.toContain('tiles');
  });

  it('counts a looped quest from where it was handed out', () => {
    const e = fresh();
    const T = e.team[TEAM_BLUE]!;
    walk(e, TEAM_BLUE, 3);
    // whatever the listed quests left standing, the first looped one asks for that many more
    const q = questOf(e, TEAM_BLUE).q;
    if (q.kind === 'tiles') throw new Error('a looped quest is never the tiles one');
    expect(T.questBase).toBe(T.built[q.kind]!);
    expect(questOf(e, TEAM_BLUE).prog).toBe(0);
    T.built[q.kind]!++;
    expect(questOf(e, TEAM_BLUE).prog).toBe(1);
    updateQuests(e);
    expect(questOf(e, TEAM_BLUE).q.id).toBe(q.id); // one short: still the same quest
  });

  it('pays each quest once, and the progress it shows never runs past the goal', () => {
    const e = fresh();
    const T = e.team[TEAM_BLUE]!;
    const gold0 = T.gold;
    const q = questOf(e, TEAM_BLUE).q;
    finish(e, TEAM_BLUE, q);
    expect(T.gold).toBe(gold0 + q.reward);
    // the same standing, stepped again: the next quest is on, and nothing is paid twice
    updateQuests(e);
    updateQuests(e);
    expect(T.gold).toBe(gold0 + q.reward);
    const next = questOf(e, TEAM_BLUE);
    expect(next.q.id).not.toBe(q.id);
    expect(next.prog).toBeLessThanOrEqual(next.q.need);
  });

  it('hands the two sides their own quests', () => {
    const e = fresh();
    finish(e, TEAM_BLUE, questOf(e, TEAM_BLUE).q);
    expect(e.team[TEAM_BLUE]!.questIdx).toBe(1);
    expect(e.team[2]!.questIdx).toBe(0);
  });
});
