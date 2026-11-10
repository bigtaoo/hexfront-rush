"""Renders Tripo models (art/tripo/<name>.glb) with the same camera and light as toys.py.

usage: blender -b -P tools/art3d/tripo.py -- <out dir> [--toon] <name>[:yaw] ...
Writes <out dir>/<name>_{blue,red}.png at RES. With --toon the pipeline goes on with
tools/art3d/paint.py (Kuwahara: flattens the texture's grain into paint) and tools/art3d/sprite.py.
--look k=v,... overrides LOOK for a trial, --blue renders the blue side only.

Tripo bakes its colour into one texture. The model is scaled to a unit height, stood on z=0 and
centred; the reference images paint the team colour in royal blue and nothing else blue
(art/STYLE.md), so the red side moves the blue band of that texture to red, as
tools/art/team_recolor.py does for the sticker art. The paint is made matte: Tripo's own
roughness and metal maps are dropped, so one light reads the same on every model.
"""
import math
import sys
from pathlib import Path

import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
ROOT = HERE.parents[1]
from tripo_geo import fix_geometry  # noqa: E402

ELEV = 42  # buildings: high three-quarter view, as toys.py
UNIT_ELEV = 20  # units: three-quarter front view (art/STYLE.md)
RES = 800
UNITS = {'guard', 'ogre', 'militia', 'slinger', 'shield', 'bowman', 'adept', 'colossus', 'drake'}
# no team colour: rendered once as <name>.png with Tripo's own paint (tools/art/sprites.py TEAMLESS)
TEAMLESS = {'rubble', 'oak', 'pine', 'rocks', 'cactus', 'ice', 'snowpine', 'arch', 'chest', 'hoard',
            'camp', 'warband', 'mystery'}
# units face right (the game mirrors them); Tripo models face the camera at yaw 0
YAW = {'guard': -35, 'ogre': -35, 'mine': -20}
UNIT_YAW = -35  # a unit without its own entry
BLD_YAW = -20
# Tripo shapes its model for the reference's low three-quarter view; from 42 degrees a hill reads as a dome
ELEV_OF = {'mine': 26}

BAND = (190.0, 255.0)
FEATHER = 12.0
MIN_SAT = 0.28
RED_HUE = 355.0
BLUE_HUE = 224.0
# the team colour is a small share of a 40 px sprite, so both sides paint it richer and lighter than
# Tripo does: one clean royal blue / signal red instead of the texture's navy-to-sky spread
TEAM_SAT = 1.3
TEAM_VAL = 1.15
TEAM_HUE = {'blue': BLUE_HUE, 'red': RED_HUE}
TOON = False  # --toon: banded cel light in EEVEE instead of Cycles PBR


def srgb(hexstr: str):
    h = hexstr.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


def recolor(rgb: np.ndarray, hue: float, sat=TEAM_SAT, val=TEAM_VAL) -> np.ndarray:
    """team_recolor.py's hue move on an (n, 3) float array."""
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    h = np.zeros_like(mx)
    m = d > 1e-6
    rm = m & (mx == r)
    gm = m & (mx == g) & ~rm
    bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    h *= 60
    lo, hi = BAND
    w = np.clip(np.minimum(h - (lo - FEATHER), (hi + FEATHER) - h) / FEATHER, 0, 1)
    w *= np.clip((s - MIN_SAT) / 0.1, 0, 1)
    nh = np.full_like(h, hue % 360) / 60
    ns = np.clip(s * sat, 0, 1)
    nv = np.clip(mx * val, 0, 1)
    c = nv * ns
    x = c * (1 - np.abs(nh % 2 - 1))
    z = np.zeros_like(c)
    k = np.floor(nh).astype(int) % 6
    out = np.zeros_like(rgb)
    for i, (rr, gg, bb) in enumerate([(c, x, z), (x, c, z), (z, c, x), (z, x, c), (x, z, c), (c, z, x)]):
        sel = k == i
        out[sel] = np.stack([rr[sel], gg[sel], bb[sel]], -1)
    out += (nv - c)[:, None]
    return rgb * (1 - w[:, None]) + out * w[:, None]


def team_image(img, name: str, team: str):
    """A copy of the base-colour image in the team's colour.

    tools/art3d/tripo_tex.py's cleaned texture (art/tripo/tex/<name>_clean.png) stands in for
    Tripo's when it exists: same UVs, the AI blotches painted out.
    """
    clean = ROOT / 'art' / 'tripo' / 'tex' / f'{name}_clean.png'
    if clean.exists():
        src = bpy.data.images.load(str(clean))
        src.colorspace_settings.name = img.colorspace_settings.name
    else:
        src = img
    new = src.copy()
    new.name = f'{name}_{team}'
    px = np.empty(len(src.pixels), np.float32)
    src.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    px[:, :3] = recolor(px[:, :3], TEAM_HUE[team])
    new.pixels.foreach_set(px.ravel())
    new.update()
    return new


