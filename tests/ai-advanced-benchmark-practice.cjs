// Two actual visible UI references on the packaged application, no provider calls.
const {app}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const executable=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});app.setPath('userData',out+'/host');
const click=id=>({kind:'ui',action:'click',target:id.startsWith('ui:')||id.startsWith('menu:')?id:'ui:id:'+id});
const set=(id,value)=>({kind:'ui',action:'set',target:id.startsWith('ui:')?id:'ui:id:'+id,value});
const choose=(id,value)=>({kind:'ui',action:'choose',target:id.startsWith('ui:')?id:'ui:id:'+id,value});
const actions={
 'advanced-03':[click('menu:cad'),click('ui:tool:drill'),{kind:'face',target:'existing-1',side:'top'},set('cad-drill-diameter','4'),click('cad-ref-preview'),click('cad-ref-apply'),click('ui:tool:array'),choose('array-kind','circle'),choose('array-space','world'),...Object.entries({'array-count':'8','array-radius':'30','array-center-0':'7','array-center-1':'7','array-center-2':'9','array-start-angle':'0'}).map(([k,v])=>set(k,v)),click('array-apply')],
 'advanced-08':[click('menu:cad'),click('ui:tool:drawing'),choose('drawing-paper-size','A3'),choose('drawing-orientation','landscape'),choose('drawing-scale','0.5'),click('drawing-title-block'),set('drawing-title','Aufbauhalter'),set('ui:label:Zeichnungsnummer','AB-08'),set('ui:label:Revision','B'),choose('drawing-add-kind','section'),click('drawing-add-view'),choose('ui:label:Schnittachse','1'),set('ui:label:Schnittlage (mm)','-5'),click('drawing-update'),click('drawing-auto'),click('drawing-apply')]
};
app.whenReady().then(async()=>{let child;const checks=[];try{
 for(const [caseId,plan] of Object.entries(actions).filter(([id])=>!process.argv[4]||process.argv[4]===id)){
  child=require('../backend/ai-diagnostic-child.cjs').openDiagnosticChild({app:{isPackaged:true},executable,directory:out+'/'+caseId});
  const before=await child.call('setup',{caseId}),rpc=(method,args)=>child.call('rpc',{method,args});
  const replay=await child.call('practice',{plan:{version:1,title:'Lokale Aufbau-Bedienprüfung '+caseId,actions:plan},projectCopy:{revision:before.scene.revision,project:before.project,selection:before.scene.selectionTargets}},600000);
  fs.writeFileSync(out+'/'+caseId+'-replay.json',JSON.stringify(replay,null,2));assert(replay.project,replay.result?.reason??'Kein Übungsergebnis');assert.equal(replay.result.ok,true,replay.result.reason??'Bedienung nicht vollständig');
  await child.call('loadResult',{project:replay.project});const after=await child.call('snapshot');
  const verification=await require('../backend/ai-benchmark-advanced-evaluate.cjs').evaluateAdvanced(require('../backend/ai-benchmark-advanced-cases.cjs').advancedTask(caseId),before,after,rpc,replay.result);assert(verification.passed,JSON.stringify(verification));
  const close=await child.close();assert.equal(close.code,0);assert(!close.forced);checks.push({caseId,verification,close,steps:replay.result.steps.length});fs.writeFileSync(out+'/progress.json',JSON.stringify({checks},null,2));console.log(caseId+' ACTUAL UI PASS');
 }
 fs.writeFileSync(out+'/result.json',JSON.stringify({passed:true,providerRequests:0,checks},null,2));app.quit();
 }catch(error){fs.writeFileSync(out+'/error.json',JSON.stringify({error:error.message,checks},null,2));console.error(error.message);await child?.close();app.exit(1);}});
