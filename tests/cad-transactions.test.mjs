import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadProject} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const fixture=()=>createCadProject({name:'Bestätigt'});
async function change(store,name){const project=store.snapshot();project.name=name;const result=await store.preview({revision:store.revision(),project});return store.apply(result);}

test('A preview identifier from a previous store never names a new preview at the same unchanged revision',async()=>{
 const create=()=>createCadTransactions({initial:fixture(),build:p=>p}),first=create(),second=create(),project=first.snapshot();project.name='Saved draft';
 const old=await first.preview({revision:first.revision(),project}),fresh=await second.preview({revision:second.revision(),project});assert.notEqual(old.previewId,fresh.previewId);
 assert.throws(()=>second.apply({previewId:old.previewId,revision:second.revision()}),{code:'UNKNOWN_PREVIEW'});assert.equal(second.state().undo,0);second.apply(fresh);assert.equal(second.state().undo,1);
});

test('CAD preview keeps the confirmed/auto-save model fixed and commits one isolated Undo',async()=>{
  const pending=deferred(),initial=fixture();let request;
  const store=createCadTransactions({initial,build:(draft,context)=>{request={draft,context};return pending.promise;}}),revision=store.revision(),project=store.snapshot();project.name='Entwurf';
  const work=store.preview({revision,project});await Promise.resolve();assert.equal(request.context.baseline.name,'Bestätigt');assert.equal(store.snapshot().name,'Bestätigt');assert.equal(store.state().undo,0);
  pending.resolve(request.draft);const preview=await work;assert.equal(store.snapshot().name,'Bestätigt');
  preview.project.name='Fremde Mutation';request.draft.name='Auch fremd';
  const result=store.apply(preview);assert.equal(result.project.name,'Entwurf');assert.equal(store.state().undo,1);assert.equal(store.undo().project.name,'Bestätigt');assert.equal(store.redo().project.name,'Entwurf');
});

test('CAD validation failure preserves a full Undo stack and the complete redo boundary',async()=>{
  let reject=false;const store=createCadTransactions({initial:fixture(),build:project=>{if(reject)throw Error('Ungültiger CAD-Körper');return project;}});
  for(let i=0;i<61;i++)await change(store,'Stand '+i);assert.equal(store.state().undo,60);
  const before=store.snapshot(),revision=store.revision();reject=true;const project=store.snapshot();project.name='Fehler';
  await assert.rejects(store.preview({revision,project}),/Ungültiger CAD-Körper/);assert.deepEqual(store.snapshot(),before);assert.equal(store.state().undo,60);
  store.undo();assert.equal(store.state().redo,1);await assert.rejects(store.load(project),/Ungültiger CAD-Körper/);assert.equal(store.state().redo,1);
  for(let i=0;i<59;i++)store.undo();assert.equal(store.snapshot().name,'Stand 0');
});

test('CAD Apply rejects stale/expired previews and is idempotent without adding history',async()=>{
  let time=0;const store=createCadTransactions({initial:fixture(),build:p=>p,now:()=>time,previewLifetime:100});
  const revision=store.revision(),a=store.snapshot(),b=store.snapshot();a.name='A';b.name='B';
  const pa=await store.preview({revision,project:a}),pb=await store.preview({revision,project:b});
  const applied=store.apply(pa);assert.equal(applied.alreadyApplied,false);applied.project.name='Caller';const repeated=store.apply(pa);assert.equal(repeated.project.name,'A');assert.equal(repeated.alreadyApplied,true);assert.equal(store.state().undo,1);
  assert.equal(store.apply(pa).changed,false);store.undo();assert.throws(()=>store.apply(pa),{code:'STALE_REVISION'});store.redo();
  assert.throws(()=>store.apply(pb),{code:'STALE_REVISION'});assert.throws(()=>store.apply({...pa,revision:store.revision()}),{code:'STALE_REVISION'});
  const next=await store.preview({revision:store.revision(),project:b});time=101;assert.throws(()=>store.apply(next),{code:'UNKNOWN_PREVIEW'});
  assert.equal(store.snapshot().name,'A');
});

