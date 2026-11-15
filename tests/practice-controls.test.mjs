import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {validateAgentPracticePlan} from '../src/cad-agent-ui-policy.js';
const {validatePracticePlan}=createRequire(import.meta.url)('../backend/practice-runner.cjs');
import {practiceControl,practiceDialogState,installPracticeControlBridge,practiceWorkbenchTarget,practiceWorkbenchPrerequisite} from '../src/cad-practice-controls.js';
test('Solid practice opens the actual manager register before acting on a hidden control',()=>{
 const library={id:'solid-manager-tab-library',getAttribute:()=> 'false'};
 const properties={id:'solid-manager-tab-properties',getAttribute:()=> 'false'};
 const area=name=>({getAttribute:()=>name});
 const nodes=new Map([[library.id,library],[properties.id,properties],['param-length',{closest:()=>area('properties')}],['shape-preset-trapezoidal-thread',{closest:()=>area('library')}]]);
 const document={getElementById:id=>nodes.get(id)};
 assert.equal(practiceWorkbenchTarget('ui:menu:cad','solid'),'ui:id:solid-tab-features');
 assert.equal(practiceWorkbenchTarget('ui:tool:drill','solid'),'ui:tool:drill');
 assert.equal(practiceWorkbenchPrerequisite(document,'ui:id:shape-preset-trapezoidal-thread','solid'),library);
 assert.equal(practiceWorkbenchPrerequisite(document,'ui:id:param-length','solid'),properties);
 assert.equal(practiceWorkbenchPrerequisite(document,'shape:box','solid'),library);
 assert.equal(practiceWorkbenchPrerequisite(document,'ui:id:param-length','normal'),null);
 properties.getAttribute=()=> 'true';
 assert.equal(practiceWorkbenchPrerequisite(document,'ui:id:param-length','solid'),null);
});
test('Fusion reveals the real properties menu and closed ribbon group',()=>{
 const groupSummary={id:'fusion-group-solid-modify'};
 const viewSummary={id:'fusion-menu-view'};
 const group={querySelector:()=>groupSummary};
 const viewMenu={querySelector:()=>viewSummary};
 const entry={id:'fusion-menu-item-properties',closest:selector=>selector.startsWith('details')?viewMenu:null};
 const properties={hidden:true,getAttribute:()=> 'properties'};
 const length={closest:()=>properties};
 const drill={dataset:{action:'drill'},closest:()=>group};
 const nodes=new Map([[entry.id,entry],['param-length',length]]);
 const document={getElementById:id=>nodes.get(id),querySelectorAll:()=>[drill]};
 assert.equal(practiceWorkbenchTarget('ui:menu:cad','fusion'),'ui:id:fusion-tab-solid');
 assert.equal(practiceWorkbenchPrerequisite(document,'ui:id:param-length','fusion'),entry);
 assert.equal(practiceWorkbenchPrerequisite(document,'ui:id:fusion-menu-item-properties','fusion'),viewSummary);
 assert.equal(practiceWorkbenchPrerequisite(document,'ui:tool:drill','fusion'),groupSummary);
 const summary={id:'fusion-menu-view',closest:selector=>selector.startsWith('details')?viewMenu:null};viewMenu.querySelector=()=>summary;
 nodes.set(summary.id,summary);
 assert.equal(practiceWorkbenchPrerequisite(document,'ui:id:fusion-menu-view','fusion'),null);
});
test('a practice plan in Solid cannot switch the chosen workbench',t=>{
 const old=globalThis.getComputedStyle;globalThis.getComputedStyle=()=>({visibility:'visible'});t.after(()=>globalThis.getComputedStyle=old);
 const button={id:'mode-normal',tagName:'BUTTON',dataset:{workbenchMode:'normal'},getClientRects:()=>[{}],closest:()=>null,hasAttribute:()=>false};
 const document={getElementById:()=>button};
 assert.throws(()=>practiceControl(document,'ui:id:mode-normal',{workbench:'solid'}),/bleibt im Arbeitsmodus Solid/);
 assert.equal(practiceControl(document,'ui:id:mode-normal'),button);
});
test('practice can click ordinary menu/dialog controls and visibly choose options or enter parameters',()=>{
 const plan={version:1,title:'Echte Menüs bedienen',actions:[{kind:'ui',action:'click',target:'ui:label:CAD-Werkzeuge'},{kind:'ui',action:'click',target:'ui:tool:joints'},{kind:'ui',action:'choose',target:'ui:id:joint-gear-a',value:'gear-a'},{kind:'ui',action:'set',target:'ui:label:Zähne erstes Rad',value:'20'}]};
 assert.deepEqual(validatePracticePlan(plan),plan);assert.deepEqual(validateAgentPracticePlan(plan),plan);
 for(const action of [{kind:'ui',action:'click',target:'body',selector:'#x'},{kind:'ui',action:'key',target:'ui:label:CAD-Werkzeuge',value:'Alt+Tab'},{kind:'ui',action:'click',target:'ui:id:x\";evil()'}])assert.throws(()=>validatePracticePlan({...plan,actions:[action]}));
});

