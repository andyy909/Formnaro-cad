import test from 'node:test';
import assert from 'node:assert/strict';
import {SOLID_DEFAULTS,SOLID_SETTINGS_KEY,createSolidSettings,validateSolidSettings,solidShortcut,SOLID_TABS} from '../src/cad-solid-state.js';
import {createProgramStore} from '../backend/program-storage.cjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('Solid options migrate without writes and persist separately from existing program settings',()=>{
  const values=new Map([['offlinecad-settings-v1','keep'],['offlinecad-workbench-mode-v1','normal']]),writes=[];
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>{writes.push(key);values.set(key,value);}};
  const settings=createSolidSettings(storage);assert.deepEqual(settings.get(),SOLID_DEFAULTS);assert.deepEqual(writes,[]);
  settings.set({...settings.get(),navigation:false,defaultTab:'sketch'});assert.deepEqual(writes,[SOLID_SETTINGS_KEY]);
  assert.equal(createSolidSettings(storage).get().navigation,false);assert.equal(values.get('offlinecad-settings-v1'),'keep');assert.equal(values.get('offlinecad-workbench-mode-v1'),'normal');
  const detached=settings.get();detached.shortcuts=false;assert.equal(settings.get().shortcuts,true);
});
test('Solid validation rejects unknown options and failed writes preserve in-memory settings',()=>{
  const settings=createSolidSettings({getItem:()=>null,setItem:()=>{throw Error('write denied');}});
  for(const value of [null,[],{version:2},{navigation:'true'},{shortcuts:1},{defaultTab:'drawing'},{apiKey:'forbidden'}])assert.throws(()=>validateSolidSettings(value));
  assert.throws(()=>settings.set({...SOLID_DEFAULTS,navigation:false}),/write denied/);assert.deepEqual(settings.get(),SOLID_DEFAULTS);
});
test('Solid view shortcuts use seven stable Formnaro directions and do not consume editing combinations',()=>{
  const e=(key,more={})=>({key,...more});assert.deepEqual(solidShortcut(e('s')),{shortcuts:true});assert.deepEqual(solidShortcut(e(' ')),{orientation:true});assert.deepEqual(solidShortcut(e('f')),{fit:true});
  for(const [index,view]of ['front','back','left','right','top','bottom','iso'].entries())assert.deepEqual(solidShortcut(e(String(index+1),{ctrlKey:true})),{view});
  for(const key of ['z','s','c','v','o','b','q'])assert.equal(solidShortcut(e(key,{ctrlKey:true})),null);
  assert.equal(solidShortcut(e('s',{shiftKey:true})),null);assert.equal(solidShortcut(e('1',{ctrlKey:true,altKey:true})),null);assert.equal(SOLID_TABS.length,5);
});
test('Portable storage writes Solid settings and the third mode to their own files',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-solid-store-')),dir=path.join(root,'Daten');
  try{const store=createProgramStore(dir,{cadOnly:true});const initial=store.initialize();const settings=JSON.stringify(SOLID_DEFAULTS);
    // Same revision-bound contract as the renderer's portable program store.
    for(const [key,value]of Object.entries({[SOLID_SETTINGS_KEY]:settings,'offlinecad-workbench-mode-v1':'solid'}))store.change({key,value,revision:initial.revisions[key]});
    assert.equal(fs.readFileSync(path.join(dir,'solid-einstellungen.json'),'utf8'),settings);assert.equal(fs.readFileSync(path.join(dir,'bedienmodus.json'),'utf8'),'solid');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
