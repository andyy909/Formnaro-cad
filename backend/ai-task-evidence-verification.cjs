const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
exports.verifyTaskEvidence=async(win,{directory})=>{
 const run=s=>win.webContents.executeJavaScript(s),checks=[],records=[],original=global.fetch;
 const check=(value,label)=>{assert(value,label);checks.push(label);};
 const until=async expression=>{const start=Date.now();while(Date.now()-start<180000){if(await run(expression))return;await new Promise(r=>setTimeout(r,40));}throw Error('Task evidence GUI timeout');};
 let calls=0;
 global.fetch=async(url,options)=>{
  if(!/^https:\/\/api\.(openai|deepseek)\.com\//.test(String(url)))return original(url,options);
  const deep=String(url).includes('deepseek'),model=deep?'deepseek-flash':'gpt-6.1-sol';
  if(String(url).endsWith('/models'))return new Response(JSON.stringify({data:[{id:model,input_modalities:['text']}]}));
  const body=JSON.parse(options.body),system=body.instructions??body.messages[0].content,contract=JSON.parse(system.split('Contract:\n').at(-1));
  const entry=deep?body.messages.at(-1).content:body.input,latest=Array.isArray(entry)?entry.find(c=>['input_text','text'].includes(c.type)).text:entry,scene=JSON.parse(latest.split('Current scene (data):\n')[1].split('\nUser task:\n')[0]);calls++;
  check(contract.requestSchema.$ref==='#/commandSchema'&&!!contract.commandSchema.properties.commands,'Actual '+model+' API payload carries only one full command schema');
  check(!!contract.programTools.freecadPython&&!!contract.programTools.python,'Actual '+model+' API retains all native and numerical modelling tools');
  if(calls>1)check(contract.taskEvidence.failures.some(f=>f.code==='FREECAD_PYTHON_FAILED'&&f.message.includes('Evidence fixture native failure')),model+' retains the first native error across subsequent rounds');
  if(calls===4){check(contract.taskEvidence.failures.some(f=>f.code==='AI_OUTPUT_INVALID'),'Invalid JSON is retained alongside the earlier native failure');check(latest.includes('Local analysis results'),'Successful measurement remains available with cumulative failures');}
  const answer=calls===1?{revision:scene.revision,analysis:[{id:'native',engine:'freecad',kind:'inspect',options:{script:{version:1,code:'raise RuntimeError("Evidence fixture native failure")'}}}]}:calls===2?{revision:scene.revision,analysis:[{id:'measure',engine:'python',kind:'run',options:{code:'result={"width":12}'}}]}:{revision:scene.revision,label:'Prüfkörper mit erhaltenem Fehlergedächtnis',commands:[{op:'tool',engine:'freecad',as:'part',operation:{kind:'build',script:{version:1,code:'import Part\nresult=Part.makeBox(12,5,2)'}}}],checks:[{kind:'solids',target:'$part',expected:1},{kind:'volume',target:'$part',expected:120,tolerance:.001}]};
  const text=calls===3?'{invalid json':JSON.stringify(answer);records.push({model,call:calls,evidence:contract.taskEvidence,schemaRef:contract.requestSchema,systemCharacters:system.length});
  return new Response(JSON.stringify(deep?{choices:[{message:{content:text}}]}:{output:[{type:'message',content:[{type:'output_text',text}]}]}));
 };
 try{
  const before=await run('window.__cadTest.serialize()'),depth=await run('window.__cadTest.undoDepth()');
  for(const [baseUrl,model,protocol]of [['https://api.deepseek.com','deepseek-flash','chat'],['https://api.openai.com/v1','gpt-6.1-sol','responses']]){
   calls=0;await run('window.offlinecadDesktop.saveAISettings('+JSON.stringify({config:{authMode:'api-key',baseUrl,model,protocol,agentSteps:24,rememberKey:false},key:'isolated-task-evidence-fixture'})+')');
   await run('window.__cadTest.aiUI.chat.refreshModels()');await until("!document.getElementById('ai-chat-send').disabled");
   await run("document.getElementById('ai-chat-new').click();document.getElementById('ai-chat-prompt').value='Baue den beschriebenen Prüfkörper selbstständig.';document.getElementById('ai-chat-form').requestSubmit();void 0");await until("!document.getElementById('ai-chat-send').disabled");
   check(calls===4&&await run("!document.getElementById('ai-chat-proposal').hidden"),model+' completes failure / measurement / invalid JSON / valid native preview in actual UI');
   check(await run('window.__cadTest.serialize()')===before&&await run('window.__cadTest.undoDepth()')===depth,model+' preserves original and Undo before Apply');
   check(records.filter(r=>r.model===model)[0].evidence.failures.length===0,model+' starts with fresh task evidence');
   fs.writeFileSync(path.join(directory,model+'-evidence.png'),(await win.webContents.capturePage()).toPNG());await run("document.getElementById('ai-chat-discard').click();void 0");
  }
  fs.writeFileSync(path.join(directory,'task-evidence.json'),JSON.stringify({checks,records,cloudRequests:0},null,2));return checks;
 }finally{global.fetch=original;}
};
