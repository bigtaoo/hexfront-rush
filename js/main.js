'use strict';
// Bootstrap, Playgama Bridge integration, the fixed-step loop, input, UI flow and online play.
//
// The loop: the sim (js/sim) advances in fixed 30 Hz ticks from an accumulator; each tick takes
// that tick's commands from an input source (LocalInput offline, NetInput online) and stops when
// the source has none yet. The renderer draws between the last two ticks (alpha). Player input
// never touches the sim directly: it goes through an InputCollector into commands.

const SAVE_KEY = 'hexfront_save';
const ROOM_KEY = 'hexfront_room';     // sessionStorage: { code, seat, token } of the live online match
const MAX_STEPS = 40;                 // per frame, so a long stall cannot freeze the page
const HASH_EVERY = TICK_RATE;         // online state checkpoint interval, ticks

const App = {
  save: { tutorialDone: false, wins: 0, losses: 0, draws: 0, muted: false },
  eng: null,
  renderer: null,
  state: 'boot', // menu | howto | online | match | result
  mode: 'solo',  // solo | online | demo (menu background)
  localTeam: TEAM_BLUE,
  input: null,       // LocalInput (offline only)
  source: null,      // what the loop takes commands from: LocalInput or NetInput
  collector: null,
  acc: 0,
  paused: false,
  platformAudio: true,
  ui: { goldFlash: 0, needGoldT: 0, heroView: null },
  tut: null,
  pendingResult: 0,
  lastReplay: null,
};

// ---------------- Platform (js/platform.js) ----------------
function bridgeMessage(msg) { Platform.send(msg); }
function persist() { Platform.setItem(SAVE_KEY, JSON.stringify(App.save)); }
function loadSave() {
  const raw = Platform.getItem(SAVE_KEY);
  if (!raw) return;
  try { Object.assign(App.save, JSON.parse(raw)); } catch (e) { /* ignore corrupt save */ }
}

// ---------------- DOM / UI ----------------
const $ = (id) => document.getElementById(id);

function applyTexts() {
  document.title = T('title');
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = T(el.getAttribute('data-t'));
  $('codeIn').placeholder = T('codeHint');
  updateRecord();
}
function updateRecord() { $('record').textContent = T('record', { w: App.save.wins, l: App.save.losses }); }
function updateMuteIcon() { $('muteBtn').classList.toggle('muted', !!App.save.muted); }
function show(id) {
  for (const p of ['menu', 'howto', 'result', 'online']) $(p).classList.toggle('hidden', p !== id);
  $('leaveBtn').classList.toggle('hidden', !(id === null && App.mode === 'online'));
}

/** Start a fresh engine and point the view and the input at it. */
function setupEngine(config, local, source) {
  App.eng = new Engine(config);
  App.localTeam = local;
  App.source = source;
  App.input = source instanceof LocalInput ? source : null;
  App.collector = new InputCollector(local);
  App.acc = 0;
  App.pendingResult = 0;
  App.ui.heroView = null;
  Pred.reset();
  Input.keys.clear(); Input.down = false;
  const R = App.renderer;
  R.reset();
  R.setView(App.eng, local);
}

function toMenu() {
  Platform.gameplayStop();
  if (Online.client) Online.stop();
  App.state = 'menu';
  App.mode = 'demo';
  App.tut = null;
  // the menu shows a live AI-vs-AI match behind the panel
  setupEngine({ seed: (Math.random() * 1e9) | 0, aiBlue: true, aiRed: true }, TEAM_BLUE, new LocalInput());
  show('menu');
  updateRecord();
  Sound.music('lobby');
}

function openHowTo(then) {
  App.state = 'howto';
  App.howtoThen = then || null;
  show('howto');
}

function startMatch() {
  Sound.unlock();
  Sound.play('tap');
  if (!App.save.tutorialDone) { openHowTo('match'); return; }
  beginMatch();
}

