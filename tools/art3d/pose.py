"""Poses for the troop models: carved parts turn about joints, nothing bends.

A wooden toy's arm is one carved piece: it swings about the shoulder, it does not deform. So a
pose here is a list of (group, pivot, euler) turns over the groups troops.py tags with prim.group,
plus a lift of the whole body. No skeleton, no skinning, no weights, nothing to rig.

Model space: +z up, the figure faces -y, so a limb swinging fore and aft turns about x; a wing
spread along x beats about y. Positive is forward / down for a limb, up for a wing.

Nine troops share the machinery but not the measurements: JOINTS gives each model its own hip and
shoulder height, GAIT how far it strides (a colossus does not scissor like a boy), and STYLE which
of the six attacks it carves — a thrust, a swing, a bow draw, a sling, a cast, a breath.
"""
import math

import bpy

HIP, SHOULDER = 0.300, 0.548     # z of the chibi body's hip and shoulder joints (body.py)
SWING = math.radians(45)         # how far a leg swings fore and aft: at 40 px a small stride
                                 # is invisible, so the legs scissor far wider than a real walk
ARM = math.radians(26)
WALK, STRIKE = 6, 4              # frames in each cycle
TURN = 2                         # and the two the figure passes through as it turns round

# the big troops are not built on the chibi body, so their joints sit where their own legs and
# shoulders are: (hip z, shoulder z). Anything missing here is a foot troop.
JOINTS = {'ogre': (0.42, 0.77), 'colossus': (0.50, 0.95), 'drake': (0.33, 0.60)}
# how much of the standard swing a model takes, and how far it bobs: weight reads as a short
# stride under a heavy roll, not as a long one
GAIT = {'ogre': 0.74, 'colossus': 0.60, 'drake': 0.88}
BOB = {'ogre': 0.030, 'colossus': 0.036, 'drake': 0.016}
FLAP = math.radians(26)          # the drake's wingbeat, twice a step


def _ramp(seq):
    return [math.radians(a) for a in seq]


# the attacks, four carved keyframes each: wind up, hold, drive, recover
THRUST = _ramp((-26, -58, 48, 16))       # militia, guard: the shaft goes straight out
SWING_ARM = _ramp((-62, -98, 58, 18))    # shield, ogre, colossus: over the shoulder and down
DRAW = _ramp((-20, -48, -6, 6))          # bowman: the string hand pulls back and lets go
BOW = _ramp((-2, -8, -2, 0))             # ...while the bow hand barely moves
SLING = _ramp((-96, -36, 74, 26))        # slinger: one full whirl past the ear
CAST = _ramp((-40, -80, -62, -30))       # adept: the staff goes up and stays up
BREATH = _ramp((-24, -44, 28, 8))        # drake: the head rears, then throws forward
LEAN = {'thrust': _ramp((3, -5, 11, 5)), 'swing': _ramp((4, -9, 14, 6)),
        'draw': _ramp((2, -4, 2, 0)), 'sling': _ramp((6, -7, 12, 4)),
        'cast': _ramp((-4, -11, 8, 3)), 'breathe': _ramp((-4, -9, 10, 3))}

STYLE = {'militia': 'thrust', 'guard': 'thrust', 'shield': 'swing', 'ogre': 'swing',
         'colossus': 'swing', 'bowman': 'draw', 'slinger': 'sling', 'adept': 'cast',
         'drake': 'breathe'}

AXIS = {'x': 0, 'y': 1, 'z': 2}


def joint(objs, pivot, rot):
    """Turn a group of parts about a point, by parenting them to an empty placed there."""
    bpy.ops.object.empty_add(location=pivot)
    e = bpy.context.active_object
    for o in objs:
        o.parent = e
        o.matrix_parent_inverse = e.matrix_world.inverted()
    e.rotation_euler = rot
    return e


def _joints(name):
    return JOINTS.get(name, (HIP, SHOULDER))


