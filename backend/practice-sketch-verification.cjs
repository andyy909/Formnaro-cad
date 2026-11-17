const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

async function verifyPracticeSketchDraft({win,js,directory,before,checks}){
  const editing=process.env.FORMNARO_VERIFY_PRACTICE_SKETCH==='draft-edit';
  const sketch={version:2,kind:'profile',dimensions:{height:'5'},variables:[{name:'breite',value:'60'},{name:'tiefe',value:'40'}],
   elements:[
    {id:'draft-front-private',type:'line',start:['0','0'],end:['breite','0']},
    {id:'draft-right-private',type:'line',start:['breite','0'],end:['breite','tiefe']},
    {id:'draft-back-private',type:'line',start:['breite','tiefe'],end:['0','tiefe']},
    {id:'draft-left-private',type:'line',start:['0','tiefe'],end:['0','0']}
   ],loops:[{id:'draft-outer-private',role:'outer',elements:['draft-front-private','draft-right-private','draft-back-private','draft-left-private']}]};
  const {createCadDrawingSheet}=await import('../src/cad-drawing-data.js');
  const drawings={version:1,sheets:[createCadDrawingSheet({name:'Unbeteiligtes Blatt',sourceIds:[JSON.parse(before.serialized).nodes[0].id]})]};
  const root=await js(`(async()=>{
   const {controller,select,sketchUI,settled}=window.__cadTest;
   const sketch=${JSON.stringify(sketch)};
   let target;
   if(${editing}){
    const prepared=await controller.preview({kind:'batch',commands:[{op:'sketch',name:'Platte für Entwurfsübung',sketch}]});
    const id=prepared.project.nodes.find(node=>node.recipe?.type==='sketch').id;
    controller.apply({revision:prepared.revision,previewId:prepared.previewId});
    controller.apply(await controller.previewDrawings(${JSON.stringify(drawings)}));
    await settled();
    target={rootId:id,path:[]};select([target]);sketchUI.open(true);
   }else sketchUI.openPracticeDraft({sketch});
   const list=document.getElementById('sketch-profile-element');
   list.value='draft-right-private';list.dispatchEvent(new Event('change',{bubbles:true}));
   document.getElementById('sketch-profile-delete').click();
   return target?.rootId??null;
  })()`);
  const config={protocol:'chat',baseUrl:'http://127.0.0.1:9197/v1',model:'local-sketch-fixture',agentSteps:7,rememberKey:false,bridgeEnabled:false};
  await js(`window.offlinecadDesktop.saveAISettings({config:${JSON.stringify(config)},key:'local-fixture'})`);
  const projectState='(()=>{const a=window.__cadTest;return {serialized:a.serialize(),revision:a.controller.revision(),undo:a.undoDepth()};})()';
  const draftState='window.__cadTest.sketchUI.state()?.sketch';
  const original=await js(projectState),draft=await js(draftState);
  assert.equal(draft.elements.length,3);
  assert(!draft.loops[0].elements.includes('draft-right-private'));
  const openPath=await js("document.querySelector('#sketch-board .contour-open')?.getAttribute('d').trim()");
  assert.equal(openPath,'M 0 0 L 60 0 M 60 -40 L 0 -40 L 0 0','The draft view preserves the actual gap instead of drawing a false diagonal');
  let requests=0,failure;
  const originalFetch=global.fetch;
  const click=id=>({kind:'ui',action:'click',target:'ui:id:'+id});
  global.fetch=async(url,options)=>{
   try{
    assert.equal(new URL(url).host,'127.0.0.1:9197');
    const json=value=>new Response(JSON.stringify(value));
    if(String(url).endsWith('/models'))return json({data:[{id:config.model,input_modalities:['text']}]});
    const request=JSON.parse(options.body),system=request.messages[0].content;
    assert.match(system,/supplied draft already open/);
    assert.match(system,/"gapCount":1,"gaps":\[\{"role":"outer","from":\[60,0\],"to":\[60,40\],"distance":40\}\]/);
    assert.match(system,/"name":"breite","target":"ui:id:sketch-variable-value-1"/);
    const sent=JSON.stringify(request);
    assert(!sent.includes('draft-front-private'));
    if(root)assert(!sent.includes(root));
    requests++;
    return json({choices:[{message:{content:JSON.stringify({revision:original.revision,
     assistant:{kind:'practice',plan:{version:1,title:'Offenen Entwurf schließen',actions:[click('sketch-profile-close'),click('sketch-preview'),click('sketch-apply')]}},
     message:'Kontur in der Übung geschlossen.'
    })}}]});
   }catch(error){failure=error;throw error;}
  };
  const ready=(id)=>`(()=>{const n=document.getElementById('${id}');return !!n&&!n.hidden&&!n.disabled;})()`;
  async function until(expression,{error=false}={}){
   const deadline=Date.now()+70000;
   while(!await js(expression)){
    if(failure)throw failure;
    const status=await js("document.querySelector('#sketch-practice-status.ai-error')?.textContent||''");
    if(status&&!error)throw Error(status);
    if(Date.now()>deadline)throw Error(status||expression);
    await new Promise(resolve=>setTimeout(resolve,100));
   }
  }
  async function run(){
   await js(`(()=>{document.getElementById('sketch-practice').open=true;
    document.getElementById('sketch-practice-prompt').value='Hier ist die Kontur noch offen. Zeig mir, wie ich sie schließe.';
    document.getElementById('sketch-practice-start').click();})()`);
   await until(ready('sketch-practice-review'));
   assert.deepEqual(await js(projectState),original);
   assert.deepEqual(await js(draftState),draft);
   await js("document.getElementById('sketch-practice-review').click()");
   await until(ready('sketch-practice-apply'));
   if(editing)assert.match(await js("document.getElementById('sketch-practice-apply').textContent"),/Folgeänderungen/);
   assert.deepEqual(await js(projectState),original);
   assert.deepEqual(await js(draftState),draft);
  }
  try{
   await run();
   await js("document.getElementById('sketch-practice').scrollIntoView({block:'center'});void 0");
   fs.writeFileSync(path.join(directory,'sketch-draft-review.png'),await win.webContents.capturePage().then(image=>image.toPNG()));
   if(editing){
    await js("document.getElementById('sketch-practice-discard').click()");
    await until("document.getElementById('sketch-practice-apply').hidden");
    assert.deepEqual(await js(projectState),original);
    assert.deepEqual(await js(draftState),draft);
    await run();
   }else{
    const setWidth=value=>js(`(()=>{const field=document.getElementById('sketch-variable-value-1');field.value='${value}';field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await setWidth('64');
    await js("document.getElementById('sketch-practice-apply').click()");
    await until("document.querySelector('#sketch-practice-status.ai-error')?.textContent.includes('Ausgangsskizze wurde geändert')",{error:true});
    assert.deepEqual(await js(projectState),original);
    assert.equal((await js(draftState)).variables[0].value,'64');
    await setWidth('60');
    await run();
   }
   await js("document.getElementById('sketch-practice-apply').click()");
   await until("!document.getElementById('modal').open");
   await js('window.__cadTest.settled()');
   const applied=await js(projectState);
   assert.notEqual(applied.revision,original.revision);
   assert.equal(applied.undo,original.undo+1);
   const appliedProject=JSON.parse(applied.serialized),originalProject=JSON.parse(original.serialized);
   const node=appliedProject.nodes.find(node=>root?node.id===root:node.recipe?.type==='sketch');
   assert(node);
   assert.deepEqual(appliedProject.nodes.filter(part=>part.id!==node.id),originalProject.nodes.filter(part=>part.id!==node.id));
   assert.deepEqual(appliedProject.drawings,originalProject.drawings);
   assert.equal(node.stats.solids,1);
   assert(Math.abs(node.stats.volume-12000)<.001);
   assert.equal(node.recipe.sketch.loops[0].elements.length,4);
   assert.deepEqual(node.recipe.sketch.elements.filter(element=>!element.id.startsWith('line-')),
    draft.elements.map(element=>({...element,construction:false})));
   assert.equal(requests,2);
   await js('window.__cadTest.actions.undo()');
   assert.equal((await js(projectState)).serialized,original.serialized);
   await js('window.__cadTest.actions.redo()');
   assert.equal((await js(projectState)).serialized,applied.serialized);
   checks.push('The real editor starts an isolated exercise with the existing open draft and only bounded diagnostics reach the provider',
    'The first plan visibly closes the existing gap; the draft and project remain unchanged through review',
    'Explicit acceptance produces one native 12000 mm³ solid and one reversible project step');
   if(editing)checks.push('Discard restores the parent editor without any project or draft change','An unrelated drawing remains byte-identical after explicit source acceptance');
   else checks.push('Editing only the original draft blocks acceptance even when the project revision is unchanged');
   return {ok:true,editing,requests,volume:node.stats.volume,checks};
  }finally{global.fetch=originalFetch;}
}

module.exports={verifyPracticeSketchDraft};
const {checkPlateOpening}=require('./practice-native-verification-checks.cjs');
async function verifyPracticeSketchRepairMidpoint({js,directory,checks,before,parentSnapshot,livePractice,variant}){
  const live=variant.endsWith('-live'),repair=variant.startsWith('repair');
  const click=id=>({kind:'ui',action:'click',target:'ui:id:'+id});
  const field=(action,id,value)=>({kind:'ui',action,target:'ui:id:'+id,value});
  const sketch={version:2,kind:'profile',dimensions:{height:'5'},variables:[{name:'breite',value:'60'},{name:'tiefe',value:'40'}],
   elements:[
    {id:'front',type:'line',start:['0','0'],end:['breite','0']},
    {id:'right',type:'line',start:['breite','0'],end:['breite','tiefe']},
    {id:'back',type:'line',start:['breite','tiefe'],end:['0','tiefe']},
    {id:'left',type:'line',start:['0','tiefe'],end:['0','0']},
    {id:'bore',type:'circle',center:['breite/2','tiefe/2'],diameter:'8'}
   ],loops:[{id:'outer',role:'outer',elements:['front','right','back','left']},{id:'hole',role:'hole',elements:['bore']}]};
  const prepared=await js(`(async()=>{
   const controller=window.__cadTest.controller,revision=controller.revision();
   const candidate=await controller.preview({kind:'batch',commands:[{op:'sketch',name:'Platte mit Maßbeziehung',sketch:${JSON.stringify(sketch)}}]});
   try{return {revision,project:candidate.project,rootId:candidate.project.nodes.find(node=>node.recipe?.type==='sketch').id};}
   finally{controller.discard(candidate.previewId);}
  })()`);
  const fixture=prepared.project.nodes.find(node=>node.id===prepared.rootId).recipe.sketch;
  const opening=[{kind:'select',targets:['existing-1']},click('edit-sketch-source')];
  const finish=[click('sketch-preview'),click('sketch-apply')];
  const plan={version:1,title:repair?'Konturlücke untersuchen':'Plattenbreite mit Maßbeziehung ändern',actions:[
   ...opening,...(repair?[field('choose','sketch-profile-element','right'),click('sketch-profile-delete'),click('sketch-preview')]:
    [{kind:'ui',action:'set',target:'ui:label:Wert oder Formel · breite',value:'70'},...finish])
  ]};
  let expectedParent=before,result;
  if(live){
   await js(`(async()=>{
    const a=window.__cadTest;
    a.clearPreview();await a.controller.open(${JSON.stringify(prepared.project)});await a.settled();
    a.select([{rootId:${JSON.stringify(prepared.rootId)},path:[]}]);
   })()`);
   expectedParent=await js(parentSnapshot);
   if(!repair)result=await livePractice('Zeig mir im Übungsfenster, wie ich die Breite der ausgewählten Skizzenplatte von 60 auf 70 mm ändere. Ändere das benannte Maß „breite“. Das Loch soll mittig bleiben. Erhalte die vorhandenen Maßformeln, die Tiefe und die übrigen Teile.');
   else{
    result=await livePractice('Öffne die vorhandene bearbeitbare Skizze über „Skizze bearbeiten“ und berechne eine Vorschau. Falls Formnaro einen Fehler meldet, nenne den konkreten Grund und korrigiere die Skizze im selben Übungsfenster. Übernimm die Skizze dort. Erhalte die vorhandenen Maße, die mittige Bohrung und die übrigen Teile.',[],{
    fault:'sketch-gap',quality:{mode:'off',criteria:[{id:'width',source:'Plattenbreite 60 mm',check:{kind:'size',target:'$existing-1',space:'worldAxes',expected:[60,null,null],tolerance:.001}}]}
   });
   const failure=result.attempts.find(attempt=>attempt.injected==='sketch-gap');
   assert(failure,'The fixed CAD fault was actually injected');
   assert.match(failure.reason,/Kontur ist offen/);
   assert.equal(failure.report.failedAction.target,'ui:id:sketch-preview');
   assert.equal(failure.report.quality,undefined);
   assert.deepEqual(failure.report.sketch.gaps,[{role:'outer',from:[60,0],to:[60,40],distance:40}]);
   const wire=JSON.parse(fs.readFileSync(path.join(directory,'vibe-rounds.json'),'utf8'));
   assert(wire.some(round=>round.applicationFeedback?.kind==='practice-step-failed'&&round.applicationFeedback.exerciseRevision===failure.report.revision&&round.images.length),'Same-revision CAD diagnostic and child image reached ACP with optional checks off');
   assert.equal(result.report.quality.items[0].status,'skipped');
   assert(result.report.confirmedCount>failure.report.confirmedCount);
   checks.push('Real Mistral corrects the rejected CAD preview with optional checks off and retains the confirmed child steps');
   }
  }else{
   const first=await js(`window.offlinecadDesktop.startPractice(${JSON.stringify({plan,recovery:'text',projectCopy:{
   revision:prepared.revision,project:prepared.project,selection:[{rootId:prepared.rootId,path:[]}]
   }})})`);
   fs.writeFileSync(path.join(directory,'sketch-first-round.json'),JSON.stringify(first,null,2));
   result=first;
   if(repair){
   assert.equal(first.ok,false);
   assert(first.continuationId);
   assert.equal(first.resultRef,undefined);
   assert.equal(first.report.confirmedCount,4);
   assert.match(first.reason,/Kontur ist offen/);
   assert.deepEqual(first.report.sketch.gaps,[{role:'outer',from:[60,0],to:[60,40],distance:40}]);
   const remaining={version:1,title:'Gemessene Konturlücke schließen',actions:[click('sketch-profile-close'),...finish]};
   result=await js(`window.offlinecadDesktop.continuePractice(${JSON.stringify({id:first.continuationId,plan:remaining})})`);
   fs.writeFileSync(path.join(directory,'sketch-repaired-round.json'),JSON.stringify(result,null,2));
   assert.equal(result.report?.confirmedCount,7,result.reason);
   checks.push('The real preview rejects an internal gap, reports its sketch coordinates and permits continuing in the same editor');
   }
  }
  assert.equal(result.ok,true,result.reason);
  const project=await js(`window.offlinecadDesktop.practiceProjectResult({action:'read',id:${JSON.stringify(result.resultRef)}})`);
  const body=project.nodes.find(node=>node.id===prepared.rootId),actual=body.recipe.sketch;
  const width=repair?60:70;
  const native=await js(`window.__cadTest.controller.describe(${JSON.stringify(project)})`);
  const bounds=native.objects.find(node=>node.id===body.id).worldBounds;
  assert(bounds.size.every((value,i)=>Math.abs(value-[width,40,5][i])<.001));
  assert.equal(body.stats.solids,1);
  assert(Math.abs(body.stats.volume-(width*40-Math.PI*16)*5)<.001);
  if(repair){
   assert.deepEqual(actual.elements.filter(element=>!element.id.startsWith('line-')),fixture.elements.filter(element=>element.id!=='right'));
   const ids=actual.loops[0].elements;
   assert.deepEqual([ids[0],...ids.slice(2)],['front','back','left']);
   const segment=actual.elements.find(element=>element.id===ids[1]);
   assert.deepEqual([segment.start,segment.end],[['breite','0'],['breite','tiefe']]);
   assert.deepEqual(actual.loops[1],fixture.loops[1]);
   checks.push('Only one bridge is inserted between the original neighbours, and its coordinates retain the named formulas');
  }else{
   assert.deepEqual(actual.elements,fixture.elements);
   assert.deepEqual(actual.loops,fixture.loops);
   assert.deepEqual(actual.variables,[{name:'breite',value:'70'},{name:'tiefe',value:'40'}]);
  }
  const clearance=await checkPlateOpening(js,project,body,bounds);
  const after=await js(parentSnapshot);
  for(const key of ['serialized','previewId'])assert.equal(after[key],expectedParent[key]);
  for(const key of ['selection','visiblePreviewRoots'])assert.deepEqual(after[key],expectedParent[key]);
  for(const key of ['undo','redo','previews','revision'])assert.equal(after.state[key],expectedParent.state[key],key);
  checks.push('The native BRep has the expected width, depth, height and analytical volume with a centred through-hole',
   'The exercise preserves the parent model, selection, preview and history');
  return {ok:true,variant,checks,bounds,clearance,volume:body.stats.volume};
}
module.exports.verifyPracticeSketchRepairMidpoint=verifyPracticeSketchRepairMidpoint;

async function verifyPracticeSketchModeRecovery({js,directory,checks,before,parentSnapshot,liveDomain,livePractice,comparisonPolicy,variant}){
  const modeRecovery=variant==='mode-recovery';
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

module.exports.verifyPracticeSketchModeRecovery=verifyPracticeSketchModeRecovery;
