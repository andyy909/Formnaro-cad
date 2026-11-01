import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {validateAgentPracticePlan} from '../src/cad-agent-ui-policy.js';
import {practiceControl} from '../src/cad-practice-controls.js';
const {validatePracticePlan}=createRequire(import.meta.url)('../backend/practice-runner.cjs');

test('face selection names a body and world side and cannot inject pixels or topology IDs',()=>{
 const plan={version:1,title:'Öffnungsfläche wählen',actions:[{kind:'shape',type:'box',as:'body'},{kind:'face',target:'body',side:'top'}]};
 assert.deepEqual(validatePracticePlan(plan),plan);assert.deepEqual(validateAgentPracticePlan(plan),plan);
 for(const patch of [{x:50},{faceIndex:6},{target:'../../other'},{side:'random'}]){const bad={...plan,actions:[plan.actions[0],{...plan.actions[1],...patch}]};assert.throws(()=>validatePracticePlan(bad));assert.throws(()=>validateAgentPracticePlan(bad));}
});

test('practice accepts the same registered menu and view spellings as the shared catalogue',()=>{
 const plan={version:1,title:'Katalogziele',actions:[{kind:'ui',action:'click',target:'menu:cad'},{kind:'ui',action:'click',target:'view:top'}]};assert.deepEqual(validatePracticePlan(plan),plan);assert.deepEqual(validateAgentPracticePlan(plan),plan);
});

test('a view label supplied by the shared catalogue resolves the actual view control',t=>{
 const old=globalThis.getComputedStyle;globalThis.getComputedStyle=()=>({visibility:'visible'});t.after(()=>globalThis.getComputedStyle=old);
 const button={id:'iso',tagName:'BUTTON',dataset:{view:'iso'},getClientRects:()=>[{}],closest:()=>null,hasAttribute:()=>false};const document={querySelectorAll:()=>[button]};
 assert.equal(practiceControl(document,'ui:label:Ansicht iso'),button);assert.equal(practiceControl(document,'view:iso'),button);
});

test('closed menu entries do not make a visible modelling button ambiguous',t=>{
 const old=globalThis.getComputedStyle;globalThis.getComputedStyle=()=>({visibility:'visible'});t.after(()=>globalThis.getComputedStyle=old);
 const button=()=>({tagName:'BUTTON',id:'',textContent:'Einpassen',dataset:{action:'fit'},getClientRects:()=>[{}],closest:()=>null,hasAttribute:()=>false,getAttribute:()=>null});
 const current=button(),hidden=button();hidden.parentElement={tagName:'DETAILS',open:false,querySelector:()=>({contains:()=>false})};const document={querySelectorAll:q=>q==='label'?[]:[current,hidden]};assert.equal(practiceControl(document,'ui:label:Einpassen'),current);
});

test('equivalent buttons share one semantic action, while different actions remain ambiguous',t=>{
 const old=globalThis.getComputedStyle;globalThis.getComputedStyle=()=>({visibility:'visible'});t.after(()=>globalThis.getComputedStyle=old);
 const button=action=>({tagName:'BUTTON',id:'',textContent:'Einpassen',dataset:{action},getClientRects:()=>[{}],closest:()=>null,hasAttribute:()=>false,getAttribute:()=>null});const one=button('fit'),two=button('fit'),document={querySelectorAll:q=>q==='label'?[]:[one,two]};
 assert.equal(practiceControl(document,'ui:label:Einpassen'),one);two.dataset.action='different';one.textContent=two.textContent='Unbekannte Aktion';assert.throws(()=>practiceControl(document,'ui:label:Unbekannte Aktion'),/mehrdeutig/);
});

test('a catalogue tool label resolves the actual action even when its tooltip differs',t=>{
 const old=globalThis.getComputedStyle;globalThis.getComputedStyle=()=>({visibility:'visible'});t.after(()=>globalThis.getComputedStyle=old);
 const button={tagName:'BUTTON',id:'',textContent:'F',dataset:{action:'fit'},getClientRects:()=>[{}],closest:()=>null,hasAttribute:()=>false,getAttribute:()=>null},document={querySelectorAll:q=>q==='label'?[]:[button]};assert.equal(practiceControl(document,'ui:label:Einpassen'),button);
});
