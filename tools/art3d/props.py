"""The terrain props and the event markers: the same turned-wood toys as the buildings.

Kept apart from builds.py and toys.py so each stays inside the project's 500-line rule. toys.py
imports this late (the primitives have to exist first) and merges MODELS, YAW, ELEVS and TEAMLESS.

None of these belongs to a player, so they are all teamless: one picture, no team colour. What
they have to do is read at 34-60 CSS pixels against a busy map, which means:
  * one silhouette per prop, and nothing thinner than the ink outline;
  * two values in every mass (a crown is light green over dark green, a rock light over slate),
    because a single flat colour at that size is a blob;
  * props are seen from higher up than the troops (ELEV 42 by default), so what the player
    mostly gets is the TOP of the thing - the top is where the colour and the detail belong.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from prim import ball, block, lathe, prism, rod  # noqa: E402

# A tree is nearly all crown seen from above at 42 degrees, so the trees drop the camera to see
# some trunk; the flat pieces (chest, hoard, camp) keep the high view that shows their contents.
ELEVS = {'oak': 32, 'pine': 30, 'snowpine': 30, 'cactus': 34, 'arch': 30, 'rocks': 38,
         'ice': 34, 'chest': 40, 'hoard': 44, 'camp': 38, 'warband': 34, 'mystery': 34}
# The ground decoration is looked at from higher up than anything else in the set: these are things
# lying ON the ground, and at 30-44 degrees a pebble three pixels tall is seen edge-on and vanishes.
ELEVS.update({n: 52 for n in ('tuft', 'flowers', 'pebbles', 'stones', 'drybush', 'drift', 'twigs')})


def _ground(r, mat='shade', z=0.022, scale=(1.0, 1.0, 1), loc=(0, 0, 0), seg=28):
    """The little patch of ground a prop stands on: what gives it a base line on the map.

    Dark, not moss (prim.py 'shade', D100): the disc faces straight up into the key and is the one
    surface in the set that blows out, so a mid green here came back off the board as a bright ring
    around a dark crown. A base line is a shadow, and a shadow is darker than what it falls on.
    """
    return lathe([(r, 0), (r, z), (0.0, z)], mat, loc=loc, seg=seg, name='ground', scale=scale)


def _trunk(r0, r1, h, loc=(0, 0, 0), mat='brown'):
    return lathe([(r0, 0), (r0 * 0.92, h * 0.18), (r1 * 1.06, h * 0.7), (r1, h), (0.0, h)], mat,
                 loc=loc, seg=20, name='trunk')


def _rockpile(slabs, mossy=()):
    """Slabs cut at angles. A rock turned on the lathe is a wedding cake from above, and a rock
    with a big bevel is a bar of soap - the angles and the small bevel are the whole trick."""
    for (x, y, z, w, d, h, rx, ry, rz, mat) in slabs:
        block((w, d, h), mat, (x, y, z), rot=(rx, ry, rz), bevel=0.02, name='rock')
    for (x, y, z, s, rx, ry, rz) in mossy:
        block((s, s * 0.8, 0.03), 'moss', (x, y, z), rot=(rx, ry, rz), bevel=0.014, name='moss')


# ---------------------------------------------------------------- the trees


def model_oak():
    """A broadleaf: a bare trunk under a crown built from three flattened balls, the back ones
    darker. One ball is a lollipop; three at different heights make a crown with a top to it."""
    _ground(0.40, scale=(1.1, 1.0, 1))
    _trunk(0.11, 0.075, 0.52, loc=(0, 0, 0.02))
    for (bx, by, bz, r, mat) in ((-0.17, 0.14, 0.60, 0.29, 'deepgreen'),
                                 (0.19, 0.12, 0.66, 0.27, 'deepgreen'),
                                 (-0.09, -0.24, 0.57, 0.25, 'deepgreen'),
                                 (0.22, -0.17, 0.59, 0.23, 'deepgreen'),
                                 (0.02, -0.06, 0.74, 0.33, 'green'),
                                 (-0.15, -0.02, 0.90, 0.24, 'green'),
                                 (0.16, 0.00, 0.94, 0.21, 'green')):
        ball(r, mat, (bx, by, bz), scale=(1.0, 0.95, 0.78), name='leaf')
    # two boughs showing under the crown, so the trunk does not run straight into a ball
    for s in (1, -1):
        rod(0.045, 0.26, 'brown', (s * 0.10, 0.02, 0.50), rot=(0, s * 0.8, 0), name='bough')
    return 1.2


def model_pine():
    """A conifer: three skirts stacked on a short trunk, each one clear of the one above it. The
    steps between skirts are the only thing that tells a pine from a green triangle at 60 px."""
    _ground(0.36, scale=(1.05, 1.0, 1))
    _trunk(0.095, 0.07, 0.26, loc=(0, 0, 0.02))
    for (z, r, h, mat) in ((0.20, 0.40, 0.40, 'deepgreen'), (0.50, 0.32, 0.38, 'green'),
                           (0.78, 0.23, 0.38, 'green')):
        lathe([(r, 0), (r * 0.98, h * 0.08), (r * 0.55, h * 0.52), (0.0, h)], mat, loc=(0, 0, z),
              seg=24, name='skirt')
    return 1.3


def model_snowpine():
    """The same conifer under snow: a white cap on every skirt and a drift round the foot. The
    snow has to sit ON the skirts, not coat them, or the tree turns into a white cone."""
    _ground(0.38, 'frost', scale=(1.08, 1.0, 1))
    _trunk(0.095, 0.07, 0.26, loc=(0, 0, 0.02))
    for (z, r, h) in ((0.20, 0.40, 0.40), (0.50, 0.32, 0.38), (0.78, 0.23, 0.38)):
        lathe([(r, 0), (r * 0.98, h * 0.08), (r * 0.55, h * 0.52), (0.0, h)], 'deepgreen',
              loc=(0, 0, z), seg=24, name='skirt')
        lathe([(r * 0.80, h * 0.24), (r * 0.52, h * 0.56), (0.0, h + 0.03)], 'frost', loc=(0, 0, z),
              seg=24, name='snow')
    for (sx, sy, sr) in ((-0.26, -0.12, 0.17), (0.24, -0.06, 0.14), (0.06, 0.26, 0.13)):
        ball(sr, 'frost', (sx, sy, 0.04), scale=(1, 1, 0.45), name='drift')
    return 1.3


# ---------------------------------------------------------------- the stone and the ice


def model_rocks():
    """A boulder with splinters round its foot."""
    _ground(0.46, scale=(1.15, 1.0, 1))
    # a box with a flat top is a crate however it is tilted, so the main mass is turned on the
    # lathe with five sides: an uneven faceted lump whose top comes to no flat face at all
    lathe([(0.30, 0), (0.38, 0.09), (0.34, 0.25), (0.20, 0.40), (0.0, 0.48)], 'grey',
          loc=(-0.06, 0.04, 0.02), seg=5, name='boulder', scale=(1.22, 0.96, 1))
    lathe([(0.20, 0), (0.25, 0.06), (0.20, 0.17), (0.0, 0.27)], 'slate',
          loc=(0.26, -0.12, 0.02), seg=5, name='boulder2', scale=(1.0, 1.15, 1))
    for (x, y, z, w, d, h, rx, ry, rz) in (
            (0.34, -0.30, 0.06, 0.21, 0.18, 0.11, 0.18, -0.22, 0.70, ),
            (-0.36, -0.14, 0.06, 0.24, 0.20, 0.12, -0.16, 0.26, -0.85),
            (-0.22, 0.26, 0.09, 0.19, 0.16, 0.17, 0.12, 0.30, 0.35)):
        block((w, d, h), 'slate', (x, y, z), rot=(rx, ry, rz), bevel=0.02, name='shard')
    # no moss on this one: a green patch on a curved face reads as a cut hole at map size, and
    # the grey lump over the slate splinters already carries the two values the prop needs
    return 0.8


def model_ice():
    """An ice field: shards standing at angles out of a frozen floor. Everything is pale, so the
    shards are kept narrow and well apart - a clump of them is a white puddle."""
    _ground(0.48, 'frost', z=0.035, scale=(1.18, 1.0, 1))
    # the two tall ones stand straight, so they can be turned on the lathe and come to a point;
    # lathe cannot be tilted, so the leaning splinters are blocks with their tops chopped off
    for (x, y, h, w) in ((-0.09, 0.00, 0.80, 0.155), (0.19, 0.13, 0.54, 0.125)):
        lathe([(w, 0), (w * 0.88, h * 0.42), (w * 0.40, h * 0.80), (0.0, h)], 'ice',
              loc=(x, y, 0.02), seg=6, name='spire')
    for (x, y, z, w, d, h, rx, ry, rz) in ((-0.30, 0.10, 0.19, 0.13, 0.12, 0.42, 0.10, 0.26, 0.8),
                                           (0.10, -0.23, 0.14, 0.12, 0.11, 0.32, -0.22, -0.14, -0.3),
                                           (0.31, -0.08, 0.11, 0.10, 0.10, 0.26, 0.16, -0.30, 0.4)):
        block((w, d, h), 'ice', (x, y, z), rot=(rx, ry, rz), bevel=0.012, name='shard')
    for (fx, fy, fr) in ((-0.22, -0.16, 0.14), (0.26, 0.20, 0.12)):
        ball(fr, 'frost', (fx, fy, 0.045), scale=(1, 1, 0.4), name='rime')
    return 1.1


def model_arch():
    """A weathered stone arch: two piers under a round head, with the sky showing through. The
    hole is the whole piece, so it is cut big and the stone round it is kept thin."""
    _ground(0.44, scale=(1.2, 0.9, 1))
    for s in (1, -1):
        block((0.20, 0.26, 0.62), 'stone', (s * 0.33, 0.0, 0.33), rot=(0, s * 0.03, 0),
              bevel=0.02, name='pier')
        block((0.26, 0.30, 0.05), 'grey', (s * 0.33, 0.0, 0.665), bevel=0.012, name='impost')
    # the head: blocks laid round a half circle, which is what makes it masonry and not a hoop
    for k in range(7):
        a = math.pi * (k + 0.5) / 7
        block((0.17, 0.28, 0.14), 'stone', (0.46 * math.cos(a), 0.0, 0.69 + 0.40 * math.sin(a)),
              rot=(0, math.pi / 2 - a, 0), bevel=0.016, name='voussoir')
    block((0.14, 0.30, 0.09), 'grey', (0.0, 0.0, 1.14), bevel=0.014, name='keystone')
    block((0.14, 0.22, 0.035), 'moss', (-0.33, 0.04, 0.692), bevel=0.014, name='moss')
    block((0.12, 0.20, 0.035), 'moss', (0.33, -0.02, 0.692), bevel=0.014, name='moss')
    block((0.035, 0.20, 0.20), 'moss', (-0.435, 0.02, 0.26), bevel=0.014, name='moss')
    return 1.3


def model_cactus():
    """A desert cactus: one thick column with two arms, ribbed, with a flower on top. The arms
    go to opposite sides at different heights - level arms make a candlestick."""
    _ground(0.40, 'tan', scale=(1.12, 1.0, 1))
    for (sx, sy, sr) in ((-0.26, 0.10, 0.10), (0.28, -0.06, 0.08)):
        ball(sr, 'tan', (sx, sy, 0.03), scale=(1, 1, 0.5), name='sand')
    lathe([(0.17, 0), (0.185, 0.10), (0.175, 0.72), (0.145, 0.84), (0.0, 0.90)], 'ogredark',
          loc=(0, 0, 0.02), seg=10, name='stem')
    for (s, z, h) in ((1, 0.40, 0.42), (-1, 0.26, 0.34)):
        rod(0.085, 0.24, 'ogredark', (s * 0.16, 0, z + 0.02), rot=(0, s * math.pi / 2, 0), seg=10,
            name='elbow')
        lathe([(0.095, 0), (0.095, h - 0.05), (0.0, h)], 'ogredark', loc=(s * 0.27, 0, z - 0.06),
              seg=10, name='arm')
    for (fx, fz) in ((0.0, 0.92), (0.27, 0.78), (-0.27, 0.56)):
        lathe([(0.055, 0), (0.07, 0.04), (0.0, 0.07)], 'pink', loc=(fx, 0, fz), seg=12,
              name='flower')
    return 1.1


# ---------------------------------------------------------------- the event markers


def model_chest():
    """A treasure chest, open, with gold showing over the rim. At 34 px the lid being OPEN is the
    only thing that says treasure - a shut box is a crate."""
    _ground(0.34, scale=(1.2, 1.0, 1))
    block((0.56, 0.40, 0.26), 'brown', (0, 0, 0.16), bevel=0.025, name='body')
    for x in (-0.19, 0.19):
        block((0.055, 0.42, 0.28), 'darkwood', (x, 0, 0.16), bevel=0.008, name='band')
    block((0.58, 0.42, 0.035), 'gold', (0, 0, 0.30), bevel=0.008, name='rim')
    for (dx, dy, r) in ((-0.13, 0.02, 0.075), (0.04, -0.04, 0.08), (0.14, 0.04, 0.07),
                        (-0.02, 0.07, 0.065)):
        ball(r, 'nugget', (dx, dy, 0.31), scale=(1, 1, 0.8), name='gold')
    # the lid, thrown back: a half barrel leaning away from the player
    block((0.56, 0.36, 0.07), 'brown', (0, 0.30, 0.44), rot=(-1.15, 0, 0), bevel=0.02,
          name='lid')
    for x in (-0.19, 0.19):
        block((0.055, 0.38, 0.085), 'darkwood', (x, 0.30, 0.44), rot=(-1.15, 0, 0), bevel=0.008,
              name='lidband')
    block((0.58, 0.07, 0.045), 'gold', (0, 0.155, 0.325), rot=(-1.15, 0, 0), bevel=0.008,
          name='lidrim')
    block((0.10, 0.09, 0.09), 'gold', (0, -0.205, 0.265), bevel=0.012, name='lock')
    return 0.7


def model_hoard():
    """A heap of loot tipped out on the ground: coins, a few big nuggets and two gems."""
    _ground(0.42, scale=(1.2, 1.0, 1))
    for (dx, dy, dz, r) in ((-0.15, 0.03, 0.0, 0.105), (0.15, -0.02, 0.0, 0.10),
                            (0.02, 0.15, 0.0, 0.095), (-0.03, -0.14, 0.0, 0.105),
                            (-0.06, 0.03, 0.115, 0.10), (0.08, 0.01, 0.125, 0.095),
                            (0.01, -0.02, 0.235, 0.09)):
        ball(r, 'nugget', (dx, dy, dz + r * 0.7), scale=(1, 1, 0.82), name='nugget')
    # coin stacks: three or four discs on top of each other, which is what says money
    for (cx, cy, n) in ((-0.32, -0.06, 4), (0.33, 0.12, 3), (0.12, -0.30, 3)):
        for k in range(n):
            lathe([(0.082, 0), (0.082, 0.026), (0.0, 0.026)], 'gold',
                  loc=(cx, cy, 0.03 + k * 0.026), seg=16, name='coin')
    for (cx, cy) in ((-0.20, 0.27), (0.26, -0.24)):
        lathe([(0.082, 0), (0.082, 0.026), (0.0, 0.026)], 'gold', loc=(cx, cy, 0.03), seg=16,
              name='coin')
    for (gx, gy, mat) in ((-0.21, -0.17, 'pink'), (0.20, 0.20, 'ice')):
        lathe([(0.0, 0), (0.062, 0.045), (0.048, 0.075), (0.0, 0.115)], mat, loc=(gx, gy, 0.02),
              seg=6, name='gem')
    return 0.6


def model_camp():
    """A traveller's camp: a tent, a fire and a log to sit on. Three things, well apart, because
    at 46 px a camp drawn as one cluster is a smudge."""
    _ground(0.46, scale=(1.18, 1.0, 1))
    prism(0.50, 0.44, 0.38, 'cream', (-0.18, 0.12, 0.03))
    rod(0.024, 0.56, 'darkwood', (-0.18, 0.12, 0.415), rot=(0, math.pi / 2, 0), name='ridge')
    for s in (1, -1):  # the guy ropes' pegs, which is what pins a tent to the ground
        rod(0.016, 0.26, 'darkwood', (-0.18 + s * 0.30, 0.12, 0.17), rot=(0, s * 0.5, 0),
            name='guy')
    block((0.155, 0.04, 0.33), 'opening', (-0.175, -0.098, 0.175), bevel=0.0, name='door')
    block((0.06, 0.05, 0.35), 'cream', (-0.272, -0.115, 0.185), rot=(0, 0.14, 0), bevel=0.012,
          name='flap')
    lathe([(0.17, 0), (0.17, 0.03), (0.0, 0.03)], 'slate', loc=(0.30, -0.14, 0.02), seg=14,
          name='hearth')
    for (fa, fz) in ((0.4, 0.06), (1.9, 0.07), (-0.8, 0.05)):
        rod(0.034, 0.30, 'darkwood', (0.30, -0.14, fz), rot=(0, 1.35, fa), name='log')
    lathe([(0.11, 0), (0.08, 0.10), (0.03, 0.17), (0.0, 0.26)], 'yellow', loc=(0.30, -0.14, 0.10),
          seg=10, name='flame')
    lathe([(0.06, 0), (0.04, 0.07), (0.0, 0.13)], 'pink', loc=(0.30, -0.14, 0.22), seg=8,
          name='flametip')
    return 0.8


def model_warband():
    """A war party's sign: three spears and a shield planted in the ground, with a helm on one.
    Teamless, so the shield is bare wood with an iron boss rather than a colour."""
    _ground(0.40, scale=(1.1, 1.0, 1))
    for (sx, sy, h) in ((-0.20, 0.10, 0.80), (0.01, 0.16, 0.98), (0.22, 0.06, 0.88)):
        rod(0.030, h, 'brown', (sx, sy, h / 2 + 0.02), name='shaft')
        rod(0.044, 0.05, 'darkwood', (sx, sy, h - 0.05), name='collar')
        lathe([(0.065, 0), (0.075, 0.07), (0.045, 0.17), (0.0, 0.26)], 'silver',
              loc=(sx, sy, h + 0.02), seg=12, name='head')
    block((0.46, 0.09, 0.54), 'wood', (-0.06, -0.26, 0.31), rot=(0.24, 0, 0.08), bevel=0.07,
          name='shield')
    block((0.055, 0.05, 0.56), 'darkwood', (-0.06, -0.311, 0.32), rot=(0.24, 0, 0.08),
          bevel=0.008, name='shieldband')
    ball(0.090, 'silver', (-0.06, -0.325, 0.32), scale=(1, 0.5, 1), name='boss')

    return 1.1


def model_mystery():
    """The unknown event: a signpost with a carved question mark hanging from it, and nothing
    else. The mark is built from blocks rather than a font, so it carves like the rest."""
    _ground(0.36, scale=(1.1, 1.0, 1))
    rod(0.045, 0.86, 'brown', (-0.14, 0.04, 0.45), name='post')
    rod(0.030, 0.34, 'brown', (0.02, 0.04, 0.86), rot=(0, math.pi / 2, 0), name='arm')
    rod(0.010, 0.10, 'black', (0.14, 0.04, 0.80), name='hook')
    block((0.40, 0.045, 0.34), 'wood', (0.14, 0.04, 0.57), bevel=0.02, name='board')
    block((0.42, 0.05, 0.030), 'darkwood', (0.14, 0.04, 0.735), bevel=0.006, name='boardtop')
    block((0.42, 0.05, 0.030), 'darkwood', (0.14, 0.04, 0.405), bevel=0.006, name='boardfoot')
    # the question mark: a hook over a dot, cut into the board
    for (mx, mz, mw, mh, a) in ((0.14, 0.675, 0.16, 0.045, 0.0), (0.205, 0.625, 0.045, 0.10, 0.0),
                                (0.165, 0.555, 0.11, 0.045, -0.5), (0.135, 0.495, 0.045, 0.085,
                                                                    0.0)):
        block((mw, 0.03, mh), 'opening', (mx, 0.015, mz), rot=(0, a, 0), bevel=0.0, name='mark')
    block((0.05, 0.03, 0.05), 'opening', (0.135, 0.015, 0.435), bevel=0.0, name='dot')
    return 1.0


# ---------------------------------------------------------------- the ground decoration
#
# These are NOT the obstacle props. They sit on tiles the troops walk straight through, so the one
# thing none of them may do is read as something you cannot walk over. Three rules follow, and each
# is the opposite of a rule the props above obey (see DECISIONS.md D90):
#   * no _ground patch. A baked disc of moss or tan is the wrong colour on eleven of the twelve
#     skins, and a ring of wrong colour round a tuft is a hole in the board, not a plant on it.
#   * nothing stands up. Every piece is wider than it is tall, so it never breaks the tile's own
#     silhouette the way a tree or a rock does -- that silhouette IS the game's word for "blocked".
#   * no dark contact shadow, and a thinner outline than the props get (sprite.py's outline arg: 2
#     against the cast's 4). What stands a tree off the board is exactly what would make a pebble
#     look like a boulder.
# They are drawn at 11-18 CSS px against a 38 px hex radius (tools/art/sprites.py TARGET), that is
# a sixth to a quarter of a tile across, and from higher up than anything else in the set
# (ELEV 52): these are things seen lying on the ground, not standing on it.


def _blade(a, ln, tilt, mat, base=(0.0, 0.0), w=0.035):
    """One grass blade: a thin tapered box leaning `tilt` radians out in direction `a`. Blender's
    XYZ euler turns it about Z last, so (tilt, 0, a) is "lean, then point it that way"."""
    d = (math.sin(a) * math.sin(tilt), -math.cos(a) * math.sin(tilt), math.cos(tilt))
    loc = (base[0] + d[0] * ln / 2, base[1] + d[1] * ln / 2, d[2] * ln / 2)
    block((w, w * 0.8, ln), mat, loc, rot=(tilt, 0, a), bevel=0.008, name='blade')


def model_tuft():
    """A clump of grass: blades fanning out of one point, the back ones darker. Six blades, not
    twelve -- at 16 px a dense clump is a green blob with no blades in it at all. Moss over green,
    one step lighter than the meadow skins' own grass (#b3d77d down to #88b55f): a clump in the
    grass's own green is a dark speck on the board, which is what a pebble is for."""
    for (a, ln, tilt, bx, by) in ((-1.15, 0.26, 0.62, -0.03, 0.02), (-0.55, 0.34, 0.38, 0.0, 0.0),
                                  (-0.10, 0.30, 0.16, 0.02, -0.02), (0.45, 0.36, 0.34, -0.01, 0.01),
                                  (1.00, 0.28, 0.55, 0.03, 0.0), (1.70, 0.22, 0.70, -0.02, -0.01)):
        _blade(a, ln, tilt, 'moss' if abs(a) < 1.0 else 'green', (bx, by))
    return 0.34


