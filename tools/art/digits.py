"""Draws the game's number glyphs: src/assets/digits.webp + digits.json (Pixi spritesheet format).
usage: python tools/art/digits.py

Numbers on the board and the HUD are pictures, not live text: a live Text drawn at 10-20 px and
scaled with the board came out soft. Each glyph is Lilita One (public/fonts, OFL) in the art's
sticker style (art/STYLE.md): a white face with one hard cel shadow on its lower part, a thick dark
outline and a dark drop shadow under it. The face is white so a sprite tint colours it (gold, red,
green) while the outline stays dark.

Twenty-four sizes (SIZES, glyph heights in texture pixels), each at most 1.149x the one under it; the
view picks the smallest one at least as tall as the number on screen, so a glyph is never shrunk
past 0.87 anywhere the game draws a number - from a price on the fully zoomed-out board (about 8
device pixels) to a damage number on a 3x phone - and the texture needs no mipmaps (a mip level blended in would soften the 2 px outline
this style lives on). Frames are named d<size>_<char name>, the char names are in CHARS.

SIZES and, per size, where the middle of the digit sits and how far neighbours overlap are written
into digits.json's meta: the view reads them from there (src/view/digits.ts) instead of keeping its
own copy, so the proportions below and the layout constants can never drift apart.
"""
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
FONT = ROOT / "public" / "fonts" / "LilitaOne-Regular.ttf"
SIZES = (8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 25, 28, 32, 36, 41, 47, 54, 62, 71, 81, 93, 106, 120)
CHARS = {"0": "0", "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8",
         "9": "9", "+": "plus", "-": "minus", ":": "colon", "/": "slash", "%": "pct", "x": "x"}
# How a glyph's full height h is spent: the outline above and below the digit's face, the drop
# shadow under that, and the face itself. The face used to be 0.7 of the height with the rest left
# over, which drew the digit small for the room it took on screen; now it takes 0.8, which is all
# that is left once the outline and the shadow have theirs. Under about 25 px the outline cannot
# go under 2 px and the shadow under 1 without falling apart, so the face gives way instead, and
# those sizes draw a slightly smaller, heavier-rimmed digit - which is what keeps a tiny number
# on a zoomed-out board readable.
CAP = 0.80
OUTLINE = 0.075
SHADOW = 0.05


def parts(h: int) -> tuple[int, int, float]:
    """The outline width, the drop shadow's drop and the cap height of a glyph h pixels tall."""
    ow = max(2, int(h * OUTLINE))
    sh = max(1, int(h * SHADOW))
    return ow, sh, min(h * CAP, h - 2 * ow - sh)
INK = (36, 26, 18, 255)
FACE = (255, 255, 255, 255)
CEL = (214, 220, 230, 255)
WIDTH = 1024
PAD = 2


def glyph(ch: str, h: int) -> Image.Image:
    """One glyph whose full height (outline and drop shadow included) is h pixels."""
    ow, sh, cap = parts(h)
    font = ImageFont.truetype(str(FONT), 400)
    x0, y0, x1, y1 = font.getbbox("0")
    font = ImageFont.truetype(str(FONT), round(400 * cap / (y1 - y0)))
    x0, y0, x1, y1 = font.getbbox("0")
    top = -y0 + ow
    bx0, _, bx1, _ = font.getbbox(ch)
    w = (bx1 - bx0) + ow * 2 + 2
    size = (w, h)
    org = (ow - bx0 + 1, top)

    def mask(stroke: int) -> Image.Image:
        m = Image.new("L", size, 0)
        ImageDraw.Draw(m).text(org, ch, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
        return m

    face = mask(0)
    outer = mask(ow)
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    # drop shadow: the outline's shape, moved down
    shadow = Image.new("L", size, 0)
    shadow.paste(outer, (0, sh))
    out.paste(Image.new("RGBA", size, INK), (0, 0), shadow)
    out.paste(Image.new("RGBA", size, INK), (0, 0), outer)
    out.paste(Image.new("RGBA", size, FACE), (0, 0), face)
    # the cel shadow: the face's lower part, cut level a little under the middle of a digit
    cut = Image.new("L", size, 0)
    ImageDraw.Draw(cut).rectangle((0, round(top + cap * 0.58), w, h), fill=255)
    out.paste(Image.new("RGBA", size, CEL), (0, 0), ImageChops.multiply(face, cut))
    return out


def main() -> None:
    items = [(f"d{h}_{name}", glyph(ch, h)) for h in SIZES for ch, name in CHARS.items()]
    items.sort(key=lambda t: -t[1].height)
    x = y = shelf = 0
    place = {}
    for name, im in items:
        w, hh = im.width + PAD * 2, im.height + PAD * 2
        if x + w > WIDTH:
            x, y, shelf = 0, y + shelf, 0
        place[name] = (x + PAD, y + PAD)
        x += w
        shelf = max(shelf, hh)
    height = y + shelf
    sheet = Image.new("RGBA", (WIDTH, height), (0, 0, 0, 0))
    frames = {}
    for name, im in items:
        px, py = place[name]
        sheet.paste(im, (px, py))
        frames[name] = {"frame": {"x": px, "y": py, "w": im.width, "h": im.height}, "rotated": False,
                        "trimmed": False, "spriteSourceSize": {"x": 0, "y": 0, "w": im.width, "h": im.height},
                        "sourceSize": {"w": im.width, "h": im.height}}
    out = ROOT / "src" / "assets"
    # lossless webp: the same pixels as a png, about 40% of the bytes (the art atlas is webp too)
    sheet.save(out / "digits.webp", lossless=True, quality=100, method=6)
    # the view's layout numbers, one per size, read straight off the proportions used above so the
    # two cannot drift: mids = the middle of a digit's face as a share of the glyph height (where a
    # number is anchored), overlaps = how much of a glyph's height its neighbour covers, so the two
    # outlines merge into one rim instead of leaving a double-thick seam.
    mids, overlaps = [], []
    for h in SIZES:
        ow, _, cap = parts(h)
        mids.append(round((ow + cap / 2) / h, 4))
        overlaps.append(round(ow / h, 4))
    meta = {"frames": frames, "meta": {"image": "digits.webp", "format": "RGBA8888",
                                       "size": {"w": WIDTH, "h": height}, "scale": "1",
                                       "sizes": list(SIZES), "mids": mids, "overlaps": overlaps}}
    (out / "digits.json").write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")
    kb = (out / "digits.webp").stat().st_size // 1024
    print(f"{len(items)} glyphs, {WIDTH}x{height}, digits.webp {kb} KB")


if __name__ == "__main__":
    main()
