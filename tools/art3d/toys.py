"""Wooden-toy pilot: builds Erzgebirge-style turned-wood models in code and renders them as sprites.

usage: blender -b -P tools/art3d/toys.py -- <out dir> [name ...]
Every model is made of lathe-turned parts (surfaces of revolution), blocks and a few balls, painted
in flat enamel colours with bare wood showing grain. One camera, one light rig and one set of
materials for everything, so all sprites share a hand. Each model renders once per team: only the
team paint changes. The camera looks down at ELEV degrees, orthographic, on a transparent film.
"""
import math
import sys
from pathlib import Path

import bpy

ELEV = 42  # camera elevation above the ground, degrees
RES = 800  # render size in pixels (square); the sprite step trims and shrinks it


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
    'darkwood': '#4a3020', 'skin': '#f0c8a0', 'green': '#5f8a3a', 'moss': '#7d9a48',
    'stone': '#a99b85', 'grey': '#8a857d', 'yellow': '#f2c14e', 'pink': '#e89a8c',
    'opening': '#1b1410', 'slate': '#5d5a57',
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


# ---------------------------------------------------------------- models (front faces -y)

def model_tower():
    lathe([(0.34, 0), (0.34, 0.06), (0.30, 0.09), (0.24, 0.12), (0.21, 0.2), (0.2, 0.75),
           (0.19, 1.05), (0.0, 1.05)], 'wood', name='shaft')
    for z in (0.16, 0.55, 0.95):
        lathe([(0.225, z), (0.225, z + 0.045)], 'team' if z == 0.55 else 'darkwood', name='band')
    lathe([(0.32, 1.05), (0.32, 1.1), (0.0, 1.1)], 'darkwood', name='deck')
    # the lookout: a turned drum with posts and windows, under a cone roof
    lathe([(0.22, 1.1), (0.22, 1.36), (0.0, 1.36)], 'cream', name='cabin')
    for k in range(8):
        a = 2 * math.pi * k / 8
        rod(0.018, 0.26, 'darkwood', (0.225 * math.cos(a), 0.225 * math.sin(a), 1.23))
    block((0.1, 0.03, 0.12), 'opening', (0, -0.215, 1.24), bevel=0.01)
    lathe([(0.34, 1.34), (0.34, 1.38), (0.25, 1.48), (0.12, 1.66), (0.03, 1.82), (0.0, 1.84)], 'team', name='roof')
    ball(0.045, 'gold', (0, 0, 1.87))
    block((0.08, 0.03, 0.13), 'darkwood', (0, -0.2, 0.32), bevel=0.01)
    return 2.1


def model_house():
    """The common barracks: a Seiffen village house with a weapon rack."""
    block((0.86, 0.6, 0.5), 'cream', (0, 0, 0.25), bevel=0.025)
    block((0.94, 0.68, 0.06), 'darkwood', (0, 0, 0.03), bevel=0.015)
    prism(0.86, 0.6, 0.42, 'team', (0, 0, 0.5))
    block((0.1, 0.1, 0.26), 'slate', (0.24, 0.12, 0.88), bevel=0.012)
    block((0.18, 0.03, 0.3), 'brown', (0, -0.305, 0.17), bevel=0.012)
    ball(0.016, 'gold', (0.05, -0.33, 0.17))
    windows(-0.3, (-0.27, 0.27), 0.3)
    # half-timbering stripes
    for x in (-0.43, 0.43):
        for y in (-0.3, 0.3):
            block((0.045, 0.045, 0.5), 'darkwood', (x, y, 0.25), bevel=0.006)
    for y in (-0.12, 0.12):  # windows in the side wall
        block((0.02, 0.12, 0.14), 'darkwood', (0.432, y, 0.3), bevel=0.004)
        block((0.02, 0.09, 0.11), 'yellow', (0.442, y, 0.3), bevel=0.003)
    block((0.88, 0.035, 0.035), 'darkwood', (0, -0.3, 0.47), bevel=0.006)
    # the barracks' sign over the door: crossed spears on a team board
    block((0.3, 0.025, 0.1), 'team', (0, -0.312, 0.4), bevel=0.01)
    for t in (0.5, -0.5):
        block((0.018, 0.012, 0.16), 'silver', (0, -0.33, 0.4), rot=(0, t, 0), bevel=0.003)
    return 1.6