def model_flowers():
    """Three stems with a head each over two short leaves. The heads are the piece -- the stems are
    there only to lift them off the ground, so they are the thinnest thing here."""
    for (a, ln, tilt, bx, hx, mat) in ((-0.7, 0.24, 0.26, -0.08, -0.14, 'pink'),
                                       (0.2, 0.30, 0.10, 0.02, 0.05, 'yellow'),
                                       (1.1, 0.20, 0.34, 0.09, 0.16, 'pink')):
        _blade(a, ln, tilt, 'moss', (bx, 0.0), w=0.026)
        ball(0.042, mat, (hx, -ln * math.sin(tilt) * math.cos(a), ln * math.cos(tilt)),
             scale=(1, 1, 0.75), name='head')
    for (a, bx) in ((-1.5, -0.04), (1.5, 0.06)):
        _blade(a, 0.16, 1.05, 'green', (bx, -0.03))
    return 0.30


def model_pebbles():
    """Four small stones lying flat, grey over slate. Flat is the point: a stone with any height to
    it is the boulder prop a tenth of the size, which is a rock the player will try to walk round."""
    for (x, y, w, d, h, rz, mat) in ((-0.12, 0.06, 0.21, 0.17, 0.070, 0.4, 'grey'),
                                     (0.15, 0.11, 0.16, 0.14, 0.055, -0.6, 'slate'),
                                     (0.07, -0.15, 0.18, 0.15, 0.062, 0.9, 'grey'),
                                     (-0.19, -0.11, 0.12, 0.11, 0.045, -0.2, 'slate')):
        block((w, d, h), mat, (x, y, h / 2), rot=(0.07, -0.05, rz), bevel=0.016, name='pebble')
    return 0.12


