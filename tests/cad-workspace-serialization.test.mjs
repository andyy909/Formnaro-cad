import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadProject,createCadWorkspaceSerializer,parseCadProject,serializeCadProject,CAD_PROJECT_LIMITS} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadController} from '../src/cad-controller.js';
import {CAD_QUALITY_DEFAULTS} from '../src/cad-quality.js';
import {defaultLayout} from '../src/layout-preferences.js';

const workspace=()=>({version:1,view:{projection:'perspective',position:[123,-200,400],target:[2,3,4],up:[0,0,1],zoom:2.5},selection:[],mode:'rotate',snap:.25,quality:structuredClone(CAD_QUALITY_DEFAULTS),layout:defaultLayout()});
const node=(id='body',data='Storage-only fixture')=>({id,kind:'cad',name:'日本語 · Fläche',source:'step',solid:true,transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],brep:{format:'OpenCascade-BRep',data,triangulation:false},stats:{bounds:{min:[-5,-5,-5],max:[5,5,5]},volume:1000,solids:1}});

test('Workspace serialization is byte-identical, validates each workspace and captures its own model generation',()=>{
  const initial=createCadProject({nodes:[node()],workspace:workspace()}),encode=createCadWorkspaceSerializer(initial),state=workspace();
  state.selection=[{rootId:'body',path:[]}];state.view.target[0]=-0;
  const expected=serializeCadProject({...initial,workspace:state});assert.equal(encode(state),expected);
  initial.nodes[0].name='Mutated caller';initial.workspace.view.zoom=99;
  assert.equal(encode(state),expected);state.view.zoom=3;assert.equal(parseCadProject(encode(state)).workspace.view.zoom,3);
  for(const change of [v=>v.extra=true,v=>v.view.zoom=Infinity,v=>v.view.up=[0,0,0],v=>v.selection=[{rootId:'body',path:[],code:'invalid'}]]){const invalid=workspace();change(invalid);assert.throws(()=>encode(invalid));}
});

test('Confirmed workspace autosave remains fixed during calculation, preview, abort, apply and Undo/Redo',async()=>{
  let resume;
  const store=createCadTransactions({initial:createCadProject({nodes:[node()]}),build:p=>new Promise(resolve=>{resume=()=>resolve(p);})}),state=workspace(),first=store.serializeWorkspace(state),draft=store.snapshot();draft.nodes[0].name='Draft';
  const pending=store.preview({revision:store.revision(),project:draft});await Promise.resolve();state.view.zoom=3;
  assert.equal(parseCadProject(store.serializeWorkspace(state)).nodes[0].name,'日本語 · Fläche');assert.equal(parseCadProject(store.serializeWorkspace(state)).workspace.view.zoom,3);
  resume();const preview=await pending;assert.equal(parseCadProject(store.serializeWorkspace(state)).nodes[0].name,'日本語 · Fläche');store.apply(preview);
  const applied=store.serializeWorkspace(state);assert.equal(parseCadProject(applied).nodes[0].name,'Draft');store.undo();state.view.zoom=2.5;assert.equal(store.serializeWorkspace(state),first);store.redo();state.view.zoom=3;assert.equal(store.serializeWorkspace(state),applied);
  draft.nodes[0].name='Cancelled';const cancelled=store.preview({revision:store.revision(),project:draft});await Promise.resolve();store.cancel();await assert.rejects(cancelled,{code:'ABORTED'});resume();assert.equal(store.serializeWorkspace(state),applied);
  const cad=createCadController({initial:store.snapshot(),createWorker:()=>{throw Error('Autosave must not start geometry work');}});
  try{assert.equal(cad.serializeWorkspace(state),applied);assert.equal(cad.transactions.serialize(),cad.serialize());assert.equal(cad.state().undo,0);}finally{cad.dispose();}
});

test('Workspace changes count UTF-8 bytes against the existing complete project size limit',()=>{
  const data='é'.repeat(5*1024*1024),initial=createCadProject({nodes:Array.from({length:5},(_,i)=>node('body'+i,data))}),encode=createCadWorkspaceSerializer(initial);
  assert.throws(()=>encode(workspace()),/größer als 50 MB/);
  // The project is otherwise valid; individual BRep limits remain unchanged.
  assert.equal(initial.nodes.length,5);assert.equal(CAD_PROJECT_LIMITS.bytes,50*1024*1024);
});
