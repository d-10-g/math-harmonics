"""Rebuild Kira from Cat.obj using Blender 5.x. Run from repository root."""
import bpy, math, json, os
from mathutils import Vector
from math import sin, pi
ROOT=os.getcwd(); OUT=os.path.join(ROOT,'public/demo/meshes'); MASTER=OUT
os.makedirs(OUT,exist_ok=True);os.makedirs(MASTER,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.wm.obj_import(filepath=os.path.join(ROOT,'public/demo/meshes/Cat.obj'))
body=bpy.context.object;body.name='Kira';body.rotation_euler=(0,0,0)
# Keep original topology; soften the silhouette once for deformation.
mod=body.modifiers.new('Silhouette refinement','SUBSURF');mod.levels=1
bpy.ops.object.modifier_apply(modifier=mod.name)
for v in body.data.vertices:
    if v.co.y < -.22 and v.co.z > .235:
        w=min(1,(-v.co.y-.22)/.07);v.co.x*=1+.18*w;v.co.z=.30+(v.co.z-.30)*(1+.14*w)
# Kira has a fuller torso and softer cheek silhouette in the references.
for v in body.data.vertices:
    x,y,z=v.co
    torso=max(0,1-abs(y-.025)/.28)*max(0,min(1,(z-.13)/.10))
    v.co.x*=1+.50*torso
    if y>-.18 and y<.24 and .13<z<.31:v.co.z-=.012*torso
    if y<-.27 and .29<z<.34:v.co.x*=1.10
    if z<.05:v.co.x*=1.06
for p in body.data.polygons:p.use_smooth=True
# Solid blue-charcoal coat, softly mottled with silver-gray tips. No tuxedo patches.
col=body.data.color_attributes.new(name='CoatPaint',type='FLOAT_COLOR',domain='CORNER')
for p in body.data.polygons:
    for li in p.loop_indices:
        x,y,z=body.data.vertices[body.data.loops[li].vertex_index].co
        grain=sin(x*1850+y*1100+z*780)*sin(z*1970-x*490)*.004
        silver=.009*(.5+.5*sin(x*61+y*29+z*43))
        underside=.78 if z<.14 else 1.0
        shade=(.033+silver+grain)*underside
        col.data[li].color=(shade*.90,shade*.96,shade*1.10,1)
mat=bpy.data.materials.new('Kira • blue charcoal coat');mat.use_nodes=True
nodes=mat.node_tree.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');em=nodes.new('ShaderNodeEmission');vc=nodes.new('ShaderNodeVertexColor');vc.layer_name='CoatPaint';mat.node_tree.links.new(vc.outputs['Color'],em.inputs[0]);mat.node_tree.links.new(em.outputs[0],out.inputs[0]);body.data.materials.clear();body.data.materials.append(mat)
bpy.context.view_layer.objects.active=body;body.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.018);bpy.ops.object.mode_set(mode='OBJECT')
tex=bpy.data.images.new('Kira_Coat',width=1024,height=1024);texnode=nodes.new('ShaderNodeTexImage');texnode.image=tex;nodes.active=texnode
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=8;s.render.bake.margin=12;bpy.ops.object.bake(type='EMIT')
tex.filepath_raw=os.path.join(OUT,'Kira_BaseColor.png');tex.file_format='PNG';tex.save()
bs=nodes.new('ShaderNodeBsdfPrincipled');bs.inputs['Roughness'].default_value=.84;bs.inputs['Specular IOR Level'].default_value=.18;mat.node_tree.links.new(texnode.outputs['Color'],bs.inputs['Base Color']);mat.node_tree.links.new(bs.outputs[0],out.inputs[0]);nodes.remove(em);nodes.remove(vc)
# Named deformation controls, with explicit region weights on the original mesh.
bones={'root':((0,0,.08),(0,0,.15),None),'spine':((0,.14,.23),(0,-.15,.27),'root'),'head':((0,-.20,.28),(0,-.32,.32),'spine'), 'jaw':((0,-.285,.279),(0,-.35,.272),'head')}
for side,x in [('L',.065),('R',-.065)]:
    for end,y in [('front',-.16),('back',.19)]:
        bones[f'{end}_{side}']=((x,y,.23),(x,y,.085),'spine')
        bones[f'paw_{end}_{side}']=((x,y,.07),(x,y-.04,.025),f'{end}_{side}')
    bones[f'ear_{side}']=((x*.8,-.26,.36),(x*.95,-.255,.43),'head')
    bones[f'eye_{side}']=((x*.66,-.337,.358),(x*.66,-.357,.358),'head')
