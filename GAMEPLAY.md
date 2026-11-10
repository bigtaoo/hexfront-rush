# Hexfront Rush — core gameplay spec

An original 1v1 real-time territory battle on a portrait hex map. It is derived from the mechanics observed in `D:\new\ref`, with its own name, art and units. Meta systems such as ranks, collections and rewards are out of scope for this test build.

## Match flow
1. **Intro:** show a map overview, count down 3-2-1, then "FIGHT!".
2. **No clock:** a match runs until a castle falls; the player whose castle falls loses. The HUD clock counts up. AI-vs-AI matches last about 3½ minutes (median; 90 % are over by 5:00).
3. **Siege:** from 8:00 on, every minute both sides' troops hit buildings 25 % harder and the troop cap rises by 10 ("SIEGE!" banner, a "siege +N%" tag by the clock). It is the same for both: the side with more and better barracks fills the new room first and breaks through.
4. **Stalemate valve:** only past 25:00 does the match end on tiles (more tiles wins, equal is a draw). Balance runs never get there.
5. **Results screen:** shows the outcome and both tile counts. "Play again" leads to an interstitial ad. "Watch replay" plays the match back (speed button 1×/2×/4×/8× beside the exit flag; the flag goes back to the menu).
6. **Replays:** solo matches are sent anonymously to the relay so the game can be tuned from real play. A menu switch turns this off, and online matches are recorded by the relay itself. See ENGINE.md, **Replays**.

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
- **Overview:** the map is only a little bigger than the play view, so there is no minimap. The magnifier button (top right of the play area), Space, a pinch or Ctrl + the wheel (a trackpad pinch) zoom out to the whole map; tapping the map there zooms back in on that spot (a pinch out, Ctrl + wheel up, Space or the button again also come back). Cards cannot be flipped in the overview: a tap only zooms in. Where the whole map fits at play zoom (a large screen) the button does not show.
- **Edge markers:** at play zoom, markers on the edge of the play area point at what is off screen; tapping one glides the camera there. Every map event still waiting has a quiet marker with its icon (gold rim for gold, rarity colour for troops). Things that just happened off screen ping a bright marker for about 3 s: an event claimed (gold when you took it, red when the rival did), your castle under attack (at most every 5 s), a building lost (red) or destroyed (gold), and an epic or legendary barracks the rival raised.
- Each match picks one of three themes: Meadow, Desert or Snow. Snow's neutral ground is a grey-white a step darker than the pieces, so the white trees, chests and price tags stand out on it.
- Each player starts with a castle and the 6 cards around it. Blue's castle is at the bottom, red's at the top. Each player always sees their own castle at the bottom: the red player's view is mirrored top to bottom.

## The player's move: flipping cards
- The player has no avatar. The **only** action is tapping a card.
- Cards (offers) stand on the free tiles next to the tiles the player has flipped (the castle counts as flipped), each showing what it builds and its price. An affordable card has a breathing gold rim; one you can't afford is grey with its price faded (not red: red is the rival's colour).
- Tapping an affordable card flips it and the building appears on that tile. Tapping one you can't afford shakes the gold pill.
- **Every flip opens the tiles around it,** whatever the card gave, a mystery that gave nothing included: the free tiles next to it turn face-up as new cards. A flipped mystery tile is spent (its card does not come back). A building that falls closes its tile again, so the tile gets a card again if it is next to another flipped tile.
- **Ground:** every new building claims the neutral tiles around it (never enemy tiles). Troops claim every tile they walk over, so most ground is won by the army.
- A drag of more than 10 px moves the camera instead of tapping.

## Castle and guard
- The castle works like a built-in gold mine: +10 gold every 3 s, shown by a coin timer on the castle. It has 3000 HP and does not shoot.
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
  - Each gold mine gives +10 every 5 s.
  - Map events (below) pay gold or troops to whoever flips their card first.
