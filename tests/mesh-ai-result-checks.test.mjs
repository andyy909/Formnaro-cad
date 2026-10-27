import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {Matrix4} from 'three';
import {checkMeshAIResults} from '../src/mesh-ai-result-checks.js';
import {createCadProject} from '../src/cad-project.js';
const kernel=await Module();kernel.setup();
function fixture(){const a=kernel.Manifold.cube([30,20,4]),b=kernel.Manifold.cylinder(6,2.25,2.25,128),c=b.translate([15,10,-1]),m=a.subtract(c),raw=m.getMesh();for(const v of [a,b,c,m])v.delete();return createCadProject({version:8,nodes:[{id:'part',kind:'mesh',name:'Plate',meshRole:'solid',transform:new Matrix4().toArray(),mesh:{verts:Array.from(raw.vertProperties),triangles:Array.from(raw.triVerts)},layerId:'default',folderId:null}]});}
const corridor={kind:'clearance',target:'part',from:[15,10,-1],to:[15,10,5],diameter:4.5};
test('Verified mesh material count, world volume and finite M4 corridor share structured evidence',()=>{
 const project=fixture(),before=structuredClone(project),r=checkMeshAIResults({kernel,project,checks:[{kind:'solids',target:'part',expected:1},{kind:'volume',target:'part',expected:2336.40829,tolerance:.01},corridor]});assert.deepEqual(project,before);assert.equal(r.checks.length,3);assert.ok(r.checks.every(c=>c.evidence==='mesh-kernel'));assert.equal(r.checks[2].actual.diameterChecked,4.48);
});
test('Oversized, outside and obstructed probes reject rather than passing vacuously',()=>{
 const project=fixture();assert.throws(()=>checkMeshAIResults({kernel,project,checks:[{...corridor,diameter:4.7}]}),{code:'AI_RESULT_MISMATCH'});assert.throws(()=>checkMeshAIResults({kernel,project,checks:[{...corridor,from:[2,2,-1],to:[2,2,5]}]}),{code:'AI_RESULT_MISMATCH'});assert.throws(()=>checkMeshAIResults({kernel,project,checks:[{...corridor,from:[100,100,0],to:[100,100,6]}]}),{code:'AI_CHECK_INVALID'});assert.throws(()=>checkMeshAIResults({kernel,project,checks:[{...corridor,tolerance:.000001}]}),{code:'AI_CHECK_UNAVAILABLE'});
});
test('Open/hidden/hole meshes are not granted a false material-body proof',()=>{
 for(const mutate of [p=>p.nodes[0].mesh.triangles.splice(0,3),p=>p.nodes[0].hidden=true,p=>p.nodes[0].meshRole='hole']){const project=fixture();mutate(project);assert.throws(()=>checkMeshAIResults({kernel,project,checks:[{kind:'solids',target:'part',expected:1}]}),{code:'AI_CHECK_UNSUPPORTED'});}
});
test('Rigid mirrored placement keeps world corridor measurements consistent',()=>{
 const project=fixture();project.nodes[0].transform=new Matrix4().makeScale(-1,1,1).setPosition(70,-20,4).toArray();const r=checkMeshAIResults({kernel,project,checks:[{...corridor,from:[55,-10,3],to:[55,-10,9]}]});assert.equal(r.checks[0].passed,true);
});
