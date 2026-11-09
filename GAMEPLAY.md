# Hexfront Rush — core gameplay spec

An original 1v1 real-time territory battle on a portrait hex map. It is derived from the mechanics observed in `D:\new\ref`, with its own name, art and units. Meta systems such as ranks, collections and rewards are out of scope for this test build.

## Match flow
1. **Intro:** show a map overview, count down 3-2-1, then "FIGHT!".
2. **Match length:** 3:00. A "1 minute left" alert fires at 60 s. The last 10 s show a big countdown.
3. **End of match:**
   - The match ends early if a castle is destroyed; that player loses immediately.
   - Otherwise, when time runs out, whoever owns more tiles wins. Equal counts are a draw.
4. **Results screen:** shows the outcome and both tile counts. "Play again" leads to an interstitial ad. "Watch replay" plays the match back (speed button 1×/2×/4×/8× beside the exit flag; the flag goes back to the menu).
5. **Replays:** solo matches are sent anonymously to the relay so the game can be tuned from real play. A menu switch turns this off, and online matches are recorded by the relay itself. See ENGINE.md, **Replays**.

## Map
- Hex grid, pointy-top, 13 columns × 25 rows (325 tiles). Castles sit on row 4 (red) and row 20 (blue), each with 4 rows of back yard behind it, so the front line is about 16 rows deep.
- The layout is mirrored top/bottom so both sides are fair.
- Obstacles (trees, rocks, cacti, ice) block movement. Each map is built from a template, not scattered noise:
  - groves in the back corners;
  - two wall segments a few rows before the middle, leaving a centre lane and two side lanes (sometimes with a hook);
  - a centre island (a ridge, a column or three rocks);
  - 2–4 field groves in the open ground.

  The castle and every tile within 3 steps of it stay clear. The map is checked for connectivity and keeps 7–20 % obstacles.
- **Camera:** the play view shows about 11 hexes across and 17 rows. The intro opens on the enemy castle and pans home; after that the camera stays where the player puts it: drag the map, scroll the mouse wheel or hold WASD / the arrow keys. It never leaves the map. The menu's AI demo shows the whole map.
- **Minimap:** top right, the whole field: owned tiles, buildings, troops, guards, and the part of the map on screen. Tapping it glides the camera there.
- Each match picks one of three themes: Meadow, Desert or Snow.
- Each player starts with a castle and its 6 neighbouring tiles. Blue's castle is at the bottom, red's at the top. Each player always sees their own castle at the bottom: the red player's view is mirrored top to bottom.

## The player's move: flipping cards
- The player has no avatar. The **only** action is tapping a card.
- Cards (offers) stand on the free tiles next to the tiles the player has flipped (the castle counts as flipped), each showing what it builds and its price. An affordable card has a breathing gold rim; one you can't afford is grey with a red price.
- Tapping an affordable card flips it and the building appears on that tile. Tapping one you can't afford shakes the gold pill.
- **Every flip opens the tiles around it,** whatever the card gave, a mystery that gave nothing included: the free tiles next to it turn face-up as new cards. A flipped mystery tile is spent (its card does not come back). A building that falls closes its tile again, so the tile gets a card again if it is next to another flipped tile.
- **Ground:** every new building claims the neutral tiles around it (never enemy tiles). Troops claim every tile they walk over, so most ground is won by the army.
- A drag of more than 10 px moves the camera instead of tapping.

## Castle and guard
- The castle works like a built-in gold mine: +10 gold every 3 s, shown by a coin timer on the castle. It has 2000 HP and no longer shoots.
- Each castle has a **guard**, a knight the player does not control:
  - wanders at random among the tiles up to 2 steps from the castle, pausing a moment at each: it picks a spot ahead of the castle 6 times as often as one behind it, and one level with it 3 times as often, so it spends about 80% of the time in front, 15% at the sides and 5% behind;
  - walks around the castle, not through it;
  - claims the tiles it walks for its team, as troops do (not rocks, not tiles under an enemy building);
  - turns on any enemy troop that comes within reach of home and shoots bolts (320 HP, 14 damage every 0.7 s, range 2.4 tiles);
  - never steps further than 2.8 tiles from the castle (the dashed circle);
  - regenerates out of combat, and comes back at the castle 12 s after it falls.

## Economy and building
- **Gold:** start with 60.
  - The castle gives +10 every 3 s.
  - Each gold mine gives +10 every 4 s.
  - Chests appear in mirrored pairs every 20 s; the first troop to walk onto one picks up +40 for its team.
- **Offers:** every free tile next to a tile you have flipped becomes an offer (a card) with a fixed type and price. Tapping a card you can afford builds it. The price shows red when you can't afford it.
- **Network:** every flip, a building or a mystery, extends your network and reveals the offers around it.

| Offer | Cost | Effect |
|---|---|---|
| Gold mine | 50 | +10 gold every 4 s |
| Watchtower | 50 | Shoots enemies within 2.6 tiles |
| Barracks I | 50 | Rarity: common 74 / rare 20 / epic 5 / legendary 1 % |
| Barracks II | 100 | Rarity: common 30 / rare 60 / epic 8 / legendary 2 % |
| Barracks III | 250 | Rarity: epic 90 / legendary 10 % |
| Mystery "?" | 25 | 70 % nothing; 10 % common squad; 15 % epic unit; 5 % legendary unit |

