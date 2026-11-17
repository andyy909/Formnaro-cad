const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

async function verifyPracticeDrawing({js,directory,checks,before,parentSnapshot,drawingSize,variant:drawingVariant,livePractice}){
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

module.exports={verifyPracticeDrawing};
