"""The chibi humanoid every foot troop is carved from: legs, tunic, head, arms.

model_militia() was the first one; everything here is its geometry pulled out so the other troops
are gear on the same body, carved by the same hand and posed by the same joints (pose.py turns the
groups legL / legR / armL / armR / head about fixed pivots).

The two laws this body is shaped by, both of them about 40 px on a phone:
  1. sprite.py's ink dilates every shape by OUTLINE_PX (6) px, so two parts closer than about
     13 sprite px fuse into one black slab. Hence the wide stance, the slim boots, the weapon
     leaning away from the head.
  2. a material whose value approaches INK (#2b1d14) disappears into that outline, so nothing
     here is darker than 'leather'.
Model space: +z up, the figure faces -y, units face right and the game mirrors them.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from prim import ball, block, group, lathe, rod  # noqa: E402

TUNIC = [(0.130, 0.266), (0.148, 0.326), (0.154, 0.432), (0.146, 0.516), (0.106, 0.556)]
FACE = [(0.118, 0.600), (0.150, 0.646), (0.164, 0.706), (0.157, 0.762), (0.128, 0.800),
        (0.0, 0.818)]
SHOULDER_Z = 0.548


def on_curve(profile, z: float) -> float:
    """The radius of a lathe profile at height z: features laid on a flat plane float off it."""
    r = profile[0][0]
    for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
        if z0 <= z <= z1:
            r = r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return r


def on_skin(profile, x: float, z: float, inset: float = 0.0) -> float:
    """y on a lathed surface at (x, z), pushed `inset` into it."""
    r = on_curve(profile, z)
    return -(max(r * r - x * x, 1e-4) ** 0.5) + inset


def legs(stance=0.104, boot='boot', cloth='cloth', hip=0.290):
    """Two carved legs, each its own group. `stance` is half the gap the ink has to show through."""
    for x in (-stance, stance):
        with group('legL' if x < 0 else 'legR'):
            lathe([(0.076, 0), (0.076, 0.060), (0.062, 0.086), (0.0, 0.094)], boot,
                  loc=(x, 0, 0), name='boot')
            ball(0.048, boot, (x, -0.056, 0.036), scale=(1.0, 1.5, 0.70), name='toe')
            lathe([(0.058, 0.078), (0.062, 0.160), (0.056, 0.272), (0.0, hip)], cloth,
                  loc=(x, 0, 0), name='trouser')


def torso(mat='team', belt='leather', buckle='gold'):
    """The short tunic, its belt and buckle. Hem above the knee: a kid, not a soldier."""
    lathe(TUNIC + [(0.0, 0.568)], mat, name='tunic')
    if belt:
        lathe([(0.150, 0.294), (0.154, 0.336)], belt, name='belt')
    if buckle:
        block((0.040, 0.014, 0.032), buckle, (0, -0.154, 0.315), bevel=0.004, name='buckle')


def strap(mat='leather', n=49, top=(0.040, 0.536), bot=(-0.100, 0.314), w=0.026):
    """One strap over the chest, laid on the tunic's own curve: beads, not blocks, or the seams
    read as a saw blade. Default is the militia's fork strap, shoulder down to the far hip.
    `w` is the bead radius: a strap carrying the team colour has to survive the downscale, and
    at 0.026 it came out under 2 CSS px on the board - a seam, not a sash."""
    for i in range(n):
        f = i / (n - 1)
        bx = top[0] + (bot[0] - top[0]) * f
        bz = top[1] + (bot[1] - top[1]) * f
        r = on_curve(TUNIC, bz) + 0.002           # laid 2 mm proud of the cloth, not sunk in it
        ball(w, mat, (bx, -(max(r * r - bx * bx, 1e-4) ** 0.5), bz),
             scale=(1.0, 0.34, 0.78), name='strap')


def face(hair='hair', skin='skin', brow=True):
    """The head and its features, in the 'head' group so a pose can nod it on its own.

    Chibi proportions: the head is as wide as the shoulders, so at 40 px the face still reads.
    `hair` None leaves the scalp bare for a helmet or a hood to cover.
    """
    with group('head'):
        lathe([(0.052, 0.540), (0.055, 0.614)], skin, name='neck')
        lathe(FACE, skin, name='head')
        for x in (-0.157, 0.157):
            ball(0.031, skin, (x, 0.006, 0.716), scale=(0.55, 1.0, 1.15), name='ear')
        ball(0.022, skin, (0, on_skin(FACE, 0, 0.698, 0.010), 0.698), name='nose')
        for x in (-0.066, 0.066):      # big whites, big pupils: at 40 px small eyes go to mud
            ball(0.046, 'white', (x, on_skin(FACE, x, 0.724, 0.022), 0.724),
                 scale=(1.05, 0.42, 1.0), name='eye')
            ball(0.028, 'black', (x, on_skin(FACE, x, 0.724, 0.004), 0.724),
                 scale=(1.0, 0.45, 1.05), name='pupil')
            hx = x - 0.008                 # the painted catch-light, the one dot that sells it
            ball(0.0085, 'white', (hx, on_skin(FACE, hx, 0.733, -0.004), 0.733), name='spark')
            if brow:                       # or the eye has nothing to sit under
                ball(0.030, hair or 'leather', (x, on_skin(FACE, x, 0.752, 0.010), 0.752),
                     scale=(1.15, 0.35, 0.30), name='brow')
        for i in range(9):                 # a smile cut as one curved slot: beads that do not
            g = (i - 4) / 4                # overlap read as three separate dots
            gx, gz = g * 0.036, 0.648 - 0.013 * (1 - g * g)
            ball(0.019, 'mouth', (gx, on_skin(FACE, gx, gz, 0.005), gz),
                 scale=(1.0, 0.5, 0.78), name='grin')
        if hair:
            mop(hair)


def mop(mat='hair'):
    """A mop of hair: the lathed dome is only its base, the tufts are what reads."""
    lathe([(0.150, 0.746), (0.170, 0.776), (0.166, 0.814), (0.140, 0.848), (0.078, 0.868),
           (0.0, 0.878)], mat, name='hair')
    for a, h, sc in ((-0.122, 0.800, 1.1), (-0.042, 0.848, 1.2), (0.052, 0.846, 1.1),
                     (0.128, 0.796, 1.0)):
        ball(0.060, mat, (a, 0.036 - abs(a) * 0.32, h), scale=(sc, 1.0, 0.78), name='tuft')
    ball(0.052, mat, (-0.084, -0.088, 0.800), scale=(1.25, 0.8, 0.58), name='fringe')
    for x in (-0.162, 0.162):                               # locks down past the temples
        ball(0.038, mat, (x, -0.016, 0.752), scale=(0.62, 1.0, 1.05), name='lock')


ELBOW = 0.405                    # z where the sleeve ends and the bare forearm starts
FIST = 0.252                     # z of the fist on a hanging arm; pose.py keeps the same number


def arm(x, sleeve='team', out=0.0, hy=-0.016, hand=True, thumb=False, skin='skin', hz=None,
        fore=None, fr=0.042, elb=None):
    """One arm, in its own group: short sleeve, bare forearm, a fist. `out` reaches the hand away
    from the body (towards a shaft it has to close on), `hy` brings it forward.

    `fore` paints the forearm (a long SLEEVE rather than a bare arm) and `fr` thins it. An arm
    that reaches right across the chest is twice the length of a hanging one, and at bare-skin
    width and bare-skin value it comes out as a pale log lying exactly where the weapon is - the
    guard's first chest-high pass lost the whole crossbow behind his own forearms.

    `hz` RAISES the fist off the hanging height, for a weapon carried at the chest rather than at
    the waist. It is not just a different number for the hand: with the fist moved, the forearm has
    to be aimed at it, or the hand floats off the end of an arm that still points at the floor -
    which is exactly what a crossbow held level at the waist looked like. So when hz is given the
    forearm is built as one rod from the elbow TO the fist, however far and in whatever direction
    that is. Everyone else keeps the original straight-down forearm untouched.
    """
    with group('armL' if x < 0 else 'armR'):
        lathe([(0.056, 0.400), (0.060, 0.520), (0.0, 0.546)], sleeve, loc=(x, 0, 0), name='sleeve')
        fz = FIST if hz is None else hz
        if hz is None:
            tilt = math.radians(-26) if out else 0.0
            rod(0.042, 0.158, skin, (x + out / 2, (hy - 0.014) / 2, 0.326),
                rot=(0, tilt * (1 if x > 0 else -1), 0), name='forearm')
        else:
            def _rod(a, b, name):
                d = tuple(b[k] - a[k] for k in range(3))
                L = math.sqrt(sum(c * c for c in d)) or 1e-6
                u = tuple(c / L for c in d)
                rod(fr, L + 0.052, fore or skin, tuple(a[k] + d[k] / 2 for k in range(3)),
                    rot=(math.asin(max(-1.0, min(1.0, -u[1]))), math.atan2(u[0], u[2]), 0),
                    name=name, seg=14)

            b = (x + out, hy, fz)
            if elb is None:
                _rod((x, 0.0, ELBOW), b, 'forearm')
            else:
                # An arm that reaches ACROSS the body cannot be one straight rod from the
                # shoulder: the shoulder sits at |x| = 0.15 while the coat is 0.175 wide, so a
                # rod drawn straight from there to a hand on the far side spends its whole
                # middle INSIDE the torso, and what comes out of the render is a shoulder, a
                # gap, and a hand floating on its own - the arm reads as broken off.
                # With `elb` the limb is built in two pieces through an elbow placed OUTSIDE
                # the coat and in front of it, so every part of it is in open air.
                # The sleeve is a lathe whose bottom is an OPEN FLAT RIM at z 0.400, r 0.056,
                # and the upper arm is a rod of r 0.030 leaving it at an angle: where the thin
                # rod crosses the wide flat rim the silhouette steps in, and that step is the
                # notch you can see at the shoulder. A ball the width of the rim, sunk at the
                # rim, closes it and gives the rod a round socket to come out of, so the arm
                # tapers out of the sleeve instead of being cut off by it.
                ball(0.058, sleeve, (x, 0.0, 0.404), scale=(1.0, 1.0, 0.86), name='shoulder')
                _rod((x, 0.0, 0.500), elb, 'upperarm')
                _rod(elb, b, 'forearm')
                ball(fr * 1.08, fore or skin, elb, name='elbow')
        if hand:
            ball(0.048, skin, (x + out, hy, fz), name='hand')
        if thumb:
            ball(0.019, skin, (x + out - 0.006 * (1 if x > 0 else -1), hy - 0.040, fz + 0.020),
                 scale=(1.0, 1.0, 1.5), name='thumb')


def cloak(mat='team', drop=0.08):
    """A cape hung off the shoulders and down the back (+y), clear of the legs' swing."""
    lathe([(0.120, 0.556), (0.168, 0.470), (0.186, 0.330), (0.176, 0.200 + drop),
           (0.0, 0.180 + drop)], mat, loc=(0, 0.052, 0), scale=(1.0, 0.58, 1.0), name='cloak')
    lathe([(0.126, 0.540), (0.132, 0.566)], mat, loc=(0, 0.018, 0), name='collar')


