const fs=require('node:fs'),path=require('node:path');

exports.verifyMeshDisplay=async function(win,{directory}={}){
 const checks=[],run=code=>win.webContents.executeJavaScript(code);
 const proof=async(name,code)=>{await run(`(async()=>{const a=window.__cadTest,check=(ok,message)=>{if(!ok)throw Error(message);};${code}})()`);checks.push(name);};
 const shot=async name=>{await new Promise(r=>setTimeout(r,180));await run('window.__cadTest.view.renderReady()');await new Promise(r=>setTimeout(r,80));fs.writeFileSync(path.join(directory,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 win.setSize(1440,1000);
 try{
  await proof('empty scene has no mesh badge',`check(document.querySelector('.cad-mesh-display').hidden,'Empty scene badge');`);
  await proof('normal editing commands are permanently visible with Mini icons',`
   check(!document.querySelector('[data-tool-category="edit"]'),'Edit dropdown still present');
   for(const key of ['copy','paste','duplicate','delete','undo','redo','bundle','group','ungroup','align','mirror','center','drop']){const e=document.querySelector('.workbench-command-strip [data-action="'+key+'"]');check(e&&e.getBoundingClientRect().width>0&&e.getAttribute('aria-label'),'Missing direct command '+key);}
   check(document.querySelectorAll('.workbench-command-strip img').length===12,'Mini icons missing');
  `);
  await proof('real STL import defaults to opaque',`
   const v=[[-20,-15,0],[20,-15,0],[20,15,0],[-20,15,0],[-20,-15,20],[20,-15,20],[20,15,20],[-20,15,20]],t=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]],lines=['solid synthetic'];
   for(const tri of t)lines.push('facet normal 0 0 0','outer loop',...tri.map(i=>'vertex '+v[i].join(' ')),'endloop','endfacet');lines.push('endsolid synthetic');
   const wait=async fn=>{const start=Date.now();while(!fn()){if(Date.now()-start>30000)throw Error('Import timeout');await new Promise(r=>setTimeout(r,25));}};
   const data=new DataTransfer();data.items.add(new File([lines.join('\\n')],'Synthetisches Netz.stl',{type:'model/stl'}));const input=document.getElementById('import-file');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));
   await wait(()=>document.getElementById('import-kind'));document.getElementById('import-kind').value='mesh';document.getElementById('import-kind').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('import-confirm').click();await wait(()=>a.getModel().nodes.length===1&&!document.getElementById('modal').open);await a.settled();
   window.__meshDisplayId=a.getModel().nodes[0].id;check(a.getModel().nodes[0].opacity===1,'New import opacity');
  `);
  await proof('STL contours keep twelve cube edges and sharp face normals',`
   await a.refresh();await a.settled();const m=a.view.groups.bodies.children[0],g=m.geometry,c=m.children.find(c=>c.userData.meshContour);
   check(c&&c.visible&&c.userData.rootId===m.userData.rootId,'Contour ownership');
   check(c.geometry.attributes.position.count===24,'Expected twelve edges without face diagonals');
   check(c.material.depthTest&&!c.material.depthWrite,'Contour occlusion');check(!g.index&&g.attributes.position.count===36,'Stable triangle order');
   const normals=g.attributes.normal.array;for(let i=0;i<normals.length;i+=3)check([normals[i],normals[i+1],normals[i+2]].filter(v=>Math.abs(v)>.999).length===1,'Cube face is rounded');
   const saved=a.serialize(),depth=a.undoDepth();await a.refresh();await a.settled();check(a.view.groups.bodies.children[0]===m,'Contour geometry not reused');check(a.serialize()===saved&&a.undoDepth()===depth,'Display changed source/history');
  `);
  await proof('six persisted view styles preserve mesh data and reuse buffers',`
   const before=a.serialize(),depth=a.undoDepth(),m=a.view.groups.bodies.children[0],g=m.geometry;
   a.ui.settings.open();const input=document.getElementById('settings-meshDisplayStyle');check(input&&input.options.length===6,'Six style options');
   for(const [style,color]of [['blue','879eb8'],['white','e8e5dd'],['sand','bd9670'],['graphite','334452'],['fusion','b6b8ba'],['solidworks','8b99ae']]){input.value=style;await input.onchange();await a.view.renderReady();check(a.getSettings().meshDisplayStyle===style,'Current style');check(JSON.parse(a.storage.getItem('offlinecad-settings-v1')).meshDisplayStyle===style,'Persisted style');check(m.material.color.getHexString()===color,'Material style');if(style==='fusion'||style==='solidworks'){check(a.view.scene.background.getHexString()===(style==='fusion'?'f3f3f3':'e5ebf5'),'Style background');check(a.view.scene.children.find(l=>l.isHemisphereLight).intensity===(style==='fusion'?2.4:1.75),'Style lighting');}check(m.geometry===g&&a.serialize()===before&&a.undoDepth()===depth,'Model or geometry changed');}
   document.getElementById('settings-done').click();a.ui.settings.open();check(document.getElementById('settings-meshDisplayStyle').value==='solidworks','Reopened selection');const field=document.getElementById('settings-meshDisplayStyle');field.value='blue';await field.onchange();document.getElementById('settings-done').click();await a.view.renderReady();
  `);
  for(const style of ['blue','white','sand','graphite','fusion','solidworks']){
   await proof('style '+style+' is reachable in settings',`a.ui.settings.open();const field=document.getElementById('settings-meshDisplayStyle');field.value='${style}';await field.onchange();document.getElementById('settings-done').click();a.view.fit();await a.view.renderReady();check(a.getSettings().meshDisplayStyle==='${style}','Style not applied');`);
   await shot('stil-'+style);
  }
  await proof('style selection is visible and restores blue',`a.ui.settings.open();const field=document.getElementById('settings-meshDisplayStyle');check(field.options.length===6&&field.value==='solidworks','Settings selection');`);
  await shot('stilauswahl');
  await run(`(async()=>{const field=document.getElementById('settings-meshDisplayStyle');field.value='blue';await field.onchange();document.getElementById('settings-done').click();await window.__cadTest.view.renderReady();})()`);
  await proof('permanent toolbar executes duplicate, clipboard and delete with exact Undo',`
   const original=a.serialize(),click=key=>{const e=document.querySelector('.workbench-command-strip [data-action="'+key+'"]');check(e&&!e.disabled,'Unavailable '+key);e.click();},wait=async fn=>{const start=Date.now();while(!fn()){if(Date.now()-start>10000)throw Error('Toolbar action timeout');await new Promise(r=>setTimeout(r,20));}await a.settled();};
   a.select([{rootId:window.__meshDisplayId,path:[]}]);click('duplicate');await wait(()=>a.getModel().nodes.length===2);click('undo');await wait(()=>a.getModel().nodes.length===1);check(a.serialize()===original,'Duplicate Undo');
   a.select([{rootId:window.__meshDisplayId,path:[]}]);click('copy');click('paste');await wait(()=>a.getModel().nodes.length===2);click('undo');await wait(()=>a.getModel().nodes.length===1);check(a.serialize()===original,'Paste Undo');
   a.select([{rootId:window.__meshDisplayId,path:[]}]);click('delete');await wait(()=>a.getModel().nodes.length===0);click('undo');await wait(()=>a.getModel().nodes.length===1);check(a.serialize()===original,'Delete Undo');a.select([{rootId:window.__meshDisplayId,path:[]}]);
  `);
  await proof('old 60 percent meshes render opaque with depth occlusion',`
   await a.mutate(p=>{p.nodes[0].opacity=.6;});await a.settled();const m=a.view.groups.bodies.children[0];check(m.material.opacity===1&&!m.material.transparent&&m.material.depthWrite,'Legacy mesh must occlude');a.view.fit();await a.view.renderReady();check(!document.querySelector('.cad-mesh-display').hidden,'Visible mesh badge');
   window.__meshDisplayOriginal=a.serialize();window.__meshDisplayUndo=a.undoDepth();
  `);
  await shot('netz-deckend');
  await proof('view switch restores stored transparency without modifying model or history',`
   document.querySelector('.cad-mesh-display input').click();const m=a.view.groups.bodies.children[0];check(m.material.opacity===.6&&m.material.transparent&&!m.material.depthWrite,'Stored opacity restored');check(a.serialize()===window.__meshDisplayOriginal&&a.undoDepth()===window.__meshDisplayUndo,'View switch changed project');
  `);
  await shot('netz-transparenz-vergleich');
  await proof('opaque switch survives reused display buffers',`
   document.querySelector('.cad-mesh-display input').click();await a.refresh();await a.settled();check(a.view.groups.bodies.children[0].material.opacity===1,'Reused display opacity');check(a.serialize()===window.__meshDisplayOriginal&&a.undoDepth()===window.__meshDisplayUndo,'Refresh changed project');
  `);
  await proof('hidden meshes hide badge',`
   await a.mutate(p=>{p.nodes[0].hidden=true;});await a.settled();await a.view.renderReady();check(document.querySelector('.cad-mesh-display').hidden,'Hidden mesh counted');await a.actions.undo();await a.settled();
  `);
  await proof('holes keep transparent cutter style',`
   await a.mutate(p=>{p.nodes[0].meshRole='hole';});await a.settled();const m=a.view.groups.bodies.children[0];check(m.material.opacity===.28&&m.material.transparent&&m.userData.cutout,'Cutter style');check(m.children.filter(c=>c.userData.meshContour).every(c=>!c.visible),'Cutter contours hidden');await a.actions.undo();await a.settled();
  `);
  await proof('mesh previews keep translucent style',`
   const p=a.getModel(),n=p.nodes[0];a.view.setPreview([{id:n.id,kind:'mesh',transform:n.transform,mesh:n.mesh}],p,[n.id]);check(a.view.groups.preview.children[0].material.opacity===.65,'Preview opacity');a.view.clearPreview();check(a.serialize()===window.__meshDisplayOriginal,'Preview changed model');
  `);
  await proof('reference templates retain stored opacity',`
   await a.mutate(p=>{p.nodes[0].kind='referenceMesh';});await a.settled();await a.view.renderReady();check(a.view.groups.bodies.children[0].material.opacity===.6,'Reference template opacity');check(document.querySelector('.cad-mesh-display').hidden,'Reference is not editable mesh');await a.actions.undo();await a.settled();
  `);
  await proof('CAD opacity remains independent and isolation updates badge',`
   const choice=document.getElementById('creation-domain-mode');choice.value='cad';await choice.onchange();const id=await a.addShape('box');await a.mutate(p=>{p.nodes.find(n=>n.id===id).opacity=.4;});await a.settled();const m=a.view.groups.bodies.children.find(m=>m.userData.rootId===id);check(m.material.opacity===.4&&m.material.transparent,'CAD opacity');a.view.setIsolation([id]);await a.view.renderReady();check(document.querySelector('.cad-mesh-display').hidden,'Isolation badge');a.view.setIsolation(null);
  `);
  await proof('mesh selection and geometry stay intact',`
   a.select([{rootId:window.__meshDisplayId,path:[]}]);await a.view.renderReady();check(a.selection()[0].rootId===window.__meshDisplayId,'Mesh selection');const saved=JSON.parse(window.__meshDisplayOriginal),n=a.getModel().nodes.find(n=>n.id===window.__meshDisplayId);check(JSON.stringify(n)===JSON.stringify(saved.nodes[0]),'Mesh data changed');
  `);
  await proof('Easy mesh view uses opaque meshes and badge',`
   a.workbenchUI.setMode('easy');a.workbenchUI.setDomain('mesh');a.easyRepair.invalidate();await a.settled();a.view.fit();await a.view.renderReady();check(!document.querySelector('.cad-mesh-display').hidden,'Easy badge missing');check(a.view.groups.bodies.children.filter(m=>m.visible).every(m=>m.material.opacity===1),'Easy opacity');
  `);
  await shot('easy-netz-deckend');
  await proof('badge is reachable and fits compact viewport',`
   const e=document.querySelector('.cad-mesh-display'),r=e.getBoundingClientRect(),v=document.getElementById('viewport').getBoundingClientRect();check(r.left>=v.left&&r.right<=v.right&&r.bottom<=v.bottom,'Badge clipped');const input=e.querySelector('input'),b=input.getBoundingClientRect();check(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===input,'Badge blocked');
  `);
  win.setSize(1100,780);await run('window.__cadTest.view.renderReady()');await new Promise(r=>setTimeout(r,150));await shot('easy-kompakt');
  await proof('compact badge stays accessible',`const e=document.querySelector('.cad-mesh-display input'),r=e.getBoundingClientRect();check(r.width>0&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e,'Compact badge blocked');`);
  await proof('Easy CAD domain hides mesh badge',`a.workbenchUI.setDomain('cad');await a.settled();await a.view.renderReady();check(document.querySelector('.cad-mesh-display').hidden,'Other domain badge');`);
  await proof('STL inspector color changes the rendered material and only one reversible appearance step',`
   a.workbenchUI.setMode('normal');a.select([{rootId:window.__meshDisplayId,path:[]}]);await a.settled();
   window.__meshColorProof={original:a.serialize(),depth:a.undoDepth(),mesh:JSON.stringify(a.getModel().nodes.find(n=>n.id===window.__meshDisplayId).mesh)};
   window.__setMeshColor=async color=>{const input=document.getElementById('object-color');check(input&&!input.disabled,'Color picker unavailable');input.value=color;input.dispatchEvent(new Event('change',{bubbles:true}));const t=Date.now();while(a.getModel().nodes.find(n=>n.id===window.__meshDisplayId).color!==color||a.controller.state().busy){if(Date.now()-t>30000)throw Error('Color change timeout');await new Promise(r=>setTimeout(r,20));}await a.settled();await a.view.renderReady();};
   await window.__setMeshColor('#1025d5');const n=a.getModel().nodes.find(n=>n.id===window.__meshDisplayId),m=a.view.groups.bodies.children.find(m=>m.userData.rootId===n.id);check(m.material.color.getHexString()==='1025d5','Selected blue hidden by view preset '+JSON.stringify({node:n.color,record:m.userData.record.color,material:m.material.color.getHexString(),style:m.userData.meshStyleKey,vertices:m.material.vertexColors}));check(JSON.stringify(n.mesh)===window.__meshColorProof.mesh&&a.undoDepth()===window.__meshColorProof.depth+1,'Color changed geometry/history');
  `);
  await shot('stl-eigene-farbe-blau');
  await proof('Undo Redo and Save Open preserve the chosen STL color',`
   const p=window.__meshColorProof,applied=a.serialize();await a.actions.undo();await a.settled();check(a.serialize()===p.original,'Color Undo differs');await a.actions.redo();await a.settled();check(a.serialize()===applied,'Color Redo differs');await a.controller.open(JSON.parse(applied));await a.settled();await a.view.renderReady();check(a.view.groups.bodies.children.find(m=>m.userData.rootId===window.__meshDisplayId).material.color.getHexString()==='1025d5','Reopen hides own color');
  `);
  await proof('all six display styles keep the existing selected STL color visible',`
   const before=a.serialize();a.ui.settings.open();const input=document.getElementById('settings-meshDisplayStyle');for(const style of ['blue','white','sand','graphite','fusion','solidworks']){input.value=style;await input.onchange();await a.view.renderReady();check(a.view.groups.bodies.children.find(m=>m.userData.rootId===window.__meshDisplayId).material.color.getHexString()==='1025d5','Preset hides chosen color: '+style);check(a.serialize()===before,'View style changed saved model');}document.getElementById('settings-done').click();
  `);
  await proof('dark theme and a second chosen color refresh reused render buffers',`
   a.ui.settings.open();const theme=document.getElementById('settings-theme');theme.value='dark';await theme.onchange();document.getElementById('settings-done').click();a.select([{rootId:window.__meshDisplayId,path:[]}]);await a.settled();await window.__setMeshColor('#ef3344');await a.view.renderReady();check(a.view.groups.bodies.children.find(m=>m.userData.rootId===window.__meshDisplayId).material.color.getHexString()==='ef3344','Dark/red color stale');
  `);
  await shot('stl-eigene-farbe-dunkel');
  return {ok:true,checks,cloudRequests:0,screenshots:['stl-eigene-farbe-blau','stl-eigene-farbe-dunkel'].map(name=>path.join(directory,name+'.png'))};
 }catch(error){await shot('failed').catch(()=>{});fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({error:error.message,checks},null,2));throw error;}
};
