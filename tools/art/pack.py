"""Packs every processed sprite (art/<group>/out/*.png) into one atlas the game loads:
src/assets/atlas.webp and src/assets/atlas.json (Pixi spritesheet format; frame names are the
file stems: militia_blue, base_red, oak, ...).
usage: python tools/art/pack.py [--quality 96]
Shelf packing, tallest first, PAD transparent pixels around each frame so linear filtering and
mipmaps at the overview zoom do not bleed a neighbour in. A texture pixel is 1 / PPU view units
(sprites.py TEX_K x the 38 px hex radius its TARGET heights are drawn against); the view reads
sizes straight from the frame heights."""
import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
GROUPS = ("units", "buildings", "props")
WIDTH = 2048
PAD = 4


def pack(quality: int) -> None:
    items = []
    for g in GROUPS:
        for p in sorted((ROOT / "art" / g / "out").glob("*.png")):
            items.append((p.stem, Image.open(p).convert("RGBA")))
    items.sort(key=lambda t: (-t[1].height, t[0]))
    x = y = shelf = 0
    place = {}
    for name, im in items:
        w, h = im.width + PAD * 2, im.height + PAD * 2
        if x + w > WIDTH:
            x, y, shelf = 0, y + shelf, 0
        place[name] = (x + PAD, y + PAD)
        x += w
        shelf = max(shelf, h)
    height = y + shelf
    # power of two keeps mipmaps available on WebGL1
    ph = 1
    while ph < height:
        ph *= 2
    sheet = Image.new("RGBA", (WIDTH, ph), (0, 0, 0, 0))
    frames = {}
    for name, im in items:
        px, py = place[name]
        sheet.paste(im, (px, py))
        frames[name] = {
            "frame": {"x": px, "y": py, "w": im.width, "h": im.height},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": im.width, "h": im.height},
            "sourceSize": {"w": im.width, "h": im.height},
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
    ap.add_argument("--quality", type=int, default=96)
    pack(ap.parse_args().quality)
