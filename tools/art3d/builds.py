"""The building models: built from the same turned-wood primitives as the troops in troops.py.

Kept apart from toys.py so it stays inside the project's 500-line rule as the set grows; toys.py
imports this late (the primitives have to exist first) and merges MODELS, YAW and ELEVS.

What a carved building needs that a box does not, each one learned by rendering a pass and looking
at it at the 48 px the board actually draws:

* A foot and a step to stand on, or the piece floats with no ground line.
* Courses across every big wall, and they must be HORIZONTAL and few. Scattered vertical joints
  read as dirt; seven lines on a 0.6 m wall read as corrugation, four shallow ones as masonry.
* Window and door surrounds DARKER than the wall. A light frame on a light wall is a gold bar.
* The team colour on roofs and merlon caps only. A band painted round a tower shaft reads as a
  ribbon tied on, not as paint.
* A door clear in FRONT of its own hole, or it is swallowed and only a black oval is left.
* Taller than wide, the tallest feature in the middle, and every cone only a little wider than
  what it stands on, with a near-straight profile and an eave under it - a bellied cone is a
  balloon at 48 px and an eaveless one is a funnel.
* The camera matters as much as the model: see ELEVS.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from prim import ball, block, flag, lathe, prism, rod  # noqa: E402

# A piece whose interest is on its vertical front face - a gate, a door, a row of merlons - is
# ruined by a steep camera: at 42 degrees the front face foreshortens to a third of its height and
# an arched gate collapses into a black ellipse. These are seen from lower down than the props.
ELEVS = {'base': 26, 'barracks1': 28, 'barracks2': 28, 'barracks3': 27, 'barracks4': 27,
         'tower': 26, 'mine': 30, 'rubble': 36}


def _cone(loc, r, h, mat, seg=32, name='cone'):
    """A roof, not a funnel or a balloon: near-straight sides with a small flare at the eave."""
    return lathe([(r, 0.0), (r * 0.97, h * 0.06), (r * 0.63, h * 0.36), (r * 0.30, h * 0.70),
                  (0.0, h)], mat, loc=loc, seg=seg, name=name)


def _merlons(pts, z, h, w, mat='tan', cap='team', capz=0.026, grow=1.08):
    """A crenellated parapet: a block at each point with a thin team cap on it.

    Seen from above the caps are what the eye gets, so on a small crown they must be thin and no
    wider than the merlon - otherwise a ring of them is a ring of blue boxes, not battlements.
    """
    for mx, my, a in pts:
        block((w, w, h), mat, (mx, my, z + h / 2), rot=(0, 0, a), bevel=0.012, name='merlon')
        block((w * grow, w * grow, capz), cap, (mx, my, z + h + capz / 2), rot=(0, 0, a),
              bevel=0.006, name='cap')


def _ring(cx, cy, r, n, phase=0.0):
    """n points evenly round a circle, each with the angle it stands at."""
    return [(cx + r * math.cos(phase + k * 2 * math.pi / n),
             cy + r * math.sin(phase + k * 2 * math.pi / n), phase + k * 2 * math.pi / n)
            for k in range(n)]


def _arch(x, y, z, r, h, mat='yellow', trim='darkwood', d=0.05):
    """An arched opening on a face that looks -y: a round-topped light in a dark surround. A
    rectangular hole is what makes a toy castle read as a shed; the round top is the whole tell."""
    block((2 * (r + 0.022), d, h), trim, (x, y, z), bevel=0.004)
    rod(r + 0.022, d, trim, (x, y, z + h / 2), rot=(math.pi / 2, 0, 0))
    block((2 * r, d * 0.7, h), mat, (x, y - d * 0.22, z), bevel=0.003)
    rod(r, d * 0.7, mat, (x, y - d * 0.22, z + h / 2), rot=(math.pi / 2, 0, 0))


def _courses(size, loc, n, z0, dz, mat='grey'):
    """n fine horizontal lines proud of a block's faces: what turns a blank panel into masonry."""
    w, d = size
    for i in range(n):
        block((w, d, 0.009), mat, (loc[0], loc[1], z0 + i * dz), bevel=0.0, name='line')


def _gable(w, d, h, loc, mat='team', eave=0.035):
    """A shingled gable roof with an eave board under it and a ridge along the top. Without the
    eave the roof looks melted onto the walls; the ridge is what catches the light at 48 px."""
    x, y, z = loc
    block((w + 0.10, d + 0.10, eave), 'darkwood', (x, y, z + eave / 2), bevel=0.008, name='eave')
    prism(w + 0.01, d + 0.02, h, mat, (x, y, z + eave))
    rod(0.022, w + 0.06, 'darkwood', (x, y, z + eave + h), rot=(0, math.pi / 2, 0), name='ridge')


