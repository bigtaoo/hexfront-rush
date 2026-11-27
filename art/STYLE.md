# Hexfront art style

Since 2026-11-10 the whole cast (units, buildings, props, map events) is one set of
**hand-carved, hand-painted wooden toys** seen three-quarter from above, and the cleaned-up screen
(src/view/lookB.ts) is the default look (`?looka` brings back the old one). The owner's reason:
players who click, find the first screen cheap and leave, so the opening frame's finish comes first,
and the old mix of flat stickers and a few 3D renders read as clip art from different hands.

## Pipeline (code -> sprites)

Since 2026-11-19 nothing in the cast is painted from a reference image any more. Every piece -
the nine troops, the eight buildings and the twelve props - is **built in code** inside headless
Blender out of the same handful of turned and carved primitives, and rendered with one camera,
one set of lights and one outline, which is what makes the set read as one hand.

1. `tools/art3d/prim.py` holds the primitives (`lathe`, `block`, `ball`, `rod`, `prism`, `fan`,
   `flag`, `windows`) and the palette. A model is a function that calls them and returns the
   height in view units it should be framed to.
2. The models live in four files, each registering `MODELS`, `YAW`, and where it differs from the
   default, `ELEVS` and `TEAMLESS`: `troops.py` (six humanoids) and `beasts.py` (ogre, colossus,
   drake) on the shared `body.py` / `pose.py`; `builds.py` (castle, barracks 1-4, tower, mine,
   rubble); `props.py` (trees, rocks, ice, arch, cactus, chest, hoard, camp, warband, mystery).
   `toys.py` merges the four and holds only the render machinery.
3. Render: `HF_TEAMS=blue,red blender -b -P tools/art3d/toys.py -- <renderdir> <name> [...]`.
   Env overrides: `HF_TEAMS`, `HF_YAW="name=deg"`, `HF_WALK=scissor`, `HF_ELEV`.
4. `python tools/art3d/sprite.py <renderdir> art` trims each frame, scales it to the same opaque
   area as the sprite it replaces, and lays the dark ink outline on: writes `art/<group>/out/*.png`.
5. `python tools/art/pack.py` -> `src/assets/atlas.webp` + `atlas.json`.

The camera elevation is per model, because a prop is read from much further above than a soldier:
`UNIT_ELEV` 18 for troops, 26-36 for buildings, 30-44 for props (`builds.ELEVS`, `props.ELEVS`).

At the troop camera (yaw 34, elevation 18) a world point lands at
`right = 0.829*dx - 0.559*dy`, `up = 0.173*dx + 0.256*dy + 0.951*dz`, depth
`= 0.532*dx + 0.788*dy - 0.309*dz` (smaller is nearer); **-y is towards the camera**. Two
consequences are worth knowing before you measure anything on a render:

* The `0.173*dx` term **lays any bar along world x over at 12 degrees on screen**, and the far
  half of a tilted bar is always shorter. Every straight thing in the scene does it. A symmetric
  pair of arms along x will project 1.2 to 1 and that is correct, not a modelling error.
* A displacement along **-z goes only into `up`**, so it is the one move that cannot break
  left/right screen symmetry. Anything measured back along a tilted shaft goes sideways as well
  as down.

The old painted-reference route (`refs.py` -> `tools/art/generate_image.sh` -> `fromref.py` ->
`paint.py`) and the Tripo route (`tripo.py` -> `paint.py` -> `sprite.py`) are gone from the cast.
They stay in the tree for the UI art, which is still painted (see the UI section below).

### The cast (tools/art3d/builds.py, props.py)

Buildings, blue and red: **base** a walled castle, three cone-roofed towers over an arched gate;
**barracks 1-4** an upgrade chain the player can read at a glance - a one-room hut, a timbered
two-storey house, a crenellated wall fort, a domed palace; **tower** a round watchtower on a
stone plinth; **mine** a faceted rock with the adit cut into it, a lamp, rails and a cart of
nuggets; **rubble** (teamless) broken beams and stone where a building fell.

Props, all teamless: **oak**, **pine**, **snowpine**, **cactus**, **rocks** (a boulder with
splinters at its foot), **ice**, **arch**, and the five map events - **chest**, **hoard**,
**camp** (tent, fire, log), **warband** (three spears and a shield), **mystery** (a ? board).

