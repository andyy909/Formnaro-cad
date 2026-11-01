import test from 'node:test';
import assert from 'node:assert/strict';
import {installCadPracticeRunner} from '../src/cad-practice-runner.js';

// Exercise the real runner's lifecycle without CAD work or native input.
function harness(t){
 const elements=new Map(['practice-pointer','practice-caption','practice-pause','practice-stop','practice-interaction-warning','practice-speed','practice-end','practice-main'].map(id=>[id,{style:{},textContent:'',disabled:false}]));
 const sessionBar={style:{},contains:()=>false,querySelector:s=>elements.get(s.slice(1))};const overlay={style:{},hidden:false,querySelector:s=>elements.get(s.slice(1)),contains:()=>false};
 const listeners=new Map();let plan,cancel,resolveReport,releasePreview,cancelled=0,applies=0;
 const report=new Promise(resolve=>{resolveReport=resolve;});
 const preview=new Promise(resolve=>{releasePreview=resolve;});
 const oldDocument=globalThis.document,oldWindow=globalThis.window;
 globalThis.document={createElement:tag=>tag==='aside'?sessionBar:overlay,body:{append(){}},getElementById:()=>null,querySelectorAll:()=>[]};
 globalThis.window={addEventListener:(name,fn)=>listeners.set(name,fn)};
 t.after(()=>{globalThis.document=oldDocument;globalThis.window=oldWindow;});
 installCadPracticeRunner({modelUIFactory:()=>({reset(){},aliasState:()=>[],run:async()=>{await preview;if(!cancelled)applies++;return {};}}),desktop:{onPracticePlan:fn=>{plan=fn;},onPracticeCancel:fn=>{cancel=fn;},practiceInput:async()=>{},submitPracticeResult:resolveReport,practiceReady:async()=>{},practiceAbort:async()=>{}},controller:{cancel(){cancelled++;},readSnapshot:()=>({nodes:[]}),revision:()=> 'test'},access:{preview:()=>preview,apply:async()=>{applies++;},discard(){}},getSelection:()=>[],settled:async()=>{}});
 return {overlay,notice:elements.get('practice-interaction-warning'),start(){plan({version:1,actions:[{kind:'model',commands:[{op:'create',type:'box'}]}]});},release:()=>releasePreview({previewId:'test',revision:'test'}),report,stop:()=>elements.get('practice-stop').onclick(),cancel:()=>cancel(),escape:()=>listeners.get('keydown')({isTrusted:true,key:'Escape',preventDefault(){},stopImmediatePropagation(){}}),applies:()=>applies,cancelled:()=>cancelled};
}

test('Practice notice is hidden until an exercise starts',t=>{assert.equal(harness(t).overlay.hidden,true);});
test('Practice completion removes the entire notice from the model view',async t=>{
 const h=harness(t);h.start();assert.equal(h.overlay.hidden,false);h.release();assert.equal((await h.report).ok,true);assert.equal(h.applies(),1);assert.equal(h.overlay.hidden,true);
});
for(const action of ['stop','escape','cancel'])test(`Practice ${action} removes the notice and does not apply a pending preview`,async t=>{
 const h=harness(t);h.start();assert.equal(h.overlay.hidden,false);h[action]();assert.equal(h.overlay.hidden,true);h.release();assert.equal((await h.report).ok,false);assert.equal(h.applies(),0);assert.equal(h.cancelled(),1);
});

test('construction notice explicitly allows tempo controls and becomes a calm playback notice afterwards',async t=>{
 const h=harness(t);h.start();await new Promise(resolve=>setImmediate(resolve));assert.match(h.notice.textContent,/Modell wird aufgebaut/);assert.match(h.notice.textContent,/Tempo, Pause und Stop.*jederzeit/);h.release();assert.equal((await h.report).ok,true);assert.match(h.notice.textContent,/Vorführung läuft/);assert.doesNotMatch(h.notice.textContent,/nichts anklicken|Maus nicht bewegen|nicht ins Modell/);assert.equal(h.notice.style.fontSize,'14px');
});
