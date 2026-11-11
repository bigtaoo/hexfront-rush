# Hexfront Rush — engine and netcode

The match is a deterministic frame-sync simulation. Its state is a pure function of `(config, command stream)`. Everything else is a client of that rule:
- **Single player** feeds the sim local commands.
- **Online** feeds it relay-confirmed commands.
- **Replays** feed it a stored log.
- **Tests** feed it scripted commands.

The design follows Holy Kicker (`D:\standing`) and its daydayup lineage, cut down to what a 2-player real-time game needs.

```
 input (pointer / keys)          relay (server/relay.ts)               every client
 ─────────────────────           ───────────────────────               ────────────
 InputCollector ──cmd──▶ ws ──▶  FrameBroadcast: stamp onto frame ─▶  NetInput.take(tick)
   (only on change)              batch 3 frames / 100 ms               └▶ Engine.step(cmds)  30 Hz
                                 hash checkpoints, resume, forfeit         └▶ events ─▶ Renderer / Sound
```

## Layers

| Folder | Runs where | May use |
|---|---|---|
| `src/sim/` | browser, Node tests, (could run on a server) | integers only; no DOM, clock or `Math.random` |
| `src/net/` | browser; `frameBroadcast.ts` also in the relay | timers and sockets, but never writes sim state |
| `src/view/`, `src/app/`, `src/platform/` | browser | anything; they only read the sim |

Everything is TypeScript under `strict`. The relay (`server/relay.ts`) runs on Node's own type stripping and imports the same `src/net/frameBroadcast.ts` the client tests use, so there is no second copy of the frame clock.

## Simulation — `src/sim/`
- **`fixed.ts`:** fixed point with `FP = 1000`. Provides `muldiv`, `isqrt`, `dist`, `dist2`, and load-time helpers `toFp(units)` / `ticks(seconds)` / `perTick(unitsPerSecond)`.
- **`prng.ts`:** an LCG step whitened by a murmur3 finaliser, with a single uint32 of state. Each concern gets its own stream (`streamSeed(seed, tag)`): map, offers, loot, units, each AI, quests, each castle guard, the card layout. Adding a random draw in one system therefore never shifts another.
- **`hex.ts`:** the board's geometry and size (13x25). Pointy-top, odd rows offset: `hexX = 866·(2c+(r&1)+1)`, `hexY = 1500r+1000`, neighbours in a fixed order, `hexDist` over cube coordinates, and `worldToHex(x, y)` (the nearest centre, in integers). `hexDist` is the walking distance too: the board is wide enough that nothing is ever forced round a corner, so a distance in a design table is that many steps.
- **`rules.ts`:** all design numbers, converted to integer ticks / FP once at load. Also holds `ENGINE_VERSION`.
- **`setup.ts`:** a match's setup: the seed, which sides the AI plays, and per side the AI's skill and style plus the handicaps a campaign stage gives (starting gold, castle %, income %, a starting barracks and towers), and the siege time. `makeConfig(input)` fills in the standard values. The setup is part of the hashed state and of every replay. Income % pays exactly: each team keeps the hundredths left over (`TeamState.incomeCarry`) for its next payout (engine v12).
- **`engine.ts`:** `new Engine({seed, aiBlue, aiRed, blue?, red?, siege?})` (a `ConfigInput`, filled in by `makeConfig`), then `step(cmds)` advances exactly one tick (1/30 s). Within a tick:
  - Commands are applied ordered by owner.
  - Every collection is an array walked in index order.
  - Entities carry integer ids. Kinds: `guard` (falls and comes back: `dead`), `unit` and `bld` (removed: `alive`); `isDown(e)` covers both.
  - Where each castle guard may wander, and how much it likes each spot (`guardSpots`, guard.ts), is static (built once from the map), so it is not part of the state.
  - The card layout (`cardLayout.ts`: which card each tile shows each team, and the rarity a barracks card builds there) is static too: laid out from its own stream (tag 11) when the engine is made and mirrored for red, so it is not hashed or snapshotted. Only a rubble tile draws a fresh filler card from the offers stream. The map events are laid out with it (drawn after the cards); each tile's waiting event (`Tile.event`) is copied in when the engine is made, and as it is cleared when claimed, it is dynamic state: snapshotted and hashed with the tiles.
  - Positions keep `px/py` (last tick) for render interpolation.
  - `events` holds this tick's notifications (sounds, effects, result) and is cleared at the start of each `step`.