def restyle(name: str, team: str):
    """Base colour only, matte paint, the team's colour."""
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None:
            continue
        for inp in ('Roughness', 'Metallic', 'Normal'):
            for link in list(bsdf.inputs[inp].links):
                nt.links.remove(link)
        bsdf.inputs['Roughness'].default_value = 0.6
        bsdf.inputs['Metallic'].default_value = 0.0
        bsdf.inputs['Coat Weight'].default_value = 0.06
        if team is None:
            continue
        for n in nt.nodes:
            if n.type == 'TEX_IMAGE' and n.image and any(
                    l.to_socket == bsdf.inputs['Base Color'] for l in n.outputs['Color'].links):
                n.image = team_image(n.image, name, team)


# the toon look; --look k=v,k=v overrides for trials
LOOK = {
    'bands': (0.12, 0.5),        # N.L (with cast shadow) cut points: shadow | mid | lit
    'shadow': '#6a6390',         # multiplies the paint in the shadow band: a cool violet, not grey
    'mid': '#b8b0c4',
    'lit': '#fffaf0',
    # trials (art/tripo/look, 2026-11-10) that did not survive the 6x downscale to a sprite are off:
    # AO barely shows past the cast shadows; rim light rings the ink outline with a white halo;
    # subdivision splits Tripo's UV seams into white cracks; an albedo bump is invisible at 40 px
    'ao': 0.0,                   # 0..1: soft contact darkening in creases (EEVEE AO)
    'ao_dist': 0.04,             # model units (the model is 1 tall)
    'rim': 0.0,                  # 0..1: a light edge where the surface turns away from the camera
    'spec': 1.0,                 # 0..1: a hard glint on metal (art/tripo/tex/<name>_spec.png)
    'subd': 0,                   # Catmull-Clark levels: rounds Tripo's 10k-triangle facets
    'bump': 0.0,                 # bump from the paint's luminance (Tripo exports no normal map)
    'sat': 1.18,
    'val': 1.08,
}


def look_arg(text: str):
    for kv in filter(None, text.split(',')):
        k, v = kv.split('=')
        old = LOOK[k]
        if isinstance(old, tuple):
            LOOK[k] = tuple(float(x) for x in v.split('/'))
        elif isinstance(old, str):
            LOOK[k] = '#' + v.lstrip('#')
        else:
            LOOK[k] = type(old)(float(v))


def _mix(nt, mode, a, b, fac=1.0):
    m = nt.nodes.new('ShaderNodeMix')
    m.data_type = 'RGBA'
    m.blend_type = mode
    if isinstance(fac, float):
        m.inputs['Factor'].default_value = fac
    else:
        nt.links.new(fac, m.inputs['Factor'])
    for sock, v in ((m.inputs['A'], a), (m.inputs['B'], b)):
        if isinstance(v, tuple):
            sock.default_value = v
        else:
            nt.links.new(v, sock)
    return m.outputs['Result']


def _math(nt, op, a, b):
    m = nt.nodes.new('ShaderNodeMath')
    m.operation = op
    for sock, v in zip(m.inputs, (a, b)):
        if isinstance(v, float):
            sock.default_value = v
        else:
            nt.links.new(v, sock)
    return m.outputs['Value']


def _lum(nt, shader):
    """Shader to RGB, then its luminance."""
    rgb = nt.nodes.new('ShaderNodeShaderToRGB')
    nt.links.new(shader, rgb.inputs['Shader'])
    bw = nt.nodes.new('ShaderNodeRGBToBW')
    nt.links.new(rgb.outputs['Color'], bw.inputs['Color'])
    return bw.outputs['Val']


