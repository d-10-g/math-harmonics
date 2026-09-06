"""Rebuild Ernie from Cat.obj using Blender 5.x. Run from repository root."""
import bpy, math, json, os
from mathutils import Vector
from math import sin, pi
ROOT=os.getcwd(); OUT=os.path.join(ROOT,'public/demo/meshes'); MASTER=OUT
os.makedirs(OUT,exist_ok=True);os.makedirs(MASTER,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.wm.obj_import(filepath=os.path.join(ROOT,'public/demo/meshes/Cat.obj'))
body=bpy.context.object;body.name='Ernie';body.rotation_euler=(0,0,0)
# Keep original topology; soften the silhouette once for deformation.
mod=body.modifiers.new('Silhouette refinement','SUBSURF');mod.levels=1
bpy.ops.object.modifier_apply(modifier=mod.name)
for v in body.data.vertices:
    if v.co.y < -.22 and v.co.z > .235:
        w=min(1,(-v.co.y-.22)/.07);v.co.x*=1+.18*w;v.co.z=.30+(v.co.z-.30)*(1+.14*w)
for p in body.data.polygons:p.use_smooth=True
# Paint a UV-baked coat: white socks and bib, asymmetric blaze and black moustache.
col=body.data.color_attributes.new(name='CoatPaint',type='FLOAT_COLOR',domain='CORNER')
for p in body.data.polygons:
    for li in p.loop_indices:
        x,y,z=body.data.vertices[body.data.loops[li].vertex_index].co
        white=z<(.047 if y<0 else .034)
        white |= y<-.15 and .09<z<.252 and abs(x)<(.049 if z>.16 else .032)
        white |= y<-.304 and .274<z<.326 and abs(x)<.058
        white |= y<-.32 and .30<z<.38 and abs(x-.004)<max(.003,.019-(z-.30)*.22)
        moustache=y<-.333 and ((x+.018)**2/.019**2+(z-.311)**2/.011**2<1 or (x-.014)**2/.023**2+(z-.315)**2/.013**2<1)
        white &= not moustache
        n=(sin(x*1800+y*950+z*760)*sin(z*2150-x*500))*.015
        c=(.82+n,.80+n,.74+n,1) if white else (.002+n*.04,.003+n*.04,.005+n*.04,1)
        col.data[li].color=c
mat=bpy.data.materials.new('Ernie • painted tuxedo coat');mat.use_nodes=True
nodes=mat.node_tree.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');em=nodes.new('ShaderNodeEmission');vc=nodes.new('ShaderNodeVertexColor');vc.layer_name='CoatPaint';mat.node_tree.links.new(vc.outputs['Color'],em.inputs[0]);mat.node_tree.links.new(em.outputs[0],out.inputs[0]);body.data.materials.clear();body.data.materials.append(mat)
bpy.context.view_layer.objects.active=body;body.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.018);bpy.ops.object.mode_set(mode='OBJECT')
tex=bpy.data.images.new('Ernie_Coat',width=1024,height=1024);texnode=nodes.new('ShaderNodeTexImage');texnode.image=tex;nodes.active=texnode
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=8;s.render.bake.margin=12;bpy.ops.object.bake(type='EMIT')
tex.filepath_raw=os.path.join(OUT,'Ernie_BaseColor.png');tex.file_format='PNG';tex.save()
bs=nodes.new('ShaderNodeBsdfPrincipled');bs.inputs['Roughness'].default_value=.78;bs.inputs['Specular IOR Level'].default_value=.18;mat.node_tree.links.new(texnode.outputs['Color'],bs.inputs['Base Color']);mat.node_tree.links.new(bs.outputs[0],out.inputs[0]);nodes.remove(em);nodes.remove(vc)
# Named deformation controls, with explicit region weights on the original mesh.
bones={'root':((0,0,.08),(0,0,.15),None),'spine':((0,.14,.23),(0,-.15,.27),'root'),'head':((0,-.20,.28),(0,-.32,.32),'spine'), 'jaw':((0,-.285,.279),(0,-.35,.272),'head')}
for side,x in [('L',.065),('R',-.065)]:
    for end,y in [('front',-.16),('back',.19)]:
        bones[f'{end}_{side}']=((x,y,.23),(x,y,.085),'spine')
        bones[f'paw_{end}_{side}']=((x,y,.07),(x,y-.04,.025),f'{end}_{side}')
    bones[f'ear_{side}']=((x*.8,-.26,.36),(x*.95,-.255,.43),'head')
    bones[f'eye_{side}']=((x*.76,-.325,.329),(x*.76,-.345,.329),'head')
