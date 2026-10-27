import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {buildMeshSelectionTopology,queryMeshSelection,combineMeshSelection,validateMeshSelectionBinding,meshSelectionGeometryDigest,createMeshSelectionService,MESH_SELECTION_LIMITS} from '../src/mesh-selection-data.js';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const cube={verts:[0,0,0,1,0,0,1,1,0,0,1,0,0,0,1,1,0,1,1,1,1,0,1,1],triangles:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]};
const annulus={verts:[-2,-2,0,2,-2,0,2,2,0,-2,2,0,-1,-1,0,1,-1,0,1,1,0,-1,1,0],triangles:[0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]};
const node=(mesh,id='synthetic')=>({id,kind:'mesh',mesh:structuredClone(mesh),transform:[...identity]});
const query=(mesh,request,options)=>queryMeshSelection(buildMeshSelectionTopology(mesh),{triangleIndex:0,...request},options);
const binding=result=>combineMeshSelection(null,result);
function separatedTriangles(mesh){const verts=[],triangles=[];for(const id of mesh.triangles){triangles.push(verts.length/3);verts.push(...mesh.verts.slice(id*3,id*3+3));}return {verts,triangles};}
function combineMeshes(...meshes){const out={verts:[],triangles:[]};for(const m of meshes){const offset=out.verts.length/3;out.verts.push(...m.verts);out.triangles.push(...m.triangles.map(i=>i+offset));}return out;}

test('Single original face and cube planar patch differ from complete manifold component',()=>{
  const source=structuredClone(cube),before=JSON.stringify(source),topology=buildMeshSelectionTopology(source);
  assert.deepEqual(queryMeshSelection(topology,{mode:'triangle',triangleIndex:1}).triangleIds,[1]);
  assert.deepEqual(queryMeshSelection(topology,{mode:'surface',triangleIndex:1,angleDegrees:1}).triangleIds,[0,1]);
  assert.equal(queryMeshSelection(topology,{mode:'component',triangleIndex:1}).triangleIds.length,12);
  assert.equal(queryMeshSelection(topology,{mode:'surface',triangleIndex:1,angleDegrees:90}).triangleIds.length,12);
  assert.equal(JSON.stringify(source),before);assert.deepEqual(source,cube);
});

test('STL-style exact duplicate point seams are logically welded without renumbering original triangle IDs',()=>{
  const source=separatedTriangles(cube),before=JSON.stringify(source),result=query(source,{mode:'surface',triangleIndex:3,angleDegrees:0});
  assert.deepEqual(result.triangleIds,[2,3]);assert.equal(query(source,{mode:'component'}).triangleIds.length,12);
  assert.equal(JSON.stringify(source),before);assert.equal(source.verts.length,108);assert.equal(result.geometryDigest,meshSelectionGeometryDigest(source));
});

test('Exact signed zero coordinates weld; nearby independent sheets do not',()=>{
  const a={verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]},b={verts:[-0,0,0,1,-0,0,0,-1,0],triangles:[1,0,2]};
  assert.equal(query(combineMeshes(a,b),{mode:'component'}).triangleIds.length,2);
  b.verts[2]=1e-12;b.verts[5]=1e-12;assert.deepEqual(query(combineMeshes(a,b),{mode:'component'}).triangleIds,[0]);
});

test('Touching only a vertex never joins components and touching boundary rings are ambiguous',()=>{
  const source={verts:[0,0,0,1,0,0,0,1,0,-1,0,0,0,-1,0],triangles:[0,1,2,0,3,4]};
  assert.deepEqual(query(source,{mode:'component'}).triangleIds,[0]);
  assert.throws(()=>query(source,{mode:'boundary'}),error=>error.code==='MESH_SELECTION_AMBIGUOUS'&&/Rand/.test(error.message));
});

