const fs=require('node:fs'),path=require('node:path');

exports.verifyMoveDimensions=async function(win,{directory}={}){
 const checks=[],pause=()=>new Promise(r=>setTimeout(r,100)),run=code=>win.webContents.executeJavaScript(`(async()=>{const a=window.__cadTest,check=(v,m)=>{if(!v)throw Error(m)};${code}})()`);
 const proof=async(name,code)=>{fs.writeFileSync(path.join(directory,'progress.json'),JSON.stringify({checks,pending:name}));await run(code);checks.push(name);};
 win.webContents.debugger.attach('1.3');let pressed=false;
 async function mouse(type,p){if(type==='mousePressed')pressed=true;if(type==='mouseReleased')pressed=false;await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,x:Math.round(p.x),y:Math.round(p.y),button:pressed||type==='mouseReleased'?'left':'none',buttons:pressed?1:0,clickCount:1});await pause();}
 async function capture(name){win.showInactive();await pause();await run('await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);');fs.writeFileSync(path.join(directory,name+'.png'),(await win.webContents.capturePage()).toPNG());win.hide();}
 async function setup({kind='cad',mode='normal',view='top',size=1500,plane=false,multi=false,source=false,tool='translate',snap='1'}={}){
  win.setSize(size,980);
  return run(`
   a.cancel();a.workbenchUI.setMode('normal');await a.resetProject();
   if(${source}){await a.loadDemo();const root=a.getModel().nodes[0];a.select([{rootId:root.id,path:[root.children.find(n=>!n.solid).id]}]);}
   else if(${JSON.stringify(kind)}==='cad'){
    await a.execute({kind:'batch',commands:[{op:'create',type:'box',size:[30,24,18],pos:[0,0,24]},...(${multi}?[{op:'create',type:'box',size:[14,14,14],pos:[42,0,24]}]:[])]});a.select(a.getModel().nodes.map(n=>({rootId:n.id,path:[]})));
   }else{await a.mutate(p=>{p.nodes=[{id:'mesh',kind:'mesh',name:'Testnetz',transform:[-1.2,0,0,0,.3,1,0,0,0,0,1,0,0,0,15,1],mesh:{verts:[-15,-12,0,15,-12,0,15,12,0,-15,12,0,-15,-12,18,15,-12,18,15,12,18,-15,12,18],triangles:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]}}];});a.select([{rootId:'mesh',path:[]}]);}
   if(${plane})await a.mutate(p=>{p.workplane.origin=[11,-7,4];p.workplane.orientation=[Math.sin(Math.PI/12),0,0,Math.cos(Math.PI/12)];p.coordinateMode='plane';});
   const targets=a.selection();if(${JSON.stringify(mode)}==='easy'){a.workbenchUI.setMode('easy');a.workbenchUI.setDomain(${JSON.stringify(kind)});}a.select(targets);
   const snap=document.getElementById('snap');snap.value=${JSON.stringify(snap)};snap.dispatchEvent(new Event('change',{bubbles:true}));
   a.setMode(${JSON.stringify(tool)});await a.settled();a.view.setView(${JSON.stringify(view)});a.view.fit(a.selection());
   if(a.view.camera().isPerspectiveCamera)a.view.toggleProjection();await new Promise(r=>setTimeout(r,180));
   const target=a.selection()[0],item=a.getScene().objects.find(o=>o.target.rootId===target.rootId&&o.id===(target.path.at(-1)||target.rootId));
   const candidates=[[.82,.78],[.18,.22],[.18,.78],[.82,.22],[.5,.85],[.15,.5]].map(([x,y])=>a.projectPoint([item.worldBounds.min[0]+item.worldBounds.size[0]*x,item.worldBounds.min[1]+item.worldBounds.size[1]*y,item.worldBounds.max[2]]));
   const center=a.projectPoint(item.worldBounds.center),handles=a.getHandles().map(h=>a.projectPoint(h.point));
   const p=candidates.find(p=>document.elementFromPoint(p.x,p.y)===a.view.canvas&&Math.hypot(p.x-center.x,p.y-center.y)>110&&handles.every(h=>Math.hypot(p.x-h.x,p.y-h.y)>22)&&a.view.visualHit({clientX:p.x,clientY:p.y})?.object.userData.rootId===target.rootId);
   check(p,'no unobstructed body point for fixture');
   window.moveBefore={model:a.serialize(),undo:a.undoDepth(),revision:a.controller.revision(),nodes:a.getModel().nodes,targets:a.selection(),worlds:a.selection().map(t=>{const o=a.getScene().objects.find(o=>o.target.rootId===t.rootId&&o.id===(t.path.at(-1)||t.rootId));return {id:o.id,matrix:o.worldMatrix};}),matrices:[...a.view.groups.bodies.children,...a.view.groups.sources.children].filter(m=>m.visible).map(m=>({uuid:m.uuid,source:m.userData.sourceTarget?JSON.stringify(m.userData.sourceTarget):null,matrix:m.matrix.toArray()}))};
   return p;
  `);
 }
 async function live(name){await proof(name,`
   const b=window.moveBefore,o=document.querySelector('.cad-move-dimensions'),labels=[...o.querySelectorAll('.cad-move-dimension')];
   check(o.checkVisibility()&&labels.length===2&&labels.every(e=>e.checkVisibility()&&e.textContent.includes('mm')),'missing live XY measurements');
   check(getComputedStyle(o).pointerEvents==='none','overlay captures pointer');check(!document.querySelector('.cad-scale-dimensions').checkVisibility(),'move showed resize dimensions');
   check(a.serialize()===b.model&&a.undoDepth()===b.undo,'preview changed model/history');
   const moved=b.matrices.map(old=>{const m=[...a.view.groups.bodies.children,...a.view.groups.sources.children].find(m=>m.uuid===old.uuid||old.source&&JSON.stringify(m.userData.sourceTarget)===old.source);return m?{old,now:m.matrix.toArray()}:null;}).filter(Boolean).find(m=>m.now.some((v,k)=>v!==m.old.matrix[k]));check(moved,'no visual movement');
   const delta=[0,1,2].map(k=>moved.now[12+k]-moved.old.matrix[12+k]),q=a.getModel().workplane.orientation;
   const x=q[0],y=q[1],z=q[2],w=q[3],axes=[[1-2*(y*y+z*z),2*(x*y+w*z),2*(x*z-w*y)],[2*(x*y-w*z),1-2*(x*x+z*z),2*(y*z+w*x)]];
   window.moveValues=labels.map(e=>Number(e.dataset.value));window.moveDelta=delta;
   axes.forEach((axis,k)=>check(Math.abs(axis.reduce((s,v,j)=>s+v*delta[j],0)-window.moveValues[k])<1e-7,'measurement differs from actual snapped preview'));
   const rs=labels.map(e=>e.getBoundingClientRect()),rect=document.getElementById('viewport').getBoundingClientRect();
   check(rs.every(r=>r.left>=rect.left&&r.right<=rect.right&&r.top>=rect.top&&r.bottom<=rect.bottom),'clipped labels');check(!(rs[0].left<rs[1].right&&rs[0].right>rs[1].left&&rs[0].top<rs[1].bottom&&rs[0].bottom>rs[1].top),'labels overlap');
   check([...o.querySelectorAll('path')].every(p=>p.getAttribute('d')&&!/NaN|Infinity/.test(p.getAttribute('d'))),'invalid ground lines');
  `);}
 async function finish(p,name){await mouse('mouseReleased',p);await proof(name,`
   const b=window.moveBefore;for(let n=0;n<400&&a.controller.revision()===b.revision;n++)await new Promise(r=>setTimeout(r,10));await a.settled();
   check(a.controller.revision()!==b.revision&&a.undoDepth()===b.undo+1,'move must commit exactly one Undo '+JSON.stringify({revision:a.controller.revision(),before:b.revision,undo:a.undoDepth(),depth:b.undo,delta:window.moveDelta,toast:document.getElementById('toast').textContent}));check(!document.querySelector('.cad-move-dimensions').checkVisibility(),'overlay remained after release');
   const find=(nodes,id)=>{for(const n of nodes){if(n.id===id)return n;const v=find(n.children||[],id);if(v)return v;}},current=a.getModel();
   for(const target of b.targets){const id=target.path.at(-1)||target.rootId,old=find(b.nodes,id),node=find(current.nodes,id);check(node,'target lost');
    if(!target.path.length)window.moveDelta.forEach((v,k)=>check(Math.abs(node.transform[12+k]-old.transform[12+k]-v)<1e-7,'commit differs from preview'));
    for(const key of ['brep','mesh','recipe','children','locked','solid','meshRole'])check(JSON.stringify(node[key])===JSON.stringify(old[key]),'move rewrote '+key);
   }
   for(const old of b.worlds){const o=a.getScene().objects.find(o=>o.id===old.id);check(o,'world target lost');window.moveDelta.forEach((v,k)=>check(Math.abs(o.worldMatrix[12+k]-old.matrix[12+k]-v)<1e-7,'world commit differs from preview'));check(old.matrix.slice(0,12).every((v,k)=>Math.abs(o.worldMatrix[k]-v)<1e-7),'move changed scale or rotation');}
   const after=a.serialize();await a.actions.undo();await a.settled();check(a.serialize()===b.model,'Undo differs from original');await a.actions.redo();await a.settled();check(a.serialize()===after,'Redo differs');
  `);}
 fs.mkdirSync(directory,{recursive:true});
 try{
  const cases=[
   {kind:'cad',view:'iso',dx:64,dy:-42},
   {kind:'cad',dx:-55,dy:35},
   {kind:'cad',dx:0,dy:-40},
   {kind:'cad',dx:38,dy:0},
   {kind:'mesh',mode:'easy',view:'iso',size:1040,dx:45,dy:30},
   {kind:'cad',mode:'easy',multi:true,dx:44,dy:-30},
   {kind:'cad',plane:true,view:'iso',dx:45,dy:-32},
   {kind:'cad',source:true,dx:32,dy:-25},
   {kind:'cad',tool:'rotate',snap:'0.1',dx:29,dy:-21}
  ];
  for(const [i,c]of cases.entries()){
   const p=await setup(c),end={x:p.x+c.dx,y:p.y+c.dy};
   if(c.source)await proof('reselecting a ready group source keeps the same meshes and starts no display job',`const source=a.selection();a.select([{rootId:source[0].rootId,path:[]}]);await a.settled();a.select(source);await a.settled();check(a.getHandles().length>0,'source handles missing after asynchronous source display');const ids=a.view.groups.sources.children.map(m=>m.uuid);check(ids.length,'source display absent');a.controller.measureTransport(true);a.select(a.selection());await a.settled();check(JSON.stringify(a.view.groups.sources.children.map(m=>m.uuid))===JSON.stringify(ids),'reselection replaced source meshes');check(a.controller.transportState().samples.every(s=>s.job!=='display'),'reselection requested another source display');a.controller.measureTransport(false);`);
   await mouse('mouseMoved',p);await mouse('mousePressed',p);
   await proof('case '+i+' click remains a selection without distances',`check(!document.querySelector('.cad-move-dimensions').checkVisibility(),'click showed drag measures');check(a.serialize()===window.moveBefore.model,'click changed model');`);
   await mouse('mouseMoved',end);await live('case '+i+' live '+JSON.stringify(c));
   if(i===0){await capture('move-light');await run(`document.body.dataset.theme='dark';a.view.setTheme(true);`);await capture('move-dark');}
   if(i===1)await proof('negative movement retains signed distances',`check(window.moveValues.every(v=>v<0),'negative signs missing');`);
   if(i===2||i===3)await proof('axis '+(i===2?'Y':'X')+' movement keeps the other distance at zero',`check(Math.abs(window.moveValues[${i===2?0:1}])<1e-7&&Math.abs(window.moveValues[${i===2?1:0}])>0,'zero axis incorrect');`);
   if(i===4)await capture('move-easy-1040');
   await finish(end,'case '+i+' release commits measured movement and preserves geometry Undo Redo');
  }
  for(const cancel of ['escape','pointercancel','lostpointercapture']){
   const p=await setup({kind:'mesh'}),end={x:p.x+40,y:p.y-30};await mouse('mouseMoved',p);await mouse('mousePressed',p);await mouse('mouseMoved',end);await live(cancel+' preview');
   if(cancel==='escape')await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
   else await run(`a.view.canvas.dispatchEvent(new PointerEvent(${JSON.stringify(cancel)},{pointerId:1}));`);
   await mouse('mouseReleased',end);await proof(cancel+' restores matrices and leaves no overlay or Undo',`await a.settled();const b=window.moveBefore;check(a.serialize()===b.model&&a.undoDepth()===b.undo,'cancel changed model');check(!document.querySelector('.cad-move-dimensions').checkVisibility(),'cancel retained overlay');for(const old of b.matrices){const m=a.view.groups.bodies.children.find(m=>m.uuid===old.uuid);check(m&&m.matrix.toArray().every((v,k)=>v===old.matrix[k]),'cancel did not restore display');}`);
  }
  const p=await setup();await mouse('mouseMoved',p);await mouse('mousePressed',p);await mouse('mouseReleased',p);await proof('selection click without drag creates no movement or history',`await a.settled();check(a.serialize()===window.moveBefore.model&&a.undoDepth()===window.moveBefore.undo,'click history');check(!document.querySelector('.cad-move-dimensions').checkVisibility(),'click overlay');`);
  const h=await run(`return a.projectPoint(a.getHandles().find(h=>h.kind==='corner').point);`);await mouse('mouseMoved',h);await mouse('mousePressed',h);await mouse('mouseMoved',{x:h.x-24,y:h.y+20});
  await proof('corner resize retains the existing size dimensions',`check(document.querySelector('.cad-scale-dimensions').checkVisibility(),'resize measurements missing');check(!document.querySelector('.cad-move-dimensions').checkVisibility(),'resize showed translation');a.cancel();`);await mouse('mouseReleased',h);
  const delayed=await setup(),endDelayed={x:delayed.x+40,y:delayed.y-30};
  await run(`window.originalPreview=a.controller.preview;window.releasePreview=null;a.controller.preview=async(...args)=>{const proposal=await window.originalPreview(...args);await new Promise(resolve=>window.releasePreview=resolve);return proposal;};`);
  await mouse('mouseMoved',delayed);await mouse('mousePressed',delayed);await mouse('mouseMoved',endDelayed);await live('delayed commit keeps its exact visual movement');await mouse('mouseReleased',endDelayed);
  await proof('pending commit retains the moved display and blocks obsolete handles',`for(let i=0;i<200&&!window.releasePreview;i++)await new Promise(r=>setTimeout(r,10));check(window.releasePreview,'delayed preview missing');check(a.view.isEditing(),'pending commit no longer editing');check(a.view.groups.handles.children.length===0,'pending handles visible');check(a.controller.revision()===window.moveBefore.revision,'unconfirmed model published');window.pendingMatrices=a.view.groups.bodies.children.map(m=>m.matrix.toArray());`);
  await mouse('mouseMoved',endDelayed);await mouse('mousePressed',endDelayed);await mouse('mouseMoved',{x:endDelayed.x+30,y:endDelayed.y+20});await mouse('mouseReleased',{x:endDelayed.x+30,y:endDelayed.y+20});
  await proof('second drag during commit cannot reset or overwrite the first drag',`check(a.view.groups.bodies.children.every((m,i)=>m.matrix.toArray().every((v,k)=>v===window.pendingMatrices[i][k])),'second drag changed pending placement');a.controller.preview=window.originalPreview;window.releasePreview();for(let i=0;i<200&&a.view.isEditing();i++)await new Promise(r=>setTimeout(r,10));await a.settled();check(!a.view.isEditing(),'commit did not unlock');check(a.undoDepth()===window.moveBefore.undo+1,'duplicate commit history');const node=a.getModel().nodes[0],old=window.moveBefore.nodes[0];window.moveDelta.forEach((v,k)=>check(Math.abs(node.transform[12+k]-old.transform[12+k]-v)<1e-7,'first drag was reset'));check(!document.getElementById('toast').textContent.includes('geändert'),'stale revision error');`);
  await proof('model-only edits debounce recovery and the idle writer persists the latest confirmed model',`const writes=[],original=a.recovery.write;a.recovery.write=(encoded,options)=>{writes.push({encoded,revision:a.controller.revision()});return original(encoded,options);};try{const before=a.controller.revision();await a.mutate(p=>{p.nodes[0].transform[12]+=1;});await a.mutate(p=>{p.nodes[0].transform[12]+=2;});check(a.controller.revision()!==before,'fixture did not change');check(writes.length===0,'commit performed synchronous recovery write');await new Promise(r=>setTimeout(r,2300));check(writes.length>=1,'idle recovery never wrote a model-only edit');const saved=JSON.parse(writes.at(-1).encoded);delete saved.workspace;check(JSON.stringify(saved.nodes)===JSON.stringify(a.getModel().nodes),'recovery did not save latest confirmed geometry');check(writes.at(-1).revision===a.controller.revision(),'recovery revision stale');}finally{a.recovery.write=original;}`);
  await proof('closing during a pending calculation immediately saves only the last confirmed model',`await a.mutate(p=>{p.nodes[0].transform[12]+=3;});const confirmed=a.getModel(),writes=[],original=a.recovery.write;a.recovery.write=(encoded,options)=>{writes.push(encoded);return original(encoded,options);};const pending=a.controller.preview({kind:'batch',commands:[{op:'create',type:'box',size:[5,5,5]}]});void pending.catch(()=>{});check(a.controller.state().busy,'close fixture not busy');window.dispatchEvent(new Event('beforeunload'));check(writes.length===1,'close did not flush confirmed recovery');const saved=JSON.parse(writes[0]);check(JSON.stringify(saved.nodes)===JSON.stringify(confirmed.nodes),'close saved a draft or stale model');check(saved.workspace===undefined,'busy close captured transient workspace');`);
  await proof('overlay is removed on renderer disposal',`check(!document.querySelector('.cad-move-dimensions'),'overlay leaked');`);
  return {ok:true,checks};
 }catch(error){await capture('failure');const state=await run(`return {editing:a.view.isEditing(),overlay:document.querySelector('.cad-move-dimensions')?.outerHTML,scale:document.querySelector('.cad-scale-dimensions')?.outerHTML,selection:a.selection(),toast:document.getElementById('toast').textContent};`);fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({error:error.stack,checks,state}));throw error;}
 finally{if(win.webContents.debugger.isAttached())win.webContents.debugger.detach();}
};
