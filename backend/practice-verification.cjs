const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {checkPlateOpening}=require('./practice-native-verification-checks.cjs');
exports.verifyPractice=async(win,{directory})=>{
 const js=s=>win.webContents.executeJavaScript(s),checks=[];
 await js('window.__cadTest.aiUI.openChat()');
 await js(`(async()=>{document.getElementById('ai-chat-options').click();await new Promise(requestAnimationFrame);document.getElementById('ai-chat-practice').scrollIntoView({block:'center',behavior:'instant'});})()`);
 assert.equal(await js("document.getElementById('ai-chat-options-dialog').open"),true);

 await js("document.getElementById('ai-chat-prompt').value='Eine Platte zeigen';void 0");
 const readButton=()=>js(`(()=>{const b=document.getElementById('ai-chat-practice'),r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,text:b.textContent,title:b.title,type:b.type,disabled:b.disabled,log:document.getElementById('ai-chat-log').textContent};})()`);
 const usable=button=>button.width>40&&button.height>10&&!button.disabled;
 const readyDeadline=Date.now()+5000;
 let button=await readButton();
 while(!usable(button)&&Date.now()<readyDeadline){
  await new Promise(resolve=>setTimeout(resolve,50));
  button=await readButton();
 }
 assert.equal(button.text,'Übungsmodus');assert.equal(button.type,'button');
 assert(usable(button),`Übungsmodus button must be visible and usable (width ${button.width}, height ${button.height}, disabled ${button.disabled})`);
 assert.match(button.title,/getrennten Übungsfenster/);
 fs.writeFileSync(path.join(directory,'chat-practice-button.png'),await win.webContents.capturePage().then(image=>image.toPNG()));
 win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(button.x),y:Math.round(button.y)});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:Math.round(button.x),y:Math.round(button.y)});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:Math.round(button.x),y:Math.round(button.y)});
 let afterClick;const buttonDeadline=Date.now()+5000;do{afterClick=await js("({prompt:document.getElementById('ai-chat-prompt').value,log:document.getElementById('ai-chat-log').textContent})");if(afterClick.prompt==='Zeige im Übungsmodus: Eine Platte zeigen')break;await new Promise(r=>setTimeout(r,50));}while(Date.now()<buttonDeadline);assert.equal(afterClick.prompt,'Zeige im Übungsmodus: Eine Platte zeigen');assert.equal(afterClick.log,button.log,'Button must not submit a message');
 assert.equal(await js("document.getElementById('ai-chat-options-dialog').open"),false);
 await js('window.__cadTest.aiUI.chat.setBusy(true)');assert.equal(await js("document.getElementById('ai-chat-practice').disabled"),true,'Button must be disabled while busy');await js('window.__cadTest.aiUI.chat.setBusy(false)');checks.push('Parent practice button prefixes without sending and is disabled while busy');
 await js("document.getElementById('ai-chat-prompt').value='';void 0");
 const fixedBase=process.env.FORMNARO_VERIFY_PRACTICE_BASE_FIXTURE;
 const drawingVariant=process.env.FORMNARO_VERIFY_PRACTICE_DRAWING;
 const drawingCase=['1','create-live','update-live'].includes(drawingVariant);
 const drawingSize=[20,26,32];
 if(drawingCase){
  await js(`(async()=>{
   const a=window.__cadTest,controller=a.controller;
   const preview=await controller.preview({kind:'batch',commands:[{op:'create',type:'box',name:'Halter',size:${JSON.stringify(drawingSize)}}]});
   await controller.apply(preview);await a.settled();
  })()`);
 }else if(fixedBase){
  const {parseCadProject}=await import('../src/cad-project.js');
  const project=parseCadProject(fs.readFileSync(fixedBase,'utf8'));
  await js(`(async()=>{const a=window.__cadTest;await a.controller.open(${JSON.stringify(project)});await a.settled();a.select([]);})()`);
 }else{
  await js("window.__cadTest.addShape('box');void 0");await js('window.__cadTest.settled()');await js("window.__cadTest.addShape('cylinder');void 0");await js('window.__cadTest.settled()');await js('window.__cadTest.actions.undo()');
 }
 if(['adopt','lost','uncertain'].includes(process.env.FORMNARO_VERIFY_PRACTICE_COPY)){
  await js("window.__cadTest.addShape('cylinder');void 0");
  await js('window.__cadTest.settled()');
 }
 await js("window.__practiceCandidate=null;window.__cadTest.controller.preview({kind:'batch',commands:[{op:'create',type:'sphere',size:[12,12,12]}]}).then(p=>window.__practiceCandidate=p);void 0");
 const deadline=Date.now()+30000;while(!await js('!!window.__practiceCandidate')){if(Date.now()>deadline)throw Error('Parent preview timeout');await new Promise(r=>setTimeout(r,50));}
 await js('window.__cadTest.showPreview(window.__practiceCandidate)');
 const parentSnapshot="(()=>{const p=window.__cadTest.view.groups.preview,visible=[];p.traverse(n=>{let shown=!!n.geometry;for(let a=n;a&&a!==p.parent;a=a.parent)shown=shown&&a.visible;if(shown)visible.push({id:n.uuid,geometry:n.geometry.uuid,root:n.userData.rootId??null});});return {serialized:window.__cadTest.serialize(),state:window.__cadTest.controller.state(),selection:window.__cadTest.selection(),previewId:window.__practiceCandidate.previewId,visiblePreviewRoots:visible.sort((a,b)=>a.id.localeCompare(b.id))};})()";
 const before=await js(parentSnapshot);assert(before.visiblePreviewRoots.length>0,'Parent preview must contain visible geometry');fs.writeFileSync(path.join(directory,'parent-preview-before.png'),await win.webContents.capturePage().then(image=>image.toPNG()));
 const toolVariant=process.env.FORMNARO_VERIFY_PRACTICE_TOOL;
 if(['holder-chat','holder-mistral'].includes(toolVariant))return require('./practice-tool-verification.cjs').verifyHolderChat({js,directory,checks,live:toolVariant==='holder-mistral'});
 const liveDomain=process.env.FORMNARO_VERIFY_PRACTICE_LIVE;
 const livePractice=(prompt,files,options)=>require('./practice-vibe-verification.cjs').runPracticeLive({js,directory,prompt,files,...options});
 const comparisonPolicy=(criteria,selected)=>require('./practice-vibe-verification.cjs').practiceComparisonPolicy(criteria,selected);
 if(['shell','align','mirror','pattern','motion','holder'].includes(toolVariant)){
  return require('./practice-tool-verification.cjs').verifyPracticeTool({js,directory,variant:toolVariant,before,parentSnapshot,checks});
 }
 if(['1','multi','open'].includes(process.env.FORMNARO_VERIFY_PRACTICE_STL)){
  return require('./practice-stl-verification.cjs').verifyPracticeStl({js,directory,checks,before,parentSnapshot,liveDomain,livePractice,comparisonPolicy,variant:process.env.FORMNARO_VERIFY_PRACTICE_STL});
 }
 if(['prepared','files','conflict','unscaled'].includes(process.env.FORMNARO_VERIFY_PRACTICE_MULTIVIEW)){
  return require('./practice-photo-verification.cjs').verifyPracticeMultiview({js,directory,checks,before,parentSnapshot,liveDomain,livePractice,comparisonPolicy});
 }
 if(['1','perspective'].includes(process.env.FORMNARO_VERIFY_PRACTICE_PHOTO)){
  return require('./practice-photo-verification.cjs').verifyPracticePhoto({js,directory,checks,before,parentSnapshot,liveDomain,livePractice,comparisonPolicy});
 }
 if(['off','report','enforce','all','reject','freecad','freecad-unavailable'].includes(process.env.FORMNARO_VERIFY_PRACTICE_QUALITY)){
  return require('./practice-quality-verification.cjs').verifyPracticeQuality({js,directory,before,parentSnapshot,checks,liveDomain,livePractice});
 }
 if(['1','adopt','recover'].includes(process.env.FORMNARO_VERIFY_PRACTICE_FILES_CHAT)){
  return require('./practice-files-verification.cjs').verifyPracticeFilesChat({js,directory,checks,before,parentSnapshot,variant:process.env.FORMNARO_VERIFY_PRACTICE_FILES_CHAT});
 }
 if(drawingCase){
  return require('./practice-drawing-verification.cjs').verifyPracticeDrawing({js,directory,checks,before,parentSnapshot,drawingSize,variant:drawingVariant,livePractice});
 }
 if(['draft','draft-edit'].includes(process.env.FORMNARO_VERIFY_PRACTICE_SKETCH)){
  return require('./practice-sketch-verification.cjs').verifyPracticeSketchDraft({win,js,directory,before,checks});
 }
 if(['repair','midpoint','repair-live','midpoint-live'].includes(process.env.FORMNARO_VERIFY_PRACTICE_SKETCH)){
  return require('./practice-sketch-verification.cjs').verifyPracticeSketchRepairMidpoint({js,directory,checks,before,parentSnapshot,livePractice,variant:process.env.FORMNARO_VERIFY_PRACTICE_SKETCH});
 }
 if(['1','mode-recovery'].includes(process.env.FORMNARO_VERIFY_PRACTICE_SKETCH)){
  const modeRecovery=process.env.FORMNARO_VERIFY_PRACTICE_SKETCH==='mode-recovery';
  const click=id=>({kind:'ui',action:'click',target:'ui:id:'+id});
  const choose=(id,value)=>({kind:'ui',action:'choose',target:'ui:id:'+id,value});
  const plan={version:1,title:'Platte als Linienzug mit Kreisöffnung',actions:[
   {kind:'ui',action:'click',target:'menu:cad'},
   {kind:'ui',action:'click',target:'ui:tool:sketch'},
   click('sketch-profile-enable'),
   choose('sketch-profile-role','outer'),choose('sketch-profile-shape','line'),
   ...[[-30,-20],[30,-20],[30,20],[-30,20]].map(point=>({kind:'sketch-gesture',point})),
   click('sketch-profile-close'),
   choose('sketch-profile-role','hole'),choose('sketch-profile-shape','circle'),
   {kind:'sketch-gesture',point:[0,0],to:[4,0]},
   {kind:'ui',action:'set',target:'ui:label:Extrusionshöhe',value:'5'},
   click('sketch-preview'),click('sketch-apply')
  ]};
  const openingPlan=modeRecovery?{...plan,actions:[...plan.actions.slice(0,2),choose('sketch-kind','profile'),click('sketch-profile-enable')]}:plan;
  let result=liveDomain==='sketch'?await livePractice('Zeig mir im Skizzeneditor eine Platte 60 × 40 mm mit einem mittigen Durchgangsloch Ø8, 5 mm dick. Lass vorhandene Teile unverändert.',[],{quality:comparisonPolicy([
   {id:'size',source:'Vorgegebene Plattenmaße 60 × 40 × 5 mm',check:{kind:'size',target:'$new',space:'worldAxes',expected:[60,40,5],tolerance:.001}},
   {id:'solids',source:'Ein Volumenkörper gefordert',check:{kind:'solids',target:'$new',expected:1}},
   {id:'volume',source:'Analytisches Volumen der Platte mit dem Ø8-Durchgang',check:{kind:'volume',target:'$new',expected:(60*40-Math.PI*16)*5,tolerance:.001}}
  ],['size'])}):await js(`(async()=>{
   const controller=window.__cadTest.controller;
   const revision=controller.revision(),project=await controller.transactions.materialize();
   return window.offlinecadDesktop.startPractice({plan:${JSON.stringify(openingPlan)},recovery:${JSON.stringify(modeRecovery?'text':undefined)},projectCopy:{revision,project,selection:[]}});
  })()`);
  if(modeRecovery){
   const duplicate=result;
   assert.equal(duplicate.ok,false);
   assert.match(duplicate.reason,/Modus Konturen mit Öffnungen ist bereits aktiv/);
   assert.equal(duplicate.report.confirmedCount,3);
   assert(duplicate.continuationId&&!duplicate.resultRef);
   const menu=await js(`window.offlinecadDesktop.continuePractice(${JSON.stringify({id:duplicate.continuationId,plan:{...plan,actions:plan.actions.slice(0,1)}})})`);
   assert.equal(menu.ok,false);
   assert.match(menu.reason,/Skizzeneditor ist bereits offen und verdeckt das CAD-Menü/);
   assert.equal(menu.report.confirmedCount,3);
   assert.equal(menu.report.revision,duplicate.report.revision);
   assert(menu.continuationId&&!menu.resultRef);
   result=await js(`window.offlinecadDesktop.continuePractice(${JSON.stringify({id:menu.continuationId,plan:{...plan,actions:plan.actions.slice(3)}})})`);
   assert.equal(result.report.confirmedCount,plan.actions.length);
   fs.writeFileSync(path.join(directory,'sketch-mode-diagnostics.json'),JSON.stringify([
    {reason:duplicate.reason,report:duplicate.report},{reason:menu.reason,report:menu.report}
   ],null,2));
   checks.push('Both blocked controls name the still-open editor state and the exercise resumes on the same revision');
  }
  fs.writeFileSync(path.join(directory,'sketch-steps.json'),JSON.stringify(result,null,2));
  assert(result.ok,result.reason);
  const project=await js(`window.offlinecadDesktop.practiceProjectResult({action:'read',id:${JSON.stringify(result.resultRef)}})`);
  const originalNodes=JSON.parse(before.serialized).nodes,known=new Set(originalNodes.map(node=>node.id));
  const added=project.nodes.filter(node=>!known.has(node.id));
  assert.deepEqual(project.nodes.filter(node=>known.has(node.id)),originalNodes);
  assert.equal(added.length,1);
  assert.equal(added[0].recipe.type,'sketch');
  assert.equal(added[0].stats.solids,1);
  assert(Math.abs(added[0].stats.volume-(60*40-Math.PI*16)*5)<.001,'Analytical volume for 60×40×5 with Ø8 through-hole');
  const scene=await js(`window.__cadTest.controller.describe(${JSON.stringify(project)})`);
  const bounds=scene.objects.find(node=>node.id===added[0].id).worldBounds,size=bounds.size;
  assert(size.every((v,i)=>Math.abs(v-[60,40,5][i])<.001),'Independent native bounds');
  const clearance=await checkPlateOpening(js,project,added[0],bounds);
  const after=await js(parentSnapshot);
  assert.equal(after.serialized,before.serialized);
  assert.deepEqual(after.selection,before.selection);
  assert.deepEqual(after.visiblePreviewRoots,before.visiblePreviewRoots);
  assert.equal(after.previewId,before.previewId);
  for(const key of ['undo','redo','previews','revision'])assert.equal(after.state[key],before.state[key],key);
  checks.push('Native sketch board clicks form an outer polyline and close it','Native drag creates a circle opening, and height is set through its visible field','Independent analytical volume and native dimensions match the editable sketch','Parent project and history preserved');
  return {ok:true,checks,size,clearance,volume:added[0].stats.volume,...(result.report.quality?{quality:result.report.quality}:{})};
 }
 if(['chat','adopt','stale','lost','uncertain'].includes(process.env.FORMNARO_VERIFY_PRACTICE_COPY)){
  const config={protocol:'chat',baseUrl:'http://127.0.0.1:9197/v1',model:'local-practice-fixture',agentSteps:7,rememberKey:false,bridgeEnabled:false};
  const chosen=JSON.parse(before.serialized).nodes[0];
  let requests=0,fixtureFailure;
  const originalFetch=global.fetch;
  global.fetch=async(url,options)=>{
   try{
    assert.equal(new URL(url).host,'127.0.0.1:9197');
    const json=value=>new Response(JSON.stringify(value));
    if(String(url).endsWith('/models'))return json({data:[{id:config.model,input_modalities:['text']}]});
    const request=JSON.parse(options.body);
    const system=request.messages[0].content;
    assert.match(system,/"alias":"existing-1"/);
    assert(!JSON.stringify(request).includes(chosen.id),'Selected native root ID must remain local');
    const plan={version:1,title:'Übung an der Kopie',actions:[
     {kind:'select',targets:['existing-1']},{kind:'set',field:'size-0',value:44}
    ]};
    requests++;
    return json({choices:[{message:{content:JSON.stringify({revision:before.state.revision,
     assistant:{kind:'practice',plan},message:'Projektübung abgeschlossen.'
    })}}]});
   }catch(error){fixtureFailure=error;throw error;}
  };
  try{
   await js(`window.offlinecadDesktop.saveAISettings({config:${JSON.stringify(config)},key:'local-fixture'})`);
   await js('window.__cadTest.aiUI.chat.refreshModels()');
   await js(`(()=>{
    const cad=window.__cadTest;
    cad.select([{rootId:cad.snapshot().nodes[0].id,path:[]}]);
    document.getElementById('ai-chat-practice-from-project').click();
    document.getElementById('ai-chat-prompt').value='Zeige, wie dieser Körper 44 mm breit wird.';
    document.getElementById('ai-chat-form').requestSubmit();
   })()`);
   const started=Date.now();
   for(;;){
    if(fixtureFailure)throw fixtureFailure;
    const state=await js(`({log:document.getElementById('ai-chat-log').textContent,
     error:document.querySelector('#ai-chat-log .error')?.textContent,
     busy:window.__cadTest.aiUI.isBusy()})`);
    if(state.error)throw Error(state.error);
    if(!state.busy&&state.log.includes('Projektübung abgeschlossen.'))break;
    if(Date.now()-started>45000)throw Error('Projektübung aus dem KI-Chat hat kein Ergebnis geliefert.');
    await new Promise(resolve=>setTimeout(resolve,100));
   }
   assert.equal(requests,1);
   const after=await js(parentSnapshot);
   assert.deepEqual(after,{...before,selection:[{rootId:chosen.id,path:[]}]});
   checks.push('Project copy opted in through the chat', 'Provider resolves the initial alias and the child confirms the visible 44 mm edit', 'Parent project, history and pending preview preserved');
   if(process.env.FORMNARO_VERIFY_PRACTICE_COPY!=='chat'){
    const waitFor=async(expression)=>{
     const limit=Date.now()+30000;
     while(!await js(expression)){
      if(Date.now()>limit)throw Error(await js("document.getElementById('ai-chat-status').textContent")||expression);
      await new Promise(resolve=>setTimeout(resolve,50));
     }
    };
    await js("window.__cadTest.clearPreview();document.getElementById('ai-chat-practice-review').click()");
    await waitFor("!document.getElementById('cad-ai-preview-banner').hidden&&!window.__cadTest.aiUI.isBusy()");
    assert.equal(await js('window.__cadTest.serialize()'),before.serialized);
    assert.equal(await js('window.__cadTest.undoDepth()'),before.state.undo);
    assert.match(await js("document.getElementById('ai-chat-proposal').textContent"),/Geändert/);
    if(process.env.FORMNARO_VERIFY_PRACTICE_COPY==='stale'){
     await js(`window.__cadTest.controller.execute({kind:'batch',commands:[{op:'create',type:'sphere',size:[9,9,9]}]})`);
     const foreign=await js('window.__cadTest.serialize()');
     assert.notEqual(foreign,before.serialized);
     await js("document.getElementById('cad-ai-preview-apply').click()");
     await waitFor("/Ausgangsprojekt wurde geändert/.test(document.getElementById('ai-chat-status').textContent)");
     assert.equal(await js('window.__cadTest.serialize()'),foreign);
     assert.equal(await js('window.__cadTest.undoDepth()'),before.state.undo+1);
     checks.push('A main-window edit invalidates the finished exercise preview and survives the stale Apply');
     return {ok:true,checks};
    }
    if(process.env.FORMNARO_VERIFY_PRACTICE_COPY==='uncertain'){
     await js(`(()=>{
      const a=window.__cadTest;
      a.access.apply=async()=>{
       await a.controller.execute({kind:'batch',commands:[{op:'create',type:'sphere',name:'Unabhängige Änderung',size:[9,9,9]}]});
       window.__unrelatedChange=a.serialize();throw Error('Injected missing apply response');
      };
      document.getElementById('cad-ai-preview-apply').click();
     })()`);
     await waitFor("/Übernahmestatus unklar/.test(document.getElementById('ai-chat-status').textContent)&&!window.__cadTest.aiUI.isBusy()");
     assert.equal(await js('window.__cadTest.serialize()'),await js('window.__unrelatedChange'));
     assert.equal(await js('window.__cadTest.undoDepth()'),before.state.undo+1);
     assert(await js("document.getElementById('cad-ai-preview-banner').hidden"));
     checks.push('A changed revision without a matching local apply receipt is classified as unclear and cannot be retried blindly');
     return {ok:true,checks};
    }
    const lost=process.env.FORMNARO_VERIFY_PRACTICE_COPY==='lost';
    if(lost){
     await js(`(()=>{
      const a=window.__cadTest,apply=a.access.apply;
      a.access.apply=async()=>{throw Error('Injected interruption before commit');};
      window.__installLostReceipt=()=>{
       a.access.apply=async request=>{await apply(request);throw Error('Injected interruption after commit');};
      };
      document.getElementById('cad-ai-preview-apply').click();
     })()`);
     await waitFor("/Injected interruption before commit/.test(document.getElementById('ai-chat-status').textContent)&&!window.__cadTest.aiUI.isBusy()");
     assert.equal(await js('window.__cadTest.serialize()'),before.serialized);
     assert.equal(await js('window.__cadTest.undoDepth()'),before.state.undo);
     assert(!await js("document.getElementById('cad-ai-preview-banner').hidden"));
     await js('window.__installLostReceipt()');
    }
    await js("document.getElementById('cad-ai-preview-apply').click();document.getElementById('cad-ai-preview-apply').click()");
    await waitFor("document.getElementById('cad-ai-preview-banner').hidden&&!window.__cadTest.aiUI.isBusy()");
    if(lost){
     assert.match(await js("document.getElementById('ai-chat-status').textContent"),/lokale Übernahmebeleg/);
     checks.push('Unchanged model and history permit retry after pre-commit interruption. A lost post-commit reply recovers the matching receipt.');
    }
    assert.equal(await js('window.__cadTest.undoDepth()'),before.state.undo+1);
    const applied=await js('window.__cadTest.serialize()');
    assert.notEqual(applied,before.serialized);
    assert.deepEqual(JSON.parse(applied).nodes.filter(node=>node.id!==chosen.id),JSON.parse(before.serialized).nodes.filter(node=>node.id!==chosen.id));
    const actual=await js(`(async()=>{const scene=await window.__cadTest.controller.describe();return scene.objects.find(node=>node.id===${JSON.stringify(chosen.id)}).worldBounds.size[0]})()`);
    assert(Math.abs(actual-44)<0.001,'Transferred width');
    await js('window.__cadTest.actions.undo()');
    assert.equal(await js('window.__cadTest.serialize()'),before.serialized);
    await js('window.__cadTest.actions.redo()');
    assert.equal(await js('window.__cadTest.serialize()'),applied);
    await js('window.__cadTest.settled()');
    const saved=await js(`window.__cadTest.save({automation:true,expectedRevision:window.__cadTest.controller.revision(),filename:'adopted-practice.ocad',format:'ocad'})`);
    assert(saved.saved);
    const encoded=fs.readFileSync(saved.file.path,'utf8');
    await js(`window.__cadTest.openFile(new File([${JSON.stringify(encoded)}],'adopted-practice.ocad'))`);
    assert.equal(await js('window.__cadTest.serialize()'),applied);
    checks.push('Adoption preview is read-only and names the affected body','Explicit Apply commits once, width is 44 mm and the unrelated body remains identical','Undo, Redo, save and reopen preserve the expected project states');
   }
   return {ok:true,checks};
  }finally{global.fetch=originalFetch;}
 }
 if(process.env.FORMNARO_VERIFY_PRACTICE_COPY==='1'){
  const result=await js(`(async()=>{
   const {controller}=window.__cadTest;
   const revision=controller.revision();
   const project=await controller.transactions.materialize();
   const selection=[{rootId:project.nodes[0].id,path:[]}];
   const plan={version:1,title:'Projektkopie prüfen',actions:[{kind:'ui',action:'point',target:'view:fit'}]};
   return window.offlinecadDesktop.startPractice({plan,projectCopy:{revision,project,selection}});
  })()`);
  assert(result.ok,result.reason);
  assert.equal(result.report.objectCount,JSON.parse(before.serialized).nodes.length);
  assert.equal(result.report.selectionCount,1);
  assert.equal(result.report.revision,before.state.revision);
  const after=await js(parentSnapshot);
  assert.deepEqual(after,before);
  checks.push('Native practice window opens the unsaved copy and restores selection','Parent project, history and pending preview preserved');
  fs.writeFileSync(path.join(directory,'project-copy-evidence.json'),JSON.stringify({checks,result},null,2));
  return {ok:true,checks};
 }
 const plan={version:1,title:'Quader und Bohrung',actions:[{kind:'shape',type:'box',as:'plate'},{kind:'set',field:'size-0',value:40},{kind:'set',field:'size-1',value:30},{kind:'set',field:'size-2',value:6},{kind:'set',field:'pos-0',value:0},{kind:'set',field:'pos-1',value:0},{kind:'set',field:'pos-2',value:3},{kind:'shape',type:'cylinder',as:'hole'},{kind:'set',field:'size-0',value:6},{kind:'set',field:'size-1',value:6},{kind:'set',field:'size-2',value:10},{kind:'set',field:'pos-0',value:0},{kind:'set',field:'pos-1',value:0},{kind:'set',field:'pos-2',value:3},{kind:'role',value:'hole'},{kind:'select',targets:['plate','hole']},{kind:'group',as:'result'}]};
 const original=global.fetch;global.fetch=async()=>{throw Error('No cloud calls allowed during practice verification.');};let result;try{result=await js('window.offlinecadDesktop.startPractice('+JSON.stringify(plan)+')');}finally{global.fetch=original;}fs.writeFileSync(path.join(directory,'practice-result.json'),JSON.stringify(result,null,2));assert(result.ok,'Übungsablauf: '+result.reason);assert.equal(result.steps.length,plan.actions.length);checks.push('Native child UI exercised and every step verified');
 const group=result.steps.find(s=>s.kind==='group'),selectionCheck=result.steps.find(s=>s.kind==='select');assert(selectionCheck.visibilityAndLocksUnchanged,'Object-tree selection must not toggle lock or visibility');assert.equal(group.solids,1);assert(Math.abs(group.volume-(40*30*6-Math.PI*9*6))<.01,'Plate volume and through hole');checks.push('Independent volume oracle, single solid, source preservation and safe object-tree selection');
 const after=await js(parentSnapshot);fs.writeFileSync(path.join(directory,'parent-preview-after.png'),await win.webContents.capturePage().then(image=>image.toPNG()));
 assert.equal(after.serialized,before.serialized);for(const key of ['undo','redo','previews','revision'])assert.equal(after.state[key],before.state[key],key);assert.deepEqual(after.selection,before.selection);assert.equal(after.previewId,before.previewId);assert.deepEqual(after.visiblePreviewRoots,before.visiblePreviewRoots);checks.push('Parent project, selection, undo, redo and visible pending preview preserved');
 fs.writeFileSync(path.join(directory,'parent-evidence.json'),JSON.stringify({checks,before:{...before,serializedLength:before.serialized.length,serialized:undefined},after:{...after,serializedLength:after.serialized.length,serialized:undefined},practice:result},null,2));return {ok:true,checks};
};
