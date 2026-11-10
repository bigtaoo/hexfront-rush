"""Cleans a Tripo model's base-colour texture: art/tripo/<name>.glb -> art/tripo/tex/<name>_clean.png.

usage: python tools/art3d/tripo_tex.py <name> ...
tools/art3d/tripo.py uses the clean texture in place of the embedded one when it exists.

Tripo paints the model from a few views and blends them, so the texture carries blotches: a gold
smear on a black hat, grey streaks in a blue plume, blue specks on a rock. On a 50 px sprite they
read as dirt, and a blue speck becomes team colour where there is none. A generic cleanup cannot
tell a blotch from a detail (an eye is a small dark patch too), so each model gets explicit RULES,
written in the model's own space: every texel is mapped to its 3D point and surface normal, and a
rule repaints the texels of one colour class inside one box. A repainted texel takes the mean of
its nearest texels of the right colour in 3D, which is what an artist's clone brush does, and it
does not care where the UV seams run. Blue specks (blue texels in a non-blue neighbourhood) are
painted out everywhere; the mine's gold is cut into faceted nuggets, since Tripo melts a heap of
gold into one flat blob.

Coordinates are tripo.py's frame: unit height, centred x/y, feet at z=0, -y is the model's front.
"""
import io
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[2]
TRIPO = ROOT / 'art' / 'tripo'
INF = 9.0


# --- colour classes over (n, 3) uint8 rgb ---

def hsv(rgb):
    c = rgb.astype(np.float64) / 255.0
    mx, mn = c.max(-1), c.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    m = d > 1e-6
    rm = m & (mx == r)
    gm = m & (mx == g) & ~rm
    bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    return h * 60, np.where(mx > 0, d / np.maximum(mx, 1e-6), 0), mx


def classes(rgb):
    h, s, v = hsv(rgb)
    blue = (h > 195) & (h < 255) & (s > 0.3) & (v > 0.12)
    gold = (h > 33) & (h < 62) & (s > 0.45) & (v > 0.4)
    dark = v < 0.22
    grey = (s < 0.25) & (v >= 0.22) & (v < 0.96)
    bright = blue & (v > 0.28)
    return {'blue': blue, 'gold': gold, 'dark': dark, 'grey': grey, 'rock': ~blue & ~gold,
            'brightblue': bright, 'dullblue': ~bright,
            'yellow': (h > 35) & (h < 62) & (s > 0.33) & (v > 0.45),
            'paleblue': (h > 190) & (h < 270) & (s < 0.75),
            'steel': grey & (v > 0.45),
            'team': (h > 178) & (h < 267) & (s > 0.28),
            'light': (s < 0.25) & (v > 0.4),
            'notgrey': ~grey & (v > 0.15),
            'dull': (s < 0.42) & (v > 0.33) & ~gold,
            'bluish': (h > 200) & (h < 260) & (((s > 0.12) & (v > 0.15)) | ((s > 0.25) & (v > 0.07)))}


# Each rule: (what, box lo, box hi, extra test, reference class). 'what' is a '|' list of classes;
# the extra test takes (points, normals) and returns a mask. Rules run in order on the cleaned image.
def stem_cut(cx, cy, r, ztop):
    return lambda p, n: ~((np.hypot(p[:, 0] - cx, p[:, 1] - cy) < r) & (p[:, 2] < ztop))


def up(k):
    return lambda p, n: n[:, 2] > k


def flat(k):
    return lambda p, n: np.abs(n[:, 2]) > k


def outside(lo, hi):
    lo, hi = np.array(lo), np.array(hi)
    return lambda p, n: ~np.all((p >= lo) & (p <= hi), 1)


def both(*fs):
    return lambda p, n: np.logical_and.reduce([f(p, n) for f in fs])


def radial(cx, cy, lo, hi):
    return lambda p, n: (np.hypot(p[:, 0] - cx, p[:, 1] - cy) >= lo) & (np.hypot(p[:, 0] - cx, p[:, 1] - cy) < hi)


