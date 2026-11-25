"""The turned-wood primitives: materials and the few shapes every model in the cast is made of.

Surfaces of revolution (lathe), blocks, balls and rods, painted in flat enamel colours with bare
wood showing grain. toys.py (buildings) and troops.py (units) both build on these, so one hand
carves the whole set. Model space: +z up, the front of a model faces -y.
"""
import math
from contextlib import contextmanager

import bpy

PART = [None]   # the movable group every primitive made right now belongs to (see group())


@contextmanager
def group(name):
    """Tag every part built inside with a group name, so a pose can move them as one piece."""
    # nested groups make a path - 'armR.gear' is the weapon in the right hand, which a pose can
    # turn on its own (it drags behind the arm) or leave to follow 'armR' with the rest of the arm
    PART.append('.'.join(p for p in (PART[-1], name) if p))
    try:
        yield
    finally:
        PART.pop()

def srgb(hexstr: str, a: float = 1.0):
    """sRGB hex -> linear RGBA, as Blender's colour inputs want."""
    h = hexstr.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, a)


# WHY THE GREENS ARE TEAL. Three rounds painted the foliage a yellow-olive (#5f8a3a, hue 92)
# because that is what grass is. Measured on the reference game's forest boards (D:/new/ref,
# IMG_3717) its whole picture sits in ONE hue family -- ground hue 171, crowns 171-180, stumps,
# obelisks and rocks all between 160 and 190 -- and separates by value and saturation alone:
# crown 0.35 against ground 0.45, saturation 0.76 against 0.54. That is the answer to 'the
# board is cluttered and tiring': a yellow-green crown 57 degrees of hue off a teal board is a
# second subject fighting the first on every tile, and no amount of value tuning fixes it.
# So the foliage keeps its old saturation and value exactly and only turns hue, to 172 -- one
# family with the meadow skins (skins.ts, hue 163-176) and the water. See DECISIONS.md D96.
TEAM = {'blue': '#1d58d8', 'red': '#cc2216'}  # deeper than the UI's: lit paint reads lighter
PAL = {
    'cream': '#ead7ae', 'white': '#f4f1ea', 'black': '#26201c', 'brown': '#6b4428',
    'darkwood': '#4a3020', 'skin': '#e9b98b', 'green': '#2f8a7f', 'moss': '#49998e',
    'tan': '#c6a56e', 'stone': '#a99b85', 'grey': '#8a857d', 'yellow': '#f2c14e', 'pink': '#e89a8c',
    'opening': '#1b1410', 'slate': '#5d5a57',
    # the terrain props (props.py): a colder blue-white for ice, and a second,
    # darker green so a tree's crown has two values and does not read as one blob
    'ice': '#9fd8e8', 'frost': '#dff2f7', 'deepgreen': '#2a6864',
    # 'bark' is the meadow trees' trunk and boughs, and it exists because 'brown' (#6b4428,
    # hue 25) is the ONE warm thing left on a finished board. Masked by hue over the seed-2
    # board, 3.1% of our pixels sat in hue 0-30 at value 0.26 -- the trunks, and nothing else
    # is both warm and dark. The reference (D:/new/ref IMG_3717) has no dark warm pixel at all:
    # 96% of its board is hue 150-210 and its only warm 2.4% sits at value 0.75-1.0, which is
    # its UI icons. Its own cut stump is COLD, and the measurement that matters is how far it sits
    # from the ground it stands on, not what it is on its own: masked beside each other, the
    # reference's stump is hue 172.3 against its open ground's 169.0 -- THREE DEGREES -- at 2.98x
    # the ground's saturation and 0.85 of its value. It is not a different colour from the board. It
    # is the board's own colour wrung out dark. A first cut of this put the bark at hue 190 off the
    # reference stump's own #064655, which rendered at hue 195.9 against our ground's 169.1 -- 27
    # degrees out -- and two saturated cyan legs under every oak read as the BLUE TEAM, which is the
    # one thing a colour on this board may not do (STYLE.md). So the hue is the crown's, not the
    # reference pixel's: 172, four degrees off 'deepgreen', at 0.80 saturation (well over the
    # ground's 0.37). The value is a sixth OVER brown's, which is the second thing the side-by-side
    # measurement says: the reference's stump is 0.85 of its ground and 0.78 of its canopy, and a
    # trunk at brown's own value came out at 0.68 and 0.71 -- darker than the reference's, and dark
    # enough that the crown looked like it was standing on nothing. 0.49 puts the rendered trunk at
    # 0.76 of the ground and 0.79 of the crown. The buildings', the chest's and the camp's timber
    # keep 'brown': those are made things and a warm plank is what says so. D109.
    'bark': '#197d70',
    # 'shade' is the little disc a prop stands on (props.py _ground). It used to be 'moss', and a
    # flat UP-FACING disc under a 4.9-energy key is the one surface in the whole set that blows out:
    # moss at value 0.600 rendered near 0.95, and the tone pass (sprite.py) brought that back only to
    # 0.486 -- as bright as the brightest board tile and 0.17 ABOVE the crown standing on it, which
    # is why every tree and chest sat on a bright green lollipop stick of a ring. It is a dark of the
    # board's own hue family instead, so it reads as the piece's shadow on any of the three grounds
    # (the snow and desert props keep their explicit 'frost' and 'tan'). D100.
    'shade': '#2a4a44',
    # the one yellow-green left in the set: a desert cactus and the ogre's brow, which both
    # have to sit over warm hide and sand and would read as a hole in the teal above
    'ogredark': '#5f8a3a',
    # the militia's own colours: 'hair' and 'mouth' stay clear of INK (#2b1d14), or at
    # 40 px the outline swallows them; 'cloth' is the work trousers, 'leather' boots/belt
    'hair': '#6d4526', 'mouth': '#5a241c', 'leather': '#55361f', 'cloth': '#9a7a46',
    # the boots are lighter than the belt: against the ink a dark boot is a hole, not a foot
    'boot': '#7b5430',
    'skin2': '#e8bd91',
    # the big troops (beasts.py): green hide, warm scales, bone. All kept well clear of INK, and
    # 'stone' / 'grey' above already carry the colossus.
    'ogre': '#88a84f', 'tusk': '#efe6cf', 'scale': '#cf7338', 'belly': '#e6c58a',
    'horn': '#c9a86a', 'wing': '#b85c2e',
}


