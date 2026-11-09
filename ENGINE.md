# Hexfront Rush — engine and netcode

The match is a deterministic frame-sync simulation. Its state is a pure function of `(config, command stream)`. Everything else is a client of that rule:
- **Single player** feeds the sim local commands.
- **Online** feeds it relay-confirmed commands.
- **Replays** feed it a stored log.
- **Tests** feed it scripted commands.

The design follows Holy Kicker (`D:\standing`) and its daydayup lineage, cut down to what a 2-player real-time game needs.

```
 input (pointer / keys)          relay (server/relay.js)               every client
 ─────────────────────           ───────────────────────               ────────────
 InputCollector ──cmd──▶ ws ──▶  FrameBroadcast: stamp onto frame ─▶  NetInput.take(tick)
   (only on change)              batch 3 frames / 100 ms               └▶ Engine.step(cmds)  30 Hz
                                 hash checkpoints, resume, forfeit         └▶ events ─▶ Renderer / Sound
                                                                       Predictor (render only) ─▶ own hero
```

## Layers

| Folder | Runs where | May use |
|---|---|---|
| `js/sim/` | browser, Node tests, (could run on a server) | integers only; no DOM, clock or `Math.random` |
| `js/net/` | browser; `frameBroadcast.js` also in the relay | timers and sockets, but never writes sim state |
| `js/render.js`, `js/main.js`, `js/audio.js`, `js/platform.js` | browser | anything; they only read the sim |

## Simulation — `js/sim/`
- **`fixed.js`:** fixed point with `FP = 1000`. Provides `muldiv`, `isqrt`, `dist`, `clampI`, and load-time helpers `ticks(seconds)` / `perTick(unitsPerSecond)`.
- **`prng.js`:** an LCG step whitened by a murmur3 finaliser, with a single uint32 of state. Each concern gets its own stream (`streamSeed(seed, tag)`): map, offers, loot, units, chests, each AI, quests. Adding a random draw in one system therefore never shifts another.
- **`rules.js`:** all design numbers, converted to integer ticks / FP once at load. The hex grid is pointy-top, odd rows offset, `hexX = 866·(2c+(r&1)+1)`, `hexY = 1500r+1000`. Also holds `ENGINE_VERSION`.
- **`engine.js`:** `new Engine({seed, aiBlue, aiRed})`, then `step(cmds)` advances exactly one tick (1/30 s). Within a tick:
  - Commands are applied ordered by owner.
  - Every collection is an array walked in index order.
  - Entities carry integer ids.
  - Positions keep `px/py` (last tick) for render interpolation.
  - `events` holds this tick's notifications (sounds, effects, result) and is cleared at the start of each `step`.
- **`hash.js`:** FNV-1a over a canonical walk of the state, returned as a uint32. It throws on any non-integer number, so a float leaking into the state fails loudly in tests.
- **`input.js`:** command = `{tick, owner, goto, kx, ky, ff}`, packed as `[tick, owner, goto, kx, ky, ff]`.
  - **`InputCollector(owner)`** turns pointer and keys into commands. Held keys are sent only when they change, which keeps traffic tiny.
  - **`LocalInput`** is the offline source; it also logs.
- **`replay.js`:** `makeReplay(config, log, engine)` stores the log, the final hash and a checkpoint hash every 30 ticks. `runReplay(rep)` re-simulates and reports the first checkpoint that differs.
- **Snapshots:** `engine.snapshot()` / `Engine.restore(s)` round-trip the full state through plain JSON, with identical hashes.

### Guards
- **`node tools/lint-sim.js`:** a determinism lint for `js/sim`. It bans the following:
  - `Math.random`, clocks and timers;
  - transcendental `Math`, `Math.sqrt` (use `isqrt`) and `**`;
  - `for…in`, `Object.keys/values/entries`, and `sort()` without a comparator;
  - DOM globals, float division by `FP`, and `toFixed` / `parseFloat`.

  Opt-outs must be listed in the lint itself, with a reason.
