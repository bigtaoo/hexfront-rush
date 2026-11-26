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
IDLE = 2                         # and the two it breathes through while it stands

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
#
# EVERY MELEE ATTACK NOW TURNS IN TWO PLACES, the shoulder and the fist, and the reason is a
# fact about the models rather than about animation. A weapon is carved rigid with the arm
# holding it; the sword points UP out of the fist and the arm points DOWN out of the shoulder,
# so the two are very nearly ONE straight line through the hand. A line can only be swung to
# point downwards by swinging its far end upwards - and that is exactly what the renders
# showed. At 140 degrees of shoulder the shield's blade did come down, straight through the
# top of his own helmet, with only the last hand's width of tip outside his head; the ogre's
# log did the same through his belly. The thrust failed one storey up for the same reason:
# the militia's shoulder socket, at these toy proportions, sits INSIDE the outline of his own
# skull (the socket is screen right 0.121, the skull is 0.18 wide), so a haft pivoted there
# and levelled - the one angle at which this projection does not foreshorten it to a stub -
# swept straight across his eyes. Shoulder-only, the fork tip's height is
# 0.5783 + 0.1613 cos(t) - 0.0903 sin(t): it can NEVER fall below 0.393, mid-chest, at any
# angle whatever. There was no number to find.
#
# A wrist costs nothing here. pose.apply turns any group about any point, prim.group already
# files every weapon under 'armR.gear', and _roots re-parents the wrist's own empty when the
# shoulder turns after it - so the two compose, and the angle the weapon lands at is simply
# ARM + WRIST. The arm ramps are therefore small, a haul back and a shove forward; the swing
# itself has moved into the wrist, which is where it is on a person.
#
# (The sign, since it cost two render passes: an x turn sends y' = y cos - z sin. For a point
# ABOVE the pivot a positive angle swings it forward; for a HANGING ARM, which is a point
# below it, a positive angle swings the hand BACKWARD and up. Every ramp here hangs.)
THRUST = _ramp((4, 14, -22, -8))         # militia: the hand hauls back, then shoves forward
SWING_ARM = _ramp((-8, 16, -24, -8))     # shield, ogre: the same, with more haul behind it
# What the weapon does about the fist. Quoted as the TOTAL the frame lands on (arm + wrist),
# because that is what the picture is made of:
#   militia  -4, -6, 90, 54    at 90 the fork is dead level at BELLY height - screen (0.100,
#     0.319) to (0.627, 0.172), 0.55 of a body long, pointing where he points, and passing a
#     clear fifth of a body below the chin the old thrust ran through.
#   shield   -2, -12, 120, 62  at 120 the blade is down-right at 39 degrees and almost its
#     whole length on screen (0.949), tip at z 0.07 - a chop that stops at the grass. 144 was
#     tried first and put the tip through the floor: this sword is gripped low (z 0.236) and
#     is 0.47 long, so past about 125 there is no more room under him.
#   ogre      2, -18, 140, 70  the log runs screen (0.381, 0.705) to (0.848, 0.219), head
#     height down to the waist, 0.67 long and ENTIRELY outboard of a body that ends at 0.27 -
#     which is the whole point, since every earlier smash went through his own belly.
# The negative holds are the wind-up: the weapon tips further back while the arm hauls it
# back, so the first two frames differ in shape and not only in degree.
# The slinger is in this table for a different reason and turns about a different axis.
# His sling was NOT fighting the camera - it was fighting the pivot. The pouch sits at
# (0.515, -0.052, 0.500) and the shoulder joint is the x axis through z 0.548, so in the plane
# the shoulder turns in the pouch is 0.07 from the centre of rotation: the whole four-frame
# attack moved it 0.06 of a body, less than its own width, and what the board saw was a man
# holding a sling perfectly still. The sling has an 0.40 arm and ALL of it lies along +x, which
# an x turn cannot touch. So HIS wrist turns about y, the one axis that swings that arm, and
# his shoulder does the throw proper. It cannot do the WIND-UP: this toy's arms hang at the very
# edge of its own torso (shoulder x 0.146 against a torso half 0.175), so any backward swing puts
# the fist behind the chest in depth and all that reaches the render is a sliver of knuckle - 2
# and 14 degrees is as far back as the hand stays visible, and the wind-up is the wrist's job.
# Forward is free: at -45 the fist comes out to depth -0.20 against the torso's -0.015, a hand's
# width clear in front of him, and the whole arm is drawn. The four pouch positions, on screen:
#   (0.468, 0.532), (0.281, 0.626), (0.656, 0.348), (0.505, 0.506)
# out in front, hauled back and up past the ear, whipped down and forward, then settling.
#   35, 78, -8, 28 degrees above the fist   the pouch rides up beside the cap and whips down
#     and forward: screen (0.353, 0.628), (0.267, 0.646), (0.580, 0.286), (0.489, 0.500) - a
#     travel of 0.89 of a body across the cycle where there was 0.06. 78 is the
#     ceiling: at 93 the pouch crosses in front of his own face. The far end stops at -8 because
#     at -20 it is through the grass, and nothing in a cycle may go below z 0 (the canvas is
#     anchored at its bottom edge, so gear under the boots lifts the boots off the hex).
#   The release frames are the ones where troops.py has already straightened the cord and taken
#   the stone off it (pose.nocked), so the arm reaching its farthest forward, the cord going
#   straight and the stone leaving all happen on the SAME frame. That is what makes it read as
#   a throw instead of a wave.
WRIST = {'militia': _ramp((-8, -20, 112, 62)),
         'shield': _ramp((6, -28, 144, 70)),
         'ogre': _ramp((10, -34, 164, 78)),
         'slinger': _ramp((4, -39, 47, 11)),
         'adept': _ramp((-17, 12, 84, 51))}  # MORE than all of CAST, read the note on it
