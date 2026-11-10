// The results panel (index.html #result, a cream board): the title and the reason, the tiles
// held by each side, the stars, the time against the stage's best, both sides' match stats
// (matchStats.ts), the achievements just earned, and the buttons. What the match earns is
// recorded here too: the record, the goals, the best time, the daily count, the achievements and
// the leaderboards. A replay's result counts for nothing.

import { TICK_RATE } from '../sim/fixed';
import { TEAM_BLUE, TEAM_RED, enemyOf } from '../sim/rules';
import type { MatchResult } from '../sim/types';
import { achievementsMet, newOnes } from './achievements';
import { allStars, bestOf, fmtTime, recordGoals, showStars } from './campaignUi';
import { $, countUp, replay, updateRecord } from './dom';
import type { Game } from './game';
import { T } from './i18n';
import type { SideStats } from './matchStats';

/** The panel for `res` (null: a replay cut short, the page was hidden or left). */
export function showResult(g: Game, res: MatchResult | null): void {
  g.state = 'result';
  const me = g.localTeam, foe = enemyOf(me), save = g.save, m = g.match, st = g.stats;
  const won = !!res && res.winner === me;
  const lost = !!res && res.winner === foe;
  const solo = g.mode === 'solo' && !!res;
  const counted = g.mode === 'solo' || g.mode === 'online';
  const secs = Math.round(g.eng.elapsed() / TICK_RATE);
  let got: ReturnType<typeof recordGoals> = null;
  let best: { had: number; now: number } | null = null;
  let fresh: string[] = [];
  if (counted) {
    if (won) save.wins++;
    else if (lost) save.losses++;
    else save.draws++;
    const daily = save.dailyWins;
    if (solo) got = recordGoals(m, save, won, st.taken(me), st.eventsTotal, secs);
    if (solo && m.kind === 'stage') {
      const times = bestOf(save, m.hard);
      while (times.length <= m.id) times.push(0);
      const had = times[m.id]!;
      if (won && (!had || secs < had)) times[m.id] = secs;
      best = { had, now: times[m.id]! };
    }
    if (solo) {
      const mine = st.side(g.eng, me);
      const a = achievementsMet({
        match: m, won, skirmish: save.skirmish, taken: mine.events, total: st.eventsTotal, secs, peak: mine.peak, legend: st.legend,
        stages: save.stages, hard: save.hard, streak: save.streak,
      });
      fresh = newOnes(a, save.ach);
      save.ach |= a;
    }
    g.persist();
    if (got && m.kind === 'stage' && got.now & ~got.before) g.platform.submitScore('stars', allStars(save));
    if (save.dailyWins > daily) g.platform.submitScore('daily', save.dailyWins);
  }
  showStars(m, got, won && solo, lost && solo, save);
  $('againBtn').textContent = T(got && !won ? 'retry' : 'playAgain');
  const title = $('resultTitle');
  title.textContent = !res ? T('replayOver') : won ? T('victory') : lost ? T('defeat') : T('draw');
  title.className = won ? 'win' : lost ? 'lose' : 'draw';
  const reason = !res ? null : res.reason;
  $('resultReason').textContent =
    reason === null ? '' : reason === 'base' ? T('baseDestroyed') : reason === 'forfeit' ? (won ? T('rivalLeft') : T('youLeft')) : T('timeUp');
  $('watchBtn').classList.toggle('hidden', !g.replayToWatch());
  $('chipMe').style.background = me === TEAM_BLUE ? 'var(--team-b)' : 'var(--team-r)';
  $('chipFoe').style.background = me === TEAM_BLUE ? 'var(--team-r)' : 'var(--team-b)';

  const time = $('resTime');
  const parts = res ? [T('resTime', { t: fmtTime(secs) })] : [];
  if (best && won && best.now === secs && best.had !== secs) parts.push(T('newBest'));
  else if (best?.now) parts.push(T('bestTime', { t: fmtTime(best.now) }));
  time.textContent = parts.join(' · ');
  time.classList.toggle('hidden', !res);
  statsTable(st.side(g.eng, me), st.side(g.eng, foe), me);
  const ach = $('resAch');
  ach.innerHTML = fresh.map(() => `<div>${MEDAL}<span>${T('achNew')}: <b></b></span></div>`).join('');
  ach.querySelectorAll('b').forEach((b, i) => (b.textContent = T(`ach_${fresh[i]}`)));
  ach.classList.toggle('hidden', !fresh.length);

  updateRecord(save);
  g.show('result');
  replay($('result'), 'reveal');
  const still = () => g.state === 'result';
  const blue = res ? res.blue : g.eng.team[TEAM_BLUE]!.tiles;
  const red = res ? res.red : g.eng.team[TEAM_RED]!.tiles;
  countUp($('resMe'), me === TEAM_BLUE ? blue : red, 300, still);
  countUp($('resFoe'), me === TEAM_BLUE ? red : blue, 420, still);
  if (counted) g.platform.level(won ? 'level_completed' : 'level_failed');
}

/** A medal (an icon drawn here, no emoji: Playgama 4.3.2): a ribbon and a gold disc with a star. */
export const MEDAL =
  '<svg class="medal" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h4l2 6H9zM13 2h4l-2 6h-4z" fill="#c8402a"/><circle cx="12" cy="15" r="7" fill="var(--gold)" stroke="var(--gold-rim)" stroke-width="1.6"/><path d="M12 11l1.2 2.5 2.7.3-2 1.9.6 2.7L12 17l-2.5 1.4.6-2.7-2-1.9 2.7-.3z" fill="#fff6e2"/></svg>';

/** Both sides' stats, one row each; the better side's number is marked. */
function statsTable(you: SideStats, rival: SideStats, me: number): void {
  const rows: [string, keyof SideStats][] = [['st_mines', 'mines'], ['st_barracks', 'barracks'], ['st_events', 'events'], ['st_peak', 'peak']];
  const yc = me === TEAM_BLUE ? 'b' : 'r', rc = me === TEAM_BLUE ? 'r' : 'b';
  const cell = (v: number, o: number, c: string) => `<td class="${c}${v > o ? ' up' : ''}">${v}</td>`;
  $('resStats').innerHTML =
    `<tr><th></th><th class="${yc}">${T('you')}</th><th class="${rc}">${T('rival')}</th></tr>` +
    rows.map(([key, f]) => `<tr><th>${T(key)}</th>${cell(you[f], rival[f], yc)}${cell(rival[f], you[f], rc)}</tr>`).join('');
}
