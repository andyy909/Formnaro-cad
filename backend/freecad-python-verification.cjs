const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
exports.verifyFreeCADPython=async(win,{directory})=>{
 const run=s=>win.webContents.executeJavaScript(s),checks=[],check=(v,n)=>{assert(v,n);checks.push(n);},previous=await run('window.offlinecadDesktop.getAISettings()'),originalFetch=global.fetch,records=[];let calls=0;
 const until=async expression=>{for(let i=0;i<1500;i++){if(await run(expression))return;await new Promise(r=>setTimeout(r,30));}throw Error('Native FreeCAD UI timeout: '+expression);};
 const code="from formnaro_freecad import inside\nbase=doc.addObject('Part::Box','Base');base.Length=30;base.Width=20;base.Height=6;base.Placement.Base=App.Vector(200,0,0)\nbore=doc.addObject('Part::Cylinder','Bore');bore.Radius=3;bore.Height=8;bore.Placement.Base=App.Vector(215,10,-1)\nresult=doc.addObject('Part::Cut','Finished');result.Base=base;result.Tool=bore;doc.recompute()\nmeasurements={'inside':inside(result,[(202,2,2),(215,10,2)]),'realCut':result.TypeId}";
 global.fetch=async(url,options)=>{
  if(!/^https:\/\/api\.(openai|deepseek)\.com\//.test(String(url)))return originalFetch(url,options);
  const deep=String(url).includes('deepseek'),model=deep?'deepseek-flash':'gpt-6.1-sol';if(String(url).endsWith('/models'))return new Response(JSON.stringify({data:[{id:model,input_modalities:['text']}]}));
  const body=JSON.parse(options.body),entry=deep?body.messages.at(-1).content:body.input,latest=Array.isArray(entry)?entry.find(c=>['input_text','text'].includes(c.type)).text:entry,scene=JSON.parse(latest.split('Current scene (data):\n')[1].split('\nUser task:\n')[0]);calls++;
  const answer=calls===1?{revision:scene.revision,analysis:[{id:'nativeAPI',engine:'freecad',kind:'inspect',options:{script:{version:1,name:'FreeCAD API erkunden',code:"from formnaro_freecad import api\nmeasurements=api('Part','makeShell')"}}}]}:{revision:scene.revision,label:'Native FreeCAD-Python-Prüfung',commands:[{op:'tool',engine:'freecad',as:'result',operation:{kind:'build',script:{version:1,name:'Native-KI-Volumentest',code}}}],checks:[{kind:'solids',target:'$result',expected:1},{kind:'volume',target:'$result',expected:3600-54*Math.PI,tolerance:.001}]};
  records.push({model,step:calls,fullAPI:JSON.stringify(body).includes('Full installed FreeCAD Python API'),discovery:latest.includes('Local analysis results')});
  return new Response(JSON.stringify(deep?{choices:[{message:{content:JSON.stringify(answer)}}]}:{output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}]}));
 };
 try{
  check((await run('window.offlinecadDesktop.getFreeCADStatus()')).pythonAPI,'Actual desktop exposes the installed full native FreeCAD Python runtime');
  const before=await run('window.__cadTest.serialize()'),depth=await run('window.__cadTest.undoDepth()');
  for(const [baseUrl,model,protocol]of [['https://api.openai.com/v1','gpt-6.1-sol','responses'],['https://api.deepseek.com','deepseek-flash','chat']]){
   calls=0;await run('window.offlinecadDesktop.saveAISettings('+JSON.stringify({config:{authMode:'api-key',baseUrl,model,protocol,agentSteps:24,rememberKey:false},key:'isolated-native-fixture'})+')');await run('window.__cadTest.aiUI.chat.refreshModels()');await until("!document.getElementById('ai-chat-send').disabled");
   await run("document.getElementById('ai-chat-new').click();document.getElementById('ai-chat-prompt').value='Erkunde die native FreeCAD-API und baue den parametrischen Prüfkörper.';document.getElementById('ai-chat-form').requestSubmit();void 0");await until("!document.getElementById('ai-chat-send').disabled");
   check(calls===2&&await run("!document.getElementById('ai-chat-proposal').hidden"),model+' completes native API discovery and real FreeCAD Python construction through the chat');
   check(records.slice(-2).every(r=>r.fullAPI)&&records.at(-1).discovery,model+' receives the full API contract and actual native discovery results');
   check(await run('window.__cadTest.serialize()')===before&&await run('window.__cadTest.undoDepth()')===depth,model+' native programs preserve the confirmed project until Apply');
   await run("document.getElementById('ai-chat-apply').click();void 0");await until("document.getElementById('ai-chat-proposal').hidden");await run('window.__cadTest.settled()');
   const built=JSON.parse(await run('window.__cadTest.serialize()')),node=built.nodes.find(n=>n.metadata?.freecadSource?.script?.name==='Native-KI-Volumentest');
   check(!!node&&node.metadata.freecadSource.script.code===code&&node.metadata.freecadSource.documentBase64.startsWith('UEs'),model+' preserves the complete native source and real parametrically editable FCStd document');
   check(await run('window.__cadTest.undoDepth()')===depth+1,model+' native Apply creates exactly one Undo');
   if(model==='gpt-6.1-sol'){
    fs.writeFileSync(path.join(directory,'native-python.FCStd'),Buffer.from(node.metadata.freecadSource.documentBase64,'base64'));fs.writeFileSync(path.join(directory,'native-python.ocad'),JSON.stringify(built));
    await run('window.__cadTest.view.fit([]);window.__cadTest.view.renderReady()');fs.writeFileSync(path.join(directory,'native-python.png'),(await win.webContents.capturePage()).toPNG());
   }
   await run('window.__cadTest.actions.undo();void 0');await run('window.__cadTest.settled()');check(await run('window.__cadTest.serialize()')===before,model+' Undo restores every original object exactly');
  }
  const tools=await run("window.offlinecadDesktop.aiToolLibrary({action:'search',search:'Native-KI-Volumentest'})");check(tools.total===1&&tools.tools[0].tags.includes('FreeCAD'),'Executed native source is discoverable in the permanent shared tool library');
  fs.writeFileSync(path.join(directory,'native-provider-tools.json'),JSON.stringify({ok:true,checks,records,liveCloudRequests:0,scope:'Actual desktop transport, Windows AppContainer native FreeCAD, real worker import and strict result checks; synthetic provider responses, no autonomous model-quality claim.'},null,2));return checks;
 }finally{global.fetch=originalFetch;await run('window.offlinecadDesktop.selectAIProvider('+JSON.stringify({providerId:previous.providerId})+')');await run('window.__cadTest.aiUI.chat.refreshModels()');}
};