function beginMatch() {
  App.mode = 'solo';
  show(null);
  App.state = 'match';
  const seed = DEV.seed !== null ? DEV.seed : (Math.random() * 1e9) | 0;
  const tutorial = !App.save.tutorialDone && !DEV.autoplay;
  setupEngine({ seed, aiBlue: DEV.autoplay, aiRed: true }, TEAM_BLUE, new LocalInput());
  App.tut = tutorial ? { step: 0, t: 0, moved: 0 } : null;
  Sound.music('battle');
  bridgeMessage('level_started');
  Platform.gameplayStart();
}

function showResult(res) {
  App.state = 'result';
  const me = App.localTeam;
  const won = res.winner === me, lost = res.winner === enemyOf(me);
  if (won) App.save.wins++; else if (lost) App.save.losses++; else App.save.draws++;
  persist();
  const title = $('resultTitle');
  title.textContent = won ? T('victory') : lost ? T('defeat') : T('draw');
  title.className = won ? 'win' : lost ? 'lose' : 'draw';
  $('resultReason').textContent = res.reason === 'base' ? T('baseDestroyed') : res.reason === 'forfeit'
    ? (won ? T('rivalLeft') : T('youLeft')) : T('timeUp');
  $('chipMe').style.background = me === TEAM_BLUE ? '#2563eb' : '#dc2626';
  $('chipFoe').style.background = me === TEAM_BLUE ? '#dc2626' : '#2563eb';
  updateRecord();
  show('result');
  const panel = $('result');
  panel.classList.remove('reveal'); void panel.offsetWidth; panel.classList.add('reveal');
  countUp($('resMe'), me === TEAM_BLUE ? res.blue : res.red, 300);
  countUp($('resFoe'), me === TEAM_BLUE ? res.red : res.blue, 420);
  bridgeMessage(won ? 'level_completed' : 'level_failed');
}

/** The score counts up from 0 once its chip has popped in (the last value always lands). */
function countUp(el, to, delay) {
  el.textContent = '0';
  const t0 = performance.now() + delay, len = 700;
  const step = (now) => {
    const u = Math.min(1, Math.max(0, (now - t0) / len));
    el.textContent = String(Math.round(to * (1 - Math.pow(1 - u, 3))));
    if (u < 1 && App.state === 'result') requestAnimationFrame(step); else el.textContent = String(to);
  };
  requestAnimationFrame(step);
}

/** Paced interstitial between matches; the game pauses and mutes while it is on screen. */
function afterAd(then) {
  App.adBusy = true;
  Platform.interstitial(() => { App.adPause = true; setPaused(true); }).then(() => {
    App.adBusy = false;
    if (App.adPause) { App.adPause = false; setPaused(document.hidden); }
    then();
  });
}

