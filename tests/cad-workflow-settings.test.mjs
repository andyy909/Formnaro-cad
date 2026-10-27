import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS} from '../src/preferences.js';
import {CAD_QUALITY_DEFAULTS} from '../src/cad-quality.js';
import {defaultLayout} from '../backend/layout-data.mjs';
import {WORKFLOW_SETTINGS_KEY,WORKFLOW_SETTINGS_DEFAULTS,validateWorkflowSettings,createCadWorkflowSettings,createCadSettingsBundle,validateCadSettingsBundle,applyCadSettingsBundle} from '../src/cad-workflow-settings.js';
const copy=value=>structuredClone(value);
const memory=()=>{const values=new Map(),writes=[];return {values,writes,getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);writes.push([key,value]);}};};
function adapters(){const storage=memory(),workflowSettings=createCadWorkflowSettings(storage),state={preferences:copy(DEFAULTS),quality:copy(CAD_QUALITY_DEFAULTS),layout:defaultLayout()},calls=[];return {state,calls,workflowSettings,getPreferences:()=>copy(state.preferences),getQuality:()=>copy(state.quality),getLayout:()=>copy(state.layout),setPreferences:value=>{calls.push('preferences');state.preferences=copy(value);},setQuality:async value=>{calls.push('quality');state.quality=copy(value);},setLayout:async value=>{calls.push('layout');state.layout=copy(value);}};}

test('One workflow store shares defaults and preserves old settings without automatic writes',()=>{
  const storage=memory();storage.values.set('offlinecad-settings-v1','old preferences');storage.values.set('offlinecad-cad-quality-v1','old quality');const store=createCadWorkflowSettings(storage);
  assert.deepEqual(store.get(),WORKFLOW_SETTINGS_DEFAULTS);assert.deepEqual(storage.writes,[]);const detached=store.get();detached.import.unit=25.4;assert.equal(store.get().import.unit,1);
  store.update({import:{unit:25.4,meshUse:'mesh'},conversion:{tolerance:.025,mode:'smooth',repair:false},export:{scope:'selection',format:'step'}});
  assert.equal(storage.writes.length,1);assert.equal(storage.writes[0][0],WORKFLOW_SETTINGS_KEY);assert.equal(storage.values.get('offlinecad-settings-v1'),'old preferences');assert.equal(storage.values.get('offlinecad-cad-quality-v1'),'old quality');
  const restarted=createCadWorkflowSettings(storage);assert.deepEqual(restarted.get(),store.get());assert.equal(restarted.get().conversion.fallback,true);restarted.set(restarted.get());assert.equal(storage.writes.length,1);
});

test('Invalid units, modes, ranges and unknown or AI fields are rejected before storage changes',()=>{
  const storage=memory(),store=createCadWorkflowSettings(storage);for(const patch of [{import:{unit:1000}},{import:{svgHeight:0}},{import:{svgHeight:Infinity}},{import:{meshUse:'automatic'}},{export:{format:'iges'}},{export:{scope:'everything'}},{conversion:{mode:'ai'}},{conversion:{tolerance:.00001}},{conversion:{tolerance:101}},{conversion:{repair:'true'}},{conversion:{meshRepair:'false'}},{conversion:{useAI:true}},{apiKey:'forbidden'},{conversion:null}])assert.throws(()=>store.update(patch));
  assert.deepEqual(storage.writes,[]);assert.deepEqual(store.get(),WORKFLOW_SETTINGS_DEFAULTS);assert.throws(()=>validateWorkflowSettings({...copy(WORKFLOW_SETTINGS_DEFAULTS),version:2}));
});

test('Persistence conflicts and damaged saved workflow never overwrite the previous data',()=>{
  const storage=memory(),store=createCadWorkflowSettings(storage);store.update({export:{format:'3mf'}});const before=store.get(),raw=storage.values.get(WORKFLOW_SETTINGS_KEY);storage.setItem=()=>{throw Error('revision conflict');};assert.throws(()=>store.update({export:{format:'svg'}}),/revision conflict/);assert.deepEqual(store.get(),before);assert.equal(storage.values.get(WORKFLOW_SETTINGS_KEY),raw);
  storage.values.set(WORKFLOW_SETTINGS_KEY,'{broken');assert.throws(()=>createCadWorkflowSettings(storage));assert.equal(storage.values.get(WORKFLOW_SETTINGS_KEY),'{broken');
});

test('Workflow reset changes only shared file defaults, and leaves no remembered AI consent',()=>{
  const storage=memory(),store=createCadWorkflowSettings(storage);store.update({import:{unit:10,meshUse:'cad'},export:{format:'glb'},conversion:{repair:false}});store.reset();assert.deepEqual(store.get(),WORKFLOW_SETTINGS_DEFAULTS);assert.equal(JSON.stringify(store.get()).includes('AI'),false);assert.equal(storage.writes.length,2);
});