def hood(mat='leather'):
    """A hood pulled up: a cowl over the scalp and a peak over the brow, in the head group."""
    with group('head'):
        lathe([(0.176, 0.690), (0.192, 0.742), (0.186, 0.800), (0.150, 0.850), (0.070, 0.878),
               (0.0, 0.886)], mat, name='cowl')
        ball(0.090, mat, (0, -0.108, 0.806), scale=(1.5, 0.9, 0.52), name='peak')
        lathe([(0.182, 0.676), (0.196, 0.704)], mat, name='rim')


def helmet(mat='silver', crest=None):
    """A turned bowl with a brow band and a nasal bar, in the head group."""
    with group('head'):
        lathe([(0.168, 0.752), (0.182, 0.790), (0.172, 0.840), (0.120, 0.880), (0.0, 0.900)],
              mat, name='bowl')
        lathe([(0.186, 0.744), (0.188, 0.776)], mat, name='band')
        block((0.030, 0.026, 0.090), mat, (0, -0.150, 0.756), bevel=0.006, name='nasal')
        if crest:
            lathe([(0.0, 0.886), (0.040, 0.906), (0.034, 0.960), (0.0, 0.998)], crest,
                  loc=(0.0, 0.030, 0), name='crest', scale=(0.42, 1.0, 1.0))


