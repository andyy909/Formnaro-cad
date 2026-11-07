const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),asar=path.resolve(process.argv[2]),out=path.join(root,'work/hidden-lab-acceptance-'+Date.now());
fs.mkdirSync(out,{recursive:true});process.env.FORMNARO_DIAGNOSTIC_HOME=path.join(out,'app');process.argv.push('--formnaro-diagnostics');app.setPath('appData',path.join(out,'profile'));app.setPath('userData',path.join(out,'profile/offlinecad'));app.setAppPath(asar);
const pause=ms=>new Promise(r=>setTimeout(r,ms));let focusEvents=0;
app.on('browser-window-created',(_event,w)=>{w.setFocusable(false);w.on('show',()=>w.hide());w.on('focus',()=>{focusEvents++;});w.webContents.setBackgroundThrottling(false);w.hide();});
app.whenReady().then(async()=>{let win;try{
 for(let i=0;i<180;i++){win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed());if(win&&await win.webContents.executeJavaScript('!!window.__cadReady').catch(()=>false))break;await pause(500);}
 assert.ok(win&&await win.webContents.executeJavaScript('!!window.__cadReady'));
 const A='https://api.deepseek.com',B='https://api.openai.com',C='chatgpt',revision='0123456789abcdef',profiles={
  [A]:{key:'fixture-modeler',config:{baseUrl:A,model:'deepseek-flash',protocol:'responses'}},
  [B]:{key:'fixture-api',config:{baseUrl:B+'/v1',model:'gpt-6-luna',protocol:'responses'}},
  [C]:{key:'',config:{baseUrl:B+'/v1',authMode:'chatgpt',model:'gpt-6.1-sol',protocol:'responses'}}
 },calls=[],directory=path.join(out,'results');fs.mkdirSync(directory);
 let benchmarkMode=false;
 const choices=c=>c.baseUrl.includes('deepseek')?['deepseek-flash','deepseek-v4-pro']:['gpt-6-luna','gpt-6.1-sol'];
 const runner=require(asar+'/backend/ai-diagnostics.cjs').createDiagnostics({app,directory,credentials:()=>profiles[A],connections:{connection:id=>profiles[id],providers:()=>Object.entries(profiles).map(([id,p])=>({id,label:id===C?'ChatGPT-Konto':new URL(p.config.baseUrl).host,model:p.config.model,authMode:p.config.authMode??'api-key',hasKey:true,configured:true})),credential:async(c,key)=>c.authMode==='chatgpt'?'fixture-account':key,catalog:async({config})=>({hasKey:true,availableModelIds:choices(config),models:choices(config).map(id=>({id,name:id,vision:true,reasoningEfforts:config.baseUrl.includes('deepseek')?['low','high','max']:['low','medium','high','max']}))})},onEvent:e=>{if(!win.isDestroyed())win.webContents.send('cad-ai:diagnostic-event',e);},provider:{testConnection:async()=>({models:['deepseek-flash']}),completeModel:async(c,key,e)=>{
  const role=e.system.includes('third Formnaro lab agent')?'reviewer':e.system.includes('independent Formnaro experiment supervisor')?'supervisor':'modeler';calls.push({role,model:c.model,authMode:c.authMode,effort:e.effort,key});e.onDiagnostic?.({type:'request',body:{model:c.model}});
  const result=role==='modeler'&&benchmarkMode?{message:'Lokale Transportkontrolle ohne CAD-Ergebnis'}:role==='modeler'?{tool:'offlinecad_preview',arguments:{revision,commands:[{op:'create',type:'box',size:[1,2,3]}]}}:role==='supervisor'?{verdict:'continue',reasonCode:'none',confidence:.8,explanation:'Vorschlag formal gültig.',evidence:'Lokales Schema'}:{summary:'Drei getrennte Rollen erfolgreich geprüft.',findings:[],nextChecks:['Echten Modellvergleich gesondert ausführen.']};
  return {text:JSON.stringify(result),data:{model:c.model,usage:{input_tokens:100,output_tokens:10,input_tokens_details:{cached_tokens:0}}}};
 }},openChild:()=>({call:async(method)=>{if(method==='setup')return {scene:{revision,objects:[],selectionTargets:[]},context:{},validationContext:(await import('../src/cad-ai-context.js')).cadAIContext(),project:{nodes:[]}};if(method==='capture')return 'data:image/png;base64,AQID';return {};},cancel(){},close:async()=>({code:0,signal:null})})});
 ipcMain.removeHandler('cad-ai:diagnostics');ipcMain.handle('cad-ai:diagnostics',async(_event,args)=>{
  const methods={labBenchmarkPreview:()=>runner.labBenchmarkPreview(args),labBenchmarkStart:()=>runner.labBenchmarkStart(args),labBenchmarkReport:()=>runner.labBenchmarkReport(args),labBenchmarkExport:()=>runner.labBenchmarkExport(args),state:()=>runner.state(),read:()=>runner.read(args.id),labPreview:()=>runner.labPreview(args.plan),labRoleCatalog:()=>runner.labRoleCatalog(args),labRoleSave:()=>runner.labRoleSave(args),labReview:()=>runner.labReview(args),labReviewerSettings:()=>runner.labReviewerSettings(args.enabled),start:()=>runner.start(args)};
  if(!methods[args.action])throw Error('Unexpected action '+args.action);try{return {ok:true,value:await methods[args.action]()};}catch(e){return {ok:false,error:e.message};}
 });
 const js=s=>win.webContents.executeJavaScript(s),until=async(fn,label)=>{for(let i=0;i<1200;i++){if(await fn())return;await pause(100);}throw Error('Timeout: '+label);};
 await js("document.querySelector('#ai-diagnostic-open').click()");await until(()=>js("document.querySelectorAll('[data-lab-role] select').length===9&&!document.querySelector('[data-run]').disabled"),'role controls ready');
 const choose=async(role,field,value)=>{await js(`(()=>{const e=document.querySelector('[data-lab-role=${role}] [data-role-field=${field}]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await until(()=>js(`!document.querySelector('[data-lab-role=${role}] [data-role-field=model]').disabled`),role+' ready');await pause(200);};
 await choose('modeler','provider',B);await choose('modeler','model','gpt-6.1-sol');await choose('modeler','effort','medium');
 await choose('supervisor','provider',C);await choose('supervisor','effort','low');
 await choose('reviewer','provider',A);await choose('reviewer','model','deepseek-v4-pro');await choose('reviewer','effort','high');
 const selections=runner.state().lab.roles.selections;assert.equal(selections.modeler.model,'gpt-6.1-sol');assert.equal(selections.modeler.effort,'medium');assert.equal(selections.supervisor.providerId,C);assert.equal(selections.reviewer.model,'deepseek-v4-pro');assert.equal(profiles[A].config.model,'deepseek-flash');assert.equal(calls.length,0);
 const p=require(asar+'/backend/ai-test-lab-plan.cjs').preset();Object.assign(p,{caseIds:['drill'],variants:['A'],roles:selections});
 await js(`document.querySelector('[data-plan-json]').value=${JSON.stringify(JSON.stringify(p))};document.querySelector('[data-import-plan]').click()`);await until(()=>js("!document.querySelector('[data-run]').disabled"),'plan ready');
 await js("document.querySelector('[data-run]').click()");await until(()=>runner.state().lab.reviewer.reviews.some(r=>r.status==='completed'),'review complete');await pause(500);
 assert.deepEqual(calls.map(c=>[c.role,c.model,c.key]),[['modeler','gpt-6.1-sol','fixture-api'],['supervisor','gpt-6.1-sol','fixture-account'],['reviewer','deepseek-v4-pro','fixture-modeler']]);
 assert.equal(runner.state().records.length,1);assert.equal(runner.state().records[0].spec.effort,'medium');
 await js("document.querySelector('[data-follow]').checked=false;document.querySelector('[data-tab=plan]').click()");await pause(400);
 await js("document.querySelector('[data-lab-role=modeler]').scrollIntoView({block:'center'})");await pause(250);await js("document.querySelector('[data-lab-role=reviewer]').scrollIntoView({block:'center'})");await pause(250);
 const geometry=await js("(()=>{const r=document.querySelector('#ai-diagnostics');return {overflow:r.scrollWidth>r.clientWidth,roles:[...r.querySelectorAll('[data-lab-role]')].map(e=>({role:e.dataset.labRole,selects:e.querySelectorAll('select').length}))};})()");assert.equal(geometry.overflow,false);assert.equal(geometry.roles.length,3);
 await js("document.querySelector('#ai-diagnostics [data-close]').click();document.querySelector('#ai-diagnostic-open').click()");await pause(400);assert.equal(await js("document.querySelector('[data-lab-role=modeler] [data-role-field=model]').value"),'gpt-6.1-sol');

 // Opening the new tab performs no model calls; the complete lifecycle uses only the local provider fixture.
 await js("document.querySelector('[data-tab=benchmark]').click()");await pause(250);assert.equal(calls.length,3);assert.equal(await js("document.querySelector('[data-benchmark-start]').disabled"),false);
 
 benchmarkMode=true;await js("document.querySelector('[data-benchmark-effort]').value='medium';document.querySelector('[data-benchmark-start]').click()");
 await until(()=>runner.state().lab.benchmarks.runs.some(r=>r.finished===16&&r.reviewStatus==='completed'),'benchmark finished');await pause(500);
 assert.equal(runner.state().records.length,17);assert.equal(calls.length,20);assert.equal(calls.slice(3).filter(c=>c.role==='modeler').length,16);assert.equal(calls.slice(3).filter(c=>c.role==='supervisor').length,0);assert.equal(calls.at(-1).role,'reviewer');
 assert.ok(calls.slice(3,-1).every(c=>c.model==='gpt-6.1-sol'&&c.key==='fixture-api'&&c.effort==='medium'));
 await js("document.querySelector('[data-tab=benchmark]').click()");const benchmarkSummary=await js("document.querySelector('[data-benchmark-score]').textContent");assert.match(benchmarkSummary,/0 \/ 16 vollständig bestätigt/);assert.match(benchmarkSummary,/16 \/ 16 beendet/);assert.equal(await js("document.querySelector('[data-benchmark-resume]').disabled"),true);
 await js("document.querySelector('[data-benchmark-json]').click()");await until(()=>fs.readdirSync(directory).some(n=>n.startsWith('Benchmarkbericht-')),'benchmark report');
 await js("document.querySelector('[data-benchmark-export]').click()");await until(()=>fs.readdirSync(directory).some(n=>n.endsWith('.zip')),'benchmark export');
 
 const benchmarkGeometry=await js("(()=>{const p=document.querySelector('[data-pane=benchmark]');return {overflow:p.scrollWidth>p.clientWidth,rows:p.querySelectorAll('tbody tr').length};})()");assert.equal(benchmarkGeometry.rows,8);assert.equal(benchmarkGeometry.overflow,false);

 // Hidden native drawing UI, without OS input, focus or a provider request.
 await win.loadFile(path.join(asar,'dist/index.html'),{query:{test:'1'}});await until(()=>js('!!window.__cadTest'),'native test interface');
 const task=require(asar+'/backend/ai-test-lab-cases.cjs').taskInstance('practice-21');
 const before=await js(`(async()=>{const t=window.__cadTest,a=t.access;await t.resetProject();const p=await a.preview({revision:a.scene().revision,commands:${JSON.stringify(task.fixture)}});await a.apply({previewId:p.previewId,revision:p.revision});await t.settled();const scene=await a.dispatch('scene',{});t.select(scene.objects.filter(o=>!o.target.path.length&&o.name==='Aufgabenteil').map(o=>o.target));await t.settled();return {scene:await a.dispatch('scene',{}),project:a.project()};})()`);
 await js(`(()=>{const t=window.__cadTest;t.drawingUI.open();const paper=document.getElementById('drawing-paper-size');paper.value='A4';paper.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('drawing-title-block').click();const title=document.getElementById('drawing-title');title.value='Übungsteil';title.dispatchEvent(new Event('input',{bubbles:true}));title.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('drawing-update').click();})()`);
 await until(()=>js("!window.__cadTest.drawingUI.state()?.running"),'native projections');
 const drawingState=await js('window.__cadTest.drawingUI.state()');assert.equal(drawingState.problems.length,0);
 await js('window.__cadTest.drawingUI.apply()');await js('window.__cadTest.settled()');const after=await js("(async()=>{const a=window.__cadTest.access;return {scene:await a.dispatch('scene',{}),project:a.project()};})()");
 const drawing=await require(asar+'/backend/ai-diagnostic-evaluate.cjs').evaluate('drawing',before,after,(method,args)=>js(`window.__cadTest.access.dispatch(${JSON.stringify(method)},${JSON.stringify(args)})`),task.geometry);assert.equal(drawing.passed,true,JSON.stringify(drawing));
 assert.equal(focusEvents,0,'No window may gain focus during paused live tests');assert.equal(win.isVisible(),false);fs.writeFileSync(path.join(out,'Zeichnungsmodell.ocad'),JSON.stringify(after.project));await js('window.__cadTest.resetProject()');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,cloudRequests:0,calls:calls.map(({key,...c})=>c),capturePolicy:'DOM and native assertions only; no display surface requested while the user paused live windows',focusEvents,drawing,geometry,benchmarkGeometry,benchmarkSummary,selections,checks:['nine role selectors','three independent providers','supported model efforts','no chat-profile switch','fixed effort creates one condition','actual modeler/monitor/reviewer lifecycle','separate keys kept private','selection retained on reopen','benchmark opens without execution','exactly16 fixed benchmark conditions','no supervisor in standard benchmark','review only after16','unverified results never become successes','benchmark report and ZIP','eight task rows','hidden native A4/title/three-projection drawing','no focus takeover','no real provider requests']},null,2));
 const closed=new Promise(r=>win.once('closed',r));win.close();await Promise.race([closed,pause(10000).then(()=>{throw Error('Window close timeout');})]);console.log(JSON.stringify({passed:true,out}));app.quit();
 }catch(error){fs.writeFileSync(path.join(out,'error.json'),JSON.stringify({message:error.message,stack:error.stack},null,2));console.error(error.message);app.exit(1);}});
require(asar+'/electron.cjs');
