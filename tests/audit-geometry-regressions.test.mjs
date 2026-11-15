import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';import Manifold from 'manifold-3d';
import {resolveSketchProfile} from '../src/sketch-profile.js';import {sketchExpression} from '../src/sketch-expression.js';import {createCadSectionPreview} from '../src/cad-section-preview.js';import {createMeshEngineAdapter} from '../src/mesh-engine-adapter.js';import * as classic from '../src/geometry.js';import * as mesh from '../src/mesh-engine/geometry.js';
import {validateCadSolid} from '../src/cad-native-kernel.js';
import {createDrawingReferenceLookup,referenceBucket,splineSpans} from '../src/cad-drawing-native.js';
const kernel=await Manifold();kernel.setup();classic.setKernel(kernel);mesh.setKernel(kernel);
test('BUG-50 an old finished CAD group opens with its stored result and original sources intact',async()=>{const {initCad,cadEdges,finishNode}=await import('../src/cad-kernel.js');await initCad();const original=classic.makeNode('box'),edge=cadEdges(original)[0],finished=finishNode(original,{kind:'chamfer',amount:1,edges:[edge.anchor]}),before=JSON.stringify(finished),p={format:'OfflineCAD',version:4,name:'Legacy chamfer',bed:[220,220],planeZ:0,nodes:[{...finished,layerId:'default',folderId:null}],workplane:(await import('../src/coordinates.js')).horizontalPlane(),coordinateMode:'world',...(await import('../src/organization.js')).defaultOrganization()},adapter=createMeshEngineAdapter({kernel}),r=adapter.importLegacy(JSON.stringify(p));assert.equal(JSON.stringify(finished),before);const stored=r.project.nodes[0].meshSource.node;assert.deepEqual(stored.edgeFinish,JSON.parse(before).edgeFinish);assert.equal(stored.cad.brep,finished.cad.brep);assert.deepEqual(stored.children,JSON.parse(before).children);const changed=structuredClone(stored);changed.children[0].size[0]+=1;const {synchronizeHistory}=await import('../src/mesh-engine/history.js');assert.throws(()=>synchronizeHistory([changed]),/CAD-Kanten/);});
test('BUG-05 solid validation accepts permitted 150k topology and frees every enumerated handle',()=>{
 const entityCount=150000;
 let deletedEntities=0,deletedExplorers=0;
 class Entity{
  constructor(id){this.id=id;}
  IsSame(other){return this.id===other.id;}
  delete(){deletedEntities++;}
 }
 class Explorer{
  constructor(_shape,type){this.count=type==='TopAbs_SOLID'?1:entityCount;this.index=0;}
  More(){return this.index<this.count;}
  Current(){return new Entity(this.index);}
  Next(){this.index++;}
  delete(){deletedExplorers++;}
 }
 class NativeHandle{delete(){}}
 const kinds=['SOLID','SHELL','FACE','WIRE','EDGE','VERTEX'].map(kind=>'TopAbs_'+kind);
 const oc={
  TopExp_Explorer:Explorer,
  TopAbs_ShapeEnum:Object.fromEntries(kinds.map(kind=>[kind,kind])),
  ReplicadShapeHasher:{HashCode:entity=>entity.id},
  BRepCheck_Analyzer:class extends NativeHandle{IsValid(){return true;}},
  FormnaroCadBridge:{WriteNoTriangles:()=>''},
  Bnd_Box:class extends NativeHandle{
   IsVoid(){return false;}
   IsWhole(){return false;}
   GetXMin(){return 0;}
   GetYMin(){return 0;}
   GetZMin(){return 0;}
   GetXMax(){return 2;}
   GetYMax(){return 3;}
   GetZMax(){return 4;}
  },
  gp_Pnt:NativeHandle,gp_Dir:NativeHandle,gp_Pln:NativeHandle,
  BRepBndLib:{AddOptimal(){}},
  GProp_GProps:class extends NativeHandle{Mass(){return 24;}},
  BRepGProp:{VolumePropertiesGK:()=>0},
 };
 const result=validateCadSolid(oc,{IsNull:()=>false});
 assert.equal(result.volume,24);
 assert.equal(deletedEntities,10*entityCount+1);
 assert.equal(deletedExplorers,11);
});
for(const count of [2,4])for(const radius of [2,10,100])test(`BUG-37 interior opening survives ray through ${count} arc endpoints at radius ${radius}`,()=>{const at=a=>[radius*Math.cos(a),radius*Math.sin(a)],elements=Array.from({length:count},(_,i)=>({id:'a'+i,type:'arc',start:at(i*2*Math.PI/count),through:at((i+.5)*2*Math.PI/count),end:at((i+1)*2*Math.PI/count)}));elements.push({id:'hole',type:'circle',center:[0,0],diameter:radius/5});const s={version:2,kind:'profile',variables:[],dimensions:{height:'3'},elements,loops:[{id:'outer',role:'outer',elements:elements.slice(0,count).map(e=>e.id)},{id:'hole-loop',role:'hole',elements:['hole']}]};const result=resolveSketchProfile(s,sketchExpression);assert(Math.abs(result.area-Math.PI*radius*radius*.99)<1e-7);});
test('BUG-29 production correspondence lookup searches neighbouring tolerance buckets and retains ambiguity',()=>{
 const a={kind:'line',a:[.99999946,0],b:[2,0]},b={kind:'line',a:[.99999954,0],b:[2,0]};
 const ref={source:{rootId:'body',path:[]},role:'edge'};
 const lookup=createDrawingReferenceLookup(new Map([[referenceBucket(a),[{curve:a,ref}]]]),false);
 assert.deepEqual(lookup(b),[ref]);
 assert.equal(lookup({...b,a:[.9999998,0]}),undefined);
});
test('BUG-49 classic and mesh schemas both retain edgeSteps 1 already accepted by mesh projects',()=>{const n=mesh.makeNode('box');n.params.edgeSteps=1;assert(mesh.validNode(n));assert(classic.validNode(n));});
test('BUG-50 legacy STEP retains original CAD metadata when converted to a mesh project',async()=>{const {initCad,exportStep,importStep}=await import('../src/cad-kernel.js');await initCad();const imported=importStep(exportStep([classic.makeNode('box')])),n=classic.makeNode('import',[0,0,0],imported);assert(classic.validNode(n));const adapter=createMeshEngineAdapter({kernel}),r=adapter.importLegacy(JSON.stringify({format:'OfflineCAD',version:4,name:'old STEP',bed:[220,220],planeZ:0,nodes:[{...n,layerId:'default',folderId:null}],workplane:(await import('../src/coordinates.js')).horizontalPlane(),coordinateMode:'world',...(await import('../src/organization.js')).defaultOrganization()}));assert.equal(r.project.nodes[0].meshSource.node.cad.brep,n.cad.brep);});
test('BUG-56 spline allocation failure releases previously acquired native handles',()=>{
 let deleted=0;
 const oc={
  gp_Pln:class{delete(){deleted++;}},
  BRepBuilderAPI_MakeFace:class{constructor(){throw Error('allocation failed');}},
 };
 assert.throws(()=>splineSpans(oc,{}),/allocation failed/);
 assert.equal(deleted,1);
});
test('BUG-68 disposing a section preview unregisters its five capture listeners',()=>{const listeners=new Map(),canvas={addEventListener:(name,handler)=>listeners.set(name,handler),removeEventListener:(name,handler)=>{if(listeners.get(name)===handler)listeners.delete(name);},hasPointerCapture:()=>false},s=createCadSectionPreview({renderer:{domElement:canvas},scene:new THREE.Scene(),bodies:new THREE.Group(),outlines:new THREE.Group(),getCamera:()=>new THREE.PerspectiveCamera(),projectPoint:()=>({x:0,y:0}),orbit:{enabled:true},invalidate(){}});assert.equal(listeners.size,5);s.dispose();assert.equal(listeners.size,0);s.dispose();});
