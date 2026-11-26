"""The colour passes sprite.py runs on a full-size render, each measured against D:/new/ref.

Every one of them runs BEFORE the downscale, so a step or a line comes out of it anti-aliased and
as wide on every model, and in this order: tone (the body down, the lit faces back up) -> band
(value into flat tiers, chroma into a narrow one) -> inner_lines (the ink creases). sprite.py adds
the outline ink after all of them, so nothing here ever touches the edge.
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage


# AND IT IS NOT AS DARK AS THE PIECE IT RINGS (D116). Walking INWARD from every ground pixel whose
# neighbour is not ground -- 3.7k boundaries on our own seed 2 frame against 5k to 16k on each of
# the reference's forest frames, device pixels, no rescaling (our hex is 131 px tall and theirs
# 136, so a vertical profile compares 1:1) -- the reference's board does this at a piece's foot:
#   0.294  0.282  0.286  0.290  0.294  0.290  0.286   -- it steps down 0.012 and stays flat
# and ours did this:
#   0.290  0.239  0.231  0.259  0.298  0.318  0.329   -- a three pixel trough 0.106 under the body
# The reference does not ring its pieces at all: where one meets the ground the value steps to the
# piece's own shaded side, about 0.29, and holds. Ours cut a line DARKER THAN BOTH, and that line
# is this ink at 0.169 of value laid four texture px wide (the atlas shows it plainly: a unit or a
# building reads 0.173 0.173 0.173 0.173 for four rings before its body starts, where oak, pine and
# rocks -- GROVE_PX, one px -- read 0.176 then climb straight into theirs).
#
# So the ink is lifted to 0.259, which is where our own pieces' shaded sides already sit, hue and
# saturation untouched (23.5 deg, 0.53). The ring is still a 0.23 step under a 0.49 board, which is
# MORE separation than the reference gets from its own 0.29 against 0.44 -- the edge stays hard,
# it just stops being a drawn outline. Nothing here touches OUTLINE_PX: thinning the ink would move
# the area match (above) and grow every figure, and the board has been called crowded for size
# before. GROVE_INK goes up with it, same value, same board-cold hue.
INK = (66, 45, 31)
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
LINE = {
    'w': 1.3,      # line width in sprite px
    'd': 0.012,    # depth step that makes an occlusion line, in pass units (half a model unit)
    'n': 55.0,     # crease angle (degrees) that makes a crease line
    'ink': 0.9,    # how far an occlusion line goes to INK
    'crease': 0.5,
}

# AND A CEILING, ON THE SAME THREE PIECES. What a crown's value does above its 88th percentile,
# measured on three windows lying wholly inside reference crowns (D:/new/ref IMG_3717) against our
# own sprites' opaque pixels:
#                    p50            p88            p99            brightest px
#   reference   0.275-0.325    0.333-0.396    0.396-0.416    0.400-0.424
#   oak            0.341          0.400          0.494          0.514
#   rocks          0.341          0.396          0.463          0.502
#   pine           0.329          0.396          0.435          0.463
# The body is already there -- D93's tone pass put the median and the p88 inside the reference's own
# range -- and what is left is a TAIL the reference does not have: from p88 to p99 it climbs 0.020
# to 0.063 and then stops dead, where ours climbs 0.094 and keeps going. Those are the render's
# speculars, a few hundred pixels per piece, and they are what reads as plastic on a thing that is
# supposed to be a painted mass. So nothing on these three goes above the brightest pixel the
# reference's own crowns have: past `t` the remaining range is compressed by `c`, which leaves the
# median and the p88 where they are (11.7% of an oak's pixels are above 0.40 at all) and lands the
# brightest at about 0.43.
#
# NOT applied to the rest of the toned props: cactus sits at 0.580 of p88 on sand at 0.84 and
# snowpine at 0.502 on snow at 0.90-0.95, so this knee would cut their bodies by a tenth and a
# seventh, not just their tails. The litter is out too -- the reference's forest carries none.
GROVE_CAP = {'t': 0.40, 'c': 0.25}
# AND THEN IT IS PAINTED IN STEPS, NOT IN A GRADIENT (D117). A render shades a sphere smoothly and
# the reference paints a canopy in flat tiers, and that -- more than hue, value or outline -- is why
# a grove of ours reads as balloons and one of theirs as foliage. Counted rather than eyeballed, by
# the value histogram of a crop that is nothing but canopy: the reference's (IMG_3682, 595..765 x
# 1015..1205) piles up at 0.263-0.278, 0.341-0.353 and 0.392, and its six commonest levels +-1 cover
# 60.0% of the crop. Ours covered 39.4% (oak) and 30.0% (pine) -- a continuum, no tiers at all.
# So the three grove bodies are snapped to the reference's own tiers, with a fourth at the ceiling
# GROVE_CAP leaves: value only, each pixel's channels scaled, hue and saturation untouched exactly
# as the lift above does it. It runs on the full-size render, so each step comes out of the
# downscale as a one-px anti-aliased edge and not a staircase. Below 0.14 nothing is touched: that
# is the ink's and the deep undersides' range, and the band would only flatten them together.
GROVE_BAND = (0.263, 0.345, 0.392, 0.424)
# A PULL toward the tiers, not a snap: snapped outright (k = 1) those six levels covered 88.9% of
# an oak against the reference's 60.0%, and plates are as wrong as balloons -- it is painted in
# tiers AND shaded within them. 0.55 lands oak at 55.0% and pine at 63.6%, averaging its 60.0%.
GROVE_BAND_K = 0.55
# D122: AND A STONE IS NOT A CROWN. rocks rode the grove's ceiling and the grove's tiers because it
# is shaded like one, but the reference does not paint it like one: its boulder's value piles up at
# 0.45-0.53 (peak 0.478, p75 0.514) over a dark side at 0.23-0.34, where its CROWNS live at
# 0.263-0.424. That is the whole point of a rock on a meadow board -- the reference's sits 0.082
# ABOVE its own ground, a lit mass, and a tree sits below it. On GROVE_CAP's 0.40 ceiling ours
# topped out at 0.424 against a ground at 0.443, so the boulder read as a hole in the grass rather
# than a thing standing on it. Its own ceiling and its own two tiers, taken off that histogram.
ROCK_CAP = {'t': 0.48, 'c': 0.25, 'mul': 0.52}
ROCK_BAND = (0.270, 0.345, 0.420, 0.490)
# D118: AND THE GLOSS OFF ITS LOBES. GROVE_CAP capped the speculars' VALUE; their whiteness stayed.
# The reference's canopy holds saturation in a narrow band -- p10/median/p90 0.760/0.822/0.884,
# 0.38% of it under 0.7 of the median -- where ours ran 0.648/0.861/0.990 (oak) and 0.567/0.826/
# 0.977 (pine), 7.2% and 10.8% washed out: a white dot on every lobe. Chroma is pulled toward the
# body's own median by this much, hue and value untouched. Oak and pine only: snowpine's snow is
# deliberately desaturated and rock is grey at 0.04, so a pull to a median would paint them in.
GROVE_SAT_K = 0.30
GROVE_SAT = {'oak', 'pine'}
# D119: AND ITS SHADOW GOES BLUE, NOT JUST DARK. Top-to-bottom profile of one reference tree
# (IMG_3717, 250..420 x 790..960) against our own oak at board scale, six bands each:
#   reference  H 171.8 177.4 169.6 170.8 182.7 187.6   swing 18.0   darkest 10%: H 195.8 vs body 180.0
#   ours       H 174.8 174.5 175.4 178.6 181.0 174.7   swing  6.6   darkest 10%: H 183.2 vs body 175.8
# The reference's shade is +15.8 deg bluer than its own body; ours is +7.4, and the difference shows
# up at board level too -- the cold half of its frame sits at p75 182.8 against our 178.3. A render
# has no reason to do this: ambient in Blender is the same colour as the key, so our shadow is the
# body's own hue with the light taken out, where a painter drops the shade toward the sky. So the
# body is pulled toward the reference's own shadow colour -- H 195.8, S 0.877, V 0.259, i.e. about
# RGB (8, 51, 66) -- by how far the pixel's value has already fallen, VALUE UNTOUCHED (the target is
# renormalised to the pixel's own value before the mix and the result is scaled back to it), so this
# moves hue alone and never fights GROVE_BAND's tiers or GROVE_CAP's ceiling.
#   v0, v1  where the pull starts and reaches full: nothing above 0.33 is touched at all, which is
#           the tier GROVE_BAND's third level sits on -- the lit faces keep the material's own hue.
#   k       how far. Oak and pine only, same two pieces as GROVE_SAT: rock is grey at S 0.04, where
#           a pull to a blue would not deepen a shadow, it would paint the rock blue.
GROVE_COOL = {'rgb': (8, 51, 66), 'v0': 0.330, 'v1': 0.255, 'k': 0.90}
# D120: AND THE SHADE SITS AT THE EDGE, NOT ALL THROUGH THE CROWN. Measured on the INTERIOR of a
# crown alone -- the alpha eroded by 11 px so neither the outline nor the rim is in it, at the scale
# the board actually draws (0.716 of texture px, measured off getGlobalTransform, not the 0.38 this
# file used to assume) -- the reference's crown (IMG_3717, 250..420 x 790..960) is two flat tiers and
# almost nothing else: 56.5% of it at 0.345-0.355, 28.3% at 0.380-0.395, p10..p90 a span of 0.059,
# and only 2.1% below 0.32. Ours spans 0.122 (oak) and 0.082 (pine) over the same statistic, with
# p10 at 0.275: a tenth of our crown's INSIDE is as dark as the reference's deepest rim. GROVE_BAND
# puts the tiers in the right places, but a pull cannot fix this, because what makes the inside dark
# is the render -- every lobe of a seven-ball crown has its own terminator, so the shadow between two
# lobes is as deep in the middle of the crown as it is under its lowest branch.
#
# TRIED FIRST, AND MEASURED WORSE: rebuilding the crown out of twenty small lobes instead of seven
# big ones, which is what the reference's florets look like. It read as a bunch of grapes -- the
# share of the interior within 0.02 of its own local median fell from 88.6% to 66.3% and the span
# grew to 0.137, because the renderer gives every lobe, however small, its own full gradient. Smaller
# lobes buried half-inside a core ball (so only a bump shows) landed at 0.137 as well. The reference
# does not shade its florets at all: they are drawn as thin arcs on a flat mass, and OUR arcs are
# already drawn, by inner_lines on the geometry creases. So the geometry stays at seven lobes.
#
# What is left is a painter's rule: the shade belongs at the bottom and the outside of a mass, and
# the inside of it stays flat. So a dark pixel is lifted toward the middle tier by how deep inside
# the silhouette it sits -- nothing within d0 of the edge is touched (that is the reference's own
# dark rim, and the band cool() acts on), everything past d1 is lifted in full.
GROVE_FLAT = {'v': 0.345, 'd0': 0.055, 'd1': 0.150, 'k': 0.80}
# D121: AND THE LIT PATCH IS A MINORITY OF THE CROWN, NOT MOST OF IT. Same interior window as
# D120, the three shares the reference's crown splits into against ours:
#              below 0.32   0.32-0.37   above 0.37   median
#   reference      2.1%       68.1%        29.8%     0.353
#   oak            7.7%       33.3%        59.0%     0.384
#   pine           8.1%       32.4%        59.5%     0.388
# A painter gives a mass ONE mid tone and lights only what faces the sun; a render lights
# everything the key can see, and the key here is a sun at 4.9 against a world at 0.38. It is not
# TONE's lit ramp doing it -- only 13.4% of an oak's crown pixels get more than half of that lift --
# it is the render's own body, which tone() lands at 0.37-0.40 where the reference's sits at 0.345.
# So the body is pushed down between two anchors it does NOT move: lo is where D120 put the
# interior's floor and the reference's own p10 (both 0.333), hi is the ceiling GROVE_CAP leaves.
# Between them the normalised value is raised to a power, which is monotone -- no two values swap
# places, so nothing in the shading structure is lost, the mass just sits lower and the faces that
# were nearly at the ceiling stay near it. The gamma is swept against the same statistic and the
# gain saturates: the above-0.37 share runs 41.2% (g 3.4) -> 37.7 (4.4) -> 33.3 (6.8) -> 33.2 (8.5)
# -> 32.8 (11.0) against the reference's 29.8, and past 6.8 the median slips off the 0.345 tier that
# band() snaps it to. So 6.8 is the knee, and the rest of the gap is not the body's level at all.
GROVE_SPLIT = {'lo': 0.333, 'hi': 0.400, 'g': 6.80}


def split(im: Image.Image, cfg=GROVE_SPLIT) -> Image.Image:
    """Push a crown's body down to the mid tier, leaving the lit faces at the ceiling (D121)."""
    a = np.asarray(im).astype(np.float64)
    rgb = a[..., :3] / 255
    v = rgb.max(-1)
    m = (v > cfg['lo']) & (a[..., 3] > 128)
    t = np.clip((v - cfg['lo']) / (cfg['hi'] - cfg['lo']), 0, 1)
    nv = np.where(m, cfg['lo'] + (cfg['hi'] - cfg['lo']) * t ** cfg['g'], v)
    a[..., :3] = np.clip(rgb * (nv / np.maximum(v, 1e-6))[..., None], 0, 1) * 255
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), 'RGBA')


