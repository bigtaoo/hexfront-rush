"""Painterly post-pass for toon renders: a Kuwahara filter.

usage: python tools/art3d/paint.py <render dir> <out dir> [radius px]
Tripo's texture carries fine photographic noise (grain on rock, streaks in cloth) that a 6x downscale
turns into grey mush, and that grain is a large part of what reads as "AI asset". The Kuwahara
filter replaces each pixel by the mean of the calmest of the four squares around it: flat areas go
flat like paint, while edges stay sharp, because no square straddling an edge is ever the calmest.
It runs on the 800 px render, before tools/art3d/sprite.py, keeps the alpha as it is and copies the
geometry pass (<render dir>/passes) along.
Colour is alpha-weighted, so the transparent background never bleeds into the silhouette.
"""
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import uniform_filter


def kuwahara(rgba: np.ndarray, r: int) -> np.ndarray:
    a = rgba[..., 3:4].astype(np.float64) / 255
    c = rgba[..., :3].astype(np.float64) / 255
    lum = c @ np.array([0.299, 0.587, 0.114])
    k = r + 1  # each quadrant is (r+1) x (r+1), sharing the centre row/column
    box = lambda x: uniform_filter(x, size=(k, k) + (1,) * (x.ndim - 2), mode='nearest')
    w = box(a[..., 0])
    m = box(c * a) / np.maximum(w, 1e-6)[..., None]
    ml = box(lum * a[..., 0]) / np.maximum(w, 1e-6)
    v = box(lum * lum * a[..., 0]) / np.maximum(w, 1e-6) - ml * ml
    v = np.where(w > 0.5, v, np.inf)  # a square mostly outside the silhouette is never picked
    h = r // 2
    best = np.full(lum.shape, np.inf)
    out = c.copy()
    # the box filter is centred; shifting by r/2 gives the four quadrants that touch the pixel
    for dy in (-h, h):
        for dx in (-h, h):
            vs = np.roll(v, (-dy, -dx), (0, 1))
            ms = np.roll(m, (-dy, -dx), (0, 1))
            pick = vs < best
            best[pick] = vs[pick]
            out[pick] = ms[pick]
    keep = ~np.isfinite(best)
    out[keep] = c[keep]
    res = rgba.copy()
    res[..., :3] = np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)
    return res


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    r = int(sys.argv[3]) if len(sys.argv) > 3 else 4
    dst.mkdir(parents=True, exist_ok=True)
    for f in sorted(src.glob('*.png')):
        im = np.asarray(Image.open(f).convert('RGBA'))
        Image.fromarray(kuwahara(im, r)).save(dst / f.name)
        print(f.name)
    if (src / 'passes').is_dir():  # sprite.py reads the geometry pass beside the render
        shutil.copytree(src / 'passes', dst / 'passes', dirs_exist_ok=True)


if __name__ == '__main__':
    main()
