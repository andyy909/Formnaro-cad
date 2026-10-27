import {meshProtectionRegions,validateMeshProtection} from '../src/mesh-protection.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createMeshSelectionState} from '../src/cad-mesh-selection-state.js';
import {createMeshSelectionService,meshSelectionGeometryDigest,validateMeshSelectionBinding} from '../src/mesh-selection-data.js';
import {flags} from '../src/organization.js';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const meshNode=(id='mesh')=>({id,kind:'mesh',name:'Prüfnetz',color:'#4b97ad',transform:[...identity],layerId:'default',folderId:null,mesh:{verts:[0,0,0,10,0,0,10,10,0,0,10,0],triangles:[0,1,2,0,2,3]}});
const bind=(node,triangleIds=[0],boundaryEdges=[])=>({format:'FormnaroMeshSelection',version:1,objectId:node.id,geometryDigest:meshSelectionGeometryDigest(node),triangleIds,boundaryEdges});
const start=(model,node)=>model.begin({objectId:node.id,geometryDigest:meshSelectionGeometryDigest(node)});

test('Draft selection, clear, cancel and returned snapshots cannot mutate the committed binding or source mesh',()=>{
 const node=meshNode(),before=structuredClone(node),saved=bind(node),model=createMeshSelectionState(saved);start(model,node);
 model.update(bind(node,[1]));assert.deepEqual(model.snapshot(),saved);model.clear();assert.equal(model.state().draft,null);
 assert.equal(model.cancel(),true);assert.deepEqual(model.snapshot(),saved);assert.deepEqual(node,before);
 const returned=model.snapshot();returned.triangleIds.push(1);assert.deepEqual(model.snapshot(),saved);
});

test('Local undo/redo covers add, subtract and clear, branches correctly, and never commits until Apply',()=>{
 const node=meshNode(),saved=bind(node),model=createMeshSelectionState(saved);start(model,node);
 model.update(bind(node,[1]),'add');assert.deepEqual(model.state().draft.triangleIds,[0,1]);
 model.update(bind(node,[0]),'subtract');assert.deepEqual(model.state().draft.triangleIds,[1]);
 model.clear();assert.equal(model.state().draft,null);assert.deepEqual(model.snapshot(),saved);
 model.undo();assert.deepEqual(model.state().draft.triangleIds,[1]);model.undo();assert.deepEqual(model.state().draft.triangleIds,[0,1]);
 model.redo();assert.deepEqual(model.state().draft.triangleIds,[1]);model.update(bind(node,[0]),'replace');assert.equal(model.state().canRedo,false);
 const result=model.commit();assert.equal(result.changed,false);assert.deepEqual(model.snapshot(),saved);assert.equal(model.state(),null);
});

test('Actual coordinate or triangle changes invalidate committed and pending selection; affine placement and style retain both',()=>{
 const node=meshNode(),saved=bind(node),model=createMeshSelectionState(saved);start(model,node);
 node.transform[12]=37;node.transform[4]=.25;node.color='#a63412';node.name='Umbenannt';
 assert.deepEqual(model.sourceChanged(node.id,meshSelectionGeometryDigest(node)),{cleared:false,canceled:false});assert.deepEqual(model.snapshot(),saved);
 node.mesh.verts[0]=.125;assert.deepEqual(model.sourceChanged(node.id,meshSelectionGeometryDigest(node)),{cleared:true,canceled:true});assert.equal(model.snapshot(),null);assert.equal(model.state(),null);
 const replaced=meshNode(),second=createMeshSelectionState(bind(replaced));start(second,replaced);replaced.mesh.triangles.reverse();assert.deepEqual(second.sourceChanged(replaced.id,meshSelectionGeometryDigest(replaced)),{cleared:true,canceled:true});
});

test('Different objects and stale query results cannot contaminate a session or replace the previous committed selection on Cancel',()=>{
 const one=meshNode('one'),two=meshNode('two'),saved=bind(one),model=createMeshSelectionState(saved);start(model,two);
 assert.throws(()=>model.update(bind(one)),/Netzquelle/);assert.equal(model.state().draft,null);
 const stale=bind(two);stale.geometryDigest='f'.repeat(64);assert.throws(()=>model.update(stale),/Netzquelle/);
 model.update(bind(two,[1]));model.cancel();assert.deepEqual(model.snapshot(),saved);
});

test('Persisted selection restores strictly and an invalid restore leaves the current selection intact',()=>{
 const node=meshNode(),saved=bind(node,[0,1],[{id:'e:0:1',vertices:[0,1]}]),model=createMeshSelectionState();
 model.restore(JSON.parse(JSON.stringify(saved)));validateMeshSelectionBinding(model.snapshot(),{node});assert.deepEqual(model.snapshot(),saved);
 assert.throws(()=>model.restore({...saved,geometryDigest:'not-a-digest'}));assert.deepEqual(model.snapshot(),saved);
 assert.throws(()=>model.restore({...saved,unexpected:true}));assert.deepEqual(model.snapshot(),saved);
 start(model,node);model.clear();assert.equal(model.commit().selection,null);assert.equal(model.snapshot(),null);
});

