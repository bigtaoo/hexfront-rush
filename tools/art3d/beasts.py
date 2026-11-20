"""The three big troops: ogre, colossus and drake.

They are not the chibi body in body.py — an ogre's shape IS the reason it reads as an ogre at
40 px — but they are tagged with the same joint groups (legL / legR / armL / armR / head, and the
drake's wingL / wingR), so pose.py walks and strikes them with the same machinery. Their joint
heights are in pose.JOINTS, since nothing here sits at the boy's hip and shoulder.

Same two laws as body.py: the ink dilates every shape by 6 sprite px, and nothing may approach
INK in value. A big figure is MORE at risk, not less: a heavy arm hanging beside a heavy body
fuses into one block unless it is swung clear.

And one rule of its own: a big troop still has to read as THIS side's piece, so the team colour
goes on the largest flat it owns — the ogre's sash, the ram's carriage, the drake's wings.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import body as B  # noqa: E402
from prim import ball, block, fan, group, lathe, rod  # noqa: E402


def _chain(p0, d, lengths, radii, mat, name):
    """Balls strung along a direction from a point: a knobbly club head, a tapering tail."""
    for t, r in zip(lengths, radii):
        ball(r, mat, (p0[0] + d[0] * t, p0[1] + d[1] * t, p0[2] + d[2] * t), name=name)


def model_ogre():
    """A fat green brute: pot belly, tusks, a studded club over the shoulder, a team sash."""
    # the stance went from 0.190 to 0.225 and the legs from 0.150 thick to 0.168. A heavy man
    # is not heavy because he moves slowly - six frames is six frames for all nine troops. He is
    # heavy because his feet are further apart than his hips, so every step has to throw the whole
    # body sideways over the standing foot. The weight is in the GAP, and the gap is model work;
    # no amount of pose tuning puts it there.
    for x in (-0.225, 0.225):             # short thick legs, far apart: the gap is the read
        with group('legL' if x < 0 else 'legR'):
            lathe([(0.168, 0), (0.170, 0.070), (0.158, 0.230), (0.146, 0.380), (0.0, 0.420)],
                  'ogre', loc=(x, 0, 0), name='leg')
            ball(0.126, 'ogre', (x, -0.090, 0.055), scale=(1.0, 1.5, 0.46), name='foot')
            for t in (-0.072, 0.0, 0.072):   # toes: a round foot reads as a stump
                ball(0.048, 'tusk', (x + t, -0.172, 0.038), scale=(1.0, 1.0, 0.7), name='toe')
    belly = [(0.236, 0.330), (0.300, 0.430), (0.318, 0.560), (0.296, 0.700), (0.214, 0.780),
             (0.0, 0.800)]
    lathe(belly, 'ogre', name='belly')
    # The hide kilt was 0.25 wide against a belly that is 0.30 at the same height, so every part
    # of it above the hem was INSIDE the body and never rendered: what reached the board was a
    # two-pixel rim. That is why the teams did not read. This one is cut wider than the belly all
    # the way up (0.33 against 0.30) and it is the TEAM colour, not leather - the one big flat of
    # red or blue on the unit, across the widest part of him, where it cannot be missed at 40 px.
    # The leather belt above it is there so the flat has an edge; team colour that fades into the
    # green at the top reads as a stain rather than as a uniform.
    lathe([(0.268, 0.344), (0.312, 0.396), (0.332, 0.448), (0.332, 0.504), (0.300, 0.548),
           (0.0, 0.556)], 'team', name='kilt')
    lathe([(0.312, 0.516), (0.342, 0.544), (0.330, 0.574), (0.0, 0.582)], 'leather', name='belt')
    for i in range(49):                     # the team sash, over one shoulder to the far hip:
        f = i / 48                          # the one big flat of colour this troop owns
        bx, bz = 0.165 - 0.300 * f, 0.760 - 0.200 * f   # shoulder to belt and no further:
        #                             below the belt the kilt is wider than the belly, and a sash
        #                             drawn on the belly down there is simply inside the kilt
        r = B.on_curve(belly, bz) + 0.004
        ball(0.076, 'team', (bx, -(max(r * r - bx * bx, 1e-4) ** 0.5), bz),
             scale=(1.0, 0.22, 0.74), name='sash')
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
            lathe([(0.104, 0.560), (0.112, 0.700), (0.100, 0.766), (0.0, 0.776)], 'ogre',
                  loc=(x, 0, 0), name='arm')
            # the arm bands are team too: two small marks right out on the silhouette's edge,
            # and the edge is the part of a 40 px sprite the eye actually lands on
            lathe([(0.116, 0.552), (0.122, 0.608)], 'team', loc=(x, 0, 0), name='band')
    with group('armL'):                     # the free arm hangs; it is the one that still walks
        rod(0.086, 0.230, 'ogre', (-0.320, -0.030, 0.430), name='forearm')
        ball(0.106, 'ogre', (-0.340, -0.040, 0.300), name='fist')
    # THE WHOLE UNIT HANGS OFF THESE TWO NUMBERS, so they are written once, above everything
    # that uses them, and the fist, the forearm and the timber are all derived from them. A club
    # that floats a hand's width off the fist, or a log whose middle is in mid-air, is what you
    # get when a hand and the thing it holds are authored separately; at 40 px that is not a man
    # carrying something, it is two objects that happen to overlap.
    #
    # SHOULDER is where the log BEARS: one log radius (0.105) above the arm lathe's own cap at
    # z 0.770, so the timber's underside lies on the top of the shoulder. DLOG is the line it
    # lies along. Every other point on this unit's right arm is a signed distance along DLOG from
    # SHOULDER, which is why no later edit can lift the log off him again.
    SHOULDER = (0.300, 0.060, 0.875)
    DLOG = (-0.1496, 0.6358, 0.7573)        # unit vector, up and back over the shoulder

    def along(t):
        return [SHOULDER[k] + DLOG[k] * t for k in range(3)]

    # The fist grips 0.40 BELOW the bearing point, which is the whole fix for "it does not look
    # like he is carrying it on his shoulder". The hand used to be down at hip height out in
    # front, and from there the log read as a bat held across the chest: a long diagonal with a
    # fist at the far bottom end and nothing touching it anywhere in between. A hand raised to
    # shoulder height, directly under the place the timber crosses him, is the one arrangement
    # that cannot be read any other way - it is how anyone carries a plank, and the elbow folded
    # up under it says "this is heavy" for free.
    HAND_LOG = along(-0.40)
    with group('armR'):
        B.line((0.300, -0.010, 0.566), HAND_LOG, 'ogre', 12, bead=0.088, name='forearm')
        ball(0.136, 'ogre', HAND_LOG, name='fist')   # bigger than the log is thick, or it vanishes
    with group('armR'), group('gear'):
        # A LOG, not a club. What was here first was a studded mace: a 0.09 thick dark stick
        # standing straight up beside him, touching neither his fist nor his shoulder, and on the
        # board it read as a toothbrush. It also made him a warrior, which he is not - nobody has
        # told him there is a war on. He is carrying a log because somebody handed him a log, and
        # a tree with the branches cut off is the one object that says that without a caption.
        # 0.21 thick on a 1.56 body, two and a half times the old haft: the red line on this unit
        # is that the timber is HEAVY, and at this size thickness is the only way to say heavy.
        #
        # THE THREE RULES THE LINE HAS TO OBEY, and they pull against each other:
        # 1. it must BEAR somewhere, and you must be able to SEE where. That is SHOULDER plus a
        #    fist 0.40 below it; between those two points the log is in contact with him for its
        #    whole middle third.
        # 2. it must clear his face. Earlier rounds crossed his eyes in four frames of six, and
        #    lowering the log never fixed it - this camera is 42 degrees up, so going AWAY from
        #    it is already going UP the picture, and a lowered log only lands on his chin. The
        #    fix is the bearing point itself: resting on the shoulder holds the whole line out at
        #    x 0.22-0.38, and the head is only 0.21 wide. It passes outboard of the skull.
        # 3. it must not cost width. The sprite's area is held fixed against the committed one
        #    (sprite.py old_area), so every pixel the log spends is a pixel taken off his body -
        #    a wide log makes a small ogre. A log slung STEEPLY spends its length on height,
        #    which is cheap here, instead of on width, which is not. Flat-and-long rendered at
        #    460 px wide and shrank him below the colossus; DLOG is 50 degrees for that reason.
        butt, tip = along(-0.55), along(0.56)   # 1.11 of timber, through the fist and out both ends
        B.line(butt, tip, 'wood', 30, bead=0.105, name='log')
        # a rag knotted round the upper end. Measured at board size he carried only 10.5% team
        # colour - the kilt and the sash are big flats, but they sit on a body that is bigger
        # still, and half of the kilt is behind the near thigh at this yaw. This band is out past
        # his head with nothing behind it but the tile, which is the cheapest colour on the whole
        # unit: no pixel of it is ever occluded, in any frame of any cycle. It is also the only
        # mark on him that somebody could have tied on this morning - he is not a soldier, and a
        # rag on the log says whose he is without promoting him.
        # kept SHORT and off the end: run up to the tip and the timber reads as painted
        # rather than bound, and a painted log is a prop issued by a quartermaster, which
        # is the one thing this unit is not. A hand's width, with bare wood above it.
        B.line(along(0.17), along(0.29), 'team', 7, bead=0.114, name='logband')
        # end grain on the TOP end, which is the end that clears his head and is therefore the
        # only end anyone sees. A plain brown cylinder has no end, so at 40 px it reads as a bar
        # of something; the pale disc is what makes it a sawn tree. It was on the butt for three
        # rounds, where his own hip covered it in all six frames.
        ball(0.086, 'tan', along(0.58), scale=(1.0, 1.0, 0.5), name='endgrain')
        # two lopped branch stubs, both on the upper half. They used to be spaced evenly along
        # the log, which put one of them inside his own shoulder; up here they are against open
        # sky. They cost four pixels each and they are the difference between a log and a
        # rolling pin.
        for t, side in ((0.250, 1), (0.450, -1)):
            b0 = along(t)
            ball(0.052, 'wood', (b0[0] + 0.140 * side, b0[1] + 0.070 * side, b0[2] + 0.060),
                 scale=(1.6, 1.0, 0.9), name='stub')
    return 1.56


def model_colossus():
    """A slung battering ram under an A-frame, behind an angled shield, on studded wheels: the
    one piece in this army that was never alive, and the only one whose job is written in its
    shape rather than in a document.

    It used to be a stone giant, and a stone giant had to be EXPLAINED - the design file carried
    a paragraph about woken rock to account for bldMult 2, the one stat no other troop has. An
    engine needs no paragraph. It is also the fix for a collision that could not be fixed any
    other way: the ogre and the colossus were both big, slow and heavy, which at 40 px is one
    troop rendered twice. They are not the same KIND of thing any more.

    WHY A RAM AND NOT A CATAPULT. A catapult is the better-looking machine and the wrong one:
    range is 1.1, which is punching distance (the bowman has 2.5, the adept 3.0), and rules.ts
    gives this unit no `ranged` field at all, so the engine will never spawn a projectile for
    it. A catapult here would wind up, swing, and throw nothing. bldMult 2 at range 1.1 says
    one thing only - it walks up to the wall and hits it.

    AND WHY IT IS NOT A SHED. The first two versions roofed the thing, because "a house walking
    towards you" is a good joke and a pitched roof is the biggest flat an object can carry. It
    is also the symbol for HOUSE, and the symbol won: it read as a dog kennel on wheels. So the
    roof is gone, and so is the sloped mantlet that replaced it. The mantlet was worse than the
    roof in the one way that matters: it floated. It had no visible support, it crossed the ram's
    head, and - fatally - it sat in the arc the beam has to swing through, so the attack could
    never be drawn without the weapon passing through its own armour.
    What carries the team colour now is the CARRIAGE ITSELF: the box is painted, the frame and
    the log above it are bare wood. That is the largest flat on the piece, it is the bottom half
    of the silhouette where the wheels frame it, nothing floats because the paint IS the
    structure, and the whole upper half is left empty for the beam to swing in. And once the
    roof came off, the beam could hang in the OPEN, on ropes, under crossed timbers. A nose on a
    box is a nose. A whole log swinging under an A-frame is a battering ram and nothing else.

    Nobody pushes it and nobody is inside. It rolls by itself, which is stranger than a crew and
    costs none of the pixels two carved crewmen would have eaten. The paint is not its own: a
    machine gets painted by whoever is borrowing it this war.

    Model space: +z up, the piece faces -y, so the ram points forward under the shield.
    """
    AXLE, R = 0.26, 0.30           # the two axles' |y|, and the wheel radius
    for wy, gname in ((-AXLE, 'wheelF'), (AXLE, 'wheelR')):
        with group(gname):         # one group per AXLE: both wheels on it turn about one line
            for wx in (-0.40, 0.40):
                sx = -1 if wx < 0 else 1
                rod(R, 0.11, 'brown', (wx, wy, R), rot=(0, math.radians(90), 0),
                    name='wheel', seg=28)
                # FIVE LUGS ON THE TREAD, and they are the whole reason this unit works. A wheel
                # is the only thing in this army allowed to move smoothly, and smooth is exactly
                # the danger - it reads as floating, which is the opposite of the heaviest and
                # most expensive piece on the board. Five lugs against a six frame loop land in
                # a different place every single frame, so the SILHOUETTE changes frame to frame.
                # At 20 px on the board the silhouette is all there is, and what it reads as is
                # a clunk.
                # There were spokes here too, in bead chains on the outer face, and they had to
                # go: spokes live INSIDE the outline, where at this size they only added pale
                # noise - the first render came back with four woollen pom-poms instead of four
                # wheels, and the rim itself was nowhere to be seen. A wheel needs exactly two
                # things to read: a dark disc, and notches on its edge.
                for k in range(5):
                    ang = 2 * math.pi * k / 5
                    ball(0.052, 'cream', (wx, wy + 0.300 * math.cos(ang), R + 0.300 * math.sin(ang)),
                         scale=(1.5, 1.0, 1.0), name='lug')
                ball(0.082, 'team', (wx + 0.058 * sx, wy, R), scale=(0.38, 1.0, 1.0), name='hub')
    # THE CARRIAGE IS THE TEAM COLOUR - the whole box, not a plate bolted to it. The ogre cost
    # four rebuilds to learn that a big flat has to sit on the SILHOUETTE's edge or the eye never
    # lands on it; this one is the entire lower half of the outline, held between four wheels
    # that frame it, with four team-coloured hubs repeating the colour at its corners. It is the
    # one placement that is also structural: nothing is floating, because the paint is the cart.
    block((0.70, 0.92, 0.40), 'team', (0, 0, 0.58), bevel=0.03, name='body')
    for by in (-0.30, 0.30):   # iron straps, so the painted flat is banded rather than blank
        block((0.74, 0.08, 0.44), 'leather', (0, by, 0.58), bevel=0.012, name='strap')
    # TWO STRINGERS, not a lid. A full wooden top was the obvious way to divide painted machine
    # from bare timber, and it was a disaster: 0.76 by 0.98 of brown board, seen from a camera
    # 42 degrees up, is a TABLE, and everything above it - the beam, the ropes, the head - read
    # as objects lying on a table. Two rails along the edges do the same dividing job and leave
    # the middle of the piece open, which is where the ram has to be visible. The thin deck
    # between them is flush and INSET, not a lid: it closes the trough (an open box reads as a
    # hole from 42 degrees up) without putting a brown plane out past the paint. It is PAINTED,
    # the same team colour as the sides: a dark wooden deck was tried and it brought the table
    # straight back - a big brown top plane is a table whatever its colour value. Painted, the
    # top is simply the top of the box, and the whole lower half of the piece is one solid flat.
    # THE LID IS A LOW DOME, not a flat plate, and that is a renderer fix as much as a design
    # one. sprite.py inks a pixel when something within its brush is nearer by more than
    # LINE['d'] = 0.012. A big flat lid lies at 48 degrees to the view axis, so its depth climbs
    # by sin(48) = 0.74 per unit, and over the brush that lands at 0.0121 - exactly on the
    # threshold. Half the pixels fired and half did not, so the lid came out veined with dark
    # cracks, in a pattern that changed every frame: a flat top FLICKERED through the walk. A
    # dome has no single gradient. Only a thin ring of it sits near the threshold, and there the
    # ink reads as the form shadow it should be. It also catches light the flat never did, which
    # is what finally separates the top of the box from its sides.
    ball(0.40, 'team', (0, 0, 0.60), scale=(0.82, 1.15, 0.62), name='deck')
    for sx in (-1, 1):
        rod(0.045, 0.98, 'wood', (sx * 0.355, 0, 0.80), rot=(math.radians(90), 0, 0),
            name='stringer')
        B.line((sx * 0.358, -0.40, 0.72), (sx * 0.358, 0.40, 0.72), 'gold', 11, bead=0.032,
               name='mark')   # a gold line under it, so the big painted flat has an edge
    # THE A-FRAME. Two crossed timbers over each axle, meeting in a ridge beam. Crossed diagonals
    # are a silhouette no other piece in this army owns - every troop is uprights and a head -
    # and they are the thing that says MACHINE before any detail is readable.
    APEX_Z, FOOT_X, FOOT_Z = 1.80, 0.34, 0.80
    leg = math.hypot(FOOT_X, APEX_Z - FOOT_Z)
    tilt = math.atan2(FOOT_X, APEX_Z - FOOT_Z)
    for gy in (-0.22, 0.22):
        for sx in (-1, 1):
            rod(0.050, leg, 'wood', (sx * FOOT_X / 2, gy, (FOOT_Z + APEX_Z) / 2),
                rot=(0, -sx * tilt, 0), name='post')
    rod(0.048, 0.62, 'leather', (0, 0, APEX_Z - 0.05), rot=(math.radians(90), 0, 0), name='ridge')
    # THE ROPES BELONG TO THE FRAME, not to the beam, and that is a deliberate lie. A real slung
    # ram SLIDES: both ropes stay parallel and the log shuttles level, which is a translation,
    # and pose.apply() only turns things. The trick is a pivot far below the ground (pose.
    # RAM_PIVOT), where a few degrees is near enough a straight slide - but a rotation about a
    # point that far away would also carry the rope tops sideways, off the ridge they hang from.
    # So the ropes stay put and the beam slides behind them. At 20 px nobody can measure the
    # difference, and what they see instead is the one thing that matters: the log moving
    # independently of the frame, which is the whole difference between slung and bolted.
    for ry in (-0.26, 0.20):
        B.line((0, ry, APEX_Z - 0.07), (0, ry, 1.30), 'leather', 8, bead=0.030, name='rope')
    with group('ram'):
        # THE LOG IS LONGER THAN THE CARRIAGE, and it has to be. At 1.24 it fitted neatly
        # inside the machine, which meant the mantlet covered all of it and the only part
        # anyone ever saw was the head - a nose on a cart. At 1.54 both ENDS stick out: the
        # head low and forward past the wheels, the butt high and back past the rear frame,
        # and the eye joins them into one beam running straight through the whole piece.
        # That diagonal is the read. Everything else here is uprights, wheels and a slope.
        # and it is hung BACK on its ropes, centred at y 0.12 rather than over the axles.
        # The camera maps forward to right AND DOWN, so every centimetre the head reaches
        # towards the enemy is a centimetre it sinks towards the carriage it has to clear.
        # Sliding the whole log 0.10 to the rear buys that clearance for nothing: the head
        # rises off the prow, and the butt that goes back instead sticks further out behind,
        # which is where the diagonal wanted to be longer anyway.
        rod(0.086, 1.54, 'wood', (0, 0.04, 1.22), rot=(math.radians(90), 0, 0), name='beam')
        rod(0.101, 0.08, 'leather', (0, 0.74, 1.22), rot=(math.radians(90), 0, 0),
            name='band')   # an iron band at the butt: a banded end is a log, a bare one a stick
        # A RAM'S HEAD, because that is what a battering ram is named after, and because this
        # army needed one joke that is not a face. It is also where "a carving does not have to
        # be a person" lands inside a machine: an animal's head on an engine.
        # It cannot be lifted clear of the far wheel - the camera maps forward to RIGHT AND DOWN,
        # so every centimetre it reaches towards the enemy is a centimetre it sinks towards the
        # wheels. It does not need to be: it is the nearest thing to the camera on the whole
        # piece, so it is drawn over them. What it needs is to not be THE SAME COLOUR as them,
        # which in the first version it was - head and tread lugs came back as one pale blur.
        ball(0.150, 'tan', (0, -0.78, 1.22), scale=(0.88, 1.15, 0.92), name='skull')
        ball(0.096, 'cream', (0, -0.92, 1.172), scale=(0.92, 1.0, 0.82), name='muzzle')
        ball(0.032, 'black', (0, -0.99, 1.158), scale=(1.3, 1.0, 0.8), name='nostril')
        for sh in (-1, 1):
            ball(0.036, 'black', (sh * 0.100, -0.852, 1.270), scale=(0.9, 1.0, 1.1), name='eye')
            for k in range(7):     # the curl: the one shape on this piece that is not a straight
                ang = math.radians(40 + 46 * k)   # line or a circle, and it is what says 'ram'
                rr = 0.122 - 0.009 * k
                ball(0.054 - 0.003 * k, 'tusk',
                     (sh * 0.134, -0.74 + rr * math.cos(ang), 1.30 + rr * math.sin(ang)),
                     name='horn')
    # NOTHING SITS IN FRONT OF THE HEAD. The attack IS the beam, and the beam does not swing:
    # it SLIDES, fore and aft along its own line, the way a log on ropes actually moves. The
    # travel is short and it is level, so the whole stroke happens in the strip of air directly
    # ahead of the head - which is exactly where a mantlet would have been. An armoured ram
    # really did carry one. This one cannot: the plate would be the thing the ram hits.
    return 1.90


def _bone(a, b, r0, r1, mat, name='bone', n=8):
    """One tapering bone from a to b: overlapping straight sections, no joint beads.

    A line of touching balls is what B.line draws, and down a wing's leading edge it came out a
    pearl necklace. Putting a ball over every cylinder joint instead came out a bamboo pole, which
    is the same mistake with fewer dots. Overlapping the cylinders - each one a little longer than
    its share - leaves a clean straight edge, and the small step in radius at a joint is under a
    pixel at board scale.
    """
    d = tuple(b[k] - a[k] for k in range(3))
    L = math.sqrt(sum(c * c for c in d))
    u = tuple(c / L for c in d)
    rx = math.asin(max(-1.0, min(1.0, -u[1])))     # aim the cylinder's own +z down d
    ry = math.atan2(u[0], u[2])
    for k in range(n):
        t0, t1 = k / n, (k + 1) / n
        r = r0 + (r1 - r0) * (t0 + t1) / 2
        mid = tuple(a[c] + d[c] * (t0 + t1) / 2 for c in range(3))
        rod(r, L / n * 1.35, mat, mid, rot=(rx, ry, 0), name=name, seg=14)


def _wing(s: int):
    """One wing of a flier: a team-coloured membrane on three horn fingers, held over the back.

    The team colour lives here because a drake has no tunic, and a wing is the biggest flat on
    the model - at 40 px it is the only thing that can say whose drake this is.

    The wing goes OUT and UP, with only the trailing edge swept back. Swept back as a whole it
    lay over the tail and the piece read as a paper dart: two sticks and a flag, no animal. The
    span has to cross the picture, because x is what the camera spreads and y is what it
    foreshortens, and the tail has to stay in the clear behind the body where it can be seen.

    The trailing corner comes all the way DOWN to the haunch. Cut short it left a wedge of
    daylight between the wing and the body, and a membrane that does not reach the animal reads
    as a kite being carried rather than a wing growing out of a back. The fingers are drawn in
    too: a membrane with nothing under it is a flag, and three bones across it are what make the
    blue read as skin.

    The membrane is BILLOWED rather than flat, and that is a renderer fix as much as a drawing
    one. sprite.py inks a pixel when something within its brush is nearer by more than LINE['d'],
    so one big flat panel - whose depth climbs at a single rate right across it - either inks
    nowhere or inks everywhere, and the colossus's lid proved it can land exactly on the line and
    crackle. Bellying the rim and the panel between the fingers gives every triangle its own
    tilt: no single gradient, and the ink that does land falls along the flutes.
    """
    hub = (s * 0.110, -0.040, 0.735)         # on top of the shoulder, just above the spine
    u = (s * 1.00, 0.00, 0.46)               # straight out and up: the span crosses the picture
    v = (s * 0.00, 0.60, -0.62)              # and only the trailing edge sweeps back and down
    nx = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
    m = math.sqrt(sum(c * c for c in nx))
    n = tuple(c / m for c in nx)

    def p(a, b, bulge=0.0):
        return tuple(hub[k] + u[k] * a + v[k] * b + n[k] * bulge for k in range(3))

    G = 0.045                                # how far the panels billow off the chord plane,
    E = 0.012                                # and how far the bones ride proud of it. Flush with
    # the chord the fingers sank UNDER the billowed panel and surfaced through it in nicks, which
    # at board scale is dirt on the wing rather than a bone in it.
    tip = p(0.76, 0.02, E)                   # the long leading finger, out past the head
    wrist = p(0.30, 0.015, E)                # the other two fingers branch off HERE, not at the
    f2 = p(0.60, 0.44, E)                    # root: three bones out of one point is an umbrella,
    f3 = p(0.36, 0.70, E)                    # and an umbrella is the one thing a wing must not be
    heel = p(0.03, 0.66)                     # and the trailing corner, just clear of the haunch
    rim = [p(0.76, 0.02),
           p(0.73, 0.16, G), p(0.67, 0.31, G), p(0.60, 0.44),   # first panel, tip to f2
           p(0.52, 0.56, G), p(0.44, 0.65, G), p(0.36, 0.70),   # second, f2 to f3
           p(0.25, 0.70, G), p(0.13, 0.69, G), heel]        # third, down towards the haunch
    with group('wingL' if s < 0 else 'wingR'):
        fan(hub, rim, 'team', thick=0.030, name='web')
        hb = tuple(hub[k] + n[k] * E for k in range(3))
        _bone(hb, tip, 0.032, 0.009, 'horn', name='spar')
        _bone(wrist, f2, 0.019, 0.008, 'horn', name='finger')
        _bone(wrist, f3, 0.018, 0.008, 'horn', name='finger')
        ball(0.028, 'horn', hb, scale=(1.0, 1.3, 1.0), name='knuckle')


# the fuselage, nose to tail tip, as one profile. Two things it has to get right that the first
# two tries did not: a drake built out of overlapping ellipsoids came out RINGED where they cut
# each other, and a chain of balls at a fixed spacing came out RIBBED down the flank and BEADED
# at the tail, where the balls had shrunk below the gap between them. So: one chain, on one
# smooth radius, stepped along at a spacing that shrinks with the radius it is drawing.
DR_Y0, DR_LEN = -0.370, 1.560
DR_SPINE = 0.620
DR_RMAX = 0.170                              # he was a tuna at 0.240 - a flier has to be lean


def _dr_r(f: float) -> float:
    if f < 0.22:                             # the chest swells fast, the tail tapers all the way
        return 0.100 + (DR_RMAX - 0.100) * math.sin(math.pi * 0.5 * (f / 0.22))
    g = (f - 0.22) / 0.78
    return (DR_RMAX - 0.012) * (1 - g) ** 1.15 + 0.012


def _dr_z(f: float) -> float:
    return DR_SPINE + 0.165 * max(0.0, (f - 0.42) / 0.58) ** 2


def model_drake():
    """A young dragon IN THE AIR: body along the line of flight, feet tucked, wings over the back.

    He used to be built standing up - two flat feet on the board, a neck going straight up out of
    the shoulders, wings hanging off the sides. At board scale that is not a dragon, it is a small
    orange bear in a cape, and everything else wrong with him followed from it: the wings read as
    a cloak because they hung beside a vertical body, and the breath attack read as a bow because
    a vertical body that throws its head forward is bowing. Nothing about the attack needed
    fixing; the pose did.

    So the whole model is laid down along y, which is the direction he travels. The claws are the
    lowest thing in the silhouette and they hang clear under the belly - a flier is read by what
    is NOT touching the ground - and the wing roots sit above the spine rather than out at the
    shoulders, so the beat happens over the back where it can be seen.
    """
    f = 0.0                                  # nose to tail tip in one unbroken run, stepping by
    while f < 1.0:                           # a fraction of the radius so the chain never beads
        r = _dr_r(f)
        ball(r, 'scale', (0.0, DR_Y0 + DR_LEN * f, _dr_z(f)), name='body')
        f += max(0.0018, 0.10 * r / DR_LEN)
    for k in range(13):                      # the pale belly, flush along the underside and
        g = 0.045 + 0.40 * (k / 12)          # standing a hair proud of it so it is not fighting
        rb = 0.74 * _dr_r(g)                 # the body for the same pixels
        ball(rb, 'belly', (0.0, DR_Y0 + DR_LEN * g, _dr_z(g) - _dr_r(g) + rb - 0.010),
             name='belly')
    for k in range(7):                       # the crest: a sawtooth down the TAIL, behind the
        g = 0.56 + 0.052 * k                 # wings where it is in the clear. Low and pale on the
        h = 0.052 * (1 - 0.55 * k / 6)       # back it was a row of fish scales lying on him
        ball(h, 'horn', (0.0, DR_Y0 + DR_LEN * g, _dr_z(g) + _dr_r(g) * 0.55 + h * 0.55),
             scale=(0.28, 0.75, 1.9), name='fin')
    for x in (-0.115, 0.115):                # the legs are not legs any more, they are landing
        with group('legL' if x < 0 else 'legR'):      # gear: folded up under the body, trailing
            ball(0.082, 'scale', (x, 0.140, 0.505), scale=(1.0, 1.45, 1.00), name='thigh')
            ball(0.050, 'scale', (x, 0.285, 0.408), scale=(1.0, 1.45, 0.85), name='shin')
            ball(0.056, 'scale', (x, 0.378, 0.336), scale=(1.0, 1.05, 0.72), name='foot')
            for t in (-0.046, 0.0, 0.046):   # and the claws hang below everything else: at 40 px
                ball(0.030, 'horn', (x + t, 0.414, 0.272),   # that gap under the belly is the
                     scale=(1.0, 1.45, 0.72), name='claw')   # only proof he is off the ground
    with group('head'):                      # the neck reaches FORWARD, with a slight rise, so
        for k in range(5):                   # the head leads the body instead of sitting on it
            g = k / 4
            ball(0.098 - 0.016 * g, 'scale', (0, -0.345 - 0.245 * g, 0.618 + 0.062 * g),
                 name='neck')
        # the collar is a disc across the neck now, not a ring turned about z: a lathe ring on a
        # horizontal neck came out as a halo lying flat
        ball(0.108, 'gold', (0, -0.395, 0.628), scale=(1.0, 0.24, 1.0), name='collar')
        ball(0.118, 'scale', (0, -0.640, 0.686), scale=(1.0, 1.20, 0.88), name='skull')
        ball(0.082, 'scale', (0, -0.805, 0.660), scale=(0.88, 1.45, 0.64), name='snout')
        ball(0.062, 'belly', (0, -0.805, 0.620), scale=(0.90, 1.40, 0.42), name='chin')
        for x in (-0.044, 0.044):            # two little fangs out of the top jaw
            ball(0.018, 'tusk', (x, -0.905, 0.612), scale=(0.8, 0.8, 1.4), name='fang')
        for x in (-0.026, 0.026):
            ball(0.012, 'black', (x, -0.936, 0.672), name='nostril')
        for x in (-0.086, 0.086):
            ball(0.046, 'white', (x, -0.678, 0.732), scale=(1.0, 0.52, 0.92), name='eye')
            ball(0.029, 'black', (x, -0.698, 0.732), scale=(1.0, 0.5, 1.0), name='pupil')
            ball(0.010, 'white', (x - 0.009, -0.712, 0.744), name='spark')
            # horns: two turned cones swept back off the skull, long enough to read at 40 px
            lathe([(0.030, 0.0), (0.024, 0.055), (0.0, 0.150)], 'horn',
                  loc=(x * 0.90, -0.578, 0.742), seg=16, name='horn')
    _wing(-1)
    _wing(1)
    return 1.56


MODELS = {'ogre': model_ogre, 'colossus': model_colossus, 'drake': model_drake}
YAW = {'ogre': 30, 'colossus': 28, 'drake': 36}