WRIST_AXIS = {'slinger': 'y'}
# where each fist closes, in model space: the point the weapon turns about. Measured off the
# models, not guessed - militia and shield are body.arm's x + out at body.FIST, and the ogre's
# is beasts.model_ogre's HAND_LOG, the point its forearm and its timber are both built from.
# A wrist placed anywhere else slides the weapon out of the hand that is holding it.
WRIST_AT = {'militia': (0.212, -0.046, 0.252),
            'shield': (0.214, -0.098, 0.236),
            'ogre': (0.3598, -0.1943, 0.5721),
            'slinger': (0.204, -0.052, 0.252),
            'adept': (0.320, -0.115, 0.252)}     # his fist, which is also where he grips
# the guard's crossbow. Everyone else's attack is a limb travelling somewhere; his is a limb
# NOT travelling, and then a kick. He braces, holds dead still for a beat - that stillness is
# the whole character, the parade soldier who turns out to be the one man here who can aim -
# and on release the butt drives the muzzle up. 14 degrees is more than a real crossbow kicks,
# and it has to be: at 40 px the recoil is the only frame that says a bolt left, and the sim
# draws the bolt itself (PROJ.bolt), so the sprite's job is just to be caught in the act.
AIM = _ramp((-5, -9, 14, 5))
# the bowman's string arm BARELY turns now. It used to swing 48 degrees about the shoulder,
# and the swing was the whole draw - which is why the draw never read. armL turns about x, so
# that 48 degrees carries the hand through y and z; by the camera's own right = 0.829 dx -
# 0.559 dy a hand pushed to -y travels RIGHT on screen, towards the bow. The draw was a shove.
# The string is now BUILT drawn instead (troops.model_bowman reads act()), the hand slides back
# along -x with it, and all this ramp has left to do is lift the elbow and drop it again.
DRAW = _ramp((-10, -16, 8, 2))           # bowman: the string hand pulls back and lets go
BOW = _ramp((-2, -8, -2, 0))             # ...while the bow hand barely moves
SLING = _ramp((2, 14, -45, -14))         # slinger: the whirl is in his WRIST now, above
# POSITIVE, and all the way out. Both earlier numbers swung the staff the other way, and that
# way is BEHIND HIM: at -55 the lit stone grazes the hat brim, at -65 it is gone behind the cone
# altogether, so the flare peaked on the one frame where nothing of it could be seen. Swung
# forward the staff comes down level and points where the spell is going, the crystal leads it
# out into clear sky past the shoulder, and the stone is never within a hat's width of anything.
# The wind-back is small (-14) because his silhouette is already a tall cone with a stick beside
# it - the read is the stick LEAVING that silhouette, and anything spent rocking backwards first
# is spent on a frame nobody can tell from the still.
# THE SHOULDER GOES THE OTHER WAY FROM THE STAFF, and that sign is the whole repair. Seventy-
# two degrees of pure shoulder put the hand at y +0.246 - 0.09 BEHIND the back of a robe 0.158
# wide - and the elbow at +0.098, also behind, so on the drive frame the entire limb went in
# behind the body. It is team blue on a team blue torso, so there was not even an edge to see
# it by: the board got a staff growing out of the middle of his chest. Splitting the same 72 in
# half between shoulder and fist did NOT fix it, and the reason is worth keeping. A positive
# shoulder turn swings a hanging arm BACKWARD, i.e. away from the camera, so the arm projects
# down the depth axis and foreshortens: at 36 the elbow and the fist landed 0.015 apart on
# screen - the forearm had no length left to see.
# So the shoulder now turns NEGATIVE, a small -12, which swings the arm FORWARD and throws it
# across the screen: shoulder 0.121, elbow 0.297, fist 0.363, against a torso edge of 0.124 -
# three separate points in open air and a forearm with real length between them. The fist is
# then 84 degrees of wrist, more than the whole of the old swing, because it has to undo the
# shoulder's -12 as well as carry the 72. The staff still comes down level and still points
# where the spell is going; it also now points at the CAMERA as well as to the right, which is
# what makes it sweep instead of merely tilt. The cost is width - the crystal reaches screen
# 0.70 where it used to reach 0.47, and sprite.sym pays for that on both sides of every one of
# his frames. It is paid knowingly: an arm nobody can see is not a cheaper animation, it is a
# broken one.
CAST = _ramp((3, -2, -12, -7))           # adept: the SHOULDER, counter to the staff above
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
        # the draw was (2, -4, 2, 0) - four degrees of total body motion across a whole attack.
        # It was written when the arm carried the draw, and the arm no longer does (DRAW above
        # is down to a shrug, because an armL turn about x pushed the hand towards the bow, not
        # away from it). With the string carrying the pull, the BODY is what is left to carry
        # the effort: chest out and shoulders back over the two drawn frames, then thrown
        # forward on the loose and settling. Same shape as the cast, for the same reason -
        # a shot you do not lean into does not look like it cost anything.
        'draw': _ramp((-4, -11, 7, 2)), 'sling': _ramp((6, -7, 12, 4)),
        'cast': _ramp((-4, -11, 8, 3)), 'breathe': _ramp((-3, -6, 5, 2)),
        'aim': _ramp((1, -2, 5, 2))}     # braced: he leans into it, he does not swing with it