test('new internal tools require no per-tool allowlist; external/password targets cannot receive input',t=>{
 const old=globalThis.getComputedStyle;globalThis.getComputedStyle=()=>({visibility:'visible'});t.after(()=>globalThis.getComputedStyle=old);
 const tool={id:'brand-new-tool',dataset:{action:'future-tool'},tagName:'BUTTON',getClientRects:()=>[{}],closest:()=>null,hasAttribute:()=>false};
 const document={getElementById:()=>tool,querySelectorAll:()=>[tool]};assert.equal(practiceControl(document,'ui:tool:future-tool'),tool);
 tool.id='provider-login';assert.throws(()=>practiceControl(document,'ui:tool:future-tool'),/heraus/);tool.id='ordinary';tool.type='password';assert.throws(()=>practiceControl(document,'ui:id:ordinary'),/heraus/);
 tool.type='button';tool.hasAttribute=name=>name==='data-drawing-export';
 assert.throws(()=>practiceControl(document,'ui:id:ordinary'),/heraus/,'Drawing export must not open a file dialog in practice');
});

test('automatic gear demonstration is semantic and cannot request coordinates or external targets',()=>{
 const plan={version:1,title:'Einrasten',actions:[{kind:'gear-snap',moving:'gear_b',anchor:'gear_a',angle:17.3}]};assert.deepEqual(validatePracticePlan(plan),plan);assert.deepEqual(validateAgentPracticePlan(plan),plan);for(const action of [{...plan.actions[0],x:200},{...plan.actions[0],moving:'https://outside'}, {...plan.actions[0],moving:'gear_a'},{...plan.actions[0],angle:NaN}]){assert.throws(()=>validatePracticePlan({...plan,actions:[action]}));assert.throws(()=>validateAgentPracticePlan({...plan,actions:[action]}));}
});

test('model aliases can be selected later and cannot shadow an exercise shape alias',()=>{
 const plan={version:1,title:'Gemeinsame Objektbezüge',actions:[{kind:'model',commands:[{op:'create',type:'box',as:'body'}]},{kind:'select',targets:['body']}]};
 assert.deepEqual(validatePracticePlan(plan),plan);assert.deepEqual(validateAgentPracticePlan(plan),plan);
 const duplicate={...plan,actions:[{kind:'shape',type:'box',as:'body'},plan.actions[0]]};
 assert.throws(()=>validatePracticePlan(duplicate));assert.throws(()=>validateAgentPracticePlan(duplicate));
});

test('an open menu is distinct from a similarly named ellipsis tool inside it',t=>{
 const old=globalThis.getComputedStyle;globalThis.getComputedStyle=()=>({visibility:'visible'});t.after(()=>globalThis.getComputedStyle=old);const item=(tag,text)=>({tagName:tag,textContent:text,dataset:{},getClientRects:()=>[{}],closest:()=>null,hasAttribute:()=>false,getAttribute:()=>null});const menu=item('SUMMARY','Netz-Werkzeuge ▾'),tool=item('BUTTON','Netz-Werkzeuge …'),document={querySelectorAll:q=>q==='label'?[]:[menu,tool]};assert.equal(practiceControl(document,'ui:label:Netz-Werkzeuge'),menu);assert.equal(practiceControl(document,'ui:label:Netz-Werkzeuge …'),tool);
});

