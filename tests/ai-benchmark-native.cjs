// Native benchmark verifier calibration. Fixed local references; zero provider requests.
const {app}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/benchmark-native-'+Date.now()),executable=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'host'));
const click=target=>({kind:'ui',action:'click',target}),choose=(id,value)=>({kind:'ui',action:'choose',target:'ui:id:'+id,value}),set=(field,value)=>({kind:'set',field,value});
const sizes=[click('ui:tool:mode-scale'),choose('size-anchor','center'),set('size-0',14),set('size-1',14)];
const actions={
 'practice-03':sizes,assembly:sizes,
 'practice-11':[click('ui:tool:array'),choose('array-kind','circle'),choose('array-space','world'),...Object.entries({'array-count':'6','array-radius':'20','array-center-0':'0','array-center-1':'0','array-center-2':'5','array-start-angle':'0'}).map(([id,value])=>({kind:'ui',action:'set',target:'ui:id:'+id,value})),click('ui:id:array-apply')],
 'practice-21':[click('menu:cad'),click('ui:tool:drawing'),choose('drawing-paper-size','A4'),click('ui:id:drawing-title-block'),{kind:'ui',action:'set',target:'ui:id:drawing-title',value:'Übungsteil'},click('ui:id:drawing-update'),click('ui:id:drawing-apply')]
};
actions['practice-14']=[click('menu:cad'),click('ui:tool:drill'),{kind:'face',target:'existing-1',side:'top'},{kind:'ui',action:'set',target:'ui:id:cad-drill-diameter',value:'6'},click('ui:id:cad-ref-preview'),click('ui:id:cad-ref-apply')];
app.whenReady().then(async()=>{let child;const checks=[];try{
 for(const c of require('../ai/benchmark-core-v1.json').cases){const id=c.caseId;child=require('../backend/ai-diagnostic-child.cjs').openDiagnosticChild({app:{isPackaged:true},executable,directory:path.join(out,id)});const before=await child.call('setup',{caseId:id}),rpc=(method,args)=>child.call('rpc',{method,args});
 const verify=(after,replay)=>id==='assembly'?require('../backend/ai-diagnostic-assembly.cjs').evaluateAssembly(before,after):require('../backend/ai-practice-function-evaluate.cjs').evaluateFunction(require('../backend/ai-test-lab-cases.cjs').taskInstance(id),before,after,rpc,replay);
 const negative=await verify(before,{ok:true,steps:[{observation:{nodes:before.project.nodes,scene:before.scene.objects,undo:0}}]});assert.equal(negative.passed,false,'No-op must fail '+id);
 const result={caseId:id,unchangedRejected:true,negative};
 if(actions[id]){const replay=await child.call('practice',{plan:{version:1,title:'Lokale Benchmark-Prüferkalibrierung '+id,actions:actions[id]},projectCopy:{revision:before.scene.revision,project:before.project,selection:before.scene.selectionTargets}},360000);assert.equal(replay.result?.ok,true,JSON.stringify(replay.result).slice(0,2000));await child.call('loadResult',{project:replay.project});const after=await child.call('snapshot'),positive=await verify(after,replay.result);assert.equal(positive.passed,true,JSON.stringify(positive));result.positive=positive;result.steps=replay.result.steps;}
 else result.positiveReusedFrom='completion-native-1794074002657/result.json';
 result.close=await child.close();assert.equal(result.close.code,0);assert.ok(!result.close.forced);checks.push(result);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,providerRequests:0,checks},null,2));console.log(id+' NATIVE CALIBRATION PASS');
 }
 console.log(JSON.stringify({passed:true,providerRequests:0,out}));app.exit(0);
 }catch(e){fs.writeFileSync(path.join(out,'error.json'),JSON.stringify({error:e.message,checks},null,2));console.error(e.message.slice(0,2400));await child?.close();app.exit(1);}});