test('Opening picks the actual inner ring; edges retain canonical original endpoint IDs',()=>{
  const source=separatedTriangles(annulus),topology=buildMeshSelectionTopology(source),before=JSON.stringify(source),inner=queryMeshSelection(topology,{mode:'boundary',triangleIndex:0,point:[1.1,-1.4,0]});
  assert.deepEqual(inner.triangleIds,[]);assert.equal(inner.boundaryEdges.length,4);assert.equal(inner.boundaryVertexIds.length,4);assert.equal(inner.incidentTriangleIds.length,4);
  for(const edge of inner.boundaryEdges){assert.ok(edge.vertices[0]<edge.vertices[1]);assert.equal(edge.id,`e:${edge.vertices[0]}:${edge.vertices[1]}`);const points=edge.vertices.map(i=>source.verts.slice(i*3,i*3+3));assert.ok(points.every(p=>Math.abs(p[0])===1&&Math.abs(p[1])===1));assert.equal(topology.edges.get(edge.vertices.join(',')).incidents.length,1);}
  assert.equal(JSON.stringify(source),before);const saved=binding(inner);assert.doesNotThrow(()=>validateMeshSelectionBinding(saved,{node:node(source,'mesh')}));
});

test('Explicit boundary seed selects outer ring, never a fake seam or interior diagonal',()=>{
  const outer=query(annulus,{mode:'boundary',edgeId:'e:0:1'});assert.equal(outer.boundaryEdges.length,4);assert.deepEqual([...outer.boundaryVertexIds].sort((a,b)=>a-b),[0,1,2,3]);
  assert.throws(()=>query(annulus,{mode:'boundary',edgeId:'e:0:5'}),/kein offener Rand/);
  assert.throws(()=>query(cube,{mode:'boundary'}),error=>error.code==='MESH_SELECTION_NO_BOUNDARY');
});

test('Boundary search stays in clicked triangle component despite a closer nearby sheet',()=>{
  const near={verts:[1.5,-1.4,1e-10,1.50001,-1.4,1e-10,1.5,-1.40001,1e-10],triangles:[0,1,2]},source=combineMeshes(annulus,near);
  const result=query(source,{mode:'boundary',point:[1.5,-1.4,0]});assert.equal(result.boundaryEdges.length,4);assert.ok(result.boundaryEdges.every(edge=>edge.vertices.every(i=>i<8)));
});

test('Equidistant different boundary rings require a clearer hit; a corner tie on one ring is valid',()=>{
  assert.throws(()=>query(annulus,{mode:'boundary',triangleIndex:2,point:[1.5,0,0]}),error=>error.code==='MESH_SELECTION_AMBIGUOUS'&&/gleich nah/.test(error.message));
  const corner=query(annulus,{mode:'boundary',triangleIndex:4,point:[1.5,1.5,0]});assert.equal(corner.boundaryEdges.length,4);assert.deepEqual([...corner.boundaryVertexIds].sort((a,b)=>a-b),[0,1,2,3]);
});

test('Nonmanifold edges are barriers, never chosen as an opening',()=>{
  const source={verts:[0,0,0,1,0,0,0,1,0,0,-1,0,0,0,1],triangles:[0,1,2,1,0,3,0,1,4]},result=query(source,{mode:'component'});
  assert.deepEqual(result.triangleIds,[0]);assert.equal(result.summary.nonmanifoldCount,1);assert.match(result.warnings.join(' '),/Mehrdeutige Kanten/);
  assert.throws(()=>query(source,{mode:'boundary'}),error=>error.code==='MESH_SELECTION_AMBIGUOUS');
});

test('Contradictory orientation is a selection barrier with an actionable warning',()=>{
  const source={verts:[0,0,0,1,0,0,0,1,0,0,-1,0],triangles:[0,1,2,0,1,3]},result=query(source,{mode:'component'});
  assert.deepEqual(result.triangleIds,[0]);assert.equal(result.summary.orientationCount,1);assert.match(result.warnings.join(' '),/Flächenrichtung/);
});

test('Degenerate triangles cannot be picked and their incidence does not invent false openings',()=>{
  const source={verts:[0,0,0,1,0,0,0,1,0,.5,0,0],triangles:[0,1,2,1,0,3]},topology=buildMeshSelectionTopology(source);
  assert.throws(()=>queryMeshSelection(topology,{mode:'triangle',triangleIndex:1}),error=>error.code==='MESH_SELECTION_DEGENERATE');
  assert.equal(topology.edges.get('0,1').incidents.length,2);assert.deepEqual(queryMeshSelection(topology,{mode:'component',triangleIndex:0}).triangleIds,[0]);
  assert.throws(()=>queryMeshSelection(topology,{mode:'boundary',triangleIndex:0}),error=>error.code==='MESH_SELECTION_AMBIGUOUS');
});

