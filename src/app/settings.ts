// The settings panel (the menu's gear): sound effects and music (one slider each: at 0 the sound is
// off, dragged up it is on again; a tap on its name switches it off and on), graphics (auto / high / saver: the
// frame governor's level range, view/quality.ts), vibration (only where the device has it,
// haptics.ts), and the replay sharing opt-in with its privacy link. Kept in the save.

import { levelRange, QUALITY_MODES, type DeviceInfo } from '../view/quality';
import type { QualityRuntime } from '../view/qualityRuntime';
import { $, updateMuteIcon } from './dom';
import type { Game } from './game';
import { haptics } from './haptics';

export function showQuality(q: number): void {
  for (const b of document.querySelectorAll<HTMLElement>('#optQuality .tab')) b.classList.toggle('on', Number(b.dataset.q) === q);
}

export function wireSettings(g: Game, quality: QualityRuntime, dev: DeviceInfo, tap: () => void): void {
  const S = g.sound;
  const check = (id: string) => $<HTMLInputElement>(id);
  const syncSound = () => {
    updateMuteIcon(g.save);
    S.applyMute();
    g.persist();
  };
  $('setBtn').addEventListener('click', () => {
    tap();
    check('optVib').checked = g.save.vibrate;
    showQuality(g.save.quality);
    g.show('settings');
  });
  $('setBack').addEventListener('click', () => {
    tap();
    g.toMenu();
  });
  /** A volume a sound switched back on comes back at when it was left at 0. */
  const BACK_ON = 60;
  // the switch (hidden: its name is the label that taps it) and the slider are one control
  check('optSfx').addEventListener('change', (e) => {
    S.unlock();
    g.save.muted = !(e.target as HTMLInputElement).checked;
    if (!g.save.muted && !g.save.sfxVol) g.save.sfxVol = BACK_ON;
    syncSound();
    if (!g.save.muted) S.play('tap');
  });
  check('optMusic').addEventListener('change', (e) => {
    S.unlock();
    g.save.musicOff = !(e.target as HTMLInputElement).checked;
    if (!g.save.musicOff && !g.save.musicVol) g.save.musicVol = BACK_ON;
    syncSound();
  });
  // the volume sliders: heard while dragged, kept on release (an effect plays then, to judge it by);
  // at 0 the sound is off, above it on
  const volume = (id: string, key: 'sfxVol' | 'musicVol', flag: 'muted' | 'musicOff') => {
    const el = check(id);
    el.addEventListener('input', () => {
      S.unlock();
      const v = Number(el.value);
      if (v > 0) g.save[key] = v;
      g.save[flag] = v === 0;
      updateMuteIcon(g.save);
      S.applyMute();
    });
    el.addEventListener('change', () => {
      g.persist();
      if (key === 'sfxVol' && !g.save.muted) S.play('coin');
    });
  };
  volume('optSfxVol', 'sfxVol', 'muted');
  volume('optMusicVol', 'musicVol', 'musicOff');
  for (const b of document.querySelectorAll<HTMLElement>('#optQuality .tab')) {
    b.addEventListener('click', () => {
      tap();
      const q = Number(b.dataset.q);
      g.save.quality = q;
      g.persist();
      showQuality(q);
      quality.setRange(levelRange(QUALITY_MODES[q] ?? 'auto', dev));
    });
  }
  $('optVibRow').classList.toggle('hidden', !haptics.available);
  check('optVib').addEventListener('change', (e) => {
    g.save.vibrate = (e.target as HTMLInputElement).checked;
    g.persist();
    if (g.save.vibrate) haptics.test();
  });
  haptics.on = () => g.save.vibrate && !g.paused;
}
