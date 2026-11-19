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

usage: python tools/art3d/sprite.py <render dir> <out root> [outline px] [--line k=v,...] [--no-lines] [--from-k K]
"""
import io
import re
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

# texture px per CSS px: 3 since 2026-11-15 (a 3x phone draws a sprite 1:1; at 2 it was stretched
# 1.2-1.6x on phones and desktops and looked soft). The outline grows with it (OUTLINE_PX).
TEX_K = 3
# 4, not 2 * TEX_K: at TEX_K = 3 the board draws a troop at PIC_K = 1.3, so a 6 px outline came
# out 2.6 CSS px on a 62 px figure - thick enough that the hat merged into the hair and the belt
# into the tunic. The area match (old_area) holds the sprite's visual mass fixed, so a thinner
# edge is spent on the figure instead of on ink: same weight on the board, more of it readable.
OUTLINE_PX = 4
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


def outline(im: Image.Image, px: int, trim=True) -> Image.Image:
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
    return ink.crop(ink.getbbox()) if trim else ink


def area(im: Image.Image) -> int:
    return int((np.asarray(im.getchannel('A')) > 40).sum())


def old_area(rel: str):
    """Opaque area of the committed sprite this one replaces, or None."""
    r = subprocess.run(['git', 'show', f'HEAD:{rel}'], capture_output=True)
    return area(Image.open(io.BytesIO(r.stdout)).convert('RGBA')) if r.returncode == 0 else None


def sized(im: Image.Image, inner: int, px: int, trim=True) -> Image.Image:
    w = max(1, round(im.width * inner / im.height))
    return outline(im.resize((w, inner), Image.LANCZOS), px, trim)


def union_box(ims):
    """One box around every frame of a cycle: a per-frame box makes the piece jump and resize."""
    bs = [im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox() for im in ims]
    return (min(b[0] for b in bs), min(b[1] for b in bs),
            max(b[2] for b in bs), max(b[3] for b in bs))


def centred(ims, geos):
    """One canvas for a group whose renders differ in size.

    toys.py widens the film for a pose that reaches past the still (the turn frames), keeping the
    centre and the scale. So the frames line up about their centres, not their corners.
    """
    w, h = max(i.width for i in ims), max(i.height for i in ims)
    if all(i.size == (w, h) for i in ims):
        return ims, geos
    out, gout = [], []
    for im, geo in zip(ims, geos or [None] * len(ims)):
        dx, dy = round((w - im.width) / 2), round((h - im.height) / 2)
        c = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        c.paste(im, (dx, dy))
        out.append(c)
        pad = ((dy, h - im.height - dy), (dx, w - im.width - dx))
        gout.append(None if geo is None else
                    tuple(np.pad(g, pad + ((0, 0),) * (g.ndim - 2)) for g in geo))
    return out, (gout if geos else None)


def sym(im, b):
    """Widen a shared box so it stays centred on the still.

    The board hangs a piece on the middle of its canvas, over a shadow drawn there. A frame that
    reaches further one way than the still (a drake swinging its wingspan round to face us) would
    otherwise drag the whole cycle sideways; it buys empty pixels on both sides instead.
    """
    b0 = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    c = (b0[0] + b0[2]) / 2
    half = max(c - b[0], b[2] - c)
    return (int(c - half), b[1], int(round(c + half)), b[3])


def make(paths, height: int, px: int, want=None, geos=None):
    """Size one group of frames together: shared crop box, one scale solved on the first frame."""
    ims = [Image.open(f).convert('RGBA') for f in paths]
    ims, geos = centred(ims, geos)
    box = union_box(ims)
    crop = [im.crop(box) for im in ims]
    # Heights are the figure's, not the shared canvas's. A cycle's box carries empty pixels for
    # whatever the widest/tallest frame reaches (a toppled piece sweeps its club or its wings well
    # above where it stands); measuring the box would shrink the figure by that padding, and at
    # MAX_GROW cap it before it ever reached the old sprite's mass. k is 1 for a lone still.
    b0 = crop[0].getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    k = (box[3] - box[1]) / max(1, b0[3] - b0[1])
    lo = round(height * k) - 2 * (px + 1)
    if want is not None:
        lo, hi = lo // 2, round(height * MAX_GROW * k) - 2 * (px + 1)
        while lo < hi:  # the smallest height whose outlined area reaches the old sprite's
            mid = (lo + hi) // 2
            if area(sized(crop[0], mid, px)) < want:
                lo = mid + 1
            else:
                hi = mid
    out = []
    one = len(crop) == 1
    for im, geo in zip(crop, geos or [None] * len(crop)):
        if geo is not None:  # lines change colour only, so the size found above still holds
            x0, y0, x1, y1 = box
            im = inner_lines(im, tuple(g[y0:y1, x0:x1] for g in geo), im.height / lo)
        out.append(sized(im, lo, px, one))
    if not one:          # one canvas for the whole cycle: trimmed per frame, the piece would slide
        out = [im.crop(sym(out[0], union_box(out))) for im in out]
    return out


def frame_key(stem: str):
    """(model name, the still it belongs to): "militia_blue_w0" is a frame of "militia_blue"."""
    if stem in TEAMLESS:
        return stem, stem
    m = re.fullmatch(r'(?P<name>.+)_(?P<team>blue|red)(?:_[a-z]\d+)?', stem)
    return (m['name'], f"{m['name']}_{m['team']}") if m else (stem, stem)


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
    # --from-k K: the committed sprites the sizes are matched to were made at TEX_K = K, so their
    # opaque area is scaled by (TEX_K / K)^2 (the sizes on the board stay the same)
    from_k = TEX_K
    if '--from-k' in args:
        i = args.index('--from-k')
        from_k = float(args[i + 1])
        del args[i:i + 2]
    src, root = Path(args[0]), Path(args[1])
    px = int(args[2]) if len(args) > 2 else OUTLINE_PX
    groups: dict = {}
    for f in sorted(src.glob('*.png')):      # "militia_bluew0" is a frame of the blue walk cycle
        groups.setdefault(frame_key(f.stem), []).append(f)
    for (name, base), paths in groups.items():
        if name not in TARGET:
            continue
        kind = KIND[name]
        out = root / kind / 'out'
        out.mkdir(parents=True, exist_ok=True)
        want = old_area(f'art/{kind}/out/{base}.png')
        if want is not None:
            want = round(want * (TEX_K / from_k) ** 2)
        geos = []
        for f in paths:
            gp = src / 'passes' / f.name
            geos.append(read_pass(gp) if lines and gp.exists() else None)
        if not any(g is not None for g in geos):
            geos = None
        ims = make(paths, TARGET[name] * TEX_K, px, want, geos)
        for f, im in zip(paths, ims):
            im.save(out / f.name)
        print(base, len(ims), ims[0].size, 'area', area(ims[0]), 'old', want)


main()