# ---------------------------------------------------------------- materials

def _bump(nt, strength: float, scale: float, stretch=(1, 1, 1)):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = stretch
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = 6
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = strength
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    nt.links.new(nz.outputs['Fac'], bp.inputs['Height'])
    return bp, nz


def paint(name: str, col, rough=0.55, coat=0.08, metal=0.0):
    """Enamel: one flat colour, a satin lacquer and the faint ridges of the brush and the grain."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = col
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = 0.25
    bp, _ = _bump(nt, 0.06, 60, (1, 1, 5))
    nt.links.new(bp.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def wood(name: str, light='#c48d58', dark='#a26a3a'):
    """Bare turned beech: grain streaks along the turning axis."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.6
    bp, nz = _bump(nt, 0.05, 14, (34, 34, 1.4))
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.42
    ramp.color_ramp.elements[0].color = srgb(light)
    ramp.color_ramp.elements[1].position = 0.6
    ramp.color_ramp.elements[1].color = srgb(dark)
    nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(bp.outputs['Normal'], bsdf.inputs['Normal'])
    return m


MATS: dict = {}


def mats(team: str):
    MATS.clear()
    for k, v in PAL.items():
        MATS[k] = paint(k, srgb(v))
    MATS['team'] = paint('team', srgb(TEAM[team]))
    MATS['gold'] = paint('gold', srgb('#e8b54a'), rough=0.3, coat=0.0, metal=0.85)
    MATS['silver'] = paint('silver', srgb('#c9ccd1'), rough=0.28, coat=0.0, metal=0.9)
    MATS['wood'] = wood('wood')
    MATS['darkwood'] = wood('darkwood_grain', '#8a5a36', '#6a4226')
    MATS['nugget'] = paint('nugget', srgb('#f5c542'), rough=0.25, coat=0.0, metal=0.9)


# ---------------------------------------------------------------- geometry

def _finish(ob, mat, smooth=True, bevel=0.0):
    ob['grp'] = PART[-1] or ''
    ob.data.materials.append(MATS[mat])
    if bevel:
        bv = ob.modifiers.new('bevel', 'BEVEL')
        bv.width = bevel
        bv.segments = 3
        bv.limit_method = 'ANGLE'
    if smooth:
        # smooth by angle: round parts shade soft, the steps between turned rings stay crisp
        for p in ob.data.polygons:
            p.use_smooth = True
        ob.data.set_sharp_from_angle(angle=math.radians(35))
    return ob


