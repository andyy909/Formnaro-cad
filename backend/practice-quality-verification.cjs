const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');

async function verifyPracticeQuality({js,directory,before,parentSnapshot,checks,liveDomain,livePractice}){
 const variant=process.env.FORMNARO_VERIFY_PRACTICE_QUALITY;
 const quality={mode:variant==='off'?'off':variant==='report'?'report':'enforce',criteria:[
  {id:'width',source:'Vorgegebene 44 mm ± 0,01 mm',check:{kind:'size',target:'$existing-1',space:'worldAxes',expected:[44,null,null],tolerance:.01}},
  {id:'solids',source:'Genau ein Volumenkörper gefordert',check:{kind:'solids',target:'$existing-1',expected:1}}
 ],...(variant==='all'?{}:{enabled:['width']})};
 const step=value=>({kind:'set',field:'size-0',value});
 const plan=value=>({version:1,title:'Breite des Halters prüfen',actions:[{kind:'select',targets:['existing-1']},step(value)]});
 const root=JSON.parse(before.serialized).nodes[0].id;
 if(liveDomain==='quality'){
  const result=await livePractice('Zeig mir im Übungsfenster, wie du die Breite des ausgewählten Halters auf genau 44 mm änderst. Lass die anderen Abmessungen unverändert. Wenn ein Messbefund abweicht, nenne Soll und Ist und korrigiere die Breite im selben Übungsfenster.',[],{quality,fault:'width-42'});
  const failure=result.attempts.find(attempt=>attempt.injected==='width-42');
  assert(failure,'The fixed 42 mm discrepancy was actually injected');
  assert.equal(failure.report.quality.blocked,true);
  const [first]=failure.report.quality.items;
  assert.equal(first.status,'failed');assert.equal(first.expected[0],44);assert.equal(first.tolerance,.01);
  assert(Math.abs(first.actual[0]-42)<.001);
  const wire=JSON.parse(fs.readFileSync(path.join(directory,'vibe-rounds.json'),'utf8'));
  assert(wire.some(round=>round.applicationFeedback?.kind==='practice-quality-blocked'&&round.applicationFeedback.exerciseRevision===first.revision),'The blocked result reaches ACP on the measured revision');
  const [last]=result.report.quality.items;
  assert.equal(last.status,'passed');assert.notEqual(last.revision,first.revision);
  assert(result.report.confirmedCount>failure.report.confirmedCount);
  const project=await js(`window.offlinecadDesktop.practiceProjectResult({action:'read',id:${JSON.stringify(result.resultRef)}})`);
  const scene=await js(`window.__cadTest.controller.describe(${JSON.stringify(project)})`);
  const size=scene.objects.find(object=>object.id===root).worldBounds.size;
  const originalScene=await js('window.__cadTest.controller.describe()');
  const originalSize=originalScene.objects.find(object=>object.id===root).worldBounds.size;
  assert(Math.abs(size[0]-44)<.001&&size.slice(1).every((value,i)=>Math.abs(value-originalSize[i+1])<.001));
  assert.deepEqual(project.nodes.filter(node=>node.id!==root),JSON.parse(before.serialized).nodes.filter(node=>node.id!==root));
  const after=await js(parentSnapshot);
  for(const key of ['serialized','previewId'])assert.equal(after[key],before[key]);
  for(const key of ['selection','visiblePreviewRoots'])assert.deepEqual(after[key],before[key]);
  for(const key of ['undo','redo','previews','revision'])assert.equal(after.state[key],before.state[key],key);
  checks.push('Actual Mistral reply repairs the fixed 42 mm discrepancy to 44 mm after native policy feedback in the same child');
  return {ok:true,variant,checks,size,first,last};
 }
 if(variant.startsWith('freecad')){
  const independent={mode:'enforce',criteria:[
   {id:'geometry',source:'Independent STEP solid validity',check:{kind:'freecad',target:'$existing-1'}}
  ]};
  const result=await js(`(async()=>{
   const controller=window.__cadTest.controller;
   return window.offlinecadDesktop.startPractice({plan:${JSON.stringify(plan(44))},quality:${JSON.stringify(independent)},
    projectCopy:{revision:controller.revision(),project:await controller.transactions.materialize(),selection:[{rootId:${JSON.stringify(root)},path:[]}]}});
  })()`);
  fs.writeFileSync(path.join(directory,'check-report.json'),JSON.stringify(result,null,2));
  assert.equal(result.ok,true,result.reason);
  assert(result.resultRef);
  const [item]=result.report.quality.items;
  assert.equal(item.status,variant==='freecad'?'passed':'unavailable',JSON.stringify(item));
  assert.equal(result.report.quality.blocked,false);
  if(variant==='freecad')assert.deepEqual(item.actual,{valid:true,closed:true,solids:1,check:'passed'});
  else assert(item.code&&item.actual===null);
  const after=await js(parentSnapshot);
  assert.equal(after.serialized,before.serialized);
  assert.deepEqual(after.visiblePreviewRoots,before.visiblePreviewRoots);
  for(const key of ['undo','redo','previews','revision'])assert.equal(after.state[key],before.state[key],key);
  checks.push(variant==='freecad'?'Real FreeCAD import independently checks the exact child CAD root without applying it':
   'Missing independent runtime is reported separately from a geometric mismatch');
  return {ok:true,variant,checks,item};
 }
 if(variant==='reject'){
  const result=await js(`(async()=>{
   const controller=window.__cadTest.controller;
   return window.offlinecadDesktop.startPractice({plan:${JSON.stringify(plan(42))},quality:${JSON.stringify(quality)},
    projectCopy:{revision:controller.revision(),project:await controller.transactions.materialize(),selection:[{rootId:${JSON.stringify(root)},path:[]}]}});
  })()`);
  fs.writeFileSync(path.join(directory,'check-report.json'),JSON.stringify(result,null,2));
  assert.equal(result.ok,false);
  assert.equal(result.resultRef,undefined);
  assert.equal(result.report.quality.blocked,true);
  assert.equal(result.report.quality.items[0].status,'failed');
  assert(Math.abs(result.report.quality.items[0].actual[0]-42)<.00001);
  if(process.env.FORMNARO_VERIFY_PRACTICE_EVIDENCE==='1'){
   const auditRoot=path.join(directory,'child-audit');
   const sessions=fs.readdirSync(auditRoot);
   assert.equal(sessions.length,1);
   const revision=result.report.quality.revision;
   const audit=JSON.parse(fs.readFileSync(path.join(auditRoot,sessions[0],`round-0-${revision}.json`),'utf8'));
   assert.equal(audit.stage,'blocked');
   assert.equal(audit.revision,revision);
   assert.equal(audit.sha256,createHash('sha256').update(JSON.stringify(audit.project)).digest('hex'));
   const auditedScene=await js(`window.__cadTest.controller.describe(${JSON.stringify(audit.project)})`);
   assert(Math.abs(auditedScene.objects.find(object=>object.id===root).worldBounds.size[0]-42)<.001);
   checks.push('The isolated, revision-bound copy of the blocked result can be independently measured');
  }
  const after=await js(parentSnapshot);
  assert.equal(after.serialized,before.serialized);
  assert.deepEqual(after.visiblePreviewRoots,before.visiblePreviewRoots);
  for(const key of ['undo','redo','previews','revision'])assert.equal(after.state[key],before.state[key],key);
  checks.push('Enforced measurement mismatch provides no adoptable reference and leaves parent untouched');
  return {ok:true,variant,checks};
 }
 const config={protocol:'chat',baseUrl:'http://127.0.0.1:9197/v1',model:'local-practice-fixture',agentSteps:7,rememberKey:false,bridgeEnabled:false};
 const reports=[];
 let requests=0,fixtureFailure;
 const originalFetch=global.fetch;
 global.fetch=async(url,options)=>{
  try{
   assert.equal(new URL(url).host,'127.0.0.1:9197');
   const json=value=>new Response(JSON.stringify(value));
   if(String(url).endsWith('/models'))return json({data:[{id:config.model,input_modalities:['text']}]});
   const request=JSON.parse(options.body);
   const message=request.messages.at(-1).content;
   assert(!JSON.stringify(request).includes(root),'Stable parent root ID remains private');
   let response={revision:before.state.revision,assistant:{kind:'practice',plan:plan(42)},message:'Prüfübung fertig.'};
   if(requests++){
    assert.equal(requests,2);
    const report=JSON.parse(message.split('Validation feedback:\n')[1]);
    assert.equal(report.kind,variant==='report'?'practice-quality-advisory':'practice-quality-blocked');
    assert.equal(report.confirmedCount,2);
    assert.equal(report.quality.blocked,variant!=='report');
    const [width,solids]=report.quality.items;
    assert.equal(width.target,'$existing-1');
    assert(Math.abs(width.actual[0]-42)<.00001);
    assert.equal(width.expected[0],44);
    assert.equal(width.tolerance,.01);
    assert.equal(width.status,'failed');
    assert.match(width.revision,/^[a-f0-9]{16}$/);
    assert.equal(solids.status,variant==='all'?'passed':'skipped');
    reports.push(report);
    response=variant==='report'?{message:'Prüfübung fertig. Messhinweis bleibt sichtbar.'}:
     {...response,assistant:{kind:'practice',plan:{version:1,title:'Breite korrigieren',actions:[step(44)]}}};
   }else assert(!message.includes('Vorgegebene 44 mm ±'),'Private expectation metadata is held until execution');
   return json({choices:[{message:{content:JSON.stringify(response)}}]});
  }catch(error){fixtureFailure=error;throw error;}
 };
 try{
  await js(`window.offlinecadDesktop.saveAISettings({config:${JSON.stringify(config)},key:'local-fixture'})`);
  await js('window.__cadTest.aiUI.chat.refreshModels()');
  await js(`(async()=>{
   window.__cadTest.setPracticeQuality(${JSON.stringify(quality)});
   window.__cadTest.select([{rootId:${JSON.stringify(root)},path:[]}]);
   document.getElementById('ai-chat-practice-from-project').click();
   document.getElementById('ai-chat-prompt').value='Zeige im Übungsfenster, wie dieser Halter auf 44 mm Breite geändert wird.';
   document.getElementById('ai-chat-form').requestSubmit();
  })()`);
  const limit=Date.now()+85000;
  async function until(expression){
   while(!await js(expression)){
    if(fixtureFailure)throw fixtureFailure;
    if(Date.now()>limit)throw Error(await js("document.getElementById('ai-chat-status').textContent")||expression);
    await new Promise(resolve=>setTimeout(resolve,100));
   }
  }
  await until("!!document.getElementById('ai-chat-practice-review')&&!window.__cadTest.aiUI.isBusy()");
  const expectedWidth=['off','report'].includes(variant)?42:44;
  assert.equal(requests,variant==='off'?1:2);
  const card=await js("document.getElementById('ai-chat-practice-result').textContent");
  assert.match(card,variant==='off'?/width · übersprungen/:variant==='report'?/width · abweichend/:/width · bestanden/);
  assert.match(card,variant==='all'?/solids · bestanden/:/solids · übersprungen/);
  const after=await js(parentSnapshot);
  assert.equal(after.serialized,before.serialized);
  assert.deepEqual(after.visiblePreviewRoots,before.visiblePreviewRoots);
  for(const key of ['undo','redo','previews','revision'])assert.equal(after.state[key],before.state[key],key);
  await js("window.__cadTest.clearPreview();document.getElementById('ai-chat-practice-review').click()");
  await until("!document.getElementById('cad-ai-preview-banner').hidden&&!window.__cadTest.aiUI.isBusy()");
  assert.equal(await js('window.__cadTest.serialize()'),before.serialized);
  await js("document.getElementById('cad-ai-preview-apply').click()");
  await until("document.getElementById('cad-ai-preview-banner').hidden&&!window.__cadTest.aiUI.isBusy()");
  const actual=await js(`(async()=>{const scene=await window.__cadTest.controller.describe();
   return scene.objects.find(object=>object.id===${JSON.stringify(root)}).worldBounds.size[0];})()`);
  assert(Math.abs(actual-expectedWidth)<.001);
  assert.equal(await js('window.__cadTest.undoDepth()'),before.state.undo+1);
  await js('window.__cadTest.actions.undo()');
  assert.equal(await js('window.__cadTest.serialize()'),before.serialized);
  checks.push('Normal chat retained the configured fixed policy across the same actual wrong 42 mm result',
   'Evidence distinguishes omitted, advisory and enforced measurements',
   'Candidate only adopted after user UI confirmation, and Undo restores the original project');
  return {ok:true,variant,requests,checks,actual,reports};
 }finally{global.fetch=originalFetch;}
}

module.exports={verifyPracticeQuality};
