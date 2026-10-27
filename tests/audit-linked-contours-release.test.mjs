import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {auditLinkedGeometryEvidence,auditLinkedUiEvidence,auditLinkedUnitEvidence,authoredLinkedContourProofs,auditLinkedContoursRelease,auditLegacyPotentialFlags,auditLegacyRepeatedEvidence} from '../scripts/audit-linked-contours-release.mjs';
import {compareLegacySpeedReports} from '../scripts/run-cad-legacy-speed.mjs';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const affine=[-1.2,0,0,0,.35,1.1,0,0,.2,.1,1.4,0,40,-10,5,1];
const affineBounds=[[26.5,-16.3,9.2],[55.3,-2.8,13.4]];
function body(id,localVolume,worldVolume=localVolume,worldBounds){return {id,localVolume,worldVolume,worldBounds,transform:[...identity],brepSha256:id.charCodeAt(0).toString(16).padStart(2,'0').repeat(32),valid:true,closed:true,solids:1};}
function link(){return {inputSignaturesVerified:true,fullFramesVerified:true,sourceProfileSnapshotVerified:true};}
function exported(volume,bounds){return {expectedWorldVolume:volume,expectedWorldBounds:structuredClone(bounds),step:{valid:true,closed:true,solids:1,volume,bounds:structuredClone(bounds)},stl:{closed:true,oriented:true,components:1,volume,bounds:structuredClone(bounds)}};}
function fixture(){
 const outputs={};for(const [name,width]of [['base',20],['updated',30],['parameters',40]]){const source=[[-width/2,-6,-3],[width/2,6,3]],first=[[-width/2,-6,3],[width/2,6,8]],second=[[-width/2,-6,8],[width/2,6,10]];outputs[name]={widthMm:width,nativeBodies:[body('source',width*72,width*72,source),body('first',width*60,width*60,first),body('second',width*24,width*24,second),body('other',189)],links:[link(),link()]};if(name!=='parameters')outputs[name].export=exported(width*60,first);}
 outputs.affine={sourceMatrix:[...affine],determinant:-1.848,nativeBodies:[body('source',1440,2661.12),body('first',720,1330.56,affineBounds)],links:[link()],export:exported(1330.56,affineBounds)};
 return {ok:true,engine:'FreeCAD 1.1.4',occt:'7.8.1',checkedNativeBodies:18,outputs,stepReplacement:{nativeBodies:[body('a',189),body('b',126),body('c',2160),body('b',126)],oldFaceKey:'d'.repeat(64),exactOriginalBodyRetained:true,replacedBodyDetected:true,cachedTargetUnchanged:true,noFaceIndexOrNearest:true},finalExactUpdatedRestoration:true,workspaceMatchesUISnapshot:true};
}

test('P3 audit independently requires fixed analytic bodies, affine bounds, and unchanged cached target after STEP replacement',()=>{
 assert.deepEqual(auditLinkedGeometryEvidence(fixture()),{nativeBodies:18,widthsMm:[20,30,40],affineWorldVolumeMm3:1330.56,stepSourceVolumesMm3:[189,2160]});
 for(const mutate of [r=>r.checkedNativeBodies=17,r=>delete r.outputs.parameters,r=>r.outputs.updated.widthMm=29,r=>r.outputs.parameters.nativeBodies[0].localVolume-=1,r=>r.outputs.base.nativeBodies[1].worldBounds[1][2]=9,r=>r.outputs.updated.export.stl.volume+=.001,r=>r.outputs.base.export.step.solids=2,r=>r.outputs.base.export.stl.oriented=false,r=>r.outputs.affine.sourceMatrix[4]=0,r=>r.outputs.affine.nativeBodies[1].worldVolume=720,r=>r.outputs.affine.export.step.bounds[0][2]=9.21,r=>r.outputs.affine.links[0].fullFramesVerified=false,r=>r.outputs.updated.links[0].sourceProfileSnapshotVerified=false,r=>r.stepReplacement.nativeBodies[2].brepSha256=r.stepReplacement.nativeBodies[0].brepSha256,r=>r.stepReplacement.nativeBodies[3].brepSha256='e'.repeat(64),r=>r.stepReplacement.noFaceIndexOrNearest=false,r=>r.workspaceMatchesUISnapshot=false,r=>r.finalExactUpdatedRestoration=false,r=>r.outputs.base.nativeBodies[0].transform[3]=NaN]){const report=fixture();mutate(report);assert.throws(()=>auditLinkedGeometryEvidence(report));}
});

