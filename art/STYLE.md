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