def flat(im: Image.Image, cfg=GROVE_FLAT) -> Image.Image:
    """Lift the shade out of the INSIDE of a mass, leaving it at the rim (D120)."""
    a = np.asarray(im).astype(np.float64)
    rgb = a[..., :3] / 255
    v = rgb.max(-1)
    body = a[..., 3] > 128
    d = ndimage.distance_transform_edt(body) / im.height
    t = np.clip((d - cfg['d0']) / (cfg['d1'] - cfg['d0']), 0, 1)
    w = cfg['k'] * t * t * (3 - 2 * t)
    lift = np.where(body & (v > 0.14), w * np.maximum(cfg['v'] - v, 0.0), 0.0)
    out = rgb * ((v + lift) / np.maximum(v, 1e-6))[..., None]
    a[..., :3] = np.clip(out, 0, 1) * 255
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), 'RGBA')


def read_pass(path: Path):
    """(normal (h, w, 3), depth (h, w), coverage (h, w)) from tripo.py's 16-bit geometry pass."""
    a = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)[..., [2, 1, 0, 3]].astype(np.float64) / 65535
    nx, ny = a[..., 0] * 2 - 1, a[..., 1] * 2 - 1
    nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
    return np.stack([nx, ny, nz], -1), a[..., 2], a[..., 3]


