// The paired runner installs this verification function in memory through the
// Node inspector. It never rewrites an accepted application's files or ASAR.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const sha=value=>createHash('sha256').update(value).digest('hex');
exports.workflowStlSummary=function(bytes){
 const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]},number=value=>{const n=Number(value);if(value===''||!Number.isFinite(n))throw Error('Invalid finite STL coordinate.');return n;},point=values=>values.forEach((v,k)=>{const n=number(v);bounds.min[k]=Math.min(bounds.min[k],n);bounds.max[k]=Math.max(bounds.max[k],n);});
 let triangles=0,encoding;
 if(bytes.length>=84&&84+bytes.readUInt32LE(80)*50===bytes.length){triangles=bytes.readUInt32LE(80);encoding='binary';for(let i=0;i<triangles;i++){const offset=84+i*50;for(let k=0;k<3;k++)number(bytes.readFloatLE(offset+k*4));for(let v=0;v<3;v++)point([0,1,2].map(k=>bytes.readFloatLE(offset+12+v*12+k*4)));}}
 else{
  const text=bytes.toString('utf8'),match=text.match(/^solid[^\r\n]*\r?\n([\s\S]*)\r?\nendsolid[^\r\n]*\s*$/);if(!match||text.includes('\ufffd'))throw Error('Invalid ASCII STL envelope.');const tokens=match[1].trim().split(/\s+/);if(tokens.length%21)throw Error('Invalid ASCII STL triangle structure.');triangles=tokens.length/21;encoding='ascii';
  for(let i=0;i<triangles;i++){const row=tokens.slice(i*21,(i+1)*21);if(row[0]!=='facet'||row[1]!=='normal'||row[5]!=='outer'||row[6]!=='loop'||row[19]!=='endloop'||row[20]!=='endfacet')throw Error('Invalid ASCII STL triangle keywords.');row.slice(2,5).forEach(number);for(const offset of [7,11,15]){if(row[offset]!=='vertex')throw Error('Missing ASCII STL vertex.');point(row.slice(offset+1,offset+4));}}
 }
 if(!triangles)throw Error('Empty STL export.');return {encoding,triangles,bounds};
};
exports.verifyModeling=async(win,{directory,files}={})=>{
 if(!directory||!files)throw Error('Workflow probe requires existing isolated verification dialogs.');
 const smoke=process.env.FORMNARO_WORKFLOW_SPEED_SMOKE==='1',count=smoke?2:21,warmups=smoke?0:3,coldCount=smoke?1:3,checks=[],metrics={};
 const run=code=>win.webContents.executeJavaScript(`(async()=>{const a=window.__cadTest,check=(v,m)=>{if(!v)throw Error(m)};${code}})()`),progress=pending=>fs.writeFileSync(path.join(directory,'workflow-progress.json'),JSON.stringify({pending,checks}));
 async function measured(name,code,options={}){progress(name);const result=await run(code);metrics[name]={samples:result.samples,mode:options.cold?'worker-cold':'warm',warmups:options.cold?0:warmups,...(result.detail?{detail:result.detail}:{})};checks.push(name);fs.writeFileSync(path.join(directory,'workflow-metrics-partial.json'),JSON.stringify(metrics));}
 win.setSize(1440,1000);
 progress('fixture');
 const fixture=await run(`
  await a.resetProject();a.workbenchUI.setMode('normal');
  await a.execute({kind:'batch',commands:Array.from({length:12},(_,i)=>({op:'create',type:i%3?'box':'cylinder',size:[18,18,12],pos:[i%4*26,Math.floor(i/4)*26,6],name:'Workflow part '+i}))});
  await a.mutate(p=>{p.name='workflow-speed';});await a.settled();a.select([{rootId:a.getModel().nodes[0].id,path:[]}]);a.view.setView('top');a.view.fit();await a.view.renderReady();
  const project=a.getModel();check(project.nodes.length===12,'fixture count');
  window.__workflowSpeed={before:a.serialize(),depth:a.undoDepth(),quality:JSON.stringify(a.getQuality()),view:a.view.viewState(),id:project.nodes[0].id,breps:project.nodes.map(n=>n.brep.data)};
  window.__workflowSpeed.assert=()=>{const p=window.__workflowSpeed;check(a.serialize()===p.before,'confirmed model changed');check(a.undoDepth()===p.depth,'history changed');check(JSON.stringify(a.getQuality())===p.quality,'quality changed');};
  window.__workflowSpeed.retire=async()=>{const generation=a.controller.state().worker.generation,pending=a.controller.query('bounds',{targets:[{rootId:window.__workflowSpeed.id,path:[]}]});a.controller.cancel();let aborted=false;try{await pending;}catch(error){aborted=error.name==='AbortError'||/ABORT|CANCEL/.test(error.code??'');}check(aborted,'worker reset did not cancel its read-only request');check(a.controller.state().worker.generation>generation,'native worker was not retired');};
  return {id:'native12-v1',parts:12,quality:a.getQuality(),geometry:project.nodes.map(n=>({kind:n.kind,source:n.source,recipe:n.recipe,transform:n.transform,brep:n.brep.data,solid:n.solid})),serializedBytes:new TextEncoder().encode(a.serialize()).length};
 `);
 fixture.geometrySha256=sha(JSON.stringify(fixture.geometry));delete fixture.geometry;checks.push('fixture exact native sources and quality');
 await measured('selection',`const p=window.__workflowSpeed,samples=[];for(let i=0;i<${warmups+count};i++){const t=performance.now();a.select([]);a.select([{rootId:p.id,path:[]}]);await a.settled();await a.view.renderReady();if(i>=${warmups})samples.push(performance.now()-t);}p.assert();return {samples,detail:'Deselect/select pair including next rendered frame'};`);
 for(const operation of ['move','rotate'])await measured(operation,`
  const p=window.__workflowSpeed,samples=[];
  for(let i=0;i<${warmups+count};i++){
   const start=performance.now();await a.mutate(project=>{const m=project.nodes[0].transform;if(${JSON.stringify(operation)}==='move'){m[12]+=3;m[13]+=2;}else{const original=[...m],angle=.37,c=Math.cos(angle),s=Math.sin(angle);for(let j=0;j<3;j++){m[j*4]=c*original[j*4]-s*original[j*4+1];m[j*4+1]=s*original[j*4]+c*original[j*4+1];}}});await a.settled();await a.view.renderReady();const elapsed=performance.now()-start;
   check(a.undoDepth()===p.depth+1,'movement must be one Undo');check(a.getModel().nodes.every((n,k)=>n.brep.data===p.breps[k]),'movement changed original BReps');if(i>=${warmups})samples.push(elapsed);await a.actions.undo();await a.settled();p.assert();
  }return {samples,detail:'Committed native ${operation} through drawn frame; exact Undo outside timing'};
 `);
 await measured('zoom',`
  const p=window.__workflowSpeed,samples=[],canvas=a.view.canvas,r=canvas.getBoundingClientRect();
  for(let i=0;i<${warmups+count};i++){const start=performance.now();canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:i%2?40:-40,clientX:r.x+r.width/2,clientY:r.y+r.height/2,bubbles:true,cancelable:true}));await a.view.renderReady();if(i>=${warmups})samples.push(performance.now()-start);}
  a.view.restoreView(p.view);await a.view.renderReady();p.assert();return {samples,detail:'Native viewport wheel event through next rendered frame; no modeling work'};
 `);
 files.save=path.join(directory,'workflow.ocad');
 await measured('save',`const p=window.__workflowSpeed,samples=[];for(let i=0;i<${warmups+count};i++){const start=performance.now(),saved=await a.save({saveAs:true});check(saved.saved,'actual Save As failed');if(i>=${warmups})samples.push(performance.now()-start);p.assert();}return {samples,detail:'Actual OCAd serialization and atomic file write through existing project IPC'};`);
 const savedBytes=fs.readFileSync(files.save),saved=JSON.parse(savedBytes),expected=await run('return {project:JSON.parse(a.serialize()),workspace:a.workspace()};');
 const savedModel={...saved};delete savedModel.workspace;
 assert.deepEqual(savedModel,expected.project,'Actual saved project/source readback differs.');assert.deepEqual(saved.workspace,expected.workspace,'Actual saved workspace readback differs.');
 const savedEvidence={file:files.save,bytes:savedBytes.length,sha256:sha(savedBytes)};checks.push('independent actual OCAd file readback preserves project, original sources and workspace');
 await measured('reopen',`
  const p=window.__workflowSpeed,samples=[];for(let i=0;i<${warmups+count};i++){const start=performance.now();await a.openProject();await a.settled();await a.view.renderReady();if(i>=${warmups})samples.push(performance.now()-start);check(a.serialize()===p.before,'actual reopen changed saved native model');check(JSON.stringify(a.getQuality())===p.quality,'reopen changed quality');p.depth=a.undoDepth();}p.assert();return {samples,detail:'Actual file read, parse, native validation and drawn restored workspace; warm worker and uncontrolled OS cache'};
 `);
 await measured('preview',`
  const p=window.__workflowSpeed,samples=[];for(let i=0;i<${warmups+count};i++){const start=performance.now(),proposal=await a.controller.preview({kind:'create',recipe:{type:'box',size:[12,9,4]},options:{id:'workflow-preview'}});await a.showPreview(proposal);await a.view.renderReady();if(i>=${warmups})samples.push(performance.now()-start);check(a.serialize()===p.before,'preview committed');a.cancel();await a.settled();p.assert();}return {samples,detail:'Native geometric proposal, validation and preview display; discard retains exact confirmed project/history'};
 `);
 for(const format of ['step','stl'])await measured('export.'+format,`
  const p=window.__workflowSpeed,samples=[];for(let i=0;i<${warmups+count};i++){const start=performance.now(),result=await a.exportModel(${JSON.stringify(format)});check(result.data?.length>0,'empty export');if(i>=${warmups})samples.push(performance.now()-start);p.assert();}return {samples,detail:'Complete ${format.toUpperCase()} generation and actual local file write through existing export IPC; unchanged native/export quality'};
 `);
 await measured('cold.reopen',`
  const p=window.__workflowSpeed,samples=[];for(let i=0;i<${coldCount};i++){await p.retire();const start=performance.now();await a.openProject();await a.settled();await a.view.renderReady();samples.push(performance.now()-start);check(a.serialize()===p.before,'worker-cold reopen changed source');p.depth=a.undoDepth();p.assert();}return {samples,detail:'Fresh native worker/kernel/cache; actual file reopen+validation+draw. OS filesystem/GPU caches not cleared.'};
 `,{cold:true});
 for(const format of ['step','stl'])await measured('cold.export.'+format,`
  const p=window.__workflowSpeed,samples=[];for(let i=0;i<${coldCount};i++){await p.retire();const start=performance.now(),result=await a.exportModel(${JSON.stringify(format)});check(result.data?.length>0,'empty cold export');samples.push(performance.now()-start);p.assert();}return {samples,detail:'Fresh native worker/kernel/cache before full ${format.toUpperCase()} generation and actual file write. OS file cache uncontrolled.'};
 `,{cold:true});
 const exportDirectory=path.join(directory,'exports'),exportEvidence=[];
 for(const format of ['step','stl']){const names=fs.readdirSync(exportDirectory).filter(n=>n.endsWith('.'+format));if(names.length!==warmups+count+coldCount)throw Error('Actual '+format+' export count differs.');for(const filename of names){const bytes=fs.readFileSync(path.join(exportDirectory,filename));if(format==='step'&&!bytes.subarray(0,100).toString().includes('ISO-10303-21'))throw Error('Invalid exported STEP header.');const geometry=format==='stl'?exports.workflowStlSummary(bytes):null;exportEvidence.push({file:path.join(exportDirectory,filename),bytes:bytes.length,sha256:sha(bytes),...(geometry?{geometry}:{})});}}
 checks.push('all measured exports exist with independent native file headers/counts');await run('window.__workflowSpeed.assert();');
 const result={ok:true,checks,probe:'formnaro-existing-workflows-v1',probeSha256:sha(fs.readFileSync(__filename)),smoke,fixture,metrics,savedEvidence,exportEvidence,limits:'Synthetic isolated twelve-part native CAD workload with unchanged construction and export quality. Rendered event latency includes next frame, not hardware mouse delivery. Warm samples follow three warmups. Worker-cold tests recreate the native worker/kernel and geometry caches; OS filesystem/GPU caches are explicitly uncontrolled. Cold three-sample p95 is descriptive only. No general startup, FPS, RAM, STEP parsing or large-file guarantee.'};
 fs.writeFileSync(path.join(directory,'workflow-probe.json'),JSON.stringify(result,null,2));return result;
};