- **Offers:** every free tile next to a tile you have flipped becomes an offer (a card) with a type and price. Tapping a card you can afford builds it. The price fades when you can't afford it.
- **Network:** every flip, a building or a mystery, extends your network and reveals the offers around it.
- **Rising prices:** each card costs its base price plus a step for every building of its kind the team has standing (a mystery stays 25). Losing a building makes the next one cheaper again.

| Offer | Base | Step | Effect |
|---|---|---|---|
| Gold mine | 50 | +15 | +10 gold every 5 s |
| Watchtower | 50 | +25 | Shoots enemies within 2.8 tiles (22 dmg every 0.8 s) |
| Barracks I | 50 | +5 | Common, 20 % rare (or a hidden jackpot, below) |
| Barracks II | 100 | +5 | Rare 65 %, else common (or a hidden jackpot) |
| Barracks III | 200 | +5 | Always epic or legendary |
| Mystery "?" | 25 | — | 60 % nothing. A squad that sets off at once: 10 % three common units, 12 % two epic, 4 % two legendary. A barracks on the tile that trains for good: 9 % rare, 4 % epic, 1 % legendary |

- **Barracks:** a barracks trains one unit type on a fixed timer for the rest of the match (common 7 s, rare 9 s, epic 12 s, legendary 18 s). Its troops gather by it and set off together on the **wave**: every 15 s both teams' troops march at once (the HUD counts down to it), so armies meet armies, not a trickle. A team can have at most 50 troops alive; at the cap a barracks waits with its timer full (grey), and a freed slot goes to the rarest troop waiting. Mystery troops come on top of the cap and set off at once. A barracks from a mystery is a barracks like any other: it claims the ground around it, counts toward the barracks price and the barracks quest, and the rival's epic or legendary one pings an edge marker. A card shows what you rolled (the unit, its rarity, and whether it is a squad marching now or a barracks); a legendary roll gets a full banner.

## Card layout (cardLayout.ts)
Every card on the map is laid out when the match starts, from the match seed: the same seed is the same map, card for card (the tutorial always plays seed 2). The layout is made for blue and mirrored for red, so both find the same cards at the same distance from their own castle. Cards stay face-down until they are next to a tile you have flipped, so finding the good ones is luck and the way you spread is the plan.

Zones count hex distance from your own castle:

| Zone | Distance | Gold mines | Epic barracks | Legendary barracks |
|---|---|---|---|---|
| Home | 1–2 | 2 | 0 | 0 |
| Near | 3–4 | 3 | 1 | 0 |
| Middle | 5–7 | 3 | 2 | 1 |
| Far (enemy half) | 8+ | 3 | 2 | 1 |
| **Cap per match** | | **11** | **5** | **2** |

- The six cards around the castle always hold a mine, a Barracks I and a mystery (in a seeded order); that mine is one of the home zone's two.
- Mines never stand next to each other, and the epic and legendary spots keep apart the same way.
- An epic or legendary spot shows a Barracks I (15 %), II (25 %) or III (60 %) card: a cheap card can hide a jackpot, and a Barracks III card is always one.
- Every other tile gets a filler card by weight: tower 28, Barracks I 34, Barracks II 22, mystery 16. A filler barracks is common or rare, rolled with the layout.
- A mystery is still a gamble: what it gives is rolled when it is flipped.
- A tile that comes free again after its building fell (rubble) gets a fresh filler card, never a mine or a jackpot: a lost mine is gone for good.
- The map events are laid out with the cards, from the same stream after them (so adding them moved no card): see Map events.
- Numbers from 300 AI-vs-AI matches (before the map events): per side, 4.2 of the 11 mines are seen and 3.8 flipped; 1.6 of the 7 jackpot barracks are seen and 0.9 built. The side with more mines at 1:30 wins 70 % (81 % before the layout), the side with more epic+legendary barracks 89 %, more mystery jackpots 72 %; 30 % of winners were behind on tiles (under 40 %) after the first minute.
- Mystery barracks (120 AI-vs-AI matches, with the map events): about 1.7 barracks per side per match come from mysteries (14 % of mystery flips). Matches run as long as before (median 3:36), and they open a way back: the side with more epic+legendary barracks from the cards won 83 % (94 % without them), the side with more mystery barracks 76 %.

