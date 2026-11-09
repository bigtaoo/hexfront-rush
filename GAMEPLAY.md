# Hexfront Rush — core gameplay spec

An original 1v1 real-time territory battle on a portrait hex map. It is derived from the mechanics observed in `D:\new\ref`, with its own name, art and units. Meta systems such as ranks, collections and rewards are out of scope for this test build.

## Match flow
1. **Intro:** show a map overview, count down 3-2-1, then "FIGHT!".
2. **Match length:** 3:00. A "1 minute left" alert fires at 60 s. The last 10 s show a big countdown.
3. **End of match:**
   - The match ends early if a castle is destroyed; that player loses immediately.
   - Otherwise, when time runs out, whoever owns more tiles wins. Equal counts are a draw.
4. **Results screen:** shows the outcome and both tile counts. "Play again" leads to an interstitial ad.

## Map
- Hex grid, pointy-top, 11 columns × 19 rows.
- The layout is mirrored top/bottom so both sides are fair.
- Obstacles (trees, rocks, cacti, ice) block movement and form lanes.
- Each match picks one of three themes: Meadow, Desert or Snow.
- Each player starts with a castle and its 6 neighbouring tiles. Blue's castle is at the bottom, red's at the top. Each player always sees their own castle at the bottom: the red player's view is mirrored top to bottom, and "up" on the keys is flipped to match.

## Hero
- **Movement:**
  - Tap or click a tile, or hold and drag, to walk there along a path.
  - WASD or the arrow keys move directly.
- **Claiming:** stepping on a tile claims it immediately and leaves a trail of your colour. A tile that holds an enemy building cannot be claimed.
- **Combat:** the hero auto-shoots the nearest enemy within 3 tiles (crossbow).
- **Death:** the hero respawns at its castle after 5 s and regenerates near home.

## Economy and building
- **Gold:** start with 60.
  - The castle gives +10 every 3 s.
  - Each gold mine gives +10 every 4 s.
  - Chests appear in mirrored pairs every 20 s and give +40.
- **Offers:** every free tile next to one of your buildings becomes an offer with a fixed type and price. Walking onto an offer you can afford builds it. The price shows red when you can't afford it.
- **Network:** new buildings extend your network, which reveals more offers.

| Offer | Cost | Effect |
|---|---|---|
| Gold mine | 50 | +10 gold every 4 s |
| Watchtower | 50 | Shoots enemies within 2.6 tiles |
| Barracks I | 50 | Rarity: common 74 / rare 20 / epic 5 / legendary 1 % |
| Barracks II | 100 | Rarity: common 30 / rare 60 / epic 8 / legendary 2 % |
| Barracks III | 250 | Rarity: epic 90 / legendary 10 % |
| Mystery "?" | 25 | 70 % nothing; 10 % common squad; 15 % epic unit; 5 % legendary unit |

- **Barracks:** when built, a barracks rolls one unit type and keeps training it on a timer, up to a cap of units alive. A card shows what you rolled; a legendary roll gets a full banner.

## Units

| Rarity | Unit | Role |
|---|---|---|
| Common | Militia | Melee |
| Common | Slinger | Short range |
| Rare | Shieldbearer | Tanky melee |
| Rare | Bowman | Ranged |
| Epic | Ogre Brute | Heavy melee |
| Epic | Storm Adept | Long-range caster |
| Legendary | Stone Colossus | Huge HP, double damage to buildings |
| Legendary | Flame Drake | Fast, ranged splash |

- **Marching:** units follow a flow field towards the enemy castle and flip every tile they walk over.
- **Targets:** units stop to fight enemy units and the hero within aggro range, then hit enemy buildings.
- **Destroyed buildings:** they leave rubble, and the tile goes to the attacker.

## HUD
- **Top:**
  - Tile tug-of-war bar, blue vs red, with counts.
  - Timer.
  - Units alive for each side.
- **Bottom:**
  - Gold.
  - Current mini quest. Completing it pays bonus gold; there are up to 3 quests per match.
- **Always on screen:** a mute button.