GUARD_STEM = (0.05, 0.037)
GUARD_HAT = 0.135  # radius of the shako around the plume's stem
GUARD_EMBLEM = outside((-0.01, -INF, 0.715), (0.11, 0.0, 0.86))
# the halberd's steel head (x < -0.144) stands clear of the body and hat (x > -0.08) above z 0.6
GUARD_HALBERD = outside((-INF, -INF, 0.6), (-0.12, INF, INF))
RULES = {
    'guard': [
        # plume: whatever is not a clear blue (grey streaks, black tips) becomes plume blue; below the
        # crown's height only the feathers that hang outside the hat
        ('dullblue', (-INF, -INF, 0.85), (INF, INF, INF), both(stem_cut(*GUARD_STEM, 0.035, 0.885), GUARD_HALBERD), 'brightblue'),
        ('dullblue', (-INF, -INF, 0.8), (INF, INF, 0.85), both(radial(*GUARD_STEM, GUARD_HAT, INF), GUARD_HALBERD), 'brightblue'),
        # crown of the hat: gold and grey smears on the black top
        ('gold|grey', (-INF, -INF, 0.81), (INF, INF, 0.86),
         both(up(0.5), radial(*GUARD_STEM, 0.038, GUARD_HAT), GUARD_HALBERD), 'dark'),
        # hat wall and band, but not the emblem on its front
        ('gold|blue|grey', (-INF, -INF, 0.695), (INF, INF, 0.80), both(GUARD_EMBLEM, GUARD_HALBERD), 'dark'),
        ('gold|grey', (-INF, -INF, 0.80), (INF, INF, 0.845),
         both(GUARD_EMBLEM, radial(*GUARD_STEM, 0.038, GUARD_HAT), GUARD_HALBERD), 'dark'),
        # the brim: its top and underside, not the face and hair below it
        ('gold|blue|grey', (-INF, -INF, 0.6), (INF, INF, 0.72), both(flat(0.45), GUARD_HALBERD), 'dark'),
        # what the team recolor would still catch on the black shako: its rim and the brim's edge
        ('team', (-INF, -INF, 0.62), (INF, INF, 0.735), both(radial(*GUARD_STEM, 0, 0.19), GUARD_HALBERD), 'dark'),
        ('team', (-INF, -INF, 0.735), (INF, INF, 0.87), both(radial(*GUARD_STEM, 0.04, GUARD_HAT + 0.01), GUARD_HALBERD), 'dark'),
        # a baked white highlight down the shaft below the hand: wood
        ('light', (-0.24, -0.3, 0.06), (-0.12, -0.04, 0.39), None, 'notgrey'),
        # blue lines along the halberd's edges would turn red on the red side: plain steel
        ('bluish', (-INF, -INF, 0.6), (-0.12, INF, INF), None, 'steel'),
        # boots below the gold cuffs: the dull heel patch, white dots, bluish specks; the laces and the
        # halberd's shaft are a saturated brown and stay
        ('dull|bluish', (-INF, -INF, -INF), (INF, INF, 0.115), None, 'dark'),
    ],
    'ogre': [
        # white-grey smears on the club hand's knuckles and the grip below it (the wrist wraps are darker)
        ('light', (-0.5, -0.4, 0.38), (-0.15, -0.05, 0.7), None, 'notgrey'),
    ],
    'mine': [
        # every blue on the hill is a speck (the flag flies above 0.86), save the pickaxe's steel head
        ('bluish', (-INF, -INF, -INF), (INF, INF, 0.86), outside((0.1, -0.35, 0.3), (0.4, -0.1, 0.52)), 'rock'),
        # yellow smears on the rock face; the cart, the nuggets and the lantern are below or in front
        ('yellow', (-INF, -INF, 0.45), (INF, INF, 0.86), outside((-0.07, -INF, 0.42), (0.07, -0.1, 0.6)), 'rock'),
        # the pale hem along the flag's lower edge, and its washed-out patches
        ('paleblue|grey', (0.0, -0.05, 0.875), (INF, 0.16, INF), None, 'brightblue'),
    ],
}
GOLD = {'mine'}
# what tripo.py's toon light gives a hard specular glint: every gold texel, plus steel inside these
# boxes (steel by colour alone would also take the guard's white beard)
STEEL = {
    'guard': [((-INF, -INF, 0.6), (-0.12, INF, INF), 'steel|grey')],  # the halberd's head
    'mine': [((0.1, -0.35, 0.3), (0.4, -0.1, 0.52), 'bluish|paleblue')],  # the pickaxe's head, not the rock behind it
}
# models whose team colour is one piece (the ogre's sash): every team-coloured patch apart from the
# largest is a stray and takes the colour around it
ONE_TEAM_PIECE = {'ogre'}


# --- glb ---