def _door(x, y, z, w, h, panels=3):
    """A plank door standing clear in front of its own dark hole, with a lintel over it."""
    block((w, 0.06, h), 'opening', (x, y + 0.03, z), bevel=0.0, name='hole')
    block((w - 0.02, 0.035, h), 'brown', (x, y - 0.018, z), bevel=0.008, name='door')
    for k in range(panels):
        px = x + (k - (panels - 1) / 2) * (w - 0.05) / panels
        block((0.013, 0.04, h - 0.04), 'darkwood', (px, y - 0.024, z), bevel=0.0, name='plank')
    block((w + 0.07, 0.05, 0.035), 'darkwood', (x, y - 0.014, z + h / 2 + 0.018), bevel=0.006,
          name='lintel')
    ball(0.016, 'gold', (x + w * 0.3, y - 0.038, z))


def _timber(x0, x1, y, z0, z1, braces=True):
    """Half-timbering on a face that looks -y: two posts, a rail, and a pair of braces. The thing
    that says 'Seiffen village house' at any size, as long as the members stay few and thick."""
    for px in (x0, x1):
        block((0.05, 0.03, z1 - z0), 'darkwood', (px, y, (z0 + z1) / 2), bevel=0.0, name='post')
    block((x1 - x0, 0.03, 0.045), 'darkwood', ((x0 + x1) / 2, y, z1 - 0.025), bevel=0.0,
          name='rail')
    if braces:
        for s in (1, -1):
            block((0.038, 0.028, (z1 - z0) * 0.62), 'darkwood',
                  ((x0 + x1) / 2 + s * (x1 - x0) * 0.26, y, (z0 + z1) / 2),
                  rot=(0, s * 0.62, 0), bevel=0.0, name='brace')


def _lights(xs, y, z, r=0.034, h=0.088):
    for x in xs:
        _arch(x, y, z, r, h)


def model_castle():
    """The castle: a toy-box keep between two turned towers, a gate and a flag.

    A crenellated crown under every roof, with the team colour on the merlon caps, is the one
    feature that says castle rather than cottage at 48 px. Proportion is the rest of it: taller
    than wide, the centre tower the tallest thing on the piece.
    """
    FY = -0.23  # the keep's front face
    # the keep, on a dark foot and a cream step
    block((1.12, 0.74, 0.05), 'darkwood', (0, 0.07, 0.025), bevel=0.012, name='foot')
    block((1.06, 0.69, 0.05), 'cream', (0, 0.07, 0.072), bevel=0.012, name='step')
    block((0.96, 0.62, 0.62), 'tan', (0, 0.08, 0.405), bevel=0.03, name='keep')
    _courses((0.963, 0.623), (0, 0.08), 4, 0.16, 0.145)
    for z in (0.27, 0.50):  # two heavier string courses, proud and light
        block((0.98, 0.64, 0.024), 'cream', (0, 0.08, z), bevel=0.005, name='course')
    block((1.02, 0.68, 0.045), 'cream', (0, 0.08, 0.737), bevel=0.008, name='coping')
    for i in range(6):
        x = -0.41 + i * 0.164
        block((0.105, 0.65, 0.12), 'tan', (x, 0.08, 0.82), bevel=0.014, name='merlon')
        block((0.112, 0.66, 0.026), 'team', (x, 0.08, 0.893), bevel=0.006, name='cap')
    # the gate: a hole cut into the wall, the plank door clear in FRONT of it, a ring around both
    block((0.30, 0.14, 0.33), 'opening', (0, FY + 0.08, 0.245), bevel=0.0, name='hole')
    rod(0.15, 0.14, 'opening', (0, FY + 0.08, 0.41), rot=(math.pi / 2, 0, 0), name='hole2')
    block((0.285, 0.035, 0.33), 'brown', (0, FY - 0.028, 0.245), bevel=0.008, name='door')
    rod(0.1425, 0.035, 'brown', (0, FY - 0.028, 0.41), rot=(math.pi / 2, 0, 0), name='doorarch')
    for x in (-0.085, 0.0, 0.085):
        block((0.015, 0.04, 0.40), 'darkwood', (x, FY - 0.034, 0.26), bevel=0.0, name='plank')
    for z in (0.17, 0.33):
        block((0.27, 0.04, 0.022), 'darkwood', (0, FY - 0.034, z), bevel=0.0, name='brace')
    rod(0.185, 0.05, 'grey', (0, FY - 0.016, 0.41), rot=(math.pi / 2, 0, 0), name='archring')
    rod(0.1425, 0.055, 'opening', (0, FY - 0.02, 0.41), rot=(math.pi / 2, 0, 0), name='archhole')
    for jx in (-0.164, 0.164):
        block((0.042, 0.05, 0.33), 'grey', (jx, FY - 0.016, 0.245), bevel=0.01, name='jamb')
    block((0.08, 0.055, 0.09), 'cream', (0, FY - 0.021, 0.60), bevel=0.01, name='keystone')
    for x in (-0.30, 0.30):
        _arch(x, FY - 0.005, 0.40, 0.038, 0.10)
    # the centre tower: the tallest thing on the piece, crowned, with the flag over it
    block((0.47, 0.47, 0.52), 'tan', (0, 0.12, 0.98), bevel=0.02, name='tower')
    _courses((0.476, 0.476), (0, 0.12), 3, 0.81, 0.13)
    _arch(0, -0.122, 0.90, 0.042, 0.105)
    block((0.52, 0.52, 0.032), 'cream', (0, 0.12, 1.256), bevel=0.006, name='corbel')
    _merlons([(x, y, 0.0) for y in (-0.12, 0.36) for x in (-0.18, 0.0, 0.18)]
             + [(x, 0.12, 0.0) for x in (-0.18, 0.18)], 1.272, 0.10, 0.086)
    _cone((0, 0.12, 1.398), 0.262, 0.58, 'team', name='spire')
    ball(0.040, 'gold', (0, 0.12, 1.975))
    flag((0, 0.12, 2.23), pole_h=0.30)
    # the two turrets, each on its own turned foot and crowned the same way
    for x in (-0.52, 0.52):
        lathe([(0.285, 0.0), (0.285, 0.028), (0.0, 0.028)], 'darkwood', loc=(x, -0.02, 0),
              name='turretfoot')
        lathe([(0.265, 0), (0.265, 0.045), (0.225, 0.075), (0.215, 0.09), (0.205, 0.97),
               (0.0, 0.97)], 'tan', loc=(x, -0.02, 0.028), name='turret')
        for i in range(4):
            lathe([(0.208, 0.18 + i * 0.19), (0.208, 0.189 + i * 0.19)], 'grey',
                  loc=(x, -0.02, 0.028), name='line')
        for z in (0.22, 0.58):
            lathe([(0.222, z), (0.222, z + 0.028)], 'cream', loc=(x, -0.02, 0.028), name='ring')
        _arch(x, -0.228, 0.72, 0.036, 0.092)
        lathe([(0.205, 0.97), (0.245, 1.01), (0.245, 1.042), (0.0, 1.042)], 'cream',
              loc=(x, -0.02, 0.028), name='corbel')
        _merlons(_ring(x, -0.02, 0.198, 8, math.pi / 8), 1.07, 0.09, 0.075)
        _cone((x, -0.02, 1.186), 0.196, 0.42, 'team')
        ball(0.034, 'gold', (x, -0.02, 1.60))
    return 2.6


