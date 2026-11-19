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


TEAM = {'blue': '#1d58d8', 'red': '#cc2216'}  # deeper than the UI's: lit paint reads lighter
PAL = {
    'cream': '#ead7ae', 'white': '#f4f1ea', 'black': '#26201c', 'brown': '#6b4428',
    'darkwood': '#4a3020', 'skin': '#e9b98b', 'green': '#5f8a3a', 'moss': '#7d9a48',
    'tan': '#c6a56e', 'stone': '#a99b85', 'grey': '#8a857d', 'yellow': '#f2c14e', 'pink': '#e89a8c',
    'opening': '#1b1410', 'slate': '#5d5a57',
    # the terrain props (props.py): a colder blue-white for ice, and a second,
    # darker green so a tree's crown has two values and does not read as one blob
    'ice': '#9fd8e8', 'frost': '#dff2f7', 'deepgreen': '#44682a',
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