def model_castle():
    """The castle: a toy-box keep between two turned towers, a gate and a flag."""
    block((1.0, 0.62, 0.62), 'stone', (0, 0.08, 0.31), bevel=0.03)
    for i in range(5):
        x = -0.4 + i * 0.2
        block((0.12, 0.66, 0.12), 'stone', (x, 0.08, 0.68), bevel=0.015)
    # the gate: a dark arch with a plank door
    block((0.26, 0.04, 0.24), 'brown', (0, -0.24, 0.12), bevel=0.01)
    rod(0.13, 0.04, 'brown', (0, -0.24, 0.24), rot=(math.pi / 2, 0, 0))
    for x in (-0.06, 0.0, 0.06):
        block((0.012, 0.045, 0.3), 'darkwood', (x, -0.245, 0.15), bevel=0.0)
    windows(-0.23, (-0.3, 0.3), 0.45, size=(0.07, 0.02, 0.12))
    # centre tower with a team roof and the flag
    block((0.4, 0.34, 0.34), 'stone', (0, 0.16, 0.79), bevel=0.02)
    windows(-0.012, (0,), 0.82, size=(0.07, 0.02, 0.1))
    lathe([(0.3, 0.0), (0.0, 0.42)], 'team', loc=(0, 0.16, 0.96), seg=4, name='spire',
          scale=(1, 0.86, 1)).rotation_euler = (0, 0, math.pi / 4)
    flag((0, 0.16, 1.62), pole_h=0.3)
    for x in (-0.55, 0.55):
        lathe([(0.24, 0), (0.24, 0.05), (0.21, 0.08), (0.2, 0.86), (0.25, 0.9), (0.25, 0.98), (0.0, 0.98)],
              'wood', loc=(x, -0.02, 0), name='turret')
        lathe([(0.21, 0.36), (0.21, 0.4)], 'team', loc=(x, -0.02, 0))
        block((0.06, 0.03, 0.12), 'opening', (x, -0.235, 0.62), bevel=0.01)
        lathe([(0.29, 0.0), (0.29, 0.04), (0.2, 0.16), (0.08, 0.36), (0.0, 0.46)], 'team',
              loc=(x, -0.02, 0.98), name='cone')
        ball(0.04, 'gold', (x, -0.02, 1.46))
    return 2.2


