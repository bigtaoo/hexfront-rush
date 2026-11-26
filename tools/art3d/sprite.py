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

A scenery piece (SCENERY) also gets a tone pass: its body moved below the board's own value and
the faces the key light hits lifted back up, so a tree reads as a dark mass and not a bright blob.

usage: python tools/art3d/sprite.py <render dir> <out root> [outline px] [--line k=v,...]
       [--no-lines] [--no-tone] [--from-k K] [--group units|buildings|props]

MIND WHICH RENDER DIR. The seven litter pieces (DECOR) exist under BOTH art/pilot3d/render and
art/decor3d/render, and the committed ones come from decor3d: running the props group over
pilot3d/render overwrites all seven from the older renders without saying so (measured: tuft moves
by 97 of 255 on 1615 pixels at the same size and the same area). Rebuilding one obstacle prop means
`--group props` over pilot3d/render and then `git checkout --` the seven, or decor3d for the litter.
"""
import io
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from shade import (GROVE_BAND, GROVE_CAP, GROVE_SAT, INK, LINE,  # noqa: E402  the colour passes
                   band, cool, flat, inner_lines, read_pass, split, tone)

# texture px per CSS px: 3 since 2026-11-15 (a 3x phone draws a sprite 1:1; at 2 it was stretched
# 1.2-1.6x on phones and desktops and looked soft). The outline grows with it (OUTLINE_PX).
TEX_K = 3
# 4, not 2 * TEX_K: at TEX_K = 3 the board draws a troop at PIC_K = 1.3, so a 6 px outline came
# out 2.6 CSS px on a 62 px figure - thick enough that the hat merged into the hair and the belt
# into the tunic. The area match (old_area) holds the sprite's visual mass fixed, so a thinner
# edge is spent on the figure instead of on ink: same weight on the board, more of it readable.
OUTLINE_PX = 4
# AND HALF THAT ON THE LITTER TIER, which sizes by TARGET instead of by the area match. Measured
# on the atlas, over opaque pixels, as the fraction below V 0.30 (the ink floor sits at 0.15-0.17):
# oak 0.36, pine 0.44, rocks 0.34 -- against tuft 0.71, pebbles 0.71, stones 0.67, flowers 0.74,
# twigs 0.80, drybush 0.86. A decor piece is not a small picture, it is a dark scribble: the ink is
# the same 4 texture px on a piece a third of an oak's size whose body is BLADES AND STICKS, so the
# dilation runs along both sides of every blade and swallows the piece. On the board that is sixty
# identical dark chevrons on open ground, which is what the board was called cluttered for twice
# over (decor.ts, D97 and D101) -- and neither of those cuts was looking at the ink.
#
# The area match has to go with it, and for the same reason. Its premise is that the eye weighs a
# sprite by its painted area (above), which holds for a figure whose paint is its body; on a piece
# that is three quarters ink, halving the ink and holding the area just grows the piece a quarter
# -- measured: 1/sqrt(0.29 + 0.71/2) = 1.25. So the litter keeps TARGET's height, which is where the
# area match lands it now anyway (tuft 51 px against TARGET 17 x 3 = 51, pebbles 37 against 36,
# drybush 47 against 48), and spends the ink it saves on its own colour. D103.
DECOR = {'tuft', 'flowers', 'pebbles', 'stones', 'drybush', 'twigs', 'drift'}
# AND A HAIRLINE, IN THE BOARD'S OWN COLD, ON THE PIECES THAT STAND ON THE GREEN BOARDS. The ink
# above is a warm brown (hue 23 deg) and 4 texture px of it rings every piece; on the meadow that
# is the loudest thing our scenery does that the reference's does not do at all. Measured on
# matched wood crops -- a 240 px window of our board against the reference's own at the same hex
# scale (D:/new/ref IMG_3717), the share of pixels that are dark AND warm (V < 0.30, hue <= 50 or
# >= 330, S >= 0.25):
#   reference  0.00% of the crop        our board  8.16%
# and the value span inside the wood 0.133 against our 0.278. The tone itself is right (median
# 0.337 against 0.349, D93 got that), so what is left over is the rim and the lines under it. The
# reference's crowns have no rim: they are separated from the ground and from each other by their
# own darker green, and they still read hard-edged because the edge is where the green stops.
#
# So oak, pine and rocks -- the three pieces a green board can show -- get 1 texture px instead of
# 4, in an ink moved to the board's own family (hue 172 deg at the same value and saturation).
# One px is not an outline, it is the seam that keeps the silhouette crisp at the downscale, which
# is all the reference's crowns have. The other obstacle props keep the full warm edge on purpose:
# cactus and arch stand on sand at 0.84 of value and snowpine and ice on snow at 0.90-0.95, where
# the dark edge is the only thing that separates the piece from the ground, and nothing has been
# measured on those boards.
#
# The area match goes with it, exactly as it did for the litter: hold the area and cutting the ink
# just grows the piece. These keep TARGET's height -- oak 174 texture px against the 186 it is now,
# rocks 120 against 134, pine 180 against 169 -- which moves them a few percent either way and
# leaves CROWN_K (obstacleView.ts, the thing that actually sets a crown's size) untouched. D106.
GROVE = {'oak', 'pine', 'rocks'}
GROVE_PX = 1
GROVE_INK = (31, 66, 62)
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'art'))
from sprites import TARGET as _GROUPS, TEAMLESS  # noqa: E402  the sticker art's sizes and groups

TARGET = {n: h for g in _GROUPS.values() for n, h in g.items()}
KIND = {n: g for g, names in _GROUPS.items() for n in names}
MAX_GROW = 1.3
# Which props get it: the ones that read as a mass of vegetation or rock. Not the five pieces the
# player has to notice (camp, chest, hoard, mystery, warband) -- the reference's own chests are the
# brightest thing on its board -- and not ice or drift, whose material IS white.
SCENERY = {'arch', 'cactus', 'drybush', 'flowers', 'oak', 'pebbles', 'pine', 'rocks', 'snowpine',
           'stones', 'tuft', 'twigs'}


def outline(im: Image.Image, px: int, trim=True, ink_rgb=None) -> Image.Image:
    if px <= 0:
        return im
    pad = px + 2
    big = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    big.alpha_composite(im, (pad, pad))
    a = big.getchannel('A').point(lambda v: 255 if v > 40 else 0)
    grown = a.filter(ImageFilter.MaxFilter(2 * px + 1)).filter(ImageFilter.GaussianBlur(0.6))
    ink = Image.new('RGBA', big.size, (*(ink_rgb or INK), 255))
    ink.putalpha(grown)
    ink.alpha_composite(big)
    return ink.crop(ink.getbbox()) if trim else ink


def area(im: Image.Image) -> int:
    return int((np.asarray(im.getchannel('A')) > 40).sum())


def old_area(rel: str):
    """Opaque area of the committed sprite this one replaces, or None."""
    r = subprocess.run(['git', 'show', f'HEAD:{rel}'], capture_output=True)
    return area(Image.open(io.BytesIO(r.stdout)).convert('RGBA')) if r.returncode == 0 else None


def sized(im: Image.Image, inner: int, px: int, trim=True, ink_rgb=None) -> Image.Image:
    w = max(1, round(im.width * inner / im.height))
    return outline(im.resize((w, inner), Image.LANCZOS), px, trim, ink_rgb)


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


def make(paths, height: int, px: int, want=None, geos=None, deep=False, ink_rgb=None, cap=None,
         bands=None, sat=False):
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
        # tone and lines change colour only, so the size found above still holds
        x0, y0, x1, y1 = box
        g = None if geo is None else tuple(q[y0:y1, x0:x1] for q in geo)
        if deep:                       # the body down, the lit faces back up: scenery only
            im = tone(im, g, cap)
        if sat:                        # the shade out of the inside of the mass (D120),
            im = flat(im)              # and the body down to the mid tier (D121)
            im = split(im)
        if bands is not None:          # and then into flat tiers: grove only
            im = band(im, bands, sat=sat)
            if sat:                        # and the shade toward the sky: oak and pine (D119)
                im = cool(im)
        if g is not None:
            im = inner_lines(im, g, im.height / lo, ink_rgb)
        out.append(sized(im, lo, px, one, ink_rgb))
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
    only = None
    if '--group' in args:              # one group out of a render dir that holds several
        i = args.index('--group')
        only = args[i + 1]
        del args[i:i + 2]
    deepen = '--no-tone' not in args
    args = [a for a in args if a != '--no-tone']
    src, root = Path(args[0]), Path(args[1])
    px = int(args[2]) if len(args) > 2 else OUTLINE_PX
    groups: dict = {}
    for f in sorted(src.glob('*.png')):      # "militia_bluew0" is a frame of the blue walk cycle
        groups.setdefault(frame_key(f.stem), []).append(f)
    for (name, base), paths in groups.items():
        if name not in TARGET:
            continue
        kind = KIND[name]
        if only is not None and kind != only:
            continue
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
        lit = name in DECOR
        grove = name in GROVE
        ims = make(paths, TARGET[name] * TEX_K,
                   GROVE_PX if grove else max(1, round(px / 2)) if lit else px,
                   None if lit or grove else want, geos, deepen and name in SCENERY,
                   GROVE_INK if grove else None, GROVE_CAP if grove else None,
                   GROVE_BAND if grove else None, name in GROVE_SAT)
        for f, im in zip(paths, ims):
            im.save(out / f.name)
        print(base, len(ims), ims[0].size, 'area', area(ims[0]), 'old', want)


main()
