const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

function verificationDialogs(directory){
 const dialogs=require('./mixed-project-verification.cjs').verificationDialogs(directory),files=dialogs.files;files.suggestions=[];files.cancel=false;
 dialogs.exportDialog.showSaveDialog=async(_win,options)=>{files.suggestions.push(options.defaultPath);if(files.cancel)return {canceled:true};const dir=path.join(directory,'exports');fs.mkdirSync(dir,{recursive:true});return {filePath:path.join(dir,path.basename(options.defaultPath))};};return dialogs;
}
async function verifyModelPlacement(win,{directory,files}={}){
 const checks=[],run=code=>win.webContents.executeJavaScript(code),proof=async(name,code)=>{fs.writeFileSync(path.join(directory,'progress.json'),JSON.stringify({checks,pending:name}));const value=await run(`(async()=>{const a=window.__cadTest;let s=window.__placement;const check=(v,m)=>{if(!v)throw Error(m)};try{${code}}catch(e){return {__placementFailure:e.stack}}})()`);if(value?.__placementFailure)throw Error(value.__placementFailure);checks.push(name);return value;};
 const pause=()=>new Promise(r=>setTimeout(r,100));
 async function click(selector){const p=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();if(e.disabled||!r.width||!r.height)throw Error('Unavailable '+${JSON.stringify(selector)});return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,...p,button:'left',clickCount:1});await pause();await run('window.__cadTest.settled()');}
 async function shot(name){await run('window.__cadTest.view.renderReady()');await pause();fs.writeFileSync(path.join(directory,name+'.png'),(await win.webContents.capturePage()).toPNG());}
 try{
  await proof('far STL is centered on the base plane in a single import undo',`
   window.__placement={near:(x,y)=>x.every((v,k)=>Math.abs(v-y[k])<1e-5),bounds:ids=>a.controller.query('bounds',{targets:ids.map(rootId=>({rootId,path:[]}))})};s=window.__placement;
   s.stl=(offset=[1800,-720,-350])=>{const v=[[0,0,0],[40,0,0],[0,18,0],[0,0,70]].map(p=>p.map((x,k)=>x+offset[k])),t=[[0,2,1],[0,1,3],[1,2,3],[2,0,3]];return new File([['solid far',...t.flatMap(f=>['facet normal 0 0 0','outer loop',...f.map(i=>'vertex '+v[i].join(' ')),'endloop','endfacet']),'endsolid far'].join('\\n')],'Weit weg.stl')};
   s.empty=a.serialize();s.depth=a.undoDepth();s.first=await a.importFile(s.stl(),{asMesh:true});await a.settled();
   const b=await s.bounds([s.first]);check(s.near(b.center.slice(0,2),[0,0])&&Math.abs(b.min[2])<1e-5,'first placement');check(a.undoDepth()===s.depth+1,'one import undo');s.firstNode=a.getModel().nodes[0];check(s.firstNode.mesh.verts.includes(1800),'source points were rewritten');
  `);
  await proof('negative OBJ coordinates become the next 15 mm slot without moving the first import',`
   s.second=await a.importFile(new File(['v -8000 4000 250\\nv -7960 4000 250\\nv -8000 4018 250\\nf 1 2 3\\n'],'Negative.obj'));await a.settled();
   const b=await s.bounds([s.second]);check(s.near(b.center.slice(0,2),[15,15])&&Math.abs(b.min[2])<1e-5,'second placement');check(JSON.stringify(a.getModel().nodes[0])===JSON.stringify(s.firstNode),'first changed');check(a.getModel().nodes[1].kind==='referenceMesh','reference type');
  `);
  await proof('canceled import preserves the project and does not consume a slot',`
   s.beforeCancel=a.serialize();const depth=a.undoDepth();let rejected=false;try{await a.importFile(s.stl(),{asMesh:true,current:()=>false})}catch(e){rejected=e.name==='AbortError'}check(rejected&&a.serialize()===s.beforeCancel&&a.undoDepth()===depth,'cancel changed model');
   s.third=await a.importFile(s.stl(),{asMesh:true});await a.settled();check(s.near((await s.bounds([s.third])).center.slice(0,2),[30,30]),'canceled slot consumed');
  `);
  await proof('import undo removes placement and geometry together and redo restores both',`
   s.three=a.serialize();await a.actions.undo();check(a.serialize()===s.beforeCancel,'import undo not exact');await a.actions.redo();check(a.serialize()===s.three,'import redo not exact');
  `);
  await proof('real STEP file import is centered at the next slot and preserves native BRep',`
   const id='placement-native-fixture';await a.execute({kind:'create',recipe:{type:'cylinder',size:[20,20,20]},options:{id}});await a.execute({kind:'batch',commands:[{op:'transform',target:id,translate:[1400,-900,-400],space:'world'}]});
   const file=await a.controller.exportModel({format:'step',ids:[id]});s.step=await a.importFile(new File([file.data],'Far native.step'));await a.settled();const n=a.getModel().nodes.find(n=>n.id===s.step),b=await s.bounds([s.step]);
   check(n.kind==='cad'&&n.source==='step'&&n.brep,'native source lost');check(s.near(b.center.slice(0,2),[45,45])&&Math.abs(b.min[2])<1e-5,'STEP placement');
  `);
  await proof('real multipart 3MF import receives one common translation with source meshes and spacing retained',`
   s.beforeAssembly=a.serialize();const result=await a.controller.exportModel({format:'3mf'}),beforeIds=new Set(a.getModel().nodes.map(n=>n.id));
   await a.importFile(new File([result.data],'Assembly.3mf'));await a.settled();s.assembly=a.getModel().nodes.filter(n=>!beforeIds.has(n.id));check(s.assembly.length>=3,'not a multipart fixture');
   const b=await s.bounds(s.assembly.map(n=>n.id));check(s.near(b.center.slice(0,2),[60,60])&&Math.abs(b.min[2])<1e-5,'assembly center');check(s.assembly.every(n=>JSON.stringify(n.transform)===JSON.stringify(s.assembly[0].transform)),'parts moved separately');
   check(JSON.stringify(a.getModel().nodes.filter(n=>beforeIds.has(n.id)))===JSON.stringify(JSON.parse(s.beforeAssembly).nodes),'existing parts changed');s.afterAssembly=a.serialize();
   await a.actions.undo();check(a.serialize()===s.beforeAssembly,'assembly is not one undo');await a.actions.redo();check(a.serialize()===s.afterAssembly,'assembly redo');
  `);
  await proof('multipart import counts as one slot for the next file',`
   s.afterMulti=await a.importFile(s.stl(),{asMesh:true});await a.settled();const b=await s.bounds([s.afterMulti]);check(s.near(b.center.slice(0,2),[75,75]),'multipart counted per part');
  `);
  await proof('deleting an older import does not reuse the last occupied import slot',`
   const before=a.serialize();a.select([{rootId:s.second,path:[]}]);await a.actions.delete();const id=await a.importFile(s.stl(),{asMesh:true});await a.settled();check(s.near((await s.bounds([id])).center.slice(0,2),[90,90]),'reused last occupied slot');await a.actions.undo();await a.actions.undo();check(a.serialize()===before,'deletion regression undo');
  `);
  await proof('grouping prior imports keeps the next import slot advancing',`
   const before=a.serialize();await a.execute({type:'mesh-group',ids:[s.first,s.third,s.afterMulti],operation:'union',id:'placement-group-fixture'});const id=await a.importFile(s.stl(),{asMesh:true});await a.settled();check(s.near((await s.bounds([id])).center.slice(0,2),[105,105]),'import slot reset after grouping');await a.actions.undo();await a.actions.undo();check(a.serialize()===before,'group regression undo');
  `);
  await proof('the normal toolbar offers a disabled center control without selection',`
   a.select([]);const e=document.querySelector('[data-action="center"]');check(e.disabled&&e.getBoundingClientRect().width>0,'center empty state');
   a.select([{rootId:s.afterMulti,path:[]}]);check(!e.disabled,'center selected state');s.beforeCenter=a.serialize();s.centerDepth=a.undoDepth();
  `);
  await click('[data-action="center"]');
  await proof('real center button moves selected mesh to XY zero and bottom zero; one exact undo/redo',`
   const b=await s.bounds([s.afterMulti]);check(s.near(b.center.slice(0,2),[0,0])&&Math.abs(b.min[2])<1e-5,'button placement');check(a.undoDepth()===s.centerDepth+1,'center undo count');
   s.centered=a.serialize();await a.actions.undo();check(a.serialize()===s.beforeCenter,'center undo');await a.actions.redo();check(a.serialize()===s.centered,'center redo');
  `);
  await proof('multi selection receives a common world shift despite an offset tilted workplane',`
   await a.mutate(p=>{p.workplane={origin:[100,200,300],orientation:[Math.SQRT1_2,0,0,Math.SQRT1_2],reference:null};},'Testebene');s.beforeMultiCenter=a.serialize();
   a.select([s.first,s.second].map(rootId=>({rootId,path:[]})));const before=a.getModel(),targets=[s.first,s.second];await a.actions.center();const after=a.getModel(),b=await s.bounds(targets);check(s.near(b.center.slice(0,2),[0,0])&&Math.abs(b.min[2])<1e-5,'world center');
   const shifts=targets.map(id=>after.nodes.find(n=>n.id===id).transform.slice(12,15).map((v,k)=>v-before.nodes.find(n=>n.id===id).transform[12+k]));check(s.near(shifts[0],shifts[1]),'spacing changed');check(JSON.stringify(before.workplane)===JSON.stringify(after.workplane),'workplane changed');
   check(JSON.stringify(before.nodes.filter(n=>!targets.includes(n.id)))===JSON.stringify(after.nodes.filter(n=>!targets.includes(n.id))),'unselected changed');
   await a.actions.undo();check(a.serialize()===s.beforeMultiCenter,'multi undo');
  `);
  await proof('locked selection is disabled and direct centering is rejected without a model change',`
   a.select([{rootId:s.step,path:[]}]);await a.actions.lock();const before=a.serialize();check(document.querySelector('[data-action="center"]').disabled,'locked button enabled');let blocked=false;try{await a.centerSelection()}catch{blocked=true}check(blocked&&a.serialize()===before,'lock bypass');await a.actions.lock();
  `);
  await proof('native CAD and open reference center without converting or changing sources',`
   for(const id of [s.step,s.second]){a.select([{rootId:id,path:[]}]);const before=a.getModel().nodes.find(n=>n.id===id);await a.actions.center();const after=a.getModel().nodes.find(n=>n.id===id),b=await s.bounds([id]);check(s.near(b.center.slice(0,2),[0,0])&&Math.abs(b.min[2])<1e-5,'center '+before.kind);const {transform:oldPose,...old}=before,{transform:newPose,...next}=after;check(JSON.stringify(old)===JSON.stringify(next),'source changed '+before.kind);}
  `);
  await proof('Easy CAD and mesh modes expose the same center button',`
   a.select([]);a.workbenchUI.setMode('easy');for(const kind of ['cad','mesh']){await a.workbenchUI.setDomain(kind);const id=kind==='cad'?s.step:s.third;a.select([{rootId:id,path:[]}]);const e=document.querySelector('[data-action="center"]');check(!e.disabled&&e.getBoundingClientRect().width>0,'Easy center '+kind);await a.actions.center();const b=await s.bounds([id]);check(s.near(b.center.slice(0,2),[0,0]),'Easy placement');}a.workbenchUI.setMode('normal');
  `);
  await run('window.__cadTest.view.fit(window.__cadTest.selection())');await proof('center caption fits inside its own button',`const e=document.querySelector('[data-action="center"]'),r=e.getBoundingClientRect(),c=e.querySelector('.workbench-command-caption').getBoundingClientRect();check(c.left>=r.left&&c.right<=r.right,'caption overlaps adjacent buttons');`);await shot('Zur-Mitte-Normal');
  await proof('project save and reopen retain the centered geometry and poses exactly',`
   s.saved=a.serialize();await a.save();await a.openProject();check(a.serialize()===s.saved,'save round trip');s.exportBefore=a.serialize();
  `);
  for(let i=0;i<5;i++)await run("window.__cadTest.exportModel('stl')");
  const names=files.suggestions.map(n=>path.basename(n)),first=names[0],ext=path.extname(first),base=path.basename(first,ext);assert.deepEqual(names,[first,...[2,3,4,5].map(n=>base+n+ext)]);checks.push('five actual STL exports use original filename followed by 2 through 5');
  files.cancel=true;await run("window.__cadTest.exportModel('stl')");files.cancel=false;await run("window.__cadTest.exportModel('stl')");assert.equal(path.basename(files.suggestions.at(-2)),base+'6'+ext);assert.equal(path.basename(files.suggestions.at(-1)),base+'6'+ext);checks.push('canceled native export repeats the same next number');
  await run("window.__cadTest.exportModel('step')");assert.equal(path.basename(files.suggestions.at(-1)),base+'.step');checks.push('STEP starts its own filename sequence');
  for(const format of ['obj','3mf','glb','gltf','svg']){await run(`window.__cadTest.exportModel(${JSON.stringify(format)})`);await run(`window.__cadTest.exportModel(${JSON.stringify(format)})`);const pair=files.suggestions.slice(-2).map(n=>path.basename(n)),extension=path.extname(pair[0]);assert.equal(pair[1],path.basename(pair[0],extension)+'2'+extension);}checks.push('OBJ bundle, 3MF, GLB, glTF bundle and SVG all use automatic export numbering');
  await proof('all exports retain the model and undo history',`check(a.serialize()===s.exportBefore,'export changed project');`);
  const sourceId=await proof('centered source has a dedicated STL for independent file verification',`const result=await a.controller.exportModel({format:'stl',ids:[s.afterMulti]});await a.download(result.data,'Platzierung.stl',result.mime);return s.afterMulti;`);
  for(const width of [1000,800]){win.setSize(width,800);await pause();await proof('center stays reachable at '+width+' pixels',`const e=document.querySelector('[data-action="center"]'),r=e.getBoundingClientRect();check(r.width>0&&r.left>=0&&r.right<=innerWidth,'compact center');check(document.querySelector('.toolbar').scrollWidth<=document.querySelector('.toolbar').clientWidth,'toolbar overflow');`);await shot('Zur-Mitte-'+width);}
  return {ok:true,checks,sourceId,exportNames:files.suggestions.map(n=>path.basename(n))};
 }catch(error){await shot('Fehler').catch(()=>{});throw error;}
}
module.exports={verificationDialogs,verifyModelPlacement};