function ui(version,labels){return {ok:true,appVersion:version,isolatedProfile:true,errors:[],external:[],checks:labels.map(label=>({label}))};}
function labels(n,prefix='previous '){return Array.from({length:n},(_,index)=>prefix+index);}
test('P3 audit preserves every historical UI label and full count, including all 59 mesh selection proofs',()=>{
 const old=ui('0.83.0',labels(59)),current=ui('0.84.0',labels(59));assert.equal(auditLinkedUiEvidence(current,old,{flag:'mesh-selection'}),59);
 assert.throws(()=>auditLinkedUiEvidence(ui('0.84.0',labels(35)),ui('0.83.0',labels(35)),{flag:'mesh-selection'}));
 const replaced=structuredClone(current);replaced.checks[58].label='new proof instead of old proof';assert.throws(()=>auditLinkedUiEvidence(replaced,old,{flag:'mesh-selection'}),/proof removed/);
 assert.throws(()=>auditLinkedUiEvidence(current,ui('0.83.0',labels(60)),{flag:'mesh-selection'}),/count reduced/);
 assert.throws(()=>auditLinkedUiEvidence(current,undefined,{flag:'mesh-selection'}),/Previous accepted UI scope missing/);
 const wrongPrior=structuredClone(old);wrongPrior.errors.push('old renderer failed');assert.throws(()=>auditLinkedUiEvidence(current,wrongPrior,{flag:'mesh-selection'}));
 const duplicate=structuredClone(current);duplicate.checks[58]=duplicate.checks[0];assert.throws(()=>auditLinkedUiEvidence(duplicate,old,{flag:'mesh-selection'}));
});
test('P3 audit requires all authored contour proofs and rejects unrelated replacement labels',()=>{
 const authored=authoredLinkedContourProofs();assert.ok(authored.length>=48);assert.equal(new Set(authored).size,authored.length);assert.equal(auditLinkedUiEvidence(ui('0.84.0',authored),undefined,{flag:'linked-contours',authored}),authored.length);
 const replacement=[...authored];replacement[0]='unrelated passing proof';assert.throws(()=>auditLinkedUiEvidence(ui('0.84.0',replacement),undefined,{flag:'linked-contours',authored}),/Authored UI proof absent/);
});
test('P3 audit rejects skipped, cancelled, todo, failed or uncounted unit proofs',()=>{
 const good='# tests 500\n# pass 500\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';assert.equal(auditLinkedUnitEvidence(good,500,428),500);
 for(const key of ['fail','cancelled','skipped','todo']){assert.throws(()=>auditLinkedUnitEvidence(good.replace('# '+key+' 0','# '+key+' 1'),500,428));assert.throws(()=>auditLinkedUnitEvidence(good.replace('# '+key+' 0\n',''),500,428));}
 assert.throws(()=>auditLinkedUnitEvidence(good.replace('# pass 500','# pass 499'),500,428));assert.throws(()=>auditLinkedUnitEvidence(good,499,428));assert.throws(()=>auditLinkedUnitEvidence(good,500,501));
});
test('P3 auditor refuses an incomplete delivery and writes no successful report',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-p3-audit-'));try{assert.throws(()=>auditLinkedContoursRelease(directory),/ENOENT/);assert.equal(fs.existsSync(path.join(directory,'Abschlusspruefung.json')),false);}finally{fs.rmdirSync(directory);}
});

