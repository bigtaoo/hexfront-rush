// The game: the screens' flow (menu, how-to, match, results), the fixed-step loop and the pause
// (the player's own in a solo match, pauseMenu.ts, and the page's, the host's and an ad's).
//
// The loop: the sim advances in fixed 30 Hz ticks from an accumulator (StepLoop); each tick takes
// that tick's commands from an input source (LocalInput offline, NetInput online) and stops when
// the source has none yet. The renderer draws between the last two ticks (alpha). Player input
// never touches the sim directly: it goes through an InputCollector into commands.
//
// The player has no avatar. Their one move is tapping a card (an offer next to their ground) to
// flip it; dragging, the mouse wheel, the arrow keys, the edge markers and the overview only move the camera.
//
// Replays: every match records checkpoint hashes as it goes (recordChecks); its end leaves
// lastReplay, a solo match goes to the relay's collector too (replayUpload.ts), and watch() shows
// any replay again with a ReplayInput in place of the player.

import type { Application, Ticker } from 'pixi.js';
import { NetInput, catchUpRate } from '../net/netInput';
import type { Platform } from '../platform/types';
import { Engine } from '../sim/engine';
import { TICK_RATE } from '../sim/fixed';
import { InputCollector, LocalInput, type Cmd, type InputSource, type PackedCmd } from '../sim/input';
import { ReplayInput, recordChecks, type Replay } from '../sim/replay';
import { ENGINE_VERSION, PHASE_END, PHASE_INTRO, PHASE_PLAY, TEAM_BLUE, TEAM_RED } from '../sim/rules';
import type { ConfigInput } from '../sim/setup';
import type { MatchResult } from '../sim/types';
import type { DrawUi } from '../view/frame';
import { Renderer } from '../view/renderer';
import { Sound } from './audio';
import type { Board } from '../platform/types';
import { chapterOfNext, goalTrack, matchConfig, showBoard, showBrief, showChapter, stageOf, updateMenu, type MatchKind } from './campaignUi';
import { Controls } from './controls';
import type { DevSwitches } from './dev';
import { $, show, updateRecord, type Panel } from './dom';
import { Ads } from './ads';
import { handleEvents, type Fx } from './events';
import { FaultGuard, markRestart, restartedLately } from './faultGuard';
import { Hints } from './hints';
import { T } from './i18n';
import { MatchStats } from './matchStats';
import { Online } from './online';
import type { ReplayUpload } from './replayUpload';
import { showResult } from './result';
import { bossIntro, isBoss } from './rival';
import { persist, type Save } from './save';
import { StepLoop } from './stepLoop';
import { updateTutorial, type Tutorial } from './tutorial';

export type AppState = 'boot' | 'menu' | 'howto' | 'online' | 'campaign' | 'brief' | 'match' | 'result';
/** solo: against the AI; online: 1v1 through the relay; demo: the AI match behind the menu;
 *  watch: a replay played again. */
export type Mode = 'solo' | 'online' | 'demo' | 'watch';
/** An input source that logs what it fed the engine, for the replay. */
export type LoggedSource = InputSource & { readonly log: PackedCmd[] };
/** The replay speeds the speed button steps through. */
export const WATCH_SPEEDS = [1, 2, 4, 8] as const;

/** Online state checkpoint interval, ticks. */
const HASH_EVERY = TICK_RATE;
/** Online, this far behind (a reload, a long background), the sim jumps without effects. */
const JUMP_BACKLOG = 150;

const randomSeed = (): number => (Math.random() * 1e9) | 0;

export class Game {
  readonly renderer: Renderer;
  readonly sound: Sound;
  readonly online: Online;
  readonly controls: Controls;
  readonly loop = new StepLoop();
  readonly ui: DrawUi & { goldFlash: number } = { goldFlash: 0, demo: false };
  /** A frame threw: reported, whatever ran ended, the menu afresh (faultGuard.ts). */
  readonly fault: (err: unknown) => void;

  eng!: Engine;
  state: AppState = 'boot';
  mode: Mode = 'demo';
  localTeam = TEAM_BLUE;
  /** The local source offline (it logs the commands for the replay), null online. */
  input: LocalInput | null = null;
  source: LoggedSource = new LocalInput();
  collector = new InputCollector(TEAM_BLUE);
  tut: Tutorial | null = null;
  needGoldT = 0;
  /** Seconds until the results panel comes up after the end. */
  pendingResult = 0;
  lastReplay: Replay | null = null;
  /** Where solo replays go; null when they go nowhere (no relay, dev without ?upload). */
  uploads: ReplayUpload | null = null;
  /** The replay being watched, and how fast. */
  watching: Replay | null = null;
  watchSpeed: number = WATCH_SPEEDS[0];
  /** The match being played (or the last one): a campaign stage, a quick match or the daily one. */
  match: MatchKind = { kind: 'quick' };
  /** The chapter the campaign panel shows, and on which campaign (Normal or Hard). */
  chapter = 0;
  hardMode = false;
  /** Both sides' match stats, for the results (and the chests toward the second star). */
  readonly stats = new MatchStats();
  readonly hints = new Hints();
  /** The leaderboard the board panel shows. */
  board: Board = 'stars';

