// Boot (after Potion Siege's app.ts): the language and the save, Pixi on a full-window canvas,
// the frame governor, the replay upload, the page's buttons and listeners, then the menu.

import { Application } from 'pixi.js';
import { relayUrl } from '../net/netClient';
import type { Platform } from '../platform/types';
import { checkReplay, runReplay, type Replay } from '../sim/replay';
import { loadArt } from '../view/art';
import { loadDigits } from '../view/digits';
import { patchGraphicsDestroy } from '../view/graphicsDestroy';
import { canvasDensity, densityCap, levelRange, QUALITY_MODES, type DeviceInfo } from '../view/quality';
import { QualityRuntime, gpuName } from '../view/qualityRuntime';
import { CHAPTERS, dayNumber, SKIRMISH, STAGES_PER_CHAPTER } from './campaign';
import { allStars, updateMenu } from './campaignUi';
import { devSwitches, LOCAL_HOST } from './dev';
import { $, applyTexts, updateMuteIcon, updateShare } from './dom';
import { wirePause } from './pauseMenu';
import { Game, WATCH_SPEEDS } from './game';
import { LANG, setLang } from './i18n';
import { readReplayFile, replayFromJson } from './replayFile';
import { privacyUrl, ReplayUpload, replayUrl } from './replayUpload';
import { loadSave } from './save';
import { wireSettings } from './settings';

const BACKGROUND = 0x0b1220;
/** The HUD font; the canvas texts wait this long for it at most. */
const FONT = '40px "Lilita One"';
const FONT_WAIT_MS = 2500;

declare global {
  interface Window {
    /** Console helpers: Hexfront.replay() is the last match as a JSON-safe replay,
     *  Hexfront.watch(r) shows one (a replay or a shelf document), Hexfront.check(r) plays it
     *  headless against its hashes. */
    Hexfront?: unknown;
  }
}

function device(app: Application): DeviceInfo {
  const nav = navigator as Navigator & { deviceMemory?: number };
  let gpu = '';
  try {
    gpu = gpuName(app.renderer);
  } catch {
    /* no debug info: treated as an unknown GPU */
  }
  return {
    mobile: navigator.maxTouchPoints > 0 && /mobi|android|iphone|ipad/i.test(navigator.userAgent),
    cores: nav.hardwareConcurrency || 0,
    memoryGB: nav.deviceMemory || 0,
    gpu,
  };
}

async function fontReady(): Promise<void> {
  try {
    await Promise.race([document.fonts.load(FONT), new Promise((r) => setTimeout(r, FONT_WAIT_MS))]);
  } catch {
    /* a fallback font from the stack draws instead */
  }
}

export async function boot(platform: Platform): Promise<void> {
  console.info(`[hexfront] build ${__HF_BUILD__} on ${platform.name}`);
  setLang((platform.languages()[0] ?? 'en').slice(0, 2).toLowerCase());
  document.documentElement.lang = LANG;
  const save = loadSave(platform.storage);

  patchGraphicsDestroy();
  const app = new Application();
  const cap = densityCap(platform.name);
  const resolution = canvasDensity(window.devicePixelRatio, cap);
  await Promise.all([
    app.init({ background: BACKGROUND, resizeTo: window, resolution, autoDensity: true, antialias: resolution < 2, preference: 'webgl' }),
    fontReady(),
    loadArt(),
    loadDigits(),
  ]);
  app.canvas.id = 'game';
  document.body.prepend(app.canvas);
  app.ticker.minFPS = 1;

  const dev = devSwitches(location.hostname, location.search);
  const game = new Game(app, platform, save, dev);
  // stars won before the leaderboard existed count too (the platform keeps the best score)
  platform.submitScore('stars', allStars(save));
  if (save.dailyWins) platform.submitScore('daily', save.dailyWins);
  // a build sends to its relay (or VITE_REPLAY_URL); the dev server only with ?upload
  const upTo = replayUrl(relayUrl(), import.meta.env.VITE_REPLAY_URL);
  if (upTo && (!import.meta.env.DEV || dev.upload)) {
    game.uploads = new ReplayUpload(upTo, () => game.save.shareReplays, __HF_BUILD__, platform.name).listen(document, window);
  }
  const devInfo = device(app);
  const quality = new QualityRuntime(
    app,
    levelRange(QUALITY_MODES[save.quality] ?? 'auto', devInfo),
    () => game.state !== 'match' || game.paused,
    () => game.state !== 'match',
    cap,
  );
  quality.onFault = game.fault;
  app.ticker.add((t) => game.frame(t));

  wire(game, platform, (tap) => wireSettings(game, quality, devInfo, tap));
  game.toMenu();
  game.online.resume();
  $('loading').classList.add('hidden');
  const parse = (x: unknown): Replay => {
    const r = replayFromJson(typeof x === 'string' ? (JSON.parse(x) as unknown) : x);
    if (!r) throw new Error('not a replay');
    return r;
  };
  window.Hexfront = {
    game,
    replay: () => game.lastReplay,
    watch: (x: unknown) => game.watch(parse(x)),
    check: (x: unknown) => checkReplay(parse(x)),
    runReplay,
  };
}

