const fs=require('node:fs');
exports.verifyProviderContext=async function(win){
 const run=s=>win.webContents.executeJavaScript(s),checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);},original=global.fetch,previous=await run('window.offlinecadDesktop.getAISettings()'),bodies=[];
 const until=async()=>{for(let n=0;n<250;n++){if(await run("!document.getElementById('ai-chat-send').disabled"))return;await new Promise(r=>setTimeout(r,40));}throw Error('Provider context UI timeout');};
 const select=async id=>{await run('window.offlinecadDesktop.selectAIProvider('+JSON.stringify({providerId:id})+')');await run('window.__cadTest.aiUI.chat.refreshModels()');await until();};
 const send=async text=>{await run("document.getElementById('ai-chat-prompt').value="+JSON.stringify(text)+";document.getElementById('ai-chat-form').requestSubmit();void 0");await until();};
 global.fetch=async(url,options)=>{if(!/^https:\/\/api\.(openai|deepseek)\.com\//.test(String(url)))return original(url,options);if(String(url).endsWith('/models'))return new Response(JSON.stringify({data:[{id:String(url).includes('deepseek')?'deepseek-flash':'gpt-6-astra'}]}));const body=JSON.parse(options.body);bodies.push(body);return new Response(JSON.stringify(body.messages?{choices:[{message:{content:'{"message":"Provider discussion received"}'}}]}:{output:[{type:'message',content:[{type:'output_text',text:'{"message":"Provider discussion received"}'}]}]}));};
 try{
  for(const [baseUrl,model,protocol] of [['https://api.openai.com/v1','gpt-6-astra','responses'],['https://api.deepseek.com','deepseek-flash','chat']]){
   await run('window.offlinecadDesktop.saveAISettings('+JSON.stringify({config:{baseUrl,model,protocol,authMode:'api-key',rememberKey:false,bridgeEnabled:false,openAIReasoningEffort:'auto'},key:'synthetic-context-fixture'})+')');
   const s=await run('window.offlinecadDesktop.getAISettings()');fs.writeFileSync(s.modelingContext.notesFile,model==='deepseek-flash'?'PRIVATE_DEEPSEEK_NOTES':'PRIVATE_GPT_NOTES');
  }
  await select('https://api.deepseek.com');await run("document.getElementById('ai-chat-new').click()");await send('DEEPSEEK_CONVERSATION_ONLY');
  await run("document.getElementById('ai-chat-prompt').value='DeepSeek draft';void 0");
  await select('https://api.openai.com');check(await run("!document.getElementById('ai-chat-log').textContent.includes('DEEPSEEK_CONVERSATION_ONLY')&&document.getElementById('ai-chat-prompt').value===''") ,'Switching provider hides the other conversation and draft');
  await send('GPT_CONVERSATION_ONLY');check(!JSON.stringify(bodies.at(-1)).includes('DEEPSEEK_CONVERSATION_ONLY')&&!JSON.stringify(bodies.at(-1)).includes('PRIVATE_DEEPSEEK_NOTES')&&JSON.stringify(bodies.at(-1)).includes('PRIVATE_GPT_NOTES'),'Actual GPT request contains only GPT notes and history');
  await select('https://api.deepseek.com');check(await run("document.getElementById('ai-chat-log').textContent.includes('DEEPSEEK_CONVERSATION_ONLY')&&!document.getElementById('ai-chat-log').textContent.includes('GPT_CONVERSATION_ONLY')&&document.getElementById('ai-chat-prompt').value==='DeepSeek draft'"),'Returning to a provider restores its own history and draft');
  await send('DEEPSEEK_FOLLOWUP');check(JSON.stringify(bodies.at(-1)).includes('DEEPSEEK_CONVERSATION_ONLY')&&JSON.stringify(bodies.at(-1)).includes('PRIVATE_DEEPSEEK_NOTES')&&!JSON.stringify(bodies.at(-1)).includes('GPT_CONVERSATION_ONLY')&&!JSON.stringify(bodies.at(-1)).includes('PRIVATE_GPT_NOTES'),'Actual DeepSeek follow-up retains its own history without GPT content');
  const deep=await run('window.offlinecadDesktop.getAISettings()');await select('chatgpt');const chat=await run('window.offlinecadDesktop.getAISettings()');check(chat.modelingContext.notesFile!==deep.modelingContext.notesFile&&!fs.readFileSync(chat.modelingContext.notesFile,'utf8').includes('PRIVATE_DEEPSEEK_NOTES'),'ChatGPT subscription has a separate context from API providers');
  for(const [label,body]of [['GPT',bodies.find(b=>!b.messages)],['DeepSeek',bodies.find(b=>b.messages)]]){
   const contract=body?.instructions??body?.messages?.[0]?.content??'';check(contract.includes('NumPy')&&contract.includes('workspace')&&contract.includes('Permanent portable tool library'),'Actual '+label+' request receives the complete common scientific tools and reusable library contract');
  }
  return checks;
 }finally{global.fetch=original;await select(previous.providerId);}
};