// ---------------- events from the simulation ----------------
/** fx: 'full' (sound + visuals + flow), 'visual' (menu demo), 'none' (fast-forward: flow only). */
function handleEvents(eng, fx) {
  const R = App.renderer;
  const me = App.localTeam;
  const full = fx === 'full';
  for (const e of eng.events) {
    if (e.type === 'end') { if (App.mode !== 'demo') onMatchEnd(eng, e, fx !== 'none'); continue; }
    if (fx === 'none') continue;
    R.onEvent(e);
    if (!full) continue;
    const mine = e.team === me;
    switch (e.type) {
      case 'count': R.banner(String(e.n), { size: 96, life: 0.9, color: '#fde047' }); Sound.play('beep'); break;
      case 'fight': R.banner(T('fight'), { size: 64, life: 1.1, color: '#ffffff', band: me === TEAM_BLUE ? 'rgba(37,99,235,0.55)' : 'rgba(220,38,38,0.55)' }); Sound.play('go'); break;
      case 'oneMinute': R.banner(T('oneMinute'), { size: 34, life: 2, color: '#fde047', y: 0.3 }); Sound.play('beep'); break;
      case 'tick': R.banner(String(e.n), { size: 84, life: 0.9, color: '#f87171', y: 0.4 }); Sound.play('beep', 0.7); break;
      case 'needGold':
        if (mine && App.ui.needGoldT <= 0) {
          App.ui.needGoldT = 1.2; App.ui.goldFlash = 0.6;
          R.needGold(e.x, e.y);
          Sound.play('error');
        }
        break;
      case 'built': if (mine) Sound.play('build'); break;
      case 'barracks':
        if (mine) {
          Sound.play('build');
          R.card = { unit: e.unit, rarity: e.rarity, t: 0, life: 2.2 };
          if (e.rarity === 3) { R.banner(T('legendary'), { size: 58, life: 1.8, color: '#fde047', band: 'rgba(120,53,15,0.6)' }); Sound.play('legend'); }
        }
        break;
      case 'mysteryNothing': if (mine) Sound.play('nothing'); break;
      case 'mysteryWin':
        if (mine) {
          R.banner(T('lucky'), { size: 48, life: 1.4, color: '#fde047', y: 0.32 });
          R.card = { unit: e.unit, rarity: e.rarity, t: 0, life: 2.2 };
          Sound.play(e.rarity === 3 ? 'legend' : 'quest');
        }
        break;
      case 'spawn': if (mine) Sound.play('spawn'); break;
      case 'shoot': Sound.play('shoot'); break;
      case 'hit': Sound.play('hit'); break;
      case 'melee': Sound.play('melee'); break;
      case 'unitDown': Sound.play('pop'); break;
      case 'bldDown': Sound.play('destroy'); break;
      case 'heroDown': Sound.play(mine ? 'destroy' : 'quest'); break;
      case 'chest': if (mine) Sound.play('coin'); break;
      case 'income': if (mine) Sound.play('income'); break;
      case 'quest':
        if (mine) {
          R.banner(T('questDone', { g: e.reward }), { size: 30, life: 1.8, color: '#86efac', y: 0.72 });
          Sound.play('quest');
        }
        break;
    }
  }
}

function onMatchEnd(eng, e, loud) {
  const me = App.localTeam;
  const R = App.renderer;
  Platform.gameplayStop();
  if (loud) {
    Sound.play(e.winner === me ? 'win' : e.winner ? 'lose' : 'beep');
    R.banner(e.winner === me ? T('victory') : e.winner ? T('defeat') : T('draw'),
      { size: 64, life: 2.2, color: e.winner === me ? '#93c5fd' : e.winner ? '#fca5a5' : '#ffffff', band: 'rgba(0,0,0,0.45)' });
  }
  App.pendingResult = loud ? 2.0 : 0.01;
  R.hint = null;
  const log = App.mode === 'online' ? Online.net.log : App.input.log;
  App.lastReplay = makeReplay(eng.config, log, eng);
  if (App.mode === 'online') Online.matchOver(eng, e);
}

// ---------------- the fixed-step loop ----------------
/** One sim tick with its bookkeeping. */
function simStep(cmds, fx) {
  const eng = App.eng;
  const prevTile = eng.heroes[App.localTeam].tile;
  eng.step(cmds);
  if (App.tut && eng.heroes[App.localTeam].tile !== prevTile) App.tut.moved++;
  handleEvents(eng, fx);
  if (App.mode === 'online' && eng.tick % HASH_EVERY === 0) Online.sendHash(eng);
}

/** Advance the sim by real time dt (seconds). Returns the interpolation alpha. */
function advance(dt) {
  const eng = App.eng;
  const fx = App.mode === 'demo' ? 'visual' : 'full';
  if (App.mode === 'online') {
    Online.sendInput();
    // far behind (reload, long background): jump without effects instead of fast-playing for many seconds
    let back = App.source.backlog(eng.tick);
    if (back > 150) {
      const until = eng.tick + back - 6;
      while (eng.tick < until) { const c = App.source.take(eng.tick); if (!c) break; simStep(c, 'none'); }
      App.acc = 0;
      App.renderer.reset();
    }
  }
  const back = App.source.backlog(eng.tick);
  App.acc += dt * TICK_RATE * DEV.speed * catchUpRate(back);
  let steps = 0;
  while (App.acc >= 1 && steps < MAX_STEPS) {
    if (App.input) App.input.push(App.collector.drain());
    const cmds = App.source.take(eng.tick);
    if (!cmds) { App.acc = 1; break; }   // stall: the relay has not confirmed this frame yet
    simStep(cmds, fx);
    App.acc -= 1;
    steps++;
  }
  if (steps >= MAX_STEPS) App.acc = 0;
  return Math.min(1, App.acc);
}

