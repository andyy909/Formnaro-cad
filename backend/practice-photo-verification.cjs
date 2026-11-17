const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

async function verifyPracticeMultiview({js,directory,checks,before,parentSnapshot,liveDomain,livePractice,comparisonPolicy}){
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

async function verifyPracticePhoto({js,directory,checks,before,parentSnapshot,liveDomain,livePractice,comparisonPolicy}){
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

module.exports={verifyPracticeMultiview,verifyPracticePhoto};
