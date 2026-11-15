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
  // Restart and Menu throw the match away, so each asks for a second tap: the first one turns the
  // button into "Tap again to confirm" for a few seconds (a stray tap on a phone lost a whole match)
  armed(tap, 'pRestart', 'restart', () => {
    // the match left counts as quit; the new one starts the platform's gameplay again
    g.uploads?.end();
    g.beginMatch();
  });
  armed(tap, 'pMenu', 'menu', () => g.toMenu());

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

/** How long a destructive pause button stays armed after its first tap (ms). */
const ARM_MS = 3000;

/** A button that acts on its second tap: the first one arms it (class "armed", its text asks for
 *  the second tap) until ARM_MS pass or a panel changes (dom.ts show disarms every armed button). */
function armed(tap: () => void, id: string, key: string, act: () => void): void {
  const el = $(id);
  let timer = 0;
  el.addEventListener('click', () => {
    tap();
    clearTimeout(timer);
    if (!el.classList.contains('armed')) {
      el.classList.add('armed');
      el.textContent = T('sureTap');
      timer = window.setTimeout(() => {
        el.classList.remove('armed');
        el.textContent = T(key);
      }, ARM_MS);
      return;
    }
    el.classList.remove('armed');
    el.textContent = T(key);
    act();
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
