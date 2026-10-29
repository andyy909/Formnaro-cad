import test from 'node:test';
import assert from 'node:assert/strict';
import {reduceLargeMesh,largeMeshCatalog,validateLargeMeshReduceOptions} from '../src/mesh-large-reduce.js';
import {meshSelectionGeometryDigest} from '../src/mesh-selection-data.js';
import {exactReductionProtectionRemap} from '../src/mesh-reduce.js';
import {meshNode,denseBoxMesh,reductionKernel} from './fixtures/mesh-reduce-fixtures.mjs';
const options=n=>({method:'large-v1',geometryDigest:largeMeshCatalog(n).geometryDigest,target:50,quality:0,preserveFeatures:false});
test('large reducer validates parameters and source binding, cancellation never changes the input',async()=>{
 const n=meshNode(await denseBoxMesh(8)),before=JSON.stringify(n),o=options(n);
 for(const change of [{target:3},{quality:101},{quality:.5},{preserveFeatures:'yes'},{extra:1}])assert.throws(()=>validateLargeMeshReduceOptions({...o,...change}));
 await assert.rejects(reduceLargeMesh(n,{...o,geometryDigest:'a'.repeat(64)}),{code:'MESH_REDUCE_STALE'});const c=new AbortController();c.abort();await assert.rejects(reduceLargeMesh(n,o,{signal:c.signal}),{name:'AbortError'});assert.equal(JSON.stringify(n),before);
});
test('protected triangles and original coordinates survive independent remapping and stale masks are refused',async()=>{
 const n=meshNode(await denseBoxMesh(8));n.metadata.meshProtection={format:'FormnaroMeshProtection',version:1,regions:[{id:'face',name:'Anlage',purpose:'contact',geometryDigest:meshSelectionGeometryDigest(n),triangleIds:[0,1,2]}]};
 const before=JSON.stringify(n),r=await reduceLargeMesh(n,options(n)),out={...n,mesh:r.mesh,metadata:{...n.metadata,meshProtection:r.protection}};
 assert.equal(exactReductionProtectionRemap(n,out),true);assert.ok(r.report.afterTriangles<r.report.beforeTriangles);assert.equal(r.report.before.euler,r.report.after.euler);assert.equal(r.report.errorIsGlobalDistanceProof,false);assert.equal(JSON.stringify(n),before);
 n.metadata.meshProtection.regions[0].geometryDigest='a'.repeat(64);await assert.rejects(reduceLargeMesh(n,options(n)),/Veralteter Schutzbereich/);
});
test('pinched source neighborhoods are retained rather than treating an edge-count match as complete topology preservation',async()=>{
 const k=await reductionKernel(),s=k.Manifold.sphere(10,64),m=s.getMesh();const n=meshNode({verts:Array.from(m.vertProperties),triangles:Array.from(m.triVerts)});s.delete();
 // Two otherwise separate sheets share a single original vertex.
 const v=n.mesh.verts.length/3,anchor=n.mesh.triangles[0];n.mesh.verts.push(30,0,0,30,1,0);n.mesh.triangles.push(anchor,v,v+1);
 const r=await reduceLargeMesh(n,{...options(n),target:100});assert.equal(r.report.before.components,r.report.after.components);assert.equal(r.report.before.euler,r.report.after.euler);assert.equal(r.report.before.boundary,r.report.after.boundary);
});
