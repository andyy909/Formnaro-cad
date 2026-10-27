import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {workingSpeedReport} from '../scripts/working-speed-report.mjs';

const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const quality={display:{deflection:.02,angleDegrees:8},export:{deflection:.01,angleDegrees:5}};
const tasks=[...['pipeline','imported','colored'].flatMap(fixture=>['move','rotate','scale','selection'].map(operation=>'cad.'+fixture+'.'+operation)),
 'mesh.dense.selection','mesh.many.selection','mesh.dense.move','mesh.dense.rotate','mesh.dense.scale','mesh.dense.refresh20',
 'sketch128.zoom','sketch128.preview','project.serializeParse','project.duplicateMs','project.undoMs','cad.group6'];
function rawReport(ms=100){
 const cadFixture=()=>({selection:[ms,ms,ms],measurements:['move','rotate','scale'].flatMap(operation=>[0,1,2,3].map(()=>({operation,ms})))});
 return {ok:true,checks:Array.from({length:11},(_,i)=>'synthetic geometry/source/Undo assertion '+i),errors:[],external:[],quality:structuredClone(quality),
  metrics:{cad:Object.fromEntries(['pipeline','imported','colored'].map(name=>[name,cadFixture()])),
   mesh:{dense:{selectionPairMs:[ms,ms,ms],refresh20Ms:ms},many:{selectionPairMs:[ms,ms,ms]},transforms:['move','rotate','scale'].map(name=>({name,ms}))},
   sketch:{millisecondsPerEvent:ms,previewMs:ms},operations:{projectRoundTripMs:[ms,ms,ms],duplicateUndo:[{duplicateMs:ms,undoMs:ms},{duplicateMs:ms,undoMs:ms}],group6Ms:ms}}};
}
function fixture(t,{before=100,after=130}={}){
 const temporaryRoot=path.resolve(os.tmpdir()),directory=fs.mkdtempSync(path.join(temporaryRoot,'formnaro-speed-deferred-'));
 assert.equal(path.dirname(directory),temporaryRoot);
 t.after(()=>{assert.equal(path.dirname(directory),temporaryRoot);assert.ok(path.basename(directory).startsWith('formnaro-speed-deferred-'));fs.rmSync(directory,{recursive:true,force:true});});
 const out=path.join(directory,'out'),work=path.join(directory,'work');fs.mkdirSync(out);fs.mkdirSync(work);
 const baselineReport=path.join(directory,'baseline-raw.json'),baselineFile=path.join(directory,'baseline-pin.json'),sourceReport=path.join(directory,'source-raw.json'),packagedReport=path.join(directory,'packaged-raw.json');
 for(const [file,value]of [[baselineReport,rawReport(before)],[sourceReport,rawReport(after)],[packagedReport,rawReport(after)]])fs.writeFileSync(file,JSON.stringify(value,null,2));
 fs.writeFileSync(baselineFile,JSON.stringify({report:baselineReport,sha256:sha(baselineReport),identity:{unchangedProductBundle:true,executableSha256:'synthetic-pinned-executable',asarSha256:'synthetic-pinned-asar'}}));
 const rawFiles=[baselineReport,baselineFile,sourceReport,packagedReport],hashes=rawFiles.map(sha);
 return {out,work,sourceReport,packagedReport,baselineReport,baselineFile,
  options:{sourceReport,packagedReport,out,work,baselineFile,version:'0.84.0',baselineVersion:'0.83.0',ratioLimit:1.25,absoluteLimitMs:10,includePreviousEvidence:false},
  saved:()=>JSON.parse(fs.readFileSync(path.join(out,'Leistungspruefung.json'),'utf8')),
  unchanged(){assert.deepEqual(rawFiles.map(sha),hashes);for(const file of [baselineReport,sourceReport,packagedReport])assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')).quality,quality);}};
}
function allRows(report,{slowdown}){
 assert.equal(report.comparisons.length,48);assert.deepEqual(report.threshold,{ratioLimit:1.25,absoluteLimitMs:10});
 for(const mode of ['source','packaged'])assert.deepEqual(report.comparisons.filter(row=>row.mode===mode).map(row=>row.task),tasks);
 assert.ok(report.comparisons.every(row=>row.materialSlowdown===slowdown));
}

test('default legacy speed decision still throws and writes the unchanged positive slowdown evidence',t=>{
 const f=fixture(t);assert.throws(()=>workingSpeedReport(f.options),/Potential material slowdown/);
 const report=f.saved();assert.equal(report.materialSlowdown,true);assert.equal(Object.hasOwn(report,'decisionDeferred'),false);allRows(report,{slowdown:true});
 assert.ok(report.comparisons.every(row=>row.beforeMs===100&&row.afterMs===130&&row.ratio===1.3));
 assert.equal(report.baseline.sha256,sha(f.baselineReport));assert.equal(report.sourceReport.sha256,sha(f.sourceReport));assert.equal(report.packagedReport.sha256,sha(f.packagedReport));
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.work,'performance.json'),'utf8')),report);f.unchanged();
});

