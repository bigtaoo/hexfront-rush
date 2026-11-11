// The buttons added with the pause menu: the pause (a solo match: resume, restart the stage, back
// to the menu), the music switch beside the sound one, the leaderboard's two tabs (stars, daily
// challenges won) and the achievements panel off the menu. Esc / P open and close the pause
// (controls.ts).

import { ACHIEVEMENTS, achCount } from './achievements';
import { updateMenu } from './campaignUi';
import { $, updateMuteIcon } from './dom';
import type { Game } from './game';
import { T } from './i18n';
import { MEDAL } from './result';

export function wirePause(g: Game, tap: () => void): void {
  const S = g.sound;
  $('pauseBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    tap();
    g.setUserPause(true);
  });
  $('pResume').addEventListener('click', () => {
    tap();
    g.setUserPause(false);
  });
  $('pRestart').addEventListener('click', () => {
    tap();
    // the match left counts as quit; the new one starts the platform's gameplay again
    g.uploads?.end();
    g.beginMatch();
  });
  $('pMenu').addEventListener('click', () => {
    tap();
    g.toMenu();
  });

  $('musicBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    S.unlock();
    g.save.musicOff = !g.save.musicOff;
    updateMuteIcon(g.save);
    S.applyMute();
    g.persist();
  });

  $('boardStars').addEventListener('click', () => {
    tap();
    g.openBoard('stars');
  });
  $('boardDaily').addEventListener('click', () => {
    tap();
    g.openBoard('daily');
  });

  $('achBtn').addEventListener('click', () => {
    tap();
    g.state = 'campaign';
    showAchievements(g.save.ach);
    g.show('ach');
  });
  $('achBack').addEventListener('click', () => {
    tap();
    g.state = 'menu';
    g.show('menu');
    updateMenu(g.save, g.online.available());
  });
}

/** The achievements panel: every one, lit when earned, with what it asks. */
function showAchievements(bits: number): void {
  $('achSub').textContent = `${achCount(bits)}/${ACHIEVEMENTS.length}`;
  const grid = $('achGrid');
  grid.innerHTML = ACHIEVEMENTS.map((_, i) => `<div class="a${bits & (1 << i) ? ' on' : ''}">${MEDAL}<b></b><span></span></div>`).join('');
  grid.querySelectorAll<HTMLElement>('.a').forEach((el, i) => {
    const k = ACHIEVEMENTS[i]!;
    el.querySelector('b')!.textContent = T(`ach_${k}`);
    el.querySelector('span')!.textContent = T(`ach_${k}_d`);
  });
}