def model_stones():
    """The desert's version: flatter, more angular shards in sand colours, laid in a scatter rather
    than a pile. Tan over stone so the group keeps two values on pale sand."""
    for (x, y, w, d, h, rz, mat) in ((-0.14, 0.04, 0.26, 0.15, 0.055, 0.25, 'stone'),
                                     (0.13, 0.13, 0.20, 0.12, 0.045, -0.75, 'tan'),
                                     (0.16, -0.12, 0.17, 0.13, 0.050, 1.15, 'stone'),
                                     (-0.10, -0.17, 0.13, 0.10, 0.038, -0.35, 'tan')):
        block((w, d, h), mat, (x, y, h / 2), rot=(0.05, -0.04, rz), bevel=0.012, name='shard')
    return 0.10


def model_drybush():
    """A dead bush: bare twigs splayed wide out of one root. Flat is what keeps it a bush and not a
    sapling -- a desert tile has to stay walkable at a glance -- but the first cut lay so flat that
    at its 19 px height the sprite came out 38 px wide, a whole hex radius across, and a decoration
    that wide cannot be offset off a tile's centre without hanging over the line. Hence 0.6-0.95 rad
    rather than 0.8-1.25: still a bush, two thirds the span."""
    for (a, ln, tilt, mat) in ((-1.3, 0.26, 0.86, 'brown'), (-0.6, 0.32, 0.70, 'darkwood'),
                               (0.0, 0.28, 0.58, 'brown'), (0.7, 0.30, 0.74, 'brown'),
                               (1.4, 0.24, 0.90, 'darkwood'), (2.3, 0.20, 0.95, 'brown')):
        _blade(a, ln, tilt, mat, w=0.030)
    return 0.28


