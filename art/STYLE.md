# Hexfront art style

Generated the Holy Kicker way (D:\standing, docs/reskin.md): a prompt per sheet in `art/<group>/*.txt`,
`tools/art/generate_image.sh <out.png> <prompt.txt>` (Mistral's image agent), then
`tools/art/split_sheet.py` cuts the sheet into one picture per object and
`tools/art/sticker_pass.py` makes them look drawn by one hand.

Rules (every prompt repeats them):
- bright cheerful cartoon sticker style: thick dark outlines, flat colours, one hard cel shadow;
- chunky chibi / toy proportions, readable at very small size (a troop is about 40 px on a phone);
- units: three-quarter front view facing right (the game mirrors them); buildings and props: high
  three-quarter top-down view, footprint of one hexagon, no ground under them;
- team colour: drawn in royal blue on cloth, roofs, flags only, with no other blue anywhere, so the
  red side is a hue move of exactly those pixels;
- one sheet per family (all units on one sheet, all buildings on one sheet), so they share a hand;
  plain white background, objects well apart, no text.

## Processing (tools/art/sprites.py)

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

- Blue and red belong to the teams alone. Snow is a warm grey, not blue-white, and the snow
  theme's blue ice crystals are drawn as rocks.
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
- A building is drawn inside its own tile (sprites.ts, BLD_W/BLD_H); one that spilled onto its
  neighbours covered their cards.
- A built tile is ringed by a low stone wall (sprites.ts, WallLayer), and the shared edge of
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
