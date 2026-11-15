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
    """A farm boy called up: short team tunic, work trousers, boots, a pitchfork held at the hip."""
    B.legs()
    B.torso()
    B.strap()
    B.face()
    B.arm(-0.146)
    B.arm(0.146, out=0.066, hy=-0.046, thumb=True)
    with group('armR'):                   # the pitchfork goes with the hand, leaning back
        tilt = math.radians(14)           # away from the head: the ink would bridge a small gap
        rod(0.019, 0.700, 'darkwood', (0.245, -0.046, 0.390), rot=(0, tilt, 0), name='shaft')
        block((0.098, 0.022, 0.024), 'silver', (0.330, -0.046, 0.731), rot=(0, tilt, 0),
              bevel=0.004, name='crossbar')
        for dx in (-0.040, 0.0, 0.040):   # three thick tines: four hairline ones go to a smear
            rod(0.016, 0.112, 'silver', (0.344 + dx, -0.046, 0.787), rot=(0, tilt, 0), name='tine')
            ball(0.017, 'silver', (0.347 + dx, -0.046, 0.842), name='tip')
    return 1.18


def model_slinger():
    """The scout: a leather cap and a cape, a pouch of stones, a sling whirling at his side."""
    B.legs(cloth='tan')
    B.torso(mat='team', belt='leather', buckle='gold')
    B.face()
    with group('head'):                   # a soft leather cap down to the brow. A full hood put
        lathe([(0.178, 0.790), (0.188, 0.824), (0.168, 0.866), (0.090, 0.894), (0.0, 0.900)],
              'leather', name='cap')      # the whole face in shadow under the 42 deg camera
        lathe([(0.192, 0.782), (0.194, 0.812)], 'cloth', name='capband')
    B.cloak('leather', drop=0.10)
    B.arm(-0.146, sleeve='team')
    B.arm(0.146, sleeve='team', out=0.058, hy=-0.052, thumb=True)
    with group('armR'):                   # the sling: two cords from the fist down to a loaded
        fist = (0.204, -0.052, 0.252)     # pouch, held out and low so it never crosses the face
        pouch = (0.300, -0.062, 0.046)
        for s in (-1, 1):
            B.line(fist, (pouch[0] + 0.034 * s, pouch[1] + 0.022 * s, pouch[2] + 0.030),
                   'leather', 9, bead=0.011, name='cord')
        ball(0.052, 'leather', pouch, scale=(1.0, 0.8, 0.72), name='pouch')
        ball(0.030, 'grey', (pouch[0], pouch[1] - 0.030, pouch[2]), name='stone')
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
    with group('armL'):                   # a round shield, carried edge-on-ish so it stays wide
        lathe([(0.190, 0.0), (0.186, 0.022), (0.150, 0.040), (0.0, 0.046)], 'wood',
              loc=(-0.214, -0.078, 0.252), name='shield',
              scale=(1.0, 1.0, 1.0)).rotation_euler = (math.radians(90), 0, math.radians(-14))
        ball(0.054, 'silver', (-0.252, -0.094, 0.252), scale=(0.5, 1.0, 1.0), name='boss')
        for a in range(6):                # a rim of studs: a plain disc reads as a dinner plate
            t = 2 * math.pi * a / 6
            ball(0.018, 'silver', (-0.214 + 0.150 * math.cos(t), -0.086,
                                   0.252 + 0.150 * math.sin(t)), name='stud')
    with group('armR'):                   # the sword held back and low: raised, it fuses with
        tilt = math.radians(20)           # the helmet under the ink
        rod(0.022, 0.090, 'darkwood', (0.214, -0.050, 0.236), rot=(0, tilt, 0), name='grip')
        block((0.082, 0.026, 0.024), 'gold', (0.236, -0.050, 0.296), rot=(0, tilt, 0),
              bevel=0.005, name='guard')
        block((0.050, 0.020, 0.300), 'silver', (0.286, -0.050, 0.452), rot=(0, tilt, 0),
              bevel=0.006, name='blade')
        ball(0.028, 'silver', (0.344, -0.050, 0.600), scale=(1.0, 0.6, 1.4), name='point')
        ball(0.026, 'gold', (0.198, -0.050, 0.196), name='pommel')
    return 1.22


