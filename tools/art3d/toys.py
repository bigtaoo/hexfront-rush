"""Wooden-toy pilot: builds Erzgebirge-style turned-wood models in code and renders them as sprites.

usage: blender -b -P tools/art3d/toys.py -- <out dir> [name ...]
Every model is made of the turned-wood primitives in prim.py; the troops live in troops.py. One
camera, one light rig and one set of materials for everything, so all sprites share a hand. Each
model renders once per team: only the team paint changes. The camera looks down at ELEV degrees,
orthographic, on a transparent film.
"""
import math
import os
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).parent))
from geopass import render_pass                                              # noqa: E402
import pose                                                                 # noqa: E402
from prim import (ball, block, flag, lathe, mats, prism, rod, srgb,          # noqa: E402
                  windows)
import troops                                                               # noqa: E402

ELEV = 42       # camera elevation for buildings and props, degrees
UNIT_ELEV = 18  # troops are seen from only slightly above (refs.py COMP vs COMP_HIGH)
RES = 800  # render size in pixels (square); the sprite step trims and shrinks it


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


MODELS = {'tower': model_tower, 'barracks1': model_house, 'base': model_castle,
          'mine': model_mine}
MODELS.update(troops.MODELS)
UNITS = set(troops.MODELS)
# yaw (degrees) so each model shows a front and a side; units face right, the game mirrors them
YAW = {'tower': -20, 'barracks1': -32, 'base': -18, 'mine': -28, **troops.YAW}
# HF_YAW="militia=34" turns one model for a trial render without touching the table above
for _kv in filter(None, os.environ.get('HF_YAW', '').split(',')):
    _k, _, _v = _kv.partition('=')
    YAW[_k] = float(_v)


# ---------------------------------------------------------------- scene, light, camera

def scene(span: float, unit: bool, fit, grow: float = 1.0):
    """Light and frame one model. `grow` widens the film about the same centre at the same
    scale - a wider pose gets more canvas, never a smaller model (see build())."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 96
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = round(RES * grow)
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    w = bpy.data.worlds.new('world')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = srgb('#e9dfcf')
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.34
    # key: warm sun from the front left, soft; rim: a cool light from behind right
    key = bpy.data.objects.new('key', bpy.data.lights.new('key', 'SUN'))
    key.data.energy = 4.9
    key.data.angle = math.radians(14)
    key.data.color = (1.0, 0.95, 0.86)
    key.rotation_euler = (math.radians(48), 0, math.radians(-38))
    sc.collection.objects.link(key)
    rim = bpy.data.objects.new('rim', bpy.data.lights.new('rim', 'SUN'))
    rim.data.energy = 1.15
    rim.data.angle = math.radians(20)
    rim.data.color = (0.9, 0.95, 1.0)
    rim.rotation_euler = (math.radians(-55), 0, math.radians(-30))
    sc.collection.objects.link(rim)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    e = math.radians(UNIT_ELEV if unit else ELEV)
    up, fwd = (0.0, math.sin(e), math.cos(e)), (0.0, math.cos(e), -math.sin(e))
    x0, x1, y0, y1 = fit
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    cam.data.ortho_scale = max(x1 - x0, y1 - y0) * 1.08 * grow
    cam.location = (cx - 10 * fwd[0], cy * up[1] - 10 * fwd[1], cy * up[2] - 10 * fwd[2])
    cam.rotation_euler = (math.pi / 2 - e, 0, 0)
    sc.collection.objects.link(cam)
    sc.camera = cam


def extent(unit: bool):
    """The model's box in camera axes: every vertex projected onto the camera's right and up."""
    e = math.radians(UNIT_ELEV if unit else ELEV)
    up = (0.0, math.sin(e), math.cos(e))
    dg = bpy.context.evaluated_depsgraph_get()
    xs, ys = [], []
    for o in bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        mw = o.matrix_world
        for v in me.vertices:
            p = mw @ v.co
            xs.append(p.x)
            ys.append(p.y * up[1] + p.z * up[2])
        ev.to_mesh_clear()
    return min(xs), max(xs), min(ys), max(ys)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def assemble(name: str, team: str, kind, i: int) -> float:
    """Build the model, pose it for one frame of a cycle, and turn it to face the camera."""
    clear()
    mats(team)
    span = MODELS[name]()
    groups: dict = {}
    for o in bpy.context.scene.objects:
        groups.setdefault(o.get('grp') or 'body', []).append(o)
    lift = pose.apply(groups, kind, i, name) if kind else 0.0
    loose = [o for o in bpy.context.scene.objects if o.parent is None]
    bpy.ops.object.empty_add(location=(0, 0, 0))
    pivot = bpy.context.active_object
    for o in loose:
        if o is not pivot:
            o.parent = pivot
    pivot.location = (0, 0, lift)
    pivot.rotation_euler = (0, 0, math.radians(YAW.get(name, 0) * pose.yaw_mul(kind, i)))
    bpy.context.view_layer.update()
    return span


def build(name: str, team: str, out: Path, kind=None):
    """Render one still, or a whole cycle of frames under one frozen camera."""
    n = pose.CYCLES[kind][1] if kind else 1
    unit = name in UNITS
    fit = None
    for i in range(n):          # fit the camera once, over every frame: else the piece resizes
        assemble(name, team, kind, i)
        x0, x1, y0, y1 = extent(unit)
        fit = (x0, x1, y0, y1) if fit is None else (min(fit[0], x0), max(fit[1], x1),
                                                    min(fit[2], y0), max(fit[3], y1))
    grow = 1.0
    if kind == 't':
        # the board cuts straight from the still into a turn frame, so these are drawn at the
        # still's own scale and centre, or the piece would jump a size mid-swing. A pose that
        # reaches wider than the still (a drake turning its wingspan towards us) gets a wider
        # film instead of a smaller model; sprite.py lines the canvases up by their centres.
        assemble(name, team, None, 0)
        sx0, sx1, sy0, sy1 = extent(unit)
        cx, cy = (sx0 + sx1) / 2, (sy0 + sy1) / 2
        half = max(sx1 - sx0, sy1 - sy0) * 1.08 / 2
        grow = max(1.0, max(abs(fit[0] - cx), abs(fit[1] - cx)) / half,
                   max(abs(fit[2] - cy), abs(fit[3] - cy)) / half)
        fit = (sx0, sx1, sy0, sy1)
    for i in range(n):
        span = assemble(name, team, kind, i)
        scene(span, unit, fit, grow)
        tag = f'_{kind}{i}' if kind else ''
        sc = bpy.context.scene
        sc.render.filepath = str(out / f'{name}_{team}{tag}.png')
        bpy.ops.render.render(write_still=True)
        render_pass(out / 'passes' / f'{name}_{team}{tag}.png')
        print('rendered', name, team, tag, flush=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = Path(argv[0] if argv else 'art/pilot3d/render').resolve()
    out.mkdir(parents=True, exist_ok=True)
    names = argv[1:] or list(MODELS)
    for n in names:
        n, _, kind = n.partition('@')        # "militia@w": the walk cycle instead of a still
        for t in os.environ.get('HF_TEAMS', 'blue,red').split(','):
            build(n, t, out, kind or None)


main()