test('Coincident duplicate sheets cannot silently join or be treated as an unambiguous face',()=>{
  const one={verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]},source=combineMeshes(one,{...one,triangles:[0,2,1]}),topology=buildMeshSelectionTopology(source);
  assert.equal(topology.diagnostics.duplicateCount,1);assert.throws(()=>queryMeshSelection(topology,{mode:'triangle',triangleIndex:0}),error=>error.code==='MESH_SELECTION_AMBIGUOUS');
});

test('Adjacent dihedral threshold uses full affine world geometry including scale, shear and reflection',()=>{
  const angle=40*Math.PI/180,source={verts:[0,0,0,1,0,0,0,1,0,0,-Math.cos(angle),Math.sin(angle)],triangles:[0,1,2,1,0,3]},topology=buildMeshSelectionTopology(source);
  assert.deepEqual(queryMeshSelection(topology,{mode:'surface',triangleIndex:0,angleDegrees:20}).triangleIds,[0]);
  const transform=[-2,0,0,0,0,1,0,0,0,.4,.2,0,50,-3,2,1];
  assert.deepEqual(queryMeshSelection(topology,{mode:'surface',triangleIndex:0,angleDegrees:20},{transform}).triangleIds,[0,1]);
  assert.deepEqual(queryMeshSelection(topology,{mode:'surface',triangleIndex:0,angleDegrees:10},{transform}).triangleIds,[0]);
  assert.equal(meshSelectionGeometryDigest(source),topology.geometryDigest);
});

test('Surface growth compares adjacent faces, not every face to the seed normal',()=>{
  const count=8,verts=[],triangles=[];for(let i=0;i<=count;i++){const a=i*Math.PI/12;verts.push(Math.cos(a),Math.sin(a),0,Math.cos(a),Math.sin(a),1);}for(let i=0;i<count;i++){const a=i*2;triangles.push(a,a+2,a+3,a,a+3,a+1);}
  assert.equal(query({verts,triangles},{mode:'surface',angleDegrees:16}).triangleIds.length,count*2);assert.equal(query({verts,triangles},{mode:'surface',angleDegrees:14}).triangleIds.length,2);
});

test('Boundary nearest distance is measured in full world placement',()=>{
  const transform=[1,0,0,0,0,5,0,0,.2,.3,2,0,80,-20,7,1],result=query(annulus,{mode:'boundary',point:[81.9,-27.5,7]},{transform});
  assert.deepEqual([...result.boundaryVertexIds].sort((a,b)=>a-b),[0,1,2,3]);
});

test('Selection operations keep triangle and boundary sets independent and preserve immutable inputs',()=>{
  const face=query(annulus,{mode:'triangle'}),rim=query(annulus,{mode:'boundary',edgeId:'e:4:5'}),a=binding(face),saved=JSON.stringify(a),both=combineMeshSelection(a,rim,'add');
  assert.deepEqual(both.triangleIds,[0]);assert.equal(both.boundaryEdges.length,4);assert.equal(JSON.stringify(a),saved);assert.equal(Object.keys(both).length,6);
  const onlyRim=combineMeshSelection(both,face,'subtract');assert.deepEqual(onlyRim.triangleIds,[]);assert.equal(onlyRim.boundaryEdges.length,4);
  assert.equal(combineMeshSelection(onlyRim,rim,'toggle'),null);assert.equal(combineMeshSelection(null,rim,'subtract'),null);
  assert.deepEqual(combineMeshSelection(both,rim,'replace'),binding(rim));
  assert.throws(()=>combineMeshSelection(a,{...rim,objectId:'other'},'add'),error=>error.code==='MESH_SELECTION_STALE');
});

test('Binding validates exact original geometry; appearance and full affine pose may change',()=>{
  const n=node(annulus),saved=binding(query(annulus,{mode:'triangle',triangleIndex:3},{objectId:n.id}));
  assert.deepEqual(validateMeshSelectionBinding(saved,{node:n}),saved);n.color='#123456';n.transform[0]=2;n.transform[4]=.3;assert.doesNotThrow(()=>validateMeshSelectionBinding(saved,{node:n}));
  n.mesh.verts[0]+=.000000001;assert.throws(()=>validateMeshSelectionBinding(saved,{node:n}),error=>error.code==='MESH_SELECTION_STALE');
  const badTriangle={...saved,triangleIds:[999]};assert.throws(()=>validateMeshSelectionBinding(badTriangle,{node:node(annulus)}),/originales Dreieck/);
});