test('opt-in deferral returns the positive raw slowdown and an explicit deferred flag without clearing any comparison',t=>{
 const f=fixture(t),result=workingSpeedReport({...f.options,deferPotentialSlowdown:true}),report=f.saved();
 assert.equal(result.materialSlowdown,true);assert.equal(result.decisionDeferred,true);assert.equal(result.comparisons,48);assert.equal(result.sha256,sha(result.file));
 assert.equal(report.materialSlowdown,true);assert.equal(report.decisionDeferred,true);allRows(report,{slowdown:true});
 assert.ok(report.comparisons.every(row=>row.beforeMs===100&&row.afterMs===130&&row.ratio===1.3));
 assert.match(report.limits,/release requires separate alternating paired repetition evidence/);assert.match(report.limits,/outliers remain recorded/);f.unchanged();
});

test('false keeps legacy failure and unchanged-speed reports retain the previous return shape',t=>{
 const slow=fixture(t);assert.throws(()=>workingSpeedReport({...slow.options,deferPotentialSlowdown:false}),/Potential material slowdown/);assert.equal(slow.saved().materialSlowdown,true);slow.unchanged();
 for(const option of [{},{deferPotentialSlowdown:false}]){
  const f=fixture(t,{after:100}),result=workingSpeedReport({...f.options,...option});assert.equal(result.materialSlowdown,false);assert.equal(Object.hasOwn(result,'decisionDeferred'),false);assert.equal(Object.hasOwn(f.saved(),'decisionDeferred'),false);allRows(f.saved(),{slowdown:false});f.unchanged();
 }
 const deferred=fixture(t,{after:100}),result=workingSpeedReport({...deferred.options,deferPotentialSlowdown:true});assert.equal(result.materialSlowdown,false);assert.equal(result.decisionDeferred,true);allRows(deferred.saved(),{slowdown:false});deferred.unchanged();
});

test('deferral preserves strict percent AND absolute thresholds including exact boundaries',t=>{
 for(const [before,after,slowdown]of [[100,125,false],[5,10,false],[1000,1011,false],[40,50,false],[40,50.01,true]]){
  const f=fixture(t,{before,after}),result=workingSpeedReport({...f.options,deferPotentialSlowdown:true});assert.equal(result.materialSlowdown,slowdown);allRows(f.saved(),{slowdown});f.unchanged();
 }
});

test('nonboolean deferral values are rejected before reading or writing performance evidence',t=>{
 const f=fixture(t);
 for(const value of [null,0,1,'false','true',[],{}])assert.throws(()=>workingSpeedReport({...f.options,baselineFile:path.join(f.work,'absent-baseline.json'),deferPotentialSlowdown:value}),/explicit boolean/);
 assert.deepEqual(fs.readdirSync(f.out),[]);assert.deepEqual(fs.readdirSync(f.work),[]);f.unchanged();
});
