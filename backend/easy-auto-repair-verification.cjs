const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');

// Synthetic mixed projects and file dialogs belong to an isolated test profile.
// The actual renderer controls, repair worker and shared project Undo are used.
exports.verifyEasyAutoRepair=async function(win,{directory,files}){
 const checks=[],run=code=>win.webContents.executeJavaScript(code),pause=(ms=80)=>new Promise(resolve=>setTimeout(resolve,ms));
 fs.mkdirSync(directory,{recursive:true});
 let phase='startup';
 const progress=()=>fs.writeFileSync(path.join(directory,'progress.json'),JSON.stringify({phase,checks},null,2));
 const check=(value,label)=>{assert.ok(value,label);checks.push(label);progress();};
 const until=async(code,label=code)=>{const start=Date.now();while(Date.now()-start<30000){if(await run(code))return;await pause();}throw Error('Timeout: '+label+'; '+await run(`JSON.stringify({repair:window.__cadTest?.easyRepair.state(),toast:document.getElementById('toast')?.textContent,modal:document.getElementById('modal')?.open})`));};
 const settled=async()=>{await run('window.__cadTest.settled()');await pause();};
 const snapshot=()=>run('window.__cadTest.serialize()');
 const model=()=>run('window.__cadTest.getModel()');
 const state=()=>run('window.__cadTest.easyRepair.state()');
 const node=(project,id)=>project.nodes.find(n=>n.id===id);
 async function click(selector){
  const point=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e?.getBoundingClientRect();if(!e||!r.width||!r.height||e.disabled)throw Error('Control unavailable: '+${JSON.stringify(selector)});return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
  for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,...point,button:'left',clickCount:1});
  await pause();
 }
 async function screenshot(name){await run('window.__cadTest.view.renderReady()');await pause(200);fs.writeFileSync(path.join(directory,name+'.png'),(await win.webContents.capturePage()).toPNG());}
 const idle=`!window.__cadTest.easyRepair.state().running&&!window.__cadTest.easyRepair.state().pending`;
 try{
  await until('!!window.__cadTest?.easyRepair');await run('window.__cadTest.layoutUI.ready()');win.setSize(1840,1015);await pause(200);
  if(await run(`window.__cadTest.workbenchUI.mode()!=='normal'`))await click('[data-workbench-mode=normal]');
  phase='mixed-fixture';progress();
  await run(`(async()=>{
   const a=window.__cadTest;await a.addShape('box');await a.settled();
   window.__autoRepairProof={nativeId:a.getModel().nodes[0].id,modalOpens:0,failureMessages:0,queries:[]};
   for(const [index,id]of ['duplicate','missing-top','healthy','open','locked','hidden','protected'].entries()){
    await a.controller.execute({type:'mesh-create',shape:'box',id,name:id,position:[-55+(index%4)*35,-35+Math.floor(index/4)*45,7],size:[14,14,14]});await a.settled();
   }
  })()`);
  let prepared=await model();
  for(const id of ['duplicate','locked','hidden','protected']){const n=node(prepared,id);n.mesh.triangles.push(...n.mesh.triangles.slice(0,3));}
  const missing=node(prepared,'missing-top'),maxZ=Math.max(...missing.mesh.verts.filter((_,i)=>i%3===2));
  missing.mesh.triangles=Array.from({length:missing.mesh.triangles.length/3},(_,i)=>missing.mesh.triangles.slice(i*3,i*3+3)).filter(face=>!face.every(index=>missing.mesh.verts[index*3+2]===maxZ)).flat();
  assert.equal(missing.mesh.triangles.length,30,'fixture removes exactly the two top triangles');
  const open=node(prepared,'open');open.mesh={verts:[0,0,0,14,0,0,0,14,0],triangles:[0,1,2]};delete open.meshSource;
  node(prepared,'locked').locked=true;node(prepared,'hidden').hidden=true;
  const protectedNode=node(prepared,'protected'),geometryDigest=crypto.createHash('sha256').update(JSON.stringify({verts:protectedNode.mesh.verts,triangles:protectedNode.mesh.triangles})).digest('hex');
  protectedNode.metadata.meshProtection={format:'FormnaroMeshProtection',version:1,regions:[{id:'contact',name:'Contact',purpose:'contact',geometryDigest,triangleIds:[0]}]};
  await run(`window.__cadTest.mutate(draft=>{draft.nodes=${JSON.stringify(prepared.nodes)};},'Synthetic damaged meshes')`);await settled();
  const original=await model(),nativeId=original.nodes[0].id,originalBytes=await snapshot(),initialUndo=await run('window.__cadTest.undoDepth()');
  check(original.nodes[0].kind==='cad'&&original.nodes.length===8,'Synthetic mixed fixture keeps native CAD first and includes healthy, damaged, open, locked, hidden and protected meshes');
  await pause(750);await settled();
  check(await snapshot()===originalBytes&&(await state()).repaired===0,'Normal mode leaves every damaged mesh and its Undo history unchanged');
  await click('[data-workbench-mode=easy]');
  if(await run(`window.__cadTest.workbenchUI.domain()!=='cad'`))await click('#easy-domain [data-easy-domain=cad]');
  await pause(750);await settled();
  check(await snapshot()===originalBytes&&(await state()).repaired===0,'Easy CAD does not repair inactive mesh parts');
  await run(`(()=>{
   const p=window.__autoRepairProof,a=window.__cadTest,dialog=document.getElementById('modal'),toast=document.getElementById('toast');
   p.modalObserver=new MutationObserver(()=>{if(dialog.open)p.modalOpens++;});p.modalObserver.observe(dialog,{attributes:true,attributeFilter:['open']});
   p.toastObserver=new MutationObserver(()=>{if(toast.textContent==='Netz konnte nicht automatisch repariert werden.')p.failureMessages++;});p.toastObserver.observe(toast,{childList:true,subtree:true,characterData:true});
   p.query=a.controller.meshQuery;a.controller.meshQuery=async(name,options)=>{const result=await p.query(name,options);if(options?.kind==='autoRepair')p.queries.push({id:options.id,status:result.status});return result;};
  })()`);
  phase='automatic-repair';progress();await click('#easy-domain [data-easy-domain=mesh]');
  await until(`window.__cadTest.easyRepair.state().repaired===2&&${idle}`,'both automatically repaired bodies and an idle queue');await settled();
  const repaired=await model(),repairedBytes=await snapshot(),automaticState=await state();
  check(await run(`!document.getElementById('modal').open&&window.__autoRepairProof.modalOpens===0`),'Entering Easy Mesh repairs the two eligible parts without opening a question or repair dialog');
  check(await run(`(async()=>{const a=window.__cadTest;for(const id of ['duplicate','missing-top'])if(!(await a.controller.inspectMeshSolid(a.getModel().nodes.find(n=>n.id===id))).ok)return false;return true;})()`),'Both automatically accepted meshes pass the real worker solid proof');
  assert.deepEqual(node(repaired,'duplicate').meshSource.sources,[node(original,'duplicate')]);
  assert.deepEqual(node(repaired,'missing-top').meshSource.sources,[node(original,'missing-top')]);
  check(node(repaired,'duplicate').meshSource.operation.options.method==='simple-v1'&&node(repaired,'missing-top').meshSource.operation.options.fillSmallHoles===true,'Duplicate cleanup and bounded small-hole filling retain their complete exact damaged originals');
  for(const id of [nativeId,'healthy','open','locked','hidden','protected'])assert.deepEqual(node(repaired,id),node(original,id),id+' changed unexpectedly');
  check(true,'Native BRep, healthy mesh, irreparable sheet and locked, hidden and protected originals remain byte-identical');
  check(await run('window.__cadTest.undoDepth()')===initialUndo+2&&automaticState.failures===0,'Each successful automatic repair adds exactly one shared Undo entry');
  const failureMessages=await run('window.__autoRepairProof.failureMessages');await pause(800);await run('window.__cadTest.easyRepair.flush()');await until(idle);await settled();
  check((await state()).unrepairable===1&&await run('window.__autoRepairProof.failureMessages')===failureMessages&&failureMessages===1&&await snapshot()===repairedBytes,'An irreparable mesh gets one short failure hint and is not retried repeatedly');
  phase='repair-history';progress();await click('[data-action=undo]');await settled();await pause(800);await until(idle);await settled();
  const undone=await model();
  assert.deepEqual(node(undone,'missing-top'),node(original,'missing-top'));
  check((await state()).repaired===2&&await run('window.__cadTest.undoDepth()')===initialUndo+1,'Undo restores the last damaged original and automatic repair respects that decision');
  await click('[data-action=redo]');await settled();await pause(700);
  check(await snapshot()===repairedBytes,'Real Redo restores the exact repaired project and retained source recipes');

  phase='damaged-stl-import';progress();
  const importedName='Automatisch-defekt.stl',rows=['solid damaged'];
  for(let i=0;i<node(original,'duplicate').mesh.triangles.length;i+=3){const face=node(original,'duplicate').mesh.triangles.slice(i,i+3);rows.push('facet normal 0 0 1','outer loop',...face.map(index=>'vertex '+node(original,'duplicate').mesh.verts.slice(index*3,index*3+3).join(' ')),'endloop','endfacet');}rows.push('endsolid damaged');
  await run(`(()=>{const data=new DataTransfer();data.items.add(new File([${JSON.stringify(rows.join('\n'))}],${JSON.stringify(importedName)},{type:'model/stl'}));const input=document.getElementById('import-file');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(`document.getElementById('modal').open&&!!document.getElementById('import-kind')`,'the ordinary STL import dialog');
  check(await run(`document.getElementById('import-kind').value==='mesh'&&document.querySelectorAll('#import-kind option').length===1`),'Real Easy Mesh STL import stays in the mesh domain');
  await run(`document.getElementById('import-auto-mesh-repair').checked=false;if(document.getElementById('import-auto-mesh-repair').checked)throw Error('Mesh import cleanup must be explicitly disabled');window.__autoRepairProof.importModalOpens=window.__autoRepairProof.modalOpens;`);
  await click('#import-confirm');await until(`!document.getElementById('modal').open`);await until(`window.__cadTest.easyRepair.state().repaired===3&&${idle}`,'automatic repair after the ordinary STL import');await settled();
  const imported=(await model()).nodes.find(n=>n.name===importedName);
  check(!!imported&&imported.meshSource?.sources?.[0]?.mesh.triangles.length===39&&await run(`window.__autoRepairProof.modalOpens===window.__autoRepairProof.importModalOpens&&!document.getElementById('modal').open`),'Damaged STL repairs automatically with import repair switched off and no extra prompt, retaining the imported triangles');
  check(await run(`window.__cadTest.controller.inspectMeshSolid(window.__cadTest.getModel().nodes.find(n=>n.name===${JSON.stringify(importedName)})).then(result=>result.ok)`),'The automatically repaired imported STL is a proven closed body');

  phase='mode-switch-cancels-pending-repair';progress();await click('[data-workbench-mode=normal]');
  await run(`(async()=>{const a=window.__cadTest;await a.controller.execute({type:'mesh-create',shape:'box',id:'delayed',name:'Delayed candidate',position:[65,55,7],size:[14,14,14]});await a.settled();await a.mutate(d=>{const n=d.nodes.find(n=>n.id==='delayed');n.mesh.triangles.push(...n.mesh.triangles.slice(0,3));});await a.settled();
   const p=window.__autoRepairProof;p.originalQuery=a.controller.meshQuery;p.gateReached=false;a.controller.meshQuery=async(name,options)=>{const result=await p.originalQuery(name,options);if(options?.kind==='autoRepair'&&options.id==='delayed'&&result.status==='repaired'&&!p.gateReached){p.gateReached=true;await new Promise(resolve=>p.release=resolve);}return result;};
  })()`);await settled();
  const delayedBefore=await snapshot(),delayedUndo=await run('window.__cadTest.undoDepth()');await click('[data-workbench-mode=easy]');await until('window.__autoRepairProof.gateReached','the deliberately delayed valid candidate query');
  await click('[data-workbench-mode=normal]');await run(`window.__autoRepairProof.release()`);await until('!window.__cadTest.easyRepair.state().running');await pause(700);await settled();
  check(await snapshot()===delayedBefore&&await run('window.__cadTest.undoDepth()')===delayedUndo,'Switching to Normal while a repair query is delayed prevents the late result from changing geometry or Undo');
  await run(`(async()=>{const a=window.__cadTest;a.controller.meshQuery=window.__autoRepairProof.originalQuery;await a.controller.execute({type:'mesh-create',shape:'box',id:'delayed-second',name:'Second early group candidate',position:[30,55,7],size:[14,14,14]});await a.settled();await a.mutate(d=>{const n=d.nodes.find(n=>n.id==='delayed-second');n.mesh.triangles.push(...n.mesh.triangles.slice(0,3));});await a.settled();})()`);
  phase='early-group-action';progress();const beforeGroupRepaired=(await state()).repaired;
  await click('[data-workbench-mode=easy]');
  await run(`(async()=>{const a=window.__cadTest;a.select([{rootId:'delayed',path:[]},{rootId:'delayed-second',path:[]}]);await a.actions.group();})()`);
  await until(`!!window.__cadTest.meshTools.state()`,'the group panel following repair flush');
  check((await state()).repaired===beforeGroupRepaired+2&&await run(`(async()=>{const a=window.__cadTest;for(const id of ['delayed','delayed-second'])if(!(await a.controller.inspectMeshSolid(a.getModel().nodes.find(n=>n.id===id))).ok)return false;return true;})()`),'An immediate Group action waits for both selected damaged meshes to be repaired before opening its tool');
  const afterGroupOpen=await snapshot();await run('window.__cadTest.cancel()');await settled();await until(idle);
  check(await snapshot()===afterGroupOpen&&!await run('!!window.__cadTest.meshTools.state()'),'Closing the group panel adds no unintended geometry edit');
  await run('window.__cadTest.select([]);window.__cadTest.view.fit()');await screenshot('easy-auto-repaired');

  phase='physical-project-roundtrip';progress();files.save=path.join(directory,'Automatische-Netzreparatur.ocad');const savedBefore=await snapshot();
  await run('window.__cadTest.save({saveAs:true})');const savedFile=fs.readFileSync(files.save),saved=JSON.parse(savedFile);
  for(const id of ['duplicate','missing-top',imported.id,'delayed','delayed-second'])assert.ok(node(saved,id).meshSource?.sources?.[0]?.mesh,id+' retained original missing from saved project');
  assert.deepEqual(node(saved,nativeId),node(original,nativeId));
  check(saved.version===8&&saved.nodes.length===11,'Physical project Save stores all CAD/mesh parts and every repaired original source');
  await run(`(async()=>{const a=window.__cadTest;await a.resetProject();const pending=a.openProject();await new Promise(resolve=>setTimeout(resolve,40));document.getElementById('project-change-discard')?.click();await pending;await a.settled();})()`);
  await until(idle);await settled();assert.deepEqual(fs.readFileSync(files.save),savedFile);
  check(await snapshot()===savedBefore,'Physical project Open restores the exact repaired model without modifying the saved file');
  await pause(1600);await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload();});await until('!!window.__cadTest?.easyRepair');await settled();await until(idle);await settled();
  check(await snapshot()===savedBefore&&await run(`window.__cadTest.workbenchUI.mode()==='easy'&&window.__cadTest.workbenchUI.domain()==='mesh'&&window.__cadTest.easyRepair.state().repaired===0`),'Real application reload preserves repaired geometry, original sources and Easy Mesh without producing extra repairs');
  phase='normal-manual-repair';progress();await click('[data-workbench-mode=normal]');
  await run(`(async()=>{const a=window.__cadTest;a.select([{rootId:'open',path:[]}]);await a.actions['mesh-repair']();})()`);await until(`!!window.__cadTest.meshRepairUI.state()?.catalog`,'the existing manual repair catalog');
  const beforeManual=await snapshot();
  check(await run(`!document.getElementById('mesh-repair-degenerate').checked&&!document.getElementById('mesh-repair-duplicates').checked&&!document.getElementById('mesh-repair-orient').checked&&!window.__cadTest.meshRepairUI.state().hasPreview`),'Normal mode keeps the existing manual repair controls and explicit preview choices');
  await click('#mesh-repair-cancel');await settled();await pause(600);
  check(await snapshot()===beforeManual&&JSON.stringify(node(await model(),nativeId))===JSON.stringify(node(original,nativeId)),'Cancelling manual repair in Normal leaves all geometry and the original native BRep unchanged');
  phase='complete';progress();await screenshot('normal-manual-unchanged');
  return {ok:true,checks,projectFile:files.save,screenshot:path.join(directory,'easy-auto-repaired.png')};
 }catch(error){
  const details=await run(`JSON.stringify({repair:window.__cadTest?.easyRepair.state(),toast:document.getElementById('toast')?.textContent,modal:document.getElementById('modal')?.open,mode:window.__cadTest?.workbenchUI.mode(),domain:window.__cadTest?.workbenchUI.domain(),queries:window.__autoRepairProof?.queries,selection:window.__cadTest?.selection()})`).catch(()=>null);
  fs.writeFileSync(path.join(directory,'failure-details.json'),JSON.stringify({phase,checks,stack:error.stack,details:details&&JSON.parse(details)},null,2));await screenshot('failed').catch(()=>{});throw error;
 }
};
