import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {Matrix4,Vector3} from 'three';
import fixtures from '../backend/radial-clearance-fixture.cjs';
import {radialFixture} from './fixtures/mesh-radial-fixtures.mjs';
import {measureMeshRadialClearance} from '../src/mesh-radial-clearance.js';
import {checkMeshAIResults} from '../src/mesh-ai-result-checks.js';
import {validateAIResultChecks} from '../src/cad-ai-result-checks.js';
import {createCadProject} from '../src/cad-project.js';
import {analyzeMeshFeatures} from '../src/mesh-features.js';
import {aiFeedback,correctionFeedback} from '../src/ai-feedback.js';
const kernel=await Module();kernel.setup();
const options={other:'housing',from:[0,0,16.5],to:[0,0,23.5],samples:9,expected:.3};
test('Cone measurements expose actual world section plane including inset and numerical shift',()=>{
 const [source]=radialFixture(kernel),before=structuredClone(source),r=analyzeMeshFeatures(source,{normal:[0,0,1],planePoint:[0,0,20]}),p=r.profiles.find(p=>p.role==='cavity');
 assert.ok(p);assert.deepEqual(source,before);assert.equal(p.nominalPlanePoint[2],20);assert.equal(p.planePoint[2],20);assert.ok(Math.abs(p.measurementPlanePoint[2]-(20-p.referenceInset+p.sectionShift))<1e-12);
 const exactRadius=16-(p.measurementPlanePoint[2]-2)/11;assert.ok(Math.abs(p.circle.diameter/2-exactRadius)<.001);assert.equal(p.circle.measurementCenter[2],p.measurementPlanePoint[2]);assert.equal(p.circle.center[2],20);
 const matrix=new Matrix4().makeRotationX(.71).setPosition(31,-12,8);source.transform=matrix.toArray();const normal=new Vector3(0,0,1).transformDirection(matrix).toArray(),point=new Vector3(0,0,20).applyMatrix4(matrix).toArray(),rotated=analyzeMeshFeatures(source,{normal,planePoint:point}).profiles.find(p=>p.role==='cavity');
 const displacement=rotated.nominalPlanePoint.map((v,k)=>v-normal[k]*(rotated.referenceInset-rotated.sectionShift));assert.ok(Math.hypot(...displacement.map((v,k)=>v-rotated.measurementPlanePoint[k]))<1e-10);
});
test('Analytical .3 mm tapered insert passes every listed section, .209 mm insert and cylinder fail',()=>{
 for(const [gap,insertShape,pass]of [[.3,'cone',true],[.209,'cone',false],[.3,'cylinder',false]]){
  const [other,target]=radialFixture(kernel,{gap,insertShape}),before=JSON.stringify([other,target]),r=measureMeshRadialClearance({kernel,target,other,options});assert.equal(JSON.stringify([other,target]),before);assert.equal(r.passed,pass);assert.equal(r.sections.length,9);assert.match(r.coverage,/Continuous axial interval/);
  if(insertShape==='cone')for(const s of r.sections){assert.ok(Math.abs(s.gapLowerBound-gap)<.003);assert.ok(s.gapLowerBound<=gap);assert.ok(Math.abs(s.cavityInscribedRadius-(16-(s.point[2]-2)/11))<.002);}
 }
});
test('Rigid rotation and reflection preserve radial clearance world measurements',()=>{
 const [other,target]=radialFixture(kernel),matrix=new Matrix4().makeRotationY(.63).multiply(new Matrix4().makeScale(-1,1,1)).setPosition(51,19,7);other.transform=target.transform=matrix.toArray();const transform=p=>new Vector3(...p).applyMatrix4(matrix).toArray(),r=measureMeshRadialClearance({kernel,target,other,options:{...options,from:transform(options.from),to:transform(options.to)}});assert.equal(r.passed,true);assert.ok(Math.abs(r.sampledMinimumGapLowerBound-.3)<.003);
});
test('A narrow hidden shoulder between all requested section planes is caught by continuous slabs',()=>{
 const {source:other,insert:target}=fixtures.radialClearanceFixture(.3,{shoulder:true});
 const r=measureMeshRadialClearance({kernel,target,other,options:{...options,samples:3}});assert.ok(r.sampledMinimumGapLowerBound>.29);assert.equal(r.passed,false);assert.ok(r.minimumGapLowerBound<.2);assert.ok(r.slabsChecked>2);
});
test('Atomic result checks resolve both aliases and provide structured failure values without changing project',()=>{
 for(const gap of [.3,.209]){const nodes=radialFixture(kernel,{gap}),project=createCadProject({version:8,nodes}),before=structuredClone(project),checks=[{kind:'radialClearance',target:'$plug',...options,other:'$shell'}],aliases={plug:'insert',shell:'housing'};
  if(gap===.3){const r=checkMeshAIResults({kernel,project,checks,aliases});assert.equal(r.checks[0].evidence,'mesh-kernel');assert.equal(r.checks[0].other.rootId,'housing');}
  else assert.throws(()=>checkMeshAIResults({kernel,project,checks,aliases}),e=>{const f=aiFeedback(e);assert.equal(f.checkKind,'radialClearance');assert.ok(f.actual.minimumGapLowerBound<.21);assert.equal(f.expected,.3);assert.ok(correctionFeedback(e,{checks,commands:[]}).length<12000);return e.code==='AI_RESULT_MISMATCH';});assert.deepEqual(project,before);
 }
});
test('Missing sections, wrong axis, open or hidden references, same target and invalid requests never pass',()=>{
 const [other,target]=radialFixture(kernel);for(const extra of [{from:[0,0,1]},{from:[30,0,16],to:[30,0,23]},{samples:2},{samples:34},{expected:NaN},{tolerance:.000001}])assert.throws(()=>measureMeshRadialClearance({kernel,target,other,options:{...options,...extra}}));
 assert.throws(()=>measureMeshRadialClearance({kernel,target,other:target,options}));const damaged=structuredClone(other);damaged.mesh.triangles.splice(0,3);assert.throws(()=>measureMeshRadialClearance({kernel,target,other:damaged,options}));
 const project=createCadProject({version:8,nodes:[{...other,hidden:true},target]});assert.throws(()=>checkMeshAIResults({kernel,project,checks:[{kind:'radialClearance',target:'insert',...options}]}));
 for(const extra of [{samples:2},{from:[0,0,0],to:[0,0,0]},{other:null},{expected:-1},{surprise:true}])assert.throws(()=>validateAIResultChecks([{kind:'radialClearance',target:'insert',...options,...extra}]));
});