def model_drift():
    """A wind-blown heap of snow: a low oval mound with two lumps at its tail and a shadow of ice
    along its front.

    White over *ice*, not over frost. The first cut was white over frost, on the reasoning that a
    snow board offers only warm white against cool white -- and on the board it came out as an empty
    outlined ellipse, a hole in the ice rather than a heap on it. The snow skins' ground is #ebdfca,
    a warm cream at value 0.92, and #f4f1ea over it at this tier's alpha is the same colour: only
    the outline was left to see. What makes a white thing on white ground read is its shadow side,
    and in snow that shadow is blue (#9fd8e8), so the lumps and the front sliver carry it."""
    lathe([(0.33, 0), (0.29, 0.045), (0.17, 0.095), (0.0, 0.125)], 'white',
          loc=(-0.02, 0.01, 0), seg=9, name='mound', scale=(1.25, 0.82, 1))
    for (x, y, r) in ((0.22, -0.11, 0.13), (-0.26, -0.13, 0.10)):
        ball(r, 'ice', (x, y, 0.030), scale=(1.2, 0.9, 0.40), name='lump')
    ball(0.21, 'ice', (0.0, -0.20, 0.018), scale=(1.5, 0.55, 0.22), name='shade')
    return 0.13


def model_twigs():
    """Three fallen sticks across each other. Flat on the ground, so they read as litter under the
    troops' feet and never as a fence or a barricade."""
    for (x, y, h, rz, mat) in ((0.0, 0.03, 0.46, 0.35, 'brown'), (-0.03, -0.06, 0.38, -0.95, 'darkwood'),
                               (0.08, 0.10, 0.26, 1.35, 'brown')):
        rod(0.024, h, mat, (x, y, 0.026), rot=(0, math.pi / 2, rz), seg=10, name='twig')
    ball(0.045, 'darkwood', (-0.16, 0.08, 0.03), scale=(1.1, 1, 0.6), name='knot')
    return 0.06


