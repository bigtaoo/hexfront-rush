# Hexfront Rush

Hexfront Rush is a real-time hex-territory strategy game for the browser. Your only move is flipping cards: each one builds a mine, tower or barracks, and the barracks send waves at the rival castle on their own.

- **Single player:** play against an AI, with a guided tutorial.
- **Online 1v1:** deterministic lockstep through a small WebSocket relay.

The stack follows Potion Siege (`D:\fang`):
- TypeScript (strict, ESM) under `src/`;
- PixiJS 8 for drawing;
- Vite 6 for the dev server and builds, with a separate Playgama build;
- vitest for tests;
- at most 500 lines per file.

## Running it

```
npm install
npm run dev              # http://localhost:5207 (fixed port), reloads on edits under src/
npm run relay            # the lockstep relay on 8787; dev pages connect to it there
```

To play online locally, run both, open http://localhost:5207 in two tabs, create a room in one and join it from the other with the 4-letter code.

| Command | What |
|---|---|
| `npm run build` | Typecheck, then the web build in `dist/`. |
| `npm start` | Build, then `server/relay.ts` serves `dist/` and the relay on http://localhost:8787 (also over the LAN). |
| `npm run dev:playgama` | The Playgama page (Bridge SDK, `src/main.playgama.ts`) on http://localhost:5208. |
| `npm run build:playgama` | Typecheck, build `dist-playgama/` and zip it into `../dist/hexfront-playgama.zip`. |
| `npm run balance [-- seeds…]` | Headless AI-vs-AI matches with balance numbers (120 seeds by default, `N=…` for more). |
| `npm run collect [-- port]` | The replay collector alone (`server/collect.ts`, 8787): `POST /r`, `/privacy`, `/health`. |
| `npm run pack:collector` | Lay out the hosted collector (its modules, Dockerfile, compose file) in `../dist/hexfront-collector`; see `server/deploy/README.md`. |
| `npm run replays [-- dir]` | Play the relay's kept replays again (`data/replays`) and report how matches go; names the seat at fault in an online desync. `DAYS=n`, `BUILD=prefix` filter. |

The relay runs on Node's built-in TypeScript type stripping (Node 22.6+; 23.6+ needs no flag).

The relay also keeps replays in `data/replays`: every online match it relays, and the solo matches games send to its `POST /r` (anonymous, the player can switch it off in the menu; the dev server sends only with `?upload`). See ENGINE.md, **Replays**.

The Playgama build sends none for now. Built with `VITE_REPLAY_URL=https://hf.gamestao.com/r`, it sends them to the hosted collector instead: `server/collect.ts` on its own (no relay), in Docker behind a Cloudflare tunnel on the box `blightbloom`, with a privacy page at `/privacy` that the settings panel links to. Deploying it and fetching its replays: `server/deploy/README.md`.

| Relay / collector setting | What |
|---|---|
| `PORT` | Port (8787). |
| `REPLAY_DIR` | Where replays go (`data/replays`); `off` keeps none. |
| `REPLAY_BYTES` | The most the replays take before the oldest go (1 GiB); each is kept 15 days at most. |
| `TRUST_PROXY=1` | Behind a proxy: the upload limit counts by `CF-Connecting-IP`, else the first `X-Forwarded-For`. |
| `PRIVACY_CONTACT` | An address shown on `/privacy` for questions about the data (none by default). |
| `VITE_REPLAY_URL` (build) | Send solo replays here instead of the relay's `/r`. Unset, the Playgama build sends none and hides the share switch. |

## Checks

```
npm run check            # typecheck + tests + file length; run before every commit
npm test                 # vitest: golden hashes, replay, loopback netcode, determinism lint, the rules themselves (map, paths, economy, setup, quests, combat), replay pipeline, app/platform units
npm run typecheck        # also checks that what Node runs (relay, scripts) is erasable TypeScript
npm run check:filelength # no file under src/, scripts/ or server/ over 500 lines
```

## Docs

- [GAMEPLAY.md](GAMEPLAY.md): rules, map, units, economy, controls, platform and audio.
- [ENGINE.md](ENGINE.md): fixed-point sim, PRNG streams, hashing, replay, the lockstep netcode and relay protocol, and the client frame loop.
- [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt): font (OFL), sound and music (CC0), Playgama Bridge.

## Layout

| Path | What |
|---|---|
| `src/sim/` | Deterministic simulation. Integers only, with no DOM, clock or `Math.random` (enforced by `determinismLint.test.ts`). |
| `src/net/` | Relay frame clock (shared with the relay), net input, WebSocket client. |
| `src/view/` | The Pixi renderer (read-only over the sim), camera (play zoom and the overview), HUD, edge markers, effects, quality levels and the frame loop (`qualityRuntime.ts`). |
| `src/app/` | Boot, the `Game` flow (menu, match, results), controls, tutorial, online rooms, save, audio, i18n, fault recovery. |
| `src/platform/` | The host: plain web, or Playgama Bridge (saves, ads, pause and sound switches). |
| `src/main.ts`, `src/main.playgama.ts` | Entries of the two builds. |
| `server/relay.ts` | Lockstep relay and static file server for `dist/`. |
| `server/collector.ts`, `server/replayShelf.ts` | `POST /r` for solo replays, online match records, the replay shelf. |
| `server/collect.ts`, `server/privacy.ts` | The collector on its own, as hosted for the Playgama build, and its privacy page. |
| `server/deploy/` | The hosted collector's Dockerfile, compose file (with cloudflared) and deploy steps. |
| `scripts/` | Build id, Pixi preload and dev-watch helpers for the Vite configs; Playgama zip packer; file-length check; balance and replay runners; audio importer. |
| `data/` | The relay's replays (not in git). |
| `public/` | Font, music and sound effects, copied into the build as they are. |

Online play on a hosted build needs the relay running behind TLS, with the game opened as `?server=wss://your-host`.