- **`node tools/test.js`** covers:
  - golden hashes (`tools/golden.json`) for fixed seeds at fixed ticks;
  - same-seed reproducibility;
  - snapshot/restore mid-match;
  - replay round-trip and tamper detection;
  - junk-command clamping;
  - an in-process loopback of two clients and a relay with jittered latency, including a 12 s disconnect + resume.

  Regenerate goldens only on a deliberate rules change (and bump `ENGINE_VERSION`).

## Lockstep netcode — `js/net/`, `server/relay.js`
- **Relay clock (`frameBroadcast.js`):**
  - Every 100 ms the relay closes 3 frames, so frame == tick at 30 Hz.
  - A command arriving now is stamped onto the next open frame, never a past one. A batch once sent is final.
  - The relay never runs the sim.
- **`NetInput`:**
  - Receives `frame_batch` messages and sets `confirmedTo`.
  - `take(tick)` returns that frame's commands, or `null` if it is not confirmed yet, in which case the loop simply waits.
  - The play head trails `confirmedTo` by 3 frames, which absorbs the batch rhythm and jitter.
  - It measures input → applied delay with an EMA, for the predictor.
- **Pacing (`catchUpRate`):** the loop runs at 1.25×–5× when behind and 0.85× when eating into the buffer. Beyond 150 ticks of backlog it fast-forwards silently instead of fast-playing for seconds.
- **Checkpoints:**
  - Each client sends `hash{tick, h}` every 30 ticks. With two players there is no majority, so any mismatch is broadcast as `desync` and shown on the status line.
  - At the end, both clients send `over{tick, winner, h}`, and the relay logs whether they agree.
- **Rooms:**
  - `create` → `room{code, seat, token}`.
  - `join{code}` → `match_start{seed, startFrame}` to both. The seed comes from the relay.
  - A seat token in `sessionStorage` allows `resume{code, seat, token, have}` after a dropped link or a page reload. The relay answers `conn_resync` with the frame log since the start, and the client rebuilds the match from the seed.
  - A seat offline for 30 s forfeits.
- **Prediction (`predictor.js`), render only:**
  - The own hero is drawn at the interpolated confirmed position plus the dead-reckoned movement of the last `delayMs`. Dead reckoning covers held keys with obstacle sliding, or a straight line to the tapped tile.
  - Entries older than the delay have reached the sim, so they drop out.
  - Errors ease out over about 60 ms and snap beyond 2.5 tiles.
  - The sim never sees any of this, so prediction cannot cause a desync.
- **Client (`netClient.js`):**
  - A WebSocket with auto-reconnect: back-off 400 ms × 1.6ⁿ, capped at 4 s.
  - Ping every 2 s.
  - `relayUrl()` returns `?server=…`, or the page's own host on localhost or a LAN.

### Message reference
| Direction | Messages |
|---|---|
| client → relay | `create`, `join{code}`, `resume{code,seat,token,have}`, `leave`, `cmd{c:[goto,kx,ky,ff]}`, `hash{tick,h}`, `over{tick,winner,h}`, `ping{ts}` |
| relay → client | `room{code,seat,token,v}`, `match_start{seed,startFrame,seat,code}`, `frame_batch{to,frames}`, `conn_resync{seed,seat,code,startFrame,curFrame,log}`, `peer_status{seat,online}`, `desync{tick}`, `match_over{winner,agree}`, `room_closed{why}`, `error{code}`, `pong{ts}` |

## Running
Run from this folder:
```
npm install              # ws, for the relay
node server/relay.js     # http://localhost:8787 serves the game and the relay; open two tabs
node tools/test.js
node tools/lint-sim.js
```
Hosting online play for real means running `server/relay.js` behind TLS and opening the game with `?server=wss://your-host`. The Playgama build can only point at a relay that is hosted that way.
