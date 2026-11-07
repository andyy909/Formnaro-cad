const {app}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work','missing-controls-native-'+Date.now());
fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'host'));
app.whenReady().then(async()=>{let child;const checks=[];try{
 const click=target=>({kind:'ui',action:'click',target}),choose=(id,value)=>({kind:'ui',action:'choose',target:'ui:id:'+id,value});
 const wrongEdge=process.env.FORMNARO_EXPECT_WRONG_EDGE==='1';
 const finish=(tool,amount)=>[click('menu:cad'),click('ui:tool:edges'),choose('cad-edge-kind',tool),{kind:'edge',target:'existing-1',sides:['top',wrongEdge?'back':'front']},{kind:'ui',action:'set',target:'ui:id:cad-edge-amount',value:String(amount)},click('ui:id:cad-edge-preview'),click('ui:id:cad-edge-apply')];
 const cases={15:finish('round',2),16:finish('chamfer',1),17:[click('menu:cad'),click('ui:tool:cad-shell'),{kind:'face',target:'existing-1',side:'top'},{kind:'ui',action:'set',target:'ui:id:cad-modeling-thickness',value:'2'},click('ui:id:cad-modeling-preview'),click('ui:id:cad-modeling-apply')],22:[click('ui:tool:isolate'),click('menu:view-tools'),click('ui:tool:measure'),choose('inspection-measure-mode','faces'),choose('inspection-view','right'),{kind:'face',target:'existing-1',side:'right'},choose('inspection-view','left'),{kind:'face',target:'existing-1',side:'left'},click('ui:tool:end-isolation')]};
 for(const [number,actions]of Object.entries(cases).filter(([n])=>!process.env.FORMNARO_MISSING_CASES||process.env.FORMNARO_MISSING_CASES.split(',').includes(n))){
  const id='practice-'+number;child=require('../backend/ai-diagnostic-child.cjs').openDiagnosticChild({app:{isPackaged:true},executable:process.env.FORMNARO_MONITOR_EXE,directory:path.join(out,id)});
  const before=await child.call('setup',{caseId:id}),replay=await child.call('practice',{plan:{version:1,title:'Sichtbare Bedienlücke '+id,actions},projectCopy:{revision:before.scene.revision,project:before.project,selection:before.scene.selectionTargets}},360000);
  assert.equal(replay.result?.ok,true,JSON.stringify(replay.result));await child.call('loadResult',{project:replay.project});
  const after=await child.call('snapshot'),verification=await require('../backend/ai-practice-function-evaluate.cjs').evaluateFunction({number:Number(number)},before,after,(method,args)=>child.call('rpc',{method,args}),replay.result);
  const expectedNativePassed=!(wrongEdge&&[15,16].includes(Number(number)));
  checks.push({id,passed:verification.passed===expectedNativePassed,expectedNativePassed,verification,steps:replay.result.steps});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks},null,2));assert.equal(verification.passed,expectedNativePassed,JSON.stringify(verification));
  if(Number(number)===22)assert.equal(replay.result.steps.at(-1).observation.visible.length,before.project.nodes.length,'Die Gesamtansicht muss nach der Messung wiederhergestellt sein.');
  const close=await child.close();checks.at(-1).close=close;assert.equal(close.code,0);assert.ok(!close.forced);console.log(id,expectedNativePassed?'VISIBLE UI + NATIVE PASS':'WRONG EDGE NATIVELY REJECTED');
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,cloudRequests:0,checks},null,2));console.log(JSON.stringify({passed:true,out}));app.exit(0);
 }catch(error){console.error(error.message.slice(0,4000));fs.writeFileSync(path.join(out,'error.json'),JSON.stringify({error:error.message,checks},null,2));await child?.close();app.exit(1);}});