- **`map.ts`:** `generateMap(seed)` picks a theme and lays out the 13x25 board: it builds the top half from templates (back-yard groves, two wall segments leaving three lanes, a centre island, scattered groves) and mirrors it onto the bottom, so every rock in front of one castle has a twin in front of the other. It then checks the map is playable — the castles connected, no open tile sealed off, both home zones clear, obstacles between 7% and 20% — and rolls again if not (up to 40 times; over 20,000 seeds the worst case took 6). The map is never hashed or snapshotted: a replay rebuilds it from the seed.
- **`path.ts`:** the two breadth-first searches over the hex grid — `distanceField(tiles, start)` (walking distance from one tile to every other, `FAR` where there is no way round) and `bfsPath(tiles, from, to)`. Both see only the obstacles: buildings and troops never block a path, so an army is not re-routed every time a mine goes up. The engine takes one distance field per castle at the start and reads it for the rest of the match.
- **`hash.ts`:** FNV-1a over a canonical walk of the state, returned as a uint32: object keys sorted, lists and typed arrays in order. It throws on any non-integer number (`NaN` and `Infinity` included) with the path to it, so a float leaking into the state fails loudly in tests.
- **`input.ts`:** command = `{tick, owner, flip, ff}`: `flip` is the tile of an own card to build (or -1), `ff` a forfeit. Packed as `[tick, owner, flip, 0, 0, ff]`; the two zeros are reserved, so the relay's 4-int `cmd` stays the same shape.
  - **`InputCollector(owner)`** queues card taps (at most 4 pending, no duplicates) and hands out one per tick. Nothing is sent while the player only looks around.
  - `applyCommand` validates everything: a flip on a tile that is not the owner's offer, outside the play phase or without the gold does nothing.
  - **`LocalInput`** is the offline source; it also logs.
- **`replay.ts`:** `makeReplay(config, log, engine)` stores the log, the final hash and the checkpoint hashes the match recorded (`recordChecks` after each step: every 300 ticks, 10 s). `runReplay(rep)` re-simulates and reports the first checkpoint that differs; `checkReplay(rep)` is that as a yes/no (no for another `ENGINE_VERSION`). More in **Replays** below.
- **Snapshots:** `engine.snapshot()` / `Engine.restore(s)` round-trip the full state through plain JSON, with identical hashes.

### Guards
All of these run in `npm test` (vitest):
- **`determinismLint.test.ts`:** scans every non-test file under `src/sim` (comments and strings blanked first). It bans:
  - `Math.random`, clocks and timers, and browser globals (`window`, `document`, `navigator`, `localStorage`);
  - transcendental `Math`, `Math.sqrt` (use `isqrt`) and `**`;
  - `for…in`, `Object.keys/values/entries`, and `sort()` without a comparator;
  - float division by `FP`, the render-only `fromFp`, and `toFixed` / `parseFloat`.

  Opt-outs go in the test's allowlist, each with a reason; an entry that stops matching fails the test.
- **`golden.test.ts`** covers:
  - golden hashes (`src/sim/golden.json`) for fixed seeds over whole matches;
  - same-seed reproducibility;
  - snapshot/restore mid-match;
  - replay round-trip and tamper detection;
  - junk-command clamping.

  Regenerate goldens only on a deliberate rules change (and bump `ENGINE_VERSION`): `UPDATE_GOLDEN=1 npx vitest run src/sim/golden.test.ts` prints the new values.