for i in range(4):bones[f'tail_{i}']=((0,.26+i*.092,.29+i*.01),(0,.352+i*.092,.30+i*.01),'spine' if i==0 else f'tail_{i-1}')
bpy.ops.object.select_all(action='DESELECT');bpy.ops.object.armature_add();rig=bpy.context.object;rig.name='Kira_Rig';bpy.ops.object.mode_set(mode='EDIT');rig.data.edit_bones.remove(rig.data.edit_bones[0])
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
iris=material('Warm golden iris',(.62,.38,.075),.28);black=material('Nose and pupils',(.004,.006,.008),.25);white=material('Silver gray whiskers',(.39,.41,.44),.6);pink=material('Warm inner ears',(.17,.10,.12),.8)
def bind(obj,bone):
    g=obj.vertex_groups.new(name=bone);g.add(list(range(len(obj.data.vertices))),1,'REPLACE');parts.append(obj)
def ball(name,loc,scale,mat,bone):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    bind(o,bone);return o
for side,k in [('L',1),('R',-1)]:
    ball('Amber eye '+side,(k*.043,-.337,.358),(.016,.0072,.0144),iris,'eye_'+side)
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
bpy.context.view_layer.objects.active=body;bpy.ops.object.join();arm=body.modifiers.new('Kira deformation','ARMATURE');arm.object=rig;body.parent=rig
# 32 Kira-specific gestures: multi-control accents rather than Ernie's isolated taps.
# Tuple entries contain bone, rotation axis, peak radians, and optional timing delay.
gestures=[
 ('Golden hello',[('head',0,-.20),('tail_0',0,.22)],1.15),
 ('Curious left listen',[('head',1,.30),('ear_L',2,-.24),('ear_R',0,.12)],1.10),
 ('Curious right listen',[('head',1,-.30),('ear_R',2,.24),('ear_L',0,.12)],1.10),
 ('Soft chin tuck',[('head',0,.24),('jaw',0,.08)],1.20),
 ('Scent the air',[('head',0,-.23),('head',2,.07),('ear_L',0,.12)],.95),
 ('Bird watch left',[('head',1,.28),('head',0,-.18),('tail_3',0,.32)],1.20),
 ('Bird watch right',[('head',1,-.28),('head',0,-.18),('tail_3',0,-.32)],1.20),
 ('Little chirp',[('jaw',0,.23),('head',0,-.09)],.80),
 ('Sleepy blink',[('head',0,.10)],1.35),
 ('Left slow wink',[('head',2,.12)],1.20),
 ('Right slow wink',[('head',2,-.12)],1.20),
 ('Both ears swivel',[('ear_L',2,-.28),('ear_R',2,-.28)],.90),
 ('Left listening flick',[('ear_L',0,.31),('head',2,.09)],.75),
 ('Right listening flick',[('ear_R',0,.31),('head',2,-.09)],.75),
 ('Ears soften',[('ear_L',2,.26),('ear_R',2,-.26),('head',0,.07)],1.10),
 ('Left paw curl',[('front_L',0,-.30),('paw_front_L',0,.52)],1.0),
 ('Right paw curl',[('front_R',0,-.30),('paw_front_R',0,.52)],1.0),
 ('Velvet knead left',[('front_L',0,-.34),('paw_front_L',0,.35),('front_R',0,-.17,.18)],1.30),
 ('Velvet knead right',[('front_R',0,-.34),('paw_front_R',0,.35),('front_L',0,-.17,.18)],1.30),
 ('Groom left paw',[('front_L',0,-.62),('paw_front_L',0,.38),('head',0,.20),('head',1,.18),('jaw',0,.10)],1.25),
 ('Groom right paw',[('front_R',0,-.62),('paw_front_R',0,.38),('head',0,.20),('head',1,-.18),('jaw',0,.10)],1.25),
 ('Playful left bat',[('front_L',0,-.48),('front_L',2,.23),('paw_front_L',0,-.18)],.85),
 ('Playful right bat',[('front_R',0,-.48),('front_R',2,-.23),('paw_front_R',0,-.18)],.85),
 ('Shoulder settle',[('spine',0,.10),('head',0,-.11),('front_L',0,-.08),('front_R',0,-.08)],1.35),
 ('Hip shift left',[('spine',2,.10),('back_L',0,.21),('head',2,-.10)],1.10),
 ('Hip shift right',[('spine',2,-.10),('back_R',0,.21),('head',2,.10)],1.10),
 ('Question mark tail',[('tail_0',0,.16),('tail_1',0,.28),('tail_2',0,.50),('tail_3',0,.55)],1.30),
 ('Tail tip greeting',[('tail_2',2,.35),('tail_3',2,.48),('ear_L',0,.10)],.90),
 ('Tail ribbon left',[('tail_0',2,.21),('tail_1',2,.26,.06),('tail_2',2,-.30,.12),('tail_3',2,-.40,.18)],1.20),
 ('Tail ribbon right',[('tail_0',2,-.21),('tail_1',2,-.26,.06),('tail_2',2,.30,.12),('tail_3',2,.40,.18)],1.20),
 ('Happy tail tremble',[('tail_1',2,.14),('tail_2',2,-.24),('tail_3',2,.32)],.90),
 ('Drowsy goodnight',[('head',0,.19),('ear_L',2,.18),('ear_R',2,-.18),('tail_2',0,.24)],1.40),
]
manifest=[]
for index,(name,controls,duration) in enumerate(gestures):
    rig.animation_data_create();action=bpy.data.actions.new(f'Kira_{index+1:02d}_{name.replace(" ","_")}');rig.animation_data.action=action
    end=round(duration*24)+1
    for frame in range(1,end+1):
        t=(frame-1)/(end-1);v=sin(pi*t)**2
        for bone in rig.pose.bones:
            bone.rotation_mode='XYZ';bone.rotation_euler=(0,0,0);bone.scale=(1,1,1)
            for control in controls:
                target,axis,amount=control[:3];delay=control[3] if len(control)>3 else 0
                phase=max(0,min(1,(t-delay)/(1-delay)))
                wave=sin(pi*phase)**2
                if name=='Happy tail tremble':wave*=sin(5*pi*t)
                if bone.name==target:bone.rotation_euler[axis]+=amount*wave
            blink=(index in (8,31) and bone.name.startswith('eye_')) or (index==9 and bone.name=='eye_L') or (index==10 and bone.name=='eye_R')
            if blink:bone.scale.z=1-.90*v
            bone.keyframe_insert('rotation_euler',frame=frame,group=bone.name);bone.keyframe_insert('scale',frame=frame,group=bone.name)
    track=rig.animation_data.nla_tracks.new();track.name=action.name;track.strips.new(action.name,1,action);track.mute=True
    manifest.append({'index':index,'name':name,'clip':action.name,'duration':(end-1)/24})
