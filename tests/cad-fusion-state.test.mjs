import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {FUSION_DEFAULTS,FUSION_SETTINGS_KEY,createFusionSettings,validateFusionSettings,fusionShortcut,fusionSourceSteps} from '../src/cad-fusion-state.js';
import {CONTEXT_MENU_KEY,CONTEXT_DEFAULTS,createContextSettings,validateContextSettings} from '../src/cad-context-menu-state.js';
import {createProgramStore} from '../backend/program-storage.cjs';

test('Existing three-mode custom menus migrate without a write or loss of custom commands',()=>{
  const old={version:1,modes:{easy:['copy'],normal:['function:tools:measure'],solid:['round','cut']}},writes=[];
  const storage={getItem:k=>k===CONTEXT_MENU_KEY?JSON.stringify(old):null,setItem:(...args)=>writes.push(args)};
  const store=createContextSettings(storage),next=store.get();assert.deepEqual(writes,[]);
  for(const k of ['easy','normal','solid'])assert.deepEqual(next.modes[k],old.modes[k]);
  assert.deepEqual(next.modes.fusion,CONTEXT_DEFAULTS.fusion);next.modes.fusion=['measure'];store.set(next);
  assert.deepEqual(writes[0],[CONTEXT_MENU_KEY,JSON.stringify(next)]);
  assert.throws(()=>validateContextSettings({...old,modes:{...old.modes,fusion:['eval']}}));
});
test('Fusion options are independent, validated and unchanged after a failed portable write',()=>{
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},store=createFusionSettings(storage);
  assert.deepEqual(store.get(),FUSION_DEFAULTS);store.set({...store.get(),defaultTab:'mesh',navigation:false});
  assert.equal(createFusionSettings(storage).get().defaultTab,'mesh');assert.equal(values.size,1);assert(values.has(FUSION_SETTINGS_KEY));
  for(const value of [null,[],{version:2},{navigation:'yes'},{defaultTab:'manufacture'},{apiKey:'x'}])assert.throws(()=>validateFusionSettings(value));
  const fail=createFusionSettings({getItem:()=>null,setItem:()=>{throw Error('write failed');}});assert.throws(()=>fail.set({...FUSION_DEFAULTS,shortcuts:false}));assert.deepEqual(fail.get(),FUSION_DEFAULTS);
});
test('Fusion keys preserve platform combinations and map only to available commands',()=>{
  for(const [key,action]of Object.entries({s:'search',e:'extrude',f:'round',h:'drill',m:'mode-translate',i:'measure',j:'joints'})){
    assert.equal(fusionShortcut({key:key.toUpperCase()}),action);
    for(const modifier of ['ctrlKey','metaKey','altKey','shiftKey'])assert.equal(fusionShortcut({key,[modifier]:true}),null);
  }
  for(const key of [' ','q','r','c','z'])assert.equal(fusionShortcut({key}),null);
});
test('Construction strip preserves source dependency order, target paths and inherited locks without mutation',()=>{
  const project={nodes:[{id:'r',name:'Fillet',source:'finish',locked:true,children:[{id:'s',name:'Extrude',recipe:{type:'sketch'}}]},{id:'m',name:'Mesh',kind:'mesh'}]},before=structuredClone(project),rows=fusionSourceSteps(project);
  assert.deepEqual(rows.map(s=>s.name),['Extrude','Fillet','Mesh']);assert.deepEqual(rows[0].target,{rootId:'r',path:['s']});assert(rows[0].locked);assert.deepEqual(project,before);assert.equal(fusionSourceSteps(project,{limit:1}).length,1);
});
test('Actual portable storage persists Fusion mode/options in separate files',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-fusion-'));
  try{const store=createProgramStore(path.join(root,'Daten'),{cadOnly:true}),initial=store.initialize();
    for(const [key,value]of Object.entries({[FUSION_SETTINGS_KEY]:JSON.stringify(FUSION_DEFAULTS),'offlinecad-workbench-mode-v1':'fusion'}))store.change({key,value,revision:initial.revisions[key]});
    assert.equal(fs.readFileSync(path.join(root,'Daten/bedienmodus.json'),'utf8'),'fusion');assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'Daten/fusion-einstellungen.json'))),FUSION_DEFAULTS);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