def walk(i: int, name: str):
    """One frame of a walk cycle: the legs scissor, the arms counter-swing, the body bobs."""
    # half a step off the zero crossings, and the swing warped so the foot plants and holds: six
    # even samples of a plain sine would land on three mirrored pairs, i.e. three poses, not six
    t = 2 * math.pi * (i + 0.5) / WALK
    s = math.sin(t + 0.45 * math.sin(t))
    hip, sh = _joints(name)
    k = GAIT.get(name, 1.0)
    turns = [('legL', hip, SWING * k * s), ('legR', hip, -SWING * k * s),
             ('armL', sh, -ARM * k * s), ('armR', sh, ARM * k * s * 0.5)]
    if name == 'drake':
        # the wings beat twice a step, and they beat in step with the bob, so the body looks
        # carried by them rather than dropped onto the ground
        f = math.sin(2 * t)
        turns += [('wingL', sh, -FLAP * f, 'y'), ('wingR', sh, FLAP * f, 'y')]
    # highest when the legs pass each other, lowest when they are spread: twice the step rate
    return turns, BOB.get(name, 0.020) * (1 - abs(s))


def strike(i: int, name: str):
    """One frame of an attack, in whichever of the six styles this troop was carved for."""
    hip, sh = _joints(name)
    style = STYLE.get(name, 'thrust')
    turns = []
    if style == 'thrust':
        turns = [('armR', sh, THRUST[i])]
    elif style == 'swing':
        turns = [('armR', sh, SWING_ARM[i])]
    elif style == 'draw':
        turns = [('armL', sh, DRAW[i]), ('armR', sh, BOW[i])]
    elif style == 'sling':
        turns = [('armR', sh, SLING[i])]
    elif style == 'cast':
        turns = [('armR', sh, CAST[i])]
    elif style == 'breathe':
        # no arms to swing: the head is the weapon, and the wings flare with the breath
        turns = [('head', sh, BREATH[i]),
                 ('wingL', sh, -abs(BREATH[i]) * 0.7, 'y'),
                 ('wingR', sh, abs(BREATH[i]) * 0.7, 'y')]
    lean = LEAN[style][i]
    rest = ['body', 'head', 'armL'] if style != 'draw' else ['body', 'head']
    if style == 'breathe':
        rest = ['body']
    turns += [(g, hip, lean) for g in rest if g not in {t[0] for t in turns}]
    return turns, 0.012 * (1 if i == 2 else 0)


def swivel(i: int, name: str):
    """One frame of a turn: the same standing pose, only swung towards the camera.

    A troop sprite faces right and the board mirrors it to face left, so a turn used to be a
    horizontal squash through nothing - a sheet of paper flipping. These are the two views in
    between: head-on (i = 0) and half way round (i = 1), the second of which the board mirrors
    for the other half of the swing. The pose is the still's, because a turn lasts a sixth of a
    second and the legs have nowhere to go in it.
    """
    return [], 0.0


# how much of a model's own yaw each turn frame keeps: 0 is dead front, 1 is the still
TURN_YAW = (0.0, 0.5)

CYCLES = {'w': (walk, WALK), 'a': (strike, STRIKE), 't': (swivel, TURN)}


def yaw_mul(kind, i: int) -> float:
    """The share of the model's yaw frame i of a cycle is turned by (only the turn shortens it)."""
    return TURN_YAW[i] if kind == 't' else 1.0


def apply(groups: dict, kind: str, i: int, name: str = 'militia') -> float:
    """Pose the tagged groups for frame i of a cycle; returns how far the body lifts."""
    turns, lift = CYCLES[kind][0](i, name)
    for turn in turns:
        gname, z, angle = turn[0], turn[1], turn[2]
        axis = AXIS[turn[3]] if len(turn) > 3 else 0
        objs = groups.get(gname)
        if objs:
            rot = [0.0, 0.0, 0.0]
            rot[axis] = angle
            joint(objs, (0, 0, z), tuple(rot))
    return lift
