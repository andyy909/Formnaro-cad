// Explicit verification mode only; Electron supplies an isolated synthetic profile.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {radialClearanceFixture}=require('./radial-clearance-fixture.cjs');
async function verifyAIResultChecks(win,{directory,files}){
 if(process.env.FORMNARO_VERIFY_TASK_RESTART_ONLY==='1')return {ok:true,checks:await require('./ai-task-restart-verification.cjs').verifyTaskRestart(win,{directory,files}),cloudRequests:0};
 if(process.env.FORMNARO_VERIFY_TASK_UI_ONLY==='1')return {ok:true,checks:await require('./ai-task-ui-verification.cjs').verifyTaskUI(win,{directory}),cloudRequests:0};
 if(process.env.FORMNARO_VERIFY_TASK_PROGRESS_ONLY==='1')return {ok:true,checks:await require('./ai-task-progress-verification.cjs').verifyTaskProgress(win,{directory}),cloudRequests:0};
 if(process.env.FORMNARO_VERIFY_FREECAD_DOCUMENT_ONLY==='1')return {ok:true,checks:await require('./freecad-document-verification.cjs').verifyFreeCADDocument(win,{directory,files})};
 if(process.env.FORMNARO_VERIFY_FEATURE_REFERENCES_ONLY==='1')return {ok:true,checks:await require('./ai-feature-references-verification.cjs').verifyFeatureReferences(win,{directory,files}),cloudRequests:0};
 if(process.env.FORMNARO_VERIFY_MULTIVIEW_ONLY==='1')return {ok:true,checks:await require('./photo-multiview-verification.cjs').verifyPhotoMultiView(win,{directory,files}),cloudRequests:0};
 if(process.env.FORMNARO_VERIFY_PERSPECTIVE_ONLY==='1')return {ok:true,checks:await require('./photo-perspective-verification.cjs').verifyPhotoPerspective(win,{directory}),cloudRequests:0};
 if(process.env.FORMNARO_VERIFY_PHOTO_ONLY==='1')return {ok:true,checks:await require('./photo-assistant-verification.cjs').verifyPhotoAssistant(win,{directory}),cloudRequests:0};
 if(process.env.FORMNARO_VERIFY_PROGRAM_ASSISTANT_ONLY==='1')return {ok:true,checks:await require('./program-assistant-verification.cjs').verifyProgramAssistant(win,{directory}),cloudRequests:0};
 if(process.env.FORMNARO_VERIFY_AI_METER_ONLY==='1')return {ok:true,checks:await require('./ai-meter-verification.cjs').verifyAIMeter(win,{directory}),cloudRequests:0};
 if(process.env.FORMNARO_VERIFY_TASK_EVIDENCE_ONLY==='1')return {ok:true,checks:await require('./ai-task-evidence-verification.cjs').verifyTaskEvidence(win,{directory}),cloudRequests:0};
 if(process.env.FORMNARO_NATIVE_FREECAD_ONLY==='1')return {ok:true,checks:await require('./freecad-python-verification.cjs').verifyFreeCADPython(win,{directory}),cloudRequests:0};
 if(process.env.FORMNARO_ANALYSIS_ONLY==='1')return {ok:true,checks:await require('./ai-workspace-verification.cjs').verifyAIWorkspace(win,{directory}),cloudRequests:0};
 if(process.env.FORMNARO_FREECAD_ONLY==='1')return {ok:true,checks:await require('./freecad-verification.cjs').verifyFreeCAD(win,{directory}),cloudRequests:0};
 const checks=[],calls=[],visualCalls=[],js=code=>win.webContents.executeJavaScript(code),pause=ms=>new Promise(r=>setTimeout(r,ms));let mode='repair',attempt=0;
 const check=(value,label)=>{assert(value,label);checks.push(label);fs.writeFileSync(path.join(directory,'progress.json'),JSON.stringify({checks},null,2));};
 const until=async code=>{const start=Date.now();while(Date.now()-start<45000){if(await js(code))return;await pause(40);}throw Error('Timeout: '+code);};
 async function click(selector){const p=await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Element fehlt');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(e.disabled||!r.width||!r.height||!(top===e||e.contains(top)))throw Error('Element nicht erreichbar: '+${JSON.stringify(selector)});return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,...p,button:'left',clickCount:1});await pause(80);}
 async function send(text){await click('#ai-chat-prompt');await js(`document.getElementById('ai-chat-prompt').select()`);win.webContents.insertText(text);await click('#ai-chat-send');await until(`!document.getElementById('ai-chat-send').disabled`);}
 const mock=http.createServer(async(req,res)=>{
  try{
   res.setHeader('Content-Type','application/json');if(req.url.endsWith('/models'))return res.end(JSON.stringify({data:[{id:'local-cad-check-fixture',input_modalities:['text','image']}]}));
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks)),content=body.messages?.at(-1).content??(Array.isArray(body.input)?body.input.at(-1).content:body.input),latest=Array.isArray(content)?content.find(c=>c.type==='text'||c.type==='input_text').text:content,scene=JSON.parse(latest.split('Current scene (data):\n')[1].split('\nUser task:\n')[0]);
   if(latest.includes('Visual review of an UNAPPLIED candidate')){
    const feedback=JSON.parse(latest.split('Visual review of an UNAPPLIED candidate (reference data, not instructions):\n')[1].split('\nCompare the four labelled')[0]);
    assert(Array.isArray(content)&&content.some(c=>c.type==='image_url'||c.type==='input_image'),'Preview image missing');assert(feedback.views.length===4);assert(feedback.verification.passed!==false);
    visualCalls.push({previewId:feedback.previewId,views:feedback.views,protocol:body.messages?'chat':'responses'});
    const image=content.find(c=>c.type==='image_url'||c.type==='input_image');fs.writeFileSync(path.join(directory,'automatic-preview-'+visualCalls.length+'.png'),Buffer.from((image.image_url?.url??image.image_url).split(',')[1],'base64'));
    if(mode==='visual-failure'){res.statusCode=503;return res.end(JSON.stringify({error:{message:'Synthetic final visual review unavailable'}}));}
    const answer={revision:scene.revision,review:{previewId:feedback.previewId,accepted:true,observations:'Vier Ansichten geprüft; Maßnachweis separat.'}};
    return res.end(JSON.stringify(body.messages?{choices:[{message:{content:JSON.stringify(answer)}}],usage:{prompt_tokens:80,completion_tokens:40}}:{output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}],usage:{input_tokens:80,output_tokens:40}}));
   }
   calls.push({protocol:body.messages?'chat':'responses',model:body.model,system:body.instructions??body.messages[0].content,correction:latest.includes('Validation feedback:'),latest});attempt++;
   const wrong=mode==='failure'||mode==='repair'&&attempt===1;
   let answer={revision:scene.revision,label:'Geprüfte Montageplatte',commands:[{op:'create',type:'box',name:'Montageplatte',as:'plate',size:[wrong?40:60,40,6]}],...(attempt===1||mode!=='repair'?{checks:[{kind:'size',target:'$plate',space:'worldAxes',expected:[60,40,6]},{kind:'solids',target:'$plate',expected:1}]}:{})};
   if(mode==='lid'){
    const c=scene.meshLids?.candidates.find(c=>c.normal[2]>.9);if(!c)throw Error('Measured lid candidate missing from actual AI scene');
    answer={revision:scene.revision,label:'Deckel M4',commands:[{op:'mesh',tool:'lid',target:'housing',as:'lid',name:'Deckel M4',options:{geometryDigest:scene.meshLids.geometryDigest,candidateId:c.candidateId,normal:c.normal,thickness:2.5,lipHeight:1.6,lipWall:1.2,clearance:.25,holeDiameter:4.5}}]};
   }
   if(mode.startsWith('measure')){
    if(attempt===1)answer={revision:scene.revision,analysis:[{id:'opening',engine:'mesh',kind:'lidCatalog',options:{id:'housing'}}]};
    else{
     const data=JSON.parse(latest.split('Local analysis results (read-only model data):\n')[1].split('\nValidation feedback:')[0]),a=data[0].results[0].value,c=a.candidates.find(c=>c.normal[2]>.9);
     answer={revision:scene.revision,label:'Nachgemessener M4-Deckel',commands:[{op:'mesh',tool:'lid',target:'housing',as:'lid',options:{geometryDigest:a.geometryDigest,candidateId:c.candidateId,normal:c.normal}}],checks:[{kind:'solids',target:'$lid',expected:1},...c.fasteners.map(h=>({kind:'clearance',target:'$lid',from:h.center.map((v,k)=>v-3*c.normal[k]),to:h.center.map((v,k)=>v+4*c.normal[k]),diameter:mode==='measure-bad'?6:4.5}))]};
    }
   }
   if(mode==='radial'){
    const queries=Array.from({length:5},(_,i)=>({id:'section'+i,engine:'mesh',kind:'featureCatalog',options:{id:'housing',options:{normal:[0,0,1],planePoint:[0,0,16+i*1.5]}},report:{collection:'profiles',offset:attempt===1?0:1,limit:1}}));
    if(attempt<=2)answer={revision:scene.revision,analysis:queries};
    else{const insert=radialClearanceFixture(attempt===3?.209:.3).insert;answer={revision:scene.revision,label:'Konischer Einsatz mit geprüftem Radialspiel',commands:[{op:'tool',engine:'mesh',as:'plug',operation:{type:'mesh-from-data',mesh:insert.mesh,name:'Konuseinsatz'}}],checks:[{kind:'radialClearance',target:'$plug',other:'housing',from:[0,0,16.5],to:[0,0,23.5],expected:.3,samples:9,tolerance:.01}]};}
   }
   if(mode==='program')answer={revision:scene.revision,label:'Eigene lokale Werkzeugprobe',commands:[{op:'script',name:'Eigener Plattenrechner',modules:{dimensions:'export const size=[48,24,4];'},code:`const dims=await api.importTool('dimensions');await api.run({op:'create',type:'box',as:'plate',size:dims.size,pos:[120,0,2]});const measured=await api.query({engine:'cad',kind:'scene'});await api.run({op:'tool',engine:'cad',as:'copy',operation:{kind:'cadToMesh',target:'$plate',quality:{deflection:.05,angleDegrees:8}}});return {width:measured.objects.find(n=>n.id!=='housing').measures.worldAxisSize[0],window:typeof window,process:typeof process};`}],checks:[{kind:'size',target:'$plate',space:'worldAxes',expected:[48,24,4]}]};
   res.end(JSON.stringify(body.messages?{choices:[{message:{content:JSON.stringify(answer)}}],usage:{prompt_tokens:80,completion_tokens:40}}:{output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}],usage:{input_tokens:80,output_tokens:40}}));
  }catch(error){res.statusCode=500;res.end(JSON.stringify({error:{message:error.message}}));}
 });await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 try{
  const nativeBefore=await js('window.__cadTest.serialize()');
  const bore=await js(`(async()=>{const a=window.__cadTest,p=await a.access.preview({revision:a.controller.revision(),commands:[{op:'create',type:'box',as:'plate',size:[30,30,10],pos:[100,0,5]},{op:'create',type:'cylinder',as:'hole',size:[6,6,14],pos:[100,0,5],solid:false},{op:'group',targets:['$plate','$hole'],as:'bored'}],checks:[{kind:'bore',target:'$bored',from:[100,0,0],to:[100,0,10],diameter:6,minWall:1}]});const actual=p.verification.checks[0].actual,capture=await a.access.inspectPreview(p.previewId);a.access.discard(p.previewId);return {actual,views:capture.views,image:capture.images[0].dataUrl};})()`);
  check(bore.actual.diameter===6&&bore.actual.depth===10&&bore.actual.surroundingMaterial,'Packaged native bore measures actual diameter, cylindrical depth and continuous wall');
  check(bore.views.length===4&&bore.image.startsWith('data:image/png;base64,'),'Uncommitted native candidate produces four isolated labelled views');
  fs.writeFileSync(path.join(directory,'bore-four-views.png'),Buffer.from(bore.image.split(',')[1],'base64'));
  check(await js('window.__cadTest.serialize()')===nativeBefore,'Bore measurement and image capture leave the confirmed project byte-identical');
  for(const protocol of ['responses','chat']){
   mode='repair';attempt=0;await click('#ai-chat-new');
   await js(`window.offlinecadDesktop.saveAISettings({config:{protocol:${JSON.stringify(protocol)},baseUrl:'http://127.0.0.1:${mock.address().port}/v1',model:'local-cad-check-fixture',agentSteps:7,rememberKey:false,bridgeEnabled:false},key:'synthetic-check-key'})`);await js('window.__cadTest.aiUI.chat.refreshModels()');await until(`!document.getElementById('ai-chat-send').disabled`);
   const before=await js('window.__cadTest.serialize()'),undo=await js('window.__cadTest.undoDepth()'),first=calls.length;
   await send('Erstelle eine Platte 60 × 40 × 6 mm.');
   check(attempt===2&&calls.at(-1).correction,protocol+': Wrong but valid geometry triggers exactly one provider correction');
   check(calls.slice(first).every(c=>c.system.includes('CAD-result-checks/1')&&c.system.includes('resultChecks')),protocol+': Trusted CAD rules and result-check contract accompany both requests');
   check(await js('window.__cadTest.serialize()')===before&&await js('window.__cadTest.undoDepth()')===undo,protocol+': Checking and correction preserve the exact confirmed model and history');
   check(await js(`document.getElementById('ai-chat-proposal').textContent.includes('2 Ergebnisprüfungen bestanden')`),protocol+': Actual local verification count is visible in the chat');
   await click('#ai-chat-proposal details summary');check(await js(`document.querySelectorAll('#ai-chat-proposal details li').length===2&&document.getElementById('ai-chat-proposal').textContent.includes('60 × 40 × 6')`),protocol+': Measured requirements and values can be inspected');
   await click('#ai-chat-preview');await until('window.__cadTest.view.groups.preview.children.length>0');check(await js('window.__cadTest.view.groups.preview.children.length>0'),protocol+': Checked candidate is drawn without committing');
   await click('#ai-chat-apply');await until(`document.getElementById('ai-chat-proposal').hidden&&!document.getElementById('ai-chat-send').disabled`);check(await js('window.__cadTest.undoDepth()')===undo+1,protocol+': Explicit Apply creates exactly one Undo');
   await js('window.__cadTest.actions.undo();');await js('window.__cadTest.settled()');check(await js('window.__cadTest.serialize()')===before,protocol+': Undo restores exact original');
   await js('window.__cadTest.actions.redo();');await js('window.__cadTest.settled()');check(await js('window.__cadTest.access.scene().objects.at(-1).measures.worldAxisSize[0]')===60,protocol+': Redo restores the measured 60 mm result');
  }
  check(visualCalls.some(c=>c.protocol==='responses')&&visualCalls.some(c=>c.protocol==='chat'),'Automatic four-view review reaches both real desktop provider transports');
  mode='visual-failure';attempt=0;await click('#ai-chat-new');const warningBefore=await js('window.__cadTest.serialize()'),warningUndo=await js('window.__cadTest.undoDepth()');await send('Erstelle eine Platte; letzten nutzbaren Entwurf auch bei gescheiterter Bildprüfung behalten.');
  await until(`document.getElementById('cad-ai-preview-apply').textContent==='Mit Warnung übernehmen'&&window.__cadTest.view.groups.preview.children.length>0`);
  check(await js(`document.getElementById('ai-chat-apply').textContent==='Mit Warnung übernehmen'&&document.getElementById('ai-chat-proposal').textContent.includes('Synthetic final visual review unavailable')`),'Failed final visual review retains the usable candidate with visible reason and explicit warning acceptance');
  check(await js('window.__cadTest.serialize()')===warningBefore,'Visible final warning candidate is not silently committed');
  fs.writeFileSync(path.join(directory,'final-warning-preview.png'),(await win.webContents.capturePage()).toPNG());
  await click('#cad-ai-preview-apply');await until(`document.getElementById('ai-chat-proposal').hidden`);await js('window.__cadTest.settled()');check(await js('window.__cadTest.undoDepth()')===warningUndo+1,'Final warning candidate can be loaded with one Undo');
  await js('window.__cadTest.actions.undo();');await js('window.__cadTest.settled()');check(await js('window.__cadTest.serialize()')===warningBefore,'Undo restores the exact original after accepting the warning');
  mode='failure';attempt=0;await click('#ai-chat-new');const before=await js('window.__cadTest.serialize()'),undo=await js('window.__cadTest.undoDepth()');await send('Erstelle noch eine Platte mit 60 mm Breite.');
  check(attempt===3&&await js(`!document.getElementById('ai-chat-proposal').hidden&&document.getElementById('ai-chat-apply').textContent==='Mit Fehlern übernehmen'`),'Persistent result mismatch stops after two corrections and offers explicit Apply with errors');
  check(await js('window.__cadTest.serialize()')===before&&await js('window.__cadTest.undoDepth()')===undo,'All rejected candidates preserve model and history');
  await until(`!document.getElementById('cad-ai-preview-banner').hidden&&window.__cadTest.view.groups.preview.children.some(m=>m.material.color.getHexString()==='e93b57')`);
  check(await js(`document.getElementById('cad-ai-preview-apply').textContent==='Mit Fehlern übernehmen'`),'Failed candidate is automatically visible in red with an explicit error-acceptance canvas button');
  const journal=JSON.parse(fs.readFileSync((await js('window.offlinecadDesktop.getAISettings()')).modelingContext.journalFile,'utf8')).entries;
  check(journal.some(row=>row.outcome==='rejected'&&row.code==='AI_RESULT_MISMATCH'&&row.tools.includes('create')),'Retained failed proposal is recorded as rejected with its tools, never as a passed preview');
  check(!journal.some(row=>row.outcome==='preview'&&row.code==='AI_RESULT_MISMATCH'),'Failed verification cannot teach a false passed-preview experience');
  fs.writeFileSync(path.join(directory,'failed-preview.png'),(await win.webContents.capturePage()).toPNG());
  await click('#cad-ai-preview-apply');await until(`document.getElementById('ai-chat-proposal').hidden`);await js('window.__cadTest.settled()');
  check(await js('window.__cadTest.undoDepth()')===undo+1,'Explicit canvas Apply with errors creates one Undo');
  check(await js(`window.__cadTest.access.scene().objects.some(n=>n.measures?.worldAxisSize[0]===40)`),'Failed 40 mm candidate can be loaded as computed');
  check(await js(`window.__cadTest.view.groups.aiErrorMarks.children.length===0&&document.getElementById('cad-ai-preview-banner').hidden`),'Applying clears temporary error marks and canvas banner');
  await js('window.__cadTest.actions.undo();');await js('window.__cadTest.settled()');check(await js('window.__cadTest.serialize()')===before,'Undo after accepting errors restores exact original');
  mode='valid';attempt=0;await click('#ai-chat-new');await send('Erstelle eine weitere Platte 60 × 40 × 6 mm.');
  await js(`window.__cadTest.execute({kind:'batch',commands:[{op:'create',type:'box',size:[2,2,2],pos:[100,0,1]}]})`);await js('window.__cadTest.settled()');const changed=await js('window.__cadTest.serialize()');await click('#ai-chat-apply');
  await until(`!document.getElementById('ai-chat-send').disabled`);check(await js('window.__cadTest.serialize()')===changed&&await js(`document.getElementById('ai-chat-status').textContent.includes('geändert')`),'A checked candidate cannot apply after an intervening project change');await click('#ai-chat-discard');
  await click('#ai-chat-workshop');await until(`!!document.getElementById('ai-commands')`);await js(`document.getElementById('ai-commands').value=JSON.stringify({revision:window.__cadTest.access.scene().revision,commands:[{op:'create',type:'box',as:'manual',size:[12,8,3]}],checks:[{kind:'size',target:'$manual',space:'worldAxes',expected:[12,8,3]}]});document.getElementById('ai-check').click()`);await until(`!!document.querySelector('#ai-result details li')`);
  check(await js(`document.getElementById('ai-result').textContent.includes('1 Ergebnisprüfung bestanden')`),'Manual JSON/external-AI workshop uses the same local result checks');await js(`const e=document.getElementById('ai-commands'),r=JSON.parse(e.value);r.checks[0].expected[0]=13;e.value=JSON.stringify(r);document.getElementById('ai-check').click()`);await until(`document.getElementById('ai-message').textContent.includes('Ergebnisprüfung')`);check(await js(`document.getElementById('ai-apply').textContent==='Mit Fehlern übernehmen'`),'A failed manual check keeps a new candidate with explicit error acceptance');await click('#ai-discard');check(await js(`document.getElementById('cad-ai-preview-banner').hidden&&window.__cadTest.view.groups.preview.children.length===0`),'Discarding manual errors removes the preview and banner');await click('#modal-close');
  mode='valid';attempt=0;await send('Erstelle eine Platte 60 × 40 × 6 mm.');await click('#ai-chat-proposal details summary');win.setSize(1000,760);await pause(200);await js(`document.getElementById('ai-chat-proposal').scrollIntoView({block:'nearest'});window.__cadTest.view.renderReady()`);fs.writeFileSync(path.join(directory,'ai-checks.png'),(await win.webContents.capturePage()).toPNG());
  check(await js(`(()=>{const e=document.getElementById('ai-chat-proposal'),r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})()`),'Result-check display fits a 1000 px window');await click('#ai-chat-discard');
  const housing=JSON.parse(fs.readFileSync(path.join(__dirname,'mesh-lid-fixture.json'),'utf8'));
  await js(`(async()=>{const t=window.__cadTest,p=t.snapshot();p.version=8;p.nodes=[{...${JSON.stringify(housing)},layerId:p.activeLayerId,folderId:p.activeFolderId}];await t.controller.open(p);await t.settled();t.select([{rootId:'housing',path:[]}]);t.view.fit();})()`);
  mode='lid';
  for(const protocol of ['responses','chat']){
   await click('#ai-chat-new');await js(`window.offlinecadDesktop.saveAISettings({config:{protocol:${JSON.stringify(protocol)},baseUrl:'http://127.0.0.1:${mock.address().port}/v1',model:'local-cad-check-fixture',agentSteps:7,rememberKey:false,bridgeEnabled:false},key:'synthetic-check-key'})`);await js('window.__cadTest.aiUI.chat.refreshModels()');await until(`!document.getElementById('ai-chat-send').disabled`);
   const before=await js('window.__cadTest.serialize()'),undo=await js('window.__cadTest.undoDepth()');attempt=0;
   await send('Erstelle einen formangepassten Deckel mit Führungsrand und M4-Zylinderschrauben an den vorhandenen Aufnahmen.');
   check(attempt===1&&await js(`!document.getElementById('ai-chat-proposal').hidden`),protocol+': Measured STL opening and fasteners produce one valid lid proposal');
   check(await js('window.__cadTest.serialize()')===before&&await js('window.__cadTest.undoDepth()')===undo,protocol+': Lid calculation preserves exact source and Undo history');
   check(await js(`document.getElementById('ai-chat-proposal').textContent.includes('2 gemessene Schraubenpositionen')&&document.getElementById('ai-chat-proposal').textContent.includes('4,5 mm')&&document.getElementById('ai-chat-proposal').textContent.includes('noch zu prüfen')`),protocol+': Visible report separates measured screw positions, clearance and pending physical fit');
   const sent=JSON.parse(calls.at(-1).latest.split('Current scene (data):\n')[1].split('\nUser task:\n')[0]);check(!/verts|triangles|contours/.test(JSON.stringify(sent.meshLids)),protocol+': Provider receives measurements and bound identities without source triangles');
   await click('#ai-chat-preview');await until('window.__cadTest.view.groups.preview.children.length>0');check(await js('window.__cadTest.view.groups.preview.children.length>0'),protocol+': Real viewport displays the independent lid candidate');
   win.setSize(1200,850);await pause(150);await js(`document.getElementById('ai-chat-proposal').scrollIntoView({block:'nearest'});window.__cadTest.view.renderReady()`);fs.writeFileSync(path.join(directory,'lid-'+protocol+'.png'),(await win.webContents.capturePage()).toPNG());
   await click('#ai-chat-apply');await until(`document.getElementById('ai-chat-proposal').hidden&&!document.getElementById('ai-chat-send').disabled`);await js('window.__cadTest.settled()');
   check(await js('window.__cadTest.undoDepth()')===undo+1,protocol+': Explicit lid Apply creates exactly one Undo');
   const project=JSON.parse(await js('window.__cadTest.serialize()')),original=JSON.parse(before).nodes[0],lid=project.nodes.find(n=>n.id!=='housing');check(project.nodes.length===2&&JSON.stringify(project.nodes[0])===JSON.stringify(original)&&JSON.stringify(lid.meshSource.sources[0])===JSON.stringify(original),protocol+': Original root and retained original recipe remain exact');
   if(protocol==='chat'){
    fs.writeFileSync(path.join(directory,'lid-project.ocad'),JSON.stringify(project));
    const exported=await js(`(async()=>{const r=await window.__cadTest.controller.exportModel({format:'stl',ids:[${JSON.stringify(lid.id)}]});return Array.from(r.data);})()`);fs.writeFileSync(path.join(directory,'lid.stl'),Buffer.from(exported));
    check(fs.statSync(path.join(directory,'lid.stl')).size>100,protocol+': Actual application exports only the generated lid');
    await js(`(async()=>{await window.__cadTest.controller.open(${JSON.stringify(project)});await window.__cadTest.settled();})()`);check(await js(`window.__cadTest.snapshot().nodes.length===2`),protocol+': Saved lid with source recipe reopens in actual application');
   }
   await js('window.__cadTest.actions.undo();');await js('window.__cadTest.settled()');
   // Opening the saved project adds a separate history entry. Restore the
   // pre-lid project explicitly after checking the original first Apply step.
   if(protocol==='responses')check(await js('window.__cadTest.serialize()')===before,protocol+': Undo restores exact pre-lid project');
   await js(`(async()=>{await window.__cadTest.controller.open(${before});await window.__cadTest.settled();window.__cadTest.select([{rootId:'housing',path:[]}]);})()`);
  }
  for(const protocol of ['responses','chat']){
   mode='program';attempt=0;await click('#ai-chat-new');
   await js(`window.offlinecadDesktop.saveAISettings({config:{protocol:${JSON.stringify(protocol)},baseUrl:'http://127.0.0.1:${mock.address().port}/v1',model:'local-cad-check-fixture',agentSteps:7,rememberKey:false,bridgeEnabled:false},key:'synthetic-check-key'})`);await js('window.__cadTest.aiUI.chat.refreshModels()');await until(`!document.getElementById('ai-chat-send').disabled`);
   const before=await js('window.__cadTest.serialize()'),undo=await js('window.__cadTest.undoDepth()');
   await send('Erstelle eine Platte mit deinem eigenen lokalen Werkzeugmodul.');
   check(attempt===1&&await js(`!document.getElementById('ai-chat-proposal').hidden`),protocol+': Script and imported local tool module complete through actual AI chat');
   check(await js('window.__cadTest.serialize()')===before&&await js('window.__cadTest.undoDepth()')===undo,protocol+': Own computations preserve confirmed project and history');
   check(calls.at(-1).system.includes('programTools')&&!calls.at(-1).system.includes('never invent IDs or use scripts'),protocol+': Provider receives the expanded tool contract without the former script prohibition');
   check(await js(`document.getElementById('ai-chat-proposal').textContent.includes('Lokale Modellberechnung')&&document.getElementById('ai-chat-proposal').textContent.includes('"window": "undefined"')&&document.getElementById('ai-chat-proposal').textContent.includes('"process": "undefined"')`),protocol+': Calculation report shows isolated execution without host globals');
   await click('#ai-chat-preview');await until('window.__cadTest.view.groups.preview.children.length>0');check(await js('window.__cadTest.view.groups.preview.children.length>0'),protocol+': Mixed native and mesh script result appears in actual viewport');
   await click('#ai-chat-apply');await until(`document.getElementById('ai-chat-proposal').hidden&&!document.getElementById('ai-chat-send').disabled`);await js('window.__cadTest.settled()');
   check(await js('window.__cadTest.undoDepth()')===undo+1,protocol+': Complete own-tool workflow creates one Undo');
   await js('window.__cadTest.actions.undo();');await js('window.__cadTest.settled()');check(await js('window.__cadTest.serialize()')===before,protocol+': Undo restores exact model before script and module import');
  }
  for(const protocol of ['responses','chat']){
   mode='measure';attempt=0;await click('#ai-chat-new');await js(`window.offlinecadDesktop.saveAISettings({config:{protocol:${JSON.stringify(protocol)},baseUrl:'http://127.0.0.1:${mock.address().port}/v1',model:'local-cad-check-fixture',agentSteps:7,rememberKey:false,bridgeEnabled:false},key:'synthetic-check-key'})`);await js('window.__cadTest.aiUI.chat.refreshModels()');await until(`!document.getElementById('ai-chat-send').disabled`);
   const before=await js('window.__cadTest.serialize()'),undo=await js('window.__cadTest.undoDepth()');await send('Vermesse die Oeffnung und erstelle den M4-Deckel mit Ergebnispruefungen.');
   check(attempt===2&&!calls.at(-1).correction,protocol+': Read-only analysis feeds real worker measurements back without a validation failure');
   check(await js(`!document.getElementById('ai-chat-proposal').hidden&&document.getElementById('ai-chat-proposal').textContent.includes('3 Ergebnisprüfungen bestanden')`),protocol+': Mesh body and both screw corridors are checked in actual chat');
   check(await js('window.__cadTest.serialize()')===before&&await js('window.__cadTest.undoDepth()')===undo,protocol+': Measurements and checked mesh preview preserve the whole original');
   await click('#ai-chat-apply');await until(`document.getElementById('ai-chat-proposal').hidden&&!document.getElementById('ai-chat-send').disabled`);await js('window.__cadTest.actions.undo();window.__cadTest.settled()');check(await js('window.__cadTest.serialize()')===before,protocol+': Checked mesh Apply remains exactly undoable');
   mode='measure-bad';attempt=0;await click('#ai-chat-new');await send('Pruefe absichtlich einen zu grossen6mm-Korridor am M4-Deckel.');
   check(attempt===4&&await js(`!document.getElementById('ai-chat-proposal').hidden&&document.getElementById('ai-chat-apply').textContent==='Mit Fehlern übernehmen'`),protocol+': Failed mesh corridor keeps the final candidate after two corrections');
   check(await js('window.__cadTest.serialize()')===before&&await js('window.__cadTest.undoDepth()')===undo,protocol+': Failed mesh checks preserve originals and history');
  }
  for(const protocol of ['responses','chat']){
   const source=radialClearanceFixture().source;await js(`(async()=>{const t=window.__cadTest,p=t.snapshot();p.version=8;p.nodes=[{...${JSON.stringify(source)},layerId:p.activeLayerId,folderId:p.activeFolderId}];await t.controller.open(p);await t.settled();t.select([{rootId:'housing',path:[]}]);t.view.fit();})()`);
   mode='radial';attempt=0;await click('#ai-chat-new');await js(`window.offlinecadDesktop.saveAISettings({config:{protocol:${JSON.stringify(protocol)},baseUrl:'http://127.0.0.1:${mock.address().port}/v1',model:'local-cad-check-fixture',agentSteps:7,rememberKey:false,bridgeEnabled:false},key:'synthetic-check-key'})`);await js('window.__cadTest.aiUI.chat.refreshModels()');await until(`!document.getElementById('ai-chat-send').disabled`);
   const before=await js('window.__cadTest.serialize()'),undo=await js('window.__cadTest.undoDepth()'),first=calls.length;await send('Vermesse fünf Konushöhen portionsweise und erstelle einen Einsatz mit mindestens 0,3 mm Radialspiel.');
   check(attempt===4,protocol+': Two paged measurement rounds and one real geometric correction complete in four provider calls');
   const measured=JSON.parse(calls.at(-1).latest.split('Local analysis results (read-only model data):\n')[1].split('\nValidation feedback:')[0]);
   check(measured.length===2&&measured.every(r=>r.results.length===5),protocol+': Five requested slices fit each of two report pages without exceeding feedback limit');
   check(measured[0].results.every(r=>r.value.reportPage.pages[0].nextOffset===1)&&measured[1].results.every(r=>r.value.profiles[0].role==='cavity'),protocol+': Continuation offsets retrieve measured cavity rows instead of silently truncating');
   check(measured[1].results.every(r=>r.value.profiles[0].measurementPlanePoint[2]<r.value.profiles[0].nominalPlanePoint[2]),protocol+': Actual and nominal slice coordinates reach the provider separately');
   check(calls.at(-1).correction&&calls.at(-1).latest.includes('minimumGapLowerBound'),protocol+': The .209 mm insert is rejected and structured radial evidence reaches correction');
   check(await js(`!document.getElementById('ai-chat-proposal').hidden&&document.getElementById('ai-chat-proposal').textContent.includes('Radialspiel-Untergrenze')&&document.getElementById('ai-chat-proposal').textContent.includes('Zwischenhöhen durchgehend geprüft')`),protocol+': Actual chat displays conservative radial bound and continuous height coverage');
   check(await js('window.__cadTest.serialize()')===before&&await js('window.__cadTest.undoDepth()')===undo,protocol+': Both measurement rounds and rejected candidate leave model and Undo exact');
   await click('#ai-chat-preview');await until('window.__cadTest.view.groups.preview.children.length>0');check(await js('window.__cadTest.view.groups.preview.children.length>0'),protocol+': Radial-checked cone is drawn in actual viewport');
   await click('#ai-chat-proposal details summary');await js('window.__cadTest.view.renderReady()');fs.writeFileSync(path.join(directory,'radial-'+protocol+'.png'),(await win.webContents.capturePage()).toPNG());
   await click('#ai-chat-apply');await until(`document.getElementById('ai-chat-proposal').hidden&&!document.getElementById('ai-chat-send').disabled`);await js('window.__cadTest.settled()');check(await js('window.__cadTest.undoDepth()')===undo+1,protocol+': Confirmed radial-checked insert creates one Undo');
   const project=JSON.parse(await js('window.__cadTest.serialize()')),insert=project.nodes.find(n=>n.id!=='housing');check(JSON.stringify(project.nodes[0])===JSON.stringify(JSON.parse(before).nodes[0]),protocol+': Original tapered source remains exact');
   const exported=await js(`(async()=>{const r=await window.__cadTest.controller.exportModel({format:'stl',ids:[${JSON.stringify(insert.id)}]});return Array.from(r.data);})()`);fs.writeFileSync(path.join(directory,'radial-'+protocol+'.stl'),Buffer.from(exported));
   check(calls.slice(first).length===4&&fs.statSync(path.join(directory,'radial-'+protocol+'.stl')).size>100,protocol+': Real application exports checked cone with bounded provider calls');
   await js('window.__cadTest.actions.undo();');await js('window.__cadTest.settled()');check(await js('window.__cadTest.serialize()')===before,protocol+': Undo restores exact source after full radial workflow');
  }
  await click('#ai-chat-new');await js(`(async()=>{const t=window.__cadTest,p=t.snapshot();p.nodes=[];await t.controller.open(p);await t.settled();await t.execute({kind:'batch',commands:[{op:'create',type:'box',size:[20,20,10],name:'Vergleichsvorlage'}]});t.select([]);})()`);await js('window.__cadTest.settled()');
  const surfaceBefore=await js('window.__cadTest.serialize()'),surfaceUndo=await js('window.__cadTest.undoDepth()');
  await click('#ai-chat-workshop');await until(`!!document.getElementById('ai-commands')`);
  await js(`(()=>{const t=window.__cadTest,id=t.snapshot().nodes.at(-1).id;document.getElementById('ai-commands').value=JSON.stringify({revision:t.access.scene().revision,label:'Entwurf mit gemessenen Abweichungsstellen',commands:[{op:'create',type:'box',size:[24,20,10],as:'draft'}],checks:[{kind:'surfaceDeviation',target:'$draft',other:id,expected:.01,maxSamples:200},{kind:'solids',target:'$draft',expected:1}]});document.getElementById('ai-check').click();})()`);
  await until(`!!document.querySelector('#ai-result .ai-error')&&window.__cadTest.view.groups.aiErrorMarks.children.length>0`);await click('#modal-close');
  check(await js(`window.__cadTest.view.groups.aiErrorMarks.children[0].userData.aiErrorMarks.segments.length>0`),'Real bidirectional surface measurements create red point and line markers');
  check(await js(`window.__cadTest.view.groups.aiErrorMarks.children[0].userData.aiErrorMarks.rootIds.length===0`),'Localized surface samples do not falsely color an entire part');
  check(await js('window.__cadTest.serialize()')===surfaceBefore&&await js('window.__cadTest.undoDepth()')===surfaceUndo,'Surface error marks preserve confirmed model and Undo');
  for(const [label,width,height]of [['normal',1060,800],['small',800,640]]){win.setSize(width,height);await pause(160);await js('window.__cadTest.view.fit([],{includePreview:true});window.__cadTest.view.renderReady()');check(await js(`(()=>{const b=document.getElementById('cad-ai-preview-banner'),r=b.getBoundingClientRect(),a=document.getElementById('cad-ai-preview-apply').getBoundingClientRect();return !b.hidden&&r.left>=0&&r.right<=innerWidth&&a.width>0&&a.right<=r.right;})()`),'Error preview banner and acceptance fit '+label+' window');fs.writeFileSync(path.join(directory,'surface-error-'+label+'.png'),(await win.webContents.capturePage()).toPNG());}
  await click('#cad-ai-preview-discard');check(await js(`window.__cadTest.view.groups.aiErrorMarks.children.length===0&&window.__cadTest.view.groups.preview.children.length===0`),'Discard removes localized surface markers and draft');
  check(await js('window.__cadTest.serialize()')===surfaceBefore,'Discard after localized error preview preserves exact model');
  checks.push(...await require('./chatgpt-ui-verification.cjs').verifyChatGPTUI(win,{directory}));
  checks.push(...await require('./reasoning-ui-verification.cjs').verifyReasoningUI(win,{directory}));
  checks.push(...await require('./provider-context-verification.cjs').verifyProviderContext(win));
  if(process.env.FORMNARO_VERIFY_FREECAD==='1')checks.push(...await require('./freecad-verification.cjs').verifyFreeCAD(win,{directory}));
  if(process.env.FORMNARO_VERIFY_ANALYSIS==='1')checks.push(...await require('./ai-workspace-verification.cjs').verifyAIWorkspace(win,{directory}));
  if(process.env.FORMNARO_VERIFY_FREECAD_PYTHON==='1')checks.push(...await require('./freecad-python-verification.cjs').verifyFreeCADPython(win,{directory}));
  return {ok:true,checks,providerCalls:calls.length+visualCalls.length,visualReviews:visualCalls.length,nativeBore:true,syntheticProviderOnly:true,analysisAndMeshChecks:true,meshLid:true,aiProgram:true,radialClearance:true,pagedMeasurements:true,cloudRequests:0};
 }catch(error){fs.writeFileSync(path.join(directory,'failed.png'),(await win.webContents.capturePage()).toPNG());throw error;}finally{mock.closeAllConnections();await new Promise(r=>mock.close(r));}
}
module.exports={verifyAIResultChecks};