- **`map.test.ts`** sweeps 400 seeds and holds `generateMap` to every one of those promises — the mirror, connectivity, clear home zones, the density band, theme-own obstacles, same seed same map — so a new template cannot quietly make one side's half harder.
- **`path.test.ts`** pins the flow field and the detour on real maps: shortest walks, `FAR` for anything walled in, blue's walk to a tile equal to red's walk to its mirror, and that buildings and rubble never re-route a path.
- **The floor under the sim** has its own tests, since everything else is built on it and a crack there is silent: **`fixed.test.ts`** (`isqrt` exactly floor(sqrt) up to 2^53, `muldiv` truncating toward zero and treating the two directions alike, the load-time conversions whole), **`hex.test.ts`** (neighbours mutual, the top-to-bottom mirror exact in world coordinates, `hexDist` equal to the walking distance for all 105,625 pairs, `worldToHex` the nearest centre anywhere on or off the board), **`prng.test.ts`** (same seed same sequence, the state one uint32, `peek`/`resume` round-trip, an empty range drawing nothing, independent streams), **`hash.test.ts`** (the guard's own guard: key order ignored, every change noticed, a float thrown with its path), and **`rules.test.ts`** (every number in the tables whole — run through `hashState` itself — the `OF_`/`EV_` index constants still pointing at the cards and events they name, weights adding up, and the siege clock stepping up and never back down).
- **The view's own arithmetic** is tested the same way, since nothing else can see a mistake in it: **`camera.test.ts`** (a play area left between the HUD rails on every screen down to a portal's thumbnail, the rails at full height on anything a player holds, screen-to-world and back agreeing, red's flip its own inverse, the clamp keeping the map on screen and centring the axis that fits, a 1:1 drag, and the menu backdrop filling the opening frame) and **`quality.test.ts`** (the level a device starts on, the densities and frame rates each level is worth, `FrameGate` locking to a 30-165 Hz display and through iOS's late-then-early stamps, and `FrameGovernor` stepping down only after a run of slow windows, never past its floor, climbing back after a stable stretch with a doubled wait after a failed try, and holding a 30 Hz Low Power screen rather than demoting it).
- **`src/net/loopback.test.ts`:** an in-process loopback of two clients and the relay's frame clock with jittered latency, on a virtual clock, including a 12 s disconnect + resume; the relay's log replayed offline must land on the same state.
- **`ai.test.ts`** pins the built-in opponent, which is a hand-tuned table that no type checks: a style row holds exactly one weight per kind of card (a new kind without one would be valued at `NaN` and never bought), the skill levels run monotonically from the beginner to the standard one, and a map event's worth is ordered by what it gives. Then it plays it: a mine goes to its own back yard and a barracks to the front, an empty purse builds nothing however the board looks, each decision waits out its own thinking time, and over three minutes on three seeds the standard level really does outgrow the beginner.
- **`src/app/gesture.test.ts`** covers the arithmetic behind the canvas gestures, which `controls.ts` keeps out of the browser so it can be tested in node: a wheel delta converted from whichever unit the browser counted it in (`deltaMode` lines and screenfuls, capped at one screen), a pinch acting only once it has really closed and only in the state it can change, the held keys as a direction of length 1, and the slop a tap may slip by on a mouse against a finger.
- **`server/room.test.ts`** runs a whole online room's life in a few milliseconds, with the clock, the lobby and the replay shelf handed to it (`RoomHost`), so no socket and no real thirty-second wait are needed: two seats and the third turned away, commands stamped with their sender and kept in order, a `c` that is not four whole numbers dropped, hashes agreed into checkpoints or reported to both as a desync (only the first one remembered), the unanswered ones capped at 64, a seat offline past `FORFEIT_MS` giving up exactly once, `conn_resync` carrying the frames a returning seat missed, the replaced socket hung up with 4000, and all four ways a room ends — over, empty, idle, and a match that never started — each keeping the right number of replays (one, or none).
- **`server/staticFiles.test.ts`** points a real `http` server at a temp tree and sends it the URLs a browser would never send (`http.request({ path })`, since `fetch` normalizes them first): a broken escape or a NUL is answered 400 **and the server is still alive afterwards** (it used to throw out of the request callback and end the process), `..` and a sibling directory whose name merely starts with the root's are 403, a missing name 404, and the page and `/assets/` get the cache headers they are meant to.
- **`npm run balance`** (not a test): headless AI-vs-AI matches with a hash every second, so a float in the state throws there too.