def model_mine():
    """The mine: a turned, terraced rock (the way Erzgebirge toy mines are cut) with moss on top,
    a big timbered adit, a cart of gold on rails, a lantern and the owner's pennant."""
    lathe([(0.58, 0), (0.58, 0.12), (0.5, 0.14), (0.47, 0.3), (0.36, 0.32), (0.33, 0.48), (0.2, 0.5),
           (0.18, 0.58), (0.0, 0.59)], 'grey', loc=(0, 0.14, 0), name='hill', scale=(1, 0.85, 1))
    lathe([(0.205, 0.5), (0.205, 0.52), (0.19, 0.6), (0.0, 0.61)], 'moss', loc=(0, 0.14, 0), scale=(1, 0.85, 1))
    for z, r in ((0.12, 0.58), (0.3, 0.47)):  # moss tufts on the ledges
        lathe([(r - 0.03, z + 0.001), (r - 0.03, z + 0.02), (0.0, z + 0.02)], 'moss',
              loc=(0, 0.14, 0), scale=(1, 0.85, 1))
    # the adit: a timbered portal round a big dark opening, cut into the front of the rock
    block((0.56, 0.3, 0.5), 'grey', (-0.05, -0.36, 0.25), bevel=0.03)
    block((0.36, 0.04, 0.4), 'opening', (-0.05, -0.51, 0.2), bevel=0.008)
    for x in (-0.27, 0.17):
        block((0.08, 0.09, 0.48), 'darkwood', (x, -0.53, 0.24), bevel=0.012)
    block((0.6, 0.1, 0.09), 'darkwood', (-0.05, -0.53, 0.5), bevel=0.014)
    lathe([(0.035, 0), (0.04, 0.06), (0.0, 0.08)], 'yellow', loc=(0.24, -0.58, 0.36), seg=16)
    rod(0.006, 0.05, 'black', (0.24, -0.58, 0.47))
    # rails and the cart, heaped with gold
    for x in (-0.08, 0.08):
        block((0.022, 0.36, 0.018), 'darkwood', (x + 0.3, -0.72, 0.012), bevel=0.0)
    block((0.3, 0.24, 0.15), 'brown', (0.3, -0.75, 0.13), bevel=0.025)
    for (x, y) in ((0.19, -0.64), (0.41, -0.64), (0.19, -0.86), (0.41, -0.86)):
        rod(0.045, 0.03, 'black', (x, y, 0.05), rot=(0, math.pi / 2, 0))
    for (dx, dy, r) in ((-0.07, 0.0, 0.06), (0.06, 0.03, 0.065), (0.0, -0.05, 0.055),
                        (0.08, -0.06, 0.05), (-0.08, -0.06, 0.05), (0.0, 0.02, 0.06)):
        ball(r, 'nugget', (0.3 + dx, -0.75 + dy, 0.22 + r * 0.5), scale=(1, 1, 0.8))
    flag((0.0, 0.14, 1.0), pole_h=0.42, h=0.16, w=0.22)
    return 1.9


def model_guard():
    """The castle guard as a nutcracker: shako, beard, team coat, a halberd. Stands on a base."""
    lathe([(0.27, 0), (0.27, 0.035), (0.25, 0.06), (0.0, 0.06)], 'wood', name='base')
    lathe([(0.272, 0.022), (0.272, 0.05)], 'team', name='rim')
    for x in (-0.07, 0.07):
        lathe([(0.07, 0.06), (0.07, 0.15), (0.06, 0.17), (0.0, 0.17)], 'black', loc=(x, 0, 0))
        lathe([(0.058, 0.17), (0.058, 0.36), (0.0, 0.36)], 'white', loc=(x, 0, 0))
    lathe([(0.15, 0.33), (0.17, 0.4), (0.18, 0.52), (0.16, 0.62), (0.12, 0.66), (0.0, 0.66)], 'team', name='coat')
    lathe([(0.172, 0.4), (0.178, 0.44)], 'black', name='belt')
    block((0.05, 0.02, 0.05), 'gold', (0, -0.18, 0.42), bevel=0.005)
    for z in (0.48, 0.54, 0.6):
        ball(0.012, 'gold', (0, -0.172, z))
    # head: a turned egg with a white beard and a big moustache
    lathe([(0.1, 0.65), (0.12, 0.7), (0.125, 0.8), (0.115, 0.86), (0.0, 0.88)], 'skin', name='head')
    lathe([(0.0, 0.62), (0.13, 0.66), (0.135, 0.72), (0.0, 0.76)], 'white', loc=(0, -0.025, 0),
          name='beard', scale=(1, 0.85, 1))
    ball(0.025, 'skin', (0, -0.125, 0.775), scale=(1, 1, 1))
    for x in (-0.045, 0.045):
        ball(0.04, 'white', (x, -0.115, 0.745), scale=(1.3, 0.7, 0.6))
        ball(0.013, 'black', (x, -0.112, 0.81))
        ball(0.018, 'pink', (x * 1.7, -0.098, 0.77), scale=(1, 0.5, 1))
    # the shako
    lathe([(0.13, 0.85), (0.13, 0.88), (0.12, 0.89), (0.125, 1.08), (0.0, 1.08)], 'black', name='shako')
    lathe([(0.122, 0.88), (0.122, 0.91)], 'gold')
    block((0.08, 0.02, 0.09), 'gold', (0, -0.122, 0.99), bevel=0.01)
    lathe([(0.0, 1.07), (0.04, 1.1), (0.035, 1.2), (0.0, 1.24)], 'white', loc=(0.05, 0, 0), name='plume')
    # arms down the sides, the right hand holding the halberd
    for x in (-0.185, 0.185):
        lathe([(0.045, 0.4), (0.05, 0.62), (0.0, 0.64)], 'team', loc=(x, 0, 0))
        ball(0.06, 'gold', (x, 0, 0.635), scale=(1, 1, 0.5))
        ball(0.04, 'skin', (x, -0.01, 0.39))
    rod(0.014, 1.0, 'wood', (0.19, -0.04, 0.6))
    lathe([(0.0, 0.0), (0.035, 0.03), (0.0, 0.16)], 'silver', loc=(0.19, -0.04, 1.08), seg=4,
          scale=(1, 0.3, 1))
    return 1.4


