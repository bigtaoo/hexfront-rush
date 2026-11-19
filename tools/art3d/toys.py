"""Wooden-toy pilot: builds Erzgebirge-style turned-wood models in code and renders them as sprites.

usage: blender -b -P tools/art3d/toys.py -- <out dir> [name ...]
Every model is made of the turned-wood primitives in prim.py; the buildings live in builds.py and
the troops in troops.py. One
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
from prim import mats, srgb                                                  # noqa: E402
import builds                                                               # noqa: E402
import props                                                                # noqa: E402
import troops                                                               # noqa: E402

ELEV = 42       # camera elevation for props, degrees
UNIT_ELEV = 18  # troops are seen from only slightly above (refs.py COMP vs COMP_HIGH)
RES = 800  # render size in pixels (square); the sprite step trims and shrinks it


# ------------------------------------------------- the cast: buildings + troops, merged

MODELS = dict(builds.MODELS)
MODELS.update(props.MODELS)
MODELS.update(troops.MODELS)
UNITS = set(troops.MODELS)
TEAMLESS = builds.TEAMLESS | props.TEAMLESS
ELEVS = {**builds.ELEVS, **props.ELEVS}
YAW = {**builds.YAW, **props.YAW, **troops.YAW}


# ---------------------------------------------------------------- scene, light, camera

def scene(span: float, elev: float, fit, grow: float = 1.0):
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
    e = math.radians(elev)
    up, fwd = (0.0, math.sin(e), math.cos(e)), (0.0, math.cos(e), -math.sin(e))
    x0, x1, y0, y1 = fit
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    cam.data.ortho_scale = max(x1 - x0, y1 - y0) * 1.08 * grow
    cam.location = (cx - 10 * fwd[0], cy * up[1] - 10 * fwd[1], cy * up[2] - 10 * fwd[2])
    cam.rotation_euler = (math.pi / 2 - e, 0, 0)
    sc.collection.objects.link(cam)
    sc.camera = cam


def extent(elev: float):
    """The model's box in camera axes: every vertex projected onto the camera's right and up."""
    e = math.radians(elev)
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
    if kind == 'd':
        # a piece going over backwards on its heels swings its back under the board: set it
        # down on whatever part of it is lowest, so the fallen frames lie on the boards the
        # standing ones stand on
        pivot.location = (0, 0, lift - min(0.0, floor_z()))
        bpy.context.view_layer.update()
    return span


def floor_z() -> float:
    """The lowest point of the posed model, in world z."""
    dg = bpy.context.evaluated_depsgraph_get()
    lo = 0.0
    for o in bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        for v in me.vertices:
            lo = min(lo, (o.matrix_world @ v.co).z)
        ev.to_mesh_clear()
    return lo


def build(name: str, team: str, out: Path, kind=None):
    """Render one still, or a whole cycle of frames under one frozen camera."""
    n = pose.CYCLES[kind][1] if kind else 1
    unit = name in UNITS
    elev = float(os.environ.get('HF_ELEV') or
                 (UNIT_ELEV if unit else ELEVS.get(name, ELEV)))
    fit = None
    for i in range(n):          # fit the camera once, over every frame: else the piece resizes
        assemble(name, team, kind, i)
        x0, x1, y0, y1 = extent(elev)
        fit = (x0, x1, y0, y1) if fit is None else (min(fit[0], x0), max(fit[1], x1),
                                                    min(fit[2], y0), max(fit[3], y1))
    grow = 1.0
    if kind:
        # EVERY cycle is drawn at the still's own scale and centre, never at its own box's. The
        # board cuts straight from the still into a walk, a swing, a turn or a death frame, and
        # sprite.py lines a group's frames up by their canvas centres and scales them all by one
        # factor solved on the still - so a cycle fitted to its own box comes out both shifted
        # (its box's centre is not the still's) and shrunk (its box is wider, so a world unit is
        # fewer pixels). That is the walk sliding off the coordinate it stands on. A pose that
        # reaches wider than the still (a drake turning its wingspan towards us, a club at the
        # top of its swing, anything lying down) gets a wider film instead of a smaller model.
        assemble(name, team, None, 0)
        sx0, sx1, sy0, sy1 = extent(elev)
        cx, cy = (sx0 + sx1) / 2, (sy0 + sy1) / 2
        half = max(sx1 - sx0, sy1 - sy0) * 1.08 / 2
        grow = max(1.0, max(abs(fit[0] - cx), abs(fit[1] - cx)) / half,
                   max(abs(fit[2] - cy), abs(fit[3] - cy)) / half)
        fit = (sx0, sx1, sy0, sy1)
    for i in range(n):
        span = assemble(name, team, kind, i)
        scene(span, elev, fit, grow)
        tag = f'_{kind}{i}' if kind else ''
        # a ruin or a tree has no owner, and the atlas wants it under its bare name
        stem = f'{name}{tag}' if name in TEAMLESS else f'{name}_{team}{tag}'
        sc = bpy.context.scene
        sc.render.filepath = str(out / f'{stem}.png')
        bpy.ops.render.render(write_still=True)
        render_pass(out / 'passes' / f'{stem}.png')
        print('rendered', name, team, tag, flush=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = Path(argv[0] if argv else 'art/pilot3d/render').resolve()
    out.mkdir(parents=True, exist_ok=True)
    names = argv[1:] or list(MODELS)
    for n in names:
        n, _, kind = n.partition('@')        # "militia@w": the walk cycle instead of a still
        teams = os.environ.get('HF_TEAMS', 'blue,red').split(',')
        for t in (teams[:1] if n in TEAMLESS else teams):
            build(n, t, out, kind or None)


main()