### What a model has to do to read at 40-60 px

Each of these was learned by rendering the thing and looking at it, not by reasoning:

* One silhouette per piece, and two values in every mass - a single flat colour is a blob.
* The top carries the colour and the detail: at 30-44 degrees of elevation anything put on the
  back or on a lower rear face is simply not there (the oak's dark leaves had to move to the
  front underside before the crown stopped reading as one flat green).
* A box is a crate however much it is tilted. A rock is a five-sided lathe, not a slab.
* A small dark patch on a wall or a curved face is a window, whatever colour it is - that is how
  the arch's moss and the boulder's moss both failed. Moss has to lie flat on a ledge, or go.
* A door, a doorway, an opening has to touch the ground; stopped short it is a window.
* A lid, a hatch, a shutter is only a lid while it touches its hinge. Build it OUTWARD from the
  edge it turns on, never place it at an angle and hope the gap closes: the chest's lid, laid back
  at -0.95 rad from its own centre, left a fifth of a tile of air between its low edge and the rim
  and read as a plank hovering behind the box. Lay it back far enough (0.78 rad) that its inner
  face comes toward the camera at 42 degrees - that face is the whole sentence "the chest is open"
  - and give it its own value: lid, body and trim have to stack light-to-dark up the silhouette or
  the piece is one coloured lump at 34 px.
* A flat turned mound of metal is a puddle of light: a hoard is overlapping nuggets with the
  coins standing in stacks.
* Team colour goes on roofs and merlon caps only, never on walls.
* Thin crossed shapes (two swords, a crossed banner) collapse into a bow tie: use one bold shape.
* `flag(pole_top, ...)` takes the TOP of the pole and `pole_h` runs DOWNWARD - lengthening the
  pole drives it into the ground, it does not raise the flag.
* **Never buy screen symmetry with model asymmetry.** The guard's crossbow had its prod hung off
  a point back down the tilted stock and then slid along x to re-centre it on screen; it projected
  at 1.15 and the two limbs were 0.368 against 0.536 in the model, half as long again. A shape
  that is wrong in three dimensions is wrong in every frame of every cycle, and the player sees it
  at board size. Mirror the model and let the projection tilt whatever it tilts.

Scale on the board (lookB): troops are drawn 1.3x their hit size (LOOKB_UNIT_K); the whole building
cast is drawn at one scale (buildingView.ts BLD_K 0.76) and only the outliers are clipped, so the
models carry the size hierarchy themselves -- the castle is modelled biggest and is drawn biggest.
Do not fit each picture into a box of its own: that is what made the board a wall of same-sized
blocks and, because fitting by total height punishes the one picture that carries a flag, drew the
castle narrower than a one-room hut. The ceiling that matters is height, not width: rows are 1.5
apart, so a picture taller than 1.45 view units reaches the offer card standing one row up
(BLD_H, held by buildingView.test.ts). The castle alone goes above it, and only with its flag.

## Motion (src/view/unitView.ts, sprites.ts, buildingView.ts)

A carved piece never deforms. Nothing squashes or stretches: the old volume-preserving squash
(`sx = 2 - sy`) read as a sheet of paper being crumpled, so every transform is now a rigid move or
a tip about the foot the piece stands on. The troops themselves walk, strike and turn in **rendered
frames** baked offline (ANIMATION.md: 9 troops x 2 teams x 16 frames = still + 6 walk + 4 attack +
2 turn + 3 fall), so the knees a transform could not give them are drawn. The castle guard is one of
those models and plays the same frames. Everything else stays a transform:
- walking: the drawn 6-frame cycle, with the piece hopping and leaning onto the foot it lands on
  (the castle guard too); a slight sway while standing; the drake hovers and bobs;
- turning: five full-width steps (side -> half -> front -> half -> side) from the `_t0`/`_t1`
  frames plus the mirror, never a narrowing of the picture;
- trained: it drops onto the board from about a tile up, fading in, and sinks into the board as it
  lands (0.42 s);
- attack: the drawn 4-frame swing, played out in seconds (not in sim ticks, so it is smooth at any
  frame rate); a shooter (anything with a missile) rocks back on its heels instead;
