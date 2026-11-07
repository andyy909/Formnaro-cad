const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const assert=require('node:assert/strict');
const fixtureNames=['standard-box','atlas-5','cnc','step-spheres','colored-bored-group'];
exports.verifyCadMiniPerformance=async(win,{directory,fixtureDirectory,files}={})=>{
 const checks=[],run=code=>win.webContents.executeJavaScript(code);
 const timing=process.env.FORMNARO_PERFORMANCE_TIMING==='1';
 const memory=()=>require('electron').app.getAppMetrics().map(({pid,type,memory})=>({pid,type,workingSetBytes:memory.workingSetSize*1024}));
 async function check(name,code){fs.writeFileSync(path.join(directory,'progress.json'),JSON.stringify({checks,pending:name}));const result=await run(`(async()=>{const a=window.__cadTest,assert=(v,m)=>{if(!v)throw Error(m)};${code}})()`);checks.push(name);return result;}
 async function captureFixture(name){
  const fixture=await run(`(async()=>{
   const a=window.__cadTest;
   a.view.fit();
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   return {
    project:await a.serializeWorkspace(),
    selection:a.selection(),
    quality:a.getQuality(),
    viewport:{width:innerWidth,height:innerHeight,devicePixelRatio}
   };
  })()`);
  fs.writeFileSync(path.join(directory,`${name}.fixture.json`),JSON.stringify(fixture));
 }
 win.setSize(1440,1000);
 if(process.env.FORMNARO_STARTUP_PHASES==='1'){
  const startup=await run(`(()=>{
   const phases=window.__cadTest.startupPhases();
   const a=window.__cadTest;
   return {phases,roots:a.getModel().nodes.length,observed:window.__startupObserved??[],earlyClicks:window.__startupEarlyClicks??[],ready:window.__cadReady,
    noticeHidden:document.getElementById('startup-phase').hidden,recoveryBlocked:a.recovery.blocked(),
    checkpointPending:a.recovery.isWriting(),saveStatus:document.getElementById('save-state').textContent};
  })()`);
  assert(startup.ready&&startup.noticeHidden);
  const names=startup.phases.map(phase=>phase.name);
  for(const required of ['load-data','mount-ui','read-recovery','build-view'])assert(names.includes(required),required);
  if(startup.roots){
   for(const required of ['validate-project','restore-workspace'])assert(names.includes(required),required);
   assert(startup.observed.some(phase=>phase.name==='validate-project'||phase.name==='build-view'),'Large recovery had no visible loading phase');
  }
  const checks=['Startup phases measured and loading status cleared after readiness'];
  assert(startup.earlyClicks.length&&!startup.earlyClicks.some(event=>event.modalOpen),'A startup click opened a competing action');
  checks.push('Project and welcome clicks during startup leave the model load in control');
  if(process.env.FORMNARO_STARTUP_CHECKPOINT_DELAY==='1'){
   assert(startup.checkpointPending&&startup.saveStatus==='Sicherung läuft');
   checks.push('Model becomes ready while the separately labeled checkpoint is still pending');
  }
  if(process.env.FORMNARO_STARTUP_CORRUPT==='1'){
   assert.equal(startup.roots,0);
   assert(startup.recoveryBlocked&&!startup.checkpointPending);
   const file=path.join(directory,'portable-data','autosicherung-cad-v7.json');
   assert.equal(fs.readFileSync(file,'utf8'),'invalid isolated recovery fixture');
   checks.push('Corrupt recovery stays unchanged while the empty editor opens without autosaving');
  }
  return {ok:true,checks,startup};
 }
 if(fixtureDirectory&&process.env.FORMNARO_SCALE_ACCEPTANCE==='1'){
  return require('./scale-acceptance-verification.cjs').verifyScaleAcceptance(win,{directory,fixtureDirectory,files});
 }
 if(fixtureDirectory&&process.env.FORMNARO_RECOVERY_ENCODING_PROOF==='1'){
  return require('./recovery-encoding-verification.cjs').verifyRecoveryEncoding(win,{directory,fixtureDirectory,files});
 }
 if(fixtureDirectory){
  const fixtures={};
  for(const name of fixtureNames){
   files.save=path.join(fixtureDirectory,name+'.ocad');
   const hash=()=>createHash('sha256').update(fs.readFileSync(files.save)).digest('hex');
   const sha256=hash();
   const reopen=()=>check('Open '+name+' through desktop project storage',`
    await a.resetProject();
    await a.openProject();
    await a.settled();
    a.select([]);
    a.view.restoreView({projection:'perspective',position:[1,-1.3,1.1],target:[0,0,0],up:[0,0,1],zoom:1});
    a.view.fit();
    const model=a.getModel();
    assert(model.nodes.length>0,'fixture did not open');
    const encoded=new TextEncoder().encode(a.serialize());
    const digest=await crypto.subtle.digest('SHA-256',encoded);
    const modelSha256=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
    return {name:model.name,roots:model.nodes.length,modelSha256,quality:a.getQuality(),
     view:a.view.viewState(),selection:a.selection(),viewport:{width:innerWidth,height:innerHeight,devicePixelRatio}};
   `);
   const first=await reopen(),second=await reopen();
   assert.deepEqual(second,first,name+' starting state changed');
   assert.equal(hash(),sha256,name+' input bytes changed');
   fixtures[name]={sha256,...first};
  }
  return {ok:true,checks,fixtures,windowSize:win.getSize()};
 }
 await check('Single native standard box for short interaction measurements',`
  await a.resetProject();a.workbenchUI.setMode('easy');a.workbenchUI.setDomain('cad');
  await a.execute({kind:'batch',commands:[{op:'create',type:'box',size:[30,20,12],pos:[0,0,6]}]});
  await a.settled();a.view.fit();
  assert(a.getModel().nodes.length===1,'standard box fixture');
 `);
 await captureFixture('standard-box');
 await check('Native CAD fixture in Easy Tinker, analytic curved bodies and independent STEP source',`
  await a.resetProject();a.workbenchUI.setMode('easy');a.workbenchUI.setDomain('cad');
  await a.execute({kind:'batch',commands:Array.from({length:36},(_,i)=>({op:'create',type:i%3?'cylinder':'roundbox',size:[18,18,12],pos:[(i%9-4)*24,(Math.floor(i/9)-2)*24,6],name:'CAD '+i}))});await a.settled();
  window.__cadPerf={};const p=a.getModel();assert(p.nodes.length===36,'fixture count');a.select([{rootId:p.nodes[0].id,path:[]}]);
 `);
 await captureFixture('native-cad');
 const initialMemory=timing?memory():null;
 const pipeline=await check('CAD selection, pure translation, rotation and scale preserve exact Undo and project quality',`
  const measureInteraction=${timing?`(${require('./cad-performance-probe.cjs').measureInteraction.toString()})`:'null'};
  window.__measureCadPipeline=async()=>{const measurements=[],original=a.serialize(),quality=JSON.stringify(a.getQuality()),project=a.getModel(),id=project.nodes[0].id;
  const selection=[];for(let i=0;i<13;i++){const t=performance.now();a.select([]);a.select([{rootId:id,path:[]}]);if(i>=3)selection.push(performance.now()-t);}
  for(const operation of ['move','rotate','scale'])for(let i=0;i<5;i++){
   const before=a.serialize(),undo=a.undoDepth(),p=a.getModel(),beforeBreps=p.nodes.map(n=>n.brep.data),stages=[];
   const originals={};for(const method of ['display','describe']){originals[method]=a.controller[method];a.controller[method]=async(...args)=>{const start=performance.now();try{return await originals[method](...args);}finally{stages.push({stage:method,ms:performance.now()-start});}};}
   const action=()=>a.mutate(p=>{const n=p.nodes.find(n=>n.id===id),m=n.transform;if(operation==='move'){m[12]+=3;m[13]+=2;}else if(operation==='rotate'){const x=[...m],angle=(37+i*9)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);for(let j=0;j<3;j++){m[j*4]=c*x[j*4]-s*x[j*4+1];m[j*4+1]=s*x[j*4]+c*x[j*4+1];}}else {const factor=1.02+i*.01;m[0]*=factor;m[1]*=factor;m[2]*=factor;}},'CAD benchmark '+operation);
   const start=performance.now(),revision=a.controller.revision(),setDisplay=a.view.setDisplay;
   let timings;
   if(measureInteraction)a.view.setDisplay=function(...args){const start=performance.now();try{return setDisplay.apply(this,args);}finally{stages.push({stage:'viewPreparation',ms:performance.now()-start});}};
   try{
    if(measureInteraction){
     timings=await measureInteraction(a,action,()=>{
      const current=a.sourceDisplayState();
      return current.revision!==revision&&current.sceneRevision===current.revision;
     });
     assert(timings.finishedViewMs!==null,'committed view was not drawn');
    }
    else {await action();await a.settled();}
   }finally{a.view.setDisplay=setDisplay;for(const method of Object.keys(originals))a.controller[method]=originals[method];}
   const ms=performance.now()-start,after=a.serialize(),next=a.getModel();assert(a.undoDepth()===undo+1,'single Undo');assert(next.nodes.every((n,k)=>n.brep.data===beforeBreps[k]),'transform altered local BRep');
   if(i||timings)measurements.push({operation,ms,stages,...(timings?{iteration:i,timings}:{})});await a.actions.undo();await a.settled();assert(a.serialize()===before,'exact Undo');await a.actions.redo();await a.settled();assert(a.serialize()===after,'exact Redo');await a.actions.undo();await a.settled();
  }assert(a.serialize()===original,'final project');assert(JSON.stringify(a.getQuality())===quality,'quality preserved');return {selection,measurements};};return window.__measureCadPipeline();
 `);
 const transport=await check('Repeated unchanged CAD display and transport preserve every triangle and native geometry',`
  const before=a.serialize(),revision=a.controller.revision();a.controller.measureTransport(true);let data;
  for(let i=0;i<3;i++){const result=await a.controller.display();const json=JSON.stringify(result.meshes);if(data)assert(json===data,'display changed');data=json;}
  const result=a.controller.transportState();a.controller.measureTransport(false);assert(a.serialize()===before&&a.controller.revision()===revision,'display mutated project');return result;
 `);
 await check('Set up twelve imported native STEP spheres at fine display quality',`
  await a.resetProject();a.workbenchUI.setMode('easy');a.workbenchUI.setDomain('cad');
  await a.importFile(new File([${JSON.stringify(require('./cad-mini-performance-fixture.cjs'))}],'analytic-sphere.step'));await a.settled();
  await a.mutate(p=>{const source=p.nodes[0];p.nodes=Array.from({length:12},(_,i)=>{const n=structuredClone(source);n.id=i?crypto.randomUUID():source.id;n.name='STEP sphere '+i;n.transform=[1,0,0,0,0,1,0,0,0,0,1,0,i%4*100,Math.floor(i/4)*100,40,1];return n;});},'STEP fixture copies');await a.settled();
  const quality=a.getQuality();quality.display={deflection:.004,angleDegrees:4};await a.setQuality(quality);await a.settled();a.select([{rootId:a.getModel().nodes[0].id,path:[]}]);assert(a.getModel().nodes.every(n=>n.source==='step'),'native STEP sources');
 `);
 await captureFixture('step-spheres');
 const imported=await check('Twelve imported native STEP spheres: precise display, arbitrary rotations and scale with exact Undo/Redo',`
  return window.__measureCadPipeline();
 `);
 await check('Set up the colored bored CAD group',`
  await a.resetProject();await a.execute({kind:'batch',commands:[{op:'create',type:'box',size:[60,40,6],pos:[0,0,3]},{op:'create',type:'cylinder',size:[20,20,20],pos:[20,0,10]},{op:'create',type:'cylinder',size:[5,5,30],pos:[0,0,5]}]});await a.settled();
  await a.mutate(p=>{p.nodes[0].color='#dd6633';p.nodes[1].color='#3377cc';p.nodes[2].solid=false;});a.select(a.getModel().nodes.map(n=>({rootId:n.id,path:[]})));await a.group();await a.settled();await a.mutate(p=>{p.nodes[0].multicolor=true;});await a.settled();a.select([{rootId:a.getModel().nodes[0].id,path:[]}]);a.view.fit();
 `);
 await captureFixture('colored-bored-group');
 const colored=await check('Colored bored CAD group: root movement rotation and scaling retain source history and material colors',`
  const before=JSON.stringify(a.getModel().nodes[0].children),colors=(await a.controller.display()).meshes.map(r=>r.color).sort();assert(colors.includes('#dd6633')&&colors.includes('#3377cc'),'material colors');const measurements=await window.__measureCadPipeline();assert(JSON.stringify(a.getModel().nodes[0].children)===before,'source history');assert(JSON.stringify((await a.controller.display()).meshes.map(r=>r.color).sort())===JSON.stringify(colors),'material colors preserved');return measurements;
 `);
 if(directory)fs.writeFileSync(path.join(directory,'cad-tinker-performance.png'),(await win.webContents.capturePage()).toPNG());
 const diagnostics=timing?{
  feedbackDefinition:'First draw of the new model or a changed status present across two animation frames. Browser-side proxy for visible feedback.',
  frameDefinition:'Animation-frame callback gaps and CPU time to submit actual WebGL draws. The GPU presentation time is separate.',
  processMemory:{before:initialMemory,after:memory()},
  storage:await check('Write confirmed workspace to isolated autosave storage',`
   const version=a.controller.readSnapshot().version,start=performance.now();
   const encoded=a.serializeWorkspace(),serialized=performance.now();
   const saved=await a.recovery.write(encoded,{version});
   assert(saved,'isolated autosave was not saved');
   return {serializationMs:serialized-start,saveMs:performance.now()-serialized,characters:encoded.length};
  `)
 }:undefined;
 if(timing)assert(
  [pipeline,imported,colored].some(suite=>suite.measurements.some(row=>row.timings.workerJobs.some(job=>job.workerTiming))),
  'No measured native worker request in benchmark'
 );
 return {ok:true,checks,metrics:{pipeline,transport,imported,colored,...(diagnostics?{diagnostics}:{})}};
};
