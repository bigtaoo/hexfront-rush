# Hexfront art style

Since 2026-11-10 the whole cast (units, buildings, props, map events) is one set of
**hand-carved, hand-painted wooden toys** seen three-quarter from above, and the cleaned-up screen
(src/view/lookB.ts) is the default look (`?looka` brings back the old one). The owner's reason:
players who click, find the first screen cheap and leave, so the opening frame's finish comes first,
and the old mix of flat stickers and a few 3D renders read as clip art from different hands.

## Pipeline (refs -> sprites)

1. `python tools/art3d/refs.py [name ...]` writes `art/tripo/ref/<name>.txt`: one subject line plus
   the shared style line (TOY: chunky carved forms, matte enamel paint, visible grain, worn edges,
   warm earthy colours, simple silhouette) and composition line (single object, three-quarter
   from above, forty degrees for buildings and props, even studio light, no shadow or ground,
   pure white background). Royal blue is the team colour and appears only where the subject
   line says; props have no blue at all.
2. `MISTRAL_KEY=... bash tools/art/generate_image.sh art/tripo/ref/<name>.png art/tripo/ref/<name>.txt`
   (1184x896).
3. `python tools/art3d/fromref.py art/tripo/render_ref` cuts each ref from its white (enclosed white
   pockets too, except for snow and ice), un-blends the rim from the paper white, relights it like
   the board (lit upper left, ground side darker, foot in shade) and writes `_blue` + `_red`
   (team_recolor.py) or the teamless picture.
4. `python tools/art3d/paint.py art/tripo/render_ref art/tripo/render_ref_paint 3`, then
   `python tools/art3d/sprite.py art/tripo/render_ref_paint art/tripo/sprites_ref`: painterly pass,
   a 4 px dark outline, sized to the same opaque area as the sprite it replaces.
5. Copy `art/tripo/sprites_ref/<group>/out/*.png` to `art/<group>/out/`, then `python tools/art/pack.py`
   (src/assets/atlas.webp/.json).

The 3D route (tools/art3d/tripo.py -> paint.py -> sprite.py, renders of Tripo models) is kept, but
the painted ref reads cleaner at 50 px than the render, and Tripo's free plan exports only three
models (guard, ogre, mine, all spent). A new subject goes through steps 1-5.

Scale on the board (lookB): troops are drawn 1.3x their hit size (LOOKB_UNIT_K); a building fills
most of its tile (buildingView.ts BLD_W 1.45 / BLD_H 1.75 view units, a tile is 1.73 wide), so the
castle never reads smaller than the soldiers standing next to it.

## Motion (src/view/unitView.ts, sprites.ts, buildingView.ts)

The pictures are single still frames; every movement is a transform of the whole picture, the way a
painted wooden piece moves on a board. That suits the toy look better than frame animation would
(a carved piece has no knees), keeps the atlas at one frame per subject, and needs no rig or model:
- walking: a hop per stride with squash and stretch, rocking about 6° onto the foot it lands on
  (the castle guard too); a slow breath while standing; the drake hovers and bobs;
- trained: it drops onto the board from about a tile up, fading in, and squashes as it lands (0.42 s);
- attack: a melee troop lunges and leans into the blow; a shooter (anything with a missile) rocks
  back on its heels instead;
- hit: a white flash and a quick squash;
- death: it tips over backwards on its feet, sinks out of sight and fades, base and shadow with it
  (0.5 s, DEATH_S); off screen it simply goes;
- buildings pop up with a squash when built, flash when hit, shake the screen and leave rubble when
  they fall; map events bob.
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

## Ground and colour (src/view/ground.ts)

- Blue and red belong to the teams alone. Snow is a warm grey, not blue-white. The old sticker set's
  ice crystals were bright blue and drew as rocks; the wooden-toy crystals are pale grey-green
  (hue about 155°, saturation about 0.2) beside the team's saturated royal blue, so ice draws as ice.
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
  stand out against, and mixing the hue into the ground turned blue on sand grey. Play zoom
  shows about 8.5 hexes across (viewConst.ts): at 11 the symbols were too small to tell apart.
- A building is drawn inside its own tile (buildingView.ts, BLD_W/BLD_H); one that spilled onto its
  neighbours covered their cards.
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
