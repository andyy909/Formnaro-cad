import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {checkPracticeResult} from '../src/cad-practice-quality.js';

const {validatePracticeQuality}=createRequire(import.meta.url)('../backend/practice-quality.cjs');
const width={id:'width',source:'User specified 44 mm',check:{kind:'size',target:'$existing-1',space:'worldAxes',expected:[44,null,null],tolerance:.01}};
const solids={id:'solids',source:'Single body',check:{kind:'solids',target:'$new',expected:1}};
const policy=(mode,extra={})=>validatePracticeQuality({mode,criteria:[width,solids],...extra});

function nativeFixture(){
 let revision='a'.repeat(16),previews=0;
 const measured=[],discarded=[];
 const controller={
  revision:()=>revision,
  preview:async()=>({previewId:'preview-'+ ++previews}),
  discard:id=>discarded.push(id),
  checkPreview:async(_id,[check])=>{
   measured.push(check);
   return {checks:[check.kind==='size'?{
    passed:false,actual:[42,20,20],error:{code:'AI_RESULT_MISMATCH',message:'Width outside tolerance'}
   }:{passed:false,error:{code:'AI_CHECK_UNSUPPORTED',message:'Cannot measure this model type'}}]};
  }
 };
 return {controller,measured,discarded,change:()=>revision='b'.repeat(16),previewCount:()=>previews};
}
const resolve=alias=>alias==='existing-1'?'actual-root':alias==='new'?'new-root':null;

test('only a trusted separate policy can set enforcement and criterion selection',()=>{
 assert.equal(policy('report').mode,'report');
 for(const input of [{mode:'strict',criteria:[]},{mode:'report',criteria:[width,width]},
  {mode:'enforce',criteria:[{...width,check:{...width.check,target:'external-id'}}]},
  {mode:'enforce',criteria:[width],enabled:['unknown']}])assert.throws(()=>validatePracticeQuality(input));
});

test('off mode leaves a recorded skip without invoking the native check',async()=>{
 const fixture=nativeFixture();
 const result=await checkPracticeResult(fixture.controller,policy('off'),{resolve});
 assert.deepEqual(result.items.map(item=>item.status),['skipped','skipped']);
 assert.equal(result.blocked,false);
 assert.equal(fixture.previewCount(),0);
});

test('the same fixed mismatch remains advisory or blocks only according to the policy',async()=>{
 for(const mode of ['report','enforce']){
  const fixture=nativeFixture();
  const result=await checkPracticeResult(fixture.controller,policy(mode,{enabled:['width']}),{resolve});
  assert.deepEqual(result.items.map(item=>item.status),['failed','skipped']);
  assert.equal(result.blocked,mode==='enforce');
  assert.equal(result.items[0].source,width.source);
  assert.equal(result.items[0].tolerance,width.check.tolerance);
  assert.deepEqual(result.items[0].measurement,{space:'worldAxes'});
  assert.deepEqual(result.items[0].actual,[42,20,20]);
  assert.equal(result.items[0].target,'$existing-1');
  assert.equal(fixture.measured[0].target,'actual-root');
  assert.deepEqual(fixture.discarded,['preview-1']);
 }
});

test('unavailable and inapplicable measurements are kept separate from geometric mismatches',async()=>{
 const fixture=nativeFixture();
 const result=await checkPracticeResult(fixture.controller,policy('enforce'),{
  resolve:alias=>alias==='new'?'new-root':null
 });
 assert.deepEqual(result.items.map(item=>item.status),['unavailable','not-applicable']);
 assert.equal(result.blocked,false);
});

test('a measurement with a stale revision is rejected and its read-only preview is discarded',async()=>{
 const fixture=nativeFixture();
 const measure=fixture.controller.checkPreview;
 fixture.controller.checkPreview=async(...args)=>{const report=await measure(...args);fixture.change();return report;};
 await assert.rejects(checkPracticeResult(fixture.controller,policy('report'),{resolve}),{code:'STALE_REVISION'});
 assert.deepEqual(fixture.discarded,['preview-1']);
});

test('independent export validation has a separate measured status, target and runtime failure',async()=>{
 const fixture=nativeFixture();
 const independent=validatePracticeQuality({mode:'enforce',criteria:[
  {id:'geometry',source:'STEP validity',check:{kind:'freecad',target:'$existing-1'}}
 ]});
 let available=true;
 fixture.controller.inspectFreeCADPreview=async(_id,{targetId})=>{
  assert.equal(targetId,'actual-root');
  if(!available)throw Object.assign(Error('No runtime'),{code:'FREECAD_UNAVAILABLE'});
  return {status:'checked',passed:true,geometry:{valid:true,closed:true,solids:1,check:'passed'},engineVersion:'fixture'};
 };
 assert.equal((await checkPracticeResult(fixture.controller,independent,{resolve})).items[0].status,'passed');
 available=false;
 const report=await checkPracticeResult(fixture.controller,independent,{resolve});
 assert.equal(report.items[0].status,'unavailable');
 assert.equal(report.items[0].code,'FREECAD_UNAVAILABLE');
 assert.equal(report.blocked,false);
 assert.equal(fixture.measured.length,0);
});