## Map events
Events stand on the map from the start, face up for both players: the one thing a player can plan a route toward. The cards stay hidden; an event says nothing about the card under it. The first team to flip the card on an event's tile (a building or a mystery, at any price) claims it; a troop walking over it does not.

| Event | Look | Reward |
|---|---|---|
| Chest | a chest | +60 gold |
| Hoard | a big chest under a heap of coins | +150 gold |
| Camp | a tent with a blue (rare) pennant | 3 rare troops of one kind |
| Warband | a big red tent with a purple (epic) banner | 2 epic troops of one kind |

- **Where (EVENT_LAYOUT, rules.ts):** each side has its own, mirrored for red: a chest in the near zone, a chest and a camp in the middle zone. The middle row holds a hoard and a warband, as far from one castle as from the other: a race. Events keep 3 tiles apart (mirrors included) and never stand on rocks; the same seed puts them in the same place.
- **Troops** from a camp or a warband set off at once and come on top of the troop cap, like a mystery's.
- **On screen:** on free ground an event stands full size and bobs; once you have a card on its tile it shrinks to a badge on the card's corner. An edge marker points at every waiting event that is off screen (gold for gold, rarity colour for troops), and a claim off screen pings one. Claiming one shows "+60 gold" with flying coins or the troops' card; when the rival gets there first, "Rival got there first".
- **AI:** a card on an event's tile is worth the event too (gold/2, or per troop 8/15/30/50 by rarity), and a card up to 3 tiles short of one a share of it, so the AI paves toward events without dropping its economy.
- Numbers from 300 AI-vs-AI matches: per side, 1.3 of 2 chests, 0.6 of 1 camp and 0.3 each of the hoard and warband are claimed; 3.1 of the 8 events are left at the end. The middle row is claimed at 2:47 median (p90 4:12). The side with more event worth won 76 %, which is partly cause and partly effect (the side ahead reaches the middle first). Median length 3:44; 34 % of winners were behind on tiles after the first minute (30 % before the events).

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
  - Clock (counting up), the next wave's countdown (yellow in its last 3 s) and, in a siege, the siege tag.
  - Units alive for each side.
- **Bottom:**
  - Gold.
  - Current mini quest. Completing it pays bonus gold; there are up to 3 quests per match.
- **Always on screen:** the sound button (effects). On the menus and boards a music button sits beside it (music alone); in a solo match a pause button takes its place.
- **Pause** (solo matches: campaign, daily, quick match; Esc or P): the match stops and a board offers Resume, Restart (this stage again, counted as quit) and Menu. Esc, P, Enter or Space resume. The music keeps playing. Online and replays have no pause.