def read_glb(path: Path):
    b = path.read_bytes()
    n = struct.unpack('<I', b[12:16])[0]
    js = json.loads(b[20:20 + n])
    off = 20 + n
    blen = struct.unpack('<I', b[off:off + 4])[0]
    data = b[off + 8:off + 8 + blen]

    def acc(i):
        a = js['accessors'][i]
        bv = js['bufferViews'][a['bufferView']]
        comp = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        item = np.dtype(comp).itemsize * width
        stride = bv.get('byteStride', item)
        raw = np.frombuffer(data, np.uint8, count=stride * (a['count'] - 1) + item, offset=start)
        if stride == item:
            return raw.view(comp).reshape(a['count'], width)
        rows = np.lib.stride_tricks.as_strided(raw, (a['count'], item), (stride, 1))
        return rows.copy().view(comp).reshape(a['count'], width)

    pos, uv, idx = [], [], []
    base = 0
    for mesh in js['meshes']:
        for prim in mesh['primitives']:
            p = acc(prim['attributes']['POSITION'])
            pos.append(p)
            uv.append(acc(prim['attributes']['TEXCOORD_0']))
            idx.append(acc(prim['indices']).reshape(-1, 3).astype(np.int64) + base)
            base += len(p)
    bv = js['bufferViews'][js['images'][0]['bufferView']]
    o = bv.get('byteOffset', 0)
    tex = Image.open(io.BytesIO(data[o:o + bv['byteLength']])).convert('RGB')
    pos = np.concatenate(pos).astype(np.float64)
    pos = np.stack([pos[:, 0], -pos[:, 2], pos[:, 1]], 1)  # glTF y-up -> Blender z-up
    lo, hi = pos.min(0), pos.max(0)
    pos = (pos - [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]]) / (hi[2] - lo[2])
    return pos, np.concatenate(uv).astype(np.float64), np.concatenate(idx), np.asarray(tex)


def texel_maps(pos, uv, idx, size):
    """Per texel: its 3D point and its face's normal (NaN outside every face)."""
    H, W = size
    P = np.full((H, W, 3), np.nan)
    N = np.full((H, W, 3), np.nan)
    tri = pos[idx]
    fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    t = uv[idx] * [W, H]
    for f in range(len(idx)):
        a, b, c = t[f]
        x0, y0 = np.floor(np.minimum(np.minimum(a, b), c)).astype(int)
        x1, y1 = np.ceil(np.maximum(np.maximum(a, b), c)).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W - 1), min(y1, H - 1)
        if x1 < x0 or y1 < y0:
            continue
        v0, v1 = b - a, c - a
        den = v0[0] * v1[1] - v1[0] * v0[1]
        if abs(den) < 1e-12:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        px, py = xs - a[0], ys - a[1]
        l1 = (px * v1[1] - v1[0] * py) / den
        l2 = (v0[0] * py - px * v0[1]) / den
        inside = (l1 >= -0.01) & (l2 >= -0.01) & (l1 + l2 <= 1.01)
        q = tri[f]
        p = (1 - l1 - l2)[..., None] * q[0] + l1[..., None] * q[1] + l2[..., None] * q[2]
        P[y0:y1 + 1, x0:x1 + 1][inside] = p[inside]
        N[y0:y1 + 1, x0:x1 + 1][inside] = fn[f]
    return P, N


# --- painting ---

def fill(rgb, pts, sel, ref, k=12):
    """Repaint rgb[sel] with the mean of the k nearest ref texels in 3D, keeping a little shading."""
    if not sel.any() or not ref.any():
        return 0
    k = min(k, int(ref.sum()))
    _, i = cKDTree(pts[ref]).query(pts[sel], k=k)
    i = i.reshape(len(i), -1)
    col = rgb[ref][i].astype(np.float64).mean(1)
    lum = rgb[sel].astype(np.float64).mean(1)
    col += 0.25 * (lum - np.median(lum))[:, None]
    rgb[sel] = np.clip(col, 0, 255).round().astype(np.uint8)
    return int(sel.sum())


def specks(rgb, pts):
    """Blue texels whose 3D neighbourhood is mostly not blue: Tripo's stray team colour."""
    blue = classes(rgb)['blue']
    if not blue.any():
        return 0
    step = max(1, len(pts) // 600000)
    _, i = cKDTree(pts[::step]).query(pts[blue], k=40)
    share = blue[::step][i].mean(1)
    sel = np.zeros_like(blue)
    sel[np.nonzero(blue)[0][share < 0.35]] = True
    return fill(rgb, pts, sel, ~blue)


def strays(rgb, pts, cell=0.006, reach=0.015):
    """Team-band texels outside the largest 3D-connected team patch, filled from their surroundings."""
    h, s, _ = hsv(rgb)
    team = (h > 178) & (h < 267) & (s > 0.28)
    if not team.any():
        return 0
    vox = np.floor(pts[team] / cell).astype(np.int64)
    keys, inv = np.unique(vox, axis=0, return_inverse=True)
    inv = inv.ravel()
    pairs = cKDTree(keys * cell).query_pairs(reach, output_type='ndarray')
    n = len(keys)
    g = coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(n, n))
    _, lab = connected_components(g, directed=False)
    big = np.bincount(lab[inv]).argmax()
    sel = np.zeros_like(team)
    sel[np.nonzero(team)[0][lab[inv] != big]] = True
    return fill(rgb, pts, sel, ~team)


