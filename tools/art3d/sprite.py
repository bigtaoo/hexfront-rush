"""Turns toys.py renders into game sprites: trim, size to the old sprite's visual mass, add an outline.

usage: python tools/art3d/sprite.py <render dir> <out root> [outline px]
Heights are tools/art/sprites.py's TARGET (CSS px) x TEX_K, so a pilot sprite drops into the atlas
exactly where the old one was: each to <out root>/<group>/out (units, buildings, props), a teamless prop as <name>.png.
Sizing by height alone shrinks anything with a tall thin part (a plume, a raised club, a flag): the
eye weighs a sprite by its painted area, so each new sprite is scaled until its opaque area matches
the sprite it replaces (git HEAD's art/<kind>/out/<name>_<team>.png), its height capped at
MAX_GROW x TARGET; with no old sprite to match it falls back to TARGET's height.
The outline is a dilation of the alpha in a dark warm ink, laid under the sprite: at 40 px on a
phone a soft 3D render needs that edge to stand off the board, the way the current art does.
Inner lines come from tools/art3d/tripo.py's geometry pass (<render dir>/passes/<same name>, normal
and depth): ink where a part stands in front of another (an arm across the chest, the hat brim over
the face) and a lighter ink on sharp creases. They are drawn on the full-size render, LINE[w] sprite
pixels wide, before the downscale, so they come out anti-aliased and as thick on every model.

usage: python tools/art3d/sprite.py <render dir> <out root> [outline px] [--line k=v,...] [--no-lines]
"""
import io
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

TEX_K = 2
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'art'))
from sprites import TARGET as _GROUPS, TEAMLESS  # noqa: E402  the sticker art's sizes and groups

TARGET = {n: h for g in _GROUPS.values() for n, h in g.items()}
KIND = {n: g for g, names in _GROUPS.items() for n in names}
INK = (43, 29, 20)
MAX_GROW = 1.3
LINE = {
    'w': 1.3,      # line width in sprite px
    'd': 0.012,    # depth step that makes an occlusion line, in pass units (half a model unit)
    'n': 55.0,     # crease angle (degrees) that makes a crease line
    'ink': 0.9,    # how far an occlusion line goes to INK
    'crease': 0.5,
}


def read_pass(path: Path):
    """(normal (h, w, 3), depth (h, w), coverage (h, w)) from tripo.py's 16-bit geometry pass."""
    a = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)[..., [2, 1, 0, 3]].astype(np.float64) / 65535
    nx, ny = a[..., 0] * 2 - 1, a[..., 1] * 2 - 1
    nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
    return np.stack([nx, ny, nz], -1), a[..., 2], a[..., 3]


def disk(r: int):
    y, x = np.mgrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r + r


def inner_lines(im: Image.Image, geo, per_px: float) -> Image.Image:
    """Ink the occlusion edges and creases of a full-size render; per_px = render px per sprite px."""
    nrm, dep, cov = geo
    valid = cov > 0.99
    r = max(1, round(LINE['w'] * per_px))
    far = np.where(valid, dep, 9.0)
    # a pixel lies just behind an edge when something within r of it is nearer by more than a step
    occl = valid & (dep - ndimage.minimum_filter(far, footprint=disk(r)) > LINE['d'])
    h = max(1, r // 2)
    cos_t = np.cos(np.radians(LINE['n']))
    crease = np.zeros_like(valid)
    for dy, dx in ((h, 0), (0, h), (h, h), (h, -h)):
        q = np.roll(nrm, (dy, dx), (0, 1))
        qv = np.roll(valid, (dy, dx), (0, 1))
        crease |= valid & qv & ((nrm * q).sum(-1) < cos_t)
    a = np.asarray(im).astype(np.float64)
    ink = np.array(INK, np.float64)
    k = np.where(occl, LINE['ink'], np.where(crease, LINE['crease'], 0.0))
    k = ndimage.gaussian_filter(k, 0.6)[..., None]
    a[..., :3] = a[..., :3] * (1 - k) + ink * k
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), 'RGBA')


def outline(im: Image.Image, px: int) -> Image.Image:
    if px <= 0:
        return im
    pad = px + 2
    big = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    big.alpha_composite(im, (pad, pad))
    a = big.getchannel('A').point(lambda v: 255 if v > 40 else 0)
    grown = a.filter(ImageFilter.MaxFilter(2 * px + 1)).filter(ImageFilter.GaussianBlur(0.6))
    ink = Image.new('RGBA', big.size, (*INK, 255))
    ink.putalpha(grown)
    ink.alpha_composite(big)
    return ink.crop(ink.getbbox())


def area(im: Image.Image) -> int:
    return int((np.asarray(im.getchannel('A')) > 40).sum())


def old_area(rel: str):
    """Opaque area of the committed sprite this one replaces, or None."""
    r = subprocess.run(['git', 'show', f'HEAD:{rel}'], capture_output=True)
    return area(Image.open(io.BytesIO(r.stdout)).convert('RGBA')) if r.returncode == 0 else None


def sized(im: Image.Image, inner: int, px: int) -> Image.Image:
    w = max(1, round(im.width * inner / im.height))
    return outline(im.resize((w, inner), Image.LANCZOS), px)


def make(src: Path, height: int, px: int, want=None, geo=None) -> Image.Image:
    im = Image.open(src).convert('RGBA')
    box = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(box)
    lo = height - 2 * (px + 1)
    if want is not None:
        lo, hi = lo // 2, round(height * MAX_GROW) - 2 * (px + 1)
        while lo < hi:  # the smallest height whose outlined area reaches the old sprite's
            mid = (lo + hi) // 2
            if area(sized(im, mid, px)) < want:
                lo = mid + 1
            else:
                hi = mid
    if geo is not None:  # lines change colour only, so the size found above still holds
        x0, y0, x1, y1 = box
        im = inner_lines(im, tuple(g[y0:y1, x0:x1] for g in geo), im.height / lo)
    return sized(im, lo, px)


def main():
    args = sys.argv[1:]
    lines = '--no-lines' not in args
    args = [a for a in args if a != '--no-lines']
    if '--line' in args:
        i = args.index('--line')
        for kv in args[i + 1].split(','):
            k, v = kv.split('=')
            LINE[k] = float(v)
        del args[i:i + 2]
    src, root = Path(args[0]), Path(args[1])
    px = int(args[2]) if len(args) > 2 else 4
    for f in sorted(src.glob('*.png')):
        name = f.stem if f.stem in TEAMLESS else f.stem.rsplit('_', 1)[0]
        if name not in TARGET:
            continue
        kind = KIND[name]
        out = root / kind / 'out'
        out.mkdir(parents=True, exist_ok=True)
        want = old_area(f'art/{kind}/out/{f.name}')
        gp = src / 'passes' / f.name
        geo = read_pass(gp) if lines and gp.exists() else None
        im = make(f, TARGET[name] * TEX_K, px, want, geo)
        im.save(out / f.name)
        print(f.name, im.size, 'area', area(im), 'old', want)


main()
