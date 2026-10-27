import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import OCModule from 'replicad-opencascadejs';
import {photoPlane,projectPhotoPoint} from '../src/cad-photo-perspective.js';
import {rectifyPhotoPixels} from '../src/cad-photo-rectify.js';
import {suggestPhotoContour} from '../src/cad-photo-contours.js';
import {perspectiveReference,pixelPlate,storedPhoto,damagedMeshFixture} from '../tests/expansion-fixtures.mjs';
import {nativeExpansionFixtures,EXPANSION_EXPECTED} from '../tests/expansion-native-fixtures.mjs';
import {serializeCadProject,parseCadProject} from '../src/cad-project.js';
import {readCadBrep,validateCadSolid,brepHasNoTriangulation} from '../src/cad-native-kernel.js';
import {importCadStep} from '../src/cad-step-io.js';
import {buildMeshSelectionTopology} from '../src/mesh-selection-data.js';
import {inspectMeshTopology} from '../src/mesh-inspector.js';

const output=path.resolve(process.argv[2]??'work/expansion-baseline.json'),directory=path.join(path.dirname(output),'expansion-fixtures');
fs.mkdirSync(directory,{recursive:true});
const photo=perspectiveReference(),pixels=pixelPlate(),mesh=damagedMeshFixture(),measurements=[];
function bench(name,run,rounds=5){
 const durations=[],before=process.memoryUsage();let result;
 for(let i=0;i<rounds+1;i++){const start=performance.now();result=run();if(i)durations.push(performance.now()-start);}
 durations.sort((a,b)=>a-b);const after=process.memoryUsage();
 measurements.push({name,medianMs:+durations[Math.floor(rounds/2)].toFixed(3),rounds,heapBefore:before.heapUsed,heapAfter:after.heapUsed,rssAfter:after.rss,scope:'JS heap and process RSS samples, not a peak memory measurement.'});return result;
}
const oc=await OCModule({print:()=>{},printErr:()=>{}}),native=bench('native CAD and STEP fixture generation',()=>nativeExpansionFixtures(oc),3);
const near=(a,b,tol=1e-6)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
const plateShape=readCadBrep(oc,native.plate.nodes[0].brep.data);let plateStats;
try{plateStats=validateCadSolid(oc,plateShape);assert.equal(plateStats.solids,1);near(plateStats.volume,EXPANSION_EXPECTED.plateVolume);plateStats.bounds.size.forEach((n,i)=>near(n,EXPANSION_EXPECTED.plateSize[i]));assert(brepHasNoTriangulation(native.plate.nodes[0].brep.data));}finally{plateShape.delete();}
const stepStats=bench('STEP independent reload',()=>importCadStep(oc,native.step).stats,3);assert.equal(stepStats.solids,2);near(stepStats.volume,EXPANSION_EXPECTED.assemblyVolume);
const topology=bench('damaged curved mesh diagnosis',()=>inspectMeshTopology(buildMeshSelectionTopology(mesh,{objectId:'curved-opening'})),10);
assert.equal(topology.categories.boundary.count,EXPANSION_EXPECTED.meshBoundaryEdges);assert.equal(topology.componentCount,EXPANSION_EXPECTED.meshComponents);
const plane=bench('four-point homography',()=>photoPlane(photo.perspective,photo.width,photo.height),100);
const inside=[13.5,22],back=projectPhotoPoint(plane.toPlane,projectPhotoPoint(plane.toOriginal,inside));inside.forEach((n,i)=>near(back[i],n));
const rectified=bench('plane rectification 320px',()=>rectifyPhotoPixels(pixels,photo.perspective,{maxSide:320}));assert.equal(rectified.width,320);assert.equal(rectified.height,240);
const proposal=bench('local contour proposal',()=>suggestPhotoContour(pixels));assert.equal(proposal.confirmed,false);
const assemblyText=bench('native assembly project serialization',()=>serializeCadProject(native.assembly),20);assert.deepEqual(parseCadProject(assemblyText),native.assembly);
const manifest=[];
function write(name,data){fs.writeFileSync(path.join(directory,name),data);manifest.push({file:name,bytes:Buffer.byteLength(data),sha256:createHash('sha256').update(data).digest('hex')});}
write('Bohrplatte.ocad',serializeCadProject(native.plate));write('Baugruppe.ocad',assemblyText);write('Baugruppe.step',native.step);write('Gekruemmte-Oeffnung.json',JSON.stringify(mesh));
const stored=storedPhoto();write('Frontal.png',Buffer.from(stored.image.dataUrl.split(',')[1],'base64'));write('Fotoreferenzen.json',JSON.stringify({frontal:stored.reference,perspective:photo,synthetic:true}));write('Sollwerte.json',JSON.stringify(EXPANSION_EXPECTED,null,2));
const report={ok:true,basis:'Formnaro 0.106.0; generated synthetic fixtures, no user data',platform:process.platform,node:process.version,expected:EXPANSION_EXPECTED,quality:{plate:plateStats,step:stepStats,mesh:{boundaryEdges:topology.categories.boundary.count,components:topology.componentCount,diagnosisOnly:true},photo:{roundtripErrorMm:Math.hypot(...back.map((n,i)=>n-inside[i])),rectifiedPixels:[rectified.width,rectified.height],proposalConfirmed:proposal.confirmed}},measurements,memory:{...process.memoryUsage(),scope:'End-of-run process samples, not live native allocations or peak.'},manifest};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:true,report:output,fixtures:manifest.length,measurements:measurements.map(({name,medianMs})=>({name,medianMs}))}));