def toonify(name: str):
    """Cel paint: the key light alone, cut into three flat bands that multiply the paint.

    Tripo's soft PBR shading is what reads as "3D asset" on a 40 px sprite; banded light reads as paint.
    Shadows take a cool hue instead of grey (grey multiplies the paint into mud); optional extras are
    LOOK's ao / rim / spec. Shader to RGB needs EEVEE.
    """
    spec_png = ROOT / 'art' / 'tripo' / 'tex' / f'{name}_spec.png'
    spec_img = bpy.data.images.load(str(spec_png)) if LOOK['spec'] > 0 and spec_png.exists() else None
    if spec_img is not None:
        spec_img.colorspace_settings.name = 'Non-Color'
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        nt = mat.node_tree
        N, L = nt.nodes.new, nt.links.new
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
        if bsdf is None or out is None:
            continue
        src = bsdf.inputs['Base Color'].links[0].from_socket if bsdf.inputs['Base Color'].links else None
        hsv = N('ShaderNodeHueSaturation')
        hsv.inputs['Saturation'].default_value = LOOK['sat']
        hsv.inputs['Value'].default_value = LOOK['val']
        if src is not None:
            L(src, hsv.inputs['Color'])
        else:
            hsv.inputs['Color'].default_value = bsdf.inputs['Base Color'].default_value
        normal = None
        if LOOK['bump'] > 0 and src is not None:
            bump = N('ShaderNodeBump')
            bump.inputs['Strength'].default_value = LOOK['bump']
            bump.inputs['Distance'].default_value = 0.004
            gray = N('ShaderNodeRGBToBW')
            L(src, gray.inputs['Color'])
            L(gray.outputs['Val'], bump.inputs['Height'])
            normal = bump.outputs['Normal']
        # white diffuse under a sun of strength pi: the value is N.L times the cast shadow
        dif = N('ShaderNodeBsdfDiffuse')
        dif.inputs['Color'].default_value = (1, 1, 1, 1)
        if normal is not None:
            L(normal, dif.inputs['Normal'])
        ramp = N('ShaderNodeValToRGB')
        ramp.color_ramp.interpolation = 'CONSTANT'
        el = ramp.color_ramp.elements
        el[0].position, el[0].color = 0.0, srgb(LOOK['shadow'])
        el[1].position, el[1].color = LOOK['bands'][0], srgb(LOOK['mid'])
        el.new(LOOK['bands'][1]).color = srgb(LOOK['lit'])
        L(_lum(nt, dif.outputs['BSDF']), ramp.inputs['Fac'])
        col = _mix(nt, 'MULTIPLY', hsv.outputs['Color'], ramp.outputs['Color'])
        if LOOK['ao'] > 0:
            ao = N('ShaderNodeAmbientOcclusion')
            ao.inputs['Distance'].default_value = LOOK['ao_dist']
            ao.samples = 16
            aor = N('ShaderNodeValToRGB')  # creases only: open surfaces stay untouched
            aor.color_ramp.elements[0].position = 0.35
            aor.color_ramp.elements[0].color = srgb(LOOK['shadow'])
            aor.color_ramp.elements[1].position = 0.85
            L(ao.outputs['AO'], aor.inputs['Fac'])
            col = _mix(nt, 'MULTIPLY', col, aor.outputs['Color'], LOOK['ao'])
        if LOOK['rim'] > 0:
            lw = N('ShaderNodeLayerWeight')
            lw.inputs['Blend'].default_value = 0.25
            edge = _math(nt, 'GREATER_THAN', lw.outputs['Facing'], 0.8)
            col = _mix(nt, 'SCREEN', col, srgb('#fff4dc'), _math(nt, 'MULTIPLY', edge, LOOK['rim']))
        if spec_img is not None:
            gl = N('ShaderNodeBsdfGlossy')
            gl.inputs['Color'].default_value = (1, 1, 1, 1)
            gl.inputs['Roughness'].default_value = 0.3
            if normal is not None:
                L(normal, gl.inputs['Normal'])
            tex = N('ShaderNodeTexImage')
            tex.image = spec_img
            glint = _math(nt, 'GREATER_THAN', _lum(nt, gl.outputs['BSDF']), 1.2)
            fac = _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', glint, tex.outputs['Color']), LOOK['spec'])
            col = _mix(nt, 'MIX', col, srgb('#fffbe8'), fac)
        em = N('ShaderNodeEmission')
        L(col, em.inputs['Color'])
        L(em.outputs['Emission'], out.inputs['Surface'])


