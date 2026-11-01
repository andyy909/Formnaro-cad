import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {validateAgentPracticePlan} from '../src/cad-agent-ui-policy.js';
const {validatePracticePlan}=createRequire(import.meta.url)('../backend/practice-runner.cjs');
import {practiceControl,practiceDialogState,installPracticeControlBridge} from '../src/cad-practice-controls.js';
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
