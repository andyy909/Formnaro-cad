const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {taskInstance}=require('./ai-test-lab-cases.cjs'),{goldenCommands}=require('./ai-test-lab-goldens.cjs');
const {evaluate}=require('./ai-diagnostic-evaluate.cjs'),{evaluateAssembly}=require('./ai-diagnostic-assembly.cjs');
async function runPreflight({app,directory,openChild,signal,onProgress=()=>{},onChild=()=>{}}){
 const results=[],started=Date.now(),child=openChild({app,directory:path.join(directory,'sandbox-'+crypto.randomUUID())});onChild(child);const abort=()=>child.cancel();signal.addEventListener('abort',abort,{once:true});
 const rpc=async(method,args)=>{signal.throwIfAborted();return child.call('rpc',{method,args});};
 const check=(name,passed,details)=>{results.push({name,passed:!!passed,details});onProgress(results.at(-1));};
 const verify=(task,before,after)=>task.id==='assembly'?evaluateAssembly(before,after,task.geometry):evaluate(task.id,before,after,rpc,task.geometry);
 let close;
 try{
  for(const dataset of ['development','holdout'])for(const id of ['drill','sketch','pattern','shell','drawing','assembly','thread']){
   signal.throwIfAborted();const task=taskInstance(id,dataset),before=await child.call('setup',{caseId:id,dataset}),commands=goldenCommands(task,before);
   const proposal=await rpc('preview',{revision:before.scene.revision,commands});
   const untouched=await child.call('snapshot');check(dataset+' · '+id+' · Vorschau verändert bestätigtes Modell nicht',JSON.stringify(before.project.nodes)===JSON.stringify(untouched.project.nodes));
   await rpc('apply',{previewId:proposal.previewId,revision:proposal.revision});const after=await child.call('snapshot'),v=await verify(task,before,after);check(dataset+' · '+id+' · richtige Referenz akzeptiert',v.passed,v.checks);
   if(!v.passed)throw Error('Lokale Referenz fehlgeschlagen: '+dataset+'/'+id);
  }
  for(const id of ['drill','sketch','pattern','drawing','assembly','thread']){
   const task=taskInstance(id),before=await child.call('setup',{caseId:id}),p=await rpc('preview',{revision:before.scene.revision,commands:goldenCommands(task,before,{mutation:true})});await rpc('apply',{previewId:p.previewId,revision:p.revision});const after=await child.call('snapshot'),v=await verify(task,before,after);check(id+' · absichtlich falsches Modell abgelehnt',!v.passed,v.checks);
  }
  const before=await child.call('setup',{caseId:'drill'}),revision=before.scene.revision;
  let failed=false;try{await rpc('preview',{revision,commands:[{op:'create',type:'box',size:[5,5,5],as:'a'},{op:'create',type:'box',size:[5,5,5],pos:[40,0,0],as:'b'},{op:'group',operation:'intersection',targets:['$a','$b']}]});}catch{signal.throwIfAborted();failed=true;}check('Fehlerhafte native Vorschau abgewiesen',failed);
  const request={revision,commands:[{op:'create',type:'box',size:[3,4,5],pos:[-40,0,0]}]},retry=await rpc('preview',request);check('Neue Vorschau nach Fehler möglich',!!retry.previewId);
  let stale=false;try{await rpc('apply',{previewId:retry.previewId,revision:'ffffffffffffffff'});}catch(e){signal.throwIfAborted();const unchanged=await child.call('snapshot');stale=JSON.stringify(unchanged.project.nodes)===JSON.stringify(before.project.nodes);}check('Veraltete Übernahme abgewiesen',stale);
  await rpc('discard',{previewId:retry.previewId,revision});const again=await rpc('preview',request);check('Neue Vorschau nach Verwerfen möglich',!!again.previewId);await rpc('apply',{previewId:again.previewId,revision});await child.call('undo');const undone=await child.call('snapshot');check('Undo stellt bestätigten Ausgangszustand wieder her',JSON.stringify(undone.project.nodes)===JSON.stringify(before.project.nodes));
 }catch(error){check('Vorprüfung abgeschlossen',false,signal.aborted?'Abgebrochen':error.message);}
 finally{signal.removeEventListener('abort',abort);close=await child.close();check('Testfenster regulär geschlossen',close.code===0&&!close.signal&&!close.forced,close);}
 const result={format:'FormnaroLabPreflight',createdAt:new Date().toISOString(),passed:results.every(r=>r.passed),checks:results,elapsedMs:Date.now()-started,cloudRequests:0,scope:'Native reference and mutation cases for the seven supported task families, plus revision/discard/retry/undo. Not exhaustive proof of all CAD geometry.'};
 fs.writeFileSync(path.join(directory,'Vorpruefung.json'),JSON.stringify(result,null,2));return result;
}
module.exports={runPreflight};
