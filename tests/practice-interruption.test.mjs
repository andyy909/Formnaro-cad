import test from 'node:test';
import assert from 'node:assert/strict';
import {installCadPracticeRunner} from '../src/cad-practice-runner.js';

// Exercise the real runner's lifecycle without CAD work or native input.
function harness(t,{converterOpen=false}={}){
 const elements=new Map(['practice-pointer','practice-caption','practice-pause','practice-stop','practice-interaction-warning','practice-speed','practice-end','practice-main'].map(id=>[id,{style:{},textContent:'',disabled:false}]));
 const sessionBar={style:{},contains:()=>false,querySelector:s=>elements.get(s.slice(1))};const overlay={style:{},hidden:false,querySelector:s=>elements.get(s.slice(1)),contains:()=>false};
 const listeners=new Map();let plan,cancel,resolveReport,releasePreview,cancelled=0,completed=0;
 const report=new Promise(resolve=>{resolveReport=resolve;});
 const preview=new Promise(resolve=>{releasePreview=resolve;});
 const oldDocument=globalThis.document,oldWindow=globalThis.window;
 globalThis.document={createElement:tag=>tag==='aside'?sessionBar:overlay,body:{append(){}},
  getElementById:id=>converterOpen&&id==='converter-import'?{disabled:true}:null,
  querySelector:selector=>converterOpen&&selector==='#modal[open] #stl-workbench'?{}:null,querySelectorAll:()=>[]};
 globalThis.window={addEventListener:(name,fn)=>listeners.set(name,fn)};
 t.after(()=>{globalThis.document=oldDocument;globalThis.window=oldWindow;});
 installCadPracticeRunner({desktop:{onPracticePlan:fn=>{plan=fn;},onPracticeCancel:fn=>{cancel=fn;},practiceInput:async()=>{},submitPracticeResult:resolveReport,practiceReady:async()=>{},practiceAbort:async()=>{},practiceStatus:async()=>({generation:0})},controller:{cancel(){cancelled++;},readSnapshot:()=>({nodes:[]}),revision:()=> 'test'},access:{preview:()=>{throw Error('Lifecycle runner must not compute geometry directly');},apply:()=>{throw Error('Lifecycle runner must not apply geometry directly');},discard(){}},modelUIFactory:()=>({reset(){},aliasState:()=>({}),run:async()=>{await preview;completed++;return {};}}),getSelection:()=>[],getPracticeConverterState:()=>({hasResult:false}),settled:async()=>{}});
 return {outside:()=>listeners.get('pointerdown')({isTrusted:true,target:{},preventDefault(){},stopImmediatePropagation(){}}),resume:()=>elements.get('practice-pause').onclick(),pauseLabel:()=>elements.get('practice-pause').textContent,overlay,notice:elements.get('practice-interaction-warning'),start(actions=[{kind:'model',commands:[{op:'create',type:'box',size:[10,10,10],as:'block'}]}]){plan({version:1,actions});},release:()=>releasePreview({previewId:'test',revision:'test'}),report,stop:()=>elements.get('practice-stop').onclick(),cancel:()=>cancel(),escape:()=>listeners.get('keydown')({isTrusted:true,key:'Escape',preventDefault(){},stopImmediatePropagation(){}}),completed:()=>completed,cancelled:()=>cancelled};
}

test('accidental outside click pauses the same exercise instead of cancelling its pending UI modelling step',async t=>{const h=harness(t);h.start();await new Promise(r=>setImmediate(r));h.outside();assert.equal(h.cancelled(),0,'Outside click must not cancel or discard the pending calculation');assert.equal(h.overlay.hidden,false);assert.match(h.pauseLabel(),/Weiter/);h.resume();h.release();assert.equal((await h.report).ok,true);assert.equal(h.completed(),1);});

for(const [target,reason] of [['menu:convert',/STL-Konverter ist bereits offen/],
 ['ui:id:practice-file-1',/STL-Konverter ist bereits offen/],
 ['ui:id:converter-import',/erst nach erfolgreicher Konvertierung.*converter-run/]]){
 test('the open converter explains why '+target+' cannot run',async t=>{
  const h=harness(t,{converterOpen:true});
  h.start([{kind:'ui',action:'click',target}]);
  const result=await h.report;
  assert.equal(result.ok,false);
  assert.match(result.reason,reason);
  assert.deepEqual(result.steps,[]);
 });
}