def model_barracks1():
    """Tier 1, the recruiting hut: one room, a thatch-coloured gable, a spear rack by the door.

    The humblest thing a player builds, so it must read as humble - a single storey, no stone, no
    crown - while still being unmistakably a building at 48 px: a lit window and a dark door.
    """
    FY = -0.31
    block((1.02, 0.76, 0.05), 'darkwood', (0, 0.0, 0.025), bevel=0.012, name='foot')
    block((0.96, 0.70, 0.05), 'tan', (0, 0.0, 0.072), bevel=0.012, name='step')
    block((0.84, 0.58, 0.50), 'cream', (0, 0.0, 0.347), bevel=0.025, name='walls')
    _timber(-0.395, 0.395, FY + 0.005, 0.10, 0.59)
    _door(0.0, FY, 0.29, 0.21, 0.36)
    _lights((-0.27, 0.27), FY - 0.004, 0.44)
    for y in (-0.14, 0.14):  # lights in the gable ends too, so the piece works turned
        block((0.03, 0.10, 0.11), 'darkwood', (0.425, y, 0.42), bevel=0.004, name='sidetrim')
        block((0.022, 0.075, 0.085), 'yellow', (0.438, y, 0.42), bevel=0.003, name='sidelight')
    _gable(0.84, 0.58, 0.33, (0, 0.0, 0.597))
    for x in (-0.20, 0.20):
        block((0.028, 0.38, 0.020), 'darkwood', (x, -0.155, 0.775), rot=(0.72, 0, 0), bevel=0.0,
              name='rafter')
    block((0.10, 0.10, 0.24), 'slate', (0.26, 0.14, 0.83), bevel=0.012, name='chimney')
    block((0.13, 0.13, 0.035), 'darkwood', (0.26, 0.14, 0.965), bevel=0.006, name='chimneycap')
    # The spear rack is what makes a hut a barracks, so it must stand clear of the wall and on the
    # side the camera yaws towards - behind the house it may as well not exist.
    block((0.26, 0.06, 0.04), 'darkwood', (0.50, FY - 0.02, 0.26), rot=(0, 0, -0.22),
          bevel=0.008, name='rack')
    for k in range(3):
        x = 0.42 + k * 0.08
        rod(0.016, 0.66, 'brown', (x, FY - 0.10, 0.33), rot=(-0.13, 0, 0), name='shaft')
        rod(0.030, 0.12, 'silver', (x, FY - 0.19, 0.71), rot=(-0.13, 0, 0), seg=4, name='head')
    return 1.7