## Rival AI
- Picks the affordable offer with the best value-to-distance ratio, weighted for mines and barracks early.
- Claims nearby tiles while it saves up gold.
- Retreats to its castle when below 35 % HP.
- Pushes alongside its army late in the match.

## Onboarding
The first match starts with a "How to play" card, followed by contextual hints:
1. Move.
2. Build.
3. Barracks.
4. Win condition.

A pointing hand taps where the current step wants the player: two tiles ahead of the hero (move), the nearest priced
tile (build), a barracks offer (barracks). It hides while the hero walks.

## Online 1v1 (lockstep)
- **Menu → Online 1v1:** "Create room" shows a 4-letter code. The rival types it and presses "Join". The creator plays blue, the joiner plays red.
- **Same simulation on both sides:** each player's commands go through the relay, which stamps them onto frames. Both clients run the identical deterministic sim. Details are in ENGINE.md.
- **Own hero feels instant:** it is drawn ahead of the confirmed sim by the measured input delay (render-only prediction).
- **Status line** (above the bottom bar, right):
  - ping;
  - "Reconnecting…" while the link is down (it retries on its own);
  - "Rival disconnected";
  - "Out of sync" if a checkpoint hash ever differs.
- **Reload or a dropped link resumes the match:** the client rebuilds it from the seed and the relay's frame log.
- **Leaving:** a seat that stays offline for 30 s forfeits. The flag button forfeits too; press it twice within 2.5 s.
- **Relay required:** the button only appears when a relay is reachable, which means the page is served by `server/relay.js` on localhost or a LAN, or a `?server=wss://host` parameter is given. The Playgama build has no hosted relay yet, so it is single-player only there.

## Platform (Playgama Bridge) — js/platform.js
Ported from Holy Kicker's Playgama wrapper. Nothing in the game can break because of the SDK.
- Init is bounded at 5 s.
- Language comes from the platform: English, with Chinese for `zh`.
- Storage: one batched read at boot, then writes are batched to the next tick and flushed on hide/pagehide/pause. It falls back to localStorage when Bridge is absent.
- Gameplay start/stop brackets are deduplicated. `game_ready` is sent on the menu, along with level start / complete / fail.
- Interstitial `match_end` plays between matches, at most one per 150 s of actual play.
  - Watchdogs: 15 s for the ad to open, 300 s for it to close.
  - A given-up ad can't stack with the next one.
  - The game pauses and mutes while the ad is on screen.
- No external requests.

## Audio — js/audio.js
Ported from Holy Kicker.
- Closed cue table: priority, gain, minimum gap, pitch variance.
- Per-frame gate: repeats of a cue merge into one louder voice.
- 14-voice cap with priority stealing; compressor on the effects bus.
- Music: two `<audio>` decks with 2 s equal-power crossfades, used both for track changes (lobby ↔ battle) and for the loop.
- Respects the mute button, platform audio state and pause.
- Sources: all CC0 (Kenney, OpenGameArt), see THIRD-PARTY-NOTICES.txt. Rebuild with `python tools/import_audio.py`.

## Feel
- Font: Lilita One (OFL), Latin only. Chinese falls back to the system font.
- Hit flash is a white overlay.
- Trauma screen shake on building and hero loss.
- Damage numbers on heroes and buildings; hits within 0.4 s merge and re-pop.
- Coins fly from mines, chests and quests into the gold pill, which pops as they land and shakes red when the player can't afford something.
- Results reveal one item after another, and the score counts up.

## Dev switches (localhost only)
- `?autoplay`: blue plays itself, no tutorial.
- `?speed=N`: simulation runs N× (max 16).
- `?seed=N`: fixed match seed.

## Commands
Run all of these from this folder.
- **Tests:** `node tools/test.js` covers determinism, golden hashes, replay, and loopback netcode.
- **Determinism lint:** `node tools/lint-sim.js`
- **Balance:** `node tools/sim.js` plays 8 seeded AI-vs-AI matches.
- **Online locally:** `npm install`, then `node server/relay.js`, then open http://localhost:8787 in two tabs.
- **Package:** `python tools/pack.py ../dist/hexfront-rush-X.Y.Z.zip`
