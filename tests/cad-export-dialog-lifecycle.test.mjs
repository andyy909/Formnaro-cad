import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadExportWorkflow} from '../src/cad-export-workflow.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function harness({download=async()=>{}}={}){
 const gate=deferred(),nodes={},dialog={open:true,closes:0,close(){this.closes++;this.open=false;}};
 let modalSequence=0;
 for(const id of ['export-format','export-scope','export-deflection','export-angle','export-status','export-confirm'])nodes[id]={value:'',textContent:'',isConnected:true};
 nodes.modal=dialog;
 const {exportDialog,exportModel}=createCadExportWorkflow({
  activeEasyKind:()=>null,getEasyDomainRevision:()=>0,project:()=>({name:'Synthetic'}),
  prepareDialog:()=>{},modal:()=>{modalSequence++;dialog.open=true;},getModalSequence:()=>modalSequence,$:id=>nodes[id],
  quality:{get:()=>({export:{deflection:.01,angleDegrees:5}})},
  workflowSettings:{get:()=>({export:{format:'svg',scope:'all'}})},
  safe:fn=>fn(),selected:()=>[],controller:{exportModel:()=>gate.promise},exportSvg:()=>gate.promise,download,
 });
 exportDialog();
 return {nodes,dialog,gate,exportModel,run:()=>nodes['export-confirm'].onclick(),replace(){nodes['export-status'].isConnected=false;nodes['export-status']=null;modalSequence++;dialog.open=true;}};
}
test('Late SVG failure after closing or replacing its dialog neither touches removed controls nor closes the replacement',async()=>{
 const h=harness(),pending=h.run();h.replace();h.gate.reject(Object.assign(Error('Netz ist nicht geschlossen'),{code:'SVG_INVALID_MESH'}));await pending;assert.equal(h.dialog.closes,0);assert.equal(h.dialog.open,true);
});
test('Late successful export does not close a newer dialog',async()=>{
 const h=harness(),pending=h.run();h.replace();h.gate.resolve({svg:'<svg/>'});await pending;assert.equal(h.dialog.closes,0);assert.equal(h.dialog.open,true);
});
test('An active export shows a known SVG error inline and only its own successful completion closes the dialog',async()=>{
 const h=harness(),pending=h.run();h.gate.reject(Object.assign(Error('Offene Netze: passende Teile auswählen'),{code:'SVG_OPEN_MESH'}));await pending;assert.match(h.nodes['export-status'].textContent,/Offene Netze/);assert.equal(h.dialog.closes,0);
 const success=harness(),saving=success.run();success.gate.resolve({svg:'<svg/>'});await saving;assert.equal(success.dialog.closes,1);
});
test('Closing the export while geometry is computed prevents a late file download for SVG and other formats',async()=>{
 for(const format of ['svg','step']){
  let live=true,downloads=0;
  const h=harness({download:async()=>{downloads++;}});
  const pending=h.exportModel(format,{current:()=>live});live=false;h.gate.resolve(format==='svg'?{svg:'<svg/>'}:{data:new Uint8Array([1]),extension:'step',mime:'model/step'});const result=await pending;assert.equal(result.canceled,true);assert.equal(downloads,0);
 }
});