test('photo checks use fixed reference tolerances and measure saved pixels without a CAD preview',async()=>{
 const reference={version:1,imageId:'photo-'+'a'.repeat(16),digest:'a'.repeat(64),name:'Referenz',width:320,height:240,view:'front',
  scale:{points:[[40,40],[240,40]],mm:50,referenceErrorMm:0,pickErrorPx:3,source:'user',note:'Bekannte Kante'},
  outline:[],holes:[],unknowns:[],dimensions:[{name:'Kurze Kante',source:'measured',points:[[240,40],[240,140]]}]};
 const criteria=[
  {id:'scale',source:'Bekannte Kalibrierung',check:{kind:'photoScale',target:'$photo-1',expected:.25,tolerance:.005}},
  {id:'length',source:'Bekannte kurze Kante',check:{kind:'photoLength',target:'$photo-1',measurementIndex:0,expected:25,tolerance:1}}
 ];
 const fixed=validatePracticeQuality({mode:'enforce',criteria}),fixture=nativeFixture();
 const run=ref=>checkPracticeResult(fixture.controller,fixed,{resolve,resolvePhoto:alias=>alias==='photo-1'?ref:null});
 const correct=await run(reference);
 assert.deepEqual(correct.items.map(({status,actual})=>[status,actual]),[['passed',.25],['passed',25]]);
 const wrong=structuredClone(reference);
 wrong.scale.points=[[35,33],[208,33]];
 wrong.dimensions[0].points=[[208,33],[208,113]];
 const rejected=await run(wrong);
 assert.equal(rejected.blocked,true);
 assert.deepEqual(rejected.items.map(({status,unit,tolerance})=>[status,unit,tolerance]),[['failed','mm/px',.005],['failed','mm',1]]);
 assert(Math.abs(rejected.items[1].actual-23.121387283236995)<1e-9);
 assert.deepEqual((await run(null)).items.map(({status})=>status),['unavailable','unavailable']);
 assert.equal(fixture.previewCount(),0);
 const mode='FORMNARO_VERIFY_PRACTICE_MATRIX_MODE',selection='FORMNARO_VERIFY_PRACTICE_MATRIX_CRITERIA';
 const savedMode=process.env[mode],savedSelection=process.env[selection];
 try{
  const {practiceComparisonPolicy}=createRequire(import.meta.url)('../backend/practice-vibe-verification.cjs');
  process.env[mode]='report';
  process.env[selection]='["scale","length"]';
  const short=structuredClone(reference);
  short.dimensions[0].points=[[240,40],[240,120]];
  const selected=validatePracticeQuality(practiceComparisonPolicy(criteria,['scale']));
  const advisory=await checkPracticeResult(fixture.controller,selected,{resolve,resolvePhoto:()=>short});
  assert.deepEqual(advisory.items.map(item=>[item.id,item.status]),[['scale','passed'],['length','failed']]);
  assert.equal(advisory.blocked,false);
  process.env[selection]='["unknown"]';
  assert.throws(()=>practiceComparisonPolicy(criteria,['scale']),/Invalid private catalog criteria/);
  process.env[selection]='["scale"]';
  process.env[mode]='off';
  assert.throws(()=>practiceComparisonPolicy(criteria,['scale']),/Invalid private catalog criteria/);
 }finally{
  if(savedMode===undefined)delete process.env[mode];else process.env[mode]=savedMode;
  if(savedSelection===undefined)delete process.env[selection];else process.env[selection]=savedSelection;
 }
});

test('motion checks measure the selected joint at its saved position and distinguish missing joints',async()=>{
 const fixture=nativeFixture();
 const joints=[{childId:'spindle',kind:'revolute',value:360},{childId:'slide',kind:'prismatic',value:4}];
 fixture.controller.readSnapshot=()=>({joints:{joints}});
 const resolveMotion=alias=>alias==='existing-2'?'spindle':alias==='existing-3'?'slide':null;
 const fixed=validatePracticeQuality({mode:'enforce',criteria:[
  {id:'rotation',source:'Eine Umdrehung',check:{kind:'jointValue',target:'$existing-2',jointKind:'revolute',expected:360,tolerance:.001}},
  {id:'advance',source:'4 mm Steigung',check:{kind:'jointValue',target:'$existing-3',jointKind:'prismatic',expected:4,tolerance:.001}}
 ]});
 const run=()=>checkPracticeResult(fixture.controller,fixed,{resolve:resolveMotion});
 assert.deepEqual((await run()).items.map(({status,actual,unit})=>[status,actual,unit]),[['passed',360,'°'],['passed',4,'mm']]);
 joints[0].value=90;
 joints.pop();
 const failure=await run();
 assert.equal(failure.blocked,true);
 assert.deepEqual(failure.items.map(item=>item.status),['failed','unavailable']);
 assert.equal(fixture.previewCount(),0);
});

test('an equal-length measurement on the wrong image feature fails a fixed point check',async()=>{
 const reference={version:1,imageId:'photo-'+'b'.repeat(16),digest:'b'.repeat(64),name:'Referenz',width:320,height:240,view:'front',
  scale:{points:[[40,40],[240,40]],mm:50,referenceErrorMm:0,pickErrorPx:3,source:'user',note:'Bekannte Kante'},
  outline:[],holes:[],unknowns:[],dimensions:[{name:'Kante',source:'measured',points:[[40,140],[40,40]]}]};
 const check={kind:'photoLength',target:'$photo-1',measurementIndex:0,expected:25,tolerance:1,expectedPoints:[[240,40],[240,140]],pointTolerancePx:4};
 const policy=validatePracticeQuality({mode:'enforce',criteria:[{id:'feature',source:'Festgelegte rechte Kante',check}]});
 const fixture=nativeFixture(),run=()=>checkPracticeResult(fixture.controller,policy,{resolve,resolvePhoto:()=>reference});
 const bad=(await run()).items[0];
 assert.equal(bad.actual,25);
 assert.equal(bad.status,'failed');
 assert.equal(bad.pointsError,200);
 reference.dimensions[0].points=[[240,140],[240,40]];
 assert.equal((await run()).items[0].status,'passed');
});
