"""Packs every processed sprite (art/<group>/out/*.png) into one atlas the game loads:
src/assets/atlas.webp and src/assets/atlas.json (Pixi spritesheet format; frame names are the
file stems: militia_blue, base_red, oak, ...).
usage: python tools/art/pack.py [--quality 90]
Shelf packing, tallest first, PAD transparent pixels around each frame so linear filtering and
mipmaps at the overview zoom do not bleed a neighbour in. Every frame goes in trimmed to its
opaque pixels and carries the canvas it was cut from (`trimmed` / `spriteSourceSize` /
`sourceSize`), which Pixi puts back: a cycle shares one canvas so the piece neither slides nor
resizes between frames (tools/art3d/sprite.py), and the empty margin that buys - the fallen
troop's canvas is twice as wide as the one it stands in - costs no atlas pixels. A texture pixel is 1 / PPU view units
(sprites.py TEX_K x the 38 px hex radius its TARGET heights are drawn against); the view reads
sizes straight from the frame heights."""
import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
# "ui" is the interface art drawn on the canvas rather than in the DOM (the tutorial hand):
# it rides the atlas so it needs no second request and no loading race, while art/ui/src ->
# public/ui/icons stays the route for anything an <img> shows (art/STYLE.md).
GROUPS = ("units", "buildings", "props", "ui")
# The sheet is one texture, and a GL ES 3.0 phone is only promised 4096 px on a side - plenty of
# low-end Android reports exactly that, and a sheet over the cap cannot be uploaded at all (a blank
# game, not a slow one). So BOTH sides must stay inside 4096, and the only lever is the width: the
# frames stack 5128 px high at 2048, and 4152 px - just over - at 3072 now that the troops carry two
# idle frames each (352 frames). 4096 wide lays the same frames out well inside the cap on both
# sides. Non-power-of-two is fine: Pixi 8 is WebGL2 / WebGPU only.
# Check the printed size after every pack: a frame added at the wrong moment pushes it over again.
WIDTH = 4096
PAD = 4


def pack(quality: int) -> None:
    items = []
    for g in GROUPS:
        for p in sorted((ROOT / "art" / g / "out").glob("*.png")):
            im = Image.open(p).convert("RGBA")
            box = im.getchannel("A").getbbox() or (0, 0, im.width, im.height)
            items.append((p.stem, im.crop(box), box, im.size))
    items.sort(key=lambda t: (-t[1].height, t[0]))
    x = y = shelf = 0
    place = {}
    for name, im, _box, _src in items:
        w, h = im.width + PAD * 2, im.height + PAD * 2
        if x + w > WIDTH:
            x, y, shelf = 0, y + shelf, 0
        place[name] = (x + PAD, y + PAD)
        x += w
        shelf = max(shelf, h)
    height = y + shelf
    # The height is rounded to a multiple of four, not to a power of two. Pixi 8 is WebGL2 (and
    # WebGPU) only, where mipmaps work on any size; with the cast animated the sheet runs past
    # 4096 rows, and the old power-of-two rule would have paid for 8192 - half of it empty, and
    # ~85 MB of texture memory on a phone instead of ~47.
    ph = (height + 3) // 4 * 4
    sheet = Image.new("RGBA", (WIDTH, ph), (0, 0, 0, 0))
    frames = {}
    for name, im, box, src in items:
        px, py = place[name]
        sheet.paste(im, (px, py))
        frames[name] = {
            "frame": {"x": px, "y": py, "w": im.width, "h": im.height},
            "rotated": False,
            "trimmed": (im.width, im.height) != src,
            "spriteSourceSize": {"x": box[0], "y": box[1], "w": im.width, "h": im.height},
            "sourceSize": {"w": src[0], "h": src[1]},
        }
    out = ROOT / "src" / "assets"
    out.mkdir(exist_ok=True)
    sheet.save(out / "atlas.webp", "WEBP", quality=quality, method=6, alpha_quality=100)
    meta = {"frames": frames, "meta": {"image": "atlas.webp", "format": "RGBA8888",
                                       "size": {"w": WIDTH, "h": ph}, "scale": "1"}}
    (out / "atlas.json").write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")
    kb = (out / "atlas.webp").stat().st_size // 1024
    print(f"{len(items)} frames, {WIDTH}x{ph} (used {height}), atlas.webp {kb} KB")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    # 90, not 96: swept over the whole sheet, 96 -> 90 costs 0.2/255 of mean error at the size a
    # troop is actually drawn (a third of the texture on a 1x screen) and saves a quarter of the
    # file - 2225 KB -> 1632 KB, which is how the topple's 54 extra frames fit under what the
    # atlas weighed before them. Alpha stays lossless (alpha_quality 100).
    ap.add_argument("--quality", type=int, default=90)
    pack(ap.parse_args().quality)