## Rival AI
- Plays by the same rule as a person: every 0.5–1 s it may flip one of its cards.
- It sees only its own face-up cards, like a person (never the hidden layout or rarities).
- Values each card: mines early (fewer once it has 6, fewer still past 9), barracks (the dearer the better; a common one is little use once its army is at the cap), towers by how many enemy troops are near home, a mystery higher when gold piles up or the army is capped.
- Saves up when a better card is on the board and within 40 gold of its purse (a Barracks III: within 200, unless home is under attack), instead of spending on a much weaker one. When gold piles up past 150 with nothing better, it takes even a weak card.
- Plans where things go: mines toward the back, barracks and towers toward the front, more strongly after the first minute.
- **Skill** (a side's setup, `sim/setup.ts`): 0 beginner (slow, half at random, ignores chests), 1 novice, 2 skilled, 3 standard (all of the above; the best, nothing tried beats it). **Style** leans its taste: 0 balanced, 1 builder (mines), 2 warlord (barracks), 3 turtle (towers), 4 gambler (mysteries); each wins about half against the balanced one.
- **Handicaps** (per side): starting gold, income %, castle hp %, a starting barracks (rarity), starting towers; and the siege time for both. Income is the smooth difficulty lever; a starting barracks is a strong one; castle hp barely matters.
- **Who the rival is** (`src/app/rival.ts`): one character per style, each with a name, a line and a portrait (the style's SVG icon on a red disc): Captain Bram (balanced), Goldie the Miner (builder), Warlord Krag (warlord), Old Stonewall (turtle), Lucky Jack (gambler). Names and lines are `rv_n<style>` / `rv_q<style>` in the lang tables.

## Campaign, quick match, daily — src/app/campaign.ts
- **Menu:** the HEXFRONT RUSH logo between a blue guard and a red ogre over the AI demo (the match HUD stays hidden behind the menu), then Play (the next campaign stage) · Quick match + its difficulty (Easy / Normal / Hard / Brutal) · Achievements (a medal with n/10) · Settings (a gear) · Daily · Online · How to play · Leaderboard (where the platform has one).
- **Campaign:** 6 chapters × 7 stages (the 7th a boss), each chapter one theme and one idea: first steps, gold rush (both start rich), blitz (early siege), fortresses (towers, strong castle), warlords (rival starts with barracks), the last front (all at once). Each stage is a fixed map (the seed), its rival's setup and maybe the player's. Stage 1-1 is the tutorial.
- **Brief** before a stage: the rival's card (portrait, name, style, its line; a crown on a boss), what is different there (one line each), the three goals, the chapter's tip (how to play its idea) and the best winning time there, once won. On a short, wide screen it splits in two columns (the rival and the twists left, the goals and the tip right, the buttons under both).
- **Boss stages** (the 7th of each chapter): "Stage 1-7 · Boss" in the brief, a "Boss · <name>" banner over the countdown and their own music (`boss`).
- **Hard campaign** (Normal / Hard tabs over the chapter, shown once 1-1 is won): the same 42 maps against a stronger rival: one skill step up (to at most standard) and income x1.1, or x1.2 where the rival is already at standard (`hardStage`, DECISIONS.md D18). Hard stage n opens when Normal stage n and Hard stage n-1 are won. Its own stars and best times (Save.hard, Save.hardBest); the star leaderboard counts both; its grid is dark wood.
- **In the match:** the HUD's bottom-right line counts the chests and camps taken toward the second star (green once there) and gives the par.
- **Results** (a cream board like the other panels): the reason and the title, the tiles held by each side (counting up), the time played and the stage's best winning time ("New best time!" when beaten), the stars (new ones flash), a table of both sides' match (gold mines and barracks built, chests and camps taken, the largest army on the field at once; the better number in its side's colour), Next stage after a win, a tip after a loss (a different one each loss), "Campaign complete! ★ n/126" after winning 6-7, and the achievements just earned. On a short, wide screen (a phone held sideways) the board splits in two columns: the score on the left, the stats and the buttons on the right.
- **Achievements** (`src/app/achievements.ts`, ten, kept in the save, earned at the end of a match against the AI): First Victory; Treasure Hunter (win having taken every chest and camp); Legend (a legendary barracks); Blitz (win within 2:30); Full Chapter (every star of a chapter); Daily Habit (the daily won 3 days in a row); Brutal (a quick match on Brutal); Horde (50 troops on the field at once); Conqueror (all 42 stages); Hard Chapter (all 7 stages of a chapter won on Hard). The menu's medal opens them all, lit when earned, each with how to earn it.
- **Stars:** win; win having taken at least half the map's chests and camps; win within the par time. A stage keeps every star ever earned. The next stage opens when this one is won.
- **Daily challenge:** the same for everyone that day (seed from the date), a twist by day of the week, the rival's style by date; its own three stars and a win streak.
- **Calibration:** `npm run campaign` plays each stage with the standard AI standing in for the player (`HARD=1` for the hard campaign); `npm run campaigntune -- <chapter>` sets the rivals' incomes for a falling win-rate curve (DECISIONS.md).
- **Settings** (the menu's gear, `src/app/settings.ts`, kept in the save): sound effects, music, vibration (only where the browser can vibrate), graphics (Auto: the frame governor starts on the device's level and steps down when frames drop; High: the top level, never stepped down; Battery saver: the saver level, 30 fps), and the replay sharing switch with its privacy link (where replays are collected). On a short screen the graphics label sits beside its tabs.
- **Vibration** (`src/app/haptics.ts`, `navigator.vibrate`: Android browsers, not iOS): in matches the player plays (solo, online), never in replays or the menu demo: a legendary barracks of theirs (a triple pulse), one of their buildings lost, their castle hit (a tick, at most every 0.8 s), the end (a win pattern or one long buzz). Off while paused. Turning the switch on buzzes once.

## Onboarding
The first match starts with a "How to play" card, followed by contextual hints. It always plays on the same map (seed 2, a meadow), so the cards it points at are always the same:
1. Build (tap a card).
2. Barracks.
3. Map events: "Chests and camps go to whoever flips their card first" (8 s).
4. Win condition.

**First-time hints** (`src/app/hints.ts`), after the tutorial, on the same hint pill, each said once ever (Save.hints), one at a time for 6 s with 3 s between, only in solo matches: the waves (the first barracks: troops gather and march out together every 15 s), the mystery card (the first one offered: 25 gold, it may hold nothing, a squad or even a barracks, and it opens the tiles around it), the siege (20 s before it: when it starts; troops then hit buildings harder and more are allowed), the troop cap (the first time the army reaches it: barracks wait for room; the siege raises the cap). They explain rules, never what a face-down card holds.

A pointing hand taps where the current step wants the player: the nearest affordable card to the castle (build), then a
barracks card (barracks), then the nearest map event (events).

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
- **Language:** with Bridge up, the platform's language alone (Playgama rule 3.4.2: never the browser's), English when it names none or one the game lacks. Without Bridge (the web page) the browser's. `?lang=xx` still wins on a test platform (QA tool), to check a translation.
- **Languages (13):** English, Chinese, Russian, Spanish, Portuguese (Brazil), German, French, Turkish, Japanese, Korean, Italian, Polish, Indonesian: one table each in `src/app/lang/`; English fills any key a table lacks. Lilita One has no CJK, no Hangul, no Cyrillic, no ş ğ İ and no ą ć ę ł ń ś ź ż, so zh, ja, ko, ru, tr and pl draw in the system font at a heavy weight (`SYSTEM_FONT` in `i18n.ts`).
- **Storage:** one batched read at boot, then writes are batched to the next tick and flushed on hide, pagehide and the host's pause. It falls back to localStorage when Bridge is absent.
- **Lifecycle:** `game_ready` goes out on the first menu frame. Gameplay start/stop brackets are deduplicated, and a start never goes out before `game_ready`. Level started / completed / failed follow the match.
- **Interstitial `match_end`:** plays between matches, at most one per 2.5 min of actual match play (`adPacing.ts`), with Bridge's own 60 s minimum on top.
  - Watchdogs: 15 s for the ad to open, 300 s for it to close.
  - A given-up ad can't stack with the next one.
  - The game pauses and mutes while the ad is on screen, and also follows the host's pause and sound switches.
- **Rewarded ad `head_start`** (`src/app/headStart.ts`): an offer on the brief of a campaign stage or the daily challenge, only where Bridge says rewarded ads play. The player alone asks for it; the button says it is an ad. Watched through (the `rewarded` state, never a bare close), the next attempt of that stage starts with +60 gold, once; the offer then comes back. A skipped or failed ad gives nothing. Stages are balanced without it. The gold goes into the match config, so its replay plays the same.
- **Leaderboard `campaign_stars`** (numeric, highest first, set in the console): the player's campaign star total, Normal and Hard together (0–252), is set after every stage result that changes it. The menu's Leaderboard button opens a panel with the top rows (rank, the platform's name, stars) and shows only where Bridge runs leaderboards in the game (`leaderboards.type === 'in_game'`). `playgama-bridge-config.json` names it under `leaderboards` and turns Playgama's SaaS boards on for `playgama` and `qa_tool` (public token = the app id). `?lb=fake` fakes a board on localhost.
- **Leaderboard `daily_wins`** (numeric, highest first): the total of daily challenges the player has won (Save.dailyWins), set after each daily win (and both boards again at boot). The board panel has two tabs, Stars and Daily.
- **The Playgama build** (`vite.playgama.config.js`): relative base, entry `src/main.playgama.ts`, the Bridge SDK tag from Playgama's CDN ahead of the entry, and `playgama-bridge-config.json` emitted next to `index.html`. The build fails if the page was never rewritten. `scripts/pack_playgama.py` zips it with `/` paths and no directory entries.
- No other external requests.

## Audio — src/app/audio.ts
Ported from Holy Kicker.
- Closed cue table: priority, gain, minimum gap, pitch variance.
- Per-frame gate: repeats of a cue merge into one louder voice.
- 14-voice cap with priority stealing; compressor on the effects bus.
- Music: two `<audio>` decks with 2 s equal-power crossfades, used both for track changes (lobby, battle, boss) and for the loop. Three tracks, mono 64 kbps MP3 (about 1.6 MB together; the two old ones were 4.4 MB): lobby, battle, boss (boss stages).
- Two switches: the sound button silences the effects, the music button the music; the host's sound switch and a pause (hidden tab, an ad, the host's pause) silence both. The player's pause menu keeps the music on.
- **Mix:** the win and lose stings at gain 0.22 (they were about 11 dB over the game), the legendary sting at 0.35 (about a build's level), melee at 0.5 (about a shot's level; it was about 7 dB under the arrows).
- **Wood sounds** to match the toy look: wood knocks for taps, hits, melee (`melee`, its own cue), building (a plank), spawn (a wooden step), a book placed for the card pop and a heavy wood crack for a building lost; the win, lose and legendary jingles are Kenney's pizzicato versions of the old 8-bit melodies.
- Sources: all CC0 (Kenney, OpenGameArt), see THIRD-PARTY-NOTICES.txt. Rebuild `public/sfx` and `public/music` with `python scripts/import_audio.py`.

## Feel
- Font: Lilita One (OFL), Latin only. Chinese, Japanese, Korean, Russian, Turkish and Polish use the system font.
- **UI skin:** wooden-toy panels and buttons (cream wood with a dark rim, green for the main action, gold for the selected difficulty; never blue, which belongs to the teams), the same logo on the loading screen, SVG icons only (no emoji). Switches are wooden sliders that turn leaf green when on.
- Hit flash is a white overlay.
- Trauma screen shake on building loss.
- Damage numbers on guards, troops and buildings; hits within 0.4 s merge and re-pop.
- Coins fly from mines, map events and quests into the gold pill, which pops as they land and shakes red when the player can't afford something.
- Results reveal one item after another, and the score counts up.

## Dev switches (localhost only)
- `?autoplay`: blue plays itself, no tutorial.
- `?speed=N`: simulation runs N× (max 16).
- `?seed=N`: fixed match seed.
- `?lang=zh`: play in that language (any host; checks a translation): en zh ru es pt de fr tr ja ko it pl id.
- `?upload`: send solo replays to the dev relay (the dev server sends none otherwise).
- A replay file (`.json` from `Hexfront.replay()`, or a relay `.json.gz`) dropped on the page plays it.

## Commands
Run all of these from this folder.
- **Play:** `npm run dev`, then http://localhost:5207.
- **Online locally:** also `npm run relay` (port 8787), then open http://localhost:5207 in two tabs.
- **All checks:** `npm run check` (typecheck, vitest, file length). Tests cover determinism, golden hashes, replay, loopback netcode and the determinism lint.
- **Balance:** `npm run balance` plays 120 seeded AI-vs-AI matches (`N=300 npm run balance` for more; `npm run balance -- 5 12 99` prints a line per seed) and reports match length, sides, comebacks, flips, rarities, how much of the card layout each side found, and how often each kind of luck won.
- **Replays:** `npm run replays` plays the relay's kept matches again and reports how they went.
- **Campaign:** `npm run campaign -- [maps] [chapter] [stage]`, `npm run campaigntune -- <chapter> [maps]` (above).
- **Package:** `npm run build:playgama` writes `../dist/hexfront-playgama.zip`.