for i in range(4):bones[f'tail_{i}']=((0,.26+i*.092,.29+i*.01),(0,.352+i*.092,.30+i*.01),'spine' if i==0 else f'tail_{i-1}')
bpy.ops.object.select_all(action='DESELECT');bpy.ops.object.armature_add();rig=bpy.context.object;rig.name='Ernie_Rig';bpy.ops.object.mode_set(mode='EDIT');rig.data.edit_bones.remove(rig.data.edit_bones[0])
for name,(a,b,parent) in bones.items():
    bone=rig.data.edit_bones.new(name);bone.head=a;bone.tail=b
    if parent:bone.parent=rig.data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True
for name in bones:body.vertex_groups.new(name=name)
for v in body.data.vertices:
    x,y,z=v.co;side='L' if x>0 else 'R';weights={'spine':1}
    if y>.29 and z>.24:
        u=max(0,min(3,(y-.29)/.092));a=int(u);b=min(3,a+1);weights={f'tail_{a}':1-(u-a)}
        if b!=a:weights[f'tail_{b}']=u-a
    elif y<-.225 and z>.245:
        h=max(0,min(1,(-y-.225)/.045));weights={'head':h,'spine':1-h}
        if z>.369:weights={f'ear_{side}':min(1,(z-.369)/.035),'head':1-min(1,(z-.369)/.035)}
        elif z<.28 and y<-.31:weights={'jaw':.8,'head':.2}
    elif z<.20:
        end='front' if y<.02 else 'back';w=min(1,(.20-z)/.06);paw=max(0,min(1,(.075-z)/.035));weights={'spine':1-w,f'{end}_{side}':w*(1-paw),f'paw_{end}_{side}':w*paw}
    for name,w in weights.items():
        if w>0:body.vertex_groups[name].add([v.index],w,'REPLACE')
parts=[body]
def material(name,color,rough=.5):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;return m
iris=material('Pale sage gold iris',(.43,.52,.27),.28);black=material('Nose and pupils',(.004,.006,.008),.25);white=material('Ivory whiskers',(.75,.73,.66),.6);pink=material('Warm inner ears',(.17,.10,.12),.8)
def bind(obj,bone):
    g=obj.vertex_groups.new(name=bone);g.add(list(range(len(obj.data.vertices))),1,'REPLACE');parts.append(obj)
def ball(name,loc,scale,mat,bone):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    bind(o,bone);return o
for side,k in [('L',1),('R',-1)]:
    ball('Sage eye '+side,(k*.043,-.337,.358),(.016,.0072,.0144),iris,'eye_'+side)
    ball('Slit pupil '+side,(k*.043,-.345,.359),(.0032,.0016,.0112),black,'eye_'+side)
    ball('Catchlight '+side,(k*.040,-.348,.364),(.0024,.0016,.0024),white,'eye_'+side)
    # Fine tapered whisker strands, attached to head control.
    for j in range(5):
        a=Vector((k*.032,-.349,.285+j*.003));b=Vector((k*(.119+.007*sin(j)),-.351-j*.007,.265+j*.012))
        bpy.ops.mesh.primitive_cone_add(vertices=5,radius1=.0008,radius2=.0002,depth=(b-a).length,location=(a+b)/2);o=bpy.context.object;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();o.data.materials.append(white);bind(o,'head')
