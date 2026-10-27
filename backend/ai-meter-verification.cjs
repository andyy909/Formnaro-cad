const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
exports.verifyAIMeter=async(win,{directory})=>{
 const run=s=>win.webContents.executeJavaScript(s),checks=[],check=(value,label)=>{assert(value,label);checks.push(label);},original=global.fetch,usage={input_tokens:10000,output_tokens:1000,input_tokens_details:{cached_tokens:8000},output_tokens_details:{reasoning_tokens:900}};
 let calls=0,badHelp=false;
 const until=async expr=>{const start=Date.now();while(Date.now()-start<60000){if(await run(expr))return;await new Promise(r=>setTimeout(r,30));}throw Error('AI meter timeout: '+expr);};
 async function capture(name){
  await run('window.__cadTest.view.renderReady()');
  await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  for(let attempt=0;attempt<3;attempt++){
   try{fs.writeFileSync(path.join(directory,name+'.png'),(await win.webContents.capturePage()).toPNG());return;}
   catch(error){if(!String(error.message).includes('UnknownVizError')||attempt===2)throw error;await new Promise(r=>setTimeout(r,250));}
  }
 }
 const ledgerFile=path.join(directory,'portable-data','KI-Verbrauch.json'),config={baseUrl:'https://api.openai.com/v1',model:'gpt-6.1-sol',authMode:'chatgpt'};
 require('./ai-usage-ledger.cjs').createAIUsageLedger({file:ledgerFile}).record({config,provider:'chatgpt',taskId:'isolated-subscription-fixture',args:{prompt:'Wo finde ich das Menü?'},usage:require('./ai-usage.cjs').aiUsage({usage},config,1)});
 global.fetch=async(url,options)=>{
  if(!String(url).startsWith('https://api.deepseek.com/'))return original(url,options);
  if(String(url).endsWith('/models'))return new Response(JSON.stringify({data:[{id:'deepseek-flash',input_modalities:['text']}]}));
  calls++;const body=JSON.parse(options.body),raw=JSON.stringify(body);check(!raw.includes('usageTaskId'),'Statistics task metadata is not added to the provider prompt');
  let text=JSON.stringify({message:'Isolierte Prüfantwort; keine Modelländerung.'});if(raw.includes('Wo finde ich den Export')&&!badHelp){badHelp=true;text='{invalid json';}
  return new Response(JSON.stringify(body.instructions?{usage,output:[{type:'message',content:[{type:'output_text',text}]}]}:{usage,choices:[{message:{content:text}}]}));
 };
 try{
  const before=await run('window.__cadTest.serialize()');
  await run('window.offlinecadDesktop.saveAISettings('+JSON.stringify({config:{authMode:'api-key',baseUrl:'https://api.deepseek.com',protocol:'responses',model:'deepseek-flash',agentSteps:24,rememberKey:false},key:'isolated-meter-fixture'})+')');await run('window.__cadTest.aiUI.chat.refreshModels()');await until("!document.getElementById('ai-chat-send').disabled");
  for(const prompt of ['Baue die STL als CAD nach','Verschiebe das Modell um 10 mm','Erstelle einen neuen Halter','Wo finde ich den Export?','Hallo']){
   await run("document.getElementById('ai-chat-new').click();document.getElementById('ai-chat-prompt').value="+JSON.stringify(prompt)+";document.getElementById('ai-chat-form').requestSubmit();void 0");await until("!document.getElementById('ai-chat-send').disabled");
  }
  const stats=await run('window.offlinecadDesktop.getAIUsageStatistics({period:"all"})');
  check(calls===6,'Five tasks and one JSON correction use six actual mock provider calls');
  check(stats.rows.reduce((s,r)=>s+r.api.requests,0)===6&&stats.rows.reduce((s,r)=>s+r.api.tasks,0)===5,'Actual IPC statistics count tasks separately from correction requests');
  check(stats.rows.find(r=>r.category==='help').api.requests===2&&stats.rows.find(r=>r.category==='help').api.tasks===1,'Menu question and JSON repair remain one help task');
  check(stats.rows.every(r=>r.api.tasks===1),'All five task categories are recorded through the actual chat UI');
  check(stats.rows.reduce((s,r)=>s+r.api.outputTokens,0)===6000,'Reasoning is not added twice to output tokens');
  check(!fs.readFileSync(ledgerFile,'utf8').includes('isolated-meter-fixture')&&!fs.readFileSync(ledgerFile,'utf8').includes('Verschiebe'),'Portable statistics contain no prompts or credential');
  await run('window.__cadTest.ui.settings.open();document.querySelector(\'[data-settings-tab="ai"]\').click();void 0');await until("!!document.querySelector('#ai-usage-meter table tbody tr')");
  const text=await run("document.getElementById('ai-usage-meter').textContent");check(text.includes('STL nachbauen')&&text.includes('Bedienhilfe')&&text.includes('60.000'),'Actual settings show category statistics and formatted reported input tokens');
  await run("document.getElementById('ai-meter-scope').value='all';document.getElementById('ai-meter-scope').dispatchEvent(new Event('change'));void 0");await until("document.getElementById('ai-meter-usage').textContent.includes('keine zusätzliche Abo-Abrechnung')");await new Promise(r=>setTimeout(r,200));check(await run("document.getElementById('ai-meter-scope').value==='all'&&document.getElementById('ai-meter-usage').textContent.includes('keine zusätzliche Abo-Abrechnung')"),'Subscription equivalent stays explicitly separate from API expenses after filtering');
  await run("document.getElementById('ai-usage-meter').scrollIntoView({block:'start'});void 0");await capture('meter-light');
  await run("document.getElementById('ai-meter-context-tab').click();void 0");await until("document.getElementById('ai-meter-context').textContent.includes('4 Zeichen')");
  const m=await run('window.offlinecadDesktop.getAIContextMetrics({context:window.__cadTest.access.context()})');check(m.files.length===4&&m.total.estimatedTokens>1000&&m.total.estimatedInputCostUSD.max>0,'Actual context metrics measure bundled files and compact request parts with input-only price estimate');
  check(calls===6,'Opening and refreshing context metrics sends no provider request');
  await capture('context-light');
  await run("document.documentElement.dataset.theme='dark';document.getElementById('ai-usage-meter').scrollIntoView({block:'start'});void 0");await capture('context-dark');
  win.setSize(900,850);await new Promise(r=>setTimeout(r,200));check(await run("(()=>{const e=document.getElementById('ai-usage-meter'),r=e.getBoundingClientRect();return r.width>0&&r.width<innerWidth;})()"),'Meter fits a smaller desktop window with scrollable tables');await capture('context-small');
  check(await run('window.__cadTest.serialize()')===before,'Usage/context inspection preserves original model');
  fs.writeFileSync(path.join(directory,'meter-proof.json'),JSON.stringify({checks,stats,metrics:m,providerCalls:calls,liveCloudRequests:0},null,2));return checks;
 }finally{global.fetch=original;}
};
