import test from 'node:test';
import assert from 'node:assert/strict';
import {cadExportTriangleNormal,cadCleanExportTriangles} from '../src/cad-export-triangles.js';
import {cadStlAscii} from '../src/cad-mesh-formats.js';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {createCadService} from '../src/cad-service.js';
import {createCadFinishNative,listCadEdgesNative} from '../src/cad-finish-native.js';
import {createCadProject,serializeCadProject} from '../src/cad-project.js';
import {cadExportMesh,validateCadSolid,writeCadBrep,readCadBrep} from '../src/cad-native-kernel.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});

test('Export cleanup preserves all positive triangles, coordinates, winding and native face IDs',()=>{
 const mesh={vertices:[0,0,0,1,0,0,0,1,0,0,0,0,1e-200,0,0,0,1e-200,0],triangles:[0,1,1,0,1,2,3,4,5,0,0,2,0,2,1],faceGroups:[0,9,7,9,6,19]},before=structuredClone(mesh),result=cadCleanExportTriangles(mesh);
 assert.deepEqual(result.triangles,[0,1,2,3,4,5,0,2,1]);assert.deepEqual(result.faceGroups,[0,6,7,6,3,19]);assert.equal(result.vertices,mesh.vertices);assert.deepEqual(mesh,before);
 const text=cadStlAscii([{name:'Positive triangles',mesh:result}]);assert.equal((text.match(/facet normal/g)||[]).length,3);assert.match(text,/1e-200/);assert.deepEqual(cadExportTriangleNormal([0,0,0],[1e-200,0,0],[0,1e-200,0]),[0,0,1]);
});
test('Exact export degeneracy handles collinearity, cancellation, underflow and huge finite coordinates',()=>{
 assert.equal(cadExportTriangleNormal([0,0,0],[1,2,3],[2,4,6]),null);
 assert.deepEqual(cadExportTriangleNormal([0,0,0],[1e200,0,0],[0,1e200,0]),[0,0,1]);
 const normal=cadExportTriangleNormal([0,0,0],[1,1,0],[1,1+Number.EPSILON,0]);assert.deepEqual(normal,[0,0,1]);
 assert.equal(cadExportTriangleNormal([0,0,0],[0,0,0],[0,1,0]),null);assert.throws(()=>cadExportTriangleNormal([NaN,0,0],[1,0,0],[0,1,0]),/koordinaten/);
});
test('A missing complete native export face remains a failure instead of emitting a hole',()=>{
 const mesh={vertices:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2,0,0,1],faceGroups:[0,3,1,3,3,2]};assert.throws(()=>cadCleanExportTriangles(mesh),/keine Dreiecke mit positiver Fläche/);
});

function rounded(service,type,id,transform){
 const body=service.nativeNode({type,size:[20,20,20]},{id:id+'-source'}),shape=service.worldShape(body);let edges;
 try{edges=listCadEdgesNative(oc,shape,{origin:{rootId:id,path:[body.id]}}).map(edge=>edge.reference);}finally{shape.delete();}
 const node={...body,id,source:'finish',transform,children:[body],operation:'union',finish:{steps:[{id:id+'-round',kind:'round',amount:1,edges}]}};delete node.recipe;delete node.operation;return node;
}
const transform=(scale,z)=>[scale,0,0,0,0,scale,0,0,0,0,1,0,17,-9,z,1];
test('Rounded and scaled native box/pyramid union exports without pole triangles or model changes',async()=>{
 const service=createCadService({oc,finish:createCadFinishNative({oc})});try{
 const box=rounded(service,'box','rounded-box',transform(2.75,10)),pyramid=rounded(service,'pyramid','rounded-pyramid',transform(2.931155364,28.116644883)),root={...box,id:'rounded-group',source:'group',transform:[1,0,0,0,0,1,0,0,0,0,1,0,-13.75,-8.5,0,1],operation:'union',children:[box,pyramid]};delete root.finish;
 const project=await service.rebuild(createCadProject({nodes:[root]})),before=serializeCadProject(project),shape=service.worldShape(project.nodes[0]),brep=writeCadBrep(oc,shape),proof=validateCadSolid(oc,shape);
 try{for(const deflection of [.005,.01,.02]){
   const copy=readCadBrep(oc,brep);let raw;try{raw=JSON.parse(oc.FormnaroCadBridge.ExportMeshJson(copy,deflection,5*Math.PI/180));}finally{copy.delete();}
   const expected=[];for(let i=0;i<raw.triangles.length;i+=3){const ids=raw.triangles.slice(i,i+3),points=ids.map(index=>raw.vertices.slice(index*3,index*3+3));if(cadExportTriangleNormal(...points))expected.push(...ids);}
   assert.ok(expected.length<raw.triangles.length,'Native regression fixture no longer has pole triangles');
   const mesh=cadExportMesh(oc,shape,{deflection,angleDegrees:5});assert.deepEqual(mesh.vertices,raw.vertices);assert.deepEqual(mesh.triangles,expected);assert.equal(mesh.faceGroups.at(-3)+mesh.faceGroups.at(-2),mesh.triangles.length);
   const exported=service.exportModel(project,{format:'stl',quality:{deflection,angleDegrees:5}}),geometry=new STLLoader().parse(exported.data.buffer.slice(exported.data.byteOffset,exported.data.byteOffset+exported.data.byteLength));assert.equal(geometry.attributes.position.count,expected.length);geometry.dispose();
   assert.equal(serializeCadProject(project),before);assert.equal(writeCadBrep(oc,shape),brep);assert.deepEqual(validateCadSolid(oc,shape),proof);
 }}finally{shape.delete();}
 }finally{service.dispose();}
});
