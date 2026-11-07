const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
async function checkPlateOpening(js,project,body,bounds){
 const center=[(bounds.min[0]+bounds.max[0])/2,(bounds.min[1]+bounds.max[1])/2];
 const clearance=await js(`(async()=>{
  const controller=window.__cadTest.controller,preview=await controller.restoreAITaskCandidate(${JSON.stringify(project)});
  try{
   const [x,y]=${JSON.stringify(center)},z=${JSON.stringify(bounds.min[2])};
   const check=x=>controller.checkPreview(preview.previewId,[{kind:'clearance',target:${JSON.stringify(body.id)},
    from:[x,y,z-1],to:[x,y,z+6],diameter:7.99,tolerance:.001}],{collectFailures:true});
   return {center:(await check(x)).passed,shifted:(await check(x-5)).passed};
  }finally{controller.discard(preview.previewId);}
 })()`);
 assert.deepEqual(clearance,{center:true,shifted:false});
 return clearance;
}
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
  const variant=process.env.FORMNARO_VERIFY_PRACTICE_STL;
  const vertices=[[0,0,0],[20,0,0],[20,12,0],[0,12,0],[0,0,6],[20,0,6],[20,12,6],[0,12,6]];
  const triangles=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  const faces=(variant==='open'?triangles.filter((_,i)=>i!==2&&i!==3):triangles)
   .map(triangle=>triangle.map(vertex=>vertices[vertex]));
  if(variant==='multi')faces.push(...faces.map(face=>face.map(([x,y,z])=>[x+35,y,z])));
  const bytes=Buffer.alloc(84+faces.length*50);
  bytes.writeUInt32LE(faces.length,80);
  faces.forEach((face,i)=>face.forEach((vertex,j)=>vertex.forEach((value,k)=>bytes.writeFloatLE(value,96+i*50+j*12+k*4))));
  const base64=bytes.toString('base64');
  const fixtureSha256=createHash('sha256').update(bytes).digest('hex');
  const click=id=>({kind:'ui',action:'click',target:'ui:id:'+id});
  const plan={version:1,title:'STL im Konverter prüfen und übernehmen',actions:[
   click('practice-file-1'),
   ...(variant==='open'?[click('converter-repair'),click('converter-run')]:
    [click('converter-run'),click('converter-import'),click('converter-apply'),click('stl-close')])
  ]};
  const quality=comparisonPolicy([
   {id:'solids',source:'Bekannte Anzahl getrennter STL-Volumenkörper',check:{kind:'solids',target:'$new',expected:variant==='multi'?2:1}},
   {id:'size',source:'Analytische Grenzen der Netzfixture',check:{kind:'size',target:'$new',space:'worldAxes',expected:[variant==='multi'?55:20,12,6],tolerance:.001}},
   {id:'volume',source:'Analytisches Volumen der STL-Quader',check:{kind:'volume',target:'$new',expected:variant==='multi'?2880:1440,tolerance:.001}},
   ...(variant==='multi'?[{id:'gap',source:'Bekannter freier Abstand zwischen den beiden STL-Quadern',check:{kind:'clearance',target:'$new',from:[27,6,-1],to:[27,6,7],diameter:5,tolerance:.001}}]:[])
  ],['solids','size']);
  const stlPrompt=variant==='multi'?'Konvertiere die beiden Teile dieser STL im sichtbaren Konverter in bearbeitbare CAD-Geometrie, ohne sie zusammenzukleben. Erhalte ihre Lage.':
   variant==='open'?'Warum lässt sich dieses STL-Netz nicht sauber konvertieren? Prüfe es im sichtbaren Konverter. Zeig die Reparatur, falls möglich, oder erkläre den tatsächlich gemeldeten Fehler.':
    'Zeig mir, wie ich diese STL im Konverter prüfe und in einen bearbeitbaren CAD-Körper umwandle.';
  const result=liveDomain==='stl'?await livePractice(stlPrompt,[
   {kind:'stl',name:'Quader.stl',mimeType:'model/stl',base64}
  ],{quality,allowNoResult:variant==='open'}):await js(`(async()=>{
   const controller=window.__cadTest.controller;
   const revision=controller.revision(),project=await controller.transactions.materialize();
   return window.offlinecadDesktop.startPractice({plan:${JSON.stringify(plan)},quality:${JSON.stringify(quality)},projectCopy:{revision,project,selection:[]},
    files:[{kind:'stl',name:'Quader.stl',mimeType:'model/stl',base64:${JSON.stringify(base64)}}]});
  })()`);
  fs.writeFileSync(path.join(directory,'stl-steps.json'),JSON.stringify(result,null,2));
  if(variant==='open'&&(liveDomain!=='stl'||!result.resultRef)){
   if(liveDomain!=='stl')assert.equal(result.ok,false);
   const diagnostic=liveDomain==='stl'?result.attempts.find(attempt=>attempt.report?.failedAction?.target==='ui:id:converter-run')?.reason:result.reason;
   assert.match(diagnostic??'',/open|closed|watertight|geschlossen|offen|repair|repar|Solid|topolog/i);
   if(liveDomain==='stl'){
    const reply=JSON.parse(result.reply.trim().replace(/^```(?:json)?\s*|\s*```$/g,''));
    assert.deepEqual(Object.keys(reply),['message'],'A diagnosis concludes without another practice plan');
    if(/6 mm.*0\.15 mm/.test(diagnostic)){
     assert.match(reply.message,/\b6(?:[.,]0+)?\s*mm\b/);
     assert.match(reply.message,/\b0[.,]15\s*mm\b/);
    }else assert.match(reply.message,/open|closed|watertight|geschlossen|offen|repair|repar|Solid|topolog/i);
   }
   assert.equal(result.resultRef,undefined);
   const after=await js(parentSnapshot);
   assert.equal(after.serialized,before.serialized);
   assert.deepEqual(after.visiblePreviewRoots,before.visiblePreviewRoots);
   for(const key of ['undo','redo','previews','revision'])assert.equal(after.state[key],before.state[key],key);
   checks.push('Known open STL is rejected with a real converter diagnostic',
    'The failed run yields no adoptable project result and preserves the parent');
   return {ok:true,checks,diagnostic};
  }
  assert(result.ok,result.reason);
  if(variant==='open')assert(result.attempts.some(attempt=>attempt.steps?.some(step=>step.target==='ui:id:converter-run'&&step.feedback)),
   'The actual local converter provides a successful repair result');
  if(liveDomain!=='stl')assert.equal(result.steps.length,plan.actions.length);
  if(quality&&liveDomain!=='stl')assert(result.report.quality?.items.every(item=>item.status==='passed'),'Every fixed STL criterion must run and pass');
  const verified=await js(`window.offlinecadDesktop.practiceProjectResult({action:'read',id:${JSON.stringify(result.resultRef)}})`);
  const originals=JSON.parse(before.serialized).nodes;
  const added=verified.nodes.filter(node=>!originals.some(original=>original.id===node.id));
  assert.equal(added.length,1);
  assert.equal(added[0].kind,'cad');
  const solids=variant==='multi'?2:1;
  assert.equal(added[0].stats.solids,solids);
  assert(Math.abs(added[0].stats.volume-1440*solids)<.001,'Analytical volume of the rectangular solids');
  const scene=await js(`window.__cadTest.controller.describe(${JSON.stringify(verified)})`);
  const bounds=scene.objects.find(object=>object.id===added[0].id).worldBounds;
  const expected=[variant==='multi'?55:20,12,6],size=bounds.size;
  assert(bounds.min.every(value=>Math.abs(value)<.001),'Preserved placement origin');
  assert(size.every((value,i)=>Math.abs(value-expected[i])<.001),'Independent native CAD bounds');
  let sections;
  if(variant==='multi'){
   const {default:load}=await import('../cad-kernel-build/runtime/formnaro_cad.js');
   const {readCadBrep,transformCad,cadRayHits}=await import('../src/cad-native-kernel.js');
   const oc=await load({print:()=>{},printErr:()=>{}}),source=readCadBrep(oc,added[0].brep.data);
   let world;
   try{
    world=transformCad(oc,source,added[0].transform);
    sections=cadRayHits(oc,world,{origin:[-2,6,3],direction:[1,0,0],far:60}).map(hit=>hit.point[0]).sort((a,b)=>a-b);
    assert.equal(sections.length,4);
    assert(sections.every((value,index)=>Math.abs(value-[0,20,35,55][index])<.001),'Native ray enters and exits both separated solids at their original positions');
   }finally{world?.delete();source.delete();}
  }
  const after=await js(parentSnapshot);
  assert.equal(after.serialized,before.serialized);
  assert.deepEqual(after.selection,before.selection);
  assert.deepEqual(after.visiblePreviewRoots,before.visiblePreviewRoots);
  for(const key of ['undo','redo','previews','revision'])assert.equal(after.state[key],before.state[key],key);
  checks.push('Explicit STL opened in the real local converter and analysed',
   'Native conversion, import preview and approval create a CAD solid in the child',
   'Native bounds and analytical volume independently verified',
   'Parent model, selection, history and visible preview preserved');
  return {ok:true,checks,size,solids,volume:added[0].stats.volume,fixtureSha256,...(sections?{sections}:{}),...(result.report.quality?{quality:result.report.quality}:{})};
 }
 if(['prepared','files','conflict','unscaled'].includes(process.env.FORMNARO_VERIFY_PRACTICE_MULTIVIEW)){
  const variant=process.env.FORMNARO_VERIFY_PRACTICE_MULTIVIEW;
  const live=liveDomain==='multiview';
  const {multiViewFixture}=await import('../tests/photo-multiview-fixtures.mjs');
  const {PHOTO_SET_LABELS}=await import('../src/cad-photo-multiview-data.js');
  const fixture=multiViewFixture({stepped:true,holes:true});
  const click=id=>({kind:'ui',action:'click',target:'ui:id:'+id});
  const enter=(action,id,value)=>({kind:'ui',action,target:'ui:id:'+id,value:String(value)});
  const set=(id,value)=>enter('set',id,value),choose=(id,value)=>enter('choose',id,value);
  const points=values=>({kind:'photo-points',points:values});
  const attachments=fixture.items.map(({reference,image})=>({kind:'photo',name:reference.view+'.png',mimeType:image.mimeType,base64:image.dataUrl.split(',')[1]}));
  const files=variant==='unscaled'?attachments.slice(0,1):variant==='files'?attachments:[];
  const photos=files.length?null:{version:1,items:structuredClone(fixture.items)};
  if(variant==='conflict')photos.items[1].reference.scale.mm=60;
  const calibration=variant==='files'?fixture.items.flatMap(({reference},index)=>[
   click('practice-file-'+(index+1)),...(index?[choose('photo-view',reference.view)]:[]),
   set('photo-mm',reference.scale.mm),set('photo-pick-error',reference.scale.pickErrorPx),points(reference.scale.points),
   click('photo-mode-outline'),points(reference.outline),click('photo-finish'),
   ...reference.holes.flatMap(hole=>[click('photo-mode-hole'),points(hole),click('photo-finish')]),click('photo-save')
  ]):[];
  const sourceItems=photos?.items??fixture.items.map(({reference},index)=>({reference:{...reference,name:files[index]?.name}}));
  const actions=variant==='unscaled'?[click('practice-file-1'),points(fixture.items[0].reference.scale.points),click('photo-save')]:[
   ...calibration,click('photo-project-open'),click('photo-project-multiview'),
   ...sourceItems.map(({reference})=>choose('photo-set-view-'+reference.view,reference.name+' · '+PHOTO_SET_LABELS[reference.view])),
   click('photo-set-through-front'),click('photo-set-step-1'),click('photo-set-fit'),
   set('photo-set-assumptions','Keine weiteren verdeckten Hohlräume; das Vorderfenster geht durch.'),
   ...(variant==='conflict'?[]:['x','y','z'].flatMap(axis=>[
    choose('photo-set-source-'+axis,'user'),set('photo-set-tolerance-'+axis,.001),set('photo-set-note-'+axis,'Vorgegebenes Prüfmaß')
   ])),
   click('photo-set-step-2'),click('photo-set-preview'),...(variant==='conflict'?[]:[click('photo-set-apply'),...(variant==='prepared'?[click('photo-project-close')]:[])])
  ];
  const plan={version:1,title:'Drei vermessene Ansichten verbinden',actions};
  assert(actions.length<=50);
  const corridor=fixture.plan.functionalChecks[0];
  const quality=comparisonPolicy([
   {id:'size',source:'Vorgegebene Maße der drei technischen Ansichten',check:{kind:'size',target:'$new',space:'worldAxes',expected:fixture.expected.dimensions,tolerance:.001}},
   {id:'opening',source:'Unabhängig bekannter freier Durchgang durch das Vorderfenster',check:{kind:'clearance',target:'$new',from:corridor.from,to:corridor.to,diameter:4,tolerance:.001}},
   {id:'volume',source:'Analytische Stufengeometrie mit Öffnung',check:{kind:'volume',target:'$new',expected:fixture.expected.volume,tolerance:.001}},
   {id:'solids',source:'Ein zusammenhängendes Bauteil',check:{kind:'solids',target:'$new',expected:1}}
  ],['size','opening']);
  let expectedParent=before,result;
  if(live){
   if(photos){
    await js(`(async()=>{
     const a=window.__cadTest,project=await a.controller.transactions.materialize();
     project.photos=${JSON.stringify(photos)};a.clearPreview();await a.controller.open(project);await a.settled();a.select([]);
    })()`);
    expectedParent=await js(parentSnapshot);
   }
   const userFiles=photos?attachments.map((file,index)=>({...file,name:photos.items[index].reference.name+'.png'})):files;
   const ready=photos?'Die drei beigefügten Fotos sind im Übungsprojekt bereits kalibriert. Nutze die gespeicherten Referenzen.':'Kalibriere die drei beigefügten Fotos im Übungsfenster und ordne sie den Ansichten zu.';
   const known=`${ready} Rekonstruiere sichtbar aus Vorderansicht X/Z, rechter Ansicht Y/Z und Draufsicht X/Y. Die Außenmaße sind X=40 mm, Y=20 mm, Z=30 mm, jeweils vorgegeben mit Toleranz 0,001 mm. Die bekannte 40-mm-Referenzstrecke ist in jedem Original von Pixel (50,30) bis (450,30). Erhalte die Stufe und das vordere Fenster als Durchgang. Setze den Ursprung bei X=0, Y=0, Z=0. Es gibt keine weiteren verdeckten Innenhohlräume. Prüfe die Vorschau und übernimm den Körper im Übungsfenster.`;
   const prompt=variant==='unscaled'?'Baue dieses Teil im Übungsfenster anhand des beigefügten Fotos maßstäblich nach. Ich habe noch kein Referenzmaß angegeben.':
    variant==='conflict'?'Prüfe die bereits kalibrierten Vorder-, Seiten- und Draufsichten gemeinsam im Übungsfenster. Erkläre mir die konkrete Abweichung, falls ihre Maßstäbe einander widersprechen.':known;
   const configuredBudget=process.env.FORMNARO_VERIFY_PRACTICE_MULTIVIEW_TIMEOUT;
   result=await livePractice(prompt,userFiles,{quality,allowNoResult:['conflict','unscaled'].includes(variant),
    ...(configuredBudget?{timeoutMs:Number(configuredBudget)}:{})});
  }else result=await js(`(async()=>{
   const controller=window.__cadTest.controller;
   const revision=controller.revision(),project=await controller.transactions.materialize();
   if(${!!photos})project.photos=${JSON.stringify(photos)};
   return window.offlinecadDesktop.startPractice({plan:${JSON.stringify(plan)},quality:${JSON.stringify(quality)},projectCopy:{revision,project,selection:[]},files:${JSON.stringify(files)}});
  })()`);
  fs.writeFileSync(path.join(directory,'multiview-steps.json'),JSON.stringify(result,null,2));
  const after=await js(parentSnapshot);
  assert.equal(after.serialized,expectedParent.serialized);
  assert.deepEqual(after.visiblePreviewRoots,expectedParent.visiblePreviewRoots);
  for(const key of ['undo','redo','previews','revision'])assert.equal(after.state[key],expectedParent.state[key],key);
  if(['conflict','unscaled'].includes(variant)){
   if(live){
    assert.equal(result.resultRef,undefined);
    const answer=JSON.parse(result.reply.trim().replace(/^```(?:json)?\s*|\s*```$/g,''));
    const explanation=answer.question??answer.message??'';
    if(variant==='unscaled'){
     assert.match(explanation,/Referenzmaß|Maßstab|bekannte.{0,12}(?:Länge|Abmessung)/i);
     assert.match(explanation,/\?|bitte|benötig|brauch|fehlt/i);
     assert.doesNotMatch(explanation,/\d+(?:[.,]\d+)?\s*mm\b/i,'No unsupported millimetre value is invented');
     checks.push('The live model asks for a scale reference and no adoptable exact model is created');
    }else{
     const diagnostic=result.attempts.find(attempt=>/widersprech|abweich/i.test(attempt.reason??''))?.reason;
     assert(diagnostic,'Actual reconstruction diagnostic was reached');
     assert.match(diagnostic,/Y: right \[0\.00 … 30\.00\].*top \[0\.00 … 20\.00\]/);
     assert.match(diagnostic,/Z: front \[0\.00 … 30\.00\].*right \[0\.00 … 45\.00\]/);
     assert.match(explanation,/widerspr(?:ech|ich|uch|üch)|abweich|inkonsistent|unvereinbar/i);
     const reportsScale=/\b0[.,]10?\b/.test(explanation)&&/\b0[.,]15\b/.test(explanation);
     const reportsReference=/\b40\s*mm\b/.test(explanation)&&/\b60\s*mm\b/.test(explanation)&&/\b400\s*(?:px|Pixel)/i.test(explanation);
     const reportsRanges=[20,30,45].every(mm=>new RegExp('\\b'+mm+'(?:[.,]0+)?\\s*mm\\b','i').test(explanation));
     assert(reportsScale||reportsReference||reportsRanges,'The agent names the measured mismatch in scale, reference length or axis ranges');
     checks.push('The live model explains the actual inconsistency and no adoptable result is created');
    }
    return {ok:true,checks,variant,explanation};
   }
   assert.equal(result.ok,false);
   assert.equal(result.resultRef,undefined);
   assert.equal(result.steps.length,actions.findIndex(action=>action.target==='ui:id:'+(variant==='conflict'?'photo-set-preview':'photo-save')));
   if(variant==='conflict')assert.match(result.reason,/widersprech|abweich/i);
   else assert.match(result.reason,/Referenzmaß/);
   checks.push('Visible native dialog reports the missing scale or incompatible views, with no adoptable CAD result');
   return {ok:true,checks,variant,diagnostic:result.reason};
  }
  assert(result.ok,result.reason);
  if(!live)assert.equal(result.steps.length,actions.length);
  if(quality&&!live)assert(result.report.quality?.items.every(item=>item.status==='passed'),'Every fixed reconstruction criterion must run and pass');
  const steps=live?result.attempts.flatMap(attempt=>attempt.steps??[]):result.steps;
  const preview=steps.findLast(step=>step.reconstruction)?.reconstruction;
  assert.deepEqual(preview,{passed:true,views:['front','right','top'].map(view=>({view,passed:true}))});
  const verified=await js(`window.offlinecadDesktop.practiceProjectResult({action:'read',id:${JSON.stringify(result.resultRef)}})`);
  const saved=verified.photos.reconstructions[0];
  assert(saved.result);
  assert.deepEqual(saved.views.map(v=>v.view),['front','right','top']);
  assert.deepEqual(saved.dimensions.map(d=>[d.mm,d.toleranceMm,d.source]),fixture.expected.dimensions.map(mm=>[mm,.001,'user']));
  const body=verified.nodes.find(node=>node.id===saved.result.rootId);
  assert.equal(body.stats.solids,1);
  assert(Math.abs(body.stats.volume-fixture.expected.volume)<.001,'Native volume includes the confirmed through opening');
  const native=await js(`window.__cadTest.controller.describe(${JSON.stringify(verified)})`);
  const size=native.objects.find(node=>node.id===body.id).worldBounds.size;
  assert(size.every((value,index)=>Math.abs(value-fixture.expected.dimensions[index])<.001));
  assert.deepEqual(verified.photos.items.map(item=>item.image.dataUrl).sort(),fixture.items.map(item=>item.image.dataUrl).sort());
  const clearance=await js(`(async()=>{
   const controller=window.__cadTest.controller;
   const preview=await controller.restoreAITaskCandidate(${JSON.stringify(verified)});
   try{
    const corridor={kind:'clearance',target:${JSON.stringify(body.id)},from:${JSON.stringify(corridor.from)},to:${JSON.stringify(corridor.to)},diameter:4,tolerance:.001};
    const free=await controller.checkPreview(preview.previewId,[corridor],{collectFailures:true});
    const solid=await controller.checkPreview(preview.previewId,[{...corridor,from:[15,-1,7.5],to:[15,21,7.5]}],{collectFailures:true});
    return {free:free.passed,solid:solid.passed};
   }finally{controller.discard(preview.previewId);}
  })()`);
  assert.deepEqual(clearance,{free:true,solid:false},'Opening location independently distinguished from nearby solid');
  assert.equal(await js('window.__cadTest.serialize()'),expectedParent.serialized);
  checks.push('Visible view selection, common dimensions, source and through-hole confirmation reached the native preview',
   'Three reported view checks pass and the saved CAD body has the known native bounds and independent volume',
   'Native probe confirms a 4 mm corridor at the opening and solid material at a nearby position',
   'Original photo bytes and parent project preserved');
  return {ok:true,checks,variant,size,volume:body.stats.volume,clearance,...(result.report.quality?{quality:result.report.quality}:{})};
 }
 if(['1','perspective'].includes(process.env.FORMNARO_VERIFY_PRACTICE_PHOTO)){
  const perspective=process.env.FORMNARO_VERIFY_PRACTICE_PHOTO==='perspective';
  const click=id=>({kind:'ui',action:'click',target:'ui:id:'+id});
  const set=(id,value)=>({kind:'ui',action:'set',target:'ui:id:'+id,value:String(value)});
  const point=([x,y])=>[set('photo-point-x',x),set('photo-point-y',y),click('photo-add-point')];
  const corners=perspective?[[40,35],[265,55],[245,180],[60,165]]:[[40,40],[240,40],[240,140],[40,140]];
  const choose=(id,value)=>({kind:'ui',action:'choose',target:'ui:id:'+id,value});
  const calibration=perspective?[choose('photo-calibration-mode','perspective'),
   set('photo-rectangle-width',50),set('photo-rectangle-height',25),...corners.flatMap(point),click('photo-rectify')]:
   [set('photo-mm',50),...corners.slice(0,2).flatMap(point)];
  const plan={version:1,title:'50-mm-Referenz am Foto vermessen',actions:[
   click('practice-file-1'),...calibration,
   click('photo-mode-outline'),...corners.flatMap(point),click('photo-finish'),
   click('photo-mode-measure'),...corners.slice(1,3).flatMap(point),click('photo-save')
  ]};
  const base64=await js(`(()=>{
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
   const context=canvas.getContext('2d');context.fillStyle='#fbfafa';context.fillRect(0,0,320,240);
   context.fillStyle='#123456';context.beginPath();
   for(const point of ${JSON.stringify(corners)})context.lineTo(...point);
   context.closePath();context.fill();
   return canvas.toDataURL('image/png').split(',')[1];
  })()`);
  const quality=comparisonPolicy([
   {id:'scale',source:'Bekannte 50-mm-Kante über 200 Originalpixel',check:{kind:'photoScale',target:'$photo-1',expected:.25,tolerance:.005}},
   {id:'length',source:'Unabhängig bekannte 25-mm-Kante',check:{kind:'photoLength',target:'$photo-1',measurementIndex:0,expected:25,tolerance:1}}
  ],['scale']);
  const photoPrompt=perspective?'Hilf mir, diese schräge Aufnahme für die Konstruktion zu entzerren. Das ebene Rechteck misst 50 × 25 mm. Kalibriere die vier Ecken, zeige die entzerrte Ansicht, zeichne die Außenkontur nach und miss die rechte kurze Kante. Erkläre die verbleibende Bildunsicherheit und speichere die Fotoreferenz.':
   'Zeig mir, wie ich dieses Foto mit der bekannten oberen 50-mm-Kante maßstäblich verwende. Zeichne die Außenkontur nach und miss die rechte kurze Kante.';
  const detailCheck=process.env.FORMNARO_VERIFY_PRACTICE_PHOTO_DETAIL==='1';
  let result=liveDomain==='photo'?await livePractice(photoPrompt,[
   {kind:'photo',name:'Referenz.png',mimeType:'image/png',base64}
  ],{quality}):await js(`(async()=>{
   const controller=window.__cadTest.controller;
   const revision=controller.revision(),project=await controller.transactions.materialize();
   return window.offlinecadDesktop.startPractice({plan:${JSON.stringify(plan)},quality:${JSON.stringify(quality)},projectCopy:{revision,project,selection:[]},
    ...(${detailCheck}?{recovery:'image'}:{}),files:[{kind:'photo',name:'Referenz.png',mimeType:'image/png',base64:${JSON.stringify(base64)}}]});
  })()`);
  if(detailCheck&&liveDomain!=='photo'){
   assert.equal(result.report.checkpoint,'photo-review');
   assert(result.continuationId&&result.image,'Photo checkpoint returned its actual JPEG');
   const detail=result.report.photoDetail;
   assert.deepEqual(detail.originalPixels,[320,240]);
   assert(detail.extent[0]<320&&detail.extent[1]<240);
   assert.deepEqual(detail.marks.map(m=>m.point),corners.slice(1,3));
   assert(Buffer.from(result.image,'base64').subarray(0,2).equals(Buffer.from([255,216])));
   fs.writeFileSync(path.join(directory,'photo-detail.jpg'),Buffer.from(result.image,'base64'));
   fs.writeFileSync(path.join(directory,'photo-detail.json'),JSON.stringify(detail,null,2));
   const first=result.steps;
   result=await js(`window.offlinecadDesktop.continuePractice(${JSON.stringify({id:result.continuationId,plan:{...plan,actions:[plan.actions.at(-1)]}})})`);
   result.steps=[...first,...result.steps];
  }
  fs.writeFileSync(path.join(directory,'photo-steps.json'),JSON.stringify(result,null,2));
  assert(result.ok,result.reason);
  if(liveDomain!=='photo')assert.equal(result.steps.length,plan.actions.length);
  assert(result.steps.some(step=>step.dialog?.controls.some(control=>control.target==='ui:id:photo-point-x')));
  const verified=await js(`window.offlinecadDesktop.practiceProjectResult({action:'read',id:${JSON.stringify(result.resultRef)}})`);
  assert.equal(verified.photos.items.length,1);
  const {image,reference}=verified.photos.items[0];
  assert.equal(image.dataUrl,'data:image/png;base64,'+base64,'Original image bytes');
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  if(liveDomain==='photo'){
   assert.equal(reference.outline.length,4);
   assert(corners.every(corner=>reference.outline.some(point=>distance(corner,point)<=4)),'Recognized all four contour corners within 4 px');
   assert(corners.slice(0,2).every(corner=>reference.scale.points.some(point=>distance(corner,point)<=4)),'Used the supplied top reference edge');
   assert(corners.slice(1,3).every(corner=>reference.dimensions[0]?.points.some(point=>distance(corner,point)<=4)),'Measured the right edge');
  }else{
   assert.deepEqual(reference.outline,corners);
   assert.deepEqual(reference.scale.points,corners.slice(0,2));
  }
  assert.equal(reference.scale.mm,50);
  assert.equal(reference.dimensions.length,1);
  const dimension=result.steps.findLast(step=>step.photo?.dimensions?.length)?.photo.dimensions[0];
  let mmPerPixel;
  if(perspective){
   assert.equal(reference.version,2);
   if(liveDomain==='photo')assert(reference.perspective.points.every((point,index)=>distance(point,corners[index])<=4),'Calibrated corners are in clockwise order and within 4 px');
   else assert.deepEqual(reference.perspective.points,corners);
   assert.deepEqual(reference.perspective.sizeMm,[50,25]);
   assert.match(result.steps.find(step=>step.target==='ui:id:photo-rectify').feedback,/Entzerrte Ansicht/);
   assert(dimension.uncertaintyMm>0&&dimension.estimate);
   if(liveDomain==='photo'){
    assert([[50,0],[50,25]].every(endpoint=>dimension.planePointsMm.some(point=>distance(point,endpoint)<=1)));
    assert.match(result.reply??'',/Unsicherheit|Schätzung|Schätz|Objektiv|Tiefen|Verzerr/i);
   }else{
    assert(distance(dimension.planePointsMm[0],[50,0])<.00001);
    assert(distance(dimension.planePointsMm[1],[50,25])<.00001);
   }
  }else{
   mmPerPixel=50/distance(...reference.scale.points);
   const measure=distance(...reference.dimensions[0].points)*mmPerPixel;
   if(liveDomain==='photo'){
    assert(Math.abs(mmPerPixel-.25)<=.005,'Reference scale within 0.005 mm/px');
    assert(Math.abs(measure-25)<=1,'Independent right-edge measurement within 1 mm');
   }else{
    assert.equal(mmPerPixel,.25);
    assert.equal(measure,25);
   }
  }
  assert(Math.abs(dimension.mm-25)<=(liveDomain==='photo'?1:.00001),'Right edge of the known 50 by 25 mm target');
  assert.deepEqual(verified.nodes,JSON.parse(before.serialized).nodes);
  const after=await js(parentSnapshot);
  assert.equal(after.serialized,before.serialized);
  assert.deepEqual(after.selection,before.selection);
  assert.deepEqual(after.visiblePreviewRoots,before.visiblePreviewRoots);
  for(const key of ['undo','redo','previews','revision'])assert.equal(after.state[key],before.state[key],key);
  checks.push('Explicit PNG opened in the real measurement dialog and persisted unchanged in the child',
   perspective?'Native inputs calibrate and visibly rectify a skewed 50 × 25 mm rectangle':'Native inputs set the 50 mm reference, close the outline and measure a 25 mm edge',
   perspective?'Measured right-edge endpoints and uncertainty verified in the calibrated plane':'Scale and edge length independently calculated from saved points',
   'Parent model, selection, history and visible preview preserved');
  return {ok:true,checks,mmPerPixel,perspective,dimension,outline:reference.outline,...(result.report.quality?{quality:result.report.quality}:{})};
 }
 if(['off','report','enforce','all','reject','freecad','freecad-unavailable'].includes(process.env.FORMNARO_VERIFY_PRACTICE_QUALITY)){
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
 if(['1','adopt','recover'].includes(process.env.FORMNARO_VERIFY_PRACTICE_FILES_CHAT)){
  const recovery=process.env.FORMNARO_VERIFY_PRACTICE_FILES_CHAT==='recover';
  const adopt=recovery||process.env.FORMNARO_VERIFY_PRACTICE_FILES_CHAT==='adopt';
  const config={protocol:'chat',baseUrl:'http://127.0.0.1:9197/v1',model:'local-practice-fixture',agentSteps:7,rememberKey:false,bridgeEnabled:false};
  const png=await js(`(()=>{const c=document.createElement('canvas');c.width=40;c.height=30;return c.toDataURL();})()`);
  const privateStl='solid isolated-mesh-marker\nendsolid isolated-mesh-marker\n';
  let requests=0,fixtureFailure;
  const originalFetch=global.fetch;
  global.fetch=async(url,options)=>{
   try{
    assert.equal(new URL(url).host,'127.0.0.1:9197');
    const json=value=>new Response(JSON.stringify(value));
    if(String(url).endsWith('/models'))return json({data:[{id:config.model,input_modalities:['text','image']}]});
    const request=JSON.parse(options.body),system=request.messages[0].content;
    assert.match(system,/"target":"ui:id:practice-file-1","name":"Foto.png","kind":"photo"/);
    assert.match(system,/"target":"ui:id:practice-file-2","name":"Netz.stl","kind":"stl"/);
    const sent=JSON.stringify(request);
    assert(sent.includes(png),'Only explicitly selected photo image sent');
    assert(!sent.includes(Buffer.from(privateStl).toString('base64'))&&!sent.includes('isolated-mesh-marker'),'STL contents never sent');
    assert(!sent.includes(JSON.parse(before.serialized).nodes[0].id),'Parent body IDs remain local');
    const click=id=>({kind:'ui',action:'click',target:'ui:id:'+id});
    const set=(id,value)=>({kind:'ui',action:'set',target:'ui:id:'+id,value:String(value)});
    const point=(x,y)=>[set('photo-point-x',x),set('photo-point-y',y),click('photo-add-point')];
    const calibrate=[set('photo-mm',50),...point(4,4),...point(24,4),click('photo-save')];
    let actions=[click('practice-file-1'),...(adopt?calibrate:[click('photo-cancel')])];
    if(recovery){
     if(requests===0)actions=[{kind:'shape',type:'box',as:'work'},click('practice-file-1'),click('photo-save')];
     else{
      const user=request.messages.at(-1).content;
      const correction=user.find(part=>part.type==='text').text;
      if(requests!==1)fs.writeFileSync(path.join(directory,'unexpected-correction.txt'),correction);
      assert.equal(requests,1,'Only one correction requested');
      assert.match(system,/"selectable":\["work"\]/);
      assert.match(correction,/"failedAction":\{"index":3,"kind":"ui","target":"ui:id:photo-save"/);
      assert.match(correction,/"confirmedCount":2/);
      assert.match(correction,/"exerciseRevision":"[a-f0-9]{16}"/);
      assert.match(correction,/ui:id:photo-point-x/);
      assert.match(correction,/"modelImage":"attached"/);
      const screenshot=user.find(part=>part.type==='image_url'&&part.image_url.url.startsWith('data:image/jpeg;base64,'));
      assert(screenshot,'Correction carries an actual child screenshot');
      const jpg=Buffer.from(screenshot.image_url.url.split(',')[1],'base64');
      assert(jpg.length>2000&&jpg[0]===0xff&&jpg[1]===0xd8);
      fs.writeFileSync(path.join(directory,'correction-window.jpg'),jpg);
      fs.writeFileSync(path.join(directory,'correction-feedback.txt'),correction);
      actions=[...calibrate,{kind:'select',targets:['work']},{kind:'set',field:'size-0',value:44}];
     }
    }
    requests++;
    return json({choices:[{message:{content:JSON.stringify({revision:before.state.revision,
     assistant:{kind:'practice',plan:{version:1,title:'Übungsdatei öffnen',actions}},message:'Dateiübung abgeschlossen.'
    })}}]});
   }catch(error){fixtureFailure=error;throw error;}
  };
  try{
   await js(`window.offlinecadDesktop.saveAISettings({config:${JSON.stringify(config)},key:'local-fixture'})`);
   await js('window.__cadTest.aiUI.chat.refreshModels()');
   await js(`(async()=>{
    const input=document.getElementById('ai-chat-practice-file-input'),transfer=new DataTransfer();
    const photo=Uint8Array.from(atob(${JSON.stringify(png.split(',')[1])}),character=>character.charCodeAt(0));
    transfer.items.add(new File([photo],'Foto.png',{type:'image/png'}));
    transfer.items.add(new File([${JSON.stringify(privateStl)}],'Netz.stl',{type:'model/stl'}));
    input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   const limit=Date.now()+100000;
   async function until(expression){
    while(!await js(expression)){
     if(fixtureFailure)throw fixtureFailure;
     if(Date.now()>limit)throw Error(await js("document.getElementById('ai-chat-status').textContent")||expression);
     await new Promise(resolve=>setTimeout(resolve,100));
    }
   }
   await until("document.querySelectorAll('#ai-chat-practice-file-list button').length===2&&!document.getElementById('ai-chat-send').disabled");
   await js(`(()=>{
    if(${adopt}){
     window.__cadTest.select([]);
     document.getElementById('ai-chat-practice-from-project').click();
    }
    document.getElementById('ai-chat-prompt').value='Zeig mir das Foto im Übungsfenster.';
    document.getElementById('ai-chat-form').requestSubmit();
   })()`);
   await until("!window.__cadTest.aiUI.isBusy()&&document.getElementById('ai-chat-log').textContent.includes('Dateiübung abgeschlossen.')");
   assert.equal(requests,recovery?2:1);
   assert.equal(await js("document.querySelectorAll('#ai-chat-practice-file-list button').length"),0);
   const after=await js(parentSnapshot);
   assert.equal(after.serialized,before.serialized);
   assert.deepEqual(after.visiblePreviewRoots,before.visiblePreviewRoots);
   checks.push('Normal chat stages explicit photo and STL files and starts the isolated practice',
    'Simulated provider receives the photo and both descriptors, with no STL payload or parent IDs',
    adopt?'Photo saved in the child with no body selected in the parent':'Child opens the real photo dialog and closes it without saving');
   if(adopt){
    await js("window.__cadTest.clearPreview();document.getElementById('ai-chat-practice-review').click()");
    await until("!document.getElementById('cad-ai-preview-banner').hidden&&!window.__cadTest.aiUI.isBusy()");
    assert.match(await js("document.getElementById('ai-chat-proposal').textContent"),/Geändert · Fotos/);
    assert.equal(await js('window.__cadTest.serialize()'),before.serialized);
    assert.equal(await js('window.__cadTest.undoDepth()'),before.state.undo);
    await js("document.getElementById('cad-ai-preview-apply').click()");
    await until("document.getElementById('cad-ai-preview-banner').hidden&&!window.__cadTest.aiUI.isBusy()");
    assert.equal(await js('window.__cadTest.undoDepth()'),before.state.undo+1);
    const applied=await js('window.__cadTest.serialize()');
    const project=JSON.parse(applied);
    const originals=JSON.parse(before.serialized).nodes;
    assert.deepEqual(project.nodes.filter(node=>originals.some(original=>original.id===node.id)),originals);
    assert.equal(project.nodes.length,originals.length+(recovery?1:0));
    if(recovery){
     const part=project.nodes.find(node=>!originals.some(original=>original.id===node.id));
     const native=await js(`window.__cadTest.controller.describe()`);
     const size=native.objects.find(node=>node.id===part.id).worldBounds.size;
     assert(Math.abs(size[0]-44)<.001,'The body created before the failure still exists and is 44 mm wide');
     checks.push('Failed photo save reports actual fields and a JPEG from the retained child window',
      'Second provider plan uses the still-open dialog and existing alias without repeating successful actions');
    }
    assert.equal(project.photos.items[0].image.dataUrl,png);
    assert.deepEqual(project.photos.items[0].reference.scale.points,[[4,4],[24,4]]);
    await js('window.__cadTest.actions.undo()');
    assert.equal(await js('window.__cadTest.serialize()'),before.serialized);
    await js('window.__cadTest.actions.redo()');
    assert.equal(await js('window.__cadTest.serialize()'),applied);
    checks.push('Adoption preview identifies photos and preserves the parent until confirmed',
     'One Undo step transfers the original photo and calibration, and Redo restores it');
   }
   return {ok:true,checks,requests};
  }finally{global.fetch=originalFetch;}
 }
 if(drawingCase){
  const variant=drawingVariant,live=variant!=='1',creating=variant==='create-live';
  const click=id=>({kind:'ui',action:'click',target:'ui:id:'+id});
  const open={kind:'ui',action:'click',target:'ui:tool:drawing'};
  const plan={version:1,title:'Zeichnungsblatt erstellen und nachführen',actions:[
   {kind:'ui',action:'click',target:'menu:cad'},open,
   click('drawing-title-block'),
   {kind:'ui',action:'set',target:'ui:id:drawing-title',value:'Übung Zeichnungsblatt'},
   click('drawing-update'),click('drawing-auto'),click('drawing-apply'),
   {kind:'select',targets:['existing-1']},{kind:'set',field:'size-0',value:44},
   {kind:'ui',action:'click',target:'menu:cad'},open,click('drawing-update'),click('drawing-apply')
  ]};
  let result,expectedParent=before,originalSheet;
  const {cadDrawingDimension}=await import('../src/cad-drawing-data.js');
  if(live){
   if(!creating){
    originalSheet=await js(`(async()=>{
     const a=window.__cadTest,root=a.snapshot().nodes[0];
     a.clearPreview();a.select([{rootId:root.id,path:[]}]);a.drawingUI.open();
     await a.drawingUI.update();a.drawingUI.automatic();await a.drawingUI.apply();await a.settled();
     return a.controller.readSnapshot().drawings.sheets[0];
    })()`);
    expectedParent=await js(parentSnapshot);
   }
   const prompt=creating?'Erstelle im Übungsfenster eine bearbeitbare technische Zeichnung des ausgewählten Halters mit Vorder-, Drauf- und Seitenansicht und den drei Außenmaßen. Der Titel soll „Übung Zeichnungsblatt“ sein. Speichere das Blatt im Übungsprojekt.':
    'Zeig mir im Übungsfenster, wie ich die X-Breite des ausgewählten Halters auf 44 mm ändere und das vorhandene Zeichnungsblatt nachführe. Aktualisiere das bestehende Blatt mit seinen verknüpften Maßen und speichere es. Erhalte die übrigen Maße und Blattangaben.';
   result=await livePractice(prompt);
  }else result=await js(`(async()=>{
   const controller=window.__cadTest.controller;
   const revision=controller.revision(),project=await controller.transactions.materialize();
   return window.offlinecadDesktop.startPractice({plan:${JSON.stringify(plan)},projectCopy:{
    revision,project,selection:[{rootId:project.nodes[0].id,path:[]}]
   }});
  })()`);
  fs.writeFileSync(path.join(directory,'drawing-steps.json'),JSON.stringify(result,null,2));
  assert(result.ok,result.reason);
  const completed=(live?result.attempts.flatMap(attempt=>attempt.steps??[]):result.steps).filter(step=>step.drawing).map(step=>step.drawing);
  const initial=originalSheet?{views:originalSheet.views.map(view=>view.kind),annotationCount:originalSheet.annotations.length,
   dimensions:originalSheet.annotations.map(annotation=>({id:annotation.id,text:cadDrawingDimension(originalSheet,annotation).text}))}:completed[0];
  const updated=creating?initial:completed.at(-1);
  assert.deepEqual([...initial.views].sort(),['front','side','top']);
  assert.equal(initial.dimensions.length,3);
  assert.deepEqual(initial.dimensions.map(dimension=>dimension.text).sort(),drawingSize.map(value=>value+' mm').sort());
  if(!creating){
   assert.equal(updated.annotationCount,initial.annotationCount);
   assert.deepEqual(new Map(updated.dimensions.map(({id,text})=>[id,text])),new Map(initial.dimensions.map(({id,text})=>[
    id,text===drawingSize[0]+' mm'?'44 mm':text
   ])),'Only the persisted width dimension changes after the source edit');
  }
  assert(updated.dimensions.every(dimension=>dimension.status!=='reference-lost'));
  const project=await js(`window.offlinecadDesktop.practiceProjectResult({action:'read',id:${JSON.stringify(result.resultRef)}})`);
  const sheet=project.drawings.sheets[0];
  assert.equal(sheet.titleBlock.title,originalSheet?.titleBlock.title??'Übung Zeichnungsblatt');
  if(originalSheet){
   for(const key of ['id','name','paper','orientation','scale','titleBlock'])assert.deepEqual(sheet[key],originalSheet[key],key);
   assert.deepEqual(sheet.views.map(view=>view.id),originalSheet.views.map(view=>view.id));
  }
  assert.deepEqual(sheet.views.map(view=>view.kind).sort(),['front','side','top']);
  assert(sheet.views.every(view=>view.sourceIds.length===1&&view.sourceIds[0]===project.nodes[0].id&&view.projection?.curves.length>0));
  const [width,depth,height]=[creating?drawingSize[0]:44,...drawingSize.slice(1)];
  const expectedViews={front:[width,height],top:[width,depth],side:[depth,height]};
  const projectedSizes=Object.fromEntries(sheet.views.map(({kind,projection:{bounds}})=>[
   kind,bounds.max.map((value,index)=>value-bounds.min[index])
  ]));
  for(const [view,expected] of Object.entries(expectedViews)){
   assert(projectedSizes[view].every((value,index)=>Math.abs(value-expected[index])<.001),'Native '+view+' projection extents');
  }
  const native=await js(`window.__cadTest.controller.describe(${JSON.stringify(project)})`);
  const nativeSize=native.objects.find(object=>object.id===project.nodes[0].id).worldBounds.size;
  assert(nativeSize.every((value,index)=>Math.abs(value-[width,depth,height][index])<.001),'The body and projection agree');
  const after=await js(parentSnapshot);
  assert.equal(after.serialized,expectedParent.serialized);
  assert.deepEqual(after.selection,expectedParent.selection);
  assert.deepEqual(after.visiblePreviewRoots,expectedParent.visiblePreviewRoots);
  for(const key of ['undo','redo','previews','revision'])assert.equal(after.state[key],expectedParent.state[key],key);
  checks.push(creating?'Visible controls create an editable sheet with three native projections and linked dimensions':
   'The same dimension ID follows a source edit from 20 to 44 mm, with all references intact',
   'Native projection and main-window state independently verified');
  return {ok:true,checks,variant,initial,updated,nativeSize,projectedSizes};
 }
 if(['draft','draft-edit'].includes(process.env.FORMNARO_VERIFY_PRACTICE_SKETCH)){
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
 if(['repair','midpoint','repair-live','midpoint-live'].includes(process.env.FORMNARO_VERIFY_PRACTICE_SKETCH)){
  const variant=process.env.FORMNARO_VERIFY_PRACTICE_SKETCH;
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