let lastTs = 0, firstFrame = true;
function frame(ts) {
  const dt = Math.max(0, Math.min(0.05, (ts - (lastTs || ts)) / 1000));
  const realDt = Math.max(0, Math.min(1, (ts - (lastTs || ts)) / 1000));
  lastTs = ts;
  const eng = App.eng;
  if (eng) {
    const online = App.mode === 'online';
    const active = App.state === 'match' || App.state === 'result' || App.mode === 'demo';
    // online the sim cannot pause: the rival keeps playing, so it always follows the relay
    const run = active && (online || !App.paused);
    let alpha = 1;
    if (run) {
      if (App.mode === 'demo' && eng.phase === PHASE_END) {
        setupEngine({ seed: (Math.random() * 1e9) | 0, aiBlue: true, aiRed: true }, TEAM_BLUE, new LocalInput());
      }
      alpha = advance(online ? realDt : dt);
      if (App.state === 'match' && App.eng.phase === PHASE_PLAY) Platform.played(dt * 1000);
      updateTutorial(App.eng, dt);
      if (App.ui.needGoldT > 0) App.ui.needGoldT -= dt;
      if (App.ui.goldFlash > 0) App.ui.goldFlash -= dt;
      if (App.pendingResult > 0) {
        App.pendingResult -= dt;
        if (App.pendingResult <= 0 && App.state === 'match') showResult(App.eng.result);
      }
    }
    App.ui.heroView = null;
    if (online && App.state === 'match') {
      const p = Pred.update(App.eng, App.localTeam, alpha, ts, Online.net.delayMs, App.collector.kx, App.collector.ky);
      if (p) App.ui.heroView = App.renderer.view(p.x, p.y);
      App.renderer.status = Online.statusLine();
    }
    App.renderer.draw(App.eng, alpha, App.paused && !online ? 0 : dt, App.ui);
  }
  Sound.update(dt);
  if (firstFrame && App.state === 'menu') {
    firstFrame = false;
    bridgeMessage('game_ready');
  }
  requestAnimationFrame(frame);
}

function setPaused(p) {
  if (App.state === 'match' && App.eng && App.eng.phase !== PHASE_END) { if (p) Platform.gameplayStop(); else Platform.gameplayStart(); }
  App.paused = p;
  Sound.applyMute();
  if (p) { Input.keys.clear(); updateKbd(); Input.down = false; }
}

