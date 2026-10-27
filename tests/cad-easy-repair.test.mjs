import test from 'node:test';
import assert from 'node:assert/strict';
import {createEasyMeshRepair} from '../src/cad-easy-repair.js';

const digest=n=>n.toString(16).padStart(64,'0');
const meshNode=(id,n=1,extra={})=>({id,kind:'mesh',layerId:'default',folderId:null,mesh:{digest:digest(n)},...extra});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(nodes=[meshNode('part')],options={}){
  let project={nodes,layers:[{id:'default',hidden:false,locked:false}],folders:[]},revision='r0',sequence=0,enabled=true,idle=true;
  const timers=new Map(),queries=[],previews=[],applies=[],discards=[],notifications=[],undo=[],redo=[],proposals=new Map();let timerId=0,activeQueries=0,maxQueries=0;
  function replace(next,rev){project=structuredClone(next);revision=rev??'r'+(++sequence);}
  const controller={readSnapshot:()=>project,revision:()=>revision,
    async meshQuery(name,request){
      queries.push({name,...structuredClone(request)});activeQueries++;maxQueries=Math.max(maxQueries,activeQueries);
      try{
        const node=project.nodes.find(n=>n.id===request.id),geometryDigest=node.mesh.digest;
        if(request.attemptedDigests.includes(geometryDigest))return {status:'skipped',geometryDigest};
        return options.query?await options.query({name,request,node,controller}):{status:'repaired',geometryDigest,outputDigest:digest(900),operation:{type:'mesh-repair',id:node.id,fillSmallHoles:true}};
      }finally{activeQueries--;}
    },
    async preview(operation,request){
      previews.push({operation:structuredClone(operation),...request});
      if(options.preview)await options.preview(operation,request);
      const proposal={previewId:'preview-'+previews.length,revision:request.revision,resultRevision:options.noChange?request.revision:'next-'+previews.length,operation};
      proposals.set(proposal.previewId,proposal);return proposal;
    },
    apply(request){
      applies.push(request);assert.equal(request.revision,revision);const proposal=proposals.get(request.previewId);assert.ok(proposal);
      undo.push({project:structuredClone(project),revision});redo.length=0;
      const next=structuredClone(project);next.nodes.find(n=>n.id===proposal.operation.id).mesh={digest:digest(900)};replace(next);proposals.delete(request.previewId);
      options.onApply?.();return {changed:true,revision};
    },
    discard:id=>{discards.push(id);proposals.delete(id);},
    undo(){const saved=undo.pop();assert.ok(saved);redo.push({project:structuredClone(project),revision});replace(saved.project,saved.revision);},
    redo(){const saved=redo.pop();assert.ok(saved);undo.push({project:structuredClone(project),revision});replace(saved.project,saved.revision);},
    change:mutate=>{const next=structuredClone(project);mutate?.(next);replace(next);}
  };
  const scheduler=createEasyMeshRepair({controller,isEnabled:()=>enabled,isIdle:()=>idle,isVisible:id=>id!=='view-hidden',notify:text=>notifications.push(text),afterApply:options.afterApply,setTimer:(fn,delay)=>{assert.equal(delay,350);const id=++timerId;timers.set(id,fn);return id;},clearTimer:id=>timers.delete(id)});
  return {scheduler,controller,queries,previews,applies,discards,notifications,undo,redo,timers,get maxQueries(){return maxQueries;},setEnabled:value=>{enabled=value;},setIdle:value=>{idle=value;},async next(){const entry=timers.entries().next().value;assert.ok(entry,'expected a pending deferred run');timers.delete(entry[0]);entry[1]();await tick();},async drain(){for(let i=0;timers.size;i++){assert.ok(i<20,'scheduler must settle');await this.next();}}};
}

