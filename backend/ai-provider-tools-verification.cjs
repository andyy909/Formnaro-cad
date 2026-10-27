const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
exports.verifyProviderTools=async(win,{directory,helperRevision})=>{
 const run=s=>win.webContents.executeJavaScript(s),checks=[],check=(v,n)=>{assert(v,n);checks.push(n);},previous=await run('window.offlinecadDesktop.getAISettings()'),fetchOriginal=global.fetch,records=[];let calls=0;
 const until=async expression=>{for(let i=0;i<1500;i++){if(await run(expression))return;await new Promise(r=>setTimeout(r,30));}throw Error('Provider tools UI timeout');};
 const analysisCode=`from formnaro import workspace\nimport numpy as np\ntool=await workspace.import_tool(${JSON.stringify(helperRevision)})\nt=np.linspace(0,2*np.pi,40,endpoint=False)\ndiameter=tool.diameter(np.c_[6*np.cos(t),6*np.sin(t)])\nawait workspace.write_json('provider-dimensions.json',{'width':diameter})\nresult={'diameter':diameter}`;
 const createCode="from formnaro import model, workspace\nd=await workspace.read_json('provider-dimensions.json')\np=model.box(d['width'],5,2,origin=(200,0,0))\nh=model.cylinder(.5,4,origin=(206,2.5,-1),hole=True)\nmodel.cut(p,h,alias='result')";
 global.fetch=async(url,options)=>{
  if(!/^https:\/\/api\.(openai|deepseek)\.com\//.test(String(url)))return fetchOriginal(url,options);
  const deep=String(url).includes('deepseek'),model=deep?'deepseek-flash':'gpt-6.1-sol';
  if(String(url).endsWith('/models'))return new Response(JSON.stringify({data:[{id:model,input_modalities:['text']}]}));
  const body=JSON.parse(options.body),entry=deep?body.messages.at(-1).content:body.input,latest=Array.isArray(entry)?entry.find(c=>['input_text','text'].includes(c.type)).text:entry,scene=JSON.parse(latest.split('Current scene (data):\n')[1].split('\nUser task:\n')[0]);calls++;
  const answer=calls===1?{revision:scene.revision,analysis:[{id:'reuse',engine:'python',kind:'run',options:{name:'Gemeinsamer Kreisfit',code:analysisCode}}]}:{revision:scene.revision,label:'Gemeinsam gemessene Prüfplatte',commands:[{op:'python',name:'Platte aus gemessenen Daten',code:createCode}],checks:[{kind:'solids',target:'$result',expected:1},{kind:'volume',target:'$result',expected:120-Math.PI*.5,tolerance:.001}]};
  records.push({model,step:calls,hasScientificTools:JSON.stringify(body).includes('NumPy'),hasSharedLibrary:JSON.stringify(body).includes('Permanent portable tool library'),analysisReceived:latest.includes('Local analysis results'),answer});
  const usage={input_tokens:100000,output_tokens:10000,input_tokens_details:{cached_tokens:80000},output_tokens_details:{reasoning_tokens:9000}};
  return new Response(JSON.stringify(deep?{usage,choices:[{message:{content:JSON.stringify(answer)}}]}:{usage,output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}]}));
 };
 try{
  const before=await run('window.__cadTest.serialize()'),depth=await run('window.__cadTest.undoDepth()');
  for(const [baseUrl,model,protocol]of [['https://api.openai.com/v1','gpt-6.1-sol','responses'],['https://api.deepseek.com','deepseek-flash','chat']]){
   calls=0;await run('window.offlinecadDesktop.saveAISettings('+JSON.stringify({config:{authMode:'api-key',baseUrl,model,protocol,agentSteps:24,rememberKey:false},key:'isolated-tools-fixture'})+')');await run('window.__cadTest.aiUI.chat.refreshModels()');await until("!document.getElementById('ai-chat-send').disabled");
   await run("document.getElementById('ai-chat-new').click();document.getElementById('ai-chat-prompt').value='Verwende den gespeicherten Kreisfit und baue eine gemessene Prüfplatte.';document.getElementById('ai-chat-form').requestSubmit();void 0");await until("!document.getElementById('ai-chat-send').disabled");
   check(calls===2&&await run("!document.getElementById('ai-chat-proposal').hidden"),model+' performs real Python analysis and subsequent CAD preview through the chat workflow');
   check(records.slice(-2).every(r=>r.hasScientificTools&&r.hasSharedLibrary)&&records.at(-1).analysisReceived,model+' receives complete common tools, saved helper source access and measured follow-up feedback');
   check(await run('window.__cadTest.serialize()')===before&&await run('window.__cadTest.undoDepth()')===depth,model+' reuses the shared helper without applying or changing the original project');
   if(model==='gpt-6.1-sol'){
    check(await run("document.getElementById('ai-chat-usage').textContent.includes('Geschätzter API-Gegenwert: 0,2960 USD')"),'Actual GPT chat displays the summed API equivalent with cached-token pricing');
    fs.writeFileSync(path.join(directory,'gpt-api-equivalent.png'),(await win.webContents.capturePage()).toPNG());
   }
   await run("document.getElementById('ai-chat-discard').click();void 0");
  }
  fs.writeFileSync(path.join(directory,'provider-tools.json'),JSON.stringify({ok:true,checks,records,liveCloudRequests:0,scope:'Synthetic provider responses travel through actual desktop transport, opaque numerical Python, persistent library, native CAD and real chat. No model capability ranking or live inference claim.'},null,2));return checks;
 }finally{global.fetch=fetchOriginal;await run('window.offlinecadDesktop.selectAIProvider('+JSON.stringify({providerId:previous.providerId})+')');await run('window.__cadTest.aiUI.chat.refreshModels()');}
};
