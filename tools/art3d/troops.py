"""The troop models: built from the same turned-wood primitives as the buildings in toys.py.

The foot troops are all the same carved body (body.py) in different gear, so the row reads as one
set. Kept apart from toys.py so neither file has to hold the whole cast; toys.py imports this late
(the primitives have to exist first) and merges MODELS and YAW.

Most of a model is fixed geometry, but the four pieces that shoot are not: they read pose.act() and
BUILD their string, their cord and their missile for the one frame being rendered. A carved part
turns about a joint and nothing in pose.py bends, so a drawn bowstring can only be a different
shape - see the comment over pose.FRAME.

Silhouette first: at 40 px a figure reads by its outline, so every weapon leans away from the head
(sprite.py's ink bridges any gap under ~12 px and fuses the two into one slab), the legs keep a
gap the ink can show through, and detail that would not survive the downscale is left out.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import beasts  # noqa: E402
import body as B  # noqa: E402
import pose  # noqa: E402
from prim import ball, block, group, lathe, rod  # noqa: E402


def model_militia():
    """A farm boy called up: an undyed smock with a team sash, work trousers, boots, a pitchfork.

    He is the only one of the nine who was never issued anything, so he is the only one who does
    not wear the team colour as clothing - the sash is what somebody tied on him this morning so
    the other side would know whose he was. It also solves a legibility problem: militia, slinger
    and bowman are one body at three sizes, and at 40 px a team tunic made all three the same man.
    The smock is the lightest thing any troop wears, which is now how you pick him out of the row.
    """
    B.legs()
    B.torso(mat='cream', belt='team')
    B.strap(mat='team', w=0.058, back=True)   # wide enough to read as a sash, not as a seam,
    #                                         # and carried round the back so it still reads there
    B.face()
    B.arm(-0.146, sleeve='cream')
    # THROUGH AN ELBOW, or the thrust has no arm in it. Built as body.arm's default single rod
    # this limb lies along the fork's own shaft, and at the peak of the new thrust it turns to
    # point very nearly at the camera: the whole arm foreshortens to a disc behind the haft and
    # the pitchfork comes out of his chest with nothing holding it. Hung on an elbow at x 0.232 -
    # outside the torso's 0.175, and 0.13 in front of it - the forearm crosses the shaft on
    # screen instead of hiding along it, and the two stay a skin-and-dark-wood pair the whole way
    # through the swing. fr trims it to 0.032 so it is a boy's arm beside the haft, not a thigh.
    B.arm(0.146, sleeve='cream', out=0.066, hy=-0.046, thumb=True,
          hz=B.FIST, fr=0.032, elb=(0.232, -0.130, 0.390))
    with group('armL'):
        # the third patch of team colour, on the near sleeve: a sash alone came out at 4.3% of
        # his board-size pixels against a cast median of 16%, and a clump of militia read as one
        # beige crowd whoever owned it. A band tied round the arm is the same story as the sash -
        # something somebody knotted on him this morning - so it buys the legibility without
        # issuing him a uniform, which is the whole of what he is not.
        lathe([(0.062, 0.428), (0.064, 0.452), (0.063, 0.488)], 'team',
              loc=(-0.146, 0, 0), name='armband')
    with group('armR'), group('gear'):  # the pitchfork goes with the hand, leaning back
        tilt = math.radians(14)           # away from the head: the ink would bridge a small gap
        rod(0.019, 0.700, 'darkwood', (0.245, -0.046, 0.390), rot=(0, tilt, 0), name='shaft')
        block((0.098, 0.022, 0.024), 'silver', (0.330, -0.046, 0.731), rot=(0, tilt, 0),
              bevel=0.004, name='crossbar')
        for dx in (-0.040, 0.0, 0.040):   # three thick tines: four hairline ones go to a smear
            rod(0.016, 0.112, 'silver', (0.344 + dx, -0.046, 0.787), rot=(0, tilt, 0), name='tine')
            ball(0.017, 'silver', (0.347 + dx, -0.046, 0.842), name='tip')
    return 1.18


def model_slinger():
    """The scout: a dark jerkin and a team cap, bare arms, a pouch of stones, a sling.

    He is read against the militia, who stands next to him in the same body: that one is pale and
    covered to the wrist, this one is dark and bare-armed, and the team colour sits on his CAP
    rather than his chest. A cape is no place for it - the cape hangs at +y, away from the camera,
    and barely shows at the 32 degree yaw; the cap is the top of the silhouette with nothing in
    front of it, which is the one patch of a 40 px piece that is always legible.
    """
    B.legs(cloth='tan')
    # dark jerkin between light trousers and bare arms: three bands of value down the figure,
    # where brown over tan was one brown mass at 40 px. A dark torso is safe where a dark BOOT
    # is not - it is ringed by skin and cloth, so it reads as a shape, not as a hole in the ink
    B.torso(mat='leather', belt='team', buckle='gold')
    B.face()
    with group('head'):                   # a soft cap down to the brow. A full hood put
        lathe([(0.178, 0.790), (0.188, 0.824), (0.168, 0.866), (0.090, 0.894), (0.0, 0.900)],
              'team', name='cap')         # the whole face in shadow under the 42 deg camera
        lathe([(0.192, 0.782), (0.194, 0.812)], 'leather', name='capband')
    B.cloak('leather', drop=0.10)
    B.arm(-0.146, sleeve='skin')
    B.arm(0.146, sleeve='skin', out=0.058, hy=-0.052, thumb=True)
    with group('armR'), group('gear'):
        # The sling is the only thing that tells him apart at 40 px, and it has to be read in one
        # glance against a 40 px piece. Two straight cords side by side merge into a shaft and he
        # reads as carrying a mace; gear hung at the hip is read against the legs and loses
        # outright. So it is ONE cord, curved, swung up past the shoulder into the empty space
        # beside the cap: a thin line bending away from the fist with a lump on the end, which is
        # a sling and cannot be anything else. The curve is the whole signal - it says the thing
        # is travelling. Nothing here goes below z=0: a cycle shares one canvas anchored at its
        # BOTTOM edge, so gear under the boots would stand on the hex and lift the boots off it.
        # AND ON THE RELEASE THE CORD SNAPS STRAIGHT AND THE STONE IS GONE. The curve is what
        # says the sling is travelling; the one moment it is not bent is the moment it lets go,
        # so the shape change itself is the shot. The grey dot leaving the pouch is three pixels
        # the eye cannot miss, and the sim draws the stone in flight from there (PROJ.stone).
        pouch = (0.515, -0.052, 0.500)
        ball(0.082, 'leather', pouch, scale=(1.0, 0.8, 0.72), name='pouch')
        if pose.nocked('slinger'):
            B.arc((0.260, 0.500), 0.255, math.radians(-103), 0.0, 'leather', 13,
                  bead=0.013, y=-0.052, name='cord')
            ball(0.050, 'grey', (pouch[0], pouch[1] - 0.046, pouch[2]), name='stone')
        else:
            B.line((0.2026, -0.052, 0.2515), pouch, 'leather', 13, bead=0.013, name='cord')
    ball(0.062, 'tan', (-0.150, 0.058, 0.250), scale=(1.0, 0.72, 0.9), name='bag')
    lathe([(0.064, 0.292), (0.058, 0.312)], 'leather', loc=(-0.150, 0.058, 0), name='bagtie')
    return 1.18


def model_shield():
    """The line holder: a helmet with a team crest, a round shield on the left, a short sword."""
    B.legs(cloth='leather', boot='boot')
    B.torso(mat='team', belt='leather')
    B.face(hair=None, brow=False)
    B.helmet('silver', crest='team')
    B.cloak('team', drop=0.06)
    B.arm(-0.152, out=-0.046, hy=-0.060, thumb=True)
    B.arm(0.146, out=0.098, hy=-0.098, thumb=True)   # the sword hand, out where it can be seen
    with group('armL'), group('gear'):
        # THE RED LINE: the shield is the biggest block in the silhouette. It was a 0.19 disc at
        # hip height - smaller than his own helmet, half of it behind his ribs - and what you read
        # on the board was a man with a satchel. 100 of his 186 hit points are this plank; it has
        # to be the thing you see. It is now 0.60 across on a 1.22 body: chin to knee, and wider
        # than his shoulders. He is a door with legs, which is the whole unit.
        # SZ is low on purpose: carried at chest height this thing covered his face for four
        # frames of six, and a troop with no face is not a troop. It hangs chin-to-shin instead,
        # which is also where a man who is hiding behind a door actually holds it.
        # SX pushes it clear to his off side rather than across his chest: dropped straight down
        # it buried both boots and the walk went with them - he slid. A hand's width of boot
        # under the rim is the whole of his gait, so the rim is not allowed to have it.
        R, SX, SY, SZ = 0.292, -0.300, -0.162, 0.392
        # tilted 14 degrees back about z, which cancels half of the model's 30 degree YAW: a disc
        # square to the body turns a third edge-on to the camera and loses a third of its width.
        # The face plane is then spanned by u (below) and plain world z, and every painted thing
        # on it is placed from those two - that is why the bars and studs carry the same rot.
        face = math.radians(-14)
        u = (math.cos(face), math.sin(face), 0.0)
        def on_face(du, dz, dy=0.0):      # a point on the shield's face, du across and dz up
            return (SX + u[0] * du + dy * math.sin(face), SY + u[1] * du - dy * math.cos(face),
                    SZ + dz)
        # a dark ring sitting a hair proud of the boards: the planks are mid-brown and so are his
        # boots and his belt, so against a desert tile (#e6d1a4) the disc had no edge of its own
        # except the ink. The rim gives it one that survives when the ink is doing other work.
        lathe([(R + 0.030, 0.0), (R + 0.026, 0.030), (0.0, 0.034)], 'leather',
              loc=on_face(0, 0, 0.010), name='rim').rotation_euler = (math.radians(90), 0, face)
        lathe([(R, 0.0), (R - 0.006, 0.026), (R - 0.070, 0.050), (0.0, 0.058)], 'wood',
              loc=on_face(0, 0), name='shield').rotation_euler = (math.radians(90), 0, face)
        # a team-coloured cross painted across the boards. The disc is the largest flat area on
        # any of the nine troops, and a flat area that large reads as a dinner plate unless it
        # carries a device; a cross is the one device that survives 40 px, because it runs edge
        # to edge and needs no detail to be read. It is also where his team colour now lives:
        # the shield covers his shirt, so the shirt alone can no longer say whose man he is.
        # the bars were 0.082 on a 0.584 disc and he still measured only 10.9% team colour at
        # board size: the shield covers his shirt, so a thin cross is nearly all the colour he
        # has. 0.118 keeps the four quarters of bare board showing - a cross that eats its own
        # field stops being a device and becomes a painted disc - while carrying half again as
        # many pixels on the largest flat any of the nine troops owns.
        for sz in ((2 * R - 0.040, 0.030, 0.118), (0.118, 0.030, 2 * R - 0.040)):
            block(sz, 'team', on_face(0, 0, 0.062), rot=(0, 0, face), bevel=0.006, name='cross')
        ball(0.082, 'silver', on_face(0, 0, 0.082), scale=(1.0, 0.55, 1.0), name='boss')
        for a in range(8):                # studs round the rim, on the face's own axes
            t = 2 * math.pi * a / 8
            ball(0.022, 'silver', on_face(0.252 * math.cos(t), 0.252 * math.sin(t), 0.072),
                 name='stud')
    with group('armR'), group('gear'):  # the sword held back and low: raised, it fuses with
        tilt = math.radians(20)           # the helmet under the ink
        # SW SCALES EVERY LENGTH IN THE SWORD, and nothing else on the model. At 0.050 the blade
        # was 1.8 device pixels wide beside a shield 22 pixels across - he was the one troop of
        # the nine whose own weapon could not be found in his own silhouette, and he is the one
        # who most needs it, because the shield already says 'defend' on its own. The scaling is
        # about the GRIP, so the fist keeps the hilt wherever the blade goes; and the whole piece
        # comes 0.048 towards the camera with that fist, because at yaw 30 a sword held on the
        # body's own centre line is a sword behind the body, and a wider one is merely more of it
        # hidden. Not RAISED, though: lifted to the shoulder it fuses with the helmet under the
        # ink, which is why it was put down here in the first place.
        SW = 1.30
        gx, gy, gz = 0.214, -0.098, 0.236

        def at(dx, dz):                   # a point on the sword, measured from the grip
            return (gx + dx * SW, gy, gz + dz * SW)

        rod(0.022 * SW, 0.090 * SW, 'darkwood', at(0, 0), rot=(0, tilt, 0), name='grip')
        block((0.082 * SW, 0.026 * SW, 0.024 * SW), 'gold', at(0.022, 0.060), rot=(0, tilt, 0),
              bevel=0.005 * SW, name='guard')
        block((0.050 * SW, 0.020 * SW, 0.300 * SW), 'silver', at(0.072, 0.216), rot=(0, tilt, 0),
              bevel=0.006 * SW, name='blade')
        ball(0.028 * SW, 'silver', at(0.130, 0.364), scale=(1.0, 0.6, 1.4), name='point')
        ball(0.026 * SW, 'gold', at(-0.016, -0.040), name='pommel')
    return 1.22


# where the bow hand's fist ends up (body.arm: x + out). The stave's belly sits on it, so the two
# are written from one number - moved apart by hand once, the bow floated off the fist.
FIST_X = 0.406


def model_bowman():
    """The archer: a soft cap with a feather, a bow held out, a quiver over the shoulder."""
    B.legs(cloth='leather')
    B.torso(mat='team', belt='leather')
    B.face()
    with group('head'):                   # a soft cap pulled over the mop, feather at the side
        lathe([(0.176, 0.792), (0.186, 0.826), (0.166, 0.868), (0.090, 0.896), (0.0, 0.902)],
              'boot', name='cap')      # drab: the slinger now owns the bright cap, and these two
        lathe([(0.190, 0.784), (0.192, 0.814)], 'leather', name='capband')   # share a body.
        # boot over a leather band, not the other way round: a leather cap sat at the same value as
        # the hair under it and the head came out one brown lump. The band has to be the dark one
        # The feather carries the team colour, and it is the one patch of him that is ALWAYS
        # legible: top of the silhouette, nothing in front of it, nothing behind it. White lost it
        # on snow tiles (#d5d9d3) and went grey on desert (#e6d1a4); in team colour it holds on all
        # five grounds. It also matters when troops crowd a tile and all that clears the stack is a
        # head: shirt, base disc and feather are then three separate carriers of whose man this is.
        B.line((0.160, 0.020, 0.826), (0.286, 0.136, 1.030), 'team', 11, bead=0.026,
               scale=(1.0, 0.5, 1.0), name='feather')   # a straight quill off the band: an arc
    B.cloak('team', drop=0.08)
    k = pose.act('bowman')        # 0 slack, 1 at a full draw, negative past the brace line
    d = max(0.0, k)
    # BOWZ is the belly of the bow, and now also BOTH FISTS. It was not: the hands hung at
    # body.FIST (z 0.252, the waist) while the bow sat at 0.390, so what the render showed was a
    # bow floating beside a man with his arms at his sides, and the drawn string - the whole of
    # this attack - ended in mid-air a hand's width from the hand pulling it. body.arm's `hz`
    # fixes that: given a fist height it builds the forearm as a rod from the elbow TO the fist,
    # wherever the fist is. The bow goes up to the chest with them, because a bow gripped at the
    # waist is a bow nobody is aiming.
    BOWZ, DRAWX, DRAWZ = 0.470, 0.226, 0.085
    BOW_R, BOW_Y = 0.430, -0.070          # the stave's radius and the plane the whole bow lies in
    BOW_SPAN = math.radians(54.5)
    BOW_CX = FIST_X - BOW_R               # so the belly of the stave lands exactly on the fist
    BEND = 0.080                          # how far the tips come back under the draw
    # THE STRING HAND IS PUT ON THE NOCKING POINT BY SOLVING FOR IT, not by a second ramp that
    # happens to land near it. The nock, the apex of the string, the arrow's tail and the fist
    # are one point; computed once here, it cannot drift apart frame by frame, and it is right
    # for the LOOSE frame too (k < 0), where the hand carries on past the brace line instead of
    # dropping to the hip - a hand that teleports to the waist on the release frame reads as the
    # arm being cut off, not as a shot.
    NOCK0X = BOW_CX + BOW_R * math.cos(BOW_SPAN)      # the lower nock, before the limbs bend
    APEX = (NOCK0X - (BEND + DRAWX) * k, BOW_Y, BOWZ + DRAWZ * k)
    # ... AND BOTH SLEEVES GO ALL THE WAY TO THE FISTS, in team colour. These two arms are the
    # longest on any troop - one reaches 0.26 out to the bow, the other 0.23 back across the
    # chest - and at body.arm's bare-skin default that is two pale logs the width of a thigh
    # lying across the one place the eye has to read a thin tan stave against a cream string.
    # The guard hit exactly this and solved it the same way (fore='team', fr=0.030, elb): a
    # narrow blue limb crossing the bow separates from it by hue, by value and by width.
    B.arm(0.146, out=0.260, hy=BOW_Y, hz=BOWZ, thumb=True,
          fore='team', fr=0.030, elb=(0.268, -0.128, 0.436))    # the bow hand, ON the belly
    if abs(k) > 0.01:
        # `elb` carries the limb round the OUTSIDE of the coat - a rod drawn straight from a
        # shoulder at x -0.150 to a fist on the centreline spends its middle inside the torso and
        # comes out of the render as a shoulder, a gap and a floating hand (see body.arm).
        B.arm(-0.150, out=APEX[0] + 0.150, hy=BOW_Y, hz=APEX[2], thumb=True,
              fore='team', fr=0.030, elb=(-0.252, -0.136, 0.442 + 0.088 * d))
    else:
        # off the string it just hangs - and it hangs OUTSIDE him, built the same way as the
        # drawing arm above. A bare B.arm here puts a shoulder at x -0.150 and a fist near the
        # centre line, so the upper arm spends its whole length buried in the blue coat and all
        # that reaches the render is a pale knuckle floating in front of his left hip: in the
        # bare still and the recover frame that lump was the first thing the eye found, and at
        # the peak of the draw the torso swallowed it whole and the arm simply vanished. The
        # fist goes out to x -0.215, clear of a torso half 0.175 wide, and the elbow carries
        # the limb round the outside; fore='team' and fr=0.030 make it the same narrow blue
        # line as the drawing arm, so the two states read as one arm doing two things.
        B.arm(-0.150, out=-0.065, hy=-0.026, hz=B.FIST, thumb=True,
              fore='team', fr=0.030, elb=(-0.238, -0.088, 0.418))
    with group('armR'), group('gear'):
        # A bow is read as ONE TALL D: a long bent line, a straight line beside it, and a gap of
        # daylight between them. The first pass had a short deep arc (128 degrees of a small circle)
        # with the string pulled to a draw point, so stave and string closed a near-circle with a
        # bar across it - a round shield with a grip, which is exactly what it looked like on the
        # board. So: the span is wide and shallow, the bow is 0.70 tall on a 1.20 body, and the
        # string runs NOCK TO NOCK. He is walking; a walking archer's bow is not drawn, and the
        # drawing reads off his arms in the strike frames instead of being baked into the stave.
        r, y, cz = BOW_R, BOW_Y, BOWZ
        span = BOW_SPAN                   # tips at z 0.12 and 0.82 about a belly raised to the
        cx = BOW_CX                       # chest. Clear of the boots below (gear under the feet
        #                                 # moves the ground anchor), and clear of the cap above:
        #                                 # the top nock stands at x 0.226 against a cap whose
        #                                 # widest radius is 0.186, and it is 0.07 in front of it
        # pale wood, not darkwood: at #4a3020 the stave sat a shade off INK (#2b1d14) and its own
        # outline ate it, so the bow came out as a bent dark smear with no inside. A bow is read
        # by the gap between stave and string - that gap has to be lighter than the ink around it.
        #
        # AND IT IS BUILT FOR THE FRAME, not posed into it. pose.py turns carved parts about
        # joints, and a drawn string is not a turned one, so the stave, the string and the arrow
        # are laid out afresh at whatever draw pose.act() says this frame is at. That is the only
        # way the attack can read at all: the arm swing is four pixels and the string is the
        # whole gesture.

        def stave_pt(a):
            """A point on the stave at angle a, with the limbs bent back under the draw.

            t SQUARED: a bow bends at its ends and not at its belly, which is also the hand. A
            limb that came back evenly along its whole length would close the D into a hoop,
            and the hoop is the round-shield read this model spent three passes escaping."""
            t = a / span
            return (cx + r * math.cos(a) - BEND * k * t * t, y, cz + r * math.sin(a))

        for bi in range(34):
            ball(0.032, 'tan', stave_pt(-span + 2 * span * bi / 33),
                 scale=(1.0, 0.9, 1.0), name='stave')                    # stave
        nocks = [stave_pt(-span), stave_pt(span)]
        for n in nocks:
            ball(0.026, 'leather', n, name='nock')
        # the string runs in TWO halves through a nocking point, so a draw is a V and a rest is
        # the old straight line - at k=0 the apex lands exactly on it, bead for bead.
        apex = APEX                   # the same point the string hand was placed on, above
        # WHITE, and thinner than the stave. Carried, a cream line beside a tan arc was enough
        # to read. Drawn, the string's upper half has to run from the top nock down to an anchor
        # beside his jaw, which means it crosses his own face, and no anchor avoids that - the
        # nock is high and right, the hand is low and left, and the head is in between. So the
        # string stops competing on shape and wins on value: white against the tan stave, white
        # against skin, and 0.015 against the stave's 0.032. That is the same hue-value-width
        # separation the arms already use to cross the bow without melting into it.
        B.line(nocks[0], apex, 'white', 16, bead=0.015, name='string')
        B.line(apex, nocks[1], 'white', 16, bead=0.015, name='string')
        # recurved tips. Stave plus string is still a CLOSED outline, and a closed outline that is
        # only three times taller than it is wide is a leaf, or - as it turned out on the board - a
        # round shield with a grip across it. These two hooks kick out past the string and leave the
        # silhouette open at both ends, which is the one shape nothing but a bow makes.
        for n, dz in ((nocks[0], -0.040), (nocks[1], 0.040)):
            B.line(n, (n[0] + 0.090, y, n[2] + dz), 'tan', 9, bead=0.028, name='horn')
        if pose.nocked('bowman'):
            # the arrow slides back with the string, but only half as far: pulled the whole draw
            # its head passes the belly of the bow and it reads as a stick poked through a hoop.
            # It is GONE from the loose frame on - the sim draws the arrow in flight (PROJ.arrow),
            # and a sprite still holding one puts two arrows on the board.
            # THE SHAFT IS DRAWN FROM THE STRING, not laid across the bow at a fixed length. A
            # 0.640 rod centred on the grip ran 0.11 out BEHIND the string, so its nock end hung
            # in the air past the bow and the arrow grew no longer however hard he pulled. Tail
            # on the nocking point, head 0.09 back from where it rests, and the shaft runs 0.30
            # long at the brace to 0.44 at full draw: the lengthening is the draw, at 40 px.
            head = 0.530 - 0.090 * d
            rod(0.013, head - apex[0], 'tan', ((apex[0] + head) / 2, y, apex[2]),
                rot=(0, math.radians(90), 0),   # the head sticks out PAST the stave: a line
                name='arrow')                   # crossing and leaving the D stops it closing
            ball(0.026, 'white', apex, scale=(1.0, 1.0, 0.4), name='fletch')   # into a disc
    # NO QUIVER. He had one on his back and it was tried in three places: on the bow side it hid
    # behind the torso for four frames of six and swung out from under the shoulder in the other
    # two, which reads as a glitch; moved across, and again raised and narrowed, it came out as a
    # brown rectangle at the shoulder with its fletches occluded by the head - a satchel. A quiver
    # is read as a tube AND three white points clearing the shoulder, and there is nowhere on a
    # 40 px figure already carrying a bow this size to put both. He keeps the bow, the arrow on the
    # string and the feather in his cap, which is three archer cues, and loses the slab.
    return 1.20


def model_adept():
    """The hired man: a tall starred hat, a knee-length robe, an upright staff with a lit
    crystal. Not an apprentice and not an old man - the files used to say both, and the hobble
    that came with "old" read on the board as a troop that had been hit, not as a troop with
    a character. He is the one of the nine who is at work rather than at war."""
    B.legs(cloth='cloth', boot='leather')
    B.torso(mat='team', belt='gold', buckle='gold')
    lathe([(0.146, 0.516), (0.158, 0.430), (0.170, 0.300), (0.162, 0.236), (0.0, 0.228)],
          'team', name='robe')            # a skirt to the knee: a full robe would hide the walk
    B.face()
    B.pointy_hat('team', 'gold')
    for i in range(7):                    # stars on the hat and the robe: the one painted detail
        a = 2 * math.pi * i / 7           # that survives 40 px, because it is gold on team blue
        ball(0.026, 'gold', (0.150 * math.cos(a), -0.104 + 0.040 * abs(math.sin(a)),
                             0.900 + 0.150 * math.sin(a) * 0.5), scale=(1.0, 0.4, 1.0), name='star')
    for x, z in ((-0.100, 0.330), (0.064, 0.396), (0.020, 0.268)):
        ball(0.030, 'gold', (x, B.on_skin(B.TUNIC, x, max(z, 0.270), 0.004), z),
             scale=(1.0, 0.4, 1.0), name='star')
    B.arm(-0.146)
    # he carries it at arm's length, not tucked against the ribs. A staff held in close reads
    # as a stick he happens to be holding; held out, the gap between the rod and the body is
    # what tells you it is a straight vertical line, and the straight line is the whole point.
    # ONE JOINTED BLUE ARM, not a bare rod with a bead chain patching the gap above it. The old
    # pair put a pale tan cylinder right beside a bare wooden staff - two sticks of one value, one
    # of which is supposed to be a limb - and the beads above it, being skin too, made a third.
    # Built through an elbow at x 0.238 (outside the robe's 0.158) and 0.035 IN FRONT of the
    # staff's own plane, the forearm crosses the staff on screen instead of lying along it, and
    # being team blue it stays a different colour from the wood through all four swing frames.
    B.arm(0.146, out=0.174, hy=-0.115, hz=B.FIST, thumb=True,
          fore='team', fr=0.030, elb=(0.238, -0.150, 0.396))
    with group('armR'), group('gear'):
        # THE STAFF IS VERTICAL AND STAYS VERTICAL. This is his red line, the same kind of rule
        # as the bowman's "the bow is held level": a plumb-straight rod beside a hat that is
        # taller than he is gives him TWO PARALLEL UPRIGHTS, and no other troop of the nine has
        # that silhouette. It used to lean 16 degrees so the crystal would clear the brim, and a
        # leaning rod reads as a walking stick - which is what the old "he hobbles along on it"
        # walk was built on. The crystal clears the brim by going HIGHER instead, which costs
        # height (cheap) rather than the rule.
        # it reaches BELOW the sole (-0.010): a staff that stops at the ankle is a staff being
        # held up in the air, and this one is meant to look like it could be leaned on at any
        # moment - he just is not leaning on it.
        rod(0.026, 0.900, 'wood', (0.320, -0.115, 0.440), name='staff')
        #     not 'darkwood': at 0.05 thick a #4a3020 rod fuses with the #2b1d14 outline and
        #     stops being an object at all. Same grain as the ogre's log, which reads at 40 px.
        lathe([(0.056, 0.0), (0.046, 0.032), (0.0, 0.044)], 'gold', loc=(0.320, -0.115, 0.868),
              seg=6, name='claw')
        # THE CRYSTAL LIGHTS WHEN HE CASTS. His is the one attack of the nine with nothing to
        # throw and nothing to swing - CAST lifts the staff and holds it up - so all the board
        # ever saw was four frames of a raised stick. Half again on the stone, a bigger glint and
        # a ring of sparks cost no frames and almost no canvas (the crystal is already the top of
        # the silhouette, with nothing in front of it), and they are the only cue that says the
        # spell went off rather than that he is pointing at something.
        f = pose.act('adept')
        tip = (0.320, -0.115, 0.950)
        ball(0.066 * (1.0 + 0.52 * f), 'yellow', tip, scale=(0.9, 0.9, 1.15), name='crystal')
        ball(0.024 * (1.0 + 0.90 * f), 'white', (0.296, -0.145, 0.976), name='glint')
        if f > 0.30:
            for si in range(6):
                a = 2 * math.pi * si / 6 + 0.4
                ball(0.018 * f, 'yellow', (tip[0] + 0.105 * f * math.cos(a), tip[1] - 0.034,
                                           tip[2] + 0.105 * f * math.sin(a)), name='spark')
    return 1.32


def model_guard():
    """The castle guard as a nutcracker WITH A CROSSBOW: shako, white beard, team coat, and a
    prod carried CANTED - stock up across the chest, bolt head level with the shako band.

    He used to carry a halberd, and the halberd was a lie. src/sim/guard.ts has fired a bolt at
    2.4 tiles since the day it was written - `fire(..., 'bolt', PROJ.bolt, ...)`, 14 a shot every
    0.7 s, with regen and a twelve second respawn - so this man is the player's opening defence
    and he is a SHOOTER. A polearm is the one mistake a 40 px sprite cannot survive, because at
    that size the weapon IS the unit: everything the player knows about what a piece does, it
    reads off the thing in its hands.

    The crossbow also settles a problem the halberd never could. Eight of the nine pieces here
    are a vertical figure holding a vertical stick, and the halberd's head was a grey dot three
    pixels wide on top of one more stick. A prod is a WIDE HORIZONTAL BAR across the chest -
    0.52 of span on a 0.34 body - and nothing else on this board is shaped like that.

    What the bar alone does not give is a CROSS, and that is what the cant at TILT buys. The
    prod lies along world x and lands at screen 11.8 degrees whatever is done to the rest of
    the weapon; the stock is the only part that can move against it. Carried level the two sat
    38 degrees apart and the whole thing read as a rifle, a single pale stick with a dark block
    behind it, in every frame where the string is flat - the still, all six walk frames, and
    the two release frames. Canted to 66 the gap is 54 degrees, which is a cross, and the
    triangle of empty air between stock, limb and string goes from 0.07 of a body to 0.20 -
    forty pixels of daylight at this figure's height, where fifteen were being eaten whole by
    the outlines. The full derivation, and why widening the prod would not have helped, is in
    the comment on the tips below.

    The trousers were white and they disappeared on snow (#d5d9d3), taking the legs with them,
    which is fatal for a unit whose whole joke is what its legs are doing. Stone fixed the snow
    and started a worse fire: pale trousers under a pale crossbow put four light values in one
    corner of the sprite and the whole lower half went to mush. So the legs are DARK and the
    weapon is the one bright thing on him - which is the right way round, because the weapon is
    the silhouette red line. The boots stay a shade lighter than the trousers for the reason
    UNITS.md gives: a boot at the value of its own outline reads as a hole, not a foot.
    """
    B.legs(cloth='leather', boot='boot', hip=0.300)
    lathe([(0.150, 0.270), (0.168, 0.336), (0.176, 0.442), (0.168, 0.520), (0.120, 0.560),
           (0.0, 0.572)], 'team', name='coat')
    lathe([(0.172, 0.300), (0.178, 0.344)], 'black', name='belt')
    block((0.046, 0.020, 0.044), 'gold', (0, -0.176, 0.322), bevel=0.005, name='buckle')
    for z in (0.400, 0.456, 0.512):
        ball(0.016, 'gold', (0, -0.172, z), name='button')
    B.face(hair=None, brow=False)
    with group('head'):
        lathe([(0.0, 0.610), (0.150, 0.656), (0.154, 0.714), (0.0, 0.756)], 'white',
              loc=(0, -0.030, 0), name='beard', scale=(1, 0.85, 1))
        for x in (-0.056, 0.056):
            ball(0.046, 'white', (x, -0.136, 0.676), scale=(1.3, 0.7, 0.6), name='tache')
        lathe([(0.168, 0.806), (0.168, 0.840), (0.156, 0.852), (0.162, 1.040), (0.0, 1.040)],
              'black', name='shako')
        lathe([(0.164, 0.838), (0.164, 0.872)], 'gold', name='shakoband')
        block((0.096, 0.024, 0.100), 'gold', (0, -0.160, 0.944), bevel=0.012, name='plate')
        lathe([(0.0, 1.030), (0.046, 1.062), (0.040, 1.160), (0.0, 1.206)], 'team',
              loc=(0.058, 0.020, 0), name='plume')
    # THE CROSSBOW IS CARRIED AT THE CHEST, IN TWO HANDS THAT ARE REALLY ON IT.
    #
    # Six passes. The last three were all about things you can only decide by PROJECTING, so the
    # numbers below are worked out, not eyeballed. At yaw 34 and elevation 18 a model direction
    # (dx, dy, dz) lands on screen at
    #     right = 0.829 dx - 0.559 dy        up = 0.173 dx + 0.256 dy + 0.951 dz
    # and the camera's depth runs 0.532 dx + 0.788 dy - 0.309 dz, smaller being nearer.
    #
    # 1. HEIGHT. At the hanging fist height (0.252) the weapon sat across his waist, in the band
    #    where belt, buttons and thighs already fight, and it read as luggage. body.arm takes hz
    #    now, so the fists come UP to the chest and the forearms are rebuilt to aim at them.
    # 2. TILT. The prod runs along x, which lands at 12 degrees above horizontal. A stock laid
    #    along -y with a -14 degree tilt lands at -1 degree - within twelve degrees of the prod,
    #    which is to say ON it, and that is why it read as a plank however it was coloured. The
    #    stock is tilted DOWN at the nose (+13) and also SWUNG across (0.30 of x per unit of y),
    #    which puts it near -60 degrees: seventy off the prod, and now it is a cross.
    # 3. THE ARMS. Chest-high meant both arms reaching, and bare chibi forearms at 0.042 across
    #    came out as two pale logs lying exactly along the weapon - the crossbow vanished inside
    #    his own arms. They are SLEEVED in team blue and thinned, so what crosses the chest is
    #    dark and the pale things on screen are the weapon and the hands only.
    X0, Y0, Z0 = 0.200, -0.060, 0.310            # the trigger grip: where the right fist closes.
    #                                            # Bringing the whole weapon onto the middle of
    #                                            # the chest was tried, to shorten the left arm's
    #                                            # reach, and it was a worse picture: centred, the
    #                                            # stock lies across the buttons and the thing
    #                                            # flattens into one long plank. It belongs off to
    #                                            # his right, where the trigger fist also clears
    #                                            # the 0.175 coat by itself.
    SWING, TILT = 0.18, math.radians(-52.0)      # across, and the NOSE UP. A man on watch carries
    #                                            # a crossbow muzzle-high so he can shoot without
    #                                            # first lifting it; the earlier pass had it the
    #                                            # other way round, pointing at his own boots.
    #                                            # The angle the eye reads is the SCREEN one:
    #                                            # up = -0.173 SWING - 0.256 - 0.951 tan TILT over
    #                                            # right = 0.559 - 0.829 SWING. The camera looks
    #                                            # DOWN at 18 degrees, so the whole scale is pushed
    #                                            # under the horizon: the nose only starts to rise
    #                                            # on screen past TILT -17, whatever it does in the
    #                                            # world. It is also, against intuition, the LONGER
    #                                            # picture - tilting up turns the stock towards the
    #                                            # camera and shortens it, but past about -30 the
    #                                            # height it gains on screen wins that back, and
    #                                            # the gap to the prod opens with it. That took it
    #                                            # to -39, and -39 WAS STILL A BAR. The prod lies
    #                                            # along x and lands at 12 degrees whatever else
    #                                            # is done to it; -39 puts the stock at 50, and 38
    #                                            # degrees between the two is not a cross, it is a
    #                                            # rifle. Every frame where the string is flat -
    #                                            # the still, the walk, and the two release frames
    #                                            # - came out as one long pale stick with a dark
    #                                            # block at the back of it. -52 puts the stock at
    #                                            # 66: 54 degrees off the prod, which is a cross,
    #                                            # and 0.43 of screen length against 0.34, so the
    #                                            # steeper carry is also the bigger picture. It
    #                                            # stops at -52 because the bolt head climbs the
    #                                            # frame with the nose - screen up 0.77 here,
    #                                            # beside the shako band - and by -60 it is level
    #                                            # with the plume.
    W = 1.36                                     # EVERY LENGTH IN THE WEAPON, SCALED UP, and
    #                                            # nothing else on the model touched. At its old
    #                                            # size the prod spanned 0.37 of screen width
    #                                            # against a 0.35 body: the one shape on this
    #                                            # piece that was meant to be louder than the man
    #                                            # was exactly as wide as he is, and it read as a
    #                                            # toy he had been handed. At 1.36 the prod spans
    #                                            # 0.51 - half as wide again as the body - the
    #                                            # butt still clears the beard (screen up 0.29,
    #                                            # the beard starts at 0.55), and the bolt head
    #                                            # sits out at screen right 0.42, so no part of
    #                                            # the weapon crosses the face. THE GRIP IS NOT
    #                                            # SCALED: X0/Y0/Z0 is where his fist closes, and
    #                                            # both arms are placed from on(0) and on(GRIP_L),
    #                                            # so a longer fore-end carries the leading hand
    #                                            # out along it by itself.
    _v = (-SWING, -1.0, -math.tan(TILT))
    _m = math.sqrt(sum(c * c for c in _v))
    V = tuple(c / _m for c in _v)                # unit vector from the butt towards the nose
    GRIP_L = 0.175 * W                           # the fore-end hand, this far along from the
    HAND_Y = -0.022                              # trigger, and both fists sit this much in FRONT
    #                                            # of the wood: by the depth formula above that
    #                                            # brings a fist just proud of the stock so it
    #                                            # OVERLAPS it. Level with it, the ball swallows
    #                                            # the stock and the stock swallows the ball, and
    #                                            # nobody is holding anything.

    def on(sv, dz=0.0):                          # a point sv along the stock, dz above it
        return (X0 + V[0] * sv, Y0 + V[1] * sv, Z0 + V[2] * sv + dz)

    def aim(u):                                  # euler that takes a block's long (+y) axis to u
        return (math.asin(max(-1.0, min(1.0, u[2]))), 0.0, math.atan2(-u[0], u[1]))

    gl, gr = on(GRIP_L), on(0.0)
    # Both arms go through an ELBOW at |x| 0.205, outside the coat's 0.175, so no part of a limb
    # is buried in the torso. The HEIGHT of each elbow is chosen against the stock, and that rule
    # flipped when the nose went up: what matters is that forearm and weapon CROSS on screen, and
    # a forearm lying along the stock is the pale-log failure again in team colour. With the stock
    # now climbing at +50, the leading elbow has to come up with it, to 0.450 - left at the waist
    # that forearm ran at +35 and all but doubled the stock up. The trigger elbow stays down at
    # the hip, where its short forearm turns up to the trigger at +121 and cuts the stock square.
    B.arm(-0.150, sleeve='team', out=gl[0] + 0.150, hy=gl[1] + HAND_Y, hz=gl[2],
          thumb=True, fore='team', fr=0.030, elb=(-0.205, -0.130, 0.380))
    B.arm(0.150, sleeve='team', out=gr[0] - 0.150, hy=gr[1] + HAND_Y, hz=gr[2],
          thumb=True, fore='team', fr=0.030, elb=(0.205, -0.130, 0.330))
    with group('armR'), group('gear'):
        # Everything here is a SOLID ROD or a block. An earlier pass drew the limbs, the string
        # and the bolt as body.line bead chains, and three dotted lines running parallel through
        # one small shape came out as a lattice - at board scale it read as a net, not a weapon.
        # Beads are for a stave that curves (the bowman's) or a cord that hangs; a crossbow is
        # all straight lines, and straight lines want cylinders.
        def seg(a, b, r, mat, name):             # one straight rod from a to b
            d = tuple(b[k] - a[k] for k in range(3))
            L = math.sqrt(sum(c * c for c in d))
            u = tuple(c / L for c in d)
            rod(r, L, mat, tuple(a[k] + d[k] / 2 for k in range(3)),
                rot=(math.asin(max(-1.0, min(1.0, -u[1]))), math.atan2(u[0], u[2]), 0),
                name=name, seg=14)

        back = tuple(-c for c in V)
        block((0.042 * W, 0.510 * W, 0.054 * W), 'darkwood', on(0.175 * W), rot=aim(back),
              bevel=0.008 * W, name='stock')
        # the butt is SHORT. Any longer and it rides up behind the right shoulder into the
        # beard, and a dark block against a white beard is the loudest thing on the model
        block((0.048 * W, 0.090 * W, 0.092 * W), 'darkwood', on(-0.055 * W, 0.006 * W),
              rot=aim(back), bevel=0.012 * W, name='butt')
        # a dark wrap on the wood at each fist. The hand overlapping the stock is what says
        # HELD; the wrap is what says held HERE - a value change exactly at the contact, so the
        # eye has a reason to stop there instead of running the pale skin and the pale wood
        # together into one shape.
        for sv in (0.0, GRIP_L):
            seg(on(sv - 0.044 * W), on(sv + 0.044 * W), 0.030 * W, 'leather', 'wrap')
        block((0.026 * W, 0.030 * W, 0.072 * W), 'silver', on(0.050 * W, -0.054 * W),
              rot=aim(back), bevel=0.006 * W, name='trigger')
        # the prod: two limbs out of a nose block, swept back along the stock so the string,
        # drawn tip to tip, stands clear BEHIND the nose. The limbs are pale tan, because at
        # darkwood a limb sits a shade off INK and its own outline eats it - and the triangle
        # of daylight between the two limbs and the string is the whole read. They stay along
        # world x: x is the one axis the camera spreads almost fully, so a prod laid on it is
        # the widest line the model can draw.
        nose = on(0.430 * W)
        bar = on(0.235 * W)                           # the limb roots, well BACK from the nose.
        # At 0.330 they were barely behind it, the two limbs came out within sixteen degrees of
        # each other and of the string, and three collinear pale lines are one line: the prod
        # read as a plain stick with a dark lump behind it. From 0.235 the limbs open and the
        # string, drawn tip to tip, cuts a triangle of daylight across them. That triangle is
        # the whole reason anyone reads "crossbow", and it needs TWO more corrections - both
        # of them projection, neither of them bow-making.
        #
        # CENTRE. The tips are symmetric about bar in the model and are NOT symmetric on
        # screen, because the nose they spring from is a long way up the stock and the stock's
        # screen direction has a component along the prod. Measured: 0.42 of screen for the
        # near limb against 0.25 for the far one, and a chevron with one arm nearly twice the
        # other reads as a bent stick, not a bow. Sliding the whole prod 0.095 along +x drops
        # the nose over the middle of the string; the limbs come out 0.35 and 0.30.
        #
        # DROP. This is what opens the triangle, and it is the correction that took longest to
        # find because the obvious move does nothing. Work the projection through and the
        # daylight between the nose and a flat string is
        #     0.506 * (nose - bar, along the stock)  +  0.931 * (drop)
        # with the tip SPREAD cancelling out of it exactly - spread is along x, the string is
        # along x, and sliding a line along itself does not move it. So widening the prod,
        # which is what one reaches for, buys silhouette and not one pixel of hole. Only the
        # drop buys hole, and it buys it at nearly twice the rate of the sweep. 0.050 takes
        # the daylight from 0.074 of a body as shipped to 0.198 - at this sprite's 203 px,
        # forty pixels of sky where there were fifteen, which is the difference between a
        # triangle and a seam. It costs 12 degrees of cant out of square with the stock. That
        # is a recurve, and nobody is going to measure it.
        tips = [(bar[0] + 0.095 - 0.225 * W, bar[1], bar[2] - 0.050 * W),
                (bar[0] + 0.095 + 0.225 * W, bar[1], bar[2] - 0.050 * W)]
        ball(0.028 * W, 'leather', nose, scale=(1.0, 1.2, 1.0), name='nose')
        for tp in tips:
            seg(nose, tp, 0.016 * W, 'tan', 'limb')  # LONG and THIN: the prod has to be the
            ball(0.021 * W, 'leather', tp, name='tipnock')   # longest line in the weapon, or
        #                                            # the stock is, and then it is a gun
        # THE STRING IS WHERE THE SHOT IS. Nothing else on a 40 px crossbow can carry one: the
        # kick is four pixels of muzzle and the bolt is three. Spanned, the string comes back
        # off the tips to a nut over the stock and the prod closes into a kite; on the release
        # frame it snaps flat between the tips again and the bolt is gone with it. CARRIED it
        # stays flat - the triangle of daylight between the two limbs and a straight string is
        # how the piece is read for the other twenty-one frames, and that may not be spent on
        # an attack that lasts four.
        k = pose.act('guard')
        mid = tuple((tips[0][j] + tips[1][j]) / 2 for j in range(3))
        nut = on(0.090 * W, 0.030 * W)               # just ahead of the trigger, where the
        apex = tuple(mid[j] + (nut[j] - mid[j]) * k for j in range(3))   # right fist already is
        if k > 0.01:
            seg(tips[0], apex, 0.011 * W, 'cream', 'string')
            seg(apex, tips[1], 0.011 * W, 'cream', 'string')
        else:
            seg(tips[0], tips[1], 0.011 * W, 'cream', 'string')
        # only the head of the bolt, out past the string. It used to be a full shaft lying in
        # the groove, and that was the single thing keeping the musket read alive: a pale rod
        # parallel to a pale stock is a BARREL, whatever is carved on the end of it.
        if pose.nocked('guard'):
            seg(on(0.360 * W, 0.036 * W), on(0.500 * W, 0.036 * W), 0.012 * W, 'cream', 'bolt')
            ball(0.018 * W, 'silver', on(0.522 * W, 0.036 * W), scale=(0.7, 1.7, 0.7),
                 name='bolthead')
    return 1.30



MODELS = {'guard': model_guard, 'militia': model_militia, 'slinger': model_slinger,
          'shield': model_shield, 'bowman': model_bowman, 'adept': model_adept, **beasts.MODELS}
# yaw (degrees) so each model shows a front and a side; units face right, the game mirrors them
YAW = {'guard': 34, 'militia': 34, 'slinger': 32, 'shield': 30, 'bowman': 26, 'adept': 32,
       **beasts.YAW}
