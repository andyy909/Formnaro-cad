// Fixed local UI regression paths only. No model/provider requests.
const {app}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),executable=path.resolve(process.argv[2]),out=path.join(root,'work/completion-native-'+Date.now());fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'host'));
const click=target=>({kind:'ui',action:'click',target}),choose=(id,value)=>({kind:'ui',action:'choose',target:'ui:id:'+id,value}),set=(id,value)=>({kind:'ui',action:'set',target:'ui:id:'+id,value});
const cases={
 16:[click('menu:cad'),click('ui:tool:edges'),choose('cad-edge-kind','chamfer'),{kind:'edge',target:'existing-1',sides:['top','front']},set('cad-edge-amount','1'),click('ui:id:cad-edge-preview'),click('ui:id:cad-edge-apply')],
 17:[click('menu:cad'),click('ui:tool:cad-shell'),{kind:'face',target:'existing-1',side:'top'},set('cad-modeling-thickness','2'),click('ui:id:cad-modeling-preview'),click('ui:id:cad-modeling-apply')],
 22:[{kind:'select',targets:['existing-1'],text:'Messkörper auswählen'},click('ui:tool:isolate'),click('menu:view-tools'),click('ui:tool:measure'),choose('inspection-measure-mode','faces'),choose('inspection-view','right'),{kind:'face',target:'existing-1',side:'right'},choose('inspection-view','left'),{kind:'face',target:'existing-1',side:'left'},click('ui:tool:end-isolation')],
 24:[{kind:'select',targets:['existing-1'],text:'Aufgabenteil auswählen'},click('ui:tool:lock'),click('ui:tool:lock')],
 25:[{kind:'select',targets:['existing-1'],text:'Aufgabenteil auswählen'},click('ui:tool:isolate'),click('ui:tool:end-isolation')]
};
app.whenReady().then(async()=>{let child;const checks=[];try{
 for(const [number,actions]of Object.entries(cases)){
  const caseId='practice-'+number,activity=[],observations=[];child=require('../backend/ai-diagnostic-child.cjs').openDiagnosticChild({app:{isPackaged:true},executable,directory:path.join(out,caseId)});
  child.onPracticeActivity(v=>activity.push(v));child.onPracticeObservation(v=>observations.push(v));
  const before=await child.call('setup',{caseId});
  if(['16','17'].includes(number)){
   const bad=number==='16'?[click('menu:cad'),click('ui:tool:edges'),{kind:'set',field:'size-0',value:1},{kind:'edge',target:'existing-1',sides:['top','front']}]:[click('menu:cad'),click('ui:tool:cad-shell'),{kind:'face',target:'existing-1',side:'top'},{kind:'set',field:'pos-2',value:0},set('cad-modeling-thickness','2')];
   await assert.rejects(child.call('practice',{plan:{version:1,title:'Ungültiger Quellwechsel',actions:bad},projectCopy:{revision:before.scene.revision,project:before.project,selection:before.scene.selectionTargets}}),/ganze Bauteil|Werkzeugdialog/);
   const unchanged=await child.call('snapshot');assert.deepEqual(unchanged.project.nodes,before.project.nodes);assert.equal(activity.length,0,'No playback may start for the invalid plan');
  }
  const replay=await child.call('practice',{plan:{version:1,title:'Lokale Bedienprobe '+caseId,actions},projectCopy:{revision:before.scene.revision,project:before.project,selection:before.scene.selectionTargets}},360000);
  assert.equal(replay.result?.ok,true,JSON.stringify(replay.result));await child.call('loadResult',{project:replay.project});
  const after=await child.call('snapshot'),verification=await require('../backend/ai-practice-function-evaluate.cjs').evaluateFunction({number:Number(number)},before,after,(method,args)=>child.call('rpc',{method,args}),replay.result);assert.equal(verification.passed,true,JSON.stringify(verification));
  assert.ok(activity.some(v=>v.phase==='input-start'));assert.ok(activity.some(v=>v.phase==='input-finished'));assert.ok(observations.length>=actions.length);
  if(['22','25'].includes(number)){
   const isolated=observations.find(v=>v.action.target==='ui:tool:isolate');assert.equal(isolated.actual.visible.length,1);assert.ok(isolated.actual.objects.some(o=>o.visible===false&&o.hidden===false));assert.equal(observations.at(-1).actual.visible.length,before.project.nodes.length);
  }
  const image=await child.call('capture');fs.writeFileSync(path.join(out,caseId+'.png'),Buffer.from(image.split(',')[1],'base64'));
  const close=await child.close();assert.equal(close.code,0);assert.ok(!close.forced);checks.push({caseId,passed:true,verification,close,activity,observations});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,cloudRequests:0,checks},null,2));console.log(caseId+' LOCAL UI/NATIVE/EXIT0 PASS');
 }
 console.log(JSON.stringify({passed:true,cloudRequests:0,out,checks:checks.length}));app.exit(0);
 }catch(error){fs.writeFileSync(path.join(out,'error.json'),JSON.stringify({message:error.message,checks},null,2));console.error(error.message.slice(0,2500));await child?.close();app.exit(1);}});