test('Strict persisted binding rejects extras, duplicate IDs, forged or non-boundary edges and sparse values',()=>{
  const saved=binding(query(annulus,{mode:'triangle'})),n=node(annulus,'mesh');
  for(const change of [s=>s.script='bad',s=>s.mode='triangle',s=>s.format='other',s=>s.triangleIds=[0,0],s=>s.triangleIds=[-1],s=>s.triangleIds=[.5],s=>s.triangleIds=[,],s=>s.geometryDigest='bad',s=>s.boundaryEdges=[{id:'e:4:5',vertices:[5,4]}],s=>s.boundaryEdges=[{id:'e:0:1',vertices:[4,5]}],s=>s.boundaryEdges=[{id:'e:4:5',vertices:[4,5],extra:true}]]){const input=structuredClone(saved);change(input);assert.throws(()=>validateMeshSelectionBinding(input));}
  assert.throws(()=>validateMeshSelectionBinding({...saved,boundaryEdges:[{id:'e:0:5',vertices:[0,5]}]},{node:n}),/kein eindeutiger Originalrand/);
});

test('Invalid geometry, request, affine matrix and explicit dense bounds are denied before traversal',()=>{
  for(const source of [{verts:[],triangles:[]},{verts:[0,0,NaN,1,0,0,0,1,0],triangles:[0,1,2]},{verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,3]},{verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,1.5]}])assert.throws(()=>buildMeshSelectionTopology(source));
  assert.throws(()=>buildMeshSelectionTopology(cube,{limits:{vertices:8,triangles:11,edges:100}}),error=>error.code==='MESH_SELECTION_LIMIT');
  const topology=buildMeshSelectionTopology(cube);for(const request of [{mode:'bad',triangleIndex:0},{mode:'triangle',triangleIndex:12},{mode:'triangle',triangleIndex:-1},{mode:'surface',triangleIndex:0,angleDegrees:181},{mode:'surface',triangleIndex:0,angleDegrees:NaN}])assert.throws(()=>queryMeshSelection(topology,request));
  const singular=[...identity];singular[0]=0;assert.throws(()=>queryMeshSelection(topology,{mode:'triangle',triangleIndex:0},{transform:singular}),/nicht invertierbar/);
  const perspective=[...identity];perspective[3]=1;assert.throws(()=>queryMeshSelection(topology,{mode:'triangle',triangleIndex:0},{transform:perspective}),/affine/);
});

test('Abort is checked before dense build and during iterative topology traversal',()=>{
  const controller=new AbortController();controller.abort();assert.throws(()=>buildMeshSelectionTopology(cube,{signal:controller.signal}),error=>error.name==='AbortError');
  let checks=0;const signal={get aborted(){return ++checks>6;}};assert.throws(()=>buildMeshSelectionTopology(cube,{signal}),error=>error.name==='AbortError');assert.ok(checks>6);
  assert.throws(()=>query(cube,{mode:'component'},{signal:controller.signal}),error=>error.code==='ABORTED');
});

test('Frozen geometry caches only its immutable identity; mutable arrays are rechecked',()=>{
  const mesh=structuredClone(cube);Object.freeze(mesh.verts);Object.freeze(mesh.triangles);Object.freeze(mesh);const first=buildMeshSelectionTopology(mesh);assert.equal(buildMeshSelectionTopology(mesh),first);assert.equal(meshSelectionGeometryDigest(mesh),first.geometryDigest);
  const mutable=structuredClone(cube),before=meshSelectionGeometryDigest(mutable);mutable.verts[0]=.01;assert.notEqual(meshSelectionGeometryDigest(mutable),before);assert.notEqual(buildMeshSelectionTopology(mutable),buildMeshSelectionTopology(mutable));
});