# the colossus is absent on purpose: it has no armR for a style to drive, and strike() takes
# it before the lookup.
STYLE = {'militia': 'thrust', 'guard': 'aim', 'shield': 'swing', 'ogre': 'swing',
         'bowman': 'draw', 'slinger': 'sling', 'adept': 'cast',
         'drake': 'breathe'}

# ------------------------------------------------- the frame the model is being BUILT for
# A carved part cannot bend, so a bowstring cannot be posed: a string that comes back to a man's
# jaw is a different SHAPE, not a turned one, and everything in this file turns. So the two
# shooters build themselves for one frame at a time. toys.assemble sets FRAME immediately before
# it calls the model function, the model reads it through act() below, and lays its string, its
# limbs and its missile out for that frame. Nothing else in the file knows FRAME exists, and a
# model that never calls act() is built exactly as it always was.
#
# This is the "more bones" the pre-rendered pipeline can afford: a sprite sheet does not care how
# the geometry got there, so a part may be rebuilt per frame as cheaply as it is turned.
FRAME = (None, 0)

# how far through its own action each of the four strike frames is (wind up, hold, loose,
# recover), and what the piece carries when it is not attacking at all:
#   bowman   0 at rest - a walking archer's bow is slack - up to a full draw, then PAST the brace
#            line on the loose, which is the frame that says the arrow left rather than vanished
#   guard    the crossbow is carried with the string forward (the triangle of daylight between
#            prod and string is how it is read at 40 px, and it has to survive the other 21
#            frames), spanned to the nut for the aim, and snapped flat again on the shot
#   slinger  1 at rest: the stone lives in the pouch, and the attack is the only time it leaves
#   adept    the crystal lights on frame 2, with the hit - not on 1 with the wind-up. His crystal
#            is the moment of the spell the way a spear tip is the moment of a thrust, and
#            THRUST, SWING and SLING all land theirs on 2 as well.
# the bowman's -0.05 on the recover is not a draw, it is a PLACE: troops.model_bowman puts
# the string hand on the string whenever act() is not ~0, and at a flat 0 the hand jumped from
# the bowstring to the hip for one frame, leaving a pale blob at his waist in the middle of a
# shot. Just past the brace line it stays an arm that has let go, where the eye last saw it.
ACT = {'bowman': (0.75, 1.0, -0.16, -0.05), 'guard': (1.0, 1.0, 0.0, 0.0),
       'slinger': (1.0, 1.0, 0.0, 0.0), 'adept': (0.20, 0.55, 1.0, 0.45)}
