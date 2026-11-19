"""Poses for the troop models: carved parts turn about joints, nothing bends.

A wooden toy's arm is one carved piece: it swings about the shoulder, it does not deform. So a
pose here is a list of (group, pivot, euler) turns over the groups troops.py tags with prim.group,
plus a lift of the whole body. No skeleton, no skinning, no weights, nothing to rig.

Model space: +z up, the figure faces -y, so a limb swinging fore and aft turns about x; a wing
spread along x beats about y. Positive is forward / down for a limb, up for a wing.

Nine troops share the machinery but not the measurements: JOINTS gives each model its own hip and
shoulder height, GAIT how far it strides (a colossus does not scissor like a boy), and STYLE which
of the six attacks it carves — a thrust, a swing, a bow draw, a sling, a cast, a breath.

Two of the nine are not walking at all, and say so by leaving those tables empty: the colossus
rolls on wheels, and the drake never touches the board (hover()).
"""
import math
import os

import bpy

HIP, SHOULDER = 0.300, 0.548     # z of the chibi body's hip and shoulder joints (body.py)
SWING = math.radians(45)         # how far a leg swings fore and aft: at 40 px a small stride
                                 # is invisible, so the legs scissor far wider than a real walk
ARM = math.radians(26)
WALK, STRIKE = 6, 4              # frames in each cycle
TURN = 2                         # and the two the figure passes through as it turns round
FALL = 3                         # and the three it topples through when it is killed

# the big troops are not built on the chibi body, so their joints sit where their own legs and
# shoulders are: (hip z, shoulder z). Anything missing here is a foot troop.
JOINTS = {'ogre': (0.42, 0.77), 'colossus': (0.50, 0.95), 'drake': (0.50, 0.62)}
# y of the heel each model goes over backwards on (the figure faces -y, so its heels are at +y):
# a foot troop's boot is a 0.076 drum, the big ones stand on their own feet. The drake is not in
# the table: he has no heels in the air, and fall() takes him over his nose instead.
HEEL = {'ogre': 0.105, 'colossus': 0.135}
# how much of the standard swing a model takes, and how far it bobs: weight reads as a short
# stride under a heavy roll, not as a long one
GAIT = {'ogre': 0.74, 'colossus': 0.60}
BOB = {'ogre': 0.030, 'colossus': 0.036}
# ------------------------------------------------------------------------ the drake's flight
# He is the only piece on the board that never touches it, so he has no walk at all: walk() and
# walk_rock() both hand him straight to hover() below. The wing roots sit over the spine rather
# than out at a shoulder, so the beat turns about a point of its own - about the shoulder height
# the roots would have dragged up and down with every stroke.
WING = (0.0, 0.04, 0.79)         # where both wings are hinged: on the back, at the roots
HOVER = math.radians(18)         # how far each wing beats either side of level. At 32 the top
# of the upstroke stood the wings on edge, and for half the cycle the only team colour on the
# piece went to a sliver: on this model the membrane IS the livery, so it may never close.
HOVER_BOB = 0.075                # how far the body rises and falls on the beat
HOVER_LEG = math.radians(9)      # the tucked feet swing after the body and carry nothing


def _ramp(seq):
    return [math.radians(a) for a in seq]


