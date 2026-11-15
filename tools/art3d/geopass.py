"""The geometry pass tools/art3d/sprite.py inks its inner lines from.

Renders the scene a second time with every material replaced by an emission of
R, G = the camera-space normal's x, y (0.5 + n / 2) and B = the depth along the view,
(z - DEPTH0) / DEPTH_SPAN, in a linear 16-bit PNG. Both tools/art3d/tripo.py and
tools/art3d/toys.py stand their camera 10 units from a unit-sized model, so the same
depth window fits both. Call it after the beauty render: it edits the materials.
"""
from pathlib import Path

import bpy

DEPTH0, DEPTH_SPAN = 9.0, 2.0


def render_pass(path: Path):
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