  // the pause: any of these stops a solo match; all but the player's own silence the game
  paused = false;
  /** The player's pause menu is open (a solo match). */
  userPause = false;
  private hidden = false;
  private hostPaused = false;
  /** The ads and the head start they pay for (ads.ts). */
  readonly ads = new Ads(this);
  hostMuted = false;
  private readySent = false;

  constructor(
    readonly app: Application,
    readonly platform: Platform,
    readonly save: Save,
    readonly dev: DevSwitches,
  ) {
    this.renderer = new Renderer(app);
    this.sound = new Sound({
      sfxOff: () => this.save.muted || this.hostMuted,
      musicOff: () => this.save.musicOff || this.hostMuted,
      // squared: the slider's middle sounds like half as loud
      sfxVol: () => (this.save.sfxVol / 100) ** 2,
      musicVol: () => (this.save.musicVol / 100) ** 2,
      paused: () => this.sysPaused(),
    });
    this.online = new Online(this);
    this.controls = new Controls(this);
    const guard = new FaultGuard(Date.now, () => !restartedLately());
    this.fault = (err) => {
      const { report, act } = guard.fault();
      if (report) console.error(err);
      if (act === 'wait') return;
      if (act === 'restart') {
        markRestart();
        location.reload();
        return;
      }
      try {
        this.toMenu();
      } catch (again) {
        console.error(again);
      }
    };
  }

  persist(): void {
    persist(this.platform.storage, this.save);
  }

  show(panel: Panel | null): void {
    show(panel, this.mode === 'online' || this.mode === 'watch', this.mode === 'watch', this.mode === 'solo' && this.state === 'match' && this.eng?.phase !== PHASE_END);
  }

  /** Start a fresh engine and point the view and the input at it. */
  setupEngine(config: ConfigInput, local: number, source: LoggedSource): void {
    this.eng = new Engine(config);
    this.localTeam = local;
    this.source = source;
    this.input = source instanceof LocalInput ? source : null;
    this.collector = new InputCollector(local);
    this.loop.reset();
    this.pendingResult = 0;
    this.stats.reset(this.eng);
    this.hints.reset();
    this.dropPause();
    this.controls.clear();
    this.renderer.reset();
    this.renderer.setView(this.eng, local);
  }

  /** Confirmed frames waiting to be stepped (always 0 offline). */
  backlog(): number {
    return this.source instanceof NetInput ? this.source.backlog(this.eng.tick) : 0;
  }

  // ---------------- flow ----------------
  toMenu(): void {
    // a solo match left before its end goes as quit
    this.uploads?.end();
    this.platform.gameplayStop();
    this.online.stop();
    this.watching = null;
    this.state = 'menu';
    this.mode = 'demo';
    this.tut = null;
    // the menu shows a live AI-vs-AI match behind the panel
    this.setupEngine({ seed: randomSeed(), aiBlue: true, aiRed: true }, TEAM_BLUE, new LocalInput());
    this.show('menu');
    updateRecord(this.save);
    updateMenu(this.save, this.online.available());
    this.sound.music('lobby');
  }

  openHowTo(): void {
    this.state = 'howto';
    this.show('howto');
  }

  /** The menu's main button: the first time straight into the first stage (the tutorial: its
   *  pointing hand teaches by doing; the how-to stays on the menu), after that the campaign's
   *  chapter map. */
  startMatch(): void {
    this.sound.unlock();
    this.sound.play('tap');
    if (!this.save.tutorialDone) return this.beginMatch({ kind: 'stage', id: 0 });
    this.openCampaign(chapterOfNext(this.save));
  }

  openCampaign(ch: number): void {
    this.state = 'campaign';
    this.chapter = ch;
    showChapter(this.save, ch, this.hardMode, (id) => this.openBrief(this.hardMode ? { kind: 'stage', id, hard: true } : { kind: 'stage', id }));
    $('boardBtn').classList.toggle('hidden', !this.platform.leaderboardReady());
    this.show('campaign');
  }

