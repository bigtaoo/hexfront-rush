"""The corgi theme's sticker pass: makes separately generated pictures look drawn by one hand
(CLAUDE.md art rule: thick outline, flat colours, one hard cel shadow), judged at the size the
game draws them.

Every sheet came out of its own generation, so line weights differ, and hatching, fur strands,
greebles and soft shading turn to grey noise at a mob's 80 world units. Per picture this:
  1. keeps the near-black drawn lines as ink and fills fainter strokes (hatching, strands)
     thinner than THIN world units with the colour around them;
  2. sorts the colours into a few materials by hue and chroma, shared by all of the picture's
     frames so an animation does not flicker (hot accents such as red eyes keep their own), and
     cuts each material's smoothed lightness into at most TONES flat tones: light, base and one
     hard shadow;
  3. smooths every boundary with a majority filter and drops specks under SPECK world units;
  4. paints the ink lines one ink colour and redraws one outline OUTLINE world units wide round
     the silhouette and its see-through holes, half outside the old edge, half over it.
With flat=False only step 4 runs: the big, cleanly painted pictures (elites, bosses, props,
icons, items) keep their paint and get the shared outline. Glowing effects get neither.
`scale` is sheet pixels per world unit (a mob sheet's `height` over the units the game draws it,
a prop's pixels over its world size).

Used by the builds (bake_mob.py's "sticker" spec key; corgi_art.py's deco, icons and items) and
standalone: python tools/sticker_pass.py <in.png> <out.png> <scale> [--keep-size]"""
import sys

import cv2
import numpy as np
from PIL import Image

INK = np.array([0x14, 0x0C, 0x18], np.float32)  # hordeView.ts OUTLINE, the mobs' run-time ink
OUTLINE = 2.2    # world units, total
OUT_SHARE = 0.5  # of it outside the old silhouette
INK_L = 55       # Lab lightness (0..255) under which a thin stroke is a drawn line
LINE = 2.4       # world units: dark areas wider than this are shadow, not line
DASH = 3.5       # world units: shorter dark marks are texture, not line
LINE_DELTA = 32  # Lab lightness a thin stroke must sit under its surroundings to be a line
THIN = 1.4       # world units: fainter darker strokes narrower than this are filled in
SPECK = 1.2      # world units: flat areas narrower than this give way to their neighbours
SMOOTH = 1.0     # world units: mean-shift radius, and the majority filter's
MATERIALS = 6    # colours of stuff (shell, belly, legs, ...), told apart by hue and chroma
HUE_L = 0.6      # lightness weight when telling materials apart
TONES = 3        # flat tones per material at most: shadow, base, light
BAND = 1.5       # world units: lightness smoothing before it is cut into tones
MIN_STEP = 7     # Lab lightness: tones closer than this stay one
HOT = 2          # materials for hot accents (eyes, glows)


def _nearest(solid):
    """For every pixel, the flat index of its nearest pixel in `solid`."""
    _, lab = cv2.distanceTransformWithLabels((~solid).astype(np.uint8), cv2.DIST_L2, 5,
                                             labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(solid)
    idx = np.zeros(lab.max() + 1, np.int64)
    idx[lab[ys, xs]] = ys * solid.shape[1] + xs
    return idx[lab]


def _fill_from(img, keep):
    """Pixels outside `keep` take their nearest kept neighbour's value."""
    if keep.all() or not keep.any():
        return img
    flat = img.reshape(-1, *img.shape[2:])
    return flat[_nearest(keep)].reshape(img.shape)


def _disc(d):
    d = max(1, int(round(d)))
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (d, d))


