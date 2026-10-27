const fs=require('node:fs'),path=require('node:path');
exports.verifyReasoningUI=async function(win,{directory}){
 const checks=[],run=s=>win.webContents.executeJavaScript(s),check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);},original=global.fetch;
 const previous=await run('window.offlinecadDesktop.getAISettings()');let sent;
 global.fetch=async(url,options)=>{if(!String(url).startsWith('https://api.openai.com/v1/'))return original(url,options);if(String(url).endsWith('/models'))return new Response(JSON.stringify({data:[{id:'gpt-6-astra',input_modalities:['text','image'],supported_reasoning_levels:[{effort:'low'},{effort:'medium'},{effort:'high'},{effort:'xhigh'},{effort:'max'}]}]}));sent=JSON.parse(options.body);return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"message":"Reasoning fixture OK"}'}]}]}));};
 const until=async code=>{for(let n=0;n<200;n++){if(await run(code))return;await new Promise(r=>setTimeout(r,50));}throw Error('Reasoning UI timeout');};
 try{
  await run("window.offlinecadDesktop.saveAISettings({config:{baseUrl:'https://api.openai.com/v1',model:'gpt-6-astra',authMode:'api-key',protocol:'responses',rememberKey:false,bridgeEnabled:false,openAIReasoningEffort:'auto'},key:'synthetic-reasoning-fixture'})");
  await run('window.__cadTest.aiUI.chat.refreshModels()');await run('window.__cadTest.aiUI.chat.open()');
  check(await run("!document.getElementById('ai-chat-effort').disabled&&document.getElementById('ai-chat-effort').parentElement.getBoundingClientRect().height>0"),'GPT reasoning selector is visible and enabled in actual chat');
  check(await run("JSON.stringify([...document.getElementById('ai-chat-effort').options].map(o=>o.value))===JSON.stringify(['auto','low','medium','high','xhigh','max'])"),'Chat uses model-supported efforts including automatic, medium, xhigh and max');
  await run("document.getElementById('ai-chat-effort').value='max';document.getElementById('ai-chat-effort').dispatchEvent(new Event('change'));void 0");await until("!document.getElementById('ai-chat-effort').disabled");
  check((await run('window.offlinecadDesktop.getAISettings()')).openAIReasoningEffort==='max','Chat effort change persists through real IPC');
  const answer=await run("window.offlinecadDesktop.generateAIReply({requestId:'reasoning-ui',prompt:'Hello',chat:true,context:{},scene:{revision:'fixture'}})");check(answer.ok&&sent.reasoning.effort==='max','Selected effort reaches provider request through desktop service');
  await run("(async()=>{const r=document.createElement('div');r.id='reasoning-settings-fixture';r.style.cssText='position:fixed;inset:20px;z-index:99999;overflow:auto;background:white;padding:20px;max-width:650px';document.body.append(r);await window.__cadTest.aiUI.mountSettings(r);})()");await until("document.getElementById('ai-openai-effort').value==='max'&&!document.getElementById('ai-openai-effort').disabled");
  check(await run("document.getElementById('ai-openai-effort').parentElement.getBoundingClientRect().height>0"),'Settings show the same saved GPT effort as chat');
  await run("document.getElementById('ai-openai-effort').scrollIntoView({block:'center'})");fs.writeFileSync(path.join(directory,'reasoning-settings.png'),(await win.webContents.capturePage()).toPNG());
  return checks;
 }finally{await run("document.getElementById('reasoning-settings-fixture')?.remove()");await run('window.offlinecadDesktop.selectAIProvider('+JSON.stringify({providerId:previous.providerId})+')');await run('window.__cadTest.aiUI.chat.refreshModels()');global.fetch=original;}
};