def pointy_hat(mat='team', trim='gold', h=1.26):
    """The adept's hat: a wide brim and a tall cone that leans back off the face."""
    with group('head'):
        # the brim stops short of the shoulders: wider, and the 42 deg camera put the whole
        # face in its shadow, which at 40 px is a hat with no one under it
        # 0.218 was wider than his own shoulders, and it cost twice: the 42 deg camera dropped
        # the whole brim shadow across the eyes, and it reached out to exactly where the staff
        # has to stand, so the crystal fused into it. 0.198 keeps the disc and buys both back.
        lathe([(0.196, 0.806), (0.198, 0.830), (0.138, 0.850), (0.0, 0.854)], mat, name='brim')
        lathe([(0.156, 0.840), (0.136, 0.930), (0.096, 1.080), (0.040, h - 0.06), (0.0, h)],
              mat, loc=(0.0, 0.052, 0), name='cone')
        lathe([(0.150, 0.838), (0.152, 0.870)], trim, name='hatband')
        ball(0.030, trim, (0.030, 0.090, h - 0.02), name='tip')


def line(p0, p1, mat, n, bead=0.012, scale=(1.0, 1.0, 1.0), name='bead'):
    """A straight cord (a drawn bowstring, a sling cord) as a bead chain between two points."""
    for i in range(n):
        f = i / (n - 1)
        ball(bead, mat, tuple(a + (b - a) * f for a, b in zip(p0, p1)), scale=scale, name=name)


def arc(centre, radius, a0, a1, mat, n, bead=0.016, y=0.0, scale=(1.0, 1.0, 1.0), name='bead'):
    """A curved stave (a bow, a tusk, a tail) as a bead chain on a circle in the x-z plane:
    prim.py has no swept curve, and beads keep an even thickness where joined rods would kink.
    `centre` is (x, z), the angles are radians measured from +x towards +z."""
    for i in range(n):
        a = a0 + (a1 - a0) * i / (n - 1)
        ball(bead, mat, (centre[0] + radius * math.cos(a), y, centre[1] + radius * math.sin(a)),
             scale=scale, name=name)
