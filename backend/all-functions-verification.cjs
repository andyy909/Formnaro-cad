const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const normalize=value=>{const copy=structuredClone(value),round=v=>typeof v==='number'?Number(v.toPrecision(12)):Array.isArray(v)?v.map(round):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,n])=>[k,round(n)])):v;const visit=n=>{if(n.kind==='cad'&&n.stats)n.stats=round(n.stats);n.children?.forEach(visit);};copy.nodes?.forEach(visit);return copy;};
function verificationDialogs(directory){const files={save:path.join(directory,'All-Functions.ocad')};return {files,projectDialog:{showSaveDialog:async()=>({filePath:files.save}),showOpenDialog:async()=>({filePaths:[files.save]})},exportDialog:{showSaveDialog:async(_win,options)=>{const dir=path.join(directory,'exports');fs.mkdirSync(dir,{recursive:true});return {filePath:path.join(dir,(files.exportPrefix?files.exportPrefix+'-':'')+path.basename(options.defaultPath))};}}};}
async function verifyAllFunctions(win,app,{directory,files,phase='interactions'}={}){
 if(phase==='chains')return require('./all-functions-chains.cjs').verifyChainedWorkflows(win,app,{directory,files});
 const checks=[],cycles=[],started=Date.now(),js=code=>win.webContents.executeJavaScript(code),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const check=(condition,label)=>{assert(condition,label);checks.push(label);fs.writeFileSync(path.join(directory,'progress.json'),JSON.stringify({phase,checks,cycles,elapsedMs:Date.now()-started},null,2));};
 const until=async(code,ms=60000)=>{const begin=Date.now();while(Date.now()-begin<ms){if(await js(code))return;await pause(50);}throw Error('Timed out: '+code);};
 const settled=async()=>{await js('window.__cadTest.settled()');await pause(50);};
 const snapshot=()=>js('window.__cadTest.serialize()'),model=()=>js('window.__cadTest.getModel()');
 async function key(keyCode,modifiers=[]){for(const type of ['keyDown','keyUp'])win.webContents.sendInputEvent({type,keyCode,modifiers});await pause(60);}
 async function click(selector){const p=await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,top=document.elementFromPoint(x,y);if(e.disabled||!r.width||!r.height||!(e===top||e.contains(top)))throw Error('Unreachable '+${JSON.stringify(selector)});return{x:Math.round(x),y:Math.round(y)};})()`);for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,...p});await pause(60);}
 async function field(id,value){await click('#'+id);await key('A',['control']);await win.webContents.insertText(String(value));await key('Tab');await settled();}
 async function select(id){await click('[data-root-id="'+id+'"][data-path="[]"]');await settled();}
 async function setup(kind='cad'){
  await js(`(async()=>{const a=window.__cadTest;a.cancel();document.getElementById('modal').close();await a.settled();if(a.workbenchUI.mode()!=='normal')a.workbenchUI.setMode('normal');await a.resetProject();a.workbenchUI.setMode('easy');a.workbenchUI.setDomain(${JSON.stringify(kind)});})()`);
  await click('.shape-tile[data-type="box"]');await until('window.__cadTest.getModel().nodes.length===1');await settled();await js('window.__cadTest.workbenchUI.setMode("normal")');await settled();
  const n=(await model()).nodes[0];assert.equal(n.kind,kind);return n.id;
 }
 async function save(){await js('document.activeElement?.blur()');await key('S',['control']);await until(`!!window.__cadTest.activeProjectFile()`);await settled();const p=JSON.parse(fs.readFileSync(files.save,'utf8'));assert.deepEqual(normalize(p).nodes,normalize(await model()).nodes);return {file:files.save,sha256:hash(fs.readFileSync(files.save))};}
 async function screenshot(name){await js('window.__cadTest.view.renderReady()');const file=path.join(directory,name+'.png');fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());return file;}
 try{
  await until('!!window.__cadTest');await js('window.__cadTest.layoutUI.ready()');win.setMinimumSize(800,600);win.setSize(1280,900);
  if(phase==='supplemental'){
   await setup('cad');const before=await snapshot(),undo=await js('window.__cadTest.undoDepth()');
   const width=await js(`document.getElementById('viewport').getBoundingClientRect().width`);
   await click('#collapse-library');await click('#collapse-inspector');
   check(await js(`document.getElementById('viewport').getBoundingClientRect().width`)>width+400,'Both sidebar arrows enlarge the canvas without modifying the model');
   if(await js("document.body.dataset.inspectorCollapsed==='true'"))await click('#collapse-inspector');if(await js("document.getElementById('ai-chat').classList.contains('collapsed')"))await click('#ai-chat-toggle');await until(`document.body.dataset.inspectorCollapsed==='false'&&!document.getElementById('ai-chat-body').hidden`);await click('#collapse-library');
   await click('#settings-open');await click('#settings-legal');await until(`document.getElementById('modal-title').textContent==='Impressum und Lizenz'`);
   check((await js(`document.getElementById('legal-version').textContent`)).includes(app.getVersion()),'Actual settings open the correct versioned license dialog');
   check(await js(`document.getElementById('legal-own-text').textContent`)===fs.readFileSync(path.join(app.getAppPath(),'LICENSE.txt'),'utf8'),'Application license text is complete and exact');
   await js(`document.getElementById('legal-third-party').open=true`);await until(`!document.getElementById('legal-document-save').disabled`);
   check(await js(`document.getElementById('legal-document-text').textContent`)===fs.readFileSync(path.join(app.getAppPath(),'THIRD-PARTY-LICENSES.txt'),'utf8'),'Third-party license document loads fully offline');
   await screenshot('licenses');await key('Escape');await settled();check(await snapshot()===before&&await js('window.__cadTest.undoDepth()')===undo,'Settings and license viewing preserve geometry and history');
   await js(`(async()=>{const a=window.__cadTest;await a.resetProject();await a.addShape('text');await a.settled();})()`);
   check(await js(`document.querySelectorAll('#text-font option').length`)===64,'All 64 bundled fonts appear in the original native text inspector');
   const textBefore=await snapshot();await js(`document.getElementById('text-font').value='free-lato';document.getElementById('text-font').dispatchEvent(new Event('change',{bubbles:true}))`);await settled();
   check((await model()).nodes[0].recipe.font==='free-lato','Native font selection rebuilds real text');await click('[data-action="undo"]');await settled();check(await snapshot()===textBefore,'Font Undo restores exact authored native geometry');await click('[data-action="redo"]');await settled();
   await field('shape-text','ÄÖÜß ABO8');check((await model()).nodes[0].recipe.text==='ÄÖÜß ABO8'&&(await model()).nodes[0].stats.volume>0,'Umlauts and interior glyph contours produce positive native material');
   const assets=path.join(app.getAppPath(),'dist/assets'),fontAsset=fs.readdirSync(assets).find(n=>/^free-lato-[^-]+\.js$/.test(n));assert(fontAsset,'Bundled Lato asset');const fontModule=fs.readFileSync(path.join(assets,fontAsset),'utf8'),base64=fontModule.match(/`([A-Za-z0-9+/=\r\n]+)`/);assert(base64,'Bundled font bytes');
   const fontFile=path.join(directory,'Synthetic-Lato.ttf');fs.writeFileSync(fontFile,Buffer.from(base64[1],'base64'));
   const attached=win.webContents.debugger.isAttached();if(!attached)win.webContents.debugger.attach('1.3');
   try{const root=await win.webContents.debugger.sendCommand('DOM.getDocument'),input=await win.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:root.root.nodeId,selector:'#text-font-file'});await win.webContents.debugger.sendCommand('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[fontFile]});await until(`document.getElementById('text-font-status').textContent.includes('Schrift importiert')`);}finally{if(!attached&&win.webContents.debugger.isAttached())win.webContents.debugger.detach();}
   const custom=await js(`[...document.querySelectorAll('#text-font option')].find(o=>o.value.startsWith('custom-')).value`);await js(`document.getElementById('text-font').value=${JSON.stringify(custom)};document.getElementById('text-font').dispatchEvent(new Event('change',{bubbles:true}))`);await settled();check((await model()).nodes[0].recipe.font===custom,'Real file-input font import persists and rebuilds native text');
   await save();const saved=await snapshot();await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload();});await until('!!window.__cadTest');await settled();check(await snapshot()===saved,'Imported font and native text survive real renderer reload and worker restart');await js(`window.__cadTest.select([{rootId:window.__cadTest.getModel().nodes[0].id,path:[]}])`);await field('shape-text','Nach Neustart');check((await model()).nodes[0].recipe.text==='Nach Neustart','Imported font remains editable after restart');await screenshot('fonts-after-reload');
   const beforeRemoval=await snapshot();await click('#text-font-manage');await click('#cad-font-list button');await until(`document.querySelectorAll('#cad-font-list button').length===0`);await key('Escape');
   check(await snapshot()===beforeRemoval&&await js(`document.getElementById('shape-text').disabled&&document.getElementById('text-font-status').textContent.includes('Originalschrift fehlt')`),'Removing an imported font preserves exact native text and explains the missing original font');
   await js(`window.__cadTest.exportModel('stl')`);const exported=path.join(directory,'exports',((await model()).name)+'.stl');check(fs.statSync(exported).size>100&&await snapshot()===beforeRemoval,'Text with removed font still exports its confirmed native geometry to a physical STL');
   await js(`document.getElementById('text-font').value='free-lato';document.getElementById('text-font').dispatchEvent(new Event('change',{bubbles:true}))`);await settled();check((await model()).nodes[0].recipe.font==='free-lato'&&!await js(`document.getElementById('shape-text').disabled`),'Explicit replacement by a bundled font restores text editing');
   const invalid=path.join(directory,'Invalid.ttf');fs.writeFileSync(invalid,'Not a font');const beforeInvalid=await snapshot(),libraryBefore=await js(`window.__cadTest.storage.getItem('offlinecad-fonts-v1')`);
   if(!win.webContents.debugger.isAttached())win.webContents.debugger.attach('1.3');try{const root=await win.webContents.debugger.sendCommand('DOM.getDocument'),input=await win.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:root.root.nodeId,selector:'#text-font-file'});await win.webContents.debugger.sendCommand('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[invalid]});await until(`document.getElementById('text-font-status').textContent.includes('unvollständig')`);}finally{win.webContents.debugger.detach();}
   check(await snapshot()===beforeInvalid&&await js(`window.__cadTest.storage.getItem('offlinecad-fonts-v1')`)===libraryBefore,'Invalid TTF file input retains model and portable font library');
   const sizingBefore=await snapshot(),rect=await js(`(()=>{const r=document.getElementById('resize-libraryWidth').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+70),width:document.querySelector('.left-panel').getBoundingClientRect().width};})()`);
   win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:rect.x,y:rect.y});for(let i=1;i<=5;i++){win.webContents.sendInputEvent({type:'mouseMove',button:'left',modifiers:['leftButtonDown'],x:rect.x+20*i,y:rect.y});await pause(35);}win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:rect.x+100,y:rect.y});await until('!window.__cadTest.layoutUI.isSaving()');
   check(await js(`document.querySelector('.left-panel').getBoundingClientRect().width`)>rect.width+80&&await snapshot()===sizingBefore,'Real divider drag changes sidebar width while preserving authored geometry');
  }else if(phase==='interactions'){
   const actions=await js(`({buttons:[...new Set([...document.querySelectorAll('[data-action]')].map(e=>e.dataset.action))].sort(),palette:[...new Set([...document.querySelectorAll('.shape-tile[data-type]')].map(e=>e.dataset.type))].sort()})`);
   fs.writeFileSync(path.join(directory,'reachable-controls.json'),JSON.stringify(actions,null,2));check(actions.palette.length===23,'Inventory: all 23 standard palette shapes exist');
   for(let seed=1;seed<=10;seed++){
    const id=await setup(seed%2?'cad':'mesh');await select(id);const original=await snapshot(),history=await js('window.__cadTest.undoDepth()');
    let edited;
    for(let step=0;step<30;step++){
     switch(step%6){
      case 0: await select(id);check((await js('window.__cadTest.selection()'))[0]?.rootId===id,`Seed ${seed} step ${step}: real tree selection`);break;
      case 1: await field('pos-0',seed+(step/6|0)+1);edited=await snapshot();check(edited!==original,`Seed ${seed} step ${step}: numeric world-position edit`);break;
      case 2: await click('[data-action="undo"]');await settled();check(await snapshot()===original,`Seed ${seed} step ${step}: exact Undo`);break;
      case 3: await click('[data-action="redo"]');await settled();check(await snapshot()===edited,`Seed ${seed} step ${step}: exact Redo`);break;
      case 4: {await js(`(async()=>{const a=window.__cadTest;window.__allBefore=a.serialize();window.__allUndo=a.undoDepth();window.__allPreview=await a.access.preview({revision:a.controller.revision(),commands:[{op:'create',type:'sphere',size:[4,4,4],as:'candidate'}]});await a.showPreview(window.__allPreview);})()`);await key('Escape');await settled();check(await snapshot()===edited&&await js('window.__cadTest.undoDepth()===window.__allUndo'),`Seed ${seed} step ${step}: preview Escape preserves confirmed model/history`);break;}
      case 5: await click('[data-action="undo"]');await settled();check(await snapshot()===original&&await js('window.__cadTest.undoDepth()')===history,`Seed ${seed} step ${step}: cycle returns exactly to origin`);break;
     }
    }
   }
   for(const width of [800,1000,1280,1840]){win.setSize(width,950);await pause(200);await js('window.__cadTest.workbenchUI.setMode("easy")');await pause(100);check(await js(`document.querySelector('.shape-tile[data-type="box"]')!==null&&document.getElementById('settings-open')!==null`),`Easy UI available at ${width}px`);await screenshot('easy-'+width);await js('window.__cadTest.workbenchUI.setMode("normal")');}
  }else if(phase==='soak'){
   const id=await setup('cad');await select(id);const original=(await model()).nodes[0],initialMemory=app.getAppMetrics().reduce((s,p)=>s+p.memory.workingSetSize,0)*1024;
   do{
    const cycleStarted=Date.now();await select(id);await field('pos-0',cycles.length%17+1);const edited=await snapshot();await click('[data-action="undo"]');await settled();await click('[data-action="redo"]');await settled();assert.equal(await snapshot(),edited);const physical=await save();
    const node=(await model()).nodes[0];assert.equal(JSON.stringify(node.brep),JSON.stringify(original.brep));assert.equal(JSON.stringify(node.recipe),JSON.stringify(original.recipe));
    cycles.push({cycle:cycles.length+1,elapsedMs:Date.now()-started,workingSetBytes:app.getAppMetrics().reduce((s,p)=>s+p.memory.workingSetSize,0)*1024,...physical});check(true,'Soak cycle '+cycles.length+': edit/Undo/Redo/physical save preserves native source');
    if(cycles.length%5===0){await js('window.__cadTest.openProject()');await settled();check(await snapshot()===edited,'Soak cycle '+cycles.length+': normal reopen exact');}
    await pause(Math.max(0,30000-(Date.now()-cycleStarted)));
   }while(Date.now()-started<30*60000||cycles.length<30);
   check(Date.now()-started>=30*60000&&cycles.length>=30,'At least 30 minutes and 30 completed cycles');
   fs.writeFileSync(path.join(directory,'memory.json'),JSON.stringify({initialMemory,cycles},null,2));await screenshot('soak-final');
  }else if(phase==='recovery-write'){
   const id=await setup('cad');await select(id);await field('pos-0',17);await field('object-name','Wiederherstellung ä');await settled();
   const expected=await js('JSON.parse(window.__cadTest.serializeWorkspace())');await until(`window.__cadTest.storage.getItem('offlinecad-autosave-v7')!==null||window.__cadTest.storage.getItem('offlinecad-autosave-v8')!==null`);await pause(2000);
   const stored=await js(`window.__cadTest.storage.getItem('offlinecad-autosave-v8')??window.__cadTest.storage.getItem('offlinecad-autosave-v7')`);assert.deepEqual(normalize(JSON.parse(stored)).nodes,normalize(expected).nodes);
   fs.writeFileSync(path.join(directory,'crash-ready.json'),JSON.stringify({pid:process.pid,profile:app.getPath('userData'),expected,autosaveSha256:hash(stored)},null,2));
   await new Promise(()=>{});
  }else if(phase==='recovery-read'){
   const checkpoint=JSON.parse(fs.readFileSync(path.join(directory,'crash-ready.json'),'utf8'));assert.equal(app.getPath('userData'),checkpoint.profile);assert.notEqual(process.pid,checkpoint.pid);assert.deepEqual(normalize(await model()).nodes,normalize(checkpoint.expected).nodes);check(true,'A distinct application process recovers exact authored sources after a controlled forced termination');await save();check(true,'Recovered model can be saved through normal file IPC');await field('pos-0',23);check((await model()).nodes[0].transform[12]===23,'Recovered native body remains editable');await screenshot('recovered');
  }else if(phase==='limits'){
   for(const divisions of [9,28,50]){
    await setup('mesh');
    const result=await js(`(async()=>{const a=window.__cadTest,n=a.getModel().nodes[0],mesh=n.mesh,d=${divisions},rows=['solid synthetic'];let triangles=0;
     for(let t=0;t<mesh.triangles.length;t+=3){const p=[0,1,2].map(k=>mesh.verts.slice(mesh.triangles[t+k]*3,mesh.triangles[t+k]*3+3)),at=(i,j)=>[0,1,2].map(k=>Math.round((p[0][k]+(p[1][k]-p[0][k])*i/d+(p[2][k]-p[0][k])*j/d)*1e6)/1e6),tri=(v)=>{rows.push('facet normal 0 0 0','outer loop',...v.map(p=>'vertex '+p.join(' ')),'endloop','endfacet');triangles++;};for(let i=0;i<d;i++)for(let j=0;j<d-i;j++){tri([at(i,j),at(i+1,j),at(i,j+1)]);if(i+j<d-1)tri([at(i+1,j),at(i+1,j+1),at(i,j+1)]);}}
     rows.push('endsolid synthetic');await a.importFile(new File([rows.join('\\n')],'Synthetic-'+triangles+'.stl',{type:'model/stl'}),{asMesh:true});await a.settled();const imported=a.getModel().nodes.at(-1);if(imported.mesh.triangles.length/3!==triangles)throw Error('Import triangle count changed');const material=await a.controller.inspectMeshSolid(imported);return {triangles,material,geometry:imported.mesh};})()`);
    check(result.triangles===12*divisions**2&&result.material.ok===true,'Actual closed-material synthetic STL import '+result.triangles+' triangles');
    fs.writeFileSync(path.join(directory,'limit-'+result.triangles+'.json'),JSON.stringify({triangles:result.triangles,material:result.material}));
    await save();check(true,'Dense imported mesh survives physical project save at '+result.triangles+' triangles');
   }
  }else throw Error('Unknown comprehensive phase');
  return {ok:true,phase,checks,cycles,elapsedMs:Date.now()-started,isolatedProfile:true,normalFileIpc:true,cloudRequests:0};
 }catch(error){await screenshot('failed').catch(()=>{});fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({ok:false,phase,error:error.message,stack:error.stack,checks,cycles},null,2));throw error;}
}
module.exports={verifyAllFunctions,verificationDialogs};