def model_barracks2():
    """Tier 2, the drill house: two storeys with the upper one jettied out over the lower, a
    dormer in the roof and a crossed-swords sign over the door.

    The tier reads as an upgrade of tier 1, not a different building: same cream-and-timber hand,
    same gable, but a storey taller, with the overhang that says a real Fachwerk house.
    """
    FY = -0.33
    block((1.10, 0.80, 0.05), 'darkwood', (0, 0.0, 0.025), bevel=0.012, name='foot')
    block((1.04, 0.74, 0.05), 'tan', (0, 0.0, 0.072), bevel=0.012, name='step')
    # ground floor: stone, so the jettied timber floor above it has something to sit on
    block((0.82, 0.60, 0.42), 'grey', (0, 0.0, 0.307), bevel=0.02, name='ground')
    _courses((0.826, 0.606), (0, 0.0), 3, 0.17, 0.115, mat='slate')
    _door(0.0, FY + 0.025, 0.28, 0.22, 0.34)
    _lights((-0.29, 0.29), FY + 0.021, 0.40, r=0.032, h=0.08)
    # the jetty: the upper floor is wider than the lower one and rests on a sill
    block((0.98, 0.70, 0.04), 'darkwood', (0, 0.0, 0.538), bevel=0.008, name='sill')
    block((0.92, 0.64, 0.42), 'cream', (0, 0.0, 0.768), bevel=0.022, name='upper')
    _timber(-0.435, 0.435, FY - 0.015, 0.57, 0.97)
    _lights((-0.30, 0.0, 0.30), FY - 0.019, 0.83, r=0.036, h=0.092)
    _gable(0.92, 0.64, 0.36, (0, 0.0, 0.978))
    for x in (-0.22, 0.22):  # two rafters across the front slope, instead of a dormer: at 48 px a
        block((0.03, 0.42, 0.022), 'darkwood', (x, -0.17, 1.145), rot=(0.70, 0, 0), bevel=0.0,
              name='rafter')  # dormer is only ever a blank board stuck on the roof
    block((0.10, 0.10, 0.26), 'slate', (0.33, 0.16, 1.10), bevel=0.012, name='chimney')
    block((0.13, 0.13, 0.035), 'darkwood', (0.33, 0.16, 1.245), bevel=0.006, name='chimneycap')
    # the sign over the door: a shield, hung from a bracket. Crossed swords are a bow tie at this
    # size - one bold shape with one mark on it is the most a 48 px sprite can carry.
    block((0.30, 0.03, 0.028), 'darkwood', (0, FY - 0.012, 0.63), bevel=0.004, name='signtop')
    rod(0.008, 0.10, 'darkwood', (0, FY - 0.012, 0.59), name='hanger')
    block((0.19, 0.035, 0.17), 'team', (0, FY - 0.014, 0.47), bevel=0.02, name='shield')
    lathe([(0.095, 0), (0.06, 0.055), (0.0, 0.085)], 'team', loc=(0, FY - 0.014, 0.385),
          seg=24, name='shieldpoint')
    block((0.042, 0.016, 0.155), 'silver', (0, FY - 0.034, 0.465), bevel=0.004, name='bar')
    block((0.155, 0.016, 0.042), 'silver', (0, FY - 0.034, 0.505), bevel=0.004, name='bar2')
    return 1.9