def disk(r: int):
    y, x = np.mgrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r + r


def inner_lines(im: Image.Image, geo, per_px: float, ink_rgb=None) -> Image.Image:
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
    ink = np.array(ink_rgb or INK, np.float64)
    k = np.where(occl, LINE['ink'], np.where(crease, LINE['crease'], 0.0))
    k = ndimage.gaussian_filter(k, 0.6)[..., None]
    a[..., :3] = a[..., :3] * (1 - k) + ink * k
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), 'RGBA')


def tone(im: Image.Image, geo, cap=None) -> Image.Image:
    """Move a scenery piece's body below the board and lift the faces the key light hits (D93).

    Runs on the full-size render, before the downscale, so the lift is anti-aliased with the rest.
    """
    a = np.asarray(im).astype(np.float64)
    rgb = a[..., :3] / 255
    v = rgb.max(-1)
    # 'mul' off the cap dict when a piece sets one: D93 sends scenery BELOW the board because a
    # tree is a dark mass on grass, and the reference's stone is not -- it sits above its own
    # ground (D122). Everything without one keeps TONE's own slope exactly.
    mul = TONE['mul'] if cap is None else cap.get('mul', TONE['mul'])
    down = np.where(v > TONE['floor'], TONE['floor'] + (v - TONE['floor']) * mul, v)
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
    if cap is not None:        # the ceiling: no pixel over the reference's own brightest crown
        v2 = out.max(-1)
        up = np.where(v2 > cap['t'], cap['t'] + (v2 - cap['t']) * cap['c'], v2)
        out = out * (up / np.maximum(v2, 1e-6))[..., None]
    mx = out.max(-1, keepdims=True)
    sat0 = np.where(mx[..., 0] > 1e-6, (mx[..., 0] - out.min(-1)) / np.maximum(mx[..., 0], 1e-6), 0)
    w = np.clip((sat0 - TONE['s0']) / (TONE['s1'] - TONE['s0']), 0, 1)
    k = 1 + (TONE['sat'] - 1) * (w * w * (3 - 2 * w))
    out = mx - (mx - out) * k[..., None]
    a[..., :3] = np.clip(out, 0, 1) * 255
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), 'RGBA')


