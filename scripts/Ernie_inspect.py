import bpy, math
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.wm.obj_import(filepath='public/demo/meshes/Cat.obj')
o=bpy.context.object;o.rotation_euler=(0,0,0)
print('BOUNDS',[(min(v.co[i] for v in o.data.vertices),max(v.co[i] for v in o.data.vertices)) for i in range(3)])
for p in o.data.polygons:p.use_smooth=True
m=bpy.data.materials.new('clay');m.diffuse_color=(.32,.36,.4,1);o.data.materials.clear();o.data.materials.append(m)
bpy.ops.object.camera_add(location=(1.3,-1.7,1.0));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.15))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=1.3;bpy.context.scene.camera=cam
bpy.ops.object.light_add(type='AREA',location=(1,-1,2));bpy.context.object.data.energy=150;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=3
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=16;s.world.color=(.25,.25,.25);s.render.resolution_x=900;s.render.resolution_y=700;s.render.resolution_percentage=100;s.render.filepath='public/demo/meshes/Ernie_source.png';bpy.ops.render.render(write_still=True)
