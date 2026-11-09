# Hexfront Rush

Hexfront Rush is a real-time hex-territory strategy game for the browser. You steer a hero, claim tiles, raise towers and send waves at the rival castle. It runs on vanilla JS and Canvas, with no build step.

- **Single player:** play against an AI, with a guided tutorial.
- **Online 1v1:** deterministic lockstep through a small WebSocket relay.

## Running it

```
npm install          # ws, for the relay
npm start            # http://localhost:8787 serves the game and the relay
```

To play online locally, open two tabs: one creates a room, the other joins it with the 4-letter code. Single player also works from any static server, for example `python -m http.server`.

## Checks

```
npm test             # golden hashes, snapshot/replay, two-client loopback with jitter and a disconnect
npm run lint         # determinism lint for js/sim
```

## Docs

- [GAMEPLAY.md](GAMEPLAY.md): rules, map, units, economy and controls.
- [ENGINE.md](ENGINE.md): fixed-point sim, PRNG streams, hashing, replay, and the lockstep netcode and relay protocol.
- [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt): font (OFL), sound and music (CC0), Playgama Bridge.

## Layout

| Path | What |
|---|---|
| `js/sim/` | Deterministic simulation. Integers only, with no DOM, clock or `Math.random`. |
| `js/net/` | Relay frame clock, net input, WebSocket client, render-only predictor. |
| `js/*.js` | Renderer, audio, i18n, Playgama platform glue, app flow. |
| `server/relay.js` | Lockstep relay and static file server. |
| `tools/` | Tests, determinism lint, golden hashes, archive packer. |

The Playgama build is made with `python tools/pack.py <out.zip>`. It holds only what the browser loads. Online play on a hosted build needs the relay running behind TLS, with the game opened as `?server=wss://your-host`.