test('CAD cancellation settles immediately; late worker results cannot replace a new confirmed state',async()=>{
  const pending=deferred();let aborted=0,calls=0;
  const store=createCadTransactions({initial:fixture(),build:p=>++calls===1?pending.promise:p,abort:()=>aborted++}),project=store.snapshot();project.name='Spät';
  const work=store.preview({revision:store.revision(),project});await Promise.resolve();assert.equal(store.cancel(),true);
  await assert.rejects(work,{code:'ABORTED'});assert.equal(aborted,1);assert.equal(store.state().busy,false);assert.equal(store.snapshot().name,'Bestätigt');
  await change(store,'Neuer Stand');pending.resolve(project);await Promise.resolve();await Promise.resolve();assert.equal(store.snapshot().name,'Neuer Stand');assert.equal(store.state().undo,1);
});

test('CAD preview limits and no-op Apply do not lose confirmed history',async()=>{
  const store=createCadTransactions({initial:fixture(),build:p=>p,previewLimit:2});let first;
  for(let i=0;i<3;i++){const p=store.snapshot();p.name='Vorschau '+i;const result=await store.preview({revision:store.revision(),project:p});first??=result;}
  assert.equal(store.state().previews,2);assert.throws(()=>store.apply(first),{code:'UNKNOWN_PREVIEW'});
  const same=await store.preview({revision:store.revision(),project:store.snapshot()}),firstApply=store.apply(same);assert.equal(firstApply.changed,false);assert.equal(firstApply.alreadyApplied,false);assert.equal(store.apply(same).alreadyApplied,true);assert.equal(store.state().undo,0);
});

test('An unchanged Apply retires only its own proposal and retains idempotency, other previews and history',async()=>{const store=createCadTransactions({initial:fixture(),build:p=>p}),same=await store.preview({revision:store.revision(),project:store.snapshot()}),otherProject=store.snapshot();otherProject.name='Other';const other=await store.preview({revision:store.revision(),project:otherProject});assert.equal(store.state().previews,2);assert.equal(store.apply(same).changed,false);assert.equal(store.state().previews,1);assert.equal(store.state().undo,0);assert.equal(store.apply(same).alreadyApplied,true);assert.equal(store.state().previews,1);assert.equal(store.apply(other).changed,true);assert.equal(store.state().previews,0);assert.equal(store.state().undo,1);store.undo();assert.deepEqual(store.snapshot(),fixture());});


test('Confirmed read and serialization caches isolate mutable callers, previews and restored generations',async()=>{
 const store=createCadTransactions({initial:fixture(),build:p=>p}),view=store.readSnapshot(),text=store.serialize();
 assert.equal(store.readSnapshot(),view);assert.ok(Object.isFrozen(view)&&Object.isFrozen(view.layers[0]));assert.throws(()=>{view.layers[0].name='tamper';},TypeError);
 const copy=store.snapshot();copy.name='draft';copy.layers[0].name='changed';assert.equal(store.serialize(),text);
 const preview=await store.preview({project:copy,revision:store.revision()});assert.equal(store.readSnapshot(),view);preview.project.name='tamper';store.apply(preview);
 const next=store.readSnapshot();assert.notEqual(next,view);assert.equal(next.name,'draft');const encoded=store.serialize();assert.notEqual(encoded,text);
 store.undo();assert.equal(store.serialize(),text);assert.notEqual(store.readSnapshot(),next);store.redo();assert.equal(store.serialize(),encoded);
 await store.load(fixture());assert.equal(store.serialize(),text);const noop=await store.preview({project:store.snapshot(),revision:store.revision()}),before=store.readSnapshot();store.apply(noop);assert.equal(store.readSnapshot(),before);
});