def gold_facets(img, P, seed=11):
    """Cut flat yellow into nuggets: 3D Voronoi cells in four gold tones with dark seams."""
    ok = ~np.isnan(P[..., 0])
    rgb = img[ok]
    gold = classes(rgb)['gold']
    pts = P[ok][gold]
    rng = np.random.default_rng(seed)
    lo, hi = pts.min(0), pts.max(0)
    n = 1200
    seeds = lo + rng.random((n, 3)) * (hi - lo)
    d, i = cKDTree(seeds).query(pts, k=2)
    tones = np.array([[255, 228, 122], [247, 198, 70], [224, 160, 40], [184, 116, 30]], float)
    col = tones[rng.integers(0, 4, n)][i[:, 0]]
    seam = (d[:, 1] - d[:, 0]) < 0.0045
    col[seam] = [128, 78, 22]
    out = rgb.copy()
    out[gold] = (0.82 * col + 0.18 * rgb[gold].astype(np.float64)).round().astype(np.uint8)
    img = img.copy()
    img[ok] = out
    return img, int(gold.sum())


def bleed(img, valid, px=4):
    """Copy the nearest painted texel into the UV gutter, so filtering at seams stays clean."""
    gutter = ndimage.binary_dilation(valid, iterations=px) & ~valid
    _, (iy, ix) = ndimage.distance_transform_edt(~valid, return_indices=True)
    img = img.copy()
    img[gutter] = img[iy[gutter], ix[gutter]]
    return img


def clean(name):
    pos, uv, idx, img = read_glb(TRIPO / f'{name}.glb')
    P, N = texel_maps(pos, uv, idx, img.shape[:2])
    ok = ~np.isnan(P[..., 0])
    pts, nrm, rgb = P[ok], N[ok], img[ok].copy()
    for what, lo, hi, test, ref in RULES.get(name, []):
        c = classes(rgb)
        box = np.all((pts >= lo) & (pts <= hi), 1)
        sel = box & np.logical_or.reduce([c[w] for w in what.split('|')])
        if test is not None:
            sel &= test(pts, nrm)
        # the reference comes from the same neighbourhood, never from the texels being replaced
        near = np.all((pts >= np.array(lo) - 0.05) & (pts <= np.array(hi) + 0.05), 1)
        print(f'  {what:>14} -> {ref:<5} {fill(rgb, pts, sel, near & c[ref] & ~sel)} texels')
    print(f'  {"blue specks":>14}          {specks(rgb, pts)} texels')
    if name in ONE_TEAM_PIECE:
        print(f'  {"team strays":>14}          {strays(rgb, pts)} texels')
    out = img.copy()
    out[ok] = rgb
    if name in GOLD:
        out, n = gold_facets(out, P)
        print(f'  {"gold facets":>14}          {n} texels')
    out = bleed(out, ok)
    dst = TRIPO / 'tex' / f'{name}_clean.png'
    dst.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out).save(dst)
    np.save(TRIPO / 'tex' / f'{name}_pos.npy', P.astype(np.float32))
    print('  ->', dst.relative_to(ROOT))


def spec(name):
    """art/tripo/tex/<name>_spec.png: 255 where the paint is metal, from the clean texture."""
    img = np.asarray(Image.open(TRIPO / 'tex' / f'{name}_clean.png').convert('RGB'))
    P = np.load(TRIPO / 'tex' / f'{name}_pos.npy')
    ok = ~np.isnan(P[..., 0])
    c = classes(img[ok])
    metal = c['gold'].copy()
    for lo, hi, what in STEEL.get(name, []):
        metal |= np.all((P[ok] >= lo) & (P[ok] <= hi), 1) & np.logical_or.reduce([c[w] for w in what.split('|')])
    m = np.zeros(ok.shape, bool)
    m[ok] = metal
    m = ndimage.binary_opening(m, iterations=1)  # lone texels would glint as noise
    out = bleed(np.where(m, 255, 0).astype(np.uint8)[..., None].repeat(3, -1), ok)[..., 0]
    Image.fromarray(out).save(TRIPO / 'tex' / f'{name}_spec.png')
    print(f'  {"metal":>14}          {int(m.sum())} texels')


def main():
    args = sys.argv[1:]
    only_spec = '--spec' in args
    for name in (a for a in args if a != '--spec'):
        print(name)
        if not only_spec:
            clean(name)
        spec(name)


if __name__ == '__main__':
    main()