## Lockstep netcode — `src/net/`, `server/relay.ts`
- **Relay clock (`frameBroadcast.ts`):**
  - Every 100 ms the relay closes 3 frames, so frame == tick at 30 Hz.
  - A command arriving now is stamped onto the next open frame, never a past one. A batch once sent is final.
  - The relay never runs the sim.
- **`NetInput`:**
  - Receives `frame_batch` messages and sets `confirmedTo`.
  - `take(tick)` returns that frame's commands, or `null` if it is not confirmed yet, in which case the loop simply waits.
  - The play head trails `confirmedTo` by 3 frames, which absorbs the batch rhythm and jitter.
  - It measures input → applied delay with an EMA, shown in the status line.
- **Pacing (`catchUpRate`):** the loop runs at 1.25×–5× when behind and 0.85× when eating into the buffer. Beyond 150 ticks of backlog it fast-forwards silently instead of fast-playing for seconds.
- **Checkpoints:**
  - Each client sends `hash{tick, h}` every 30 ticks. With two players there is no majority, so any mismatch is broadcast as `desync` and shown on the status line.
  - At the end, both clients send `over{tick, winner, h}`, and the relay logs whether they agree.
- **Rooms:**
  - `create` → `room{code, seat, token}`.
  - `join{code}` → `match_start{seed, startFrame}` to both. The seed comes from the relay.
  - A seat token in `sessionStorage` allows `resume{code, seat, token, have}` after a dropped link or a page reload. The relay answers `conn_resync` with the frame log since the start, and the client rebuilds the match from the seed.
  - A seat offline for 30 s forfeits.
- **Instant feedback, render only:** a tapped card flips on screen at once (`Renderer.flipCard`); the sim builds it when the command arrives. The sim never sees the animation, so it cannot cause a desync. (There is no avatar any more, so no movement prediction.)
- **Client (`netClient.ts`):**
  - A WebSocket with auto-reconnect: back-off 400 ms × 1.6ⁿ, capped at 4 s.
  - Ping every 2 s.
  - `relayUrl()` returns `?server=…`, or the page's own host on localhost or a LAN. Under the Vite dev server (port 5207) it is the same host on the relay's port, 8787 (`DEV_RELAY_PORT`).

### Message reference
| Direction | Messages |
|---|---|
| client → relay | `create{ev}`, `join{code,ev}`, `resume{code,seat,token,have}`, `leave`, `cmd{c:[flip,0,0,ff]}`, `hash{tick,h}`, `over{tick,winner,h}`, `ping{ts}` |
| relay → client | `room{code,seat,token,v}`, `match_start{seed,startFrame,seat,code}`, `frame_batch{to,frames}`, `conn_resync{seed,seat,code,startFrame,curFrame,log}`, `peer_status{seat,online}`, `desync{tick}`, `match_over{winner,agree}`, `room_closed{why}`, `error{code}` (`no_room`, `version`: the rival runs another `ENGINE_VERSION`), `pong{ts}` |
| HTTP | `POST /r`: a solo match's replay (see **Replays**) |

## Replays — `src/sim/replay*.ts`, `src/app/replayUpload.ts`, `server/collector.ts`, `server/collect.ts`
Ported from Potion Siege's replay pipeline (`D:\fang`: replayUpload, the collector, the shelf, `npm run replays`), with the online side added: Potion Siege has no lockstep relay to record from.