- hit: a white flash, and it leans back and gives ground;
- death: the drawn 3-frame topple - it stands for an instant, then goes over backwards on its heels
  as the carved whole it is (the picture itself never rotates), fades and sinks out of sight, base
  and shadow with it (0.5 s, DEATH_S); off screen it simply goes;
- buildings rise into place when built, flash when hit, shake the screen and leave rubble when
  they fall; map events bob;
- the cast shadow tightens and fades with height, so a piece that leaves the board is seen to.
All of it is view-only (no sim state), so replays and online play are untouched.

## The old sticker set (until 2026-11-10)

The first art was generated the Holy Kicker way (D:\standing, docs/reskin.md): a prompt per sheet
in `art/<group>/*.txt`, `tools/art/generate_image.sh`, `tools/art/split_sheet.py` to cut the sheet
and `tools/art/sticker_pass.py` for one hand: bright cartoon stickers with thick dark outlines,
flat colours and one hard cel shadow, one sheet per family. The rules still in force from it:
- readable at very small size (a troop is about 40 px on a phone);
- units face right (the game mirrors them); buildings and props have a one-hexagon footprint and
  no ground under them;
- royal blue on cloth, roofs and flags only, so the red side is a hue move of exactly those pixels.

## Processing of the old set (tools/art/sprites.py)

`python tools/art/sprites.py [units|buildings|props]` turns `art/<group>/cut/*.png` into
`art/<group>/out/`: holes punched (HOLES: white background shut inside an outline, such as a
bow's string or the arch's opening, which the sheet cut cannot reach; real white such as snow and
steel highlights is not listed), sticker pass, shrunk to TEX_K x the height in TARGET (CSS px),
then `<name>_blue.png` + `<name>_red.png` (team_recolor.py), or `<name>.png` for teamless props.
The gold mine carries a small team pennant on its hill, like the castle's flag.

The mine's flag and the rubble were redone by editing the sheet rather than generating a new one
(`tools/art/edit_image.sh art/buildings/sheet1.png sheet2.png edit2.txt`, then `edit3.txt` on
sheet2 for the rubble alone), so they keep the sheet's hand; `cut/mine.png` and `cut/rubble.png`
come from `sheet3.png`, the rest from `sheet1.png`. The rubble is a low warm pile (beige stone,
brown planks): a ruin should read as "something stood here", not as a dark hole in the map.

## Sharpness (TEX_K, PPU, mipmaps)

A sprite holds TEX_K = 3 texture pixels per CSS pixel (tools/art3d/sprite.py, tools/art/sprites.py;
src/view/art.ts PPU = 38 x 3 = 114), so a 3x phone draws it 1:1 and a 2x screen shrinks it a
little. At TEX_K = 2 a 3x phone stretched every sprite by 1.5 and the cast looked soft. The atlas
samples its mip levels with `mipmapFilter = 'nearest'`: trilinear blending mixed in the half-size
level under slight minification, which blurred the sprites as much as the stretch had.
`sprite.py --from-k 2` rescales the area it matches when it rebuilds sprites made at the old density.

## Ground and colour (src/view/ground.ts)

- Blue and red belong to the teams alone. Snow is a warm ivory, not blue-white and not grey either.
  The old sticker set's ice crystals were bright blue and drew as rocks; the wooden-toy crystals are
  pale grey-green (hue about 155°, saturation about 0.2) beside the team's saturated royal blue, so
  ice draws as ice -- and on a warm board they are the one cool thing on it, which is what makes
  them read as ice at all. Nothing on the ground, water included, comes within 45° of the team's
  periwinkle (src/view/skins.test.ts).
- Every ground tile carries a hue; none of them is a grey. Measured against art/ref/screen_gen_b.png,
  whose board averages saturation 0.55 and is 96% coloured, the first cut of the skins averaged 0.25
  and was half grey: the snow themes sat at 0.02-0.09, i.e. concrete, and the desert themes at about
  half the reference's sand. The whole board then read as a backdrop, with the cream card plaques --
  at 0.33 the most saturated thing on screen -- as the only colour on it. The floors now: desert and
  meadow 0.30-0.49, the reference's own range; snow 0.12-0.22, bright but unmistakably warm, its
  four skins fanning from rosy ivory through gold and olive to green. A rendered battle measures
  0.34-0.40 against the reference's 0.55 -- the gap is the cast, which is painted wood, not poster
  colour -- but value (0.65), warm share (68%) and coloured share (87-90%) now match it.
  The ponds and the crystals are the cool accents; the board is not.
