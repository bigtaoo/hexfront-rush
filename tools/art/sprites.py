"""Sticker pass + team recolour for the cut sprites, then shrinks them to game size.
usage: python tools/art/sprites.py
For every entry in TARGET: art/<group>/cut/<name>.png → art/<group>/out/<name>_blue.png and
<name>_red.png (team colour moved, art/STYLE.md), at TEX_K texture pixels per drawn pixel.
Target heights are the drawn size on a phone, in CSS pixels at the default zoom."""
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from sticker_pass import sticker  # noqa: E402
from team_recolor import recolor  # noqa: E402

TEX_K = 2  # texture pixels per CSS pixel (phones are 2-3x)
TARGET = {
    "units": {"militia": 48, "slinger": 42, "shield": 48, "bowman": 46, "ogre": 72, "adept": 50,
              "colossus": 76, "drake": 58, "guard": 52},
    "buildings": {"base": 84, "mine": 72, "tower": 86, "barracks1": 64, "barracks2": 68,
                  "barracks3": 70, "barracks4": 78, "rubble": 42},
    "props": {"oak": 58, "pine": 60, "rocks": 40, "cactus": 52, "ice": 50, "snowpine": 58,
              "arch": 50, "chest": 34, "hoard": 40, "camp": 46, "warband": 52, "mystery": 46},
}
# no team colour: one picture, <name>.png
TEAMLESS = {"rubble", "oak", "pine", "rocks", "cactus", "ice", "snowpine", "arch", "chest", "hoard",
            "camp", "warband", "mystery"}

# White background shut inside an outline (a bow's string, the arch's opening) survives the
# sheet cut, which only clears white joined to the border. Seeds, as fractions of the cut
# picture, of the white regions that are holes; white that belongs to the drawing (snow, steel
# highlights) is simply not listed.
HOLES = {
    "arch": [(0.48, 0.56)],
    "bowman": [(0.65, 0.27), (0.64, 0.61)],
    "guard": [(0.21, 0.73)],
    "militia": [(0.32, 0.61), (0.36, 0.84)],
    "ogre": [(0.31, 0.31), (0.79, 0.64)],
    "slinger": [(0.22, 0.09), (0.37, 0.2)],
    "adept": [(0.31, 0.1), (0.46, 0.72)],
    "warband": [(0.56, 0.29), (0.61, 0.3), (0.67, 0.3)],
    "camp": [(0.86, 0.59)],
}


def punch(src: Image.Image, seeds) -> Image.Image:
    """Clears the near-white regions holding each seed, plus their 2px anti-aliased rim."""
    a = np.array(src)
    rgb = a[..., :3].astype(int)
    white = (rgb.min(-1) >= 238) & (a[..., 3] > 0)
    lab, _ = ndimage.label(white)
    hole = np.zeros(white.shape, bool)
    for fx, fy in seeds:
        x, y = round(fx * (a.shape[1] - 1)), round(fy * (a.shape[0] - 1))
        ys, xs = np.nonzero(lab == lab[y, x]) if lab[y, x] else (None, None)
        if ys is None:
            # the seed missed by a pixel or two: take the nearest white region
            d = ndimage.distance_transform_edt(~white, return_indices=True)[1]
            yy, xx = d[0][y, x], d[1][y, x]
            hole |= lab == lab[yy, xx]
        else:
            hole |= lab == lab[y, x]
    # the rim: light, low-chroma pixels next to the hole
    pale = (rgb.min(-1) >= 170) & (rgb.max(-1) - rgb.min(-1) <= 40)
    hole |= ndimage.binary_dilation(hole, iterations=2) & pale
    a[hole, 3] = 0
    return Image.fromarray(a, "RGBA")


def run(group, names, root=Path("art")):
    out = root / group / "out"
    out.mkdir(parents=True, exist_ok=True)
    for name, h in names.items():
        src = Image.open(root / group / "cut" / f"{name}.png").convert("RGBA")
        if name in HOLES:
            src = punch(src, HOLES[name])
        scale = src.height / h
        st = Image.fromarray(sticker([np.array(src)], scale)[0])
        th = h * TEX_K
        st = st.resize((round(st.width * th / st.height), th), Image.LANCZOS)
        if name in TEAMLESS:
            st.save(out / f"{name}.png", optimize=True)
        else:
            st.save(out / f"{name}_blue.png", optimize=True)
            recolor(st, 355, 1.05, 1.0).save(out / f"{name}_red.png", optimize=True)
        print(group, name, st.size)


if __name__ == "__main__":
    want = set(sys.argv[1:])
    for g, n in TARGET.items():
        if not want or g in want:
            run(g, n)