def model_barracks3():
    """Tier 3, the stone fort: the first tier made of stone rather than timber, with a crenellated
    crown, two corner turrets and a banner on each. This is where the ladder turns military.

    It must not simply be a small castle: the keep is low and wide, the turrets are square-capped
    rather than coned, and the colour comes from the banners, so the base stays legible as 'fort'.
    """
    FY = -0.30
    block((1.26, 0.80, 0.05), 'darkwood', (0, 0.02, 0.025), bevel=0.012, name='foot')
    block((1.20, 0.74, 0.05), 'grey', (0, 0.02, 0.072), bevel=0.012, name='step')
    block((0.92, 0.60, 0.66), 'tan', (0, 0.02, 0.427), bevel=0.028, name='keep')
    _courses((0.926, 0.606), (0, 0.02), 4, 0.18, 0.15)
    block((0.95, 0.63, 0.024), 'cream', (0, 0.02, 0.52), bevel=0.005, name='course')
    block((0.99, 0.67, 0.042), 'cream', (0, 0.02, 0.778), bevel=0.008, name='coping')
    block((0.88, 0.56, 0.028), 'tan', (0, 0.02, 0.813), bevel=0.0, name='roof')
    for i in range(4):
        x = -0.315 + i * 0.21
        block((0.15, 0.12, 0.115), 'tan', (x, -0.235, 0.857), bevel=0.014, name='merlon')
        block((0.15, 0.12, 0.018), 'team', (x, -0.235, 0.923), bevel=0.004, name='cap')
        block((0.15, 0.12, 0.075), 'tan', (x, 0.275, 0.837), bevel=0.014, name='backmerlon')
    _door(0.0, FY, 0.30, 0.26, 0.40, panels=4)
    rod(0.165, 0.05, 'grey', (0, FY - 0.012, 0.50), rot=(math.pi / 2, 0, 0), name='archring')
    rod(0.128, 0.055, 'opening', (0, FY - 0.016, 0.50), rot=(math.pi / 2, 0, 0), name='archhole')
    _lights((-0.31, 0.31), FY - 0.002, 0.52, r=0.036, h=0.095)
    # the two corner turrets: square, capped flat, each flying a banner
    for x in (-0.555, 0.555):
        block((0.34, 0.40, 0.05), 'darkwood', (x, -0.02, 0.025), bevel=0.008, name='turretfoot')
        block((0.30, 0.36, 0.84), 'tan', (x, -0.02, 0.47), bevel=0.022, name='turret')
        _courses((0.306, 0.366), (x, -0.02), 4, 0.17, 0.165)
        _arch(x, -0.205, 0.62, 0.034, 0.088)
        block((0.35, 0.41, 0.032), 'cream', (x, -0.02, 0.906), bevel=0.006, name='corbel')
        _merlons([(x + dx, -0.17, 0.0) for dx in (-0.115, 0.0, 0.115)]
                 + [(x + dx, 0.13, 0.0) for dx in (-0.115, 0.115)], 0.922, 0.095, 0.072,
                 capz=0.016, grow=1.0)
        flag((x, -0.02, 1.45), pole_h=0.42, h=0.20, w=0.24)
    return 2.0


def model_barracks4():
    """Tier 4, the war academy: the top of the ladder, so it is the only barracks allowed gold and
    a dome. A columned front, an onion dome on a drum, two small domes over the wings.

    An onion profile, not a cone - it has to be read as a different KIND of roof from the castle's
    spires at a glance, or the top tier looks like a recoloured tier 3.
    """
    FY = -0.33
    block((1.38, 0.86, 0.05), 'darkwood', (0, 0.03, 0.025), bevel=0.012, name='foot')
    block((1.32, 0.80, 0.05), 'cream', (0, 0.03, 0.072), bevel=0.012, name='step')
    block((1.24, 0.74, 0.05), 'cream', (0, 0.03, 0.122), bevel=0.012, name='step2')
    # the two wings, low, each under a small dome
    for x in (-0.47, 0.47):
        block((0.40, 0.60, 0.50), 'cream', (x, 0.04, 0.397), bevel=0.022, name='wing')
        _courses((0.406, 0.606), (x, 0.04), 3, 0.23, 0.115)
        _arch(x, FY + 0.005, 0.40, 0.040, 0.10)
        block((0.46, 0.66, 0.035), 'gold', (x, 0.04, 0.665), bevel=0.008, name='cornice')
        lathe([(0.175, 0), (0.175, 0.03), (0.0, 0.03)], 'cream', loc=(x, 0.04, 0.683), name='drum')
        lathe([(0.15, 0.0), (0.175, 0.045), (0.178, 0.10), (0.155, 0.165), (0.105, 0.225),
               (0.05, 0.275), (0.016, 0.315), (0.0, 0.345)], 'team', loc=(x, 0.04, 0.713),
              name='dome')
        ball(0.030, 'gold', (x, 0.04, 1.085))
    # the centre block, set forward, with a columned porch over the door
    block((0.62, 0.66, 0.74), 'cream', (0, 0.0, 0.517), bevel=0.025, name='centre')
    _courses((0.626, 0.666), (0, 0.0), 4, 0.24, 0.145)
    _door(0.0, FY, 0.34, 0.24, 0.44, panels=4)
    rod(0.15, 0.05, 'gold', (0, FY - 0.012, 0.56), rot=(math.pi / 2, 0, 0), name='archring')
    rod(0.118, 0.055, 'opening', (0, FY - 0.016, 0.56), rot=(math.pi / 2, 0, 0), name='archhole')
    for x in (-0.255, 0.255):  # the columns: turned, gold, standing proud of the front face
        lathe([(0.055, 0), (0.055, 0.03), (0.042, 0.055), (0.038, 0.60), (0.050, 0.63),
               (0.058, 0.66), (0.0, 0.66)], 'gold', loc=(x, FY - 0.055, 0.17), name='column')
    block((0.68, 0.13, 0.042), 'gold', (0, FY - 0.045, 0.862), bevel=0.01, name='architrave')
    block((0.60, 0.11, 0.03), 'cream', (0, FY - 0.045, 0.902), bevel=0.006, name='attic')
    block((0.68, 0.70, 0.042), 'gold', (0, 0.0, 0.908), bevel=0.008, name='cornice')
    # the great drum and onion dome: the tallest thing on the piece
    lathe([(0.265, 0), (0.265, 0.17), (0.0, 0.17)], 'cream', loc=(0, 0.0, 0.929), name='drum')
    for k in range(8):
        a = 2 * math.pi * k / 8 + math.pi / 16
        rod(0.022, 0.16, 'gold', (0.265 * math.cos(a), 0.265 * math.sin(a), 1.009), name='pilaster')
    lathe([(0.235, 0.52), (0.235, 0.555), (0.0, 0.555)], 'gold', loc=(0, 0.0, 0.58), name='ring')
    lathe([(0.225, 0.0), (0.265, 0.07), (0.272, 0.155), (0.238, 0.255), (0.165, 0.345),
           (0.082, 0.425), (0.028, 0.485), (0.0, 0.53)], 'team', loc=(0, 0.0, 1.135), name='dome')
    ball(0.045, 'gold', (0, 0.0, 1.70))
    flag((0, 0.0, 1.95), pole_h=0.34, h=0.20, w=0.26)
    return 2.3