/** Page listeners and the HTML buttons. */
function wire(g: Game, platform: Platform, settings: (tap: () => void) => void): void {
  const S = g.sound;
  platform.onHostMute((m) => {
    g.hostMuted = m;
    S.applyMute();
  });
  platform.onHostPause((p) => g.setHostPaused(p));
  document.addEventListener('visibilitychange', () => {
    g.setHidden(document.hidden);
    if (document.hidden) platform.flush();
  });
  g.setHidden(document.hidden);
  S.installUnlock();
  applyTexts(g.save);
  updateMuteIcon(g.save);

  g.controls.install(g.app.canvas);
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('selectstart', (e) => {
    if (!(e.target instanceof HTMLElement && e.target.tagName === 'INPUT')) e.preventDefault();
  });
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  const tap = () => {
    S.unlock();
    S.play('tap');
  };
  wirePause(g, tap);
  settings(tap);
  $('playBtn').addEventListener('click', () => g.startMatch());
  // the campaign, the quick match and the daily challenge (campaignUi.ts)
  const toMenuPanel = () => {
    tap();
    g.state = 'menu';
    g.show('menu');
    updateMenu(g.save);
  };
  $('quickBtn').addEventListener('click', () => {
    tap();
    g.beginMatch({ kind: 'quick' });
  });
  $('diffBtn').addEventListener('click', () => {
    tap();
    g.save.skirmish = (g.save.skirmish + 1) % SKIRMISH.length;
    g.persist();
    updateMenu(g.save);
  });
  $('dailyBtn').addEventListener('click', () => {
    S.unlock();
    g.openBrief({ kind: 'daily', day: dayNumber(Date.now()) });
  });
  $('chPrev').addEventListener('click', () => {
    tap();
    g.openCampaign(Math.max(0, g.chapter - 1));
  });
  $('chNext').addEventListener('click', () => {
    tap();
    g.openCampaign(Math.min(CHAPTERS.length - 1, g.chapter + 1));
  });
  $('campBack').addEventListener('click', toMenuPanel);
  for (const [id, hard] of [['modeNormal', false], ['modeHard', true]] as const) {
    $(id).addEventListener('click', () => {
      tap();
      g.hardMode = hard;
      g.openCampaign(g.chapter);
    });
  }
  $('boardBtn').addEventListener('click', () => {
    tap();
    g.openBoard();
  });
  $('boardBack').addEventListener('click', () => {
    tap();
    g.openCampaign(g.chapter);
  });
  $('boostBtn').addEventListener('click', () => g.watchForHeadStart());
  $('briefGo').addEventListener('click', () => {
    if (g.adShowing) return;
    tap();
    g.beginMatch();
  });
  $('briefBack').addEventListener('click', () => {
    if (g.match.kind !== 'stage') return toMenuPanel();
    tap();
    g.openCampaign(g.chapter);
  });
  $('nextBtn').addEventListener('click', () => {
    tap();
    const m = g.match;
    if (m.kind !== 'stage') return;
    const id = m.id + 1;
    g.afterAd(() => {
      g.toMenu();
      g.chapter = Math.floor(id / STAGES_PER_CHAPTER);
      g.openBrief(m.hard ? { kind: 'stage', id, hard: true } : { kind: 'stage', id });
    });
  });
  $('howBtn').addEventListener('click', () => {
    tap();
    g.openHowTo('menu');
  });
  $('howtoOk').addEventListener('click', () => {
    S.play('tap');
    if (g.howtoThen === 'match') g.beginMatch();
    else g.toMenu();
  });
  $('watchBtn').addEventListener('click', () => {
    tap();
    const r = g.replayToWatch();
    if (r) g.afterAd(() => g.watch(r));
  });
  $('speedBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    tap();
    const i = WATCH_SPEEDS.indexOf(g.watchSpeed as (typeof WATCH_SPEEDS)[number]);
    g.setWatchSpeed(WATCH_SPEEDS[(i + 1) % WATCH_SPEEDS.length]!);
  });
  $('share').classList.toggle('hidden', !g.uploads);
  const privacy = privacyUrl(g.uploads?.url);
  $('privacyLink').classList.toggle('hidden', !g.uploads || !privacy);
  if (privacy) $<HTMLAnchorElement>('privacyLink').href = privacy;
  $<HTMLInputElement>('shareIn').addEventListener('change', (e) => {
    g.save.shareReplays = (e.target as HTMLInputElement).checked;
    g.persist();
    updateShare(g.save);
  });
  $('againBtn').addEventListener('click', () => {
    tap();
    g.afterAd(() => g.again());
  });
  $('menuBtn').addEventListener('click', () => {
    tap();
    g.afterAd(() => g.toMenu());
  });
  $('muteBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    S.unlock();
    g.save.muted = !g.save.muted;
    updateMuteIcon(g.save);
    S.applyMute();
    g.persist();
  });

  const O = g.online;
  $('onlineBtn').classList.toggle('hidden', !O.available());
  $('onlineBtn').addEventListener('click', () => O.open());
  $('createBtn').addEventListener('click', () => O.create());
  $('joinBtn').addEventListener('click', () => O.join());
  $('onlineBack').addEventListener('click', () => O.cancel());
  $('leaveBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (g.mode === 'watch') {
      tap();
      g.toMenu();
    } else O.leave();
  });
  const code = $<HTMLInputElement>('codeIn');
  code.addEventListener('input', () => {
    code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  });

  // on a local host, a replay file dropped on the page plays (Hexfront.replay() saved, or a shelf file)
  if (LOCAL_HOST.test(location.hostname)) {
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      void readReplayFile(file).then((r) => {
        if (!r) console.warn(`[hexfront] ${file.name} holds no replay`);
        else g.watch(r);
      });
    });
  }
}
