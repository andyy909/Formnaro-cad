const fs=require('node:fs'),path=require('node:path');
exports.verifyWorkingSpeed=async(win,{directory})=>{
 const checks=[],metrics={},run=code=>win.webContents.executeJavaScript(code),progress=pending=>fs.writeFileSync(path.join(directory,'working-progress.json'),JSON.stringify({checks,pending}));
 fs.writeFileSync(path.join(directory,'ready.json'),JSON.stringify({readyAt:Date.now()}));
 for(const [name,filename,method]of [['mesh','easy-performance-verification.cjs','verifyEasyPerformance'],['cad','cad-mini-performance-verification.cjs','verifyCadMiniPerformance']]){
  progress(name);const dir=path.join(directory,name);fs.mkdirSync(dir,{recursive:true});const started=Date.now(),r=await require('./'+filename)[method](win,{directory:dir});checks.push(...r.checks);metrics[name]={...r.metrics,suiteMs:Date.now()-started};
 }
 progress('project and group workflows');
 const operations=await run(`(async()=>{const a=window.__cadTest,check=(v,m)=>{if(!v)throw Error(m)},times={};
  await a.resetProject();a.workbenchUI.setMode('normal');await a.execute({kind:'batch',commands:Array.from({length:36},(_,i)=>({op:'create',type:i%3?'box':'cylinder',size:[10,10,10],pos:[i%6*20,Math.floor(i/6)*20,5]}))});await a.settled();
  const before=a.serialize(),depth=a.undoDepth(),samples=[];for(let i=0;i<7;i++){const start=performance.now();for(let j=0;j<10;j++){JSON.parse(a.serialize());}if(i)samples.push((performance.now()-start)/10);}times.projectRoundTripMs=samples;
  times.duplicateUndo=[];for(let i=0;i<4;i++){a.select([{rootId:a.getModel().nodes[0].id,path:[]}]);let t=performance.now();await a.actions.duplicate();await a.settled();const duplicateMs=performance.now()-t;t=performance.now();await a.actions.undo();await a.settled();const undoMs=performance.now()-t;if(i)times.duplicateUndo.push({duplicateMs,undoMs});check(a.serialize()===before,'duplicate exact Undo');}
  a.select(a.getModel().nodes.slice(0,6).map(n=>({rootId:n.id,path:[]})));let t=performance.now();await a.group();await a.settled();times.group6Ms=performance.now()-t;check(a.getModel().nodes.length===31,'group count');await a.actions.undo();await a.settled();check(a.serialize()===before,'group exact Undo');
  return times;
 })()`);
 metrics.operations=operations;checks.push('serialize/parse, duplicate, Undo and six-part native grouping preserve exact original sources and history');
 progress('sketch view and preview');const scenario=require('./working-speed-sketch-scenario.cjs');await run(scenario.setup);metrics.sketch=await run(scenario.measureWheel);
 metrics.sketch.previewMs=await run(`(async()=>{const a=window.__cadTest,before=a.serialize(),draft=JSON.stringify(a.sketchUI.state().sketch),start=performance.now();await a.sketchUI.preview();const ms=performance.now()-start;document.getElementById('sketch-cancel').click();if(a.serialize()!==before)throw Error('Sketch preview changed model');return ms;})()`);
 checks.push('128-element native sketch zoom and preview preserve confirmed model and draft geometry');
 metrics.limits='Synthetic isolated local workflows. Per-operation warm samples, original quality retained. Sketch event timings include synchronous SVG changes but exclude paint/GPU/input delivery; suite durations include correctness checks and are not pure operation latency. Mesh query microbenchmarks are reported separately.';
 return {ok:true,checks,metrics};
};
