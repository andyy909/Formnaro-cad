const fs=require('node:fs'),path=require('node:path');

exports.verifyCreationDomain=async function(win,{directory}={}){
 const checks=[],run=code=>win.webContents.executeJavaScript(code);
 const proof=async(name,code)=>{fs.writeFileSync(path.join(directory,'progress.json'),JSON.stringify({checks,pending:name}));const result=await run(`(async()=>{const a=window.__cadTest,s=window.__creation,check=(v,m)=>{if(!v)throw Error(m)};${code}})()`);checks.push(name);return result;};
 const pause=()=>new Promise(r=>setTimeout(r,120));
 async function shot(name){await run('window.__cadTest.view.renderReady()');await pause();fs.writeFileSync(path.join(directory,name+'.png'),(await win.webContents.capturePage()).toPNG());}
 async function click(selector){const p=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();if(e.disabled||!r.width||!r.height)throw Error('Unavailable control');return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,...p,button:'left',clickCount:1});await pause();}
 const until=async code=>{for(let i=0;i<600;i++){if(await run(code))return;await pause();}throw Error('Timeout '+code+' '+await run("document.getElementById('toast').textContent"));};
 fs.mkdirSync(directory,{recursive:true});win.setSize(1500,950);
 try{
  await proof('normal palette starts automatic with visible CAD result',`
   window.__creation={choose:async mode=>{const e=document.getElementById('creation-domain-mode');e.value=mode;await e.onchange();},kind:()=>document.getElementById('creation-domain').dataset.kind};
   check(a.workbenchUI.mode()==='normal','initial mode');check(!document.getElementById('creation-domain').hidden,'missing control');check(document.getElementById('creation-domain-mode').value==='auto'&&window.__creation.kind()==='cad','initial type');
  `);
  await click('.shape-tile[data-type=box]');await run('window.__cadTest.settled()');
  await proof('empty project click creates native CAD; CAD-only stays CAD',`check(a.getModel().nodes.length===1&&a.getModel().nodes[0].kind==='cad'&&s.kind()==='cad','CAD creation');`);
  await proof('STL import into empty normal project selects automatic mesh',`
   await a.resetProject();const v=[[0,0,0],[20,0,0],[0,20,0],[0,0,20]],faces=[[0,2,1],[0,1,3],[1,2,3],[2,0,3]],rows=['solid fixture'];for(const f of faces)rows.push('facet normal 0 0 1','outer loop',...f.map(i=>'vertex '+v[i].join(' ')),'endloop','endfacet');rows.push('endsolid fixture');
   await a.importFile(new File([rows.join('\\n')],'Synthetisch.stl'),{asMesh:true});await a.settled();s.original=a.getModel().nodes[0];check(s.original.kind==='mesh'&&s.kind()==='mesh','STL type');
   a.select([]);check(s.kind()==='mesh','mesh-only without selection');
  `);
  await click('.shape-tile[data-type=cylinder]');await run('window.__cadTest.settled()');
  await proof('normal palette click adds editable mesh cutter and keeps STL exact',`
   const nodes=a.getModel().nodes;s.cutter=nodes[1];check(nodes.length===2&&s.cutter.kind==='mesh'&&s.cutter.meshSource,'mesh cutter');check(JSON.stringify(nodes[0])===JSON.stringify(s.original),'original changed');
   await a.execute({kind:'batch',commands:[{op:'update',target:{rootId:s.cutter.id,path:[]},set:{size:[4,4,30]}},{op:'transform',target:{rootId:s.cutter.id,path:[]},position:[s.original.transform[12]+5,s.original.transform[13]+5,10],space:'world'}]});await a.settled();
  `);
  await click('#hole-btn');await run('window.__cadTest.settled()');
  await proof('normal hole role and group use actual mesh preview',`
   s.changedCutter=a.getModel().nodes[1];check(a.getModel().nodes[1].meshRole==='hole','hole role');a.select(a.getModel().nodes.map(n=>({rootId:n.id,path:[]})));s.beforeGroup=a.serialize();s.groupUndo=a.undoDepth();
  `);
  await click('[data-action=group]');await until("!!window.__cadTest.meshTools.state()&&!document.getElementById('mesh-preview').disabled");await click('#mesh-preview');await until('!!window.__cadTest.meshTools.state()?.hasPreview&&!window.__cadTest.meshTools.state()?.busy');
  await proof('changing creation mode is blocked during mesh preview',`
   let rejected=false;try{a.workbenchUI.setCreationMode('cad');}catch{rejected=true;}check(rejected&&document.getElementById('creation-domain-mode').value==='auto','preview allowed mode change');check(a.serialize()===s.beforeGroup&&a.undoDepth()===s.groupUndo,'preview changed project');
  `);
  await click('#mesh-apply');await run('window.__cadTest.settled()');
  await proof('normal subtraction removes material with one exact Undo/Redo',`
   const nodes=a.getModel().nodes;check(nodes.length===1&&nodes[0].kind==='mesh','subtraction result');const inspect=await a.controller.meshQuery('inspectSolid',{id:nodes[0].id});check(inspect.ok&&inspect.volume>0&&inspect.volume<1333.333333,'no material removed '+JSON.stringify({inspect,original:s.original.transform,cutter:s.changedCutter.transform}));
   s.afterGroup=a.serialize();check(a.undoDepth()===s.groupUndo+1,'one Undo');await a.actions.undo();await a.settled();check(a.serialize()===s.beforeGroup,'exact Undo');await a.actions.redo();await a.settled();check(a.serialize()===s.afterGroup,'exact Redo');
  `);
  await shot('normal-auto-netz');
  await proof('explicit CAD creates a native body beside meshes without conversions',`
   const before=a.serialize(),undo=a.undoDepth(),selection=JSON.stringify(a.selection()),layout=JSON.stringify(a.layoutUI.state());await s.choose('cad');check(a.serialize()===before&&a.undoDepth()===undo&&JSON.stringify(a.selection())===selection&&JSON.stringify(a.layoutUI.state())===layout,'switch mutated data');
   s.nativeId=await a.addShape('box');await a.settled();check(a.getModel().nodes.find(n=>n.id===s.nativeId).kind==='cad','explicit CAD');check(JSON.stringify(a.getModel().nodes[0])===JSON.stringify(JSON.parse(before).nodes[0]),'converted mesh');
   await s.choose('auto');check(s.kind()==='cad','selected CAD type');s.meshId=a.getModel().nodes.find(n=>n.kind==='mesh').id;
  `);
  await proof('mixed project follows the selected CAD or mesh type',`
   a.select([{rootId:s.meshId,path:[]}]);check(s.kind()==='mesh','selected mesh');a.select([{rootId:s.nativeId,path:[]}]);check(s.kind()==='cad','selected CAD');
  `);
  await proof('ambiguous automatic selection gives a visible hint and rejects creation',`
   for(const targets of [[],[{rootId:s.nativeId,path:[]},{rootId:s.meshId,path:[]}]]){a.select(targets);check(s.kind()==='ambiguous','ambiguous status');const before=a.serialize(),undo=a.undoDepth();let rejected=false;try{await a.addShape('box');}catch(e){rejected=e.message.includes('CAD/Netz');}check(rejected&&a.serialize()===before&&a.undoDepth()===undo,'ambiguous creation');}
  `);
  await shot('normal-gemischt-typwahl');
  await proof('explicit mesh overrides a CAD selection and supports text source',`
   a.select([{rootId:s.nativeId,path:[]}]);await s.choose('mesh');const id=await a.addShape('text');await a.settled();const n=a.getModel().nodes.find(n=>n.id===id);check(n.kind==='mesh'&&n.meshSource.node.type==='text','text source');
  `);
  await proof('form packages use the same explicit and automatic creation type',`
   const manifest={format:'OfflineCAD-Plugin',version:1,id:'creation-test',name:'Test',shapes:[{id:'box',name:'Testbox',nodes:[{type:'box',size:[4,4,4]}]}]};
   const id=await a.addPlugin(manifest,'box');await a.settled();check(a.getModel().nodes.find(n=>n.id===id).kind==='mesh','mesh package');await s.choose('auto');a.select([{rootId:s.nativeId,path:[]}]);const cad=await a.addPlugin(manifest,'box');await a.settled();check(a.getModel().nodes.find(n=>n.id===cad).kind==='cad','CAD package');
  `);
  await proof('viewport drop uses explicit mesh type and shared placement',`
   await s.choose('mesh');const count=a.getModel().nodes.length,transfer=new DataTransfer();transfer.setData('text/plain','box');const v=document.getElementById('viewport'),r=v.getBoundingClientRect();v.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
   for(let i=0;i<300&&a.getModel().nodes.length===count;i++)await new Promise(r=>setTimeout(r,30));await a.settled();check(a.getModel().nodes.length===count+1&&a.getModel().nodes.at(-1).kind==='mesh','drop type');
  `);
  await proof('Easy domains remain independent and normal preference survives switching',`
   const before=a.serialize(),undo=a.undoDepth();a.workbenchUI.setMode('easy');a.workbenchUI.setDomain('cad');check(document.getElementById('creation-domain').hidden,'normal selector in Easy');const id=await a.addShape('box');await a.settled();check(a.getModel().nodes.find(n=>n.id===id).kind==='cad','Easy CAD override');await a.actions.undo();await a.settled();check(a.serialize()===before,'Easy CAD undo');
   a.workbenchUI.setDomain('mesh');const mesh=await a.addShape('box');await a.settled();check(a.getModel().nodes.find(n=>n.id===mesh).kind==='mesh','Easy mesh');await a.actions.undo();await a.settled();a.workbenchUI.setMode('normal');check(document.getElementById('creation-domain-mode').value==='mesh'&&a.serialize()===before&&a.undoDepth()===undo,'normal restore');
  `);
  await proof('layout editor hides selector and cancel preserves saved layout',`
   const before=a.serialize(),layout=JSON.stringify(a.layoutUI.state());a.layoutUI.begin();check(document.getElementById('creation-domain').hidden,'editor selector');a.layoutUI.cancel();check(!document.getElementById('creation-domain').hidden&&JSON.stringify(a.layoutUI.state())===layout&&a.serialize()===before,'layout restore');
  `);
  await proof('unfinished CAD editing blocks creation preference changes',`
   a.select([{rootId:s.nativeId,path:[]}]);await a.sketchUI.open();let rejected=false;try{a.workbenchUI.setCreationMode('cad');}catch{rejected=true;}check(rejected&&document.getElementById('creation-domain-mode').value==='mesh','unfinished edit switch');a.cancel();
  `);
  for(const width of [1500,1000,800]){win.setMinimumSize(700,600);win.setSize(width,850);await pause();await proof('creation selector remains visible and reachable at '+width+' px',`
   const e=document.getElementById('creation-domain-mode'),r=e.getBoundingClientRect(),panel=document.querySelector('.left-panel');check(r.width>0&&r.left>=0&&r.right<=innerWidth,'selector clipped');check(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e,'selector covered');check(panel.scrollWidth<=panel.clientWidth,'sidebar overflow');
  `);await shot('normal-'+width);}
  win.setSize(1500,950);
  await proof('English and dark theme label the actual creation kind',`
   a.ui.settings.open();const language=document.getElementById('settings-language');language.value='en';language.dispatchEvent(new Event('change'));const theme=document.getElementById('settings-theme');theme.value='dark';theme.dispatchEvent(new Event('change'));document.getElementById('modal').close();await a.settled();check(document.getElementById('creation-domain-status').textContent==='Creates mesh shapes','English status');
  `);
  await shot('normal-dark-en');
  const beforeReload=await run('window.__cadTest.serialize()');await new Promise(r=>setTimeout(r,2300));
  await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});await until('!!window.__cadTest');await run('window.__cadTest.settled()');
  if(await run('window.__cadTest.serialize()')!==beforeReload)throw Error('Reload changed the complete project');
  await proof('portable preference and complete project survive reload',`
   check(document.getElementById('creation-domain-mode').value==='mesh','preference lost');check(JSON.parse(a.storage.getItem('offlinecad-creation-domain-v1')).mode==='mesh','portable preference');check(a.getModel().nodes.some(n=>n.kind==='cad')&&a.getModel().nodes.some(n=>n.kind==='mesh'),'project recovery');
  `);
  return {ok:true,checks};
 }catch(error){await shot('failed').catch(()=>{});fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({error:error.message,checks},null,2));throw error;}
};