# the attacks, four carved keyframes each: wind up, hold, drive, recover
THRUST = _ramp((-26, -58, 48, 16))       # militia: the shaft goes straight out
SWING_ARM = _ramp((-62, -98, 58, 18))    # shield, ogre: over the shoulder and down
# the guard's crossbow. Everyone else's attack is a limb travelling somewhere; his is a limb
# NOT travelling, and then a kick. He braces, holds dead still for a beat - that stillness is
# the whole character, the parade soldier who turns out to be the one man here who can aim -
# and on release the butt drives the muzzle up. 14 degrees is more than a real crossbow kicks,
# and it has to be: at 40 px the recoil is the only frame that says a bolt left, and the sim
# draws the bolt itself (PROJ.bolt), so the sprite's job is just to be caught in the act.
AIM = _ramp((-5, -9, 14, 5))
DRAW = _ramp((-20, -48, -6, 6))          # bowman: the string hand pulls back and lets go
BOW = _ramp((-2, -8, -2, 0))             # ...while the bow hand barely moves
SLING = _ramp((-96, -36, 74, 26))        # slinger: one full whirl past the ear
CAST = _ramp((-40, -80, -62, -30))       # adept: the staff goes up and stays up
# the breath: rear back, then throw the head out ALONG the line of flight. On the old standing
# drake the +28 was the head coming down off a vertical neck; on a horizontal one the same number
# drove his face into the ground and the attack read as a crash dive.
BREATH = _ramp((-20, -34, 12, 4))        # drake: the head rears, then throws forward
# the colossus has no arms, so its attack is not an arm at all: the whole log moves, and it
# moves the way a slung ram really moves - it SLIDES, level, fore and aft on its ropes.
# THE PIVOT IS A METRE UNDERGROUND. Two earlier attempts turned the beam about the ridge it
# hangs from, which is where a pendulum's pivot belongs, and both were wrong, because the head
# sits far out along that arc rather than beneath it: out there a turn is mostly VERTICAL, so
# the head rose over the frame and the thing read as a catapult arm letting go. That is the one
# read this unit cannot have - rules.ts gives it no `ranged` field, so nothing would ever leave
# its hand. Rotating about a point 1 m below the ground instead makes the arc so flat that five
# degrees is a straight slide of about 0.19, level, which is exactly the motion wanted. The cost
# is that the ropes cannot come along (see beasts.model_colossus); they stay with the frame.
RAM_SWING = _ramp((-5.0, -9.0, 9.0, 2.5))
RAM_BODY = _ramp((4, 7, -10, 3))          # the cart hauls back with it, then lurches after it
RAM_PIVOT = -1.00                        # a metre UNDERGROUND, and that is the whole trick
LEAN = {'thrust': _ramp((3, -5, 11, 5)), 'swing': _ramp((4, -9, 14, 6)),
        'draw': _ramp((2, -4, 2, 0)), 'sling': _ramp((6, -7, 12, 4)),
        'cast': _ramp((-4, -11, 8, 3)), 'breathe': _ramp((-3, -6, 5, 2)),
        'aim': _ramp((1, -2, 5, 2))}     # braced: he leans into it, he does not swing with it

