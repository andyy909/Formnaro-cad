const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

const click=id=>({kind:'ui',action:'click',target:'ui:id:'+id});
const sketch={version:1,title:'Rechteck im Skizzeneditor aufziehen',actions:[
 {kind:'ui',action:'click',target:'menu:cad'},{kind:'ui',action:'click',target:'ui:tool:sketch'},
 {kind:'sketch-gesture',point:[-10,-6],to:[10,6],text:'Rechteck im Zeichenfeld aufziehen.'},
 {kind:'ui',action:'set',target:'ui:label:Extrusionshöhe',value:'5'},click('sketch-preview'),click('sketch-apply')
]};
const stl={version:1,title:'Lokales STL rekonstruieren',actions:[
 click('practice-file-1'),click('converter-run'),click('converter-import'),click('converter-apply'),click('stl-close')
]};
function stlBox(){
 const vertices=[[0,0,0],[20,0,0],[20,12,0],[0,12,0],[0,0,6],[20,0,6],[20,12,6],[0,12,6]];
 const faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
 const bytes=Buffer.alloc(84+faces.length*50);
 bytes.writeUInt32LE(faces.length,80);
 faces.forEach((face,i)=>face.forEach((v,j)=>vertices[v].forEach((x,k)=>bytes.writeFloatLE(x,96+i*50+j*12+k*4))));
 return {kind:'stl',name:'Quader.stl',mimeType:'model/stl',base64:bytes.toString('base64')};
}
const exists=pid=>{
 try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}
};

exports.verifyDomain=async function verifyDomain({domain,run,ask,proof,wait,child,interrupted,check}){
 const baseline=await run(`(async()=>{
  const a=window.__cadTest;
  await a.controller.execute({kind:'batch',commands:[{op:'create',type:'box',name:'Geschütztes Ausgangsteil',size:[10,9,8],pos:[-50,0,4]}]});
  await a.settled();
  return {project:await a.controller.transactions.materialize(),revision:a.controller.revision(),selection:[]};
 })()`);
 const parent="(()=>{const a=window.__cadTest,s=a.controller.state();return {model:a.serialize(),revision:s.revision,undo:s.undo,redo:s.redo,previews:s.previews};})()";
 const before=await run(parent),rounds=[];
 const envelope={projectCopy:baseline,plan:domain==='sketch'?sketch:stl,...(domain==='stl'?{files:[stlBox()]}:{})};
 for(const mode of ['resume','abort']){
  const outcome=run('window.offlinecadDesktop.startPractice('+JSON.stringify(envelope)+')');
  let ended,paused,event,last,initialUndo;
  void outcome.then(result=>{ended={ok:result.ok,reason:result.reason??null};},error=>{ended={error:error.message};});
  const deadline=Date.now()+70000;
  let nextSample=0;
  while(Date.now()<deadline&&!ended){
   const c=child();event=interrupted();
   if(c?.connected&&c.fixtureReady&&(event||Date.now()>=nextSample)){
    last=await ask('domain-state');
    if(!event&&last.revision===baseline.revision)initialUndo??=last.undo;
    if(Date.now()>=nextSample){
     fs.writeFileSync(path.join(proof,mode+'-state.json'),JSON.stringify({event,last},null,2));
     nextSample=Date.now()+750;
    }
    if(event&&last.paused==='Weiter'){paused=last;break;}
   }
   await wait(20);
  }
  if(!paused&&child()?.connected)await ask('capture',{file:path.join(proof,'failed-child.png')}).catch(()=>{});
  assert(paused,'Focus pause missing: '+JSON.stringify({event,ended,caption:last?.caption,drag:last?.dragEvents,focused:last?.focused,errors:last?.errors}));
  assert(!paused.focused&&paused.focusLosses>0,'The exercise lost native window focus');
  assert.equal(paused.revision,baseline.revision);
  assert.equal(paused.nodes.length,baseline.project.nodes.length);
  assert(Number.isSafeInteger(initialUndo),'The copied project history was observed before interruption');
  assert.equal(paused.undo,initialUndo);
  assert.deepEqual(paused.errors,[]);
  if(domain==='sketch'){
   assert(paused.draft&&paused.drag&&paused.dragEvents.held<18,'The trusted pointer drag was interrupted');
   assert.equal(paused.draft.dimensions.width,'breite');
   assert.equal(paused.draft.dimensions.depth,'tiefe');
  }
  else assert(event.pid&&exists(event.pid)&&paused.converterPid===event.pid,'The real native converter is still running');
  check(true,mode+': genuine focus switch pauses during '+domain+' before any model commit');
  const c=child(),exited=new Promise(resolve=>c.once('exit',(code,signal)=>resolve({code,signal})));
  const round={mode,paused,event};
  if(mode==='resume'){
   await wait(450);
   const held=await ask('domain-state');
   assert.equal(held.revision,paused.revision);
   assert.deepEqual(held.nodes,paused.nodes);
   assert.deepEqual(held.draft,paused.draft);
   assert.equal(held.undo,initialUndo);
   await ask('capture',{file:path.join(proof,'paused.png')});
   await ask('resume');
   const result=await outcome;
   assert.equal(result.ok,true,result.reason);
   assert(result.resultRef);
   const project=await run(`window.offlinecadDesktop.practiceProjectResult({action:'read',id:${JSON.stringify(result.resultRef)}})`);
   const ids=new Set(baseline.project.nodes.map(node=>node.id)),added=project.nodes.filter(node=>!ids.has(node.id));
   assert.equal(added.length,1);
   assert.equal(added[0].stats.solids,1);
   const volume=added[0].stats.volume,expected=20*12*(domain==='sketch'?5:6);
   assert(Math.abs(volume-expected)<.001,'Native analytical volume');
   assert.deepEqual(project.nodes.filter(node=>ids.has(node.id)),baseline.project.nodes);
   const done=await ask('domain-state');
   assert.equal(done.undo,initialUndo+1);
   assert.deepEqual(done.errors,[]);
   if(event.pid)assert(!exists(event.pid),'Converter remains running after success');
   round.result={volume,steps:result.steps.length,undo:done.undo};
   await Promise.race([ask('end').catch(()=>{}),exited]);
   check(true,'Weiter completes the same exercise with one verified native result');
  }else{
   await Promise.race([ask('escape').catch(()=>{}),exited]);
   const result=await outcome;
   assert.equal(result.ok,false);
   assert.equal(result.resultRef,undefined);
   round.result={reason:result.reason};
   check(true,'Esc cancels the paused exercise without offering a result');
  }
  round.exit=await exited;
  assert.deepEqual(round.exit,{code:0,signal:null});
  if(event.pid){
   if(mode==='abort')assert.equal(c.fixtureClose?.converterPid,event.pid,'Abort must begin while the native converter is running');
   assert(!exists(event.pid),'Converter survived child shutdown');
  }
  assert.equal(c.fixtureCleanup?.converterActive,false);
  assert.deepEqual(c.fixtureCleanup?.converterDirectories,[]);
  round.cleanup=c.fixtureCleanup;
  assert(c.fixtureDirectory,'Child workspace identity is missing');
  assert.equal(fs.existsSync(c.fixtureDirectory),false,'Private child workspace remains');
  assert.deepEqual(await run(parent),before);
  rounds.push(round);
 }
 return {ok:true,domain,rounds};
};