def model_tower():
    """The watchtower: a stone foot, a tapering timber shaft, a jettied lookout and a team cone.

    The pilot painted a team-coloured band round the middle of the shaft, which reads as a ribbon
    tied on rather than as paint. The colour belongs on the roof; what the shaft needs instead is
    the dark ring at each floor level that a real timber tower has.
    """
    block((0.86, 0.72, 0.05), 'darkwood', (0, 0.0, 0.025), bevel=0.012, name='foot')
    block((0.80, 0.66, 0.05), 'grey', (0, 0.0, 0.072), bevel=0.012, name='step')
    block((0.60, 0.50, 0.40), 'tan', (0, 0.0, 0.297), bevel=0.025, name='plinth')
    _courses((0.606, 0.506), (0, 0.0), 3, 0.17, 0.10)
    _door(0.0, -0.255, 0.26, 0.20, 0.30)
    block((0.66, 0.56, 0.035), 'cream', (0, 0.0, 0.515), bevel=0.008, name='cap')
    # the shaft: battered (wider at the foot), ringed at each floor
    lathe([(0.255, 0), (0.255, 0.035), (0.225, 0.07), (0.205, 0.62), (0.0, 0.62)], 'wood',
          loc=(0, 0, 0.533), name='shaft')
    for z in (0.18, 0.40):
        lathe([(0.222, z), (0.222, z + 0.032)], 'darkwood', loc=(0, 0, 0.533), name='ring')
    for k in range(4):  # corner braces, thick enough to survive the downscale
        a = math.pi / 4 + k * math.pi / 2
        rod(0.028, 0.46, 'darkwood', (0.20 * math.cos(a), 0.20 * math.sin(a), 0.76),
            rot=(0.10 * math.sin(a), -0.10 * math.cos(a), 0), name='brace')
    # the lookout, jettied out over the shaft so the tower has a waist
    lathe([(0.315, 0), (0.315, 0.045), (0.0, 0.045)], 'darkwood', loc=(0, 0, 1.153), name='deck')
    lathe([(0.235, 0), (0.235, 0.30), (0.0, 0.30)], 'cream', loc=(0, 0, 1.198), name='cabin')
    _arch(0, -0.245, 1.335, 0.042, 0.105)
    for k in range(6):
        a = math.pi / 6 + k * math.pi / 3
        rod(0.024, 0.30, 'darkwood', (0.245 * math.cos(a), 0.245 * math.sin(a), 1.348),
            name='post')
    lathe([(0.235, 0.30), (0.285, 0.34), (0.285, 0.372), (0.0, 0.372)], 'cream', loc=(0, 0, 1.198),
          name='corbel')
    _cone((0, 0, 1.570), 0.315, 0.50, 'team', name='roof')
    ball(0.042, 'gold', (0, 0, 2.065))
    flag((0, 0, 2.30), pole_h=0.28, h=0.18, w=0.24)
    return 2.4