def band(im: Image.Image, levels, k: float = GROVE_BAND_K, sat: bool = False) -> Image.Image:
    """Pull a body's value toward flat tiers (D117), and its chroma together (D118)."""
    a = np.asarray(im).astype(np.float64)
    rgb = a[..., :3] / 255
    v = rgb.max(-1)
    lv = np.asarray(levels, np.float64)
    snap = v + k * (lv[np.abs(v[..., None] - lv).argmin(-1)] - v)
    m = (v > 0.14) & (a[..., 3] > 128)
    out = np.where(m[..., None], rgb * (snap / np.maximum(v, 1e-6))[..., None], rgb)
    if sat:                            # the gloss off the lobes: chroma toward the body's own
        vv = out.max(-1)               # median, hue and value untouched (D118)
        sv = 1 - out.min(-1) / np.maximum(vv, 1e-6)
        med = float(np.median(sv[m]))
        f = np.where(m & (sv > 1e-6), (med + (sv - med) * GROVE_SAT_K) / np.maximum(sv, 1e-6), 1.0)
        out = vv[..., None] - (vv[..., None] - out) * f[..., None]
    a[..., :3] = np.clip(out, 0, 1) * 255
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), 'RGBA')


def cool(im: Image.Image, cfg=GROVE_COOL) -> Image.Image:
    """Drop a body's shade toward the sky's colour, hue only (D119)."""
    a = np.asarray(im).astype(np.float64)
    rgb = a[..., :3] / 255
    v = rgb.max(-1)
    m = (v > 0.14) & (a[..., 3] > 128)
    t = np.clip((cfg['v0'] - v) / (cfg['v0'] - cfg['v1']), 0, 1)
    w = np.where(m, cfg['k'] * t * t * (3 - 2 * t), 0.0)[..., None]
    tgt = np.asarray(cfg['rgb'], np.float64) / max(cfg['rgb']) * v[..., None]
    out = rgb * (1 - w) + tgt * w
    # value back exactly where it was; saturation is deliberately NOT restored. The reference's own
    # shade is MORE saturated than its body (S 0.877 against 0.820) where a render's is less (ours
    # 0.797 against 0.857), and the target carries S 0.879, so the mix walks that gap: it lands pine
    # at 0.852 over its body's 0.828 and oak at 0.810 under its 0.861. Restoring S was tried and is
    # 7 lines for nothing -- it moves the band back by 0.009 and gives up that gain.
    out = out * (v / np.maximum(out.max(-1), 1e-6))[..., None]
    a[..., :3] = np.clip(out, 0, 1) * 255
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), 'RGBA')