function historical(value=100){const array=n=>Array(n).fill(value);return {ok:true,isolatedProfile:true,appVersion:'0.84.0',checks:Array.from({length:11},(_,i)=>'Source/quality proof '+i),errors:[],external:[],metrics:{cad:Object.fromEntries(['pipeline','imported','colored'].map(name=>[name,{selection:array(10),measurements:['move','rotate','scale'].flatMap(operation=>Array.from({length:4},()=>({operation,ms:value})))}])),mesh:{dense:{selectionPairMs:array(20),refresh20Ms:value},many:{selectionPairMs:array(10)},transforms:['move','rotate','scale'].map(name=>({name,ms:value}))},sketch:{millisecondsPerEvent:value,previewMs:value},operations:{projectRoundTripMs:array(6),duplicateUndo:Array.from({length:3},()=>({duplicateMs:value,undoMs:value})),group6Ms:value}}};}
test('P3 audit independently recomputes all repeated legacy samples and rejects forged green flags',()=>{
 const pairs=[{baseline:historical(),candidate:historical(126)},{baseline:historical(),candidate:historical()}],record=compareLegacySpeedReports(pairs);assert.equal(auditLegacyRepeatedEvidence(pairs,record).comparisons,48);assert.equal(record.comparisons.filter(row=>row.materialSlowdown).length,24);
 for(const mutate of [r=>r.comparisons[0].materialSlowdown=false,r=>r.comparisons[0].afterSamples[0]=0,r=>r.comparisons.pop(),r=>r.threshold.absoluteLimitMs=20,r=>r.regressions.push({task:'invented',affectedRounds:[1,2]})]){const changed=structuredClone(record);mutate(changed);assert.throws(()=>auditLegacyRepeatedEvidence(pairs,changed));}
 const slow=[{baseline:historical(),candidate:historical(126)},{baseline:historical(),candidate:historical(126)}],failed=compareLegacySpeedReports(slow);assert.equal(failed.ok,false);assert.throws(()=>auditLegacyRepeatedEvidence(slow,failed),/Repeatable historical slowdown/);failed.ok=true;failed.regressions=[];failed.comparisons.forEach(row=>row.materialSlowdown=false);assert.throws(()=>auditLegacyRepeatedEvidence(slow,failed));
});
test('original single-process potential flags remain true and require both independently verified repeated modes',()=>{
 const rows=Array.from({length:48},(_,i)=>({mode:i<24?'source':'packaged',task:'task'+i,beforeMs:100,afterMs:i===0?126:100})),record={decisionDeferred:true,materialSlowdown:true,comparisons:rows.map(row=>({...row,materialSlowdown:row.afterMs>125}))},paired={processes:16,comparisons:192,groups:['source','packaged'].map(candidateMode=>({reference:'baseline',candidateMode,ok:true,comparisons:48,regressions:[]}))};assert.deepEqual(auditLegacyPotentialFlags(rows,record,paired,{reference:'baseline'}),[{mode:'source',task:'task0'}]);
 for(const mutate of [r=>r.materialSlowdown=false,r=>r.comparisons[0].materialSlowdown=false,r=>r.decisionDeferred=false]){const changed=structuredClone(record);mutate(changed);assert.throws(()=>auditLegacyPotentialFlags(rows,changed,paired,{reference:'baseline'}));}
 assert.throws(()=>auditLegacyPotentialFlags(rows,record,undefined,{reference:'baseline'}));const missing=structuredClone(paired);missing.groups.pop();assert.throws(()=>auditLegacyPotentialFlags(rows,record,missing,{reference:'baseline'}));const failed=structuredClone(paired);failed.groups[0].ok=false;assert.throws(()=>auditLegacyPotentialFlags(rows,record,failed,{reference:'baseline'}));
});