def model_bowman():
    """The archer: a soft cap with a feather, a bow held out, a quiver over the shoulder."""
    B.legs(cloth='leather')
    B.torso(mat='team', belt='leather')
    B.face()
    with group('head'):                   # a soft cap pulled over the mop, feather at the side
        lathe([(0.176, 0.792), (0.186, 0.826), (0.166, 0.868), (0.090, 0.896), (0.0, 0.902)],
              'team', name='cap')
        lathe([(0.190, 0.784), (0.192, 0.814)], 'leather', name='capband')
        B.line((0.160, 0.020, 0.826), (0.286, 0.136, 1.030), 'white', 11, bead=0.026,
               scale=(1.0, 0.5, 1.0), name='feather')   # a straight quill off the band: an arc
    B.cloak('team', drop=0.08)
    B.arm(-0.150, out=0.098, hy=-0.088, thumb=True)       # the string hand, drawn back to the jaw
    B.arm(0.146, out=0.120, hy=-0.070, thumb=True)        # the bow hand, pushed out in front
    with group('armR'):                   # the bow: belly at the fist, tips curving away, so the
        r, y = 0.330, -0.070              # stave never crosses the head under the ink. The beads
        cx = 0.266 - r                    # overlap: spaced wider they read as a necklace, not a
        B.arc((cx, 0.330), r, math.radians(-64), math.radians(64), 'darkwood', 30,
              bead=0.026, y=y, scale=(1.0, 0.9, 1.0), name='stave')      # stave
        nocks = [(cx + r * math.cos(math.radians(64 * s)), y,
                  0.330 + r * math.sin(math.radians(64 * s))) for s in (-1, 1)]
        draw = (-0.052, -0.088, 0.300)
        for n in nocks:
            ball(0.026, 'leather', n, name='nock')
            B.line(n, draw, 'cream', 24, bead=0.016, name='string')
        rod(0.011, 0.420, 'darkwood', (0.112, -0.080, 0.300), rot=(0, math.radians(90), 0),
            name='arrow')                 # one arrow on the string, out through the bow hand
        ball(0.026, 'white', (-0.090, -0.082, 0.300), scale=(1.0, 1.0, 0.4), name='fletch')
    with group('body'):                   # the quiver rides on the back, fletches over the
        lathe([(0.062, 0.300), (0.066, 0.470), (0.058, 0.510), (0.0, 0.516)], 'leather',
              loc=(0.070, 0.148, 0), name='quiver').rotation_euler = (math.radians(-18), 0, 0)
        for dx in (-0.030, 0.006, 0.042):
            rod(0.009, 0.120, 'darkwood', (0.070 + dx, 0.112, 0.560), name='arrow')
            ball(0.028, 'white', (0.070 + dx, 0.112, 0.614), scale=(0.35, 1.0, 1.0), name='fletch')
    return 1.20


def model_adept():
    """The apprentice: a tall starred hat, a knee-length robe, a staff with a lit crystal."""
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
    B.arm(0.146, out=0.062, hy=-0.050, thumb=True)
    with group('armR'):                   # the staff leans out, the crystal clear of the hat
        tilt = math.radians(16)
        rod(0.020, 0.760, 'darkwood', (0.246, -0.050, 0.400), rot=(0, tilt, 0), name='staff')
        lathe([(0.052, 0.0), (0.044, 0.030), (0.0, 0.040)], 'gold', loc=(0.352, -0.050, 0.760),
              seg=6, name='claw')
        ball(0.062, 'yellow', (0.360, -0.050, 0.836), scale=(0.9, 0.9, 1.15), name='crystal')
        ball(0.022, 'white', (0.336, -0.078, 0.860), name='glint')
    return 1.32


def model_guard():
    """The castle guard as a nutcracker: shako, white beard, team coat, a halberd."""
    B.legs(cloth='white', boot='black', hip=0.300)
    lathe([(0.150, 0.270), (0.168, 0.336), (0.176, 0.442), (0.168, 0.520), (0.120, 0.560),
           (0.0, 0.572)], 'team', name='coat')
    lathe([(0.172, 0.300), (0.178, 0.344)], 'black', name='belt')
    block((0.046, 0.020, 0.044), 'gold', (0, -0.176, 0.322), bevel=0.005, name='buckle')
    for z in (0.400, 0.456, 0.512):       # the brass buttons down the coat
        ball(0.016, 'gold', (0, -0.172, z), name='button')
    B.face(hair=None, brow=False)
    with group('head'):                   # beard, moustache and the shako
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
    B.arm(-0.150, sleeve='team')
    B.arm(0.150, sleeve='team', out=0.064, hy=-0.048, thumb=True)
    with group('armR'):                   # the halberd, leaning out away from the shako
        tilt = math.radians(13)
        rod(0.019, 0.760, 'darkwood', (0.250, -0.048, 0.400), rot=(0, tilt, 0), name='shaft')
        block((0.100, 0.022, 0.110), 'silver', (0.344, -0.048, 0.800), rot=(0, tilt, 0),
              bevel=0.010, name='axe')
        rod(0.014, 0.130, 'silver', (0.372, -0.048, 0.880), rot=(0, tilt, 0), name='spike')
        ball(0.016, 'silver', (0.378, -0.048, 0.944), name='tip')
    return 1.30


MODELS = {'guard': model_guard, 'militia': model_militia, 'slinger': model_slinger,
          'shield': model_shield, 'bowman': model_bowman, 'adept': model_adept, **beasts.MODELS}
# yaw (degrees) so each model shows a front and a side; units face right, the game mirrors them
YAW = {'guard': 34, 'militia': 34, 'slinger': 32, 'shield': 30, 'bowman': 26, 'adept': 32,
       **beasts.YAW}