test('dialog feedback contains current modelling fields and excludes hidden and credential values',t=>{
 const old=globalThis.getComputedStyle;globalThis.getComputedStyle=()=>({visibility:'visible'});t.after(()=>globalThis.getComputedStyle=old);
 const node=(id,type,value)=>({id,type,value,tagName:'INPUT',dataset:{},getClientRects:()=>[{}],getAttribute:k=>k==='aria-label'?'Wandstärke nach innen (mm)':null,hasAttribute:()=>false,closest:()=>null,matches:()=>false});
 const collapsed=node('collapsed-field','number','9');collapsed.parentElement={tagName:'DETAILS',open:false,querySelector:()=>({contains:()=>false})};
 const fields=[node('shell-thickness','number','3'),node('secret','password','do-not-return'),node('hidden','hidden','private'),node('provider-key','text','private'),collapsed];
 const dialog={id:'modal',getClientRects:()=>[{}],querySelector:()=>null,querySelectorAll:()=>fields};const document={querySelectorAll:()=>[dialog]};
 const state=practiceDialogState(document);assert.equal(state.controls.length,1);assert.equal(state.controls[0].value,'3');assert.equal(state.controls[0].target,'ui:id:shell-thickness');assert(!JSON.stringify(state).includes('private'));
 dialog.querySelector=()=>({});assert.equal(practiceDialogState(document),null);
});

test('a closed title block names the real next control',t=>{
 const old=globalThis.getComputedStyle;
 globalThis.getComputedStyle=()=>({visibility:'visible'});
 t.after(()=>globalThis.getComputedStyle=old);
 const block={id:'drawing-title-block',getClientRects:()=>[{}],closest:()=>null};
 const doc={getElementById:id=>id===block.id?block:null};
 assert.throws(()=>practiceControl(doc,'ui:id:drawing-title'),/Titelblock geschlossen.*ui:id:drawing-title-block/);
});

test('registered transform tools resolve the actual data-mode buttons',t=>{const old=globalThis.getComputedStyle;globalThis.getComputedStyle=()=>({visibility:'visible'});t.after(()=>globalThis.getComputedStyle=old);for(const mode of ['translate','rotate','scale']){const button={dataset:{mode},tagName:'BUTTON',getClientRects:()=>[{}],closest:()=>null,hasAttribute:()=>false};assert.equal(practiceControl({querySelectorAll:()=>[button]},'ui:tool:mode-'+mode),button);}});
test('a tool hidden in a closed menu reports the actual reveal target',()=>{const group={dataset:{toolCategory:'view-tools'}},button={dataset:{action:'reset-plane'},getClientRects:()=>[],closest:selector=>selector==='details:not([open])'?group:null};assert.throws(()=>practiceControl({querySelectorAll:()=>[button]},'ui:tool:reset-plane'),/geschlossenen Menü menu:view-tools/);});

test('drawing update wording resolves the exact visible drawing control and retains disabled/hidden guards',t=>{
 const old=globalThis.getComputedStyle;globalThis.getComputedStyle=()=>({visibility:'visible'});t.after(()=>globalThis.getComputedStyle=old);
 let shown=true;const button={id:'drawing-update',tagName:'BUTTON',dataset:{},textContent:'Blatt aktualisieren',getClientRects:()=>shown?[{}]:[],closest:()=>null,hasAttribute:()=>false,getAttribute:()=>null};
 const doc={getElementById:id=>id==='drawing-update'?button:null,querySelectorAll:q=>q==='label'?[]:[button]};
 assert.equal(practiceControl(doc,'ui:label:Ansichten aktualisieren'),button);button.disabled=true;assert.throws(()=>practiceControl(doc,'ui:label:Ansichten aktualisieren'),/deaktiviert/);button.disabled=false;shown=false;assert.throws(()=>practiceControl(doc,'ui:label:Ansichten aktualisieren'),/fehlt/);
});