- **What a replay is:** `{v, config{seed, aiBlue, aiRed}, log, endTick, hash, checks, result}`. Seed plus commands is the whole match; `hash` and `checks` let a playback prove it landed where the match did. `parseReplay` (`replayShape.ts`) checks the shape and limits of anything read from outside (a POST, a file, the console) before the engine sees it.
- **The engine version:** `ENGINE_VERSION` (rules.ts) goes up with every rules change that moves a hash. Replays from another version are counted apart, never played. Online, both seats send it with `create`/`join`, and the relay refuses a join from another version (`error{code:'version'}`), since lockstep across two rule sets desyncs at once.
- **Solo matches (`src/app/replayUpload.ts`):** each solo match goes to the relay's `POST /r` (the relay's `/r` beside its WebSocket, or `VITE_REPLAY_URL` at build time; the Playgama build sends only when `VITE_REPLAY_URL` names the hosted collector, see **Hosting** below):
  - when it ends (`won`/`lost`/`drawn`), when the player leaves it (`quit`), and when the page is hidden mid-match (`hidden`, at most once per 30 s of play), since a closed tab never reaches the end;
  - anonymous: a random 16-hex id per match, made in memory and stored nowhere, so a later upload replaces the earlier one of the same match and nothing links two matches;
  - the menu's switch (`Save.shareReplays`, on by default) turns it off; the dev server sends only with `?upload`, `?autoplay` matches never;
  - `fetch` as `text/plain` with `no-cors` (no preflight), `keepalive` when the body fits, so it survives the tab closing; a failure is dropped silently.