# The ground decoration (DECOR) is listed apart so the view and the pack can tell the two tiers
# apart: an obstacle prop says "blocked", a decoration says nothing at all.
DECOR = ('tuft', 'flowers', 'pebbles', 'stones', 'drybush', 'drift', 'twigs')

TEAMLESS = {'oak', 'pine', 'snowpine', 'rocks', 'ice', 'arch', 'cactus', 'chest', 'hoard', 'camp',
            'warband', 'mystery', *DECOR}

MODELS = {'oak': model_oak, 'pine': model_pine, 'snowpine': model_snowpine, 'rocks': model_rocks,
          'ice': model_ice, 'arch': model_arch, 'cactus': model_cactus, 'chest': model_chest,
          'hoard': model_hoard, 'camp': model_camp, 'warband': model_warband,
          'mystery': model_mystery, 'tuft': model_tuft, 'flowers': model_flowers,
          'pebbles': model_pebbles, 'stones': model_stones, 'drybush': model_drybush,
          'drift': model_drift, 'twigs': model_twigs}

YAW = {'oak': -16, 'pine': -12, 'snowpine': -12, 'rocks': -24, 'ice': -22, 'arch': -14,
       'cactus': -18, 'chest': -20, 'hoard': -24, 'camp': -22, 'warband': -18, 'mystery': -16,
       # a scatter has no front, so the yaw only has to keep it off the board's own axes
       'tuft': -20, 'flowers': -24, 'pebbles': -18, 'stones': -26, 'drybush': -14, 'drift': -22,
       'twigs': -16}