// ---------------- tutorial ----------------
/** Where the hand points: two tiles ahead of the hero (move), the nearest offer (build), a barracks offer. */
function guideTarget(eng, tut) {
  const me = App.localTeam;
  const h = eng.heroes[me];
  if (h.dead || h.path.length) return null;     // not while it walks: let the player watch
  const d2 = (t) => (t.x - h.x) * (t.x - h.x) + (t.y - h.y) * (t.y - h.y);
  const near = (pred) => {
    let best = null, bd = Infinity;
    const offers = eng.team[me].offers;
    for (let i = 0; i < NTILES; i++) {
      const oi = offers[i];
      if (oi < 0) continue;
      const t = eng.tiles[i];
      if (t.bld || !pred(OFFER_LIST[oi])) continue;
      const d = d2(t);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  };
  if (tut.step === 0) {
    if (!tut.moveTo || tut.moveFrom !== h.tile) {
      // a free tile two steps out, the one nearest the middle of the map
      const mid = eng.tiles[idx(COLS >> 1, ROWS >> 1)];
      let best = null, bd = Infinity;
      const home = eng.tiles[h.tile];
      for (const a of home.nb) for (const b of eng.tiles[a].nb) {
        const t = eng.tiles[b];
        if (t.obst || b === h.tile || home.nb.includes(b)) continue;
        const d = (t.x - mid.x) * (t.x - mid.x) + (t.y - mid.y) * (t.y - mid.y);
        if (d < bd) { bd = d; best = t; }
      }
      tut.moveTo = best; tut.moveFrom = h.tile;
    }
    return tut.moveTo;
  }
  if (tut.step === 1) return near(() => true);
  if (tut.step === 2) return near((o) => o.kind === 'barracks');
  return null;
}

function updateTutorial(eng, dt) {
  const tut = App.tut;
  if (!tut || eng.phase !== PHASE_PLAY) return;
  tut.t += dt;
  const B = eng.team[App.localTeam];
  const totalBuilt = B.built.mine + B.built.tower + B.built.barracks + B.built.mystery;
  const R = App.renderer;
  R.guide = guideTarget(eng, tut);
  switch (tut.step) {
    case 0: R.hint = T('tip_move'); if (tut.moved >= 3 || totalBuilt >= 1) { tut.step = 1; tut.t = 0; } break;
    case 1: R.hint = T('tip_build'); if (totalBuilt >= 1) { tut.step = 2; tut.t = 0; } break;
    case 2: R.hint = T('tip_barracks'); if (B.built.barracks >= 1 || tut.t > 18) { tut.step = 3; tut.t = 0; } break;
    case 3: R.hint = T('tip_win'); if (tut.t > 6) { R.hint = null; R.guide = null; App.save.tutorialDone = true; persist(); App.tut = null; } break;
  }
}

// ---------------- input ----------------
const Input = { down: false, lastTile: -1, keys: new Set() };
const Pred = new Predictor();

function canSteer() {
  return App.state === 'match' && App.eng && App.eng.phase === PHASE_PLAY && (!App.paused || App.mode === 'online');
}

function pointerTile(ev) {
  const rect = App.renderer.cv.getBoundingClientRect();
  const w = App.renderer.screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
  const h = worldToHex(w.x, w.y);
  if (!inMap(h.c, h.r)) return null;
  return App.eng.tiles[idx(h.c, h.r)];
}

function onPointerDown(ev) {
  ev.preventDefault();
  Sound.unlock();
  if (!canSteer()) return;
  Input.down = true;
  try { App.renderer.cv.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  steerTo(ev, true);
}
function onPointerMove(ev) {
  if (!Input.down) return;
  ev.preventDefault();
  steerTo(ev, false);
}
function onPointerUp() { Input.down = false; Input.lastTile = -1; }

function steerTo(ev, first) {
  const t = pointerTile(ev);
  if (!t || t.obst) return;
  if (!first && t.i === Input.lastTile) return;
  Input.lastTile = t.i;
  App.collector.gotoTile(t.i);
  Pred.aimAt(t.x, t.y);
  App.renderer.markTile(t.i);
  if (first) Sound.play('tap', 0.6);
}

const KEYMAP = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
function updateKbd() {
  if (!App.collector) return;
  let x = 0, y = 0;
  for (const k of Input.keys) { const v = KEYMAP[k]; if (v) { x += v[0]; y += v[1]; } }
  // the red side sees the map flipped top to bottom: "up" on screen is +y in the world
  if (App.localTeam === TEAM_RED) y = -y;
  App.collector.setKeys(x, y);
  Pred.keys(App.collector.kx, App.collector.ky);
}
function onKeyDown(ev) {
  if (ev.target && ev.target.tagName === 'INPUT') {
    if (ev.code === 'Enter' || ev.code === 'NumpadEnter') { ev.preventDefault(); $('joinBtn').click(); }
    return;
  }
  if (KEYMAP[ev.code]) {
    ev.preventDefault();
    Sound.unlock();
    if (canSteer()) { Input.keys.add(ev.code); updateKbd(); }
  } else if ((ev.code === 'Enter' || ev.code === 'Space') && App.state !== 'match') {
    ev.preventDefault();
    if (App.state === 'menu') startMatch();
    else if (App.state === 'howto') $('howtoOk').click();
    else if (App.state === 'result') $('againBtn').click();
  }
}
function onKeyUp(ev) { if (KEYMAP[ev.code]) { Input.keys.delete(ev.code); updateKbd(); } }

// ---------------- online (lockstep through server/relay.js) ----------------
const Online = {
  client: null,
  url: null,
  phase: 'off',     // off | lobby | waiting | match | over
  pending: null,    // message to send once connected (create / join)
  code: '', seat: 0, token: '',
  net: null,
  peerOnline: true,
  desync: false,
  leaveArm: 0,

  available() { return !!this.url; },
  ensureClient() {
    if (this.client) return this.client;
    this.client = new NetClient(this.url, {
      onOpen: () => this.onOpen(),
      onMessage: (m) => this.onMessage(m),
      onState: () => this.lobbyText(),
    });
    return this.client;
  },
  stop() {
    if (this.client) { if (this.phase === 'waiting') this.client.send({ t: 'leave' }); this.client.close(); }
    this.client = null;
    this.phase = 'off';
    this.pending = null;
    this.forget();
  },
  remember() { try { sessionStorage.setItem(ROOM_KEY, JSON.stringify({ code: this.code, seat: this.seat, token: this.token })); } catch (e) { /* private mode */ } },
  forget() { try { sessionStorage.removeItem(ROOM_KEY); } catch (e) { /* private mode */ } },
  saved() { try { return JSON.parse(sessionStorage.getItem(ROOM_KEY) || 'null'); } catch (e) { return null; } },

  // --- lobby ---
  open() {
    Sound.unlock(); Sound.play('tap');
    App.state = 'online';
    this.phase = 'lobby';
    this.lobbyMsg = '';
    show('online');
    this.lobbyText();
  },
  create() {
    Sound.play('tap');
    this.pending = { t: 'create' };
    this.lobbyMsg = '';
    const c = this.ensureClient();
    if (c.state === 'open') this.flushPending(); else c.connect();
    this.lobbyText();
  },
  join() {
    const code = $('codeIn').value.trim().toUpperCase();
    if (code.length !== 4) { $('codeIn').focus(); Sound.play('error'); return; }
    Sound.play('tap');
    this.pending = { t: 'join', code };
    this.lobbyMsg = '';
    const c = this.ensureClient();
    if (c.state === 'open') this.flushPending(); else c.connect();
    this.lobbyText();
  },
  cancel() {
    Sound.play('tap');
    this.stop();
    toMenu();
  },
  flushPending() { if (this.pending && this.client.send(this.pending)) this.pending = null; },
  lobbyText() {
    if (App.state !== 'online') return;
    const st = this.client ? this.client.state : 'idle';
    const waiting = this.phase === 'waiting';
    $('roomCode').textContent = waiting ? this.code : '';
    $('roomCode').classList.toggle('hidden', !waiting);
    $('onlineForm').classList.toggle('hidden', waiting);
    let msg = this.lobbyMsg || '';
    if (!msg) {
      if (waiting) msg = T('shareCode') + '\n' + T('waitingRival');
      else if (this.pending && (st === 'connecting' || st === 'retry')) msg = st === 'retry' ? T('noServer') : T('connecting');
    }
    $('onlineMsg').textContent = msg;
  },

  // --- link ---
  onOpen() {
    const s = this.phase === 'match' || this.phase === 'over' ? { code: this.code, seat: this.seat, token: this.token } : null;
    if (s) this.client.send({ t: 'resume', code: s.code, seat: s.seat, token: s.token, have: this.net ? this.net.confirmedTo : -1 });
    else this.flushPending();
  },
  onMessage(m) {
    switch (m.t) {
      case 'room':
        this.code = m.code; this.seat = m.seat; this.token = m.token;
        this.phase = 'waiting';
        this.lobbyText();
        break;
      case 'match_start':
        this.begin(m.seed, m.seat, m.startFrame);
        break;
      case 'frame_batch':
        if (this.net) this.net.onBatch(m);
        break;
      case 'conn_resync':
        // same match, after a reconnect; or a page reload, where we rebuild it from the seed
        if (!this.net || !App.eng || App.eng.config.seed !== (m.seed >>> 0) || App.mode !== 'online') {
          this.code = m.code; this.seat = m.seat;
          this.begin(m.seed, m.seat, m.startFrame);
        }
        this.net.onResync(m);
        App.collector.sent = makeCmd(this.seat, -1, 9, 9);   // re-send held keys: they may have been lost
        break;
      case 'peer_status':
        if (m.seat !== this.seat) this.peerOnline = !!m.online;
        break;
      case 'desync':
        this.desync = true;
        App.renderer.banner(T('desync'), { size: 34, life: 2.5, color: '#fca5a5', y: 0.3 });
        break;
      case 'match_over':
        this.phase = 'over';
        if (!m.agree) this.desync = true;
        break;
      case 'room_closed':
        if (this.phase === 'match') { this.lobbyMsg = T('roomClosed'); }
        this.forget();
        if (this.client) this.client.close();
        this.client = null;
        if (this.phase === 'waiting' || this.phase === 'lobby') { this.phase = 'lobby'; this.lobbyText(); }
        else if (App.state === 'match' && App.eng && App.eng.phase !== PHASE_END) { this.phase = 'off'; toMenu(); }
        else this.phase = 'off';
        break;
      case 'error':
        if (m.code === 'no_room') { this.lobbyMsg = T('noRoom'); this.pending = null; Sound.play('error'); this.lobbyText(); }
        else if (m.code === 'no_resume') {
          this.forget();
          if (this.client) this.client.close();
          this.client = null;
          const inMatch = App.state === 'match' && App.mode === 'online';
          this.phase = 'off';
          if (inMatch || App.state === 'online') toMenu();
        }
        break;
    }
  },

  // --- match ---
  begin(seed, seat, startFrame) {
    this.phase = 'match';
    this.seat = seat;
    this.peerOnline = true;
    this.desync = false;
    this.leaveArm = 0;
    this.remember();
    App.mode = 'online';
    App.tut = null;
    this.net = new NetInput({ seat, startFrame: startFrame | 0 });
    setupEngine({ seed, aiBlue: false, aiRed: false }, seat, this.net);
    show(null);
    App.state = 'match';
    App.renderer.banner(seat === TEAM_BLUE ? T('sideBlue') : T('sideRed'),
      { size: 40, life: 2.2, color: seat === TEAM_BLUE ? '#93c5fd' : '#fca5a5', y: 0.62 });
    Sound.music('battle');
    bridgeMessage('level_started');
    Platform.gameplayStart();
  },
  sendInput() {
    const c = App.collector.drain();
    if (c && this.client && this.client.send({ t: 'cmd', c: [c.goto, c.kx, c.ky, c.ff] })) this.net.noteSent();
  },
  sendHash(eng) { if (this.client) this.client.send({ t: 'hash', tick: eng.tick, h: eng.hash() }); },
  matchOver(eng, e) {
    if (this.client) this.client.send({ t: 'over', tick: eng.tick, winner: e.winner, h: eng.hash() });
    this.phase = 'over';
    this.forget();
    $('leaveBtn').classList.add('hidden');
  },
  leave() {
    if (!(App.state === 'match' && App.mode === 'online')) return;
    const now = performance.now();
    if (now - this.leaveArm > 2500) {
      this.leaveArm = now;
      App.renderer.banner(T('leaveConfirm'), { size: 26, life: 2.4, color: '#fde047', y: 0.3 });
      Sound.play('tap');
      return;
    }
    this.leaveArm = 0;
    App.collector.forfeit();
  },
  statusLine() {
    if (this.desync) return { text: T('desync'), color: '#fca5a5' };
    if (!this.client || this.client.state !== 'open') return { text: T('reconnecting'), color: '#fde047' };
    if (!this.peerOnline) return { text: T('rivalOffline'), color: '#fdba74' };
    const back = this.net.backlog(App.eng.tick);
    if (back > 30) return { text: T('syncing'), color: '#fde047' };
    return { text: Math.round(this.client.rtt) + ' ms', color: 'rgba(203,213,225,0.8)' };
  },
};

// ---------------- dev switches (local hosts only) ----------------
// ?autoplay  the blue side plays itself (no tutorial)    ?speed=4  the simulation runs 4x
// ?seed=123  every match uses this map/AI seed
const DEV = (() => {
  const d = { autoplay: false, speed: 1, seed: null };
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return d;
  const q = new URLSearchParams(location.search);
  d.autoplay = q.has('autoplay');
  const sp = parseFloat(q.get('speed'));
  if (sp > 0) d.speed = Math.min(16, sp);
  const sd = parseInt(q.get('seed'), 10);
  if (Number.isFinite(sd)) d.seed = sd;
  return d;
})();

// ---------------- boot ----------------
function boot() {
  setLang(String(Platform.language()).slice(0, 2).toLowerCase());
  document.documentElement.lang = LANG;
  Platform.onMute((m) => { App.platformAudio = !m; Sound.applyMute(); });
  Platform.onPause((p) => setPaused(p || document.hidden));
  Platform.onHide(() => { if (App.state === 'match') Platform.gameplayStop(); });
  document.addEventListener('visibilitychange', () => setPaused(document.hidden || App.adPause));
  loadSave();
  Sound.installUnlock();

  App.renderer = new Renderer($('game'));
  App.renderer.resize();
  window.addEventListener('resize', () => App.renderer.resize());
  applyTexts();
  updateMuteIcon();

  const cv = $('game');
  cv.addEventListener('pointerdown', onPointerDown);
  cv.addEventListener('pointermove', onPointerMove);
  cv.addEventListener('pointerup', onPointerUp);
  cv.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('selectstart', (e) => { if (!(e.target && e.target.tagName === 'INPUT')) e.preventDefault(); });
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { Input.keys.clear(); updateKbd(); });

  $('playBtn').addEventListener('click', startMatch);
  $('howBtn').addEventListener('click', () => { Sound.unlock(); Sound.play('tap'); openHowTo('menu'); });
  $('howtoOk').addEventListener('click', () => {
    Sound.play('tap');
    if (App.howtoThen === 'match') beginMatch(); else toMenu();
  });
  const again = () => (App.mode === 'online' ? () => { toMenu(); Online.open(); } : beginMatch);
  $('againBtn').addEventListener('click', () => { if (App.adBusy) return; Sound.unlock(); Sound.play('tap'); afterAd(again()); });
  $('menuBtn').addEventListener('click', () => { if (App.adBusy) return; Sound.unlock(); Sound.play('tap'); afterAd(toMenu); });
  $('muteBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    Sound.unlock();
    App.save.muted = !App.save.muted;
    updateMuteIcon();
    Sound.applyMute();
    persist();
  });

  Online.url = relayUrl();
  $('onlineBtn').classList.toggle('hidden', !Online.available());
  $('onlineBtn').addEventListener('click', () => Online.open());
  $('createBtn').addEventListener('click', () => Online.create());
  $('joinBtn').addEventListener('click', () => Online.join());
  $('onlineBack').addEventListener('click', () => Online.cancel());
  $('leaveBtn').addEventListener('click', (e) => { e.stopPropagation(); Online.leave(); });
  $('codeIn').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });

  toMenu();
  // a reload in the middle of an online match resumes it
  const s = Online.available() && Online.saved();
  if (s && s.code && s.token) {
    Object.assign(Online, { code: s.code, seat: s.seat, token: s.token, phase: 'match' });
    Online.ensureClient().connect();
  }
  $('loading').classList.add('hidden');
  requestAnimationFrame(frame);

  // console helpers: Hexfront.replay() returns the last match as a replay (JSON-safe)
  window.Hexfront = { App, Online, replay: () => App.lastReplay, runReplay };
}

window.addEventListener('DOMContentLoaded', () => { Platform.init([SAVE_KEY]).then(boot, boot); });