test('deferred repair creates one undo step, remembers both geometries and respects Undo',async()=>{
  const f=fixture(),before=structuredClone(f.controller.readSnapshot());f.scheduler.schedule();f.scheduler.schedule();assert.equal(f.timers.size,1);assert.equal(f.queries.length,0);
  await f.drain();assert.equal(f.applies.length,1);assert.equal(f.undo.length,1);assert.equal(f.previews[0].label,'Netz automatisch reparieren');assert.deepEqual(f.applies[0],{previewId:'preview-1',revision:'r0'});assert.match(f.notifications[0],/Rückgängig/);assert.equal(f.scheduler.state().repaired,1);
  assert.ok(f.queries[1].attemptedDigests.includes(digest(1)));assert.ok(f.queries[1].attemptedDigests.includes(digest(900)));
  f.controller.undo();assert.deepEqual(f.controller.readSnapshot(),before);f.scheduler.schedule();await f.drain();assert.equal(f.applies.length,1);assert.equal(f.undo.length,0);assert.equal(f.notifications.length,1);assert.ok(f.queries.at(-1).attemptedDigests.includes(digest(1)));
  f.controller.redo();f.scheduler.schedule();await f.drain();assert.equal(f.applies.length,1);assert.equal(f.undo.length,1);
});

test('normal mode is inactive; hidden, inherited locks, protection and non-mesh roots are skipped',async()=>{
  const f=fixture([meshNode('hidden',1,{hidden:true}),meshNode('locked',2,{locked:true}),meshNode('layer-hidden',3,{layerId:'hide'}),meshNode('folder-locked',4,{folderId:'child'}),meshNode('protected',5,{metadata:{meshProtection:{regions:[{}]}}}),meshNode('view-hidden',6),meshNode('native',7,{kind:'cad'}),meshNode('reference',8,{kind:'referenceMesh'}),meshNode('valid',9)],{query:({node})=>({status:'healthy',geometryDigest:node.mesh.digest})});
  f.controller.readSnapshot().layers.push({id:'hide',hidden:true,locked:false});f.controller.readSnapshot().folders.push({id:'parent',locked:true,parentId:null},{id:'child',parentId:'parent'});
  f.setEnabled(false);f.scheduler.schedule();assert.equal(f.timers.size,0);await f.scheduler.flush();assert.equal(f.queries.length,0);
  f.setEnabled(true);f.scheduler.schedule();await f.drain();assert.deepEqual(f.queries.map(q=>q.id),['valid']);assert.equal(f.applies.length,0);assert.equal(f.notifications.length,0);
});

test('unrepairable geometry is unchanged and announced once across unrelated edits',async()=>{
  const f=fixture(undefined,{query:({node})=>({status:'unrepairable',geometryDigest:node.mesh.digest})}),before=structuredClone(f.controller.readSnapshot());
  f.scheduler.schedule();await f.drain();f.scheduler.schedule();await f.drain();assert.equal(f.queries.length,1);assert.deepEqual(f.controller.readSnapshot(),before);assert.equal(f.applies.length,0);assert.equal(f.notifications.length,1);
  f.controller.change(p=>{p.name='new name';});f.scheduler.schedule();await f.drain();assert.equal(f.queries.length,2);assert.equal(f.notifications.length,1);assert.equal(f.scheduler.state().unrepairable,1);
});

test('revision changes and mode epochs reject stale analyses before preview',async()=>{
  for(const invalidate of [false,true]){
    const waiting=deferred(),f=fixture(undefined,{query:async({node})=>{await waiting.promise;return {status:'repaired',geometryDigest:node.mesh.digest,outputDigest:digest(900),operation:{type:'mesh-repair',id:node.id}};}});
    f.scheduler.schedule();await f.next();assert.equal(f.scheduler.state().running,true);
    if(invalidate){f.setEnabled(false);f.scheduler.invalidate();f.setEnabled(true);}else f.controller.change(p=>{p.name='edited';});
    waiting.resolve();await tick();assert.equal(f.previews.length,0);assert.equal(f.applies.length,0);assert.equal(f.scheduler.state().running,false);assert.equal(f.notifications.length,0);
  }
});

test('stale, hidden or unchanged previews are discarded without applying',async()=>{
  for(const reason of ['revision','mode','visibility','unchanged']){
    const waiting=deferred(),f=fixture(undefined,{preview:()=>waiting.promise,noChange:reason==='unchanged'});f.scheduler.schedule();await f.next();assert.equal(f.previews.length,1);
    if(reason==='revision')f.controller.change();if(reason==='mode')f.scheduler.cancel();if(reason==='visibility')f.controller.readSnapshot().nodes[0].hidden=true;
    waiting.resolve();await tick();assert.equal(f.applies.length,0);assert.deepEqual(f.discards,['preview-1']);assert.equal(f.notifications.length,0);
  }
});