- A tile top carries a faint wood grain and paint speckle (src/view/grain.ts: light and dark
  strokes over its own colour, three variants turned 0/60/120 degrees, picked per tile), and its
  bevel lines are drawn a little stronger: flat vector fills read as plastic next to the painted
  wooden toys.
- Tiles touch with a faint inner line, not a gap: a gap around every tile drew a heavy honeycomb
  over the whole map. The tile side shows only along the map's rim.
- Only what stands is drawn in full colour. An offer is a flat white symbol with a thick dark rim,
  stamped on its tile (src/view/offers.ts): a helmet for a barracks (one pip per price tier), a
  turret for a tower, a pickaxe for a mine, a question mark for a mystery. Its price sits under
  it in large type, white when affordable and red when not; the symbol is never faded (a faded
  one could not be read). A full-colour building picture on a card read as one more building
  next to the real ones, and thin crossed swords read as a dark scribble at play zoom.
- A team's land is mid-tone, the same on every theme, with its border line in the full hue: a
  full-strength fill swallowed the blue roofs, a pale pastel left the white symbols nothing to
  stand out against, and mixing the hue into the ground turned blue on sand grey. Between those
  two, the wash is held high and light -- saturation 0.42-0.44 at value 0.90, not the 0.24-0.31 it
  was first set to, which was half of what the reference gives its territories and stopped reading
  as that team's land at all. Value, not paleness, is what keeps the roofs and the troops on top of
  it: the field stays lighter than anything standing on it. Play zoom
  shows about 8.5 hexes across (viewConst.ts): at 11 the symbols were too small to tell apart.
- A building is drawn inside its own tile (buildingView.ts, bldScale); one that spilled onto its
  neighbours covered their cards. Height is the binding one: see "Scale on the board" above.
- (old look) A built tile is ringed by a low stone wall; lookB paves one yard under the group instead (buildingView.ts, WallLayer), and the shared edge of
  two built tiles has none, so a group of buildings reads as one walled compound.
- Numbers (prices, gold, counts, the clock, damage, gold taken) are pictures, not live text
  (`python tools/art/digits.py` -> src/assets/digits.png, drawn by src/view/digits.ts): Lilita One
  as a sticker, a white face with a hard cel shadow on its lower part, a thick dark outline and a
  drop shadow. A tint colours the face (gold, red when unaffordable) and leaves the outline dark.
  Five heights; a number takes the smallest at least as tall as it is on screen, with no mipmaps,
  so it is never drawn from a blurred mip level. Words stay Lilita One text.
- Sharpness: the canvas is drawn at no less than 2 device pixels per CSS pixel (quality.ts
  canvasDensity; a 1x desktop is supersampled), a battle at up to 3 on a 3x phone (iOS 2), and
  the atlas is packed at webp q96 (lossless tripled it). Drawn at 1, the board's sprites came from
  their textures' half-size mip level and everything looked soft.
- A castle, mine or barracks carries a dark round badge at its foot: a coin for the castle and a
  mine, the portrait of the troop it trains for a barracks. A progress ring around the badge
  shows the next payout or troop: yellow for coin, the rarity colour on a barracks, grey once
  the barracks is full.

## Interface art (art/ui/, public/ui/)
The page chrome is carved wood, the same toy box as the board, so the menus, the pop-ups and
the in-match HUD read as one set:
- HUD (src/view/hud.ts): every dark groove (the tug bar, the gold pill, the quest box) sits in a
  wooden bezel (`bezel()`: rim drop, oak face, lit top band; UI.slot is the groove's walnut
  fill), and the two avatars are painted team discs in a wooden ring (`token()`), matching the
  DOM's wooden buttons beside them. No flat dark plates on the board.
  The overview button (edges.ts) is a raised wooden button with a walnut magnifier, like the
  page's pause and sound buttons; the shared wood lives in viewConst.ts WOOD. The quest box keeps
  a gap from the gold pill counted outside both frames (on a 360 px phone they had touched).