  /** A leaderboard (the campaign's stars, the daily challenges won), read when opened. */
  openBoard(board: Board = this.board): void {
    this.state = 'campaign';
    this.board = board;
    this.show('board');
    showBoard(null, board);
    void this.platform.topScores(board).then((rows) => {
      if (!$('board').classList.contains('hidden') && this.board === board) showBoard(rows, board);
    });
  }

  /** The brief before a stage or the daily challenge; its button starts the match. */
  openBrief(m: Exclude<MatchKind, { kind: 'quick' }>): void {
    this.sound.play('tap');
    this.state = 'brief';
    this.match = m;
    showBrief(this.save, m);
    this.ads.headStart.show(m, this.platform.rewardedReady());
    this.show('brief');
  }

  beginMatch(m: MatchKind = this.match): void {
    this.mode = 'solo';
    this.match = m;
    this.watching = null;
    this.state = 'match';
    // the tutorial is the first stage, on its own map (TUTORIAL_SEED: the card layout comes from the seed)
    const tutorial = !this.save.tutorialDone && !this.dev.autoplay && m.kind === 'stage' && m.id === 0;
    const config = matchConfig(m, this.save, randomSeed());
    if (this.dev.seed !== null) config.seed = this.dev.seed;
    this.ads.headStart.apply(m, config);
    const input = new LocalInput();
    this.setupEngine({ ...config, aiBlue: this.dev.autoplay }, TEAM_BLUE, input);
    this.show(null);
    if (!this.dev.autoplay) this.uploads?.start(this.eng, input.log, TEAM_BLUE);
    this.tut = tutorial ? { step: 0, t: 0 } : null;
    // a boss opens with its banner and its own music (rival.ts)
    this.sound.music(isBoss(m) ? 'boss' : 'battle');
    if (isBoss(m)) bossIntro(this.renderer, stageOf(m)!);
    this.platform.level('level_started');
    this.platform.gameplayStart();
  }

  /** Shows a replay from its start (the results' "watch replay", Hexfront.watch on the console);
   *  false when this engine cannot play it (another ENGINE_VERSION). The player's side is the one
   *  the AI did not play (blue when both or neither did). */
  watch(rep: Replay): boolean {
    if (rep.v !== ENGINE_VERSION) {
      console.warn(`[hexfront] that replay is from engine v${rep.v}, this is v${ENGINE_VERSION}`);
      return false;
    }
    this.uploads?.end();
    this.platform.gameplayStop();
    this.online.stop();
    this.mode = 'watch';
    this.watching = rep;
    this.state = 'match';
    this.show(null);
    this.tut = null;
    const { aiBlue, aiRed } = rep.config;
    this.setupEngine(rep.config, aiBlue && !aiRed ? TEAM_RED : TEAM_BLUE, new ReplayInput(rep));
    this.setWatchSpeed(WATCH_SPEEDS[0]);
    this.sound.music('battle');
    return true;
  }

  setWatchSpeed(speed: number): void {
    this.watchSpeed = speed;
    $('speedBtn').textContent = `${speed}×`;
  }

  /** The results panel; `res` null for a replay cut short (result.ts). */
  showResult(res: MatchResult | null): void {
    showResult(this, res);
  }

  /** What the results' "watch replay" shows: the replay being watched, else the last match. */
  replayToWatch(): Replay | null {
    return this.mode === 'watch' ? this.watching : this.lastReplay;
  }

  /** The results panel's "play again": the same match again (a solo one after a replay). */
  again(): void {
    if (this.mode === 'online') {
      this.toMenu();
      this.online.open();
    } else this.beginMatch();
  }

