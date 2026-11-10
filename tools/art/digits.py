"""Draws the game's number glyphs: src/assets/digits.png + digits.json (Pixi spritesheet format).
usage: python tools/art/digits.py

Numbers on the board and the HUD are pictures, not live text: a live Text drawn at 10-20 px and
scaled with the board came out soft. Each glyph is Lilita One (public/fonts, OFL) in the art's
sticker style (art/STYLE.md): a white face with one hard cel shadow on its lower part, a thick dark
outline and a dark drop shadow under it. The face is white so a sprite tint colours it (gold, red,
green) while the outline stays dark.

Five sizes (SIZES, glyph heights in texture pixels); the view picks the smallest one at least as
tall as the number on screen (never shrunk more than 1.43x) and the texture has no mipmaps, so a number is never drawn from a
blurred mip level. Frames are named d<size>_<char name>, the char names are in CHARS.
"""
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
FONT = ROOT / "public" / "fonts" / "LilitaOne-Regular.ttf"
SIZES = (28, 40, 56, 80, 112)
CHARS = {"0": "0", "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8",
         "9": "9", "+": "plus", "-": "minus", ":": "colon", "/": "slash", "%": "pct", "x": "x"}
INK = (36, 26, 18, 255)
FACE = (255, 255, 255, 255)
CEL = (214, 220, 230, 255)
WIDTH = 1024
PAD = 2


def glyph(ch: str, h: int) -> Image.Image:
    """One glyph whose full height (outline and drop shadow included) is h pixels."""
    # the digit's cap height is ~70% of the full glyph: outline 9% above and below, shadow 6%
    cap = h * 0.7
    font = ImageFont.truetype(str(FONT), 400)
    x0, y0, x1, y1 = font.getbbox("0")
    font = ImageFont.truetype(str(FONT), round(400 * cap / (y1 - y0)))
    ow = max(2, round(h * 0.09))
    sh = max(1, round(h * 0.06))
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
    sheet.save(out / "digits.png", optimize=True)
    meta = {"frames": frames, "meta": {"image": "digits.png", "format": "RGBA8888",
                                       "size": {"w": WIDTH, "h": height}, "scale": "1"}}
    (out / "digits.json").write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")
    kb = (out / "digits.png").stat().st_size // 1024
    print(f"{len(items)} glyphs, {WIDTH}x{height}, digits.png {kb} KB")


if __name__ == "__main__":
    main()