def load(glb: Path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in meshes:
        for p in o.data.polygons:
            p.use_smooth = True
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    k = 1.0 / (hi[2] - lo[2])
    bpy.ops.object.empty_add(location=(0, 0, 0))
    pivot = bpy.context.active_object
    for o in bpy.context.scene.objects:
        if o is not pivot and o.parent is None:
            o.parent = pivot
    # centre on x/y, feet on z=0, unit height
    pivot.scale = (k, k, k)
    pivot.location = (-(lo[0] + hi[0]) / 2 * k, -(lo[1] + hi[1]) / 2 * k, -lo[2] * k)
    bpy.context.view_layer.update()
    top = bpy.data.objects.new('turn', None)
    bpy.context.scene.collection.objects.link(top)
    pivot.parent = top
    return top


def scene(elev: float):
    sc = bpy.context.scene
    if TOON:
        sc.render.engine = 'BLENDER_EEVEE'
        sc.eevee.taa_render_samples = 32
    else:
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
    if TOON:  # the bands are cut from the key light's N.L, so nothing else may light the model
        w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
    key = bpy.data.objects.new('key', bpy.data.lights.new('key', 'SUN'))
    key.data.energy = math.pi if TOON else 4.2
    key.data.angle = math.radians(14)
    key.data.color = (1.0, 0.95, 0.86)
    key.rotation_euler = (math.radians(48), 0, math.radians(-38))
    sc.collection.objects.link(key)
    rim = bpy.data.objects.new('rim', bpy.data.lights.new('rim', 'SUN'))
    rim.data.energy = 1.4
    rim.data.angle = math.radians(20)
    rim.data.color = (0.9, 0.95, 1.0)
    rim.rotation_euler = (math.radians(-55), 0, math.radians(-30))
    if not TOON:
        sc.collection.objects.link(rim)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    e = math.radians(elev)
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


DEPTH0, DEPTH_SPAN = 9.0, 2.0  # the camera stands 10 from the unit-sized model


def render_pass(path: Path):
    """Geometry for tools/art3d/sprite.py's inner lines, in a linear 16-bit PNG: R, G = the
    camera-space normal's x, y (0.5 + n / 2) and B = the depth along the view, (z - DEPTH0) / DEPTH_SPAN."""
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        nt = mat.node_tree
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
        if out is None:
            continue
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        vt = nt.nodes.new('ShaderNodeVectorTransform')
        vt.vector_type, vt.convert_from, vt.convert_to = 'NORMAL', 'WORLD', 'CAMERA'
        nt.links.new(geo.outputs['Normal'], vt.inputs['Vector'])
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(vt.outputs['Vector'], sep.inputs['Vector'])
        cam = nt.nodes.new('ShaderNodeCameraData')
        comb = nt.nodes.new('ShaderNodeCombineXYZ')
        for i, sock in enumerate((sep.outputs['X'], sep.outputs['Y'], cam.outputs['View Z Depth'])):
            m = nt.nodes.new('ShaderNodeMath')
            m.operation = 'MULTIPLY_ADD'
            nt.links.new(sock, m.inputs[0])
            if i < 2:
                m.inputs[1].default_value, m.inputs[2].default_value = 0.5, 0.5
            else:
                m.inputs[1].default_value, m.inputs[2].default_value = 1 / DEPTH_SPAN, -DEPTH0 / DEPTH_SPAN
            nt.links.new(m.outputs['Value'], comb.inputs[i])
        em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(comb.outputs['Vector'], em.inputs['Color'])
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    sc = bpy.context.scene
    sc.view_settings.view_transform = 'Raw'
    sc.render.image_settings.color_depth = '16'
    sc.render.filter_size = 0.5  # keep edges crisp: a blended normal is no normal
    path.parent.mkdir(parents=True, exist_ok=True)
    sc.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def build(name: str, yaw: float, team, out: Path):
    """One render; team None keeps the model's own paint and names the file <name>.png."""
    top = load(ROOT / 'art' / 'tripo' / f'{name}.glb')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    fix_geometry(name, meshes)
    if LOOK['subd'] > 0:
        for o in meshes:
            m = o.modifiers.new('subd', 'SUBSURF')
            m.levels = m.render_levels = LOOK['subd']
    restyle(name, team)
    if TOON:
        toonify(name)
    top.rotation_euler = (0, 0, math.radians(yaw))
    bpy.context.view_layer.update()
    scene(ELEV_OF.get(name, UNIT_ELEV if name in UNITS else ELEV))
    fname = f'{name}_{team}.png' if team else f'{name}.png'
    bpy.context.scene.render.filepath = str(out / fname)
    bpy.ops.render.render(write_still=True)
    if TOON:
        render_pass(out / 'passes' / fname)
    print('rendered', name, team, flush=True)


def main():
    global TOON
    argv = sys.argv[sys.argv.index('--') + 1:]
    if '--toon' in argv:
        argv.remove('--toon')
        TOON = True
    if '--look' in argv:
        i = argv.index('--look')
        look_arg(argv[i + 1])
        del argv[i:i + 2]
    teams = ('blue', 'red')
    if '--blue' in argv:
        argv.remove('--blue')
        teams = ('blue',)
    out = Path(argv[0]).resolve()
    out.mkdir(parents=True, exist_ok=True)
    for arg in argv[1:]:
        name, _, yaw = arg.partition(':')
        yaw = float(yaw) if yaw else YAW.get(name, UNIT_YAW if name in UNITS else BLD_YAW)
        for t in ((None,) if name in TEAMLESS else teams):
            build(name, yaw, t, out)


main()
