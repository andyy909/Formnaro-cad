// Run the installed main entrypoint and its real BrowserWindow, without verify
// mode. The debugger redirects only appData/exe-derived DATA paths before boot;
// no existing user profile, provider configuration or model is loaded.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const output=path.resolve(process.env.FORMNARO_PACKAGED_PROOF),exe=path.resolve(process.env.FORMNARO_PACKAGED_EXE),inputPath=path.resolve(process.env.FORMNARO_PACKAGED_REQUEST);
fs.mkdirSync(output,{recursive:true});const isolated=fs.mkdtempSync(path.join(output,'isolated-'));fs.mkdirSync(path.join(isolated,'appData'),{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),identity={exeSha256:hash(exe),asarSha256:hash(path.join(path.dirname(exe),'resources/app.asar'))};
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const extraSwitch=process.env.FORMNARO_PROBE_SWITCH;if(extraSwitch)assert(['disable-renderer-backgrounding','disable-background-timer-throttling','disable-backgrounding-occluded-windows'].includes(extraSwitch));
const child=spawn(exe,['--inspect-brk=127.0.0.1:0',...(extraSwitch?['--'+extraSwitch]:[])],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stderr='',socket,sequence=0,closed=false;const pending=new Map(),events=new Map();
const exited=new Promise(resolve=>child.once('close',code=>{closed=true;resolve(code);}));
child.stderr.on('data',b=>{stderr+=b.toString();});child.stdout.on('data',()=>{});
const expressionCode=fn=>'('+fn.toString()+')()';
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Inspector timeout: '+method));},30000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
const windowExpression="process.mainModule.require('electron').BrowserWindow.getAllWindows()[0]";
const renderer=expression=>evaluate(windowExpression+'.webContents.executeJavaScript('+JSON.stringify(expression)+')');
async function waitFor(fn,budget=40000){const begin=Date.now();while(Date.now()-begin<budget){try{if(await fn())return;}catch{}if(closed)throw Error('Packaged app exited before readiness');await delay(80);}throw Error('Packaged app readiness timeout');}
(async()=>{
 let result;
 try{
  await waitFor(()=>Promise.resolve(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/.test(stderr)),15000);const address=stderr.match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/)[1];socket=new WebSocket(address);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const m=JSON.parse(String(event.data));if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else{events.get(m.method)?.(m.params);}});
  const paused=new Promise(resolve=>events.set('Debugger.paused',resolve));await call('Debugger.enable');await call('Runtime.runIfWaitingForDebugger');const pause=await paused;
  const setup=`(()=>{const app=require('electron').app,get=app.getPath.bind(app);process.setUncaughtExceptionCaptureCallback(error=>{require('node:fs').writeFileSync(${JSON.stringify(path.join(output,'uncaught-main.json'))},JSON.stringify({error:error.stack}));app.exit(71);});app.getPath=name=>name==='appData'?${JSON.stringify(path.join(isolated,'appData'))}:name==='exe'?${JSON.stringify(path.join(isolated,'Formnaro.exe'))}:get(name);return true;})()`;
  const injected=await call('Debugger.evaluateOnCallFrame',{callFrameId:pause.callFrames[0].callFrameId,expression:setup,returnByValue:true});if(injected.exceptionDetails)throw Error(injected.exceptionDetails.text);assert.equal(injected.result.value,true);
  await call('Debugger.resume');await call('Debugger.disable');
  await waitFor(()=>evaluate("(()=>{const e=process.mainModule.require('electron'),w=e.BrowserWindow.getAllWindows()[0];return e.app.isReady()&&w&&!w.webContents.isLoadingMainFrame();})()"));
  const profile=await evaluate("process.mainModule.require('electron').app.getPath('userData')");assert(path.resolve(profile).startsWith(path.resolve(isolated)+path.sep));
  await waitFor(()=>renderer("!!window.offlinecadDesktop&&!!document.querySelector('#viewport canvas')&&document.body.dataset.cadBusy!=='true'"));
  const throttled=await evaluate(windowExpression+'.webContents.getBackgroundThrottling()');
  const rendererBackgroundingDisabled=await evaluate("process.mainModule.require('electron').app.commandLine.hasSwitch('disable-renderer-backgrounding')");
  if(process.env.FORMNARO_EXPECT_RENDERER_ACTIVE)assert.equal(rendererBackgroundingDisabled,process.env.FORMNARO_EXPECT_RENDERER_ACTIVE==='true');
  if(process.env.FORMNARO_EXPECT_BACKGROUND)assert.equal(throttled,process.env.FORMNARO_EXPECT_BACKGROUND==='true');
  await renderer("(async()=>{const s=await window.offlinecadDesktop.getAISettings();await window.offlinecadDesktop.saveAISettings({config:{...s,bridgeEnabled:true}});return true;})()");
  await evaluate("global.__previewIncidents=[];"+windowExpression+".webContents.on('render-process-gone',(_e,d)=>global.__previewIncidents.push(d));true");
  const descriptor=JSON.parse(fs.readFileSync(path.join(profile,'ai-bridge.json'),'utf8')),headers={Authorization:'Bearer '+descriptor.token,'Content-Type':'application/json'};
  // Node's fetch has a separate 300-second header deadline. Use the local HTTP
  // protocol directly so this proof shares the Python client's explicit budget.
  const request=(method,body,signal)=>new Promise((resolve,reject)=>{const req=http.request(descriptor.url+'/v1/'+method,{headers,method:body?'POST':'GET',signal},res=>{const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>32*1024*1024){req.destroy(Error('CAD response too large'));return;}chunks.push(b);});res.on('error',reject);res.on('end',()=>{try{const v=JSON.parse(Buffer.concat(chunks));if(res.statusCode<200||res.statusCode>=300)reject(Object.assign(Error(v.error),{code:v.code,feedback:v.feedback}));else resolve(v);}catch(e){reject(e);}});});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
  // Read the contract before scene/preview, matching a real local CAD client.
  let contract;await waitFor(async()=>{contract=await request('context');return !!contract;},120000);const scene=await request('scene'),original=await request('project');const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));input.revision=scene.revision;
  await evaluate(windowExpression+'.hide();true');assert.equal(await renderer('document.hidden'),throttled);
  await evaluate("global.__previewProgress=[];global.__previewSampling=false;global.__previewSampler=setInterval(async()=>{if(global.__previewSampling)return;global.__previewSampling=true;try{const w="+windowExpression+";if(w&&!w.isDestroyed()){const s=await w.webContents.executeJavaScript('({busy:document.body.dataset.cadBusy,banner:document.getElementById(\"cad-ai-preview-banner\")?.innerText})');if(s.banner!==global.__previewProgress.at(-1)?.banner)global.__previewProgress.push({time:Date.now(),...s});}}catch{}finally{global.__previewSampling=false;}},1000);true");
  const began=Date.now();let outcome;try{const p=await request('preview',input,AbortSignal.timeout(Number(process.env.FORMNARO_PREVIEW_BUDGET_MS||650000)));outcome={ok:true,previewId:p.previewId,changes:p.changes?.length};assert(p.previewId);}catch(error){outcome={ok:false,error:error.message,code:error.code,name:error.name,feedback:error.feedback};}
  const progress=await evaluate('clearInterval(global.__previewSampler);global.__previewProgress');fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify(progress,null,2));
  let expectedFailureRecovered=false;
  if(process.env.FORMNARO_EXPECT_PREVIEW_FAILURE){assert.equal(outcome.ok,false);assert.equal(outcome.code,process.env.FORMNARO_EXPECT_PREVIEW_FAILURE);const firstFailure=outcome;const retry=await request('preview',{revision:(await request('scene')).revision,commands:[{op:'create',type:'box',size:[3,4,5],as:'retry_after_failure'}]},AbortSignal.timeout(30000));assert(retry.previewId);outcome={ok:true,previewId:retry.previewId,changes:retry.changes?.length,firstFailureCode:firstFailure.code};expectedFailureRecovered=true;}
  const elapsedMs=Date.now()-began;await request('scene',undefined,AbortSignal.timeout(10000));assert.deepEqual(await request('project'),original);assert.deepEqual(await evaluate('global.__previewIncidents'),[]);
  if(outcome.ok){const png=await evaluate(windowExpression+".webContents.capturePage().then(image=>image.toPNG().toString('base64'))");fs.writeFileSync(path.join(output,'preview.png'),Buffer.from(png,'base64'));await request('ui',{action:'cancel'});assert.deepEqual(await request('project'),original);}
  result={ok:outcome.ok,...identity,exe,isolatedProfile:true,normalMainEntrypoint:true,verificationFlag:false,backgroundThrottling:throttled,rendererBackgroundingDisabled,probeSwitch:extraSwitch??null,windowHidden:true,commands:input.commands.length,elapsedMs,outcome,expectedFailureRecovered,confirmedProjectUnchanged:true,rendererIncidents:[],applied:false,realCloudInferenceRequests:0};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));assert(outcome.ok,JSON.stringify(outcome));console.log(JSON.stringify({ok:true,commands:input.commands.length,elapsedMs,backgroundThrottling:throttled}));
 }catch(error){fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({ok:false,error:error.stack,...identity,result},null,2));console.error(error.stack);process.exitCode=1;}
 finally{if(socket?.readyState===1){try{await evaluate("(()=>{const e=process.mainModule.require('electron');setTimeout(()=>e.app.quit(),50);return true;})()");}catch{}socket.close();}await Promise.race([exited,delay(5000)]);if(!closed){child.kill();await exited;}assert.equal(hash(exe),identity.exeSha256);assert.equal(hash(path.join(path.dirname(exe),'resources/app.asar')),identity.asarSha256);assert(!fs.existsSync(path.join(output,'uncaught-main.json')),'Uncaught main error during app shutdown');assert.equal(await exited,0,'Normal app.quit must finish cleanly');if(result?.ok){result.teardownVerified=true;fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));}}
})();
