import test from 'node:test';import assert from 'node:assert/strict';
import {practiceControl,installPracticeControlBridge} from '../src/cad-practice-controls.js';
const control=(tag,text,dataset={})=>({tagName:tag,id:'',textContent:text,dataset,getClientRects:()=>[{}],closest:()=>null,hasAttribute:()=>false,getAttribute:()=>null});
function visible(t){const old=globalThis.getComputedStyle;globalThis.getComputedStyle=()=>({visibility:'visible'});t.after(()=>globalThis.getComputedStyle=old);}
test('real failed menu spellings and view-fit resolve only registered semantic targets',t=>{
 visible(t);const menu=control('SUMMARY','CAD-Werkzeuge ▾'),fit=control('BUTTON','Einpassen',{action:'fit'}),doc={querySelectorAll:q=>q==='label'?[]:q==='button'?[fit]:[menu,fit]};
 for(const target of ['ui:label:menu:cad','ui:label:CAD','ui:label:cad'])assert.equal(practiceControl(doc,target),menu);
 assert.equal(practiceControl(doc,'ui:tool:view-fit'),fit);
 assert.throws(()=>practiceControl(doc,'ui:label:unknown-cad-menu'),/fehlt|mehrdeutig/);
});
test('a closed registered tool menu exposes a bounded native opening action',()=>{
 const group={dataset:{toolCategory:'cad'}},button={dataset:{action:'drill'},getClientRects:()=>[],closest:s=>s==='details:not([open])'?group:null};
 assert.throws(()=>practiceControl({querySelectorAll:()=>[button]},'ui:tool:drill'),e=>{assert.deepEqual(e.nextAction,{target:'ui:menu:cad',action:'click'});return true;});
});
test('setting a real select is converted into a native selection with a validated option',t=>{
 visible(t);const node={...control('SELECT',''),id:'cad-edge-kind',options:[{value:'round',textContent:'Runden'},{value:'chamfer',textContent:'Fase'}],scrollIntoView(){},getBoundingClientRect:()=>({left:0,top:0,width:100,height:20})};
 const host={},doc={getElementById:()=>node};installPracticeControlBridge(doc,host);
 const value=host.__formnaroPracticeControl('locate',{target:'ui:id:cad-edge-kind',action:'set',value:'chamfer'});
 assert.equal(value.optionIndex,1);assert.equal(value.controlAction,'choose');
 assert.throws(()=>host.__formnaroPracticeControl('locate',{target:'ui:id:cad-edge-kind',action:'set',value:'unknown'}),/Auswahl/);
});
