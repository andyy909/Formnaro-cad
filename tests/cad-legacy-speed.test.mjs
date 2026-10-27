import test from 'node:test';
import assert from 'node:assert/strict';
import {legacySpeedMetrics,compareLegacySpeedReports,LEGACY_SPEED_THRESHOLD,runLegacySpeed} from '../scripts/run-cad-legacy-speed.mjs';

function report(value=100){
 const repeated=count=>Array(count).fill(value),cad=Object.fromEntries(['pipeline','imported','colored'].map(name=>[name,{selection:repeated(10),measurements:['move','rotate','scale'].flatMap(operation=>Array.from({length:4},()=>({operation,ms:value,stages:[]})))}]));
 return {ok:true,isolatedProfile:true,appVersion:'0.84.0',checks:Array.from({length:11},(_,index)=>'Original source and quality proof '+index),errors:[],external:[],metrics:{cad,mesh:{dense:{selectionPairMs:repeated(20),refresh20Ms:value},many:{selectionPairMs:repeated(10)},transforms:['move','rotate','scale'].map(name=>({name,ms:value}))},sketch:{millisecondsPerEvent:value,previewMs:value},operations:{projectRoundTripMs:repeated(6),duplicateUndo:Array.from({length:3},()=>({duplicateMs:value,undoMs:value})),group6Ms:value}}};
}
const pair=(before,after)=>({baseline:report(before),candidate:report(after)});
test('historical acceptance retains all 24 metric identities and original raw sample counts',()=>{
 const raw=report(10),rows=legacySpeedMetrics(raw);assert.equal(rows.length,24);assert.equal(new Set(rows.map(row=>row.task)).size,24);assert.deepEqual(rows.find(row=>row.task==='cad.pipeline.scale'),{task:'cad.pipeline.scale',sample:'median',samples:[10,10,10,10],ms:10});assert.equal(rows.find(row=>row.task==='mesh.dense.selection').samples.length,20);assert.equal(rows.find(row=>row.task==='mesh.many.selection').samples.length,10);assert.equal(rows.find(row=>row.task==='project.serializeParse').samples.length,6);assert.equal(rows.find(row=>row.task==='project.undoMs').samples.length,3);
 raw.metrics.cad.pipeline.measurements.filter(row=>row.operation==='scale').forEach((row,index)=>row.ms=[58.3,64.3,45.1,57.5][index]);assert.equal(legacySpeedMetrics(raw).find(row=>row.task==='cad.pipeline.scale').ms,57.9);
});
test('every historical task fails only on repeated AND25percent+10ms without discarding single-process flags',()=>{
 assert.deepEqual(LEGACY_SPEED_THRESHOLD,{ratioLimit:1.25,absoluteLimitMs:10,repeatedPairs:2});const bad=compareLegacySpeedReports([pair(100,126),pair(100,126)]);assert.equal(bad.ok,false);assert.equal(bad.comparisons.length,48);assert.equal(bad.regressions.length,24);assert.deepEqual(bad.regressions[0],{task:'cad.pipeline.move',affectedRounds:[1,2]});assert.deepEqual(bad.comparisons[0].beforeSamples,[100,100,100,100]);
 const one=compareLegacySpeedReports([pair(100,126),pair(100,110)]);assert.equal(one.ok,true);assert.equal(one.regressions.length,0);assert.equal(one.comparisons.filter(row=>row.materialSlowdown).length,24);assert.equal(compareLegacySpeedReports([pair(1,2),pair(1,2)]).ok,true);assert.equal(compareLegacySpeedReports([pair(100,125),pair(100,125)]).ok,true);assert.equal(compareLegacySpeedReports([pair(20,30),pair(20,30)]).ok,true);
});
test('a repeated mesh single-operation regression cannot disappear in other task medians',()=>{
 const pairs=[pair(100,100),pair(100,100)];for(const item of pairs)item.candidate.metrics.mesh.transforms.find(row=>row.name==='rotate').ms=140;const result=compareLegacySpeedReports(pairs);assert.equal(result.ok,false);assert.deepEqual(result.regressions,[{task:'mesh.dense.rotate',affectedRounds:[1,2]}]);assert.equal(result.comparisons.filter(row=>row.materialSlowdown).length,2);
});
test('missing, altered or invalid raw historical proofs cannot pass acceptance',()=>{
 for(const mutate of [r=>r.ok=false,r=>r.isolatedProfile=false,r=>r.errors.push('renderer error'),r=>r.external.push('https://example.invalid'),r=>r.checks.pop(),r=>r.checks[1]=r.checks[0],r=>r.metrics.cad.imported.measurements.pop(),r=>r.metrics.cad.pipeline.measurements[0].operation='unknown',r=>r.metrics.mesh.dense.selectionPairMs.pop(),r=>r.metrics.operations.duplicateUndo.pop(),r=>r.metrics.mesh.transforms[0].ms=NaN,r=>r.metrics.sketch.previewMs=-1]){const raw=report();mutate(raw);assert.throws(()=>legacySpeedMetrics(raw));}
 const changed=pair(100,100);changed.candidate.checks[0]='Different fixture/quality';assert.throws(()=>compareLegacySpeedReports([changed,pair(100,100)]));assert.throws(()=>compareLegacySpeedReports([pair(100,100)]));assert.throws(()=>compareLegacySpeedReports([pair(100,100),pair(100,100),pair(100,100)]));
});
test('the release runner refuses incomplete arguments before launching an application',async()=>{await assert.rejects(runLegacySpeed({}),/Use --baseline/);});
