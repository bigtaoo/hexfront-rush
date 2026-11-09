"""Makes the red side's picture from the blue side's (art/STYLE.md: the team colour is drawn in
royal blue and nothing else is blue).
usage: python team_recolor.py <in.png> <out.png> [--hue 355] [--sat 1.05] [--val 1.0]
Every saturated pixel whose hue lies in the blue band moves to the red hue; it keeps its
saturation (times --sat) and value (times --val), so the drawing's flat tones and its one cel
shadow survive. Pale and grey pixels (outline, steel, highlights) are left alone. The band's edges
are soft (FEATHER degrees) so an anti-aliased edge between blue and its neighbour does not show a
blue fringe."""
import argparse

import numpy as np
from PIL import Image

BAND = (190.0, 255.0)  # hue degrees counted as team blue
FEATHER = 12.0
MIN_SAT = 0.28


def recolor(im: Image.Image, hue: float, sat: float, val: float) -> Image.Image:
    rgba = np.asarray(im.convert("RGBA")).astype(np.float32) / 255.0
    rgb, a = rgba[..., :3], rgba[..., 3:]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.zeros_like(mx)
    m = d > 1e-6
    rm = m & (mx == r)
    gm = m & (mx == g) & ~rm
    bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    h *= 60
    lo, hi = BAND
    w = np.clip(np.minimum(h - (lo - FEATHER), (hi + FEATHER) - h) / FEATHER, 0, 1)
    w *= np.clip((s - MIN_SAT) / 0.1, 0, 1)
    nh = np.full_like(h, hue % 360) / 60
    ns = np.clip(s * sat, 0, 1)
    nv = np.clip(mx * val, 0, 1)
    c = nv * ns
    x = c * (1 - np.abs(nh % 2 - 1))
    z = np.zeros_like(c)
    k = np.floor(nh).astype(int) % 6
    out = np.stack([z, z, z], -1)
    for i, (rr, gg, bb) in enumerate([(c, x, z), (x, c, z), (z, c, x), (z, x, c), (x, z, c), (c, z, x)]):
        sel = k == i
        out[sel] = np.stack([rr[sel], gg[sel], bb[sel]], -1)
    out += (nv - c)[..., None]
    mixed = rgb * (1 - w[..., None]) + out * w[..., None]
    res = np.concatenate([mixed, a], -1)
    return Image.fromarray((np.clip(res, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--hue", type=float, default=355)
    ap.add_argument("--sat", type=float, default=1.05)
    ap.add_argument("--val", type=float, default=1.0)
    o = ap.parse_args()
    recolor(Image.open(o.src), o.hue, o.sat, o.val).save(o.dst, optimize=True)