def model_mine():
    """The mine: a turned, terraced rock (the way Erzgebirge toy mines are cut) with moss on top,
    a big timbered adit, a cart of gold on rails, a lantern and the owner's pennant.

    The one building that is not architecture, so it must not get a step or courses - a dressed
    base would turn the rock into a plinth. What it gets instead is a dark apron of spoil, which
    gives it the ground line the other pieces get from their foot.
    """
    lathe([(0.60, 0), (0.60, 0.03), (0.0, 0.03)], 'darkwood', loc=(0, 0.10, 0), name='spoil',
          scale=(1.12, 1.0, 1))
    # The rock: slabs cut at angles, the way a carved toy rock is. Anything turned on the lathe
    # comes out a wedding cake from above. The bevel has to stay SMALL - rounded slabs are a heap
    # of soap - and the stack has to narrow as it rises, or it is a pile and not a hill. The
    # bottom slab is deep enough to swallow the adit, so the portal is cut INTO the rock rather
    # than standing beside it.
    block((1.00, 0.86, 0.30), 'grey', (0.0, 0.05, 0.195), rot=(0.03, 0.07, 0.17), bevel=0.02,
          name='rockA')
    block((0.74, 0.60, 0.16), 'slate', (0.05, 0.17, 0.415), rot=(0.10, -0.13, -0.31), bevel=0.02,
          name='rockB')
    block((0.60, 0.46, 0.21), 'grey', (-0.05, 0.21, 0.565), rot=(0.07, 0.17, 0.52), bevel=0.02,
          name='rockC')
    block((0.34, 0.30, 0.15), 'slate', (0.07, 0.28, 0.735), rot=(0.14, -0.22, -0.72), bevel=0.02,
          name='rockD')
    # chips jutting out of the stack: without them the slabs are four crates piled up, because
    # every silhouette edge is a straight line from top to bottom
    for (cx, cy, cz, cw, cd, ch, rx, ry, rz) in (
            (-0.47, -0.05, 0.33, 0.30, 0.26, 0.14, 0.0, 0.34, 0.30),
            (0.46, 0.22, 0.46, 0.26, 0.22, 0.12, 0.18, -0.30, -0.5),
            (0.20, -0.14, 0.59, 0.24, 0.20, 0.11, -0.22, 0.24, 0.8),
            (-0.26, 0.40, 0.68, 0.22, 0.18, 0.10, 0.26, 0.18, -0.2)):
        block((cw, cd, ch), 'grey', (cx, cy, cz), rot=(rx, ry, rz), bevel=0.02, name='chip')
    # moss lies FLAT on the ledges the slabs leave, tilted the way the slab under it is tilted -
    # stuck on a vertical face it is only a green sticker
    for (mx, my, mz, ms, rx, ry, rz) in ((-0.30, -0.08, 0.375, 0.30, 0.03, 0.07, 0.17),
                                         (0.26, -0.16, 0.368, 0.24, 0.03, 0.07, 0.17),
                                         (-0.24, 0.24, 0.690, 0.22, 0.07, 0.17, 0.52),
                                         (0.33, 0.28, 0.516, 0.18, 0.10, -0.13, -0.31)):
        block((ms, ms * 0.8, 0.035), 'moss', (mx, my, mz), rot=(rx, ry, rz), bevel=0.014,
              name='moss')
    # the adit: a timbered portal round a big dark opening, cut into the front of the rock
    block((0.56, 0.3, 0.5), 'grey', (-0.05, -0.36, 0.278), bevel=0.03, name='portal')
    block((0.36, 0.05, 0.42), 'opening', (-0.05, -0.50, 0.228), bevel=0.0, name='mouth')
    rod(0.18, 0.05, 'opening', (-0.05, -0.50, 0.438), rot=(math.pi / 2, 0, 0), name='mouthtop')
    for x in (-0.27, 0.17):
        block((0.085, 0.10, 0.50), 'darkwood', (x, -0.525, 0.278), bevel=0.012, name='jamb')
    block((0.62, 0.11, 0.095), 'darkwood', (-0.05, -0.525, 0.545), bevel=0.014, name='lintel')
    for x in (-0.19, -0.05, 0.09):  # the props inside the mouth, which give it depth
        rod(0.018, 0.40, 'darkwood', (x, -0.465, 0.228), name='prop')
    lathe([(0.035, 0), (0.04, 0.06), (0.0, 0.08)], 'yellow', loc=(0.24, -0.58, 0.40), seg=16,
          name='lamp')
    rod(0.006, 0.05, 'black', (0.24, -0.58, 0.51), name='hook')
    # rails and the cart, heaped with gold
    for x in (-0.08, 0.08):
        block((0.022, 0.36, 0.018), 'darkwood', (x + 0.3, -0.72, 0.037), bevel=0.0, name='rail')
    block((0.3, 0.24, 0.15), 'brown', (0.3, -0.75, 0.155), bevel=0.025, name='cart')
    for z in (0.11, 0.20):
        block((0.31, 0.25, 0.022), 'darkwood', (0.3, -0.75, z), bevel=0.004, name='cartband')
    for (x, y) in ((0.19, -0.64), (0.41, -0.64), (0.19, -0.86), (0.41, -0.86)):
        rod(0.045, 0.03, 'black', (x, y, 0.075), rot=(0, math.pi / 2, 0), name='wheel')
    for (dx, dy, r) in ((-0.07, 0.0, 0.06), (0.06, 0.03, 0.065), (0.0, -0.05, 0.055),
                        (0.08, -0.06, 0.05), (-0.08, -0.06, 0.05), (0.0, 0.02, 0.06)):
        ball(r, 'nugget', (0.3 + dx, -0.75 + dy, 0.245 + r * 0.5), scale=(1, 1, 0.8))
    flag((0.07, 0.28, 1.34), pole_h=0.62, h=0.22, w=0.28)
    return 1.9