test('Settings bundle round trips only validated program, quality, workflow and anonymous layout',()=>{
  const layout=defaultLayout();layout.librarySide='right';const bundle=createCadSettingsBundle({preferences:{...DEFAULTS,theme:'dark',snap:.5},workflow:{...copy(WORKFLOW_SETTINGS_DEFAULTS),export:{format:'3mf',scope:'selection'}},layout});const decoded=validateCadSettingsBundle(JSON.parse(JSON.stringify(bundle)));
  assert.deepEqual(decoded,bundle);assert.equal(decoded.layout.librarySide,'right');assert.equal(decoded.preferences.theme,'dark');bundle.layout.zones.header.reverse();assert.notDeepEqual(decoded.layout.zones.header,bundle.layout.zones.header);
  assert.deepEqual(Object.keys(decoded),['format','version','preferences','quality','workflow','layout']);for(const key of ['apiKey','providers','profiles','models','autosave','workspace','library','path','encryptedKey'])assert.throws(()=>validateCadSettingsBundle({...decoded,[key]:'forbidden'}));
  assert.equal(Object.hasOwn(createCadSettingsBundle(),'layout'),false);assert.throws(()=>validateCadSettingsBundle({...decoded,layout:{...decoded.layout,profiles:[]}}));
});

test('Settings import applies validated values through existing setters without touching models or named layouts',async()=>{
  const host=adapters(),model={nodes:[{id:'keep',kind:'mesh'}]},profiles=[{id:'keep-profile'}],bundle=createCadSettingsBundle({preferences:{...DEFAULTS,theme:'dark'},quality:{...copy(CAD_QUALITY_DEFAULTS),export:{deflection:.2,angleDegrees:12}},workflow:{...copy(WORKFLOW_SETTINGS_DEFAULTS),import:{unit:10,meshUse:'cad',svgHeight:4}},layout:{...defaultLayout(),librarySide:'right'}});
  const result=await applyCadSettingsBundle(host,bundle);assert.deepEqual(result,bundle);assert.deepEqual(host.state.preferences,bundle.preferences);assert.deepEqual(host.state.quality,bundle.quality);assert.deepEqual(host.workflowSettings.get(),bundle.workflow);assert.deepEqual(host.state.layout,bundle.layout);assert.deepEqual(host.calls,['quality','preferences','layout']);assert.deepEqual(model,{nodes:[{id:'keep',kind:'mesh'}]});assert.deepEqual(profiles,[{id:'keep-profile'}]);
});

test('Imported malformed content and unavailable layout adapters are rejected before any mutation',async()=>{
  const host=adapters(),bundle=createCadSettingsBundle();await assert.rejects(applyCadSettingsBundle(host,{...bundle,workflow:{...bundle.workflow,conversion:{...bundle.workflow.conversion,useAI:true}}}));assert.deepEqual(host.calls,[]);
  await assert.rejects(applyCadSettingsBundle({...host,setLayout:undefined},createCadSettingsBundle({layout:defaultLayout()})),/Oberflächenanordnung/);assert.deepEqual(host.calls,[]);
});

test('Failed settings import restores all previous values even if a setter changed state before failing',async()=>{
  const host=adapters(),before=copy(host.state),beforeWorkflow=host.workflowSettings.get(),bundle=createCadSettingsBundle({preferences:{...DEFAULTS,theme:'dark'},workflow:{...copy(WORKFLOW_SETTINGS_DEFAULTS),export:{format:'svg',scope:'selection'}},layout:{...defaultLayout(),librarySide:'right'}}),setLayout=host.setLayout;let first=true;
  host.setLayout=async value=>{await setLayout(value);if(first){first=false;throw Error('fixture layout write failed');}};await assert.rejects(applyCadSettingsBundle(host,bundle),/vorige Werte wiederhergestellt/);assert.deepEqual(host.state,before);assert.deepEqual(host.workflowSettings.get(),beforeWorkflow);
});

test('Failed rollback is reported explicitly instead of claiming the old settings were restored',async()=>{
  const host=adapters(),setPreferences=host.setPreferences;host.setPreferences=value=>{if(value.theme==='dark')throw Error('fixture import failed');setPreferences(value);};let writes=0;host.setQuality=async()=>{if(++writes>1)throw Error('fixture rollback failed');};await assert.rejects(applyCadSettingsBundle(host,createCadSettingsBundle({preferences:{...DEFAULTS,theme:'dark'}})),/Vorige Werte bitte prüfen: Qualität/);
});


test('File and selected-scene conversion retain different explicit repair defaults in the one store',()=>{
 const storage=memory(),store=createCadWorkflowSettings(storage);assert.equal(store.get().conversion.repair,true);assert.equal(store.get().conversion.meshRepair,false);store.update({conversion:{meshRepair:true}});const restarted=createCadWorkflowSettings(storage);assert.equal(restarted.get().conversion.repair,true);assert.equal(restarted.get().conversion.meshRepair,true);restarted.reset();assert.equal(restarted.get().conversion.repair,true);assert.equal(restarted.get().conversion.meshRepair,false);
});