- Page details from the 2026-11-15 review: the win/loss record sits on a walnut plaque (white
  text straight on a pale board could not be read); tabs and the quality picker are solid wood
  (a see-through tab looked disabled); scroll bars on cream cards are a thin walnut groove, not
  the system grey, and a scrolled list fades out over 30 px; an unearned star is a walnut hollow
  at 50 %; on a phone the difficulty, medal and gear buttons keep to one line.
- Later the same day, from screenshots of every screen on a 360x740 phone, a 760x400 landscape
  phone and an 800x600 desktop, in Chinese and English:
  - A phone's scroll bar floats over the content and takes no width, so a scrolling box (the
    how-to, the achievement grid) keeps 10 px of right padding.
  - The Join button keeps no minimum width: it had pushed the code row out of a phone's card.
  - The landscape settings card keeps a 6 px gap and 38 px rows: it had run 18 px past its card.
  - A stage tile's padlock and number stay on one line (`nowrap`, 16 px under 380 px wide), and
    a chapter title wraps balanced, not one character on its own line.
  - Banners stack: each one moves below the card pop-up and the banners already shown, and stays
    inside the play area. On a short landscape screen the card pop-up sits in the top left
    corner, out of the banners' way.
- Logo: `public/ui/logo.webp`, an AI-painted "HEXFRONT RUSH" in carved wooden block letters
  (ivory HEXFRONT, tomato RUSH, walnut outline), on the menu and the loading screen. The text
  logo it replaces could not carry the material.
- Icons: `public/ui/icons/*.webp` (medal, gear, and the how-to's cards, pickaxe, magnifier,
  castle, chest), each a small carved toy piece at 128 px at most, in place of flat line SVGs.
  Prompt: the object, then the shared style paragraph in `art/ui/src/medal.txt` (hand-carved,
  hand-painted wooden toy piece, walnut outline, reads at 32 px, plain white background).
  Achievements grey a locked medal with a CSS filter, so one image serves both.
- Making one: `art/ui/src/<name>.txt` is the prompt, `<name>.png` the chosen take
  (tools/art/generate_image.sh); `python tools/art/cut_ui.py art/ui/src/<name>.png
  public/ui/icons/<name>.webp 128` cuts the white away (the logo: max side 779). Look at the
  cut on the cream card and on the dark menu: a white hole the cut missed shows there.
- How to play opens with `public/ui/howto_start.webp`, a real frame of a quick match's
  opening (the castle, its guard and its first six priced cards), cropped from the canvas at
  495x360. It shows what the first rule describes; re-take it when the offers or tiles change.
  Hidden in the short landscape layout, where the rules go to two columns.
- Canvas interface art goes in the atlas, not in public/ui: the tutorial hand is
  `art/ui/src/hand.png` cut to `art/ui/out/hand.png`, which `pack.py` packs from its "ui" group as
  the frame `hand` (view/overlays.ts reads it with `tex('hand')`). A frame of the atlas the game
  already awaits costs no second request and cannot arrive late; `public/ui/` stays the route for
  anything an `<img>` shows. Such a piece is also drawn around 60 px tall on a phone, so the prompt
  asks for a bold even outline, almost no interior detail and "readable at 48 pixels": a handsome
  rendered hand with 6 px fingers is mush at that size.
- An icon button's picture is decoration (`alt=""`); the button's own name is its `aria-label`,
  which index.html holds in English and `data-ta="<key>"` replaces from the player's language
  (dom.ts applyTexts). A new icon button needs both, and its key in every lang/ table.

## Store covers (art/covers/)
- Three covers for the Playgama form, uploaded 2026-11-10: `cover_landscape.jpg` 1920×1080,
  `cover_square.jpg` 800×800, `cover_portrait.jpg` 1080×1920 (JPEG q92).
- Composed in `cover.html` (layout by URL hash: #landscape, #square, #portrait), shot with headless
  Chrome at the exact size: the menu logo (Lilita One, cream face with stacked wood-brown shadows,
  RUSH in red) over a blurred, vignetted meadow board, blue pieces on the left or bottom, red
  pieces facing them. The meadow background is the clean grass band of stage 1's board, repeated
  and mirrored; the HUD never appears. Sprites are the game's own wooden-toy renders with the grey
  base plates keyed out. The background and sprite copies (bg.png, sp/) lived in a scratch folder
  and are not kept: rebuild them from the game if a cover needs changing.
- No face-down card or its contents appear on a cover.
