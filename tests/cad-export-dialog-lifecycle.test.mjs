import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {easyExportIds} from '../src/cad-easy-domain.js';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/cad-main.js',import.meta.url),'utf8');
const dialogSource=source.slice(source.indexOf('function exportDialog(){'),source.indexOf('\nfunction help(){'));
const exportSource=source.slice(source.indexOf('async function exportModel('),source.indexOf('\nfunction exportDialog(){'));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function harness(){
 const gate=deferred(),nodes={},dialog={open:true,closes:0,close(){this.closes++;this.open=false;}};
 for(const id of ['export-format','export-scope','export-deflection','export-angle','export-status','export-confirm'])nodes[id]={value:'',textContent:'',isConnected:true};
 nodes.modal=dialog;
 const context={meshSculptUI:null,meshFeaturesUI:null,meshReduceUI:null,meshRemeshUI:null,meshSmoothUI:null,meshEraseFillUI:null,meshMakeSolidUI:null,meshHollowUI:null,activeEasyKind:()=>null,easyDomainRevision:0,easyExportIds,modalSequence:0,modal:()=>{context.modalSequence++;dialog.open=true;},$:id=>nodes[id],quality:{get:()=>({export:{deflection:.01,angleDegrees:5}})},workflowSettings:{get:()=>({export:{format:'svg',scope:'all'}})},safe:fn=>fn(),selected:()=>[],exportModel:()=>gate.promise};
 vm.runInNewContext(dialogSource+'\nexportDialog();',context);
 return {context,nodes,dialog,gate,run:()=>nodes['export-confirm'].onclick(),replace(){nodes['export-status'].isConnected=false;nodes['export-status']=null;context.modalSequence++;dialog.open=true;}};
}
test('Late SVG failure after closing or replacing its dialog neither touches removed controls nor closes the replacement',async()=>{
 const h=harness(),pending=h.run();h.replace();h.gate.reject(Object.assign(Error('Netz ist nicht geschlossen'),{code:'SVG_INVALID_MESH'}));await pending;assert.equal(h.dialog.closes,0);assert.equal(h.dialog.open,true);
});
test('Late successful export does not close a newer dialog',async()=>{
 const h=harness(),pending=h.run();h.replace();h.gate.resolve({saved:true});await pending;assert.equal(h.dialog.closes,0);assert.equal(h.dialog.open,true);
});
test('An active export shows a known SVG error inline and only its own successful completion closes the dialog',async()=>{
 const h=harness(),pending=h.run();h.gate.reject(Object.assign(Error('Offene Netze: passende Teile auswählen'),{code:'SVG_OPEN_MESH'}));await pending;assert.match(h.nodes['export-status'].textContent,/Offene Netze/);assert.equal(h.dialog.closes,0);
 const success=harness(),saving=success.run();success.gate.resolve({saved:true});await saving;assert.equal(success.dialog.closes,1);
});
test('Closing the export while geometry is computed prevents a late file download for SVG and other formats',async()=>{
 for(const format of ['svg','step']){
  const gate=deferred();let live=true,downloads=0;
  const context={activeEasyKind:()=>null,easyDomainRevision:0,easyExportIds,quality:{get:()=>({export:{deflection:.01,angleDegrees:5}})},controller:{exportModel:()=>gate.promise},exportCadProjectSvg:()=>gate.promise,project:()=>({name:'Synthetic'}),download:async()=>{downloads++;}};
  vm.runInNewContext(exportSource+'\nrun=exportModel;',context);
  const pending=context.run(format,{current:()=>live});live=false;gate.resolve(format==='svg'?{svg:'<svg/>'}:{data:new Uint8Array([1]),extension:'step',mime:'model/step'});const result=await pending;assert.equal(result.canceled,true);assert.equal(downloads,0);
 }
});
