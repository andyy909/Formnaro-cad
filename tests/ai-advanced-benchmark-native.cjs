// Native CAD calibration only: zero provider calls, not an AI benchmark result.
const {app}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||path.join(base,'work/advanced-native-'+Date.now()));
fs.mkdirSync(out,{recursive:true});app.setPath('userData',out+'/host');
app.whenReady().then(async()=>{let child;const checks=[];try{
 child=require('../backend/ai-diagnostic-child.cjs').openDiagnosticChild({app:{isPackaged:false,getAppPath:()=>base},directory:out+'/child'});
 const {definitions,advancedTask}=require('../backend/ai-benchmark-advanced-cases.cjs'),{evaluateAdvanced}=require('../backend/ai-benchmark-advanced-evaluate.cjs'),{referenceCommands,referenceSheet}=require('./fixtures/benchmark-advanced-reference.cjs');
 const rpc=(method,args)=>child.call('rpc',{method,args},180000);
 const apply=async commands=>{const s=await child.call('snapshot'),p=await rpc('preview',{revision:s.scene.revision,commands});await rpc('apply',{previewId:p.previewId,revision:p.revision});return child.call('snapshot');};
 const trace=after=>({ok:true,steps:[{observation:{nodes:after.project.nodes,scene:after.scene.objects,undo:1}}]});
 for(const task of definitions){try{
  const before=await child.call('setup',{caseId:task.id}),full=advancedTask(task.id),target=before.scene.selectionTargets[0].rootId;
  const noop=await evaluateAdvanced(full,before,before,rpc,trace(before));assert.equal(noop.passed,false,task.id+' no-op');
  let after;
  const reference=async wrong=>{
   if(task.id!=='advanced-08')return apply(referenceCommands(task.id,target,{wrong}));
   await apply([{op:'drawing',action:'put',sheet:referenceSheet(target,{wrong})}]);
   await apply([{op:'drawing',action:'update',sheetId:'advanced-sheet'}]);
   return apply([{op:'drawing',action:'dimension',sheetId:'advanced-sheet',mode:'basic'}]);
  };
  after=await reference(false);fs.writeFileSync(out+'/'+task.id+'-reference.ocad',JSON.stringify(after.project));
  const positive=await evaluateAdvanced(full,before,after,rpc,trace(after));assert.equal(positive.passed,true,task.id+' positive '+JSON.stringify(positive));
  // Also reject a correct model without a completed visible replay.
  const noReplay=await evaluateAdvanced(full,before,after,rpc,{ok:false,steps:[]});assert.equal(noReplay.passed,false,task.id+' missing replay');
  await child.call('setup',{caseId:task.id,project:before.project});
  after=await reference(true);const wrong=await evaluateAdvanced(full,before,after,rpc,trace(after));assert.equal(wrong.passed,false,task.id+' near-miss');
  checks.push({caseId:task.id,positive,noopRejected:true,missingReplayRejected:true,nearMissRejected:true,nearMissChecks:wrong.checks.filter(c=>!c.passed)});
  fs.writeFileSync(out+'/progress.json',JSON.stringify({completed:checks.length,checks},null,2));console.log(task.id+' NATIVE PASS, NOOP/NEAR-MISS/INCOMPLETE-REPLAY REJECTED');
 }catch(error){checks.push({caseId:task.id,error:error.message});console.error(task.id+' '+error.message);}}
 const close=await child.close();assert.equal(close.code,0);assert(!close.forced);
 const passed=checks.length===8&&checks.every(c=>!c.error);fs.writeFileSync(out+'/result.json',JSON.stringify({passed,providerRequests:0,positiveNative:checks.filter(c=>c.positive?.passed).length,noopRejected:checks.filter(c=>c.noopRejected).length,nearMissRejected:checks.filter(c=>c.nearMissRejected).length,missingReplayRejected:checks.filter(c=>c.missingReplayRejected).length,close,checks},null,2));if(passed)app.quit();else app.exit(1);
 }catch(e){fs.writeFileSync(out+'/error.json',JSON.stringify({error:e.message,stack:e.stack,checks},null,2));console.error(e.message);await child?.close();app.exit(1);}});
