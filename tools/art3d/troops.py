"""The troop models: built from the same turned-wood primitives as the buildings in toys.py.

The foot troops are all the same carved body (body.py) in different gear, so the row reads as one
set. Kept apart from toys.py so it stays inside the project's 500-line rule as the cast grows;
toys.py imports this late (the primitives have to exist first) and merges MODELS and YAW.

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
    B.strap(mat='team', w=0.058)      # wide enough to read as a sash and not as a seam
    B.face()
    B.arm(-0.146, sleeve='cream')
    B.arm(0.146, sleeve='cream', out=0.066, hy=-0.046, thumb=True)
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
        B.arc((0.260, 0.500), 0.255, math.radians(-103), 0.0, 'leather', 13,
              bead=0.013, y=-0.052, name='cord')
        pouch = (0.515, -0.052, 0.500)
        ball(0.082, 'leather', pouch, scale=(1.0, 0.8, 0.72), name='pouch')
        ball(0.050, 'grey', (pouch[0], pouch[1] - 0.046, pouch[2]), name='stone')
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
    B.arm(0.146, out=0.040, hy=-0.050, thumb=True)
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
        for sz in ((2 * R - 0.040, 0.030, 0.082), (0.082, 0.030, 2 * R - 0.040)):
            block(sz, 'team', on_face(0, 0, 0.062), rot=(0, 0, face), bevel=0.006, name='cross')
        ball(0.082, 'silver', on_face(0, 0, 0.082), scale=(1.0, 0.55, 1.0), name='boss')
        for a in range(8):                # studs round the rim, on the face's own axes
            t = 2 * math.pi * a / 8
            ball(0.022, 'silver', on_face(0.252 * math.cos(t), 0.252 * math.sin(t), 0.072),
                 name='stud')
    with group('armR'), group('gear'):  # the sword held back and low: raised, it fuses with
        tilt = math.radians(20)           # the helmet under the ink
        rod(0.022, 0.090, 'darkwood', (0.214, -0.050, 0.236), rot=(0, tilt, 0), name='grip')
        block((0.082, 0.026, 0.024), 'gold', (0.236, -0.050, 0.296), rot=(0, tilt, 0),
              bevel=0.005, name='guard')
        block((0.050, 0.020, 0.300), 'silver', (0.286, -0.050, 0.452), rot=(0, tilt, 0),
              bevel=0.006, name='blade')
        ball(0.028, 'silver', (0.344, -0.050, 0.600), scale=(1.0, 0.6, 1.4), name='point')
        ball(0.026, 'gold', (0.198, -0.050, 0.196), name='pommel')
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
    B.arm(-0.150, out=0.098, hy=-0.088, thumb=True)       # the string hand, drawn back to the jaw
    B.arm(0.146, out=0.260, hy=-0.070, thumb=True)        # the bow hand, pushed out in front
    with group('armR'), group('gear'):
        # A bow is read as ONE TALL D: a long bent line, a straight line beside it, and a gap of
        # daylight between them. The first pass had a short deep arc (128 degrees of a small circle)
        # with the string pulled to a draw point, so stave and string closed a near-circle with a
        # bar across it - a round shield with a grip, which is exactly what it looked like on the
        # board. So: the span is wide and shallow, the bow is 0.70 tall on a 1.20 body, and the
        # string runs NOCK TO NOCK. He is walking; a walking archer's bow is not drawn, and the
        # drawing reads off his arms in the strike frames instead of being baked into the stave.
        r, y, cz = 0.430, -0.070, 0.390
        span = math.radians(54.5)         # chosen so the tips land at z 0.04 and 0.74: clear of the
        cx = FIST_X - r                   # boots below (gear under the feet moves the ground
        #                                 # anchor) and clear of the cap above
        # pale wood, not darkwood: at #4a3020 the stave sat a shade off INK (#2b1d14) and its own
        # outline ate it, so the bow came out as a bent dark smear with no inside. A bow is read
        # by the gap between stave and string - that gap has to be lighter than the ink around it.
        B.arc((cx, cz), r, -span, span, 'tan', 34,
              bead=0.032, y=y, scale=(1.0, 0.9, 1.0), name='stave')      # stave
        nocks = [(cx + r * math.cos(span * sg), y, cz + r * math.sin(span * sg)) for sg in (-1, 1)]
        for n in nocks:
            ball(0.026, 'leather', n, name='nock')
        B.line(nocks[0], nocks[1], 'cream', 26, bead=0.017, name='string')
        # recurved tips. Stave plus string is still a CLOSED outline, and a closed outline that is
        # only three times taller than it is wide is a leaf, or - as it turned out on the board - a
        # round shield with a grip across it. These two hooks kick out past the string and leave the
        # silhouette open at both ends, which is the one shape nothing but a bow makes.
        for n, dz in ((nocks[0], -0.040), (nocks[1], 0.040)):
            B.line(n, (n[0] + 0.090, y, n[2] + dz), 'tan', 9, bead=0.028, name='horn')
        rod(0.013, 0.640, 'tan', (0.210, y, cz), rot=(0, math.radians(90), 0),
            name='arrow')                 # the arrow sticks out PAST the stave: a line crossing
        ball(0.026, 'white', (-0.098, y, cz), scale=(1.0, 1.0, 0.4), name='fletch')  # and leaving
        #                                 # the D is what stops it closing into a disc
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
    B.arm(0.146, out=0.174, hy=-0.115, thumb=True)
    with group('armR'):
        # B.arm's forearm is a free rod: at out=0 it hides under the sleeve, but reached this far
        # out it floats, and a bare tan cylinder parallel to a bare wooden staff reads as a SECOND
        # STICK. These beads are the upper arm that was never modelled - they close the sleeve to
        # the elbow, and once the chain is unbroken the eye stops counting two sticks.
        B.line((0.154, -0.026, 0.524), (0.206, -0.086, 0.408), 'skin', 8, bead=0.046,
               scale=(1.0, 1.0, 1.0), name='upperarm')
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
        ball(0.066, 'yellow', (0.320, -0.115, 0.950), scale=(0.9, 0.9, 1.15), name='crystal')
        ball(0.024, 'white', (0.296, -0.145, 0.976), name='glint')
    return 1.32


def model_guard():
    """The castle guard as a nutcracker WITH A CROSSBOW: shako, white beard, team coat, a prod
    held level across the waist.

    He used to carry a halberd, and the halberd was a lie. src/sim/guard.ts has fired a bolt at
    2.4 tiles since the day it was written - `fire(..., 'bolt', PROJ.bolt, ...)`, 14 a shot every
    0.7 s, with regen and a twelve second respawn - so this man is the player's opening defence
    and he is a SHOOTER. A polearm is the one mistake a 40 px sprite cannot survive, because at
    that size the weapon IS the unit: everything the player knows about what a piece does, it
    reads off the thing in its hands.

    The crossbow also settles a problem the halberd never could. Eight of the nine pieces here
    are a vertical figure holding a vertical stick, and the halberd's head was a grey dot three
    pixels wide on top of one more stick. A prod is a WIDE HORIZONTAL BAR across the chest -
    0.56 of span on a 0.34 body - and nothing else on this board is shaped like that.

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
    SWING, TILT = 0.18, math.radians(-39.0)      # across, and the NOSE UP. A man on watch carries
    #                                            # a crossbow muzzle-high so he can shoot without
    #                                            # first lifting it; the earlier pass had it the
    #                                            # other way round, pointing at his own boots.
    #                                            # The angle the eye reads is the SCREEN one:
    #                                            # up = -0.173 SWING - 0.256 - 0.951 tan TILT over
    #                                            # right = 0.559 - 0.829 SWING. The camera looks
    #                                            # DOWN at 18 degrees, so the whole scale is pushed
    #                                            # under the horizon: the nose only starts to rise
    #                                            # on screen past TILT -17, whatever it does in the
    #                                            # world. -39 is 38 degrees up in the world and
    #                                            # reads +50 on screen. It is also, against
    #                                            # intuition, the LONGER picture - tilting up turns
    #                                            # the stock towards the camera and shortens it,
    #                                            # but past about -30 the height it gains on screen
    #                                            # wins that back, and the gap to the prod opens
    #                                            # with it: 0.49 long and 38 degrees of daylight
    #                                            # here, against 0.42 and 21 at -30.
    _v = (-SWING, -1.0, -math.tan(TILT))
    _m = math.sqrt(sum(c * c for c in _v))
    V = tuple(c / _m for c in _v)                # unit vector from the butt towards the nose
    GRIP_L = 0.175                               # the fore-end hand, this far along from the
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
        block((0.042, 0.510, 0.054), 'darkwood', on(0.175), rot=aim(back), bevel=0.008,
              name='stock')
        # the butt is SHORT. Any longer and it rides up behind the right shoulder into the
        # beard, and a dark block against a white beard is the loudest thing on the model
        block((0.048, 0.090, 0.092), 'darkwood', on(-0.055, 0.006), rot=aim(back), bevel=0.012,
              name='butt')
        # a dark wrap on the wood at each fist. The hand overlapping the stock is what says
        # HELD; the wrap is what says held HERE - a value change exactly at the contact, so the
        # eye has a reason to stop there instead of running the pale skin and the pale wood
        # together into one shape.
        for sv in (0.0, GRIP_L):
            seg(on(sv - 0.044), on(sv + 0.044), 0.030, 'leather', 'wrap')
        block((0.026, 0.030, 0.072), 'silver', on(0.050, -0.054), rot=aim(back), bevel=0.006,
              name='trigger')
        # the prod: two limbs out of a nose block, swept back along the stock so the string,
        # drawn tip to tip, stands clear BEHIND the nose. The limbs are pale tan, because at
        # darkwood a limb sits a shade off INK and its own outline eats it - and the triangle
        # of daylight between the two limbs and the string is the whole read. They stay along
        # world x: x is the one axis the camera spreads almost fully, so a prod laid on it is
        # the widest line the model can draw.
        nose = on(0.430)
        bar = on(0.235)                               # the limb roots, well BACK from the nose.
        # At 0.330 they were barely behind it, the two limbs came out within sixteen degrees of
        # each other and of the string, and three collinear pale lines are one line: the prod
        # read as a plain stick with a dark lump behind it. From 0.210 the limbs open into a
        # thirty-four degree chevron and the string, drawn tip to tip, finally cuts a triangle
        # of daylight across it. That triangle is the whole reason anyone reads "crossbow".
        tips = [(bar[0] - 0.225, bar[1], bar[2] + 0.004),
                (bar[0] + 0.225, bar[1], bar[2] + 0.004)]
        ball(0.028, 'leather', nose, scale=(1.0, 1.2, 1.0), name='nose')
        for tp in tips:
            seg(nose, tp, 0.016, 'tan', 'limb')      # LONG and THIN: the prod has to be the
            ball(0.021, 'leather', tp, name='tipnock')   # longest line in the weapon, or the
        seg(tips[0], tips[1], 0.011, 'cream', 'string')  # stock is, and then it is a gun
        # only the head of the bolt, out past the string. It used to be a full shaft lying in
        # the groove, and that was the single thing keeping the musket read alive: a pale rod
        # parallel to a pale stock is a BARREL, whatever is carved on the end of it.
        seg(on(0.360, 0.036), on(0.500, 0.036), 0.012, 'cream', 'bolt')
        ball(0.018, 'silver', on(0.522, 0.036), scale=(0.7, 1.7, 0.7), name='bolthead')
    return 1.30



MODELS = {'guard': model_guard, 'militia': model_militia, 'slinger': model_slinger,
          'shield': model_shield, 'bowman': model_bowman, 'adept': model_adept, **beasts.MODELS}
# yaw (degrees) so each model shows a front and a side; units face right, the game mirrors them
YAW = {'guard': 34, 'militia': 34, 'slinger': 32, 'shield': 30, 'bowman': 26, 'adept': 32,
       **beasts.YAW}