def _clean(rgb, solid, scale):
    """Step 1: the ink lines, and the colours under them with faint strokes filled, flattened."""
    rgb = _fill_from(rgb, solid)
    light = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)[:, :, 0].astype(np.float32)
    # a line is thin and dark: near black, or much darker than what is round it; dark areas
    # wider than LINE world units are shadow, not line
    around = cv2.morphologyEx(light, cv2.MORPH_CLOSE, _disc(LINE * scale))
    dark = (((light < INK_L) | (around - light > LINE_DELTA)) & solid).astype(np.uint8)
    wide = cv2.dilate(cv2.morphologyEx(dark, cv2.MORPH_OPEN, _disc(LINE * scale)), _disc(3))
    ink = (dark > 0) & (wide == 0)
    # dots and specks (texture, not drawing) go: a line runs at least DASH world units
    n, cc, stats, _ = cv2.connectedComponentsWithStats(ink.astype(np.uint8), connectivity=8)
    small = np.maximum(stats[:, cv2.CC_STAT_WIDTH], stats[:, cv2.CC_STAT_HEIGHT]) < DASH * scale
    small[0] = False
    ink &= ~small[cc]
    base = _fill_from(rgb, solid & ~ink)
    closed = cv2.morphologyEx(base, cv2.MORPH_CLOSE, _disc(THIN * scale))
    lc = cv2.cvtColor(closed, cv2.COLOR_RGB2LAB)[:, :, 0].astype(np.float32)
    lb = cv2.cvtColor(base, cv2.COLOR_RGB2LAB)[:, :, 0].astype(np.float32)
    base = np.where(((lc - lb) > 14)[:, :, None], closed, base)
    sp = max(2, int(round(SMOOTH * scale)))
    return cv2.pyrMeanShiftFiltering(np.ascontiguousarray(base), sp, 20, maxLevel=1), ink


def _hot(lab):
    """Hot accents: saturated reds, oranges and yellows (eyes, glows) that must keep their hue."""
    a, b = lab[:, 1] - 128, lab[:, 2] - 128
    hue = np.degrees(np.arctan2(b, a))
    return (np.hypot(a, b) > 45) & (hue > -10) & (hue < 100)


