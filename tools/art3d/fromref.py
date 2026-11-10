"""Turns the wooden-toy reference images (art/tripo/ref/<name>.png) straight into sprite sources.

usage: python tools/art3d/fromref.py <out dir> [name ...]   (no names: every sprite in tools/art/sprites.py)
then:  python tools/art3d/sprite.py <out dir> <out root>     (sizing, outline, as for the 3D renders)

The refs were drawn for Tripo's image-to-3D, all from the same prompt family (tools/art3d/refs.py),
so they already are one consistent set of hand-painted toys seen three-quarter from above. Since
2026-11-10 the ref itself is the sprite for the whole cast (even guard, ogre and mine, whose Tripo
renders read noisier at 50 px than the painted ref, and Tripo's free exports ran out): cut from its white
background, lit like the scene (light from the upper left, the ground side a touch darker, matching
tools/art3d/tripo.py's rig and src/view/light.ts) and recoloured for the red team.

Cutting: white joined to the border is background; enclosed white pockets (between a bow and its
string, inside the arch, between the pitchfork's tines) are background too, unless the subject is
white by design (snow, ice). The edge is un-blended from the white it was painted on, so no pale
halo survives the downscale.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / 'art' / 'tripo' / 'ref'
sys.path.insert(0, str(ROOT / 'tools' / 'art'))
from sprites import TARGET as _GROUPS, TEAMLESS  # noqa: E402
from team_recolor import recolor  # noqa: E402

NAMES = [n for g in _GROUPS.values() for n in g]
# white is part of the subject: never punch enclosed white
WHITE_OK = {'snowpine', 'ice'}
# the scene light (upper left), as a gain across the subject's box
LIGHT = {'hi': 1.05, 'lo': 0.86, 'foot': 0.9}


def bg_mask(rgb: np.ndarray, punch: bool) -> np.ndarray:
    """True where the pixel is background."""
    lo, hi = rgb.min(-1), rgb.max(-1)
    cand = (lo >= 222) & (hi - lo <= 24)
    lab, _ = ndimage.label(cand)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, edge[edge > 0])
    if punch:
        # enclosed pockets of paper white, big enough not to be a highlight
        pure = (lo >= 238) & (hi - lo <= 12) & ~bg
        plab, n = ndimage.label(pure)
        if n:
            sizes = ndimage.sum(pure, plab, range(1, n + 1))
            big = np.nonzero(sizes > rgb.shape[0] * rgb.shape[1] * 0.0006)[0] + 1
            bg |= np.isin(plab, big)
    return bg


def cut(name: str) -> Image.Image:
    rgb = np.asarray(Image.open(REF / f'{name}.png').convert('RGB')).astype(np.float64)
    bg = bg_mask(rgb, name not in WHITE_OK)
    fg = ~bg
    # keep the subject only: the largest blob plus anything sizeable (a dropped coin, a spear rack)
    lab, n = ndimage.label(fg)
    if n > 1:
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        fg = np.isin(lab, np.nonzero(sizes >= sizes.max() * 0.01)[0] + 1)
    fg = ndimage.binary_fill_holes(fg) if name in WHITE_OK else fg
    # soft alpha: 1 inside, a 2px ramp at the rim from how far the pixel is from paper white
    d = ndimage.distance_transform_edt(fg)
    whiteness = np.clip((rgb.min(-1) - 150) / 105, 0, 1)
    a = np.where(d >= 2.5, 1.0, np.where(fg, np.clip(1 - whiteness * (1 - d / 2.5), 0.15, 1), 0.0))
    # un-blend the rim from white: c = (c - (1 - a) * 255) / a
    am = np.maximum(a, 0.15)[..., None]
    c = np.clip((rgb - (1 - am) * 255) / am, 0, 255)
    c = relight(c, fg)
    out = np.dstack([c, a * 255]).round().astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    return im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())


def relight(c: np.ndarray, fg: np.ndarray) -> np.ndarray:
    """The refs are lit flat (studio light); the board is lit from the upper left."""
    ys, xs = np.nonzero(fg)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    yy, xx = np.mgrid[0:c.shape[0], 0:c.shape[1]]
    u = np.clip((xx - x0) / max(1, x1 - x0), 0, 1)
    v = np.clip((yy - y0) / max(1, y1 - y0), 0, 1)
    t = (u * 0.45 + v * 0.55)
    gain = LIGHT['hi'] + (LIGHT['lo'] - LIGHT['hi']) * t
    # the bottom tenth sits in the ground's shade
    gain *= 1 - (1 - LIGHT['foot']) * np.clip((v - 0.9) / 0.1, 0, 1)
    return np.clip(c * gain[..., None], 0, 255)


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    names = sys.argv[2:] or [n for n in NAMES if (REF / f'{n}.png').exists()]
    for n in names:
        im = cut(n)
        if n in TEAMLESS:
            im.save(out / f'{n}.png')
        else:
            im.save(out / f'{n}_blue.png')
            recolor(im, 355, 1.05, 1.0).save(out / f'{n}_red.png')
        print(n, im.size)


if __name__ == '__main__':
    main()