- **Barracks:** when built, a barracks rolls one unit type and then trains one of it on a fixed timer for the rest of the match (common 7 s, rare 9 s, epic 12 s, legendary 18 s). Each troop marches on the enemy castle by itself. A team can have at most 40 troops alive; at the cap the timer stays full (grey) and the next troop comes out as soon as one falls. A card shows what you rolled; a legendary roll gets a full banner.

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
- **Targets:** units stop to fight enemy units and the castle guard within aggro range, then hit enemy buildings.
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
- Plays by the same rule as a person: every 0.5–1 s it may flip one of its cards.
- Values each card: mines early (fewer once it has 6), barracks (the dearer the better), towers by how many enemy troops are near home, mystery last (but above a surplus mine or tower, since it opens the ground around it).
- Saves up when a better card is on the board and within 40 gold of its purse, instead of spending on a much weaker one.
- Prefers cards toward the front, more strongly after the first minute.

## Onboarding
The first match starts with a "How to play" card, followed by contextual hints:
1. Build (tap a card).
2. Barracks.
3. Win condition.

A pointing hand taps where the current step wants the player: the nearest affordable card to the castle (build), then a
barracks card (barracks).

## Online 1v1 (lockstep)
- **Menu → Online 1v1:** "Create room" shows a 4-letter code. The rival types it and presses "Join". The creator plays blue, the joiner plays red.
- **Same simulation on both sides:** each player's commands go through the relay, which stamps them onto frames. Both clients run the identical deterministic sim. Details are in ENGINE.md.
- **Taps feel instant:** a tapped card flips at once on screen; the building appears when the relay has stamped the command, a frame or two later.
- **Status line** (above the bottom bar, right):
  - ping;
  - "Reconnecting…" while the link is down (it retries on its own);
  - "Rival disconnected";
  - "Out of sync" if a checkpoint hash ever differs.
- **Reload or a dropped link resumes the match:** the client rebuilds it from the seed and the relay's frame log.
- **Leaving:** a seat that stays offline for 30 s forfeits. The flag button forfeits too; press it twice within 2.5 s.
- **Relay required:** the button only appears when a relay is reachable, which means the dev server (its pages use the relay on port 8787), the build served by `server/relay.ts` on localhost or a LAN, or a `?server=wss://host` parameter. The Playgama build has no hosted relay yet, so it is single-player only there.

## Platform — src/platform/
The game talks to its host through one `Platform` interface. `WebPlatform` is the plain page; `PlaygamaPlatform` (the Playgama build, after Potion Siege) adds Bridge. Nothing in the game can break because of the SDK.
- **Init:** `PlaygamaPlatform.create()` waits at most 5 s for Bridge and reads the save through it before the game boots. Without Bridge (local preview, adblocker) everything falls back to the web platform. Bridge's `mock` and `qa_tool` platforms count as web, so a preview never counts as a Playgama player.
- **Language:** the platform's first, then the browser's. English, with Chinese for `zh`.
- **Storage:** one batched read at boot, then writes are batched to the next tick and flushed on hide, pagehide and the host's pause. It falls back to localStorage when Bridge is absent.
- **Lifecycle:** `game_ready` goes out on the first menu frame. Gameplay start/stop brackets are deduplicated, and a start never goes out before `game_ready`. Level started / completed / failed follow the match.
- **Interstitial `match_end`:** plays between matches, at most one per 2.5 min of actual match play (`adPacing.ts`), with Bridge's own 60 s minimum on top.
  - Watchdogs: 15 s for the ad to open, 300 s for it to close.
  - A given-up ad can't stack with the next one.
  - The game pauses and mutes while the ad is on screen, and also follows the host's pause and sound switches.
- **The Playgama build** (`vite.playgama.config.js`): relative base, entry `src/main.playgama.ts`, the Bridge SDK tag from Playgama's CDN ahead of the entry, and `playgama-bridge-config.json` emitted next to `index.html`. The build fails if the page was never rewritten. `scripts/pack_playgama.py` zips it with `/` paths and no directory entries.
- No other external requests.

## Audio — src/app/audio.ts
Ported from Holy Kicker.
- Closed cue table: priority, gain, minimum gap, pitch variance.
- Per-frame gate: repeats of a cue merge into one louder voice.
- 14-voice cap with priority stealing; compressor on the effects bus.
- Music: two `<audio>` decks with 2 s equal-power crossfades, used both for track changes (lobby ↔ battle) and for the loop.
- Respects the mute button, platform audio state and pause.
- Sources: all CC0 (Kenney, OpenGameArt), see THIRD-PARTY-NOTICES.txt. Rebuild `public/sfx` and `public/music` with `python scripts/import_audio.py`.

## Feel
- Font: Lilita One (OFL), Latin only. Chinese falls back to the system font.
- Hit flash is a white overlay.
- Trauma screen shake on building loss.
- Damage numbers on guards, troops and buildings; hits within 0.4 s merge and re-pop.
- Coins fly from mines, chests and quests into the gold pill, which pops as they land and shakes red when the player can't afford something.
- Results reveal one item after another, and the score counts up.

## Dev switches (localhost only)
- `?autoplay`: blue plays itself, no tutorial.
- `?speed=N`: simulation runs N× (max 16).
- `?seed=N`: fixed match seed.
- `?upload`: send solo replays to the dev relay (the dev server sends none otherwise).
- A replay file (`.json` from `Hexfront.replay()`, or a relay `.json.gz`) dropped on the page plays it.

## Commands
Run all of these from this folder.
- **Play:** `npm run dev`, then http://localhost:5207.
- **Online locally:** also `npm run relay` (port 8787), then open http://localhost:5207 in two tabs.
- **All checks:** `npm run check` (typecheck, vitest, file length). Tests cover determinism, golden hashes, replay, loopback netcode and the determinism lint.
- **Balance:** `npm run balance` plays 8 seeded AI-vs-AI matches.
- **Replays:** `npm run replays` plays the relay's kept matches again and reports how they went.
- **Package:** `npm run build:playgama` writes `../dist/hexfront-playgama.zip`.
