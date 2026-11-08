import test from 'node:test';import assert from 'node:assert/strict';import {Scene,Mesh,BufferGeometry,Float32BufferAttribute,MeshBasicMaterial,Vector3} from 'three';
import {installPracticeFace} from '../src/cad-practice-face.js';
function fixture({occluded=false,align=false,locked=false}={}){
 const host={},scene=new Scene(),geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([20,-15,0,20,15,0,20,15,8,20,-15,8],3));geometry.setIndex([0,1,2,0,2,3]);geometry.userData.cadFaceGroups=[0,6,7];
 const mesh=new Mesh(geometry,new MeshBasicMaterial());mesh.userData={rootId:'body',record:{kind:'cad'}};scene.add(mesh);
 const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],project={nodes:[{id:'body',kind:'cad',solid:true,transform:identity,locked}],layers:[{id:'default',hidden:false,locked:false}],folders:[]};
 const controller={revision:()=>'r',readSnapshot:()=>project,query:async(_method,{ray})=>({objectId:'body',faceIndex:7,normal:[1,0,0],point:[20,ray.x-100,ray.y-100]})};
 const view={scene,allows:()=>true,canvas:{getBoundingClientRect:()=>({left:0,top:0,right:200,bottom:200})},projectPoint:point=>({x:point[1]+100,y:point[2]+100,z:0}),cadRay:p=>({x:p.clientX,y:p.clientY}),visualHit:p=>({object:{userData:{rootId:occluded&&Math.abs(p.clientX-100)<7?'protected':'body'}},point:new Vector3(20,p.clientX-100,p.clientY-100)})};
 installPracticeFace({controller,view,host,getInspectionState:()=>align?null:{kind:'measure',revision:'r',mode:'faces',busy:false},getAlignmentState:()=>align?{ids:['body','other'],referenceId:null,revision:'r'}:null});return {host,project};
}
test('a partially occluded measurement face uses an actually visible interior point',async()=>{
 const {host,project}=fixture({occluded:true}),before=JSON.stringify(project);const hit=await host.__formnaroPracticeFace({rootId:'body',side:'right'});assert.equal(hit.faceIndex,7);assert(Math.abs(hit.x-100)>=7);assert.equal(JSON.stringify(project),before);
});
test('the opened alignment picker accepts a real body-face reference',async()=>{
 const {host}=fixture({align:true});assert.equal((await host.__formnaroPracticeFace({rootId:'body',side:'right'})).faceIndex,7);
});
test('locked faces remain protected',async()=>{
 const {host}=fixture({locked:true});await assert.rejects(host.__formnaroPracticeFace({rootId:'body',side:'right'}),/entsperrte/);
});
