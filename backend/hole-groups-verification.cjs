const fs=require('node:fs'),path=require('node:path');

exports.verifyHoleGroups=async function(win,{directory}={}){
 const checks=[],run=code=>win.webContents.executeJavaScript(code),pause=()=>new Promise(r=>setTimeout(r,80));
 const proof=async(name,code)=>{fs.writeFileSync(path.join(directory,'progress.json'),JSON.stringify({checks,pending:name}));await run(`(async()=>{const a=window.__cadTest,check=(v,m)=>{if(!v)throw Error(m)};${code}})()`);checks.push(name);};
 const until=async code=>{for(let i=0;i<400;i++){if(await run(code))return;await pause();}throw Error('Timeout '+code+' '+await run("document.getElementById('toast').textContent"));};
 async function click(selector){const point=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e?.getBoundingClientRect();if(!e||e.disabled||!r.width||!r.height)throw Error('Unavailable '+${JSON.stringify(selector)});return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,...point,button:'left',clickCount:1});await pause();}
 async function finishMesh(){await until('!!window.__cadTest.meshTools.state()&&!document.getElementById("mesh-preview").disabled');await click('#mesh-preview');await until('window.__cadTest.meshTools.state()?.hasPreview&&!window.__cadTest.meshTools.state()?.busy');await click('#mesh-apply');await until('!window.__cadTest.meshTools.state()');await run('window.__cadTest.settled()');}
 fs.mkdirSync(directory,{recursive:true});win.setSize(1440,950);
 try{
  for(const mode of ['normal','easy'])for(const kind of ['cad','mesh']){
   const label=mode+' '+kind;
   await proof(label+' fixture preserves individual hole roles',`
    a.cancel();await a.settled();if(a.workbenchUI.mode()!=='normal')a.workbenchUI.setMode('normal');await a.resetProject();
    if(${JSON.stringify(kind)}==='cad')await a.execute({kind:'batch',commands:[{op:'create',type:'box',size:[30,20,10],pos:[0,0,0],as:'body'},...[-5,5].map((x,i)=>({op:'create',type:'box',size:[4,4,20],pos:[x,0,0],solid:false,name:'Loch '+i}))]});
    else await a.mutate(p=>{const pose=x=>[1,0,0,0,0,1,0,0,0,0,1,0,x,0,0,1],cube=(id,x,role,scale)=>({id,kind:'mesh',name:id,meshRole:role,transform:pose(x),mesh:{verts:[-2,-2,-10,2,-2,-10,2,2,-10,-2,2,-10,-2,-2,10,2,-2,10,2,2,10,-2,2,10].map(v=>v*scale),triangles:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]}});p.nodes=[cube('body',0,'solid',4),cube('h0',-5,'hole',1),cube('h1',5,'hole',1)];});
    if(${JSON.stringify(mode)}==='easy'){a.workbenchUI.setMode('easy');a.workbenchUI.setDomain(${JSON.stringify(kind)});}
    a.select(a.getModel().nodes.slice(1).map(n=>({rootId:n.id,path:[]})));await a.settled();window.holeBefore=a.serialize();window.holeDepth=a.undoDepth();check(a.selection().length===2,'selection');
   `);
   await click('[data-action=group]');if(kind==='mesh'){
    await until('!!window.__cadTest.meshTools.state()&&!document.getElementById("mesh-preview").disabled');
    await proof(label+' mesh dialog describes a combined hole',`check(document.getElementById('mesh-fields').textContent.includes('gemeinsamen Lochform'),'hole explanation');check(a.serialize()===window.holeBefore,'dialog changed model');`);
    await finishMesh();
   }
   await until('window.__cadTest.getModel().nodes.length===2');await run('window.__cadTest.settled()');
   await proof(label+' group remains hole and uses one Undo',`const n=a.getModel().nodes[1];check(${JSON.stringify(kind)}==='cad'?!n.solid:n.meshRole==='hole','role');check(a.undoDepth()===window.holeDepth+1,'Undo');window.holeGrouped=a.serialize();window.holeId=n.id;check(a.view.groups.bodies.children.length>=2,'group disappeared');`);
   await proof(label+' exact Undo and Redo',`await a.actions.undo();await a.settled();check(a.serialize()===window.holeBefore,'undo');await a.actions.redo();await a.settled();check(a.serialize()===window.holeGrouped,'redo');a.select([{rootId:window.holeId,path:[]}]);`);
   await click('[data-action=ungroup]');if(kind==='mesh')await finishMesh();await until('window.__cadTest.getModel().nodes.length===3');
   await proof(label+' dissolve restores individual cutters',`const holes=a.getModel().nodes.slice(1);check(holes.every(n=>${JSON.stringify(kind)}==='cad'?!n.solid:n.meshRole==='hole'),'dissolve roles');await a.actions.undo();await a.settled();check(a.serialize()===window.holeGrouped,'dissolve undo');a.select(a.getModel().nodes.map(n=>({rootId:n.id,path:[]})));`);
   await click('[data-action=group]');if(kind==='mesh')await finishMesh();await until('window.__cadTest.getModel().nodes.length===1');
   await proof(label+' nested cutter removes expected material',`await a.settled();const n=a.getModel().nodes[0];check(${JSON.stringify(kind)}==='cad'?n.solid:n.meshRole==='solid','solid result');const volume=${JSON.stringify(kind)}==='cad'?n.stats.volume:(await a.controller.meshQuery('inspectSolid',{id:n.id})).volume;check(Math.abs(volume-${kind==='cad'?5680:19840})<.01,'volume '+volume);await a.actions.undo();await a.settled();check(a.serialize()===window.holeGrouped,'cut undo');a.select([{rootId:window.holeId,path:[]}]);await a.view.renderReady();`);
   fs.writeFileSync(path.join(directory,mode+'-'+kind+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  for(const mode of ['normal','easy']){
   await proof(mode+' many-body CAD fixture',`a.cancel();await a.settled();a.workbenchUI.setMode('normal');await a.resetProject();await a.execute({kind:'batch',commands:Array.from({length:7},(_,i)=>({op:'create',type:'box',size:[4,4,4],pos:[i*3,0,0],name:'Teil '+i}))});if(${JSON.stringify(mode)}==='easy'){a.workbenchUI.setMode('easy');a.workbenchUI.setDomain('cad');}a.select(a.getModel().nodes.map(n=>({rootId:n.id,path:[]})));await a.settled();window.manyBefore=a.serialize();window.manyDepth=a.undoDepth();window.manySources=JSON.stringify(a.getModel().nodes);`);
   await click('[data-action=group]');await until('window.__cadTest.getModel().nodes.length===1');await run('window.__cadTest.settled()');
   await proof(mode+' balanced CAD group preserves all sources and one Undo',`const n=a.getModel().nodes[0];check(n.source==='group'&&n.solid&&n.stats.solids===1,'group');check(Math.abs(n.stats.volume-352)<1e-5,'volume');check(JSON.stringify(n.children)===window.manySources,'sources');check(a.undoDepth()===window.manyDepth+1,'Undo');window.manyGrouped=a.serialize();await a.actions.undo();await a.settled();check(a.serialize()===window.manyBefore,'Undo bytes');await a.actions.redo();await a.settled();check(a.serialize()===window.manyGrouped,'Redo bytes');a.select([{rootId:a.getModel().nodes[0].id,path:[]}]);`);
   await click('[data-action=ungroup]');await until('window.__cadTest.getModel().nodes.length===7');await run('window.__cadTest.settled()');
   await proof(mode+' many-body dissolve restores exact originals',`check(a.serialize()===window.manyBefore,'dissolved originals');`);
  }
  return {ok:true,checks};
 }catch(error){fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({error:error.stack,checks}));throw error;}
};
