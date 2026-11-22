const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const json = JSON.stringify;

exports.verifyK08 = async function verifyK08(win, { directory, files, profilePath }) {
  const plateFile = path.join(directory, 'Eingabe-Platte.ocad');
  const repairFile = path.join(directory, 'Eingabe-Kantenverlust.ocad');
  const plateHash = hash(plateFile);
  const repairHash = hash(repairFile);
  const checks = [];
  const snapshot = () => evalUI('return {model:a.serialize(),revision:a.controller.revision(),undo:a.undoDepth()}');
  async function evalUI(code) {
    return win.webContents.executeJavaScript('(async()=>{const a=window.__cadTest;'+code+'})()');
  }
  async function until(code, description) {
    for (let i=0;i<300;i++){
      const result=await evalUI('return ('+code+')');
      if(result)return result;
      await pause(50);
    }
    const detail=await evalUI(`return {
      edge:document.querySelector('[data-edge-status]')?.textContent,
      drawing:document.querySelector('[data-drawing-status]')?.textContent,
      toast:document.querySelector('#toast')?.textContent
    }`);
    throw Error(description+' · '+json(detail));
  }
  function proof(name, values={}) {
    checks.push({name,...values});
    fs.writeFileSync(path.join(directory,'Fortschritt.json'),json(checks,null,2));
  }
  async function mouse(point) {
    const x=Math.round(point.x), y=Math.round(point.y);
    for (const type of ['mouseMove','mouseDown','mouseUp'])
      win.webContents.sendInputEvent({type,x,y,button:'left',clickCount:1});
    await pause(70);
  }
  async function click(selector) {
    const point=await evalUI(`const element=document.querySelector(${json(selector)});
      if(!element||element.disabled)throw Error('Bedienelement fehlt: '+${json(selector)});
      element.scrollIntoView({block:'center',inline:'nearest'});
      const r=element.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2;
      if(!element.contains(document.elementFromPoint(x,y)))throw Error('Bedienelement verdeckt: '+${json(selector)});
      return {x,y};`);
    await mouse(point);
  }
  async function field(selector,value,event='change') {
    await evalUI(`const field=document.querySelector(${json(selector)});
      if(!field)throw Error('Eingabefeld fehlt: '+${json(selector)});
      field.value=${json(value)};
      field.dispatchEvent(new Event(${json(event)},{bubbles:true}));`);
  }
  async function open(file, rootId) {
    await evalUI('await a.resetProject();await a.settled();');
    files.save=file;
    await evalUI('await a.openProject();await a.settled();');
    await until(`a.getModel().nodes.some(node=>node.id===${json(rootId)})`,'Gespeicherte Datei geöffnet');
    assert.equal(await evalUI('return a.activeProjectFile().name'),path.basename(file));
  }
  async function pickStep(bodyId, stepId) {
    await click('[data-root-id="'+bodyId+'"][data-path="[]"]');
    const selector='[data-finish-body-id="'+bodyId+'"][data-finish-step-id="'+stepId+'"]';
    await until('!!document.querySelector('+json(selector)+')','Schritt im normalen Objektbaum');
    await click(selector);
    assert.equal(await evalUI('return a.tools.state().stepId'),stepId);
  }
  async function editAmount(amount){
    await field('[data-edge-amount]',String(amount),'input');
    await click('[data-edge-preview]');
  }
  async function storedProof(base, radius) {
    const actual=await evalUI(`const project=a.getModel(), root=project.nodes.find(n=>n.id==='k01-pruefplatte'),
      scene=a.getScene().objects.find(n=>n.id===root.id), drill=root.children.find(n=>n.drill);
      return {steps:root.finish.steps.map(({id,kind,amount})=>({id,kind,amount})),solids:scene.solids,
        volume:scene.volume, drillId:drill.id, drill:drill.drill, drawing:project.drawings.sheets[0]};`);
    assert.deepEqual(actual.steps.map(step=>step.amount),[radius,2,1]);
    assert.equal(actual.solids,1);
    assert.equal(actual.drill.diameter,8);
    if(base){
      assert.equal(actual.drillId,base.drillId);
      assert.deepEqual(actual.drill,base.drill);
      assert.deepEqual(actual.steps.map(step=>step.id),base.steps.map(step=>step.id));
      assert.deepEqual(actual.drawing.views.map(view=>view.id),base.drawing.views.map(view=>view.id));
    }
    const annotation=actual.drawing.annotations[0];
    const view=actual.drawing.views.find(item=>item.id===annotation.viewId);
    const hole=view.projection.curves.find(curve=>curve.id===annotation.curveIds[0]);
    assert.equal(hole.kind,'circle');
    assert.equal(hole.radius,4);
    assert.ok(Math.hypot(hole.center[0]-11,hole.center[1]+7)<1e-6);
    assert.ok(!annotation.unresolved);
    return actual;
  }
  async function cleanDrawing(){
    await evalUI("a.actions.drawing()");
    await until('!!a.drawingUI.state()','Zeichnung offen');
    assert.deepEqual(await evalUI('return a.drawingUI.state().problems'),[]);
    await click('[data-drawing-close]');
  }
  async function save(file, format){
    files.save=file;
    assert.ok((await evalUI('return a.save({saveAs:true,format:'+json(format)+'})')).saved);
    assert.ok(fs.statSync(file).size>100);
  }

  async function exportStepAs(name) {
    const result=await evalUI("return a.exportModel('step')");
    assert.equal(result.extension,'step');
    const dir=path.join(directory,'exports');
    const generated=fs.readdirSync(dir).filter(file=>file.endsWith('.step'));
    assert.equal(generated.length,1);
    const output=path.join(directory,name);
    fs.renameSync(path.join(dir,generated[0]),output);
    assert.match(fs.readFileSync(output,'utf8'),/ISO-10303-21/);
    return {file:name,sha256:hash(output)};
  }

  await until('!!a && !!window.__cadReady','Formnaro-CAD bereit');
  await open(plateFile,'k01-pruefplatte');
  await cleanDrawing();
  const original=await snapshot(), before=await storedProof(null,3);
  const stepId=before.steps[0].id;
  await pickStep('k01-pruefplatte',stepId);
  await editAmount(30);
  await until("document.querySelector('[data-edge-status]')?.textContent.includes("+json(stepId)+")",'K04 meldet betroffene Schritt-ID');
  assert.deepEqual(await snapshot(),original);
  assert.equal(await evalUI("return document.querySelector('[data-edge-apply]').disabled"),true);
  await editAmount(4);
  await until("!document.querySelector('[data-edge-apply]').disabled",'Native R4-Vorschau im Kanteneditor');
  assert.deepEqual(await snapshot(),original);
  fs.writeFileSync(path.join(directory,'Modellbaum-Vorschau.png'),(await win.webContents.capturePage()).toPNG());
  await click('[data-edge-apply]');
  await until('!a.tools.state()','Übernahme beendet');
  await evalUI('await a.settled();');
  const afterEdit=await snapshot();
  assert.equal(afterEdit.undo,original.undo+1);
  const edited=await storedProof(before,4);
  await cleanDrawing();
  await evalUI('await a.actions.undo();await a.settled();');
  assert.deepEqual(await snapshot(),original);
  await storedProof(before,3);
  await evalUI('await a.actions.redo();await a.settled();');
  assert.deepEqual(await snapshot(),afterEdit);
  proof('K08-01/03 · Modellbaum, unbaubares Maß, Vorschau, Übernehmen, Undo und Redo',{
    rootId:'k01-pruefplatte',steps:edited.steps,drillId:edited.drillId,volume:edited.volume,
    undoChanges:[original.undo,afterEdit.undo],drawingCircle:edited.drawing.annotations[0],
  });

  const ocad=path.join(directory,'K08-Pruefplatte-R4.ocad');
  const fnpack=path.join(directory,'K08-Pruefplatte-R4.fnpack');
  await save(ocad,'ocad');
  await open(ocad,'k01-pruefplatte');
  const ocadReopened=await storedProof(before,4);
  assert.ok(Math.abs(ocadReopened.volume-edited.volume)<1e-6);
  await cleanDrawing();
  const ocadStep=await exportStepAs('K08-OCAD-Wiedergeoeffnet.step');
  await save(fnpack,'fnpack');
  await open(fnpack,'k01-pruefplatte');
  const fnpackReopened=await storedProof(before,4);
  assert.ok(Math.abs(fnpackReopened.volume-edited.volume)<1e-6);
  await cleanDrawing();
  const fnpackStep=await exportStepAs('K08-FNPACK-Wiedergeoeffnet.step');
  const index=await require('./fnpack.cjs').openFnpack(fnpack);
  try {assert.ok(index.index.blocks.length > 0);} finally {await index.close();}
  proof('K08-02 · Native OCAD- und FNPACK-Dateien gespeichert und separat wieder geöffnet',{
    ocad:{sha256:hash(ocad),step:ocadStep,volume:ocadReopened.volume},
    fnpack:{sha256:hash(fnpack),step:fnpackStep,volume:fnpackReopened.volume},
  });
  // Reopen the inline project for the deliberately damaged drawing copy.
  await open(ocad,'k01-pruefplatte');
  await evalUI(`await a.mutate(d=>{
    const annotation=d.drawings.sheets[0].annotations[0];
    annotation.curveIds=['k08-eindeutig-fehlende-kurve'];
    annotation.unresolved=true;
  },'Prüfkopie mit verlorenem Blattbezug');await a.settled();a.actions.drawing();`);
  await until("document.querySelector('[data-drawing-export=pdf]').disabled",'Verlorener Maßbezug sperrt PDF');
  const trouble=await evalUI('return a.drawingUI.state().problems');
  assert.ok(trouble.some(p=>p.code==='LOST_DIMENSION_REFERENCE'),json(trouble));
  await field('[data-drawing-annotation-list]',edited.drawing.annotations[0].id);
  await click('[data-drawing-remove-annotation]');
  await field('[data-drawing-tool]','diameter');
  const point=await evalUI(`const state=a.drawingUI.state(), sheet=state.drawings.sheets[0];
    const view=sheet.views.find(v=>v.kind==='top');
    const curves=view.projection.curves.filter(curve=>curve.kind==='circle'&&!curve.hidden&&
      Math.abs(curve.radius-4)<1e-6&&Math.hypot(curve.center[0]-11,curve.center[1]+7)<1e-6);
    if(curves.length!==1)throw Error('Eindeutiger Bohrungskreis fehlt: '+curves.length);
    const curve=document.querySelector('[data-drawing-view="'+view.id+'"] [data-drawing-curve="'+curves[0].id+'"]');
    const shape=curve.querySelector('path,circle,ellipse,polyline');
    shape.scrollIntoView({block:'center',inline:'center'});
    for(const ratio of [.33,.66,.15,.85]){
      const p=shape.getPointAtLength(shape.getTotalLength()*ratio);
      const screen=new DOMPoint(p.x,p.y).matrixTransform(shape.getScreenCTM());
      const hit=document.elementFromPoint(screen.x,screen.y)?.closest('[data-drawing-curve]');
      if(hit?.dataset.drawingCurve===curves[0].id)return {x:screen.x,y:screen.y};
    }
    throw Error('Bohrungskreis im Blatt verdeckt.');`);
  await mouse(point);
  await until("a.drawingUI.state()?.drawings.sheets[0].annotations.length===1",'Ø8 erneut im Blatt angelegt');
  await click('[data-drawing-apply]');
  await until("!a.drawingUI.state() || !a.drawingUI.state().running",'Blattänderung übernommen');
  if(!(await evalUI('return !!a.drawingUI.state()')))await evalUI('a.actions.drawing();');
  const fixed=await storedProof(before,4);
  await until("!document.querySelector('[data-drawing-export=pdf]').disabled",'PDF nach Neuwahl freigegeben');
  await click('[data-drawing-export=pdf]');
  await until('!a.drawingUI.state().running','PDF geschrieben');
  await click('[data-drawing-close]');
  const exportDir=path.join(directory,'exports');
  const pdf=path.join(exportDir,fs.readdirSync(exportDir).find(file=>file.endsWith('.pdf')));
  assert.equal(fs.readFileSync(pdf).subarray(0,5).toString(),'%PDF-');
  assert.ok(process.env.FORMNARO_K08_PDFTOPPM,'PDF-Leser nicht gesetzt.');
  execFileSync(process.env.FORMNARO_K08_PDFTOPPM,['-singlefile','-png','-r','110',pdf,path.join(directory,'Blatt-Ansicht')],
    {windowsHide:true,timeout:15000});
  assert.ok(fs.statSync(path.join(directory,'Blatt-Ansicht.png')).size>2000);
  proof('K08-04/06 · Verlorenen Maßbezug sperren, am tatsächlichen Ø8-Kreis neu wählen und PDF öffnen',{
    lost:trouble, drawingCircle:fixed.drawing.annotations[0], pdf:path.basename(pdf), sha256:hash(pdf),
  });

  const finalStep=await exportStepAs('K08-Pruefplatte-R4.step');
  proof('K08-05 · Nativer STEP-Export für unabhängiges Rücklesen',finalStep);

  await open(repairFile,'recoverable-edge-body');
  await evalUI("await a.execute({kind:'create',recipe:{type:'box',size:[8,8,6]},options:{id:'k05-unbeteiligter-koerper'}});await a.execute({kind:'batch',commands:[{op:'transform',target:'k05-unbeteiligter-koerper',translate:[-35,0,0]}]});await a.settled();");
  const failureBase=await snapshot();
  await pickStep('recoverable-edge-body','k05-step-one');
  await editAmount(4);
  await until("document.querySelector('[data-edge-status]')?.textContent.includes('k05-step-two')",'Tatsächlich verlorener Folgeschritt');
  assert.deepEqual(await snapshot(),failureBase);
  await click('[data-edge-repair]');
  await until("document.querySelector('[data-edge-status]')?.textContent.includes('Zwischenkörper anklicken')",'K05-Zwischenkörper');
  assert.deepEqual(await snapshot(),failureBase);
  await evalUI('await a.settled();');
  const neighbor=await evalUI(`a.view.setView('top');a.view.fit();await a.view.renderReady();
    const point=a.view.projectPoint([-35,0,3]), target=document.elementFromPoint(point.x,point.y);
    if(target!==a.view.canvas)throw Error('Nachbar durch Oberfläche verdeckt: '+target?.outerHTML.slice(0,150)+' bei '+JSON.stringify(point));
    return point;`);
  await mouse(neighbor);
  await until("document.querySelector('[data-edge-status]')?.textContent.includes('anderer Körper')",'Falscher Körper verwirft Zwischenvorschau');
  assert.deepEqual(await snapshot(),failureBase);
  await click('[data-edge-repair]');
  await until("document.querySelector('[data-edge-status]')?.textContent.includes('Zwischenkörper anklicken')",'Neue Ersatzkantenwahl');
  await evalUI('await a.settled();');
  const edge=await evalUI(`for(const y of [-12,-9,-6,-2,2,7]){
    const point=a.view.projectPoint([15,y,10]);
    if(document.elementFromPoint(point.x,point.y)===a.view.canvas)return {...point,world:[15,y,10]};
  }
  throw Error('Ersatzkante durch Bedienfläche verdeckt.');`);
  await mouse(edge);
  await until("!document.querySelector('[data-edge-apply]')?.disabled",'Reparierte Kante als native Vorschau');
  assert.deepEqual(await snapshot(),failureBase);
  await click('[data-edge-apply]');
  await until('!a.tools.state()','Kantenreparatur übernommen');
  await evalUI('await a.settled();');
  const afterRepair=await snapshot();
  const chain=JSON.parse(afterRepair.model).nodes.find(node=>node.id==='recoverable-edge-body').finish.steps;
  assert.deepEqual(chain.map(step=>[step.id,step.amount]),[['k05-step-one',4],['k05-step-two',.5]]);
  assert.equal(afterRepair.undo,failureBase.undo+1);
  await evalUI('await a.actions.undo();await a.settled();');
  assert.deepEqual(await snapshot(),failureBase);
  async function chooseReplacementAgain(){
    await pickStep('recoverable-edge-body','k05-step-one');
    await editAmount(4);
    await until("!document.querySelector('[data-edge-repair]')?.hidden",'Erneut absichtlich verlorene Folgekante');
    await click('[data-edge-repair]');
    await until("document.querySelector('[data-edge-status]')?.textContent.includes('Zwischenkörper anklicken')",'Ersatzkantenwahl offen');
  }
  await chooseReplacementAgain();
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await until('!a.tools.state()','Escape schließt Ersatzkantenwahl');
  assert.deepEqual(await snapshot(),failureBase);
  await chooseReplacementAgain();
  const oldOpening=await evalUI('return a.controller.projectScope()');
  await evalUI('await a.controller.open(a.getModel());await a.settled();');
  await until('!a.tools.state()','Neue Projektöffnung schließt Ersatzkantenwahl');
  assert.notEqual(await evalUI('return a.controller.projectScope()'),oldOpening);
  assert.equal((await snapshot()).model,failureBase.model);
  assert.equal((await snapshot()).revision,failureBase.revision);
  proof('K05 · Verlorene Folgekante am realen Zwischenkörper neu gewählt, übernommen und rückgängig gemacht',{
    steps:chain.map(({id,amount})=>({id,amount})),candidate:edge.world,wrongBodyRejected:true,escape:true,projectReopenCanceled:true,
  });

  await open(plateFile,'k01-pruefplatte');
  const bridgeBase=await snapshot();
  await evalUI("await window.offlinecadDesktop.saveAISettings({config:{bridgeEnabled:true,webResearchAllowed:false}});");
  try {
    const connection=JSON.parse(fs.readFileSync(path.join(profilePath,'ai-bridge.json'),'utf8'));
    const url=new URL(connection.url);
    assert.equal(url.hostname,'127.0.0.1');
    async function rpc(method, data) {
      const response=await fetch(url.origin+'/v1/'+method,{
        method:data===undefined?'GET':'POST',
        headers:{authorization:'Bearer '+connection.token,'content-type':'application/json'},
        body:data===undefined?undefined:json(data),
        signal:AbortSignal.timeout(25000),
      });
      return {ok:response.ok,data:await response.json()};
    }
    const context=await rpc('context');
    assert.ok(context.ok);
    const scene=await rpc('scene');
    assert.ok(scene.ok);
    const current=scene.data.objects.find(node=>node.id==='k01-pruefplatte'&&!node.target.path.length);
    assert.equal(current.finish.steps[0].id,stepId);
    const request=(revision,id=stepId)=>({revision,label:'K07 · gleicher Radius wie Modellbaum', commands:[
      {op:'tool',engine:'cad',operation:{kind:'editFinishAmount',target:current.id,stepId:id,amount:4}},
    ]});
    const invalid=await rpc('preview',request(scene.data.revision,'fehlender-schritt'));
    assert.equal(invalid.ok,false);
    assert.match(invalid.data.error,/Kantenschritt fehlt/);
    assert.deepEqual(await snapshot(),bridgeBase);
    const proposed=await rpc('preview',request(scene.data.revision));
    assert.equal(proposed.ok,true,json(proposed.data));
    assert.deepEqual(await snapshot(),bridgeBase);
    const applied=await rpc('apply',{revision:scene.data.revision,previewId:proposed.data.previewId});
    assert.equal(applied.ok,true,json(applied.data));
    await evalUI('await a.settled();');
    const bridgeEdited=await storedProof(before,4);
    assert.ok(Math.abs(edited.volume-bridgeEdited.volume)<1e-6);
    assert.equal((await snapshot()).undo,bridgeBase.undo+1);
    const bridgeStep=await exportStepAs('K07-Pruefplatte-R4.step');
    const stale=await rpc('preview',request(scene.data.revision));
    assert.equal(stale.ok,false);
    assert.equal(stale.data.code,'STALE_REVISION');
    await evalUI(`await a.mutate(project=>{project.nodes.find(node=>node.id==='k01-pruefplatte').locked=true;},'Isolierte Sperrprobe');await a.settled();`);
    const lockedBefore=await snapshot();
    const locked=await rpc('preview',request(lockedBefore.revision));
    assert.equal(locked.ok,false);
    assert.equal(locked.data.code,'LOCKED_CAD_OBJECT');
    assert.deepEqual(await snapshot(),lockedBefore);
    proof('K07 · Lokales context/scene/preview/apply mit derselben Schritt-ID und Geometrie',{
      rootId:current.id,stepId,steps:bridgeEdited.steps,volume:bridgeEdited.volume,step:bridgeStep,
      wrongStep:invalid.data.code,stale:stale.data.code,locked:locked.data.code,
    });
  } finally {
    await evalUI("await window.offlinecadDesktop.saveAISettings({config:{bridgeEnabled:false,webResearchAllowed:false}});");
  }

  assert.equal(hash(plateFile),plateHash);
  assert.equal(hash(repairFile),repairHash);
  return {ok:true,checks,plateHash,repairHash};
};