test('busy deferral waits for a state notification and serializes repeated schedules',async()=>{
  const waiting=deferred(),f=fixture(undefined,{query:async({node})=>{await waiting.promise;return {status:'healthy',geometryDigest:node.mesh.digest};}});
  f.setIdle(false);f.scheduler.schedule();await f.next();assert.equal(f.queries.length,0);assert.equal(f.scheduler.state().pending,true);assert.equal(f.timers.size,0);
  f.setIdle(true);f.scheduler.schedule();await f.next();assert.equal(f.queries.length,1);for(let i=0;i<8;i++)f.scheduler.schedule();assert.equal(f.timers.size,0);
  waiting.resolve();await tick();await f.drain();assert.equal(f.maxQueries,1);assert.equal(f.queries.length,1);assert.equal(f.scheduler.state().pending,false);
});

test('flush runs before its timer and shares an already running repair',async()=>{
  const waiting=deferred(),f=fixture(undefined,{preview:()=>waiting.promise});f.scheduler.schedule();await f.next();const flushed=f.scheduler.flush();assert.equal(f.previews.length,1);
  waiting.resolve();await flushed;assert.equal(f.applies.length,1);assert.equal(f.maxQueries,1);assert.equal(f.timers.size,0);assert.equal(f.scheduler.state().running,false);
  const renders=[deferred(),deferred()];let renderIndex=0,activeRenders=0,maxRenders=0,finished=false;
  const multiple=fixture([meshNode('a',1),meshNode('b',2)],{onApply:()=>multiple.setIdle(false),afterApply:async()=>{activeRenders++;maxRenders=Math.max(maxRenders,activeRenders);await renders[renderIndex++].promise;activeRenders--;multiple.setIdle(true);}});
  multiple.scheduler.schedule();const complete=multiple.scheduler.flush().then(()=>{finished=true;});await tick();
  assert.equal(multiple.applies.length,1);assert.equal(multiple.queries.length,1);assert.equal(multiple.scheduler.state().running,true);assert.equal(finished,false);
  renders[0].resolve();await tick();assert.equal(multiple.applies.length,2);assert.equal(multiple.scheduler.state().running,true);assert.equal(finished,false);
  renders[1].resolve();await complete;assert.equal(multiple.applies.length,2);assert.equal(multiple.undo.length,2);assert.equal(multiple.timers.size,0);assert.equal(multiple.maxQueries,1);assert.equal(maxRenders,1);assert.equal(activeRenders,0);assert.equal(finished,true);
});

test('query/preview failures stay quiet and cannot leave previews or retry loops',async()=>{
  for(const phase of ['query','preview']){
    const f=fixture(undefined,{[phase]:()=>{throw Error('worker failed');}});f.scheduler.schedule();await f.drain();f.scheduler.schedule();await f.drain();assert.equal(f.queries.length,1);assert.equal(f.applies.length,0);assert.equal(f.scheduler.state().failures,1);assert.equal(f.notifications.length,0);assert.equal(f.scheduler.state().running,false);
  }
});

test('digest history has finite per-object and project bounds',async()=>{
  const f=fixture(undefined,{query:({node})=>({status:'healthy',geometryDigest:node.mesh.digest})});
  for(let i=1;i<=140;i++){f.controller.change(p=>{p.nodes=[meshNode('same',i)];});await f.scheduler.flush();}
  assert.equal(f.scheduler.state().historyIds,1);assert.equal(f.scheduler.state().historyDigests,128);
  f.controller.change(p=>{p.nodes=Array.from({length:530},(_,i)=>meshNode('part-'+i,i+1000));});await f.scheduler.flush();assert.equal(f.scheduler.state().historyIds,512);assert.equal(f.scheduler.state().historyDigests,512);assert.equal(f.maxQueries,1);
});
