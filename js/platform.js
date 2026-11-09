'use strict';
// Playgama Bridge wrapper (ported from Holy Kicker's platform/playgama). Nothing in the game can be
// broken by the SDK: every call is a no-op without it (local dev, adblock), every throw or rejection
// is swallowed, initialize() is bounded, saves are batched through one cache, and every ad is bounded
// by a watchdog so the game is never left paused or muted by an ad that never reports its end.

const Platform = (() => {
  const BRIDGE_WAIT_MS = 5000;
  const AD_START_MS = 15000;      // an ad not on screen by then is given up as unfilled
  const AD_PLAY_MS = 300000;      // an ad on screen that never reports its end is given up after this
  const AD_GAP_MS = 150000;       // at most one interstitial per this much play (not menu/result time)

  let sdk = null;
  let ready = false;
  const cache = new Map();
  let pending = new Map();
  let queued = false;
  let playing = false;
  let sincePlay = 0;
  let inFlight = null;            // { listen, giveUp }
  let strayUntil = 0;             // a given-up ad may still be playing: open none over it
  let subscribed = false;
  const hideHooks = [];

  async function settle(fn) { try { return await fn(); } catch (e) { return undefined; } }
  function guard(fn) { try { fn(); } catch (e) { /* the game's problem, never the SDK's */ } }
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

  // ---- lifecycle ----
  async function init(keys) {
    const b = window.bridge;
    if (b && typeof b.initialize === 'function') {
      const done = settle(async () => { await b.initialize(); return true; });
      ready = (await Promise.race([done, wait(BRIDGE_WAIT_MS).then(() => false)])) === true;
      if (ready) sdk = b;
    }
    // every key the game uses is read in one call; reads then come from the cache
    if (ready) {
      const got = await settle(() => sdk.storage.get(keys, false));
      if (Array.isArray(got)) keys.forEach((k, i) => {
        const v = got[i];
        if (typeof v === 'string') cache.set(k, v);
        else if (v !== null && v !== undefined) cache.set(k, JSON.stringify(v));
      });
    } else {
      for (const k of keys) { const v = lsGet(k); if (v !== null) cache.set(k, v); }
    }
    // what is pending goes out now when the page may be on its way out (no next tick guaranteed)
    const hide = () => { for (const cb of hideHooks) guard(cb); flush(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
    window.addEventListener('pagehide', hide);
    onPause((p) => { if (p) hide(); });
    console.info('[hexfront] Bridge: ' + (ready ? (platformId() || '?') : 'unavailable') + ', save: ' + (ready ? 'bridge' : 'localStorage'));
    return ready;
  }

  function platformId() { const id = sdk && sdk.platform && sdk.platform.id; return typeof id === 'string' && id ? id : null; }
  function language() {
    const v = sdk && sdk.platform && sdk.platform.language;
    return typeof v === 'string' && v ? v : (navigator.language || 'en');
  }
  function send(msg) { if (sdk) settle(() => sdk.platform.sendMessage(msg)); }

  // gameplay brackets, deduplicated: reach the host only when the state really changes
  function gameplayStart() { if (playing) return; playing = true; send('gameplay_started'); }
  function gameplayStop() { if (!playing) return; playing = false; send('gameplay_stopped'); }

  function onPause(cb) {
    if (!sdk) return;
    settle(() => sdk.platform.on('pause_state_changed', (p) => guard(() => cb(p === true))));
  }
  /** called now with whether the platform wants sound off, then on every change */
  function onMute(cb) {
    if (!sdk) return;
    guard(() => cb(sdk.platform.isAudioEnabled === false));
    settle(() => sdk.platform.on('audio_state_changed', (on) => guard(() => cb(on === false))));
  }
  function onHide(cb) { hideHooks.push(cb); }

  // ---- storage: synchronous cache, writes batched to one Bridge call on the next tick ----
  function getItem(k) { return cache.has(k) ? cache.get(k) : null; }
  function setItem(k, v) {
    cache.set(k, v);
    pending.set(k, v);
    if (queued) return;
    queued = true;
    setTimeout(flush, 0);
  }
  function flush() {
    queued = false;
    if (pending.size === 0) return;
    const batch = pending;
    pending = new Map();
    if (sdk) settle(() => sdk.storage.set([...batch.keys()], [...batch.values()]));
    else for (const [k, v] of batch) lsSet(k, v);
  }

  // ---- ads ----
  function played(ms) { if (ms > 0) sincePlay += ms; }
  function interstitialDue() { return sincePlay >= AD_GAP_MS; }

  /** One paced interstitial. `started` runs when it is on screen (mute there); resolves when it is over. */
  function interstitial(started) {
    const ad = sdk && sdk.advertisement;
    if (!ad || ad.isInterstitialSupported !== true || typeof ad.on !== 'function') return Promise.resolve(false);
    if (sincePlay < AD_GAP_MS) return Promise.resolve(false);
    if (inFlight) inFlight.giveUp();
    if (performance.now() < strayUntil) return Promise.resolve(false);
    return new Promise((resolve) => {
      let over = false, handle = 0, shown = false;
      const finish = () => {
        if (over) return;
        over = true;
        clearTimeout(handle);
        if (inFlight && inFlight.listen === listen) inFlight = null;
        resolve(shown);
      };
      const giveUp = () => { strayUntil = performance.now() + AD_PLAY_MS; finish(); };
      const listen = (state) => {
        if (state === 'opened') {
          shown = true;
          sincePlay = 0;
          clearTimeout(handle);
          handle = setTimeout(giveUp, AD_PLAY_MS);
          guard(() => started && started());
        } else if (state === 'closed' || state === 'failed') finish();
      };
      handle = setTimeout(giveUp, AD_START_MS);
      inFlight = { listen, giveUp };
      if (!subscribed) {
        subscribed = true;
        settle(() => ad.on('interstitial_state_changed', (s) => {
          // a given-up ad's late states go nowhere; its end lets the next one open
          if (performance.now() < strayUntil) { if (s === 'closed' || s === 'failed') strayUntil = 0; return; }
          if (inFlight) inFlight.listen(s);
        }));
      }
      try { ad.showInterstitial('match_end'); } catch (e) { listen('failed'); }
    });
  }

  return {
    init, isReady: () => ready, platformId, language, send, gameplayStart, gameplayStop,
    onPause, onMute, onHide, getItem, setItem, flush, played, interstitialDue, interstitial,
  };
})();
