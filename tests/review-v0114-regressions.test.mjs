import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dimensionSketchElement,editSketchCoordinate,trimExtendSketch} from '../src/sketch-tools.js';
import {resolveSketchProfile} from '../src/sketch-profile.js';
import {sketchExpression} from '../src/sketch-expression.js';
import {createCadProject} from '../src/cad-project.js';
import {createCadPersistence,MIXED_LIBRARY_KEY} from '../src/cad-persistence.js';
import {cadIdentity} from '../src/cad-affine.js';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../',import.meta.url));
const source=file=>fs.readFileSync(path.join(root,file),'utf8');
function commonJS(file,overrides={},tail=''){
 const local=createRequire(path.join(root,file)),context={require:name=>Object.hasOwn(overrides,name)?overrides[name]:local(name),module:{exports:{}},__dirname:path.dirname(path.join(root,file)),process,Buffer,AbortController,setImmediate,setTimeout,clearTimeout};
 vm.runInNewContext(source(file)+'\n'+tail,context,{filename:file});return context.module.exports;
}
function temporary(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-review-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
const curve=(type='bezier')=>({version:4,kind:'profile',variables:[{name:'rise',value:'10'}],dimensions:{height:'2'},constraints:[],elements:[{id:'curve',type,start:['0','0'],control1:['0','rise'],control2:['10','rise'],end:['10','0'],construction:false},{id:'base',type:'line',start:['10','0'],end:['0','0'],construction:false}],loops:[{id:'outer',role:'outer',elements:['curve','base']}]});
test('Aborting the first runtime caller leaves the concurrent caller and shared verification alive',async()=>{
 const api=commonJS('backend/freecad-runtime.cjs',{},`
 let complete,calls=0;
 resolveRuntime=()=>({available:true,bundled:true,root:'bundle',executable:'cad.exe'});
 verifyRuntime=(_root,{signal}={})=>{calls++;return new Promise((resolve,reject)=>{complete=resolve;signal?.addEventListener('abort',()=>reject(signal.reason),{once:true});});};
 module.exports={prepareRuntime,finish:()=>complete({ok:true}),calls:()=>calls};`);
 const first=new AbortController(),second=new AbortController();
 const a=api.prepareRuntime('cad.exe',{signal:first.signal}),b=api.prepareRuntime('cad.exe',{signal:second.signal});
 const verdicts=Promise.allSettled([a,b]);first.abort();api.finish();const results=await verdicts;
 assert.equal(results[0].status,'rejected');assert.equal(results[0].reason.name,'AbortError');assert.equal(results[1].status,'fulfilled');assert.equal(api.calls(),1);
 await api.prepareRuntime('cad.exe');assert.equal(api.calls(),1);
});
test('A cancelled runtime waiter returns immediately without waiting for another caller',async()=>{
 const api=commonJS('backend/freecad-runtime.cjs',{},`
 let complete;
 resolveRuntime=()=>({available:true,bundled:true,root:'bundle',executable:'cad.exe'});
 verifyRuntime=()=>new Promise(resolve=>{complete=resolve;});
 module.exports={prepareRuntime,finish:()=>complete({ok:true})};`);
 const abort=new AbortController(),pending=api.prepareRuntime('cad.exe',{signal:abort.signal});let settled=false;pending.catch(()=>{settled=true;});abort.abort();
 try{await new Promise(setImmediate);assert(settled);}finally{api.finish();await Promise.allSettled([pending]);}
});
for(const type of ['bezier','bspline'])test(type+' cannot be used as a circular trim target, cutter or radius dimension',()=>{
 const s=curve(type),before=structuredClone(s);
 for(const mode of ['trim','extend'])for(const ids of [{id:'curve',cutterId:'base'},{id:'base',cutterId:'curve'}])assert.throws(()=>trimExtendSketch(s,{...ids,mode}),error=>!(error instanceof TypeError)&&/Linien|Kreis|Bogen/.test(error.message));
 assert.throws(()=>dimensionSketchElement(s,'curve','radius','5'),/Maßart|Kurven/);assert.deepEqual(s,before);
});
test('Moving a curve control or circle centre does not move coincident wire endpoints',()=>{
 const s=curve();let moved=editSketchCoordinate(s,'curve','control1',0,'3');assert.deepEqual(moved.elements[0].start,s.elements[0].start);assert.deepEqual(moved.elements[1],s.elements[1]);
 s.elements.push({id:'circle',type:'circle',center:[0,0],diameter:2,construction:true});moved=editSketchCoordinate(s,'circle','center',0,'2');assert.deepEqual(moved.elements[0],s.elements[0]);assert.deepEqual(moved.elements[1],s.elements[1]);
 moved=editSketchCoordinate(s,'curve','start',0,'2');assert.deepEqual(moved.elements[1].end,['2','0']);assert.deepEqual(moved.elements.at(-1).center,[0,0]);
});
test('Formula endpoints remain shared and resolvable after a coordinate edit',()=>{
 const s=curve();s.elements[0].end=['rise','0'];const moved=editSketchCoordinate(s,'curve','end',0,'rise+2');assert.deepEqual(moved.elements[1].start,['rise+2','0']);assert.equal(resolveSketchProfile(moved,sketchExpression,{geometryOnly:true}).elements[0].end[0],12);
});
for(const bad of ['symbolic','outside','oversized'])for(const format of ['plan','script'])test(format+' results reject '+bad+' result.json before parsing',async t=>{
 const real=require('node:fs/promises'),runtime={prepareRuntime:async()=>{},resolveRuntime:()=>({bundled:true}),message:'missing'};
 const api=commonJS('backend/freecad.cjs',{
  './freecad-runtime.cjs':runtime,
  './freecad-plan.cjs':{validatePlan:p=>p},
  './freecad-python.cjs':{validateScript:s=>s,runPythonJob:async({job})=>real.writeFile(path.join(job,'result.json'),JSON.stringify({ok:true}))},
  'node:fs/promises':{...real,lstat:async f=>{const s=await real.lstat(f);return path.basename(f)==='result.json'?{isFile:()=>true,isSymbolicLink:()=>bad==='symbolic',size:bad==='oversized'?33*1024*1024:s.size}:s;},realpath:async f=>bad==='outside'&&path.basename(f)==='result.json'?path.join(os.tmpdir(),'outside','result.json'):real.realpath(f)}
 });
 await assert.rejects(api.run({[format]:format==='plan'?{}:{version:1,code:'pass'},inspectOnly:true},{exe:'cad.exe'}),/Ergebnisdatei|Ergebnis/);
});
const main=source('src/cad-main.js');
function mainFunction(name,globals){const line=main.split('\n').find(line=>line.startsWith('function '+name+'('));assert(line);return vm.runInNewContext('('+line+')',globals);}
function mainGlobals(){const globals={Error,console};for(const name of new Set(main.match(/\b\w+UI\b/g)))globals[name]=undefined;return {...globals,busy:false,fileBusy:false,activePreview:null,meshPartitionDraft:()=>false,tools:undefined,meshTools:undefined,meshExtras:undefined,view:{isEditing:()=>false},layoutUI:{isActive:()=>false,isSaving:()=>false}};}
test('File actions and workbench changes reject an open advanced/surface tool even before preview',()=>{
 const g=mainGlobals(),ready=mainFunction('readyForFile',g);ready();g.advancedFreeCADUI={state:()=>({kind:'surface-fill'})};assert.throws(ready,/abschließen/);
});
test('Context Apply finds the enabled advanced and surface buttons',()=>{
 for(const attribute of ['data-advanced-apply','data-surface-apply']){const button={disabled:false,getClientRects:()=>[{}]},g={document:{querySelectorAll:()=>[{querySelectorAll:selector=>selector.includes('['+attribute+']')?[button]:[]}]}};assert.equal(mainFunction('contextApplyButton',g)(),button);}
});
test('An unchanged reset preserves the previous layout backup',async t=>{
 const dir=temporary(t),{createLayoutStore}=require('../backend/layouts.cjs'),store=createLayoutStore(dir);let r=await store.read();r=await store.change({revision:r.revision,command:{action:'reset'}});const backup=path.join(dir,'layouts.json.vorher');fs.writeFileSync(backup,'keep this backup');const before=fs.readFileSync(path.join(dir,'layouts.json'),'utf8');r=await store.change({revision:r.revision,command:{action:'reset'}});assert.equal(fs.readFileSync(backup,'utf8'),'keep this backup');assert.equal(fs.readFileSync(path.join(dir,'layouts.json'),'utf8'),before);
});
for(const version of [23,24])test('Library wrappers cannot disguise project format '+version+' as an older format',()=>{
 const node={id:'body',kind:'cad',name:'Box',source:'native',solid:true,transform:cadIdentity(),recipe:{type:'box',size:[10,10,10]},brep:{format:'OpenCascade-BRep',data:'storage-only fixture',triangulation:false},stats:{bounds:{min:[-5,-5,-5],max:[5,5,5]},volume:1000,solids:1}},project={...createCadProject({nodes:[node]}),version};
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},persistence=createCadPersistence({storage,transactions:{snapshot:()=>project,preview:async p=>p},verify:async p=>p});
 const data={format:'FormnaroCADLibrary',version,items:[{id:'template',name:'Box',project}]};values.set(MIXED_LIBRARY_KEY,JSON.stringify(data));assert.equal(persistence.listTemplates().length,1);
 data.version=version-1;const invalid=JSON.stringify(data);values.set(MIXED_LIBRARY_KEY,invalid);assert.throws(()=>persistence.listTemplates(),new RegExp('Bibliotheksversion '+version));assert.equal(values.get(MIXED_LIBRARY_KEY),invalid);
});