  // ---------------- pause ----------------
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.refreshPause();
  }
  setHostPaused(paused: boolean): void {
    this.hostPaused = paused;
    this.refreshPause();
  }

  /** The pause menu (pauseMenu.ts): only in a solo match being played. */
  canPause(): boolean {
    return this.mode === 'solo' && this.state === 'match' && this.eng.phase !== PHASE_END;
  }
  setUserPause(on: boolean): void {
    if (on && !this.canPause()) return;
    this.userPause = on;
    this.refreshPause();
    this.show(on ? 'pause' : null);
  }
  /** Out of the pause menu without restarting the platform's gameplay (a new match or the menu does). */
  private dropPause(): void {
    if (!this.userPause) return;
    this.userPause = false;
    this.paused = this.sysPaused();
  }

  /** The pauses that silence the game: the player's own keeps the music and the buttons' taps. */
  private sysPaused(): boolean {
    return this.hidden || this.hostPaused || this.ads.paused;
  }

  /** Takes the pause state as the flags now stand (ads.ts calls it when an ad comes and goes). */
  refreshPause(): void {
    const p = this.sysPaused() || this.userPause;
    this.sound.applyMute();
    if (p === this.paused) return;
    if (this.state === 'match' && this.mode !== 'watch' && this.eng.phase !== PHASE_END) {
      if (p) this.platform.gameplayStop();
      else this.platform.gameplayStart();
    }
    this.paused = p;
    if (p) this.controls.clear();
  }

  // ---------------- what input may do ----------------
  /** Flipping a card: only while the match is being played. */
  canSteer(): boolean {
    return this.state === 'match' && this.mode !== 'watch' && this.eng.phase === PHASE_PLAY && (!this.paused || this.mode === 'online');
  }
  /** Moving the camera: also after the end, to look over the field. */
  canLook(): boolean {
    return this.state === 'match' && this.eng.phase !== PHASE_INTRO && (!this.paused || this.mode === 'online');
  }

  // ---------------- the fixed-step loop ----------------
  /** One sim tick with its bookkeeping. */
  private simStep(cmds: Cmd[], fx: Fx): void {
    const eng = this.eng;
    eng.step(cmds);
    recordChecks(eng);
    this.stats.step(eng, this.localTeam);
    handleEvents(this, eng, fx);
    if (this.mode === 'online' && eng.tick % HASH_EVERY === 0) this.online.sendHash(eng);
  }

  /** Advance the sim by real time dt (seconds). Returns the interpolation alpha. */
  private advance(dt: number): number {
    const fx: Fx = this.mode === 'demo' ? 'visual' : 'full';
    if (this.mode === 'online') {
      this.online.sendInput();
      const back = this.backlog();
      if (back > JUMP_BACKLOG) {
        const until = this.eng.tick + back - 6;
        while (this.eng.tick < until) {
          const c = this.source.take(this.eng.tick);
          if (!c) break;
          this.simStep(c, 'none');
        }
        this.loop.reset();
        this.renderer.reset();
      }
    }
    const watch = this.mode === 'watch' ? this.watchSpeed : 1;
    const rate = TICK_RATE * this.dev.speed * watch * catchUpRate(this.backlog());
    return this.loop.run(dt * rate, () => {
      this.input?.push(this.collector.drain());
      const cmds = this.source.take(this.eng.tick);
      // a stall: the relay has not confirmed this frame yet
      if (!cmds) return false;
      this.simStep(cmds, fx);
      return true;
    });
  }

  /** One display frame (app.ticker). */
  frame(ticker: Ticker): void {
    const ms = Math.max(0, ticker.deltaMS);
    const dt = Math.min(0.05, ms / 1000);
    const realDt = Math.min(1, ms / 1000);
    const online = this.mode === 'online';
    const active = this.state === 'match' || this.state === 'result' || this.mode === 'demo';
    // online the sim cannot pause: the rival keeps playing, so it always follows the relay
    const run = active && (online || !this.paused);
    let alpha = 1;
    if (run) {
      if (this.mode === 'demo' && this.eng.phase === PHASE_END) {
        this.setupEngine({ seed: randomSeed(), aiBlue: true, aiRed: true }, TEAM_BLUE, new LocalInput());
      }
      alpha = this.advance(online ? realDt : dt);
      if (this.state === 'match' && this.eng.phase === PHASE_PLAY) this.platform.played(dt * 1000);
      updateTutorial(this, dt);
      this.hints.update(this, dt);
      if (this.needGoldT > 0) this.needGoldT -= dt;
      if (this.ui.goldFlash > 0) this.ui.goldFlash -= dt;
      if (this.pendingResult > 0) {
        this.pendingResult -= dt;
        if (this.pendingResult <= 0 && this.state === 'match' && this.eng.result) this.showResult(this.eng.result);
      }
      // a replay cut short holds its last tick: the results say it is over
      const w = this.watching;
      if (w && this.mode === 'watch' && this.state === 'match' && !this.eng.result && this.eng.tick >= w.endTick) this.showResult(null);
    }
    this.ui.demo = this.mode === 'demo';
    this.ui.look = this.canLook();
    if (online && this.state === 'match') this.renderer.status = this.online.statusLine();
    else if (this.mode === 'watch' && this.state === 'match') this.renderer.status = { text: T('watching') };
    else if (this.mode === 'solo' && this.state === 'match') this.renderer.status = this.tut ? null : goalTrack(this.match, this.stats.taken(this.localTeam));
    this.controls.keyPan(realDt);
    this.renderer.draw(this.eng, alpha, this.paused && !online ? 0 : dt, this.ui);
    this.sound.update(dt);
    if (!this.readySent && this.state === 'menu') {
      this.readySent = true;
      this.platform.loaded();
    }
  }
}
