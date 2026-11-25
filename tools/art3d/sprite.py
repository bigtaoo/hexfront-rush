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
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'art'))
from sprites import TARGET as _GROUPS, TEAMLESS  # noqa: E402  the sticker art's sizes and groups

TARGET = {n: h for g in _GROUPS.values() for n, h in g.items()}
KIND = {n: g for g, names in _GROUPS.items() for n in names}
INK = (43, 29, 20)
MAX_GROW = 1.3
# The scenery's tone (D93). A tree of ours read as a bright green blob sitting on the field: an
# oak's body was at 0.608 of value against a 0.451 ground, i.e. ABOVE the board, and every other
# prop with it (pine 0.557, rocks 0.600, arch 0.718).
#
# What the reference game (D:/new/ref) actually does, measured twice because the first reading was
# wrong. Its tree is a nearly FLAT DARK MASS: body p05 0.267, median 0.341, p90 0.392, p99 0.396 on
# a 0.447 ground (IMG_3707), so the whole piece -- its lit side included -- sits at or under the
# board, and the spread from its darkest to its brightest pixel is 0.13. A grove of them on another
# frame (IMG_3717) gives the same answer from the other side: the dark half of the grove is at 0.353
# and its brightest pixel anywhere is 0.510, a twentieth above the ground. The first reading of this
# put its crown at 0.749 and called the spread 0.48, which sent an earlier cut of this pass chasing
# a bright crown; 0.749 was the BLUE TERRITORY TILE behind the tree, not the tree. There is no
# bright crown in the reference at all. What carries its lobe light is hue and saturation -- H171,
# S0.57-0.82, a deep blue-green far more saturated than ours -- and not value.
#
# So this pass moves the mass down and gives back only as much light as keeps the model readable as
# a solid, which is a fifth of the way to white on the up-faces and no more. Flattening ours all the
# way to the reference's 0.13 is not open to us for the reason the ref does not need it: its tree is
# a painted sticker with the lobes drawn in, ours is a render whose form IS its value range, and at
# 0.13 it would go to a silhouette.
#   mul   how far the body falls toward `floor`: 0.36 puts an oak's median at 0.36 on the board,
#         0.09 under the ground, against the reference's 0.10 under.
#   floor what the darks are pulled toward, never past. Straight multiplication crushed the shadow
#         side to 0.14 and the piece lost its own modelling; the reference's own dark side is 0.267.
#   lit   how far a face the key light hits is lifted back toward white; n0..n1 which faces those
#         are. This is the half that needs the geometry pass: the renders are lit almost flat (an
#         oak's top 30% averages 0.621 against its bottom's 0.605), so there is no highlight in the
#         pixels to keep. The lift is a blend toward white, not a scale, so a lit face desaturates
#         as it brightens -- which is why it has to stay small: the reference's light is a hue
#         shift, and much of this is a wash. 0.80 was tried and is far too much: it put an oak's top
#         at 0.64 on the board, 0.19 ABOVE the ground where the reference is 0.05 above at most, and
#         it blew the base patch (normals straight up, so the band hits it at full strength) from
#         0.52 to 0.87 -- a white plate under every tree, which is the whole reason the piece still
#         did not read as a dark mass. At 0.22 the patch lands near the ground's own value, which is
#         as close to the reference's no-patch-at-all as this pass can get without touching props.py.
#   n0,n1 A power of n.y was the first shape tried and it is the wrong one: it lifts in proportion,
#         so whatever reached the crown also reached the body and the whole piece came back up
#         together. A piece's normals are not spread evenly: an oak's n.y sits at 0.252 at the
#         median and 0.847 by the third quartile, so a third of it faces the key almost squarely and
#         the rest hardly at all. A band across that gap lifts the third and leaves the rest where
#         the darkening put it. On a faceted model it gives flat lit planes rather than a gradient,
#         which is the painted look this art is after anyway.
TONE = {'floor': 0.22, 'mul': 0.36, 'lit': 0.30, 'n0': 0.45, 'n1': 0.82,
        'sat': 1.62, 's0': 0.12, 's1': 0.28}