def _palette(samples, k):
    if len(samples) <= k:
        return samples.astype(np.float32)
    data = samples.astype(np.float32)
    if len(data) > 60000:
        data = data[np.random.default_rng(1).choice(len(data), 60000, replace=False)]
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.5)
    cv2.setRNGSeed(7)
    _, _, centres = cv2.kmeans(data, k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    return centres


def _snap(lab, centres):
    return ((lab[:, None, :] - centres[None, :, :]) ** 2).sum(2).argmin(1)


def _majority(labels, solid, scale):
    """Step 3: each pixel takes the label most common around it, so edges run smooth; then
    areas thinner than SPECK give way to their neighbours."""
    vals = np.unique(labels[solid])
    if len(vals) < 2:
        return labels
    sig = max(0.6, SMOOTH * scale * 0.6)
    best, score = labels.copy(), np.full(labels.shape, -1.0, np.float32)
    for v in vals:
        s = cv2.GaussianBlur(((labels == v) & solid).astype(np.float32), (0, 0), sig)
        better = s > score
        best[better], score[better] = v, s[better]
    out = np.where(solid, best, labels)
    k = _disc(SPECK * scale)
    keep = np.zeros(solid.shape, bool)
    for v in vals:
        m = ((out == v) & solid).astype(np.uint8)
        keep |= (cv2.dilate(cv2.morphologyEx(m, cv2.MORPH_OPEN, k), _disc(2)) & m) > 0
    if keep.any() and (solid & ~keep).any():
        out = np.where(solid & ~keep, _fill_from(out, keep), out)
    return out


def _bands(lab, mat, solid, scale):
    """Within each material, the lightness smoothed over BAND world units and cut into at most
    TONES flat tones; returns a tone index per pixel (0 darkest)."""
    L = lab[:, :, 0]
    sig = BAND * scale
    tone = np.zeros(mat.shape, np.int32)
    for v in np.unique(mat[solid]):
        m = ((mat == v) & solid).astype(np.float32)
        sm = cv2.GaussianBlur(L * m, (0, 0), sig) / np.maximum(cv2.GaussianBlur(m, (0, 0), sig), 1e-3)
        vals = sm[m > 0]
        lo, hi = vals.min(), vals.max()
        cuts = [q for q in np.percentile(vals, [100 * (i + 1) / TONES for i in range(TONES - 1)])
                if q - lo > MIN_STEP and hi - q > MIN_STEP]
        cuts = [c for i, c in enumerate(cuts) if i == 0 or c - cuts[i - 1] > MIN_STEP]
        tone[m > 0] = np.searchsorted(np.array(cuts), vals) if cuts else 0
    return tone


def _outline(rgb, alpha, ink, scale, grow):
    """Step 4: ink lines in the ink colour, and one outline OUTLINE world units wide."""
    solid = alpha >= 128
    width = OUTLINE * scale
    out_w = width * OUT_SHARE if grow else 0.0
    in_w = width - out_w
    d_out = cv2.distanceTransform((~solid).astype(np.uint8), cv2.DIST_L2, 5)
    d_in = cv2.distanceTransform(solid.astype(np.uint8), cv2.DIST_L2, 5)
    cover = np.maximum(np.clip(in_w - d_in + 0.5, 0, 1), ink.astype(np.float32)) * solid
    mix = np.where(solid, cover, 1.0)[:, :, None]
    rgb = rgb * (1 - mix) + INK * mix
    if grow:
        a = np.where(solid, 1.0, np.maximum(np.clip(out_w - d_out + 0.5, 0, 1), alpha / 255.0))
    else:
        a = np.where(solid, 1.0, alpha / 255.0)
    return rgb, a


def sticker(frames, scale, grow=True, materials=MATERIALS, flat=True):
    """frames: RGBA uint8 arrays (straight alpha), one picture's frames sharing a palette.
    Returns them made sticker-like, the same sizes; with grow=False the outline stays inside
    the old silhouette (for pictures with no room round them). flat=False only redraws the
    outline, for big pictures drawn clean already, which posterizing would only roughen."""
    if not flat:
        return [_outline_only(f, scale, grow) for f in frames]
    cleaned, inks, solids = [], [], []
    for f in frames:
        solid = f[:, :, 3] >= 128
        rgb, ink = _clean(np.ascontiguousarray(f[:, :, :3]), solid, scale) if solid.any() else (f[:, :, :3], solid)
        cleaned.append(rgb)
        inks.append(ink)
        solids.append(solid)
    if not any(s.any() for s in solids):
        return [f.copy() for f in frames]
    labs = [cv2.cvtColor(c, cv2.COLOR_RGB2LAB).astype(np.float32) for c in cleaned]
    pix = np.concatenate([lab.reshape(-1, 3)[(s & ~i).reshape(-1)] for lab, s, i in zip(labs, solids, inks)])
    w = np.array([HUE_L, 1, 1], np.float32)
    hot = _hot(pix)
    centres = _palette(pix[~hot] * w, materials) if (~hot).any() else np.zeros((0, 3), np.float32)
    if hot.sum() > 20:
        centres = np.concatenate([centres, _palette(pix[hot] * w, HOT)])
    out = []
    for f, lab, solid, ink in zip(frames, labs, solids, inks):
        h, w_ = solid.shape
        mat = _snap(lab.reshape(-1, 3) * w, centres).reshape(h, w_)
        mat = _majority(mat, solid, scale)
        key = _majority(mat * TONES + _bands(lab, mat, solid, scale), solid, scale)
        ink = (cv2.GaussianBlur(ink.astype(np.float32), (0, 0), max(0.5, 0.35 * scale)) > 0.45) & solid
        rgb = np.zeros((h, w_, 3), np.float32)
        flat, kf, sf = lab.reshape(-1, 3), key.reshape(-1), solid.reshape(-1)
        for v in np.unique(kf[sf]):
            sel = (kf == v) & sf
            c = np.median(flat[sel], axis=0)
            rgb.reshape(-1, 3)[sel] = cv2.cvtColor(np.clip(c, 0, 255).astype(np.uint8)[None, None], cv2.COLOR_LAB2RGB)[0, 0]
        rgb, a = _outline(rgb, f[:, :, 3].astype(np.float32), ink, scale, grow)
        rgba = np.dstack([np.clip(rgb, 0, 255), a * 255]).round().astype(np.uint8)
        rgba[a <= 0] = 0
        out.append(rgba)
    return out


def _outline_only(f, scale, grow):
    rgb, a = _outline(f[:, :, :3].astype(np.float32), f[:, :, 3].astype(np.float32),
                      np.zeros(f.shape[:2], bool), scale, grow)
    rgba = np.dstack([np.clip(rgb, 0, 255), a * 255]).round().astype(np.uint8)
    rgba[a <= 0] = 0
    return rgba


def main():
    src, dst, scale = sys.argv[1], sys.argv[2], float(sys.argv[3])
    im = np.array(Image.open(src).convert("RGBA"))
    Image.fromarray(sticker([im], scale, "--keep-size" not in sys.argv)[0]).save(dst)


if __name__ == "__main__":
    main()
