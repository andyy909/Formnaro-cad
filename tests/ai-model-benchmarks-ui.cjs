// Actual packaged renderer/preload/backend, hidden offscreen. No provider calls.
const {app,BrowserWindow,ipcMain,session}=require('electron'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const asar=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),profile=path.join(out,'profile'),data=path.join(out,'data'),directory=path.join(data,'KI-Diagnose');
fs.mkdirSync(profile,{recursive:true});fs.mkdirSync(directory,{recursive:true});app.setPath('userData',profile);app.setPath('sessionData',profile);app.setAppPath(asar);
const pause=ms=>new Promise(r=>setTimeout(r,ms)),hash=b=>crypto.createHash('sha256').update(b).digest('hex'),networkRequests=[];let focusEvents=0,selections=0;
global.fetch=async url=>{networkRequests.push(String(url));throw Error('Network forbidden in this local UI verification');};
app.whenReady().then(async()=>{
 let win;try{
  const benchmark=require(asar+'/backend/ai-lab-benchmark.cjs'),plan=benchmark.benchmarkPlan({effort:'high',roles:{modeler:{providerId:'https://api.deepseek.com',model:'deepseek-flash',effort:'series'}}}),suite=benchmark.verifySuite(),id=crypto.randomUUID();
  function fixture(id,createdAt,finished,passed,build){
   const rows=require(asar+'/backend/ai-test-lab-plan.cjs').expandPlan(plan).rows.map(s=>({...s,seriesId:id,benchmark:{suiteHash:suite.suiteHash,conditionId:benchmark.condition(s.caseId,s.repeat)}}));
   fs.writeFileSync(path.join(directory,'Benchmark-'+id+'.json'),JSON.stringify({id,plan,suite,rows,source:{programVersion:'0.137.0',asarSHA256:build},createdAt}));
   for(let i=0;i<finished;i++){const r={id:crypto.randomUUID(),spec:rows[i],requestedModel:'deepseek-flash',status:'completed',startedAt:createdAt,elapsedMs:1200,verification:{passed:i<passed},cleanExit:true,modelIdentity:{exactMatch:true},events:[{type:'request'},{type:'usage',returnedModel:'deepseek-flash',usage:{input_tokens:1,output_tokens:1},ms:1},{type:'finished'}]};fs.writeFileSync(path.join(directory,'run-'+r.id+'.json'),JSON.stringify(r));}
  }
  fixture(id,'2026-11-08T12:00:00Z',3,1,'current-build');
  const completeId=crypto.randomUUID();fixture(completeId,'2026-11-08T10:00:00Z',16,14,'current-build');
  const otherId=crypto.randomUUID();fixture(otherId,'2026-11-07T10:00:00Z',16,8,'other-build');
  const snapshot=()=>Object.fromEntries(fs.readdirSync(directory).filter(n=>/^(run-|Benchmark-)/.test(n)).map(n=>[n,hash(fs.readFileSync(path.join(directory,n)))])),before=snapshot();
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{if(/^https?:/i.test(details.url))networkRequests.push(details.url);callback({cancel:/^https?:/i.test(details.url)});});
  win=new BrowserWindow({show:false,focusable:false,width:1250,height:900,webPreferences:{offscreen:true,contextIsolation:true,sandbox:true,backgroundThrottling:false,preload:path.join(asar,'preload.cjs'),additionalArguments:['--formnaro-portable-data']}});win.on('focus',()=>focusEvents++);
  require(asar+'/backend/program-storage.cjs').installProgramStorage(win,{directory:data,cadOnly:true});require(asar+'/backend/layouts.cjs').installLayouts(win,{directory:path.join(out,'Layouts')});
  require(asar+'/backend/desktop-ai.cjs').installDesktopAI(win,{settingsFile:path.join(data,'ai-settings.json')});
  ipcMain.handle('cad-speech:online-status',()=>({ok:true,value:{hasKey:false}}));ipcMain.handle('cad-speech:status',()=>({ok:true,value:{available:false}}));
  const providerId='https://api.deepseek.com',settings={providerId,baseUrl:providerId,model:'deepseek-flash',reasoningEffort:'high',authMode:'api-key',hasKey:true,providers:[{id:providerId,label:'DeepSeek',hasKey:true}]},models=[{id:'deepseek-flash',name:'DeepSeek V4.1 Flash',vision:true},{id:'untested-model',name:'Untested model',vision:false}];
  const handle=(name,fn)=>{ipcMain.removeHandler(name);ipcMain.handle(name,async(_event,args)=>({ok:true,value:await fn(args)}));};
  handle('cad-ai:get',()=>settings);handle('cad-ai:models',args=>args?.all?{catalogs:[{providerId,hasKey:true,provider:settings.providers[0],models}]}:{providerId,hasKey:true,models});
  handle('cad-ai:model',args=>{settings.model=args.model;selections++;return settings;});handle('cad-ai:effort',args=>{settings.reasoningEffort=args.reasoningEffort;return settings;});
  const js=s=>win.webContents.executeJavaScript(s),until=async(code,label=code)=>{for(let i=0;i<500;i++){if(await js(code))return;await pause(50);}throw Error('Timeout: '+label);};
  await win.loadFile(path.join(asar,'dist/index.html'),{query:{test:'1'}});await until('!!window.__cadTest','renderer ready');await until("!document.querySelector('#ai-chat-model-picker').disabled",'model picker ready');
  const api=await js("window.offlinecadDesktop.diagnostics({action:'modelBenchmarks'})");const local=api.entries.find(r=>r.id==='local:'+id);assert.equal(local.passed,1);assert.equal(local.total,16);assert.equal(local.byOutcome.pending,13);assert.doesNotMatch(JSON.stringify(api),/fixture-api|privatePath/);
  await js("document.querySelector('#ai-chat-model-picker').click()");await until("document.querySelectorAll('#ai-model-dialog .ai-benchmark-column').length===1",'one complete comparable run');
  assert.equal(await js("document.querySelectorAll('[data-model-list] .ai-model-card').length"),2);
  assert.equal(await js("document.querySelector('[data-chart] .ai-benchmark-column').dataset.benchmarkId"),'local:'+completeId);
  assert.match(await js("document.querySelector('[data-chart]').textContent"),/14 \/ 16/);assert.doesNotMatch(await js("document.querySelector('[data-chart]').textContent"),/57 \/ 72|1 \/ 16|Teilstand/);
  assert.equal(await js("document.querySelector('[data-comparison]').options.length"),2);
  await js("document.querySelector('[data-comparison]').selectedIndex=1;document.querySelector('[data-comparison]').dispatchEvent(new Event('change'))");assert.match(await js("document.querySelector('[data-chart]').textContent"),/8 \/ 16/);
  await js("document.querySelector('[data-comparison]').selectedIndex=0;document.querySelector('[data-comparison]').dispatchEvent(new Event('change'))");
  assert.equal(selections,0);assert.ok(networkRequests.every(url=>new URL(url).hostname==='www.ecb.europa.eu'),JSON.stringify(networkRequests));
  await pause(300);fs.writeFileSync(path.join(out,'model-benchmarks-wide.png'),(await win.webContents.capturePage()).toPNG());
  await js("document.querySelector('.ai-model-card .ai-model-benchmark-results').open=true");assert.equal(await js("document.querySelector('.ai-model-benchmark-results').querySelectorAll('.ai-benchmark-detail').length"),7);
  await js("document.querySelector('[data-search]').value='mistral';document.querySelector('[data-search]').dispatchEvent(new Event('input'))");assert.equal(await js("document.querySelectorAll('#ai-model-dialog .ai-benchmark-column').length"),0);assert.equal(await js("document.querySelectorAll('.ai-model-card').length"),0);
  await js("document.querySelector('[data-search]').value='';document.querySelector('[data-search]').dispatchEvent(new Event('input'));document.querySelector('[data-scope=photo]').click()");assert.equal(await js("document.querySelectorAll('#ai-model-dialog .ai-benchmark-column').length"),1);
  await js("document.querySelector('[data-scope=all]').click();document.querySelector('[data-select-model=untested-model]').click()");await until("document.querySelector('[data-select-model=untested-model]').textContent==='Ausgewählt'",'model saved');assert.equal(selections,1);
  await js("document.querySelector('[data-refresh]').click()");await until("!document.querySelector('[data-refresh]').disabled",'refresh complete');assert.equal(await js("document.querySelectorAll('#ai-model-dialog .ai-benchmark-column').length"),1);
  await js("document.querySelector('#ai-model-dialog [data-close]').click();document.querySelector('#ai-chat-model-picker').click()");await until("document.querySelectorAll('#ai-model-dialog .ai-benchmark-column').length===1",'reopened');
  win.setSize(540,800);await pause(300);await js("document.documentElement.dataset.theme='dark'");await pause(200);
  const geometry=await js("(()=>{const d=document.querySelector('#ai-model-dialog');return {dialogWidth:d.clientWidth,dialogScroll:d.scrollWidth};})()");assert.ok(geometry.dialogScroll<=geometry.dialogWidth+1);
  fs.writeFileSync(path.join(out,'model-benchmarks-narrow-dark.png'),(await win.webContents.capturePage()).toPNG());
  await js("document.querySelector('#ai-model-dialog [data-close]').click();document.querySelector('#ai-diagnostic-open').click();document.querySelector('#ai-diagnostics [data-tab=benchmark]').click()");
  await until("document.querySelectorAll('[data-benchmark-chart] .ai-benchmark-column').length===8",'eight tasks of one benchmark');
  assert.equal(await js("document.querySelector('[data-benchmark-series]').value"),id);
  assert.match(await js("document.querySelector('[data-benchmark-score]').textContent"),/1 \/ 16/);
  await js("document.querySelector('[data-benchmark-series]').value="+JSON.stringify(completeId)+";document.querySelector('[data-benchmark-series]').dispatchEvent(new Event('change'))");
  assert.match(await js("document.querySelector('[data-benchmark-score]').textContent"),/14 \/ 16/);
  assert.ok((await js("[...document.querySelectorAll('[data-benchmark-chart] .ai-benchmark-column')].map(e=>e.dataset.benchmarkId)")).every(v=>v.startsWith(completeId+':')));
  assert.equal(await js("document.querySelector('#ai-diagnostics [data-campaign]').hidden"),true);assert.equal(await js("document.querySelector('#ai-diagnostics [data-run]').hidden"),true);
  fs.writeFileSync(path.join(out,'benchmark-single-run.png'),(await win.webContents.capturePage()).toPNG());
  assert.deepEqual(snapshot(),before);assert.equal(focusEvents,0);assert.ok(networkRequests.every(url=>new URL(url).hostname==='www.ecb.europa.eu'),JSON.stringify(networkRequests));assert.equal(win.isVisible(),false);
  const closed=new Promise(resolve=>win.once('closed',resolve));win.close();await Promise.race([closed,pause(10000).then(()=>{throw Error('Regular close timed out');})]);
  const result={passed:true,cloudRequests:0,blockedBackgroundRequests:networkRequests,focusEvents,regularWindowClose:true,rawProtocolsUnchanged:true,syntheticCoreBenchmark:{passed:local.passed,planned:local.total,finished:local.finished},geometry,checks:['actual packaged renderer, preload and readonly IPC','only complete16-trial runs in comparison','different source builds separate','historical/partial results retained outside comparison','single selected run with eight task columns','no campaign button in benchmark panel','model selection, search, refresh and reopen','narrow layout and dark theme','regular hidden window close']};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.quit();
 }catch(error){fs.writeFileSync(path.join(out,'error.json'),JSON.stringify({error:error.message,stack:error.stack},null,2));console.error(error.stack);if(win&&!win.isDestroyed())win.destroy();app.exit(1);}
});