# Which props get it: the ones that read as a mass of vegetation or rock. Not the five pieces the
# player has to notice (camp, chest, hoard, mystery, warband) -- the reference's own chests are the
# brightest thing on its board -- and not ice or drift, whose material IS white.
SCENERY = {'arch', 'cactus', 'drybush', 'flowers', 'oak', 'pebbles', 'pine', 'rocks', 'snowpine',
           'stones', 'tuft', 'twigs'}
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


def tone(im: Image.Image, geo) -> Image.Image:
    """Move a scenery piece's body below the board and lift the faces the key light hits (D93).

    Runs on the full-size render, before the downscale, so the lift is anti-aliased with the rest.
    """
    a = np.asarray(im).astype(np.float64)
    rgb = a[..., :3] / 255
    v = rgb.max(-1)
    down = np.where(v > TONE['floor'], TONE['floor'] + (v - TONE['floor']) * TONE['mul'], v)
    out = rgb * (down / np.maximum(v, 1e-6))[..., None]
    if geo is not None:
        nrm, _dep, cov = geo
        # +ny is where the render's own key comes from: over an oak's body ny correlates +0.51 with
        # brightness, more than nx (-0.43) or nz (+0.19). So this strengthens the light that is
        # already there rather than inventing a second one from a guessed world-up.
        u = np.clip((nrm[..., 1] - TONE['n0']) / (TONE['n1'] - TONE['n0']), 0, 1)
        lit = np.where(cov > 0.99, u * u * (3 - 2 * u), 0.0)
        # The lift SCALES value instead of mixing toward white (D96). Mixing toward white is how a
        # lit face loses its colour: at an oak's brightest the old form took the crown's saturation
        # from 0.56 to 0.36, well under the reference's own lit crowns (0.53), so the lobes read as
        # pale grey-green patches instead of light on a green thing. Multiplying leaves hue and
        # saturation exactly where the material put them and only raises value, which is what a key
        # light on a diffuse surface actually does. The factor is larger than the old addend
        # because it buys less: 0.30 of multiply at value 0.40 is the same +0.12 the old 0.22 gave.
        out = out * (1 + TONE['lit'] * lit)[..., None]
    # D96: and then saturate. The reference's crowns carry their lit lobes in SATURATION, not in
    # value -- S 0.57-0.82 against its own ground's 0.54, all on one hue -- which is the half of D93
    # that was left undone, and the lift above makes it worse by mixing the lit faces toward white.
    # Pulling each channel away from the max scales saturation and leaves hue and value untouched.
    # The ramp is what keeps it off the white and grey materials: frost, ice and drift sit at
    # S 0.03-0.09 and stone at 0.12, where a multiply would only amplify the render's own noise into
    # coloured speckle, so nothing under s0 is touched at all and the full factor only arrives at s1.
    # 1.62, not 1.45: measured per value bucket, the reference's crown shadows are its most saturated
    # pixels of all (S 0.76 at value 0.35, against 0.53 on its lit faces and 0.54 on its ground),
    # where a render's own ambient leaves shadows GREY -- ours sat at 0.63. The factor is what buys
    # the shadow back its colour, and the cap below is why a flat factor is safe at this size.
    mx = out.max(-1, keepdims=True)
    sat0 = np.where(mx[..., 0] > 1e-6, (mx[..., 0] - out.min(-1)) / np.maximum(mx[..., 0], 1e-6), 0)
    w = np.clip((sat0 - TONE['s0']) / (TONE['s1'] - TONE['s0']), 0, 1)
    k = 1 + (TONE['sat'] - 1) * (w * w * (3 - 2 * w))
    out = mx - (mx - out) * k[..., None]
    a[..., :3] = np.clip(out, 0, 1) * 255
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


def make(paths, height: int, px: int, want=None, geos=None, deep=False):
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
            im = tone(im, g)
        if g is not None:
            im = inner_lines(im, g, im.height / lo)
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
        ims = make(paths, TARGET[name] * TEX_K, max(1, round(px / 2)) if lit else px,
                   None if lit else want, geos, deepen and name in SCENERY)
        for f, im in zip(paths, ims):
            im.save(out / f.name)
        print(base, len(ims), ims[0].size, 'area', area(ims[0]), 'old', want)


main()
