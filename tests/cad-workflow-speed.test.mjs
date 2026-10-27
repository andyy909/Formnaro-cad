import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowSampleStats,compareWorkflowReports} from '../scripts/run-cad-workflow-speed.mjs';
import {createRequire} from 'node:module';
const {workflowStlSummary}=createRequire(import.meta.url)('../scripts/cad-workflow-speed-probe.cjs');
const samples=value=>Array(21).fill(value);
const report=value=>({ok:true,smoke:false,probe:'same',probeSha256:'same-sha',fixture:{geometrySha256:'same-geometry',quality:{export:{deflection:.01,angleDegrees:5}}},metrics:{selection:{mode:'warm',warmups:3,samples:samples(value)},'cold.reopen':{mode:'worker-cold',warmups:0,samples:[value,value,value]}}});

test('workflow statistics use median and nearest-rank p95 with every sample retained',()=>{
 assert.deepEqual(workflowSampleStats([9,1,5,3]),{count:4,medianMs:4,p95Ms:9,minMs:1,maxMs:9});assert.equal(workflowSampleStats(Array.from({length:21},(_,i)=>i)).p95Ms,19);for(const value of [[],[NaN],[Infinity],[-1],null])assert.throws(()=>workflowSampleStats(value));
});
test('workflow regression requires percent and absolute limits on at least two measured alternating pairs',()=>{
 const pair=(before,after)=>({baseline:report(before),candidate:report(after)});
 assert.equal(compareWorkflowReports([pair(100,126),pair(100,126)]).ok,false);
 assert.equal(compareWorkflowReports([pair(100,126),pair(100,110)]).ok,true);
 assert.equal(compareWorkflowReports([pair(1,2),pair(1,2)]).ok,true);
 assert.equal(compareWorkflowReports([pair(100,120),pair(100,120)]).ok,true);
 const result=compareWorkflowReports([pair(100,126),pair(100,126)]);assert.deepEqual(result.regressions.map(r=>r.key),['selection/medianMs','selection/p95Ms','cold.reopen/medianMs']);assert.ok(!result.comparisons.some(c=>c.mode==='worker-cold'&&c.statistic==='p95Ms'));
});
test('tail-only warm slowdown gates when repeatable, without using a cold three-sample p95 as proof',()=>{
 const before=report(100),after=report(100);after.metrics.selection.samples=[...Array(18).fill(100),140,140,140];const result=compareWorkflowReports([{baseline:before,candidate:after},{baseline:before,candidate:after}]);assert.equal(result.ok,false);assert.deepEqual(result.regressions.map(r=>r.key),['selection/p95Ms']);
});
test('probe identity, geometry, quality and minimum repeat counts are enforced before comparing speed',()=>{
 const baseline=report(100),candidate=report(100),pairs=()=>[{baseline,candidate},{baseline,candidate}];candidate.smoke=true;assert.throws(()=>compareWorkflowReports(pairs()));candidate.smoke=false;candidate.fixture.geometrySha256='different';assert.throws(()=>compareWorkflowReports(pairs()));candidate.fixture.geometrySha256='same-geometry';candidate.metrics.selection.samples=[1];assert.throws(()=>compareWorkflowReports(pairs()));assert.throws(()=>compareWorkflowReports([{baseline,candidate}]));
});
test('workflow file reader accepts existing ASCII and binary STL and rejects truncated/nonfinite exports',()=>{
 const text='solid p\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 2 0 0\nvertex 0 3 0\nendloop\nendfacet\nendsolid p\n',ascii=workflowStlSummary(Buffer.from(text));assert.equal(ascii.encoding,'ascii');assert.deepEqual(ascii.bounds,{min:[0,0,0],max:[2,3,0]});const binary=Buffer.alloc(134);binary.writeUInt32LE(1,80);binary.writeFloatLE(1,92);binary.writeFloatLE(2,108);binary.writeFloatLE(3,124);assert.equal(workflowStlSummary(binary).triangles,1);assert.throws(()=>workflowStlSummary(Buffer.from(text.replace('vertex 2','vertex NaN'))));assert.throws(()=>workflowStlSummary(binary.subarray(0,130)));
});
