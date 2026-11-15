"""The three big troops: ogre, colossus and drake.

They are not the chibi body in body.py — an ogre's shape IS the reason it reads as an ogre at
40 px — but they are tagged with the same joint groups (legL / legR / armL / armR / head, and the
drake's wingL / wingR), so pose.py walks and strikes them with the same machinery. Their joint
heights are in pose.JOINTS, since nothing here sits at the boy's hip and shoulder.

Same two laws as body.py: the ink dilates every shape by 6 sprite px, and nothing may approach
INK in value. A big figure is MORE at risk, not less: a heavy arm hanging beside a heavy body
fuses into one block unless it is swung clear.

And one rule of its own: a big troop still has to read as THIS side's piece, so the team colour
goes on the largest flat it owns — the ogre's sash, the colossus's banner, the drake's wings.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import body as B  # noqa: E402
from prim import ball, fan, group, lathe, rod  # noqa: E402


def _chain(p0, d, lengths, radii, mat, name):
    """Balls strung along a direction from a point: a knobbly club head, a tapering tail."""
    for t, r in zip(lengths, radii):
        ball(r, mat, (p0[0] + d[0] * t, p0[1] + d[1] * t, p0[2] + d[2] * t), name=name)


def model_ogre():
    """A fat green brute: pot belly, tusks, a studded club over the shoulder, a team sash."""
    for x in (-0.190, 0.190):             # short thick legs, far apart: the gap is the read
        with group('legL' if x < 0 else 'legR'):
            lathe([(0.150, 0), (0.152, 0.070), (0.140, 0.230), (0.132, 0.380), (0.0, 0.420)],
                  'ogre', loc=(x, 0, 0), name='leg')
            ball(0.110, 'ogre', (x, -0.090, 0.060), scale=(1.0, 1.5, 0.52), name='foot')
            for t in (-0.060, 0.0, 0.060):   # toes: a round foot reads as a stump
                ball(0.044, 'tusk', (x + t, -0.158, 0.040), scale=(1.0, 1.0, 0.7), name='toe')
    belly = [(0.236, 0.330), (0.300, 0.430), (0.318, 0.560), (0.296, 0.700), (0.214, 0.780),
             (0.0, 0.800)]
    lathe(belly, 'ogre', name='belly')
    lathe([(0.246, 0.330), (0.252, 0.400), (0.236, 0.452), (0.0, 0.458)], 'leather',
          name='loincloth')                 # a hide kilt, so the belly is not the whole figure
    for i in range(49):                     # the team sash, over one shoulder to the far hip:
        f = i / 48                          # the one big flat of colour this troop owns
        bx, bz = 0.150 - 0.300 * f, 0.730 - 0.320 * f
        r = B.on_curve(belly, bz) + 0.004
        ball(0.052, 'team', (bx, -(max(r * r - bx * bx, 1e-4) ** 0.5), bz),
             scale=(1.0, 0.22, 0.62), name='sash')
    with group('head'):                     # a narrower head than the shoulders, so there is a
        lathe([(0.130, 0.790), (0.196, 0.850), (0.206, 0.930), (0.178, 0.996), (0.098, 1.030),
               (0.0, 1.040)], 'ogre', name='head')   # low and wide: a tall skull left a blank
        ball(0.118, 'ogre', (0, -0.206, 0.876), scale=(1.30, 1.15, 0.58), name='jaw')
        ball(0.076, 'ogre', (0, -0.266, 0.914), scale=(1.10, 1.25, 0.76), name='snout')
        for x in (-0.028, 0.028):           # dome over the face, which at 40 px is a helmet
            ball(0.016, 'black', (x, -0.332, 0.930), name='nostril')
        for x in (-0.106, 0.106):           # tusks out past the cheek, splayed: standing upright
            ball(0.046, 'tusk', (x, -0.230, 0.876),   # they crossed in front of the eyes
                 scale=(0.72, 0.72, 2.0), name='tusk')
            ball(0.034, 'tusk', (x * 1.22, -0.222, 0.930), name='tuskcap')
        for x in (-0.090, 0.090):           # eyes high and wide on the skull, under a brow that
            ball(0.052, 'white', (x, -0.182, 0.972), scale=(1.0, 0.50, 0.86), name='eye')
            ball(0.032, 'black', (x, -0.198, 0.972), scale=(1.0, 0.5, 1.0), name='pupil')
            ball(0.011, 'white', (x - 0.010, -0.210, 0.982), name='spark')
            ball(0.066, 'ogre', (x * 2.3, -0.010, 0.900), scale=(0.40, 0.9, 1.15), name='ear')
        ball(0.040, 'green', (0, -0.172, 1.012), scale=(2.4, 0.5, 0.34), name='brow')
    for x in (-0.300, 0.300):               # arms swung clear of the belly, hands as big as feet
        with group('armL' if x < 0 else 'armR'):
            out = 0.070 if x > 0 else -0.040
            lathe([(0.104, 0.560), (0.112, 0.700), (0.100, 0.766), (0.0, 0.776)], 'ogre',
                  loc=(x, 0, 0), name='arm')
            rod(0.086, 0.230, 'ogre', (x + out / 2, -0.030, 0.430), name='forearm')
            ball(0.106, 'ogre', (x + out, -0.040, 0.300), name='fist')
            lathe([(0.112, 0.560), (0.116, 0.600)], 'leather', loc=(x, 0, 0), name='band')
    with group('armR'):                     # the club rests back over the shoulder, away from the
        grip = (0.370, -0.040, 0.300)       # head: swung up it would ink into the skull. Built
        top = (0.620, 0.100, 0.900)         # along a line, not turned after the fact, so the
        d = [b - a for a, b in zip(grip, top)]      # studs land on the wood, not in the air
        ln = math.sqrt(sum(c * c for c in d))
        d = [c / ln for c in d]
        B.line(grip, top, 'darkwood', 24, bead=0.046, name='haft')
        _chain(top, d, (0.030, 0.110, 0.190), (0.104, 0.116, 0.092), 'darkwood', 'knob')
        c = [top[k] + d[k] * 0.110 for k in range(3)]
        for a in range(5):                  # studs ringed round the knob
            t = 2 * math.pi * a / 5
            ball(0.032, 'silver', (c[0] + 0.098 * math.cos(t), c[1] + 0.098 * math.sin(t), c[2]),
                 name='stud')
    return 1.56


def model_colossus():
    """A stone giant: stacked boulders, no neck, a team banner hung from its belt."""
    for x in (-0.230, 0.230):
        with group('legL' if x < 0 else 'legR'):
            lathe([(0.180, 0), (0.184, 0.090), (0.170, 0.300), (0.160, 0.470), (0.0, 0.510)],
                  'stone', loc=(x, 0, 0), name='leg')
            ball(0.130, 'stone', (x, -0.090, 0.070), scale=(1.0, 1.5, 0.56), name='foot')
            ball(0.090, 'grey', (x, -0.040, 0.300), scale=(1.1, 0.9, 1.3), name='knee')
    lathe([(0.300, 0.440), (0.360, 0.560), (0.392, 0.760), (0.352, 0.900), (0.244, 0.970),
           (0.150, 1.000), (0.0, 1.010)], 'stone', name='torso')
    for x in (-0.306, 0.306):               # shoulder caps, out where the shoulders are, instead
        ball(0.190, 'grey', (x, -0.030, 0.868), scale=(1.0, 0.95, 0.58), name='cap')
    for x in (-0.210, 0.230):               # of a stack across the chest that read as a mouth
        ball(0.110, 'grey', (x, -0.270, 0.620), scale=(1.0, 0.42, 1.25), name='patch')
    lathe([(0.330, 0.430), (0.340, 0.490)], 'leather', name='belt')
    lathe([(0.250, 0.470), (0.280, 0.300), (0.276, 0.120), (0.0, 0.090)], 'team',
          loc=(0, -0.130, 0), scale=(1.0, 0.34, 1.0), name='banner')   # hangs in front, clear
    for s in (-1, 1):                       # the owner's mark on the banner: one gold chevron
        B.line((0.0, -0.236, 0.400), (s * 0.130, -0.230, 0.200), 'gold', 9, bead=0.030,
               scale=(1.0, 0.4, 1.0), name='mark')
    with group('head'):                     # a boulder head sunk between the shoulders
        lathe([(0.112, 0.990), (0.172, 1.044), (0.192, 1.120), (0.188, 1.206), (0.150, 1.282),
               (0.084, 1.326), (0.0, 1.340)], 'stone', name='head')   # a boulder, not the slab
        ball(0.112, 'stone', (0, -0.150, 1.078), scale=(1.4, 0.9, 0.60), name='jaw')   # a flat
        ball(0.048, 'grey', (0, -0.174, 1.244), scale=(2.4, 1.0, 0.36), name='brow')   # top gave
        for x in (-0.086, 0.086):           # the slits sit in the brow's shadow, wide apart
            ball(0.058, 'yellow', (x, -0.168, 1.182), scale=(1.1, 0.48, 0.48), name='eye')
    for x in (-0.370, 0.370):
        with group('armL' if x < 0 else 'armR'):
            out = 0.090 if x > 0 else -0.060
            lathe([(0.130, 0.680), (0.140, 0.880), (0.124, 0.950), (0.0, 0.960)], 'stone',
                  loc=(x, 0, 0), name='arm')
            rod(0.108, 0.300, 'stone', (x + out / 2, -0.030, 0.520), name='forearm')
            ball(0.146, 'stone', (x + out, -0.050, 0.350), name='fist')
            for k in range(3):              # knuckles, or the fist is a ball on a stick
                ball(0.052, 'grey', (x + out - 0.060 + 0.060 * k, -0.166, 0.388), name='knuckle')
    return 1.80


def _wing(s: int):
    """One wing: a team-coloured membrane on three horn fingers, held high and swept back.

    The team colour lives here because a drake has no tunic, and a wing is the biggest flat on
    the model - at 40 px it is the only thing that can say whose drake this is. Built as a fan
    with a scalloped rim: three overlapping ellipsoids made a cloud, not a wing.
    """
    hub = (s * 0.160, 0.120, 0.560)
    u = (s * 1.00, 0.16, 0.30)              # out, back and a little up, away from the body
    v = (s * 0.10, 0.24, -0.98)             # down the trailing edge

    def p(a, b):
        return tuple(hub[k] + u[k] * a + v[k] * b for k in range(3))

    fingers = [p(0.64, 0.0), p(0.50, 0.40), p(0.28, 0.58)]
    rim = [fingers[0], p(0.50, 0.20), fingers[1], p(0.33, 0.40), fingers[2], p(0.06, 0.40)]
    with group('wingL' if s < 0 else 'wingR'):
        fan(hub, rim, 'team', thick=0.035, name='web')
        # only the leading edge is boned: a bead run down each finger read as a necklace laid
        # over the membrane, and at 40 px the dots are all that survived of the wing
        B.line(hub, fingers[0], 'horn', 16, bead=0.022, name='spar')
        ball(0.034, 'horn', fingers[0], name='claw')


def model_drake():
    """A young dragon: stout legs, a long neck, a gold collar, team wings beating as it goes."""
    for x in (-0.150, 0.150):
        with group('legL' if x < 0 else 'legR'):
            lathe([(0.108, 0), (0.110, 0.060), (0.098, 0.190), (0.090, 0.300), (0.0, 0.330)],
                  'scale', loc=(x, 0, 0), name='leg')
            ball(0.086, 'scale', (x, -0.080, 0.050), scale=(1.0, 1.5, 0.56), name='foot')
            for t in (-0.048, 0.0, 0.048):
                ball(0.030, 'horn', (x + t, -0.136, 0.036), scale=(1.0, 1.1, 0.7), name='claw')
    lathe([(0.180, 0.280), (0.222, 0.370), (0.232, 0.500), (0.206, 0.620), (0.130, 0.680),
           (0.0, 0.700)], 'scale', name='body')
    lathe([(0.150, 0.300), (0.180, 0.400), (0.186, 0.510), (0.160, 0.600), (0.0, 0.640)],
          'belly', loc=(0, -0.070, 0), scale=(1.0, 0.52, 1.0), name='belly')
    for i in range(16):                     # the tail, low out behind the hind legs and barely
        f = i / 15                          # lifting: swept up it stood over the back like an
        ball(0.096 - 0.070 * f, 'scale',    # aerial, and its root was lost inside the body
             (0.0, 0.150 + 0.580 * f, 0.330 + 0.150 * f * f), name='tail')
        if 3 < i < 13 and i % 3 == 0:       # a few fins along it, spaced: a bead at every
            ball(0.034, 'scale', (0.0, 0.150 + 0.580 * f, 0.402 + 0.150 * f * f),
                 scale=(0.4, 0.9, 1.5), name='fin')   # joint was a caterpillar, not a spine
    with group('head'):                     # a short neck and a blunt snout: a long muzzle is a
        lathe([(0.112, 0.640), (0.120, 0.730), (0.118, 0.810), (0.0, 0.830)], 'scale',
              loc=(0, -0.070, 0), name='neck')       # smear once the ink has had it
        lathe([(0.122, 0.636), (0.126, 0.672)], 'gold', loc=(0, -0.070, 0), name='collar')
        lathe([(0.118, 0.796), (0.156, 0.842), (0.170, 0.906), (0.156, 0.960), (0.098, 0.996),
               (0.0, 1.010)], 'scale', loc=(0, -0.090, 0), name='skull')
        ball(0.112, 'scale', (0, -0.246, 0.872), scale=(0.95, 1.7, 0.56), name='snout')
        ball(0.082, 'belly', (0, -0.258, 0.838), scale=(0.9, 1.5, 0.38), name='chin')
        for x in (-0.054, 0.054):           # two little fangs out of the top jaw, or the long
            ball(0.022, 'tusk', (x, -0.370, 0.846), scale=(0.8, 0.8, 1.4), name='fang')
        for x in (-0.030, 0.030):           # snout is a bear's muzzle
            ball(0.014, 'black', (x, -0.414, 0.892), name='nostril')
        for x in (-0.092, 0.092):
            ball(0.052, 'white', (x, -0.196, 0.930), scale=(1.0, 0.46, 0.92), name='eye')
            ball(0.032, 'black', (x, -0.214, 0.930), scale=(1.0, 0.5, 1.0), name='pupil')
            ball(0.011, 'white', (x - 0.010, -0.228, 0.942), name='spark')
            # horns: two small turned cones off the skull, not a bead curl, and not the cow's
            # pair a bigger cone gave
            lathe([(0.030, 0.0), (0.022, 0.048), (0.0, 0.104)], 'horn',
                  loc=(x * 1.4, 0.016, 0.972), seg=16, name='horn')
    _wing(-1)
    _wing(1)
    return 1.56


MODELS = {'ogre': model_ogre, 'colossus': model_colossus, 'drake': model_drake}
YAW = {'ogre': 30, 'colossus': 28, 'drake': 36}
