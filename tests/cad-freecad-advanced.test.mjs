import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker} from 'node:worker_threads';
import freecad from '../backend/freecad.cjs';
import {createCadController} from '../src/cad-controller.js';
import {advancedFreeCADScript,validateAdvancedFreeCAD} from '../src/cad-freecad-advanced-data.js';
import {readFreeCADDocument} from '../src/cad-freecad-document.js';
const moduleSource=fs.readFileSync('backend/freecad-advanced.py','utf8');
const factory=()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',v=>a.onmessage?.({data:v}));w.on('error',e=>a.onerror?.(e));return a;};
const parameters={kind:'draft',angle:5,reversed:false,faces:[{point:[30,10,5],normal:[1,0,0]}],neutral:{point:[15,10,0],normal:[0,0,-1]}};
test('Advanced FreeCAD parameters reject invalid references, extra fields and unsafe helix spacing before native work',()=>{
 assert.deepEqual(validateAdvancedFreeCAD(parameters),parameters);const script=advancedFreeCADScript(parameters,moduleSource);assert.equal(script.modules['formnaro_advanced_v1.py'],moduleSource);assert.deepEqual(script.parameters,parameters);
 for(const bad of [{...parameters,kind:'missing'},{...parameters,angle:NaN},{...parameters,reversed:'false'},{...parameters,faces:[]},{...parameters,neutral:{point:[0,0,0],normal:[0,0,0]}},{...parameters,other:true},{kind:'helix',radius:10,pitch:1,height:20,wireRadius:1,axis:[0,0,1],origin:[0,0,0],leftHanded:false}])assert.throws(()=>validateAdvancedFreeCAD(bad));
});
test('Actual STEP transfer creates a separate editable draft, preserves sources, saves/reopens and owns one exact Undo',async t=>{
 const previous=globalThis.offlinecadDesktop;globalThis.offlinecadDesktop={runFreeCADReply:async({requestId,...args})=>{try{return {ok:true,value:await freecad.run(args)};}catch(e){return {ok:false,error:e.message,code:e.code};}},cancelFreeCAD:async()=>true};
 const cad=createCadController({createWorker:factory});t.after(()=>{cad.dispose();globalThis.offlinecadDesktop=previous;});
 const seed=await cad.preview({kind:'batch',commands:[{op:'create',type:'box',name:'Source',size:[30,20,10],as:'source'},{op:'create',type:'box',name:'Keep',size:[2,3,4],pos:[-50,0,0],as:'keep'}]});cad.apply({previewId:seed.previewId,revision:seed.revision});
 const before=cad.serialize(),baseline=cad.snapshot(),depth=cad.state().undo,source=baseline.nodes[0].id;
 const side=await cad.query('rayPick',{ids:[source],ray:{origin:[100,0,5],direction:[-1,0,0]}}),bottom=await cad.query('rayPick',{ids:[source],ray:{origin:[0,0,-10],direction:[0,0,1]}}),ref=hit=>({point:hit.point,normal:hit.normal});
 const actual={...parameters,faces:[ref(side)],neutral:ref(bottom)},p=await cad.preview({kind:'batch',commands:[{op:'tool',engine:'freecad',as:'advanced',operation:{kind:'build',inputs:[{name:'original',target:source}],script:advancedFreeCADScript(actual,moduleSource)}},{op:'update',target:source,set:{hidden:true}}]});
 assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);assert.equal(p.project.nodes.length,3);assert.deepEqual(p.project.nodes[1],baseline.nodes[1]);assert.deepEqual(p.project.nodes[0],{...baseline.nodes[0],hidden:true});
 assert(Math.abs(Math.abs(p.project.nodes[2].stats.volume-6000)-1000*Math.tan(Math.PI/36))<1e-4);
 cad.apply({previewId:p.previewId,revision:p.revision});assert.equal(cad.state().undo,depth+1);const built=cad.serialize();cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),built);await cad.open(built);assert.equal(cad.serialize(),built);
 const node=cad.snapshot().nodes[2];assert.equal(node.metadata.freecadSource.script.modules['formnaro_advanced_v1.py'],moduleSource);assert.equal(node.metadata.freecadSource.script.parameters.angle,5);
 const inspection=await readFreeCADDocument(node.metadata.freecadSource);assert(inspection.tree.objects.some(o=>o.type==='PartDesign::Draft'));
});
