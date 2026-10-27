import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadController} from '../src/cad-controller.js';
import {createCadProject,parseCadProject,cadProjectSnapshot,serializeCadProject} from '../src/cad-project.js';
import {createCadDrawingSheet} from '../src/cad-drawing-data.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadPersistence} from '../src/cad-persistence.js';
import {cadIdentity} from '../src/cad-affine.js';

const drawings=()=>({version:1,sheets:[createCadDrawingSheet({id:'sheet-one',name:'Prüfblatt'})]});
function fixture(){let workers=0;const changes=[];const cad=createCadController({createWorker:()=>{workers++;throw Error('Blattbearbeitung darf keinen CAD-Kern starten.');},createMeshWorker:()=>{throw Error('Kein Netzkern für Zeichnungen.');},onChange:(_p,_s,hints)=>changes.push(hints)});return {cad,changes,workers:()=>workers};}

test('Drawing edits, noop, undo/redo and paper changes never initialize a geometry worker',async()=>{
 const {cad,changes,workers}=fixture();try{
  const original=cad.serialize(),revision=cad.revision();
  const proposal=await cad.previewDrawings(drawings(),{revision});
  assert.equal(cad.serialize(),original);assert.equal(cad.state().undo,0);
  cad.apply(proposal);assert.equal(cad.snapshot().version,12);assert.equal(cad.state().undo,1);assert.equal(changes.at(-1).drawingsOnly,true);
  const noop=await cad.previewDrawings(cad.snapshot().drawings);assert.equal(cad.apply(noop).changed,false);assert.equal(cad.state().undo,1);
  const changed=cad.snapshot().drawings;changed.sheets[0].scale=.5;changed.sheets[0].orientation='portrait';cad.apply(await cad.previewDrawings(changed));
  assert.equal(cad.state().undo,2);cad.undo();assert.equal(cad.snapshot().drawings.sheets[0].scale,1);cad.undo();assert.equal(cad.serialize(),original);cad.redo();assert.equal(cad.snapshot().drawings.sheets[0].scale,1);assert.equal(workers(),0);
 }finally{cad.dispose();}
});

test('Drawing proposal cannot smuggle model changes and stale apply preserves confirmed sheets',async()=>{
 const {cad,workers}=fixture();try{
  const bad=cad.snapshot();bad.name='Fremde Änderung';bad.drawings=drawings();
  await assert.rejects(cad.preview({kind:'drawings'},{project:bad}),/keine vorhandenen Teile/);
  const first=await cad.previewDrawings(drawings()),second=await cad.previewDrawings({...drawings(),sheets:[]});cad.apply(second);const saved=cad.serialize();
  assert.throws(()=>cad.apply(first),{code:'STALE_REVISION'});assert.equal(cad.serialize(),saved);assert.equal(workers(),0);
 }finally{cad.dispose();}
});

test('Revision hold blocks every confirmed model mutation while a drawing file dialog is pending',async()=>{
 const {cad}=fixture();try{
  cad.apply(await cad.previewDrawings(drawings()));const before=cad.serialize(),pending=await cad.previewDrawings({version:1,sheets:[]}),release=cad.holdRevision(cad.revision());
  assert.equal(cad.state().busy,true);assert.throws(()=>cad.apply(pending),{code:'BUSY'});assert.throws(()=>cad.undo(),{code:'BUSY'});assert.throws(()=>cad.redo(),{code:'BUSY'});await assert.rejects(cad.previewDrawings(drawings()),{code:'BUSY'});assert.equal(cad.serialize(),before);
  release();release();assert.equal(cad.state().busy,false);cad.apply(pending);assert.equal(cad.snapshot().drawings.sheets.length,0);assert.throws(()=>cad.holdRevision('old-revision'),{code:'STALE_REVISION'});
 }finally{cad.dispose();}
});

test('Only drawing content raises format; strict parsing rejects disguised new data and unknown schema',()=>{
 const old=createCadProject();assert.equal(parseCadProject(serializeCadProject(old)).version,5);
 const withDrawings=cadProjectSnapshot({...old,drawings:drawings()});assert.equal(withDrawings.version,12);assert.deepEqual(parseCadProject(serializeCadProject(withDrawings)),withDrawings);
 assert.throws(()=>parseCadProject({...withDrawings,version:11}),/Projektformat 12/);
 assert.throws(()=>parseCadProject({...withDrawings,drawings:{version:2,sheets:[]}}),/Zeichnungsversion/);
 assert.throws(()=>parseCadProject({...withDrawings,drawings:{...drawings(),workerHandles:[]}}),/Unbekannte/);
});

test('Library selection keeps only self-contained sheets and insertion renumbers all drawing references atomically',async()=>{
 const body=id=>({id,kind:'cad',name:id,source:'native',solid:true,transform:cadIdentity(),recipe:{type:'box',size:[10,10,10]},brep:{format:'OpenCascade-BRep',data:'BRep-placeholder-for-storage-only',triangulation:false},stats:{bounds:{min:[-5,-5,-5],max:[5,5,5]},volume:1000,solids:1}});
 const owned=createCadDrawingSheet({id:'owned',sourceIds:['body']}),unrelated=createCadDrawingSheet({id:'unrelated',sourceIds:['other']});owned.annotations.push({id:'label-original',kind:'label',text:'Maßblatt',position:[30,30]});
 const initial=createCadProject({nodes:[body('body'),body('other')],drawings:{version:1,sheets:[owned,unrelated]}}),transactions=createCadTransactions({initial,build:async p=>p}),values=new Map();let sequence=0;
 const persistence=createCadPersistence({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},transactions,verify:async p=>p,makeId:()=>`library-${++sequence}`});
 const template=persistence.saveTemplate({name:'Mit Zeichnung',ids:['body']});assert.equal(template.project.version,12);assert.equal(template.project.drawings.sheets.length,1);assert.equal(template.project.drawings.sheets[0].id,'owned');
 const before=transactions.serialize(),proposal=await persistence.previewTemplate({id:template.id,revision:transactions.revision()});assert.equal(transactions.serialize(),before);transactions.apply(proposal);
 const inserted=transactions.snapshot(),sheet=inserted.drawings.sheets.at(-1),newBody=inserted.nodes.at(-1);assert.notEqual(newBody.id,'body');assert.notEqual(sheet.id,'owned');assert.notEqual(sheet.annotations[0].id,'label-original');
 assert.equal(sheet.views.length,3);for(const view of sheet.views){assert.deepEqual(view.sourceIds,[newBody.id]);assert.ok(!owned.views.some(v=>v.id===view.id));}assert.equal(transactions.state().undo,1);transactions.undo();assert.equal(transactions.serialize(),before);
});