ball('Black nose',(0,-.368,.304),(.012,.007,.007),black,'head')
# Join details into one skinned mesh, retaining UVs and materials.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=body;bpy.ops.object.join();arm=body.modifiers.new('Ernie deformation','ARMATURE');arm.object=rig;body.parent=rig
# 32 distinct short gestures. Clips return to rest and loop while held.
gestures=[('Head nod',{'head':(0,.20)}),('Look left',{'head':(1,.28)}),('Look right',{'head':(1,-.28)}),('Head tilt left',{'head':(2,.22)}),('Head tilt right',{'head':(2,-.22)}),('Chin lift',{'head':(0,-.16)}),('Sniff',{'head':(0,.07),'jaw':(0,.08)}),('Meow',{'jaw':(0,.24)}),('Left ear flick',{'ear_L':(2,.3)}),('Right ear flick',{'ear_R':(2,-.3)}),('Ears perk',{'ear_L':(0,.22),'ear_R':(0,.22)}),('Ears relax',{'ear_L':(2,.22),'ear_R':(2,-.22)}),('Left paw tap',{'paw_front_L':(0,.4)}),('Right paw tap',{'paw_front_R':(0,.4)}),('Left paw lift',{'front_L':(0,-.35)}),('Right paw lift',{'front_R':(0,-.35)}),('Left paw reach',{'front_L':(0,-.55),'paw_front_L':(0,.25)}),('Right paw reach',{'front_R':(0,-.55),'paw_front_R':(0,.25)}),('Knead left',{'front_L':(0,-.22),'paw_front_R':(0,.2)}),('Knead right',{'front_R':(0,-.22),'paw_front_L':(0,.2)}),('Back left step',{'back_L':(0,.25)}),('Back right step',{'back_R':(0,.25)}),('Back left toe',{'paw_back_L':(0,.35)}),('Back right toe',{'paw_back_R':(0,.35)}),('Tail left',{'tail_0':(0,.25),'tail_1':(0,.15)}),('Tail right',{'tail_0':(0,-.25),'tail_1':(0,-.15)}),('Tail tip curl',{'tail_2':(2,.38),'tail_3':(2,.38)}),('Tail ripple',{'tail_1':(0,.25),'tail_2':(2,.25),'tail_3':(0,-.25)}),('Shoulder sway',{'spine':(2,.08),'head':(2,-.08)}),('Blink',{}),('Wink left',{}),('Wink right',{})]
manifest=[]
for index,(name,controls) in enumerate(gestures):
    rig.animation_data_create();action=bpy.data.actions.new(f'{index+1:02d}_{name.replace(" ","_")}');rig.animation_data.action=action
    for frame in (1,7,13,19,25):
        t=(frame-1)/24;v=sin(pi*t)**2
        for bone in rig.pose.bones:
            bone.rotation_mode='XYZ';bone.rotation_euler=(0,0,0);bone.scale=(1,1,1)
            if bone.name in controls:
                axis,amount=controls[bone.name];bone.rotation_euler[axis]=amount*v*1.65
            if (index==29 and bone.name.startswith('eye_')) or (index==30 and bone.name=='eye_L') or (index==31 and bone.name=='eye_R'):bone.scale.z=1-.92*v
            bone.keyframe_insert('rotation_euler',frame=frame,group=bone.name);bone.keyframe_insert('scale',frame=frame,group=bone.name)
    track=rig.animation_data.nla_tracks.new();track.name=action.name;strip=track.strips.new(action.name,1,action);track.mute=True
    manifest.append({'index':index,'name':name,'clip':action.name,'duration':1})
rig.animation_data.action=None
for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.scale=(1,1,1)
s.frame_set(1);s.render.fps=24
# Export animated GLB and material-preserving static OBJ.
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'Ernie_model.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_action_filter=False,export_force_sampling=True)
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
bpy.ops.wm.obj_export(filepath=os.path.join(OUT,'Ernie_model.obj'),export_selected_objects=True,export_materials=True,path_mode='COPY',forward_axis='NEGATIVE_Z',up_axis='Y')
with open(os.path.join(OUT,'Ernie_movements.json'),'w') as f:json.dump(manifest,f,indent=2)
# Studio preview and saved editing scene.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.003));floor=bpy.context.object;floor.name='Studio floor';floor.data.materials.append(material('Studio stone',(.085,.11,.125),.85))
def aim(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(.85,-1.5,.78));cam=bpy.context.object;aim(cam,(0,.05,.21));cam.data.type='ORTHO';cam.data.ortho_scale=1.18;s.camera=cam
for loc,power,size in [((.5,-.8,1.4),75,1),((-.8,-.4,.6),45,1),((.3,.8,1),100,.8)]:
    bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;aim(light,(0,0,.2))
s.world.color=(.16,.16,.16);s.cycles.samples=48;s.render.resolution_x=1200;s.render.resolution_y=1000;s.render.resolution_percentage=100
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
s.frame_end=25
tex.pack();bpy.ops.wm.save_as_mainfile(filepath=os.path.join(MASTER,'Ernie_master.blend'))
s.render.filepath=os.path.join(MASTER,'Ernie_preview.png');bpy.ops.render.render(write_still=True)
print('ERNIE COMPLETE',len(body.data.vertices),'vertices',len(bones),'bones',len(manifest),'gestures')