MODELS = {'tower': model_tower, 'barracks1': model_house, 'base': model_castle, 'mine': model_mine,
          'guard': model_guard}
UNITS = {'guard'}
# yaw (degrees) so each model shows a front and a side; units face right, the game mirrors them
YAW = {'guard': 40, 'tower': -20, 'barracks1': -32, 'base': -18, 'mine': -28}


# ---------------------------------------------------------------- scene, light, camera

def scene(span: float, unit: bool):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 96
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = RES
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    w = bpy.data.worlds.new('world')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = srgb('#e9dfcf')
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55
    # key: warm sun from the front left, soft; rim: a cool light from behind right
    key = bpy.data.objects.new('key', bpy.data.lights.new('key', 'SUN'))
    key.data.energy = 4.2
    key.data.angle = math.radians(14)
    key.data.color = (1.0, 0.95, 0.86)
    key.rotation_euler = (math.radians(48), 0, math.radians(-38))
    sc.collection.objects.link(key)
    rim = bpy.data.objects.new('rim', bpy.data.lights.new('rim', 'SUN'))
    rim.data.energy = 1.4
    rim.data.angle = math.radians(20)
    rim.data.color = (0.9, 0.95, 1.0)
    rim.rotation_euler = (math.radians(-55), 0, math.radians(-30))
    sc.collection.objects.link(rim)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    # fit the frame to the model: project every vertex onto the camera's right and up axes
    e = math.radians(ELEV)
    up = (0.0, math.sin(e), math.cos(e))
    fwd = (0.0, math.cos(e), -math.sin(e))
    dg = bpy.context.evaluated_depsgraph_get()
    xs, ys = [], []
    for o in sc.objects:
        if o.type != 'MESH':
            continue
        me = o.evaluated_get(dg).to_mesh()
        mw = o.matrix_world
        for v in me.vertices:
            p = mw @ v.co
            xs.append(p.x)
            ys.append(p.y * up[1] + p.z * up[2])
        o.evaluated_get(dg).to_mesh_clear()
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    cam.data.ortho_scale = max(max(xs) - min(xs), max(ys) - min(ys)) * 1.08
    cam.location = (cx - 10 * fwd[0], cy * up[1] - 10 * fwd[1], cy * up[2] - 10 * fwd[2])
    cam.rotation_euler = (math.pi / 2 - e, 0, 0)
    sc.collection.objects.link(cam)
    sc.camera = cam


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build(name: str, team: str, out: Path):
    clear()
    mats(team)
    span = MODELS[name]()
    root = [o for o in bpy.context.scene.objects]
    bpy.ops.object.empty_add(location=(0, 0, 0))
    pivot = bpy.context.active_object
    for o in root:
        o.parent = pivot
    pivot.rotation_euler = (0, 0, math.radians(YAW.get(name, 0)))
    bpy.context.view_layer.update()
    scene(span, name in UNITS)
    bpy.context.scene.render.filepath = str(out / f'{name}_{team}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', name, team, flush=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = Path(argv[0] if argv else 'art/pilot3d/render').resolve()
    out.mkdir(parents=True, exist_ok=True)
    names = argv[1:] or list(MODELS)
    for n in names:
        for t in ('blue', 'red'):
            build(n, t, out)


main()