def lathe(profile, mat, loc=(0, 0, 0), seg=48, name='lathe', scale=(1, 1, 1)):
    """A turned part: profile = [(radius, z), ...] bottom to top; closed by flat caps."""
    verts, faces = [], []
    n = len(profile)
    for r, z in profile:
        for s in range(seg):
            a = 2 * math.pi * s / seg
            verts.append((r * math.cos(a), r * math.sin(a), z))
    for k in range(n - 1):
        for s in range(seg):
            a0, a1 = k * seg + s, k * seg + (s + 1) % seg
            faces.append((a0, a1, a1 + seg, a0 + seg))
    if profile[0][0] > 0:
        verts.append((0, 0, profile[0][1]))
        c = len(verts) - 1
        for s in range(seg):
            faces.append((c, (s + 1) % seg, s))
    if profile[-1][0] > 0:
        verts.append((0, 0, profile[-1][1]))
        c = len(verts) - 1
        b = (n - 1) * seg
        for s in range(seg):
            faces.append((c, b + s, b + (s + 1) % seg))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    ob.scale = scale
    bpy.context.collection.objects.link(ob)
    return _finish(ob, mat)


def block(size, mat, loc, rot=(0, 0, 0), bevel=0.02, name='block'):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(ob, mat, smooth=True, bevel=bevel)


def ball(r, mat, loc, scale=(1, 1, 1), name='ball'):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=32, ring_count=16)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    return _finish(ob, mat)


def rod(r, h, mat, loc, rot=(0, 0, 0), bevel=0.0, name='rod', seg=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=seg)
    ob = bpy.context.active_object
    ob.name = name
    return _finish(ob, mat, bevel=bevel)


def fan(hub, rim, mat, thick=0.03, name='web'):
    """A membrane: a triangle fan from one hub out to a rim of points, given a little thickness.

    A wing is the one shape the lathe cannot turn and a ball cannot fake: its edge is scalloped
    and its plane is not the model's. Built as a fan rather than one n-gon so a concave rim
    (the dips between a bat's fingers) still triangulates the way it is drawn.
    """
    verts = [tuple(hub)] + [tuple(p) for p in rim]
    faces = [(0, i + 1, i + 2) for i in range(len(rim) - 1)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    sol = ob.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = thick
    return _finish(ob, mat, smooth=False, bevel=0.008)


def prism(w, d, h, mat, loc, overhang=0.06, name='roof'):
    """A gable roof along x: width w (x), depth d (y), ridge height h."""
    x, y = w / 2 + overhang, d / 2 + overhang
    verts = [(-x, -y, 0), (x, -y, 0), (x, y, 0), (-x, y, 0), (-x, 0, h), (x, 0, h)]
    faces = [(0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5), (0, 3, 2, 1)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    bpy.context.collection.objects.link(ob)
    sol = ob.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.05
    return _finish(ob, mat, smooth=True, bevel=0.012)


def flag(pole_top, mat='team', h=0.22, w=0.26, pole_h=0.45):
    x, y, z = pole_top
    rod(0.012, pole_h, 'darkwood', (x, y, z - pole_h / 2))
    ball(0.025, 'gold', (x, y, z + 0.015))
    # a pennant: a thin triangle-ish block, waving a little
    verts = [(0, 0, 0), (w, 0.02, -h * 0.45), (0, 0, -h)]
    me = bpy.data.meshes.new('pennant')
    me.from_pydata(verts, [], [(0, 1, 2)])
    ob = bpy.data.objects.new('pennant', me)
    ob.location = (x + 0.012, y, z - 0.03)
    bpy.context.collection.objects.link(ob)
    sol = ob.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.02
    _finish(ob, mat, smooth=False)


def windows(face_y, xs, z, mat='yellow', size=(0.09, 0.02, 0.11)):
    for x in xs:
        block((size[0] + 0.03, size[1], size[2] + 0.03), 'darkwood', (x, face_y - 0.005, z), bevel=0.006)
        block(size, mat, (x, face_y - 0.016, z), bevel=0.004)