test('Node service fallback returns the same original geometry binding and supports pre-abort and dispose',async()=>{
  const service=createMeshSelectionService(),n=node(cube),result=await service.query(n,{mode:'surface',triangleIndex:2,angleDegrees:1});assert.deepEqual(result.triangleIds,[2,3]);assert.equal(await service.geometryDigest(n),result.geometryDigest);assert.deepEqual(await service.validate(binding(result),n),binding(result));
  const c=new AbortController();c.abort();await assert.rejects(service.query(n,{mode:'component',triangleIndex:0},{signal:c.signal}),error=>error.name==='AbortError');
  service.dispose();await assert.rejects(service.query(n,{mode:'triangle',triangleIndex:0}),/geschlossen/);
});

test('Owned worker is terminated on abort; late responses cannot satisfy a later query',async()=>{
  const workers=[];function factory(){const worker={terminated:false,postMessage(message){this.message=message;},terminate(){this.terminated=true;}};workers.push(worker);return worker;}
  const service=createMeshSelectionService({workerFactory:factory}),c=new AbortController(),n=node(cube),first=service.query(n,{mode:'component',triangleIndex:0},{signal:c.signal});c.abort();await assert.rejects(first,error=>error.name==='AbortError');assert.equal(workers[0].terminated,true);
  const second=service.query(n,{mode:'triangle',triangleIndex:0}),expected=query(cube,{mode:'triangle'},{objectId:n.id});workers[0].onmessage({data:{id:workers[0].message.id,result:{bad:true}}});workers[1].onmessage({data:{id:workers[1].message.id,result:expected}});assert.deepEqual(await second,expected);service.dispose();assert.equal(workers[1].terminated,true);
});

test('Real private worker hashes immutable geometry asynchronously, reuses its original payload and validates saved rims',async()=>{
  const moduleURL=new URL('../src/mesh-selection-worker.js',import.meta.url).href;
  const bootstrap=`import {parentPort} from 'node:worker_threads';globalThis.self={postMessage:value=>parentPort.postMessage(value)};await import(${JSON.stringify(moduleURL)});parentPort.on('message',data=>self.onmessage({data}));`;
  const sent=[],workers=[];const service=createMeshSelectionService({workerFactory:()=>{
    const thread=new NodeWorker(new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`)),adapter={postMessage(value){sent.push(value);thread.postMessage(value);},terminate:()=>thread.terminate()};thread.on('message',data=>adapter.onmessage?.({data}));thread.on('error',error=>adapter.onerror?.({message:error.message}));workers.push(thread);return adapter;
  }});
  const n=node(annulus);Object.freeze(n.mesh.verts);Object.freeze(n.mesh.triangles);Object.freeze(n.mesh);
  try{
    const digest=await service.geometryDigest(n);assert.match(digest,/^[0-9a-f]{64}$/);assert.equal(sent[0].action,'digest');assert.ok(sent[0].node.mesh);assert.equal(meshSelectionGeometryDigest(n),digest);
    const result=await service.query(n,{mode:'boundary',triangleIndex:0,edgeId:'e:4:5'});assert.equal(result.boundaryEdges.length,4);assert.equal(result.triangleIds.length,0);assert.equal(sent[1].node.mesh,undefined);assert.equal(sent[1].node.cachedGeometryDigest,digest);
    const saved=binding(result),validated=await service.validate(saved,n);assert.deepEqual(validated,saved);assert.equal(sent[2].node.mesh,undefined);assert.doesNotThrow(()=>validateMeshSelectionBinding(saved,{node:n}));assert.equal(workers.length,1);
    await assert.rejects(service.validate({...saved,boundaryEdges:[{id:'e:0:5',vertices:[0,5]}]},n),/kein eindeutiger Originalrand/);
  }finally{service.dispose();}
});

test('Dense topology traversal is iterative and bounded, preserving every original index',()=>{
  const count=12000,verts=[],triangles=[];for(let i=0;i<=count;i++)verts.push(i,0,0,i,1,0);for(let i=0;i<count;i++){const a=i*2;triangles.push(a,a+2,a+3,a,a+3,a+1);}
  const mesh={verts,triangles},before=JSON.stringify(mesh),result=query(mesh,{mode:'component'});assert.equal(result.triangleIds.length,24000);assert.equal(result.triangleIds.at(-1),23999);assert.equal(JSON.stringify(mesh),before);assert.equal(MESH_SELECTION_LIMITS.triangles,500000);
});
