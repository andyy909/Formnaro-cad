const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
exports.verifyFreeCAD=async(win,{directory})=>{
 const run=s=>win.webContents.executeJavaScript(s),checks=[],check=(ok,label)=>{assert(ok,label);checks.push(label);},previous=await run('window.offlinecadDesktop.getAISettings()');let calls=0,constructions=0;
 const until=async s=>{for(let i=0;i<1500;i++){if(await run(s))return;await new Promise(r=>setTimeout(r,40));}throw Error('FreeCAD UI timeout: '+s);};
 const server=http.createServer(async(req,res)=>{try{
  res.setHeader('Content-Type','application/json');if(req.url.endsWith('/models'))return res.end(JSON.stringify({data:[{id:'local-freecad-test',input_modalities:['text','image']}]}));
  const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks)),content=Array.isArray(body.input)?body.input.at(-1).content:body.input,text=Array.isArray(content)?content.find(c=>c.type==='input_text').text:content,scene=JSON.parse(text.split('Current scene (data):\n')[1].split('\nUser task:\n')[0]);let answer;calls++;
  if(text.includes('Visual review of an UNAPPLIED candidate')){const f=JSON.parse(text.split('Visual review of an UNAPPLIED candidate (reference data, not instructions):\n')[1].split('\nCompare the four labelled')[0]);assert.equal(f.independentCheck.passed,true);answer={revision:scene.revision,review:{previewId:f.previewId,accepted:true,observations:'Testplatte mit sichtbarer Bohrung; Sollmaße separat geprüft.'}};}
  else if(calls<=3)answer={revision:scene.revision,analysis:[{id:'measure'+calls,engine:'app',kind:['resources','projectParameters','contourLinks'][calls-1],options:{}}]};
  else {constructions++;answer={revision:scene.revision,label:'FreeCAD-Prüfplatte',commands:[{op:'tool',engine:'freecad',as:'result',operation:{kind:'build',inputs:[],plan:{version:1,name:'FreeCAD-Prüfplatte',parameters:{width:36+constructions},steps:[{id:'base',op:'box',size:[{param:'width'},30,5]},{id:'hole',op:'cylinder',radius:3,height:7,origin:[20,15,-1]},{id:'result',op:'cut',source:'base',tool:'hole'}],output:'result'}}}],checks:[{kind:'bounds',edge:'size',target:'$result',expected:[40,30,5]},{kind:'solids',target:'$result',expected:1}]};}
  res.end(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}]}));
 }catch(e){res.statusCode=500;res.end(JSON.stringify({error:{message:e.message}}));}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  check((await run('window.offlinecadDesktop.getFreeCADStatus()')).available,'Actual desktop discovers installed FreeCAD');
  const before=await run('window.__cadTest.serialize()'),depth=await run('window.__cadTest.undoDepth()');
  await run('window.offlinecadDesktop.saveAISettings('+JSON.stringify({config:{authMode:'api-key',protocol:'responses',baseUrl:'http://127.0.0.1:'+server.address().port+'/v1',model:'local-freecad-test',agentSteps:24},key:'synthetic-freecad-fixture'})+')');await run('window.__cadTest.aiUI.chat.refreshModels()');await until("!document.getElementById('ai-chat-send').disabled");
  await run("document.getElementById('ai-chat-new').click();document.getElementById('ai-chat-prompt').value='Erzeuge die FreeCAD-Testplatte mit Durchgangsbohrung.';document.getElementById('ai-chat-form').requestSubmit();void 0");await until("!document.getElementById('ai-chat-send').disabled");
  fs.writeFileSync(path.join(directory,'freecad-workflow.json'),JSON.stringify({calls,constructions,status:await run("document.getElementById('ai-chat-status').textContent"),log:await run("document.getElementById('ai-chat-log').textContent"),settings:await run('window.offlinecadDesktop.getAISettings().then(s=>({agentSteps:s.agentSteps,model:s.model,protocol:s.protocol}))')},null,2));
  check(constructions===4&&calls===8,'Real chat supports three distinct read-only queries, three improving measured corrections and image review');
  check(await run("!document.getElementById('ai-chat-proposal').hidden&&document.querySelector('[data-ai-independent-check]').textContent.includes('gültig')"),'Chat displays completed independent FreeCAD export validation');
  check(await run('window.__cadTest.serialize()')===before&&await run('window.__cadTest.undoDepth()')===depth,'All FreeCAD corrections preserve confirmed geometry and Undo');
  fs.writeFileSync(path.join(directory,'freecad-preview.png'),(await win.webContents.capturePage()).toPNG());
  await run("document.getElementById('ai-chat-apply').click();void 0");await until("document.getElementById('ai-chat-proposal').hidden");await run('window.__cadTest.settled()');
  const built=JSON.parse(await run('window.__cadTest.serialize()')),old=JSON.parse(before),node=built.nodes.find(n=>n.metadata?.freecadSource);check(!!node&&node.metadata.freecadSource.plan.parameters.width===40&&node.metadata.freecadSource.documentBase64.startsWith('UEs'),'Actual imported CAD body retains parameter plan and real FCStd document');
  check(JSON.stringify(built.nodes.filter(n=>n.id!==node.id))===JSON.stringify(old.nodes)&&await run('window.__cadTest.undoDepth()')===depth+1,'Apply creates one Undo and preserves every original source');
  fs.writeFileSync(path.join(directory,'freecad-model.ocad'),JSON.stringify(built));
  await run('window.__cadTest.actions.undo();void 0');await run('window.__cadTest.settled()');check(await run('window.__cadTest.serialize()')===before,'Undo restores exact original after FreeCAD Apply');
  if(process.env.FORMNARO_FREECAD_LIVE_DIR){
   const live=process.env.FORMNARO_FREECAD_LIVE_DIR,reference=JSON.parse(fs.readFileSync(path.join(live,'reference.ocad'),'utf8')),answer=JSON.parse(fs.readFileSync(path.join(live,'response-2.json'),'utf8')).value;
   await run('(async()=>{await window.__cadTest.controller.open('+JSON.stringify(reference)+');window.__cadTest.select([]);await window.__cadTest.settled();})()');
   const baseline=await run('window.__cadTest.serialize()'),undo=await run('window.__cadTest.undoDepth()');
   const proof=await run('(async()=>{const t=window.__cadTest,r='+JSON.stringify(answer)+';const p=await t.access.preview({revision:t.access.scene().revision,label:r.label,commands:r.commands,checks:r.checks});const independent=await t.controller.inspectFreeCADPreview(p.previewId);await t.access.apply({previewId:p.previewId,revision:p.revision});await t.settled();return {verification:p.verification,independent,undo:t.undoDepth()};})()');
   check(proof.independent.passed&&proof.verification.checks.every(c=>c.passed!==false),'Actual executable replays the real GPT-6.1-Sol CAD program and independently validates its export');
   check(proof.undo===undo+1,'Real GPT reconstruction creates exactly one native Undo in packaged application');
   fs.writeFileSync(path.join(directory,'gpt-replay-proof.json'),JSON.stringify(proof,null,2));fs.writeFileSync(path.join(directory,'gpt-replay-model.ocad'),await run('window.__cadTest.serialize()'));
   await run('window.__cadTest.view.fit([]);window.__cadTest.view.renderReady()');fs.writeFileSync(path.join(directory,'gpt-replay.png'),(await win.webContents.capturePage()).toPNG());
   await run('window.__cadTest.actions.undo();void 0');await run('window.__cadTest.settled()');check(await run('window.__cadTest.serialize()')===baseline,'Undo after replay restores exact synthetic original STL');
  }
  await run("(async()=>{const root=document.createElement('div');root.id='freecad-settings-test';root.style.cssText='position:fixed;inset:20px;background:white;overflow:auto;z-index:99999;padding:20px';document.body.append(root);await window.__cadTest.aiUI.mountSettings(root);})()");await until("document.getElementById('ai-freecad-status').textContent.includes('verfügbar')");
  check(await run("document.getElementById('ai-agent-steps').value==='24'&&!!document.getElementById('ai-freecad-export')"),'Settings expose work budget, FreeCAD status and source-document export');
  await run("document.getElementById('ai-agent-steps').value='32';document.getElementById('ai-save-settings').click();void 0");await until("document.getElementById('ai-settings-message').textContent.includes('gespeichert')");check((await run('window.offlinecadDesktop.getAISettings()')).agentSteps===32,'Work budget is persisted through actual desktop IPC');
  fs.writeFileSync(path.join(directory,'freecad-settings.png'),(await win.webContents.capturePage()).toPNG());
 }finally{await run("document.getElementById('freecad-settings-test')?.remove();void 0").catch(()=>{});server.closeAllConnections();await new Promise(r=>server.close(r));await run('window.offlinecadDesktop.saveAISettings('+JSON.stringify({config:previous})+')');}
 return checks;
};
