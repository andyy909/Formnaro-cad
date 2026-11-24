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
import {unzipSync,strFromU8} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
import {cadIdentity} from '../src/cad-affine.js';
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

test('3MF export joins the exact face seams of a native plate with two through holes', async () => {
  const service = createCadService({ oc });
  try {
    const plate = service.nativeNode({ type: 'box', size: [60, 30, 2] }, { id: 'plate' });
    const holes = [-14, 14].map((x, index) => {
      const hole = service.nativeNode({ type: 'cylinder', size: [13, 13, 8] }, { id: 'hole-' + index, solid: false });
      hole.transform[12] = x;
      hole.transform[14] = -3;
      return hole;
    });
    const group = {
      ...plate,
      id: 'drilled-plate',
      source: 'group',
      operation: 'union',
      children: [plate, ...holes],
      transform: cadIdentity(),
    };
    delete group.recipe;
    const project = await service.rebuild(createCadProject({ nodes: [group] }));
    const source = serializeCadProject(project);
    const original = service.exportMeshes(project)[0].mesh;
    const result = service.exportModel(project, { format: '3mf', ids: [group.id] });
    const model = strFromU8(unzipSync(result.data)['3D/3dmodel.model']);
    const document = new DOMParser().parseFromString(model, 'application/xml');
    assert.equal(document.getElementsByTagName('object').length, 1);
    const points = Array.from(document.getElementsByTagName('vertex'), (vertex) =>
      ['x', 'y', 'z'].map((axis) => Number(vertex.getAttribute(axis))),
    );
    const triangles = Array.from(document.getElementsByTagName('triangle'), (face) =>
      ['v1', 'v2', 'v3'].map((index) => Number(face.getAttribute(index))),
    );
    const edges = new Map();
    for (const [a, b, c] of triangles) {
      for (const [from, to] of [[a, b], [b, c], [c, a]]) {
        const key = [Math.min(from, to), Math.max(from, to)].join(',');
        const directions = edges.get(key) ?? [];
        directions.push(from < to);
        edges.set(key, directions);
      }
    }

    const expected = original.triangles.map((id) =>
      original.vertices.slice(id * 3, id * 3 + 3).map((value) => value === 0 ? 0 : value),
    );
    assert.deepEqual(triangles.flat().map((id) => points[id]), expected);
    const invalidEdges = [...edges.values()].filter((faces) => faces.length !== 2 || faces[0] === faces[1]);
    assert.equal(invalidEdges.length, 0, '3MF must use the same vertex indices on both faces sharing an edge');
    assert.equal(serializeCadProject(project), source);
  } finally {
    service.dispose();
  }
});