# the colossus is absent on purpose: it has no armR for a style to drive, and strike() takes
# it before the lookup.
STYLE = {'militia': 'thrust', 'guard': 'aim', 'shield': 'swing', 'ogre': 'swing',
         'bowman': 'draw', 'slinger': 'sling', 'adept': 'cast',
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


def _roots(objs):
    """The topmost parent of each part: a joint hung on another joint, not the parts twice over."""
    out = []
    for o in objs:
        while o.parent is not None:
            o = o.parent
        if o not in out:
            out.append(o)
    return out


def _joints(name):
    return JOINTS.get(name, (HIP, SHOULDER))


def hover(i: int):
    """One frame of flight: no step at all, only the beat and what the beat carries.

    ONE beat per cycle, not the two the old drake had. At six frames two beats is three frames
    each, and three frames of anything is a flicker rather than a motion. Everything below the
    spine - the tucked feet, the head on its neck - swings a beat behind the wings, because
    nothing down there is driving: a flier in the air is a body hung off two wings.

    The body is lowest at the top of the upstroke and highest at the bottom of the down, which
    is a quarter cycle behind the wings themselves. That lag is the whole read. A body that rose
    and fell in step with the wings would look nailed to them.
    """
    t = 2 * math.pi * (i + 0.5) / WALK
    f = math.sin(t)
    hip, sh = _joints('drake')
    turns = [('wingL', WING, -HOVER * f, 'y'), ('wingR', WING, HOVER * f, 'y'),
             ('legL', hip, HOVER_LEG * math.sin(t - 0.8)),
             ('legR', hip, HOVER_LEG * math.sin(t - 1.1)),
             ('head', sh, math.radians(5) * math.sin(t - 1.2)),
             # and the whole piece noses up as it is lifted, down as it falls away again
             ('^', (0.0, 0.0, sh), math.radians(5) * math.sin(t + 1.4))]
    return turns, HOVER_BOB * (0.5 - 0.5 * math.sin(t))


def walk(i: int, name: str):
    """One frame of a walk cycle: the legs scissor, the arms counter-swing, the body bobs."""
    if name == 'drake':
        return hover(i)
    # half a step off the zero crossings, and the swing warped so the foot plants and holds: six
    # even samples of a plain sine would land on three mirrored pairs, i.e. three poses, not six
    t = 2 * math.pi * (i + 0.5) / WALK
    s = math.sin(t + 0.45 * math.sin(t))
    hip, sh = _joints(name)
    k = GAIT.get(name, 1.0)
    turns = [('legL', hip, SWING * k * s), ('legR', hip, -SWING * k * s),
             ('armL', sh, -ARM * k * s), ('armR', sh, ARM * k * s * 0.5)]
    # highest when the legs pass each other, lowest when they are spread: twice the step rate
    return turns, BOB.get(name, 0.020) * (1 - abs(s))


# ---------------------------------------------------------------- the rocking walk (HF_WALK=rock)
# A troop is seen 32 degrees off head-on (toys.py YAW) at 18 degrees of elevation, so a stride
# travels 85% into the screen and only 53% across it: the legs mostly lengthen and shorten, which
# is why the scissor above had to be opened to 45 degrees to be seen at all, and why it reads as a
# pair of scissors rather than a walk. A side-to-side tip is the exact opposite - 85% of it lands
# on the screen. A lathe-turned figure has no knees anyway: it rocks over its feet, as a toy does.
ROCK_ROLL = math.radians(14)   # how far the whole piece tips, over the foot it stands on
ROCK_LEG = math.radians(20)    # the step itself: under half the old scissor. Less than this and
                               # the tip carries the whole walk and the legs read as painted on.
ROCK_ARM = math.radians(13)
ROCK_HEAD = 0.25               # the share of the tip the head keeps upright against. A carved
                               # head is its own piece, so a little lag at the neck is the style;
                               # at 0.45 it stopped reading as lag and started reading as a seam.
ROCK_LAG = 0.18                # how far behind the legs the arms and head run, in cycles. Nothing
                               # on a body starts and stops at once; with every part on one phase
                               # the whole piece snaps between poses like a pair of shears, which
                               # is half of what was wrong with the cycle this replaces.
ROCK_FOOT = 0.115              # half the stance: the tip pivots on this foot, not on the
                               # midline, so the loaded sole stays planted and the other one lifts.
                               # At 0.085 the free sole cleared the ground by about four pixels at
                               # board size, which is to say it did not clear it at all.
ROCK_SKEW = 0.25               # how far the step is skewed out of a plain sine. Six frames are
                               # sampled at 30, 90, 150, 210, 270 and 330 degrees, and a plain sine
                               # is symmetric about 90, so frames 0 and 2 came out at the same leg
                               # angle and 3 and 5 likewise: six frames holding four poses. The
                               # sin(2t) term is not symmetric there, and it earns its keep twice
                               # over: it also swings the leg out fast and brings it back slow,
                               # which is what a step does and a pendulum does not.
ROCK_LEAD = 0.06               # the weight shifts onto the foot slightly before the step lands,
                               # in cycles. A toy tips first and the leg follows it over.
GEAR_LAG = 0.15                # and the thing in the hand runs behind the hand, in cycles. A
                               # pitchfork is a stick of wood with its own weight: the fist turns
                               # it round and it arrives late. Without this every troop's weapon
                               # is welded to its arm, and nine weapons move as one piece. Past
                               # about a quarter cycle the lag stops reading as lag: the weapon
                               # drifts into counter-phase and looks driven rather than dragged.
GEAR_OVER = 1.8                # how much further the weapon swings than the hand that carries
                               # it. Lag alone only ever buys the weapon the difference between
                               # two samples of the ARM's curve, so at 40 px on a phone the whole
                               # of its motion was about ten degrees - true to a stick with no
                               # muscles, and too small to see. A stick hung off a moving grip is
                               # a pendulum, and a pendulum overshoots its pivot; this is that
                               # overshoot, and it is what makes the weapon read as loose.
GEAR_DRAG = {'slinger': 2.0,   # a pouch on two cords - it swings further than the fist does
             'militia': 1.75,  # he has had the fork since this morning and it is winning
             'bowman': 0.25,    # a brace, held level: a bow that waggles stops reading as aimed
             'adept': 0.06,    # was 0.9, which was the hobble: the staff swung back, bit the
             #                 # ground and he vaulted over it. The staff is a RULE now (plumb
             #                 # upright, see model_adept), and a rule that drifts six degrees a
             #                 # frame is not a rule. He is the still one of the nine
             'shield': 0.7,    # was 1.7, and the drag swung the door up over his own head on
             #                 # the back half of the cycle. A door that heavy does not whip
             'guard': 0.05,    # LEVELLED, in two hands, on parade. Everything below his belt
                               # is a parade and everything above it is frozen, and that is the
                               # joke: the legs go up to his chin and the crossbow, which is the
                               # thing actually fighting the war, does not move a hair.
             # was 2.6. With the toothbrush that was funny; with a log three times as thick the
             # drag swung the thing round until it pointed at the camera and VANISHED for a
             # frame - 1.56 of timber gone and back, which reads as a dropped frame, not as a
             # heavy weapon. Weight has to show as lag, never as a disappearance.
             'ogre': 0.12}     # a log WEDGED between a fist and a shoulder. It had 0.5 of lag while it was
# floating past his ear, and the user read that correctly: a thing you carry on your shoulder does
# not swing, because your shoulder is holding it. All the weight it is allowed to show now is the
# body's own roll carrying it, which is the truth - the log is part of him for the length of a walk
HEAD_LAG = 0.30                # how far behind the body a head runs when it is too heavy for its
                               # neck, in cycles. A third of a cycle is as far as it can go and
                               # still read as late rather than as wrong: past that the head is
                               # simply out of step with the shoulders instead of trailing them.
GEAR_SWAY = 0.75               # how much of the body's tip the gear on its back does NOT take:
                               # a quiver is strapped on, so it comes round late and keeps going
FIST = 0.252                   # z of the chibi fist (body.arm), the point a held weapon turns on
GRIP = {'ogre': 0.300, 'colossus': 0.350,
        # the guard's crossbow is carried at the chest now, so it swings and recoils
        # about the hands that hold it, not about the waist height a hanging fist has
        'guard': 0.400}


# ---------------------------------------------------------------------------- nine walks, not one
# Everything above is the walk all nine share. This is what each one does differently, and it is
# the whole of each troop's character on the board: at 40 px nobody reads a face, they read a
# silhouette moving. Numbers are multipliers on the shared walk unless the comment says otherwise,
# so a key left out means "walks like everyone else in that respect".
#
#   roll leg arm lag   multipliers on ROCK_ROLL / ROCK_LEG / ROCK_ARM / ROCK_LAG
#   head              the share of the tip the head holds itself against (ROCK_HEAD is 0.25)
#   armL armR         one arm alone, for a troop with something heavy hung on it: the arm AND
#                     whatever it holds. A troop who carries a long tool pins the arm holding it
#                     and pumps the empty one, which is how anyone walks with a rake
#   lean              degrees of constant pitch: + is nose down and eager, - is chest out
#   tilt              degrees of constant side list, towards the side the weight is on
#   swagger           degrees the shoulders yaw side to side, once a step
#   bounce            extra rise when the legs pass, in model units (the shared walk has none)
#   limp              a rise on one step of the two and not the other: + hops, - drops a hip
#   march             0 to 1: how far the stride is rectified into a forward-only kick
#   nod gawk          degrees the head pitches / yaws on its own, a third of a cycle behind the
#                     body: a head too heavy for its neck, arriving after the shoulders have
#                     stopped. This is the bobblehead, and it is the whole joke on the big two
#   fling             degrees the arms swing OUT sideways as well as fore and aft: an arm that
#                     cannot get past its own belly has to go round it
#   gaze peer         degrees of CONSTANT head pitch and yaw, the same in every frame. nod and
#                     gawk are the wobble; these are the attitude. At 40 px nobody sees an eye,
#                     so a troop who is not watching where he is going has to be built out of
#                     the direction of his neck. gaze is pitch, negative is chin up.
#   gearwag           degrees the thing in the LEFT hand tips on its own, about its own face: a
#                     shield is a door on a fist, and a door on a fist does not stay flat
#   stomp             like bounce but cubed - it floats high while the legs pass and slams flat
#                     when a foot lands, which is what weight sounds like with no sound
SIG = {
    # not a soldier: a farm boy who was handed a pitchfork this morning and is hurrying to a
    # place he has not thought about. He arrives nose first, arms doing far more work than the
    # short quick legs under him, and the fork - the only thing on him anyone can read at 40 px -
    # is heavy enough to be a step behind him the whole way. His arms LEAD instead of trailing
    # (lag below 1): he is pulling himself along, which is what eager looks like from the side
    'militia': dict(roll=0.7, leg=1.4, arm=1.9, armR=0.3, lag=0.75, lean=16, bounce=0.018),
    # the only one of them enjoying this. Nothing he carries weighs anything, so he is the one
    # troop whose shoulders roll into the step instead of being dragged by it: both arms wide,
    # chest out, a little spring. The sling is one curved cord with a pouch at the end - the only
    # soft thing in the army - so it is thrown wider than the fist that holds it and comes back late
    'slinger': dict(roll=1.6, leg=1.25, arm=1.7, armR=0.7, head=0.0, lag=1.4, lean=-6,
                    swagger=7, fling=14, bounce=0.016),
    # one arm has a door on it. He lists towards it, and that arm does not swing at all
    # gearwag was 38 with a 0.19 disc. The disc is now 0.60 across, and the same angle threw it
    # into a flat ellipse on the tipped frames - a dropped lid, not a shield. The swing is in
    # degrees, the shield is in pixels, so tripling the shield means cutting the degrees.
    'shield': dict(roll=1.15, leg=0.85, armL=0.12, tilt=11, lag=1.3, gearwag=14),
    # the bow stays flat - it stops reading as a bow otherwise - so his character had to go
    # somewhere else, and it went into his neck: he stalks, head thrust out ahead of his own
    # shoulders and jabbing forward once a step. A chicken that has been handed a bow
    # roll is nearly off, and it is the bow that turns it off: a body roll swings the x-z plane the
    # bow lives in towards edge-on, the daylight between stave and string shuts, and for a third of
    # the cycle he was carrying a plank again. He is a stalking hunter; not rocking suits him.
    'bowman': dict(roll=0.25, leg=0.95, arm=0.3, head=0.95, bounce=0.011,
                   lean=18, nod=8, gawk=16),
    # nod was 18 and it ate him: head-down under a 42 degree camera turns the cap inside out, you
    # get the crown instead of the face, and for three of the six frames he had no face at all. The
    # peck has to go FORWARD, not DOWN - so most of it now sits in gawk (yaw, which keeps the brow
    # pointing at the camera) and lean (the constant stoop), with nod only ticking the beat
    # THE STILL ONE. Every other troop here is built out of something that moves - the ogre's
    # whole body, the slinger's pouch, the guard's knees. With eight of them jittering, the way
    # to make the ninth stand out is to take the movement AWAY: short steps (leg 0.55), arms
    # that barely leave his sides (arm 0.35), half the usual side-to-side (roll 0.55), no bounce,
    # no limp, no stoop. He is the longest range and the slowest shot on the board, and both of
    # those say the same thing - there is still time. Nothing about him should look hurried.
    # What is left moving is the HAT: gawk and nod are a third of a cycle behind the shoulders,
    # so a hat taller than its owner keeps swinging after the owner has stopped. That half-beat
    # is his entire allowance of life, and it is enough precisely because nothing else moves.
    # gaze is POSITIVE here, which is chin DOWN: he is watching the crystal in his own hand, not
    # the enemy. The ogre does not look where he is going because he has not noticed the war;
    # this one does not look because he does not need to - he fires at three hexes and the
    # question is settled before it is asked.
    # peer stays 0 on purpose. The orb is ABOVE his head on a plumb staff, so there is nothing
    # down at his hand to turn towards, and a head yawed off the camera at 40 px just loses the
    # face. gaze alone carries it: chin down, eyes on nothing in particular, the one man here
    # who is not looking at the enemy.
    'adept': dict(leg=0.55, arm=0.35, roll=0.55, lag=1.0, gawk=9, nod=5, gaze=12),
    # on parade, alone, for an audience of nobody: knees up, chest out, head bolted on
    # the kick had to come UP (1.3 -> 1.75) and the arms had to come DOWN (1.55 -> 0.1). The
    # goose step was being paid for twice, once in the legs and once in two arms swinging along
    # with them, and two swinging arms are what every other troop here does - so the march read
    # as an ordinary walk taken slightly too seriously. A goose step is a contrast: the knee
    # goes to the chin, and NOTHING above the belt admits it. Both hands are on a levelled
    # crossbow now, so holding them still is also simply true.
    'guard': dict(roll=0.6, leg=1.75, arm=0.1, head=0.9, lean=-12, march=1.0, bounce=0.016),
    # too heavy to lift a leg far and too heavy to stop once it leans - and the head is a
    # separate problem from the body: it is still going when the shoulders have arrived
    # armR pins the log arm. It was swinging with the other one, and an arm swinging about x
    # tips a log that points backwards straight through the whole range the camera can show:
    # 60 degrees on screen in the forward frames, flat and foreshortened to a stub in the back
    # ones. Six frames, six different weapons. The free arm still swings - it has to, it is the
    # only thing on him that is walking - and the log keeps its wobble from GEAR_DRAG instead,
    # which is lag, not a new pose. swagger and fling came down for the same reason: both turn
    # the shoulder the log is bolted to, and the log is 1.4 long, so a shoulder's 11 degrees is
    # a hand's width at the far end.
    # peer/gaze: he is looking off to one side and slightly up, every frame, for ever. This is
    # the whole unit - nobody has told him there is a war on, and he is a tool, not a soldier.
    # It cost two numbers and it is worth more than anything else on him.
    # HEAVY, round 2. "Lumbering" was being spent on the wrong knobs: leg was 0.7, a middling
    # stride, and stomp 0.030, a tap. Heavy is not a big stride - a big stride is a stroll. Heavy
    # is a SHORT stride (leg 0.55: the legs barely clear each other, because lifting them is work),
    # a body thrown from foot to foot (roll stays 1.6 but over a stance widened in the model -
    # 2.05 was tried and he capsized: past about 1.7 the whole figure reads as falling over, not
    # as walking, and a troop who looks like he is toppling is a bug, not a character),
    # a hip that drops on the loaded side instead of hopping (limp +0.022 -> -0.030), and a float
    # that ends in a slam (stomp 0.030 -> 0.062, and stomp is cubed, so it is nearly all slam).
    'ogre': dict(roll=1.6, leg=0.62, arm=0.5, armR=0.06, lag=1.9, limp=-0.030, lean=-4, swagger=4,
                 nod=22, gawk=15, fling=11, stomp=0.062, peer=30, gaze=-12),
    # IT IS NOT A BODY. roll 2.8 and the rest were a stone giant falling from side to side, and
    # that read was right for a giant - which is why the ogre's hard rule (roll never over 1.7,
    # or the figure reads as toppling rather than walking) was deliberately not applied here.
    # A cart does not topple. All it may do is rock a little in its ruts and clunk over the
    # lugs; the weight is in the SILHOUETTE changing every frame, not in any amplitude.
    'colossus': dict(roll=0.22, leg=0.0, arm=0.0, lag=1.0, bounce=0.016),
}


def _sig(name, key, default=1.0):
    return SIG.get(name, {}).get(key, default)


def _rockw(t: float) -> float:
    """The step's own curve: a sine that leaves the ground quickly and comes back slowly."""
    return (math.sin(t) + ROCK_SKEW * math.sin(2 * t)) / (1 + ROCK_SKEW)


def walk_rock(i: int, name: str):
    """One frame of a walk a carved piece can actually do: it tips over its feet and steps small.

    The shared machinery is the same for all nine; SIG is what makes each of them itself.
    """
    if name == 'drake':
        return hover(i)

    def q(key, default=1.0):
        return _sig(name, key, default)

    t = 2 * math.pi * (i + 0.5) / WALK
    s = _rockw(t)
    sl = _rockw(t - 2 * math.pi * ROCK_LAG * q('lag'))
    hip, sh = _joints(name)
    k = GAIT.get(name, 1.0)
    leg, arm = ROCK_LEG * k * q('leg'), ROCK_ARM * k * q('arm')
    roll = ROCK_ROLL * k * q('roll') * _rockw(t + 2 * math.pi * ROCK_LEAD)
    # the gear goes first, so its joint ends up hung UNDER the arm's: what it is given is its
    # own swing, late (GEAR_LAG) and wider than the grip's (GEAR_OVER), measured against where
    # the arm already is. The quiver on the back drags against the tip the same way.
    sg = _rockw(t - 2 * math.pi * (ROCK_LAG * q('lag') + GEAR_LAG))
    rg = _rockw(t + 2 * math.pi * (ROCK_LEAD - GEAR_LAG))
    drag = GEAR_DRAG.get(name, 1.0) * arm * (GEAR_OVER * sg - sl)
    grip = GRIP.get(name, FIST)
    # a march rectifies the stride: at m = 1 each leg kicks forward on its half of the cycle and
    # hangs straight the rest, which is a goose step, and a goose step is what a toy soldier is
    m = q('march', 0.0)
    turns = [('armL.gear', grip, -drag), ('armR.gear', grip, drag * 0.6 * q('armR')),
             ('body.gear', sh, GEAR_SWAY * (ROCK_ROLL * k * q('roll') * rg - roll), 'y'),
             ('legL', hip, leg * (s + m * abs(s))), ('legR', hip, leg * (-s + m * abs(s))),
             ('armL', sh, -arm * sl * q('armL')), ('armR', sh, arm * sl * 0.6 * q('armR')),
             ('head', sh, -q('head', ROCK_HEAD) * roll, 'y')]
    if name == 'colossus':
        # the one piece here with no legs, so every leg and arm turn above it quietly finds no
        # group and does nothing (apply() skips an empty match). What it has instead is two
        # axles turning a whole sixth of a revolution per frame, which closes the six frame loop
        # exactly and - against FIVE lugs on each tread - never repeats a silhouette inside it.
        # The chassis pitches three degrees over the ruts, about the ground rather than a waist,
        # and the ram nods a beat behind the chassis: that lag is the only thing saying the beam
        # is slung in the shed instead of bolted to it.
        spin = 2 * math.pi * i / WALK
        turns += [('wheelF', (0.0, -0.26, 0.30), spin), ('wheelR', (0.0, 0.26, 0.30), spin),
                  ('ram', (0.0, 0.0, RAM_PIVOT), math.radians(1.1) * sl),
                  ('^', 0.0, math.radians(3.0) * s)]
    # a constant pitch and a yaw that rolls the shoulders, both over the limbs and under the tip
    if q('lean', 0.0):
        # about the soles, not the waist: a figure that leans from the hip leaves its feet behind
        turns.append(('^', 0.0, math.radians(q('lean', 0.0))))
    if q('swagger', 0.0):
        turns.append(('^', hip, math.radians(q('swagger', 0.0)) * sl, 'z'))
    # the head on its own curve, a third of a cycle behind everything below it. These go on AFTER
    # the head's counter-roll above, so they nest over it: pitch first, then the yaw it looks
    # round with. Nothing here lifts the piece, so nothing here can float it off the hex.
    sh_lag = _rockw(t - 2 * math.pi * (ROCK_LAG * q('lag') + HEAD_LAG))
    if q('nod', 0.0):
        turns.append(('head', sh, math.radians(q('nod', 0.0)) * sh_lag))
    if q('gawk', 0.0):
        turns.append(('head', sh, math.radians(q('gawk', 0.0)) * sh_lag, 'z'))
    # a head that is not pointed where the feet are going. nod/gawk are the wobble; these two are
    # the attitude, and they do not move across the cycle at all. At 40 px nobody sees an eye -
    # what reads is the DIRECTION OF THE NECK, so a troop who is not paying attention has to be
    # built out of a constant turn, not out of a look. 'gaze' is pitch, negative is chin up.
    if q('gaze', 0.0):
        turns.append(('head', sh, math.radians(q('gaze', 0.0))))
    if q('peer', 0.0):
        turns.append(('head', sh, math.radians(q('peer', 0.0)), 'z'))
    # arms that cannot pass a belly go round it: an outward swing about y, on the ROLL's curve,
    # so the arm on the side the weight falls to is the one thrown wide
    if q('gearwag', 0.0):
        # on the lagged gear curve, about y: the face of the shield swings edge-on and back, so a
        # troop who is all shield reads as all shield even when his arm is bolted down
        turns.append(('armL.gear', grip, math.radians(q('gearwag', 0.0)) * sg, 'y'))
    if q('fling', 0.0):
        f = math.radians(q('fling', 0.0)) * _rockw(t + 2 * math.pi * ROCK_LEAD)
        turns += [('armL', sh, -f, 'y'), ('armR', sh, -f, 'y')]
    # the tip goes on last, over everything the limbs are already hung on, and it turns about the
    # sole that carries the weight: a toy rocks on a foot, it does not pivot in mid-air. The piece
    # rises over that foot on its own, which is the bob - nothing has to be lifted by hand.
    # the stance scales with the model: a colossus does not stand on a boy's footprint, and its
    # hip height is the only measure of its size this file keeps
    foot = ROCK_FOOT * (hip / HIP) * (1 if roll >= 0 else -1)
    turns.append(('^', (foot, 0.0, 0.0), roll + math.radians(q('tilt', 0.0)), 'y'))
    # bounce rises twice a step, where the legs pass; limp rises on ONE step of the two and not
    # the other, which is the difference between a walk and a hobble. Its sign picks which step,
    # not which way: a lift that went negative would push the soles through the board.
    limp = q('limp', 0.0)
    hitch = abs(limp) * max(s if limp >= 0 else -s, 0.0)
    # a stomp is a bounce with the curve cubed: it hangs at the top while the legs pass and comes
    # down hard on the stride, where a bounce would still be halfway
    return turns, q('bounce', 0.0) * (1 - abs(s)) + q('stomp', 0.0) * (1 - abs(s)) ** 3 + hitch


def strike(i: int, name: str):
    """One frame of an attack, in whichever of the six styles this troop was carved for."""
    if name == 'colossus':
        # no arms, no shoulder, no lean from a hip - the machine does not have one. The log
        # slides fore and aft (RAM_PIVOT is underground, so the turn is a slide) and the cart
        # pitches about the ground under it, and that is the entire attack. The carriage top was
        # left empty for exactly this: a mantlet across the front would be in the way of it.
        return [('ram', (0.0, 0.0, RAM_PIVOT), RAM_SWING[i]),
                ('^', 0.0, RAM_BODY[i])], 0.0
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
    elif style == 'aim':
        # BOTH arms, on the same curve. The crossbow hangs off armR, and the left hand is out
        # on its fore-end; let armR move alone and the stock walks out of the hand holding it.
        turns = [('armR', sh, AIM[i]), ('armL', sh, AIM[i])]
    elif style == 'breathe':
        # no arms to swing: the head is the weapon, and the wings flare with the breath
        turns = [('head', sh, BREATH[i]),
                 ('wingL', WING, -abs(BREATH[i]) * 0.7, 'y'),
                 ('wingR', WING, abs(BREATH[i]) * 0.7, 'y')]
    lean = LEAN[style][i]
    rest = ['body', 'head', 'armL'] if style != 'draw' else ['body', 'head']
    if style == 'aim':
        rest = ['body', 'head']
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


# how far past upright the piece has gone over in each frame of the topple. Negative is
# backwards here (positive is forward, as for a limb), and the last one is a few degrees past
# flat: a struck toy does not crumple into a heap, it goes over on its heels and settles.
FALL_TILT = _ramp((-36, -72, -96))
DIVE = _ramp((-14, -26, -34))    # the drake's own fall: a shallow nose-over and a roll onto the
ROLL = _ramp((10, 62, 128))      # back, instead of the heel-pivot the standing pieces use


def fall(i: int, name: str):
    """One frame of a death: the whole carved piece tips over backwards on its heels.

    The old death was the still sprite spun in the picture plane - the piece stayed its standing
    self and the picture rotated, which is the sheet of paper again. Turning the model instead
    gives the foreshortening a real topple has: the figure shortens as it goes over, the face
    turns up at the sky, and the soles come towards us.

    Nothing bends and nothing splays: one group holding every part, one pivot at the heels.
    toys.py lifts whatever ends up under the board back onto it.

    The drake is the exception, because he has no heels down there to go over. He is shot out of
    the sky instead: a shallow nose-over and a ROLL, and the roll is what sells it. Pitched alone
    he ended the cycle stood on his nose with both wings spread, which reads as a landing rather
    than a death; rolled onto his back the wings go under him and the pale belly comes up, which
    is the one thing nothing alive on this board ever shows.
    """
    if name == 'drake':
        return [('*', (0.0, -0.10, 0.62), DIVE[i]),
                ('*', (0.0, -0.10, 0.62), ROLL[i], 'y')], 0.0
    return [('*', (0.0, HEEL.get(name, 0.076), 0.0), FALL_TILT[i])], 0.0


# how much of a model's own yaw each turn frame keeps: 0 is dead front, 1 is the still
TURN_YAW = (0.0, 0.5)

# The ROCKING walk is the one the game ships. The scissor above is kept because its comment is
# the argument for the rock - a stride at this camera travels 85% into the screen and only 53%
# across it, so a scissor has to open to 45 degrees to be seen at all and then reads as a pair of
# scissors rather than a walk, while a side-to-side tip lands 85% on screen. HF_WALK=scissor puts
# the old one back for a side-by-side.
CYCLES = {'w': (walk_rock, WALK), 'a': (strike, STRIKE), 't': (swivel, TURN), 'd': (fall, FALL)}
if os.environ.get('HF_WALK') == 'scissor':
    CYCLES['w'] = (walk, WALK)


def yaw_mul(kind, i: int) -> float:
    """The share of the model's yaw frame i of a cycle is turned by (only the turn shortens it)."""
    return TURN_YAW[i] if kind == 't' else 1.0


def apply(groups: dict, kind: str, i: int, name: str = 'militia') -> float:
    """Pose the tagged groups for frame i of a cycle; returns how far the body lifts."""
    turns, lift = CYCLES[kind][0](i, name)
    for turn in turns:
        gname, z, angle = turn[0], turn[1], turn[2]
        axis = AXIS[turn[3]] if len(turn) > 3 else 0
        # a pivot is a height on the model's axis, or a whole point where a joint sits off it
        # (the heels a dying piece goes over on); '*' turns every part as one carved whole
        at = tuple(z) if isinstance(z, (tuple, list)) else (0.0, 0.0, z)
        if gname == '^':
            # every part that is not already hung on a joint, plus the joints themselves:
            # one more empty over the whole assembly, so a tip carries the posed limbs
            objs = [o for o in bpy.context.scene.objects if o.parent is None]
        elif gname == '*':
            objs = [o for g in groups.values() for o in g]
        else:
            # a group name takes its sub-groups with it: 'armR' is the arm AND the weapon in its
            # hand, unless an earlier turn in this frame has already hung the weapon on a joint
            objs = [o for g, parts in groups.items()
                    if g == gname or g.startswith(gname + '.') for o in parts]
        if objs:
            objs = _roots(objs)
            rot = [0.0, 0.0, 0.0]
            rot[axis] = angle
            joint(objs, at, tuple(rot))
    return lift