- **Online matches (`server/collector.ts onlineDoc`):** the relay records each room when it closes, from its own frame log and the checkpoint hashes both seats sent alike (every 30 ticks). It plays to the last hash it trusts: both seats' matching end, else one seat's end report, else the last agreed checkpoint (`over`/`left`). On a desync it stops at the last checkpoint both agreed on and keeps the evidence (`desync{tick, h:[blue, red], log}`): the two hashes at the first disagreement and the commands up to it.
- **The shelf (`server/replayShelf.ts`):** one gzipped `<id>.json.gz` per match in `REPLAY_DIR` (default `data/replays`, `off` to keep nothing), written aside and renamed. Kept 15 days, or the oldest go first past `REPLAY_BYTES` (1 GiB). `POST /r` takes 256 KB at most, 40 per address per 10 min (the address only in memory; `TRUST_PROXY=1` reads `CF-Connecting-IP`, else the first `X-Forwarded-For`), and only solo matches with a finished tick: online records come from the relay alone.
- **Hosting (`server/collect.ts`, `server/deploy/`):** the Playgama build has no relay to send to (online play is not hosted yet). Built with `VITE_REPLAY_URL=https://hf.gamestao.com/r`, it posts there, to the collector alone. Without it (the default for now: Playgama's sandbox stage may not reach our own server), it sends nothing and hides the share switch and the privacy link. That is `server/collect.ts`, which wraps the same `Collector` and shelf with no WebSocket. It runs on the Hetzner box `blightbloom` in `/home/deploy/hexfront`, in the same shape as Potion Siege's collector there:
  - Docker, `node:22.23.4-alpine`, 128 MB;
  - a cloudflared tunnel container dials out, so the box opens no port, and Cloudflare routes `hf.gamestao.com` to `http://collector:8787`.

  `npm run pack:collector` (`scripts/packCollector.mjs`) lays out `collect.ts` and the modules it loads, found by following its value imports, with no packages. Beyond the limits above, it reads at most 32 bodies at once (503 with `retry-after`), each within 20 s (408). Bodies over 256 KB get 413 before they are read when declared, else as they pass the limit.
  - `GET /privacy` (`server/privacy.ts`, English and Chinese) says what a replay holds and that it holds nothing personal, that the address stays in memory for 10 minutes at most, the 15 days, and how to opt out. The menu links to it under the share switch. The relay serves it too.
  - `GET /health` is unhealthy (503) when `REPLAY_DIR` is not writable or has under 256 MB free.
  - The deploy steps and fetching the replays (`rsync`, then `npm run replays`) are in `server/deploy/README.md`.
- **`npm run replays [-- dir]`** (`scripts/replays.ts`, `DAYS=n`, `BUILD=prefix`): plays every kept replay again (`replayStats.ts`, `replayReport.ts`). It reports, per kind (solo, online, AI demo) and per side (players, AI):
  - win rate and how matches end;
  - match length;
  - flips, and flips without the gold;
  - time to the first flip;
  - what gets built, and barracks by rarity;
  - troops trained, map events, quests, tiles and gold at the end.

  Replays that do not reach their own hashes are listed. For an online desync it plays on to the disputed tick and says whose hash this engine agrees with (`replayDesync.ts`), so the other seat's client is the one that went wrong.
- **Watching (`Game.watch`, `ReplayInput`):** the results screen's "Watch replay" plays the last match back at 1×/2×/4×/8× (the button by the exit flag). A replay cut short holds its last state, then shows "Replay over". On localhost a replay file (a shelf `.json.gz` or a saved `.json`) dropped on the page plays. The console has `Hexfront.replay()`, `Hexfront.watch(r)` and `Hexfront.check(r)`.
- **Tests:** `src/sim/replayTools.test.ts` covers the shape, hooks, stats, report and desync verdict. `src/app/replayUpload.test.ts` covers the upload and the files. `server/replayShelf.test.ts` and `server/collector.test.ts` cover the shelf, `POST /r` and `onlineDoc`, played back to its hashes, with a desync verdict. `server/collectorLimits.test.ts` covers the limits, the client address and `/privacy`. `server/collect.test.ts` covers the hosted collector over real HTTP and its health check. `server/packCollector.test.ts` covers what the bundle packs.
- **Node runs the server as is:** files that the relay or the scripts load must be erasable TypeScript, which rules out parameter properties and enums. `tsconfig.node.json` (`erasableSyntaxOnly`, in `npm run typecheck`) checks that from their entry points.

## Client frame loop — `src/view/qualityRuntime.ts`, `src/app/game.ts`
After Potion Siege and Holy Kicker:
- **Frame gate:** Pixi's ticker is stopped and stepped from our own `requestAnimationFrame` loop behind a `FrameGate`. Pixi's `maxFPS` cannot be used, because it measures each delta from the last skipped frame.
  - Calm screens (menu, results, paused) get a lower cap and stay out of the quality governor's measure.
  - A `FrameClock` advances by whole display refreshes, so late callbacks (iOS) do not make motion judder.
- **Quality levels (`quality.ts`):**
  - The start level is picked from the device (desktop or phone, cores, memory, GPU name).
  - The governor steps down quickly when frames run slow and climbs slowly after a stable stretch, never above the start level.
  - Levels change resolution and effects only, never the sim.
- **Step loop (`stepLoop.ts`):** a fixed-step accumulator.
  - Real time × `TICK_RATE` × dev speed × online catch-up rate adds ticks.
  - A tick that cannot run yet (frame not confirmed) stalls with one tick banked.
  - At most 40 steps per frame.
  - The leftover is the render interpolation alpha.
- **Faults (`faultGuard.ts`):** a frame that throws goes to `Game.fault`.
  - It is reported at most once per 30 s.
  - The game recovers by ending what ran and putting the menu up afresh.
  - After 4 recoveries in 20 s it reloads the page, but never twice within 10 min (the time is kept in `sessionStorage`); otherwise it rests and recovers again.
- **Boot (`boot.ts`):**
  - Pixi init runs in parallel with the font load (bounded at 2.5 s).
  - The menu frame tells the platform the game has loaded.
  - The build id (`scripts/buildId.mjs`: version + commit, `-dirty` for uncommitted changes) is logged.
  - Each build's page preloads Pixi's renderer chunks next to the main chunk (`scripts/pixiPreload.mjs`), saving a round trip before the first frame.

## Running
Run from this folder:
```
npm install
npm run dev              # http://localhost:5207
npm run relay            # relay on 8787; open two dev tabs for online
npm test
npm run balance
npm run replays          # play the relay's kept replays again and report
```
Hosting online play for real means running `server/relay.ts` behind TLS and opening the game with `?server=wss://your-host`. The Playgama build can only point at a relay that is hosted that way. The replay collector is hosted already (**Replays**, Hosting).
