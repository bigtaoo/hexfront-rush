"""Per-model geometry fixes for tripo.py, applied right after load() and before restyling.

mine: the Tripo mine's banner (pole + blue cloth + gold emblem) is a few separate mesh islands
sitting on the summit; at 72 px they shrink to a speck. We grow those islands about the foot of
the pole so the flag reads like the old sticker art. The islands are picked by geometry, not by
index: whole connected components that lie entirely in the top ~18% of the model, near the pole
column, and are saturated (the rock is a dull brown-grey, the banner a strong blue/orange). They
are disjoint from the rock, so a rigid scale about the pole foot (buried in the summit) can't
tear anything; a short smoothstep ramp above the foot is kept anyway in case a future export
welds the pole to the rock.
"""
import colorsys

import bpy
import numpy as np

FLAG_SCALE = 2.0
TOP_FRAC = 0.80        # an island must lie entirely above this fraction of the model height
MIN_SAT = 0.40         # median texture saturation of a banner island (rock is ~0.2-0.3)
RAMP = 0.02            # height (model units) over which the scale ramps in above the pole foot


def _islands(me) -> np.ndarray:
    nv = len(me.vertices)
    parent = np.arange(nv)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    ev = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get('vertices', ev)
    for a, b in ev.reshape(-1, 2):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    return np.array([find(i) for i in range(nv)])


def _vertex_colors(me) -> np.ndarray:
    """Base-colour texture sampled at each vertex's (first) UV; grey where there's no texture."""
    nv = len(me.vertices)
    out = np.full((nv, 3), 0.5)
    if not me.uv_layers or not me.materials or not me.materials[0] or not me.materials[0].node_tree:
        return out
    img = next((n.image for n in me.materials[0].node_tree.nodes
                if n.type == 'TEX_IMAGE' and n.image), None)
    if img is None:
        return out
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    nl = len(me.loops)
    uv = np.empty(nl * 2, dtype=np.float32)
    me.uv_layers.active.data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    lv = np.empty(nl, dtype=np.int64)
    me.loops.foreach_get('vertex_index', lv)
    u = np.clip((uv[:, 0] % 1.0) * w, 0, w - 1).astype(int)
    v = np.clip((uv[:, 1] % 1.0) * h, 0, h - 1).astype(int)
    out[lv] = px[v, u, :3]
    return out


def _fix_mine(meshes: list):
    data = []
    for o in meshes:
        me = o.data
        nv = len(me.vertices)
        co = np.empty(nv * 3)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        mw = np.array(o.matrix_world)
        wco = co @ mw[:3, :3].T + mw[:3, 3]
        data.append((o, co, wco, _islands(me), _vertex_colors(me)))

    allw = np.concatenate([d[2] for d in data])
    zmin, zmax = allw[:, 2].min(), allw[:, 2].max()
    height = zmax - zmin
    ztop = zmin + TOP_FRAC * height

    # The pole column: the highest vertex in the model is the pole's finial.
    tip = allw[allw[:, 2].argmax()]
    reach = 0.30 * height   # how far from the pole the cloth may stretch in x/y

    picks = []
    for o, co, wco, lab, col in data:
        sel = np.zeros(len(co), bool)
        for root in np.unique(lab):
            m = lab == root
            p = wco[m]
            if p[:, 2].min() < ztop:
                continue
            if np.hypot(*(p[:, :2].mean(0) - tip[:2])) > reach:
                continue
            sat = np.median([colorsys.rgb_to_hsv(*c)[1] for c in col[m]])
            if sat < MIN_SAT:
                continue
            sel |= m
        picks.append(sel)

    sel_w = np.concatenate([d[2][s] for d, s in zip(data, picks)])
    if not len(sel_w):
        print('tripo_geo: mine banner not found, left as is')
        return
    # Pole foot: the lowest selected vertices, at the pole's x/y (they're the pole's bottom ring).
    zf = sel_w[:, 2].min()
    foot_ring = sel_w[sel_w[:, 2] < zf + 0.01 * height]
    base = np.array([*foot_ring[:, :2].mean(0), zf])

    ramp = RAMP * height
    for (o, co, wco, lab, col), sel in zip(data, picks):
        if not sel.any():
            continue
        p = wco[sel]
        t = np.clip((p[:, 2] - zf) / ramp, 0, 1)
        k = 1 + (FLAG_SCALE - 1) * (t * t * (3 - 2 * t))
        # Scale height fully; the ramp only eases the very foot of the pole.
        p = base + (p - base) * np.where(t[:, None] < 1, k[:, None], FLAG_SCALE)
        inv = np.array(o.matrix_world.inverted())
        co[sel] = p @ inv[:3, :3].T + inv[:3, 3]
        o.data.vertices.foreach_set('co', co.ravel())
        o.data.update()
    print(f'tripo_geo: mine banner x{FLAG_SCALE} about {np.round(base, 3)}, '
          f'{sum(int(s.sum()) for s in picks)} verts')


def fix_geometry(name: str, meshes: list):
    if name == 'mine':
        _fix_mine(meshes)
        bpy.context.view_layer.update()