const uiSource=readFileSync(new URL('../src/cad-mesh-selection-ui.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function createCadMeshSelectionUI','function createCadMeshSelectionUI');
function harness({service}={}){
 const node=meshNode(),project={nodes:[node],layers:[{id:'default',hidden:false,locked:false}],folders:[]};let selection=[{rootId:node.id,path:[]}],overlay=null,interaction=null,changes=0,allowed=true;const notices=[];
 const controls=new Map();
 const control=id=>({id,value:id==='mesh-selection-mode'?'triangle':id==='mesh-selection-angle'?'30':'',hidden:false,disabled:false,textContent:'',classList:{toggle(){}},setAttribute(){}});
 const panel={hidden:true,setAttribute(){},addEventListener(){},remove(){},querySelector(selector){return controls.get(selector.slice(1));},querySelectorAll(selector){return selector==='select,input'?[controls.get('mesh-selection-mode'),controls.get('mesh-selection-angle')]:[];},set innerHTML(html){controls.clear();for(const match of html.matchAll(/id="([^"]+)"/g))controls.set(match[1],control(match[1]));}};
 const view={canvas:{parentElement:{append(){}}},allows:()=>allowed,setInteraction:fn=>{interaction=fn;},setMeshSelection:value=>{overlay=structuredClone(value);},meshSelectionHit:(ray,hit)=>({triangleIndex:hit.faceIndex,point:[8,2,0]})};
 const context={document:{createElement:()=>panel},structuredClone,AbortController,meshProtectionRegions,validateMeshProtection,flags,createMeshSelectionState,createMeshSelectionService,meshSelectionGeometryDigest,validateMeshSelectionBinding};
 vm.runInNewContext(uiSource+'\ncreate=createCadMeshSelectionUI;',context);
 const ui=context.create({getProject:()=>project,getSelection:()=>selection,view,onWorkspaceChange:()=>changes++,toast:message=>notices.push(message),...(service?{service}:{})});
 const hit=index=>({object:{userData:{rootId:node.id}},faceIndex:index});
 return {ui,node,project,view,notices,controls,hit,get overlay(){return overlay;},get interaction(){return interaction;},get changes(){return changes;},setSelection:value=>{selection=value;},setAllowed:value=>{allowed=value;}};
}

test('The actual UI controller previews original faces, supports local undo/redo, commits only workspace state and cancels safely',async()=>{
 const h=harness(),before=structuredClone(h.project);await h.ui.open();await h.ui.handlePick(h.hit(0));assert.equal(h.ui.state().triangleCount,1);assert.equal(h.ui.snapshot(),null);assert.equal(h.changes,0);
 await h.ui.handlePick(h.hit(1),{shiftKey:true});assert.deepEqual(h.ui.state().draft.triangleIds,[0,1]);h.ui.undo();assert.deepEqual(h.ui.state().draft.triangleIds,[0]);h.ui.redo();assert.deepEqual(h.ui.state().draft.triangleIds,[0,1]);
 await h.ui.apply();assert.equal(h.changes,1);assert.equal(h.ui.state(),null);assert.equal(h.interaction,null);assert.deepEqual(h.ui.snapshot().triangleIds,[0,1]);
 const saved=h.ui.snapshot();await h.ui.open();h.ui.clear();assert.equal(h.overlay,null);h.ui.cancel();assert.deepEqual(h.overlay,saved);assert.deepEqual(h.ui.snapshot(),saved);assert.deepEqual(h.project,before);h.ui.dispose();
});

test('UI refuses locked, hidden, CAD, reference and historical-source roots without changing their data',async()=>{
 for(const kind of ['locked','layerLocked','hidden','isolated','cad','reference','source']){
  const h=harness();if(kind==='locked')h.node.locked=true;if(kind==='layerLocked')h.project.layers[0].locked=true;if(kind==='hidden')h.node.hidden=true;if(kind==='isolated')h.setAllowed(false);if(kind==='cad')h.node.kind='cad';if(kind==='reference')h.node.kind='referenceMesh';if(kind==='source')h.setSelection([{rootId:h.node.id,path:['historical']}]);
  const before=structuredClone(h.project);await assert.rejects(h.ui.open());assert.equal(h.ui.state(),null);assert.equal(h.ui.snapshot(),null);assert.deepEqual(h.project,before);h.ui.dispose();
 }
});

test('Late cancelled worker results cannot overwrite the committed overlay or dirty the workspace',async()=>{
 let resolve;const gate=new Promise(r=>resolve=r);const service={query:()=>gate,dispose(){}};const h=harness({service}),saved=bind(h.node);await h.ui.restore(saved);await h.ui.open();
 const pending=h.ui.handlePick(h.hit(1));assert.equal(h.ui.state().busy,true);h.ui.cancel();resolve(bind(h.node,[1]));await pending;
 assert.deepEqual(h.ui.snapshot(),saved);assert.deepEqual(h.overlay,saved);assert.equal(h.changes,0);assert.equal(h.ui.state(),null);h.ui.dispose();
});

test('UI keeps a geometry-bound selection through pose/style changes and clears it visibly after a real mesh edit',async()=>{
 const h=harness(),saved=bind(h.node);await h.ui.restore(saved);h.node.transform[12]=21;h.node.color='#ffcc00';await h.ui.sync();assert.deepEqual(h.ui.snapshot(),saved);assert.deepEqual(h.overlay,saved);
 await h.ui.open();h.node.mesh.verts[0]=.01;await h.ui.sync();assert.equal(h.ui.snapshot(),null);assert.equal(h.ui.state(),null);assert.equal(h.overlay,null);assert.equal(h.changes,1);assert.ok(h.notices.some(text=>/Netzgeometrie/.test(text)));h.ui.dispose();
});

test('Locking a selected source ends the draft but preserves its valid saved binding until it can be shown again',async()=>{
 const h=harness(),saved=bind(h.node);await h.ui.restore(saved);await h.ui.open();await h.ui.handlePick(h.hit(1));h.node.locked=true;await h.ui.sync();
 assert.equal(h.ui.state(),null);assert.equal(h.overlay,null);assert.deepEqual(h.ui.snapshot(),saved);assert.equal(h.changes,0);h.node.locked=false;await h.ui.sync();assert.deepEqual(h.overlay,saved);h.ui.dispose();
});

test('Ambiguous modifier combinations and foreign object hits never alter the current preview',async()=>{
 const h=harness();await h.ui.open();await h.ui.handlePick(h.hit(0));const saved=structuredClone(h.ui.state().draft);
 await h.ui.handlePick(h.hit(1),{shiftKey:true,ctrlKey:true});assert.deepEqual(h.ui.state().draft,saved);assert.match(h.controls.get('mesh-selection-message').textContent,/nur eine/);
 await h.ui.handlePick({object:{userData:{rootId:'other'}},faceIndex:1});assert.deepEqual(h.ui.state().draft,saved);assert.equal(h.changes,0);h.ui.dispose();
});

test('A correctly digested but forged interior edge is rejected when restoring a persisted opening-rim selection',async()=>{
 const h=harness(),forged=bind(h.node,[],[{id:'e:0:2',vertices:[0,2]}]);
 assert.equal(await h.ui.restore(forged),null);assert.equal(h.ui.snapshot(),null);assert.equal(h.overlay,null);assert.ok(h.notices.some(text=>/verworfen/.test(text)));assert.equal(h.changes,0);h.ui.dispose();
});

test('Closing during asynchronous Apply validation cannot commit a late selection or change the saved binding',async()=>{
 const base=createMeshSelectionService();let resolve,hold=false;const gate=new Promise(r=>resolve=r);
 const service={query:(...args)=>base.query(...args),validate:(binding,node,options)=>hold?gate:base.validate(binding,node,options),dispose:()=>base.dispose()};
 const h=harness({service}),saved=bind(h.node);await h.ui.restore(saved);await h.ui.open();await h.ui.handlePick(h.hit(1));hold=true;
 const applying=h.ui.apply();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.ui.state().busy,true);h.ui.cancel();resolve(bind(h.node,[1]));await applying;
 assert.deepEqual(h.ui.snapshot(),saved);assert.deepEqual(h.overlay,saved);assert.equal(h.changes,0);assert.equal(h.ui.state(),null);h.ui.dispose();
});

test('Changing the ordinary object selection cancels a surface draft while preserving its prior committed binding',async()=>{
 const h=harness(),saved=bind(h.node);await h.ui.restore(saved);await h.ui.open();await h.ui.handlePick(h.hit(1));h.setSelection([]);h.ui.selectionChanged();
 assert.equal(h.ui.state(),null);assert.deepEqual(h.ui.snapshot(),saved);assert.deepEqual(h.overlay,saved);assert.equal(h.changes,0);h.ui.dispose();
});

test('The first dense geometry digest remains asynchronous and Cancel aborts it before a selection session can become ready',async()=>{
 let resolve,signal;const gate=new Promise(r=>resolve=r),service={geometryDigest:(node,options)=>{signal=options.signal;return gate;},dispose(){}};
 const h=harness({service}),opening=h.ui.open();assert.equal(h.ui.state().busy,true);assert.equal(h.ui.isChecking(),true);assert.equal(signal.aborted,false);h.ui.cancel();assert.equal(signal.aborted,true);assert.equal(h.ui.isChecking(),false);
 resolve(meshSelectionGeometryDigest(h.node));assert.equal(await opening,false);assert.equal(h.ui.isChecking(),false);assert.equal(h.ui.state(),null);assert.equal(h.ui.snapshot(),null);assert.equal(h.overlay,null);assert.equal(h.changes,0);h.ui.dispose();
});
