const fs=require('node:fs'),path=require('node:path');

exports.verifyEasyPerformance=async function(win,{directory}={}){
 const run=code=>win.webContents.executeJavaScript(code),checks=[];
 const proof=async(name,code)=>{fs.writeFileSync(path.join(directory,'progress.json'),JSON.stringify({checks,pending:name}));const value=await run(`(async()=>{const a=window.__cadTest,check=(v,m)=>{if(!v)throw Error(m)};${code}})()`);checks.push(name);return value;};
 win.setSize(1440,1000);
 await proof('easy mesh fixture: closed subdivided cube, 49152 triangles',`
  await a.resetProject();a.workbenchUI.setMode('easy');a.workbenchUI.setDomain('mesh');
  let verts=[-10,-10,0,10,-10,0,10,10,0,-10,10,0,-10,-10,20,10,-10,20,10,10,20,-10,10,20],triangles=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
  for(let level=0;level<6;level++){const edges=new Map(),mid=(i,j)=>{const k=Math.min(i,j)+'/'+Math.max(i,j);if(edges.has(k))return edges.get(k);const id=verts.length/3;verts.push(...[0,1,2].map(a=>(verts[i*3+a]+verts[j*3+a])/2));edges.set(k,id);return id;},next=[];for(let i=0;i<triangles.length;i+=3){const [x,y,z]=triangles.slice(i,i+3),xy=mid(x,y),yz=mid(y,z),zx=mid(z,x);next.push(x,xy,zx,xy,y,yz,zx,yz,z,xy,yz,zx);}triangles=next;}
  const p=a.getModel();p.nodes=[{id:'dense',kind:'mesh',name:'Synthetic dense cube',mesh:{verts,triangles},transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],color:'#ef6948',layerId:'default',folderId:null}];
  await a.controller.open(p);await a.settled();await a.easyRepair.flush();await a.settled();a.select([{rootId:'dense',path:[]}]);await a.view.renderReady();
  window.__easyPerf={metrics:[],before:a.serialize(),depth:a.undoDepth()};check(a.getModel().nodes[0].mesh.triangles.length===147456,'fixture size');
 `);
 const dense=await proof('dense mesh selection and unchanged refresh preserve model, Undo and body geometry',`
  const s=window.__easyPerf,body=a.view.groups.bodies.children[0].geometry,samples=[];
  for(let i=0;i<23;i++){const start=performance.now();a.select([]);a.select([{rootId:'dense',path:[]}]);if(i>=3)samples.push(performance.now()-start);}
  const start=performance.now();for(let i=0;i<20;i++)await a.refresh();const refreshMs=performance.now()-start;
  check(a.serialize()===s.before&&a.undoDepth()===s.depth,'selection changed model');check(a.view.groups.bodies.children[0].geometry===body,'selection recreated body');
  return {selectionPairMs:samples,refresh20Ms:refreshMs};
 `);
 const transforms=await proof('move, rotate, scale retain geometry and exact Undo/Redo',`
  const s=window.__easyPerf,results=[];a.select([{rootId:'dense',path:[]}]);
  for(const [name,delta]of [['move',[1,0,0,0,0,1,0,0,0,0,1,0,2,3,0,1]],['rotate',[0,1,0,0,-1,0,0,0,0,0,1,0,0,0,0,1]],['scale',[1.1,0,0,0,0,.9,0,0,0,0,1.2,0,0,0,0,1]]]){
   const before=a.serialize(),depth=a.undoDepth(),g=a.view.groups.bodies.children[0].geometry,t=performance.now();
   await a.mutate(p=>{const n=p.nodes.find(n=>n.id==='dense'),m=n.transform;n.transform=Array.from({length:16},(_,i)=>{const row=i%4,col=Math.floor(i/4);return [0,1,2,3].reduce((v,k)=>v+delta[k*4+row]*m[col*4+k],0);});},name);await a.settled();
   results.push({name,ms:performance.now()-t});const after=a.serialize();check(before!==after&&a.undoDepth()===depth+1,'one transform Undo');check(a.view.groups.bodies.children[0].geometry===g,'transform recreated geometry');
   await a.actions.undo();await a.settled();check(a.serialize()===before,'exact Undo');await a.actions.redo();await a.settled();check(a.serialize()===after,'exact Redo');await a.actions.undo();await a.settled();
  }check(a.serialize()===s.before,'final source differs');return results;
 `);
 const many=await proof('120 native CAD parts in Easy Tinker: selection and isolation',`
  a.workbenchUI.setMode('normal');await a.resetProject();await a.execute({kind:'batch',commands:Array.from({length:120},(_,i)=>({op:'create',type:'box',size:[4,4,4],pos:[(i%15-7)*10,(Math.floor(i/15)-4)*10,2],name:'Part '+i}))});await a.settled();a.workbenchUI.setMode('easy');a.workbenchUI.setDomain('cad');await a.settled();
  const p=a.getModel(),targets=p.nodes.map(n=>({rootId:n.id,path:[]})),before=a.serialize(),depth=a.undoDepth(),samples=[];a.select(targets);
  for(let i=0;i<13;i++){const t=performance.now();a.select([]);a.select(targets);if(i>=3)samples.push(performance.now()-t);}
  a.view.setIsolation([targets[0].rootId]);check(a.view.groups.bodies.children.filter(m=>m.visible).length===1,'isolation');a.view.setIsolation(null);check(a.view.groups.bodies.children.filter(m=>m.visible).length===120,'isolation restore');check(a.serialize()===before&&a.undoDepth()===depth,'CAD selection changed model');a.select([targets[0]]);a.view.fit();await a.view.renderReady();return {selectionPairMs:samples};
 `);
 if(directory)fs.writeFileSync(path.join(directory,'easy-performance.png'),(await win.webContents.capturePage()).toPNG());
 return {ok:true,checks,metrics:{dense,transforms,many}};
};