ACT_REST = {'slinger': 1.0}
LOOSE = {'bowman', 'guard', 'slinger'}   # the three with a missile that can be out of the frame


def act(name: str) -> float:
    """How far through its attack the frame being built is: 1 at the top, 0 at rest."""
    kind, i = FRAME
    if kind != 'a':
        return ACT_REST.get(name, 0.0)
    return ACT.get(name, (0.0,) * STRIKE)[i]


def nocked(name: str) -> bool:
    """Whether the missile is still on the string: it is gone from the frame it is loosed on.

    The sim draws the projectile itself (PROJ.arrow, PROJ.bolt, PROJ.stone), so a sprite still
    holding one after the loose puts two of them on the board."""
    kind, i = FRAME
    return not (kind == 'a' and i >= 2 and name in LOOSE)

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
    # ...and it turns about the BELLY, not about the ground. A tip about the sole swings the whole
    # figure one way: every part at height z moves z*sin(roll), so at the ogre's 16 degrees his
    # head went a third of a tile sideways and the piece visibly walked off the hex it is standing
    # on, while the coordinate underneath it went straight. About the belly the top goes one way
    # and the feet the other - the ANGLE, which is the whole of what reads as a rock at 40 px, is
    # untouched, and the piece as a whole stays over its own coordinate.
    turns.append(('^', (foot, 0.0, (hip + sh) / 2), roll + math.radians(q('tilt', 0.0)), 'y'))
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
    if name in WRIST:
        # THE WRIST GOES FIRST. pose.apply hangs this group on an empty at the fist; the
        # shoulder turn that follows collects that empty through _roots and carries hand and
        # weapon together, so the weapon ends up at arm + wrist and never leaves the fist.
        t = ('armR.gear', WRIST_AT[name], WRIST[name][i])
        turns.append(t + (WRIST_AXIS[name],) if name in WRIST_AXIS else t)
    if style == 'thrust':
        turns.append(('armR', sh, THRUST[i]))
    elif style == 'swing':
        turns.append(('armR', sh, SWING_ARM[i]))
    elif style == 'draw':
        turns += [('armL', sh, DRAW[i]), ('armR', sh, BOW[i])]
    elif style == 'sling':
        turns.append(('armR', sh, SLING[i]))
    elif style == 'cast':
        turns.append(('armR', sh, CAST[i]))
    elif style == 'aim':
        # BOTH arms, on the same curve. The crossbow hangs off armR, and the left hand is out
        # on its fore-end; let armR move alone and the stock walks out of the hand holding it.
        turns += [('armR', sh, AIM[i]), ('armL', sh, AIM[i])]
    elif style == 'breathe':
        # no arms to swing: the head is the weapon, and the wings flare with the breath
        turns += [('head', sh, BREATH[i]),
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


# ------------------------------------------------------------- standing still (the 'i' cycle)
# How far a waiting piece tips, and how far its arms hang behind the tip. A third of the walk's,
# and over the same foot by the same argument: the rock's comment above measures that a tip to the
# side lands 85% of itself on this camera while a move fore and aft lands 15%, so if a standing
# figure is to move at all at 40 px, it moves SIDEWAYS. A third is the number because the still is
# the middle of the breath: the board plays still, i0, still, i1 (unitView.ts idleTag), so what
# the eye sees between two drawn poses is two thirds of a walk's tip, in four beats over two
# seconds instead of six frames over one. At a half it read as a man losing his balance.
IDLE_ROLL = ROCK_ROLL / 3
IDLE_ARM = ROCK_ARM / 3


def breathe(i: int, name: str):
    """One frame of standing still: the weight settles over one foot, then over the other.

    A troop waiting for the wave used to BE the still frame, with a sway of under a degree laid
    over it in the view. At board size that is not a sway, it is a shelf of ornaments - the one
    complaint this cycle exists to answer. Two frames are enough because the still is the pose
    between them: the board returns to it every other beat, so the piece is never caught halfway
    between two drawn views, and the whole cycle costs 36 frames of atlas rather than 108.

    Nothing new is invented here. It is walk_rock's own tip, a third of the size, about the same
    belly pivot over the same loaded sole, with the head keeping its ROCK_HEAD of upright against
    it and the arms hanging a beat behind. What it must NOT carry is any of SIG's constant
    attitude (lean, gaze, peer, tilt): those live in the walk, the still has none of them, and a
    standing piece that picked them up would snap into a new posture the moment it stopped.

    The drake has no feet to stand on. His wait is the slow half of his own beat instead - wings
    high, wings low - which is the only thing he ever does.
    """
    if name == 'drake':
        f = 1.0 if i == 0 else -1.0
        _, sh = _joints('drake')
        return [('wingL', WING, -HOVER * 0.55 * f, 'y'), ('wingR', WING, HOVER * 0.55 * f, 'y'),
                ('head', sh, math.radians(4) * -f),
                ('^', (0.0, 0.0, sh), math.radians(3) * f)], HOVER_BOB * (0.5 - 0.35 * f)

    def q(key, default=1.0):
        return _sig(name, key, default)

    f = 1.0 if i == 0 else -1.0
    hip, sh = _joints(name)
    k = GAIT.get(name, 1.0)
    roll = IDLE_ROLL * k * q('roll') * f
    arm = IDLE_ARM * k * q('arm')
    # the arms lag the tip by half a beat, which at two frames is the other frame: they hang the
    # way the weight has just come FROM. Without it both arms swing with the body and the piece
    # reads as one carved block rocking, which is what the still already was.
    turns = [('armL', sh, arm * f * q('armL')), ('armR', sh, -arm * f * 0.6 * q('armR')),
             ('head', sh, -q('head', ROCK_HEAD) * roll, 'y')]
    if name == 'colossus':
        # a cart does not shift its weight: it settles in its ruts. The wheels stand still (a
        # wheel that turned while the machine waited would be the one thing on the board that
        # says it is moving when it is not) and only the chassis and the slung ram breathe.
        turns += [('ram', (0.0, 0.0, RAM_PIVOT), math.radians(0.8) * f),
                  ('^', 0.0, math.radians(1.2) * f)]
    foot = ROCK_FOOT * (hip / HIP) * (1 if roll >= 0 else -1)
    turns.append(('^', (foot, 0.0, (hip + sh) / 2), roll, 'y'))
    return turns, 0.0


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

# The cycles seen from BEHIND (D132). Every troop is drawn once, three-quarter from the front, and
# the board mirrors it for left and right - so a piece marching UP the board, away from the camera,
# used to be drawn walking towards us. Yaw 0 is dead front and a troop's own yaw turns it towards
# one side; 180 - yaw keeps that same sideways component and flips only the depth, so the back
# view mirrors for left and right exactly as the front one does.
BACK = {'u', 'b'}


def stand(i: int, name: str):
    """The still pose as a one-frame cycle: the back view of a piece that is not walking."""
    return [], 0.0

# The ROCKING walk is the one the game ships. The scissor above is kept because its comment is
# the argument for the rock - a stride at this camera travels 85% into the screen and only 53%
# across it, so a scissor has to open to 45 degrees to be seen at all and then reads as a pair of
# scissors rather than a walk, while a side-to-side tip lands 85% on screen. HF_WALK=scissor puts
# the old one back for a side-by-side.
CYCLES = {'w': (walk_rock, WALK), 'a': (strike, STRIKE), 't': (swivel, TURN),
          'd': (fall, FALL), 'i': (breathe, IDLE),
          'u': (walk_rock, WALK), 'b': (stand, 1)}
if os.environ.get('HF_WALK') == 'scissor':
    CYCLES['w'] = (walk, WALK)


def yaw_deg(kind, i: int, base: float) -> float:
    """How far frame i of a cycle is turned about the vertical, in degrees.

    The still's own yaw is the baseline. Only the turn shortens it (TURN_YAW), and only the back
    cycles reflect it, which is what turns the piece away from the camera.
    """
    if kind in BACK:
        return 180.0 - base
    return base * (TURN_YAW[i] if kind == 't' else 1.0)


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