rig.animation_data.action=None
for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.scale=(1,1,1)
s.frame_set(1);s.render.fps=24
# Export animated GLB and material-preserving static OBJ.
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'Kira_model.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_action_filter=False,export_force_sampling=True)
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
bpy.ops.wm.obj_export(filepath=os.path.join(OUT,'Kira_model.obj'),export_selected_objects=True,export_materials=True,path_mode='COPY',forward_axis='NEGATIVE_Z',up_axis='Y')
with open(os.path.join(OUT,'Kira_movements.json'),'w') as f:json.dump(manifest,f,indent=2)
# Studio preview and saved editing scene.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.003));floor=bpy.context.object;floor.name='Studio floor';floor.data.materials.append(material('Studio stone',(.12,.115,.10),.85))
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
s.frame_end=35
s.render.filepath=os.path.join(MASTER,'Kira_preview.png')
tex.pack();bpy.ops.wm.save_as_mainfile(filepath=os.path.join(MASTER,'Kira_master.blend'))
s.render.filepath=os.path.join(MASTER,'Kira_preview.png');bpy.ops.render.render(write_still=True)
print('KIRA COMPLETE',len(body.data.vertices),'vertices',len(bones),'bones',len(manifest),'gestures')

# Contact sheet sources: six poses from the saved rig, for visual deformation QA.
s.render.resolution_x=640;s.render.resolution_y=540;s.cycles.samples=24
for index in [0,8,19,21,26,30]:
    action=bpy.data.actions.get(manifest[index]['clip']);rig.animation_data.action=action
    if action.slots:rig.animation_data.action_slot=action.slots[0]
    s.frame_set(round(manifest[index]['duration']*24*.5)+1)
    s.render.filepath=os.path.join(MASTER,f'Kira_pose_{index+1:02d}.png');bpy.ops.render.render(write_still=True)