def model_rubble():
    """What a destroyed building leaves: one standing wall corner with its top broken away, two
    snapped roof beams, and a scatter of bricks and tiles. Teamless - a ruin has no owner.

    A ruin is read by its EDGES: every top edge has to be broken, and nothing may be level with
    anything else, or it goes back to being a low building. So the stubs are different heights,
    the courses stop short of the breaks, and the beams cross at an angle nothing else on the
    board has.
    """
    lathe([(0.40, 0), (0.40, 0.022), (0.0, 0.022)], 'darkwood', loc=(-0.12, 0.06, 0), seg=24,
          name='spoil', scale=(1.25, 1.0, 1))
    # the standing corner: two stubs of wall, broken off at different heights
    block((0.50, 0.15, 0.46), 'tan', (-0.17, 0.21, 0.258), bevel=0.02, name='wallA')
    _courses((0.506, 0.156), (-0.17, 0.21), 2, 0.17, 0.14)
    block((0.15, 0.42, 0.33), 'tan', (-0.40, -0.02, 0.193), bevel=0.02, name='wallB')
    _courses((0.156, 0.426), (-0.40, -0.02), 2, 0.15, 0.12)
    # the broken tops: smaller blocks at angles, so no edge is straight
    block((0.17, 0.155, 0.10), 'tan', (0.01, 0.21, 0.53), rot=(0, 0.13, 0.1), bevel=0.016,
          name='breakA')
    block((0.12, 0.15, 0.07), 'tan', (-0.33, 0.21, 0.52), rot=(0, -0.18, 0), bevel=0.016,
          name='breakB')
    block((0.155, 0.13, 0.08), 'tan', (-0.40, -0.20, 0.395), rot=(0.16, 0, 0), bevel=0.016,
          name='breakC')
    block((0.17, 0.05, 0.19), 'opening', (-0.15, 0.135, 0.30), bevel=0.0, name='window')
    # two snapped beams, fallen across each other
    rod(0.036, 0.78, 'darkwood', (0.08, -0.14, 0.14), rot=(0.0, 1.30, 0.55), name='beamA')
    rod(0.032, 0.62, 'darkwood', (0.16, 0.10, 0.09), rot=(0.0, 1.45, -0.35), name='beamB')
    rod(0.026, 0.34, 'brown', (-0.02, -0.34, 0.06), rot=(0.0, 1.48, 1.10), name='beamC')
    # bricks, tiles and splinters: a few, big, and no two alike
    for (x, y, z, w, d, h, a) in ((0.34, -0.16, 0.05, 0.17, 0.12, 0.07, 0.5),
                                  (0.20, -0.42, 0.045, 0.14, 0.11, 0.06, -0.3),
                                  (-0.08, -0.46, 0.055, 0.16, 0.13, 0.08, 0.9),
                                  (0.42, 0.14, 0.05, 0.13, 0.11, 0.07, 0.2),
                                  (0.06, 0.40, 0.045, 0.15, 0.12, 0.06, -0.7),
                                  (-0.46, -0.40, 0.05, 0.14, 0.12, 0.07, 1.2)):
        block((w, d, h), 'tan', (x, y, z + 0.028), rot=(0, 0, a), bevel=0.014, name='brick')
    for (x, y, a, t) in ((0.30, -0.30, 0.6, 0.35), (-0.22, -0.40, -0.5, -0.3),
                         (0.46, -0.04, 1.1, 0.25), (-0.30, 0.44, 0.2, -0.4)):
        block((0.19, 0.15, 0.028), 'slate', (x, y, 0.07), rot=(t, 0, a), bevel=0.006, name='tile')
    return 1.5


# The pieces with no owner. Kept here rather than imported from tools/art/sprites.py, which
# pulls in scipy and so cannot be imported inside Blender.
TEAMLESS = {'rubble'}

MODELS = {'base': model_castle, 'barracks1': model_barracks1, 'barracks2': model_barracks2,
          'barracks3': model_barracks3, 'barracks4': model_barracks4, 'tower': model_tower,
          'mine': model_mine, 'rubble': model_rubble}

YAW = {'base': -18, 'barracks1': -32, 'barracks2': -30, 'barracks3': -24, 'barracks4': -20,
       'tower': -20, 'mine': -28, 'rubble': -26}
