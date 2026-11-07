const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');

async function verifyRecoveryEncoding(win,{directory,fixtureDirectory,files,programData=path.join(directory,'portable-data'),packageData=path.join(directory,'Daten')}){
 const run=code=>win.webContents.executeJavaScript(`(async()=>{const a=window.__cadTest;${code}})()`);
 const fixture=path.join(fixtureDirectory,'cnc.ocad'),hash=()=>createHash('sha256').update(fs.readFileSync(fixture)).digest('hex');
 const original=hash(),checks=[],metrics={};
 files.save=fixture;
 await run("await a.openProject();await a.settled();a.workbenchUI.setMode('normal');a.view.setView('iso');a.view.fit();");
 for(const format of ['ocad','fnpack']){
  fs.writeFileSync(path.join(directory,'progress.json'),JSON.stringify({format,checks}));
  if(format==='fnpack'){
   files.save=path.join(directory,'CNC-fixture.fnpack');
   assert((await run("return a.save({format:'fnpack',saveAs:true});")).saved);
   await run("await a.openProject();await a.settled();");
  }
  const sample=await run(`
   const aBefore=a.recoveryEncodingStats(),revision=a.controller.revision();
   const first=performance.now();
   if(!await a.requestRecovery())throw Error('First checkpoint failed');
   const firstMs=performance.now()-first,prepared=a.recoveryEncodingStats();
   const samples=[];
   for(let i=0;i<3;i++){
    a.view.setView(i%2?'left':'right');
    await a.view.renderReady();
    const savedView=a.view.viewState();
    const target=i%2?'rotate':'translate';
    a.setMode(i%2?'translate':'rotate');
    const frames=[],start=performance.now();let frame,finished=false,framesDuringWrite=0;
    const sampleFrame=()=>{frames.push(performance.now()-start);if(!finished)framesDuringWrite++;frame=requestAnimationFrame(sampleFrame);};
    frame=requestAnimationFrame(sampleFrame);
    const pending=a.requestRecovery().then(saved=>{finished=true;return saved;});
    try{
     const input=await new Promise(resolve=>requestAnimationFrame(()=>{
      const at=performance.now()-start,pendingAtInput=!finished;
      document.body.dispatchEvent(new KeyboardEvent('keydown',{key:target==='rotate'?'r':'t',bubbles:true,cancelable:true}));
      a.view.setView('iso');
      requestAnimationFrame(()=>resolve({at,pendingAtInput,finishedAtFeedback:finished,feedbackMs:performance.now()-start,
       tool:a.view.getMode(),viewChanged:a.view.viewState().position.some((v,k)=>v!==savedView.position[k])}));
     }));
     if(!await pending)throw Error('Camera checkpoint failed');
     if(input.tool!==target||!input.viewChanged||!input.pendingAtInput)throw Error('Camera or keyboard input was unavailable while the write was pending');
     samples.push({savedView,input,framesDuringWrite,completedMs:performance.now()-start,
      maxFrameGapMs:Math.max(...frames.map((time,index)=>time-(frames[index-1]??0)))});
    }finally{cancelAnimationFrame(frame);}
   }
   const after=a.recoveryEncodingStats();
   if(revision!==a.controller.revision())throw Error('Camera input changed the confirmed model');
   return {aBefore,prepared,after,revision,firstMs,samples};
  `);
  assert.deepEqual(sample.after,sample.prepared,format+' camera changes encoded or transferred a new model');
  let file,model;
  if(format==='fnpack'){
   file=path.join(packageData,'Paket-Autosicherung.fnpack');
   const pack=await require('./fnpack.cjs').openFnpack(file);
   try{model=pack.index.project;}finally{await pack.close();}
  }else{
   file=path.join(programData,'autosicherung-gemeinsam-v8.json');
   model=JSON.parse(fs.readFileSync(file,'utf8'));
  }
  assert.deepEqual(model.workspace.view,sample.samples.at(-1).savedView);
  metrics[format]={...sample,fileBytes:fs.statSync(file).size,roots:model.nodes.length};
  checks.push(format+' holds the confirmed model cache, writes the captured camera and accepts input during saving');
 }
 assert.equal(hash(),original);
 return {ok:true,checks,metrics,fixtureSha256:original};
}
module.exports={verifyRecoveryEncoding};
