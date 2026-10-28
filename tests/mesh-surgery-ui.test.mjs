import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import * as THREE from 'three';
import {flags} from '../src/organization.js';
import {validateMeshSurgeryOptions} from '../src/mesh-surgery.js';
const source=fs.readFileSync(new URL('../src/cad-mesh-surgery-ui.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function createCadMeshSurgeryUI','function createCadMeshSurgeryUI');
function harness(){
 const controls=new Map(),digest='a'.repeat(64),node={id:'a',kind:'mesh',name:'Synthetic',mesh:{verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]},transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],layerId:'default',folderId:null},project={nodes:[node],layers:[{id:'default'}],folders:[]},scene=new THREE.Scene();let delay=null,shown=null,applied=0;
 const element=(tagName,attrs='')=>({tagName:tagName.toUpperCase(),disabled:false,value:attrs.match(/value="([^"]*)"/)?.[1]??'',textContent:'',options:[],setAttribute(){},append(e){this.options.push(e);if(this.options.length===1)this.value=e.value;},replaceChildren(){this.options=[];this.value='';}});
 const panel={hidden:true,setAttribute(){},addEventListener(){},remove(){},querySelector:s=>controls.get(s.slice(1)),querySelectorAll:s=>s==='[data-surgery-for]'?[]:[...controls.values()].filter(e=>['INPUT','SELECT','BUTTON'].includes(e.tagName)),set innerHTML(html){controls.clear();for(const m of html.matchAll(/<(\w+)([^>]*\bid="([^"]+)"[^>]*)>/g))controls.set(m[3],element(m[1],m[2]));}};
 const controller={readSnapshot:()=>project,revision:()=>1,meshQuery:async()=>({geometryDigest:digest,rings:[],triangles:1,intersections:{complete:true,pairs:[],triangleIds:[]}}),materialize:async()=>structuredClone(project),cancel(){},discard(){},preview:async()=>({previewId:'p',report:{action:'repair'}})};
 const context={THREE,flags,structuredClone,document:{createElement:tag=>tag==='section'?panel:element(tag)},validateMeshSurgeryOptions:o=>validateMeshSurgeryOptions(structuredClone(o))};vm.runInNewContext(source+'\ncreate=createCadMeshSurgeryUI;',context);
 const ui=context.create({controller,view:{canvas:{parentElement:{append(){}}},scene,allows:()=>true,invalidate(){},setInteraction(){}},getSelection:()=>[{rootId:'a',path:[]}],getSurfaceSelection:()=>({objectId:'a',geometryDigest:digest,triangleIds:[0]}),showPreview:async p=>{if(delay)await delay;shown=p.previewId;},clearPreview:()=>{shown=null;},applyProposal:async()=>{applied++;}});
 return {ui,controls,overlay:scene.children[0],delay:p=>{delay=p;},get shown(){return shown;},get applied(){return applied;}};
}
test('An old pending comparison cannot erase the reopened dialog references or authorize Apply',async()=>{
 const h=harness();await h.ui.open();h.controls.get('mesh-surgery-action').value='repair';assert.equal(await h.ui.preview(),true);assert.equal(h.overlay.children.length,0);
 h.controls.get('mesh-surgery-compare').value='original';await h.ui.compare();assert.equal(h.overlay.children.length,1);
 let finish;h.delay(new Promise(r=>finish=r));h.controls.get('mesh-surgery-compare').value='result';const old=h.ui.compare();h.ui.close();await h.ui.open();assert.equal(h.overlay.children.length,1);finish();assert.equal(await old,false);assert.equal(h.overlay.children.length,1);assert.equal(h.ui.state().hasPreview,false);assert.equal(await h.ui.apply(),false);assert.equal(h.applied,0);h.ui.dispose();
});
test('A current result comparison clears original references and original comparison restores them',async()=>{
 const h=harness();await h.ui.open();h.controls.get('mesh-surgery-action').value='repair';assert.equal(h.overlay.children.length,1);assert.equal(await h.ui.preview(),true);assert.equal(h.overlay.children.length,0);h.controls.get('mesh-surgery-compare').value='original';assert.equal(await h.ui.compare(),true);assert.equal(h.overlay.children.length,1);h.controls.get('mesh-surgery-compare').value='result';assert.equal(await h.ui.compare(),true);assert.equal(h.overlay.children.length,0);assert.equal(h.applied,0);h.ui.dispose();
});
