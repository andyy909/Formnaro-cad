const fs=require('node:fs'),path=require('node:path');
exports.verifyCadMiniPerformance=async(win,{directory}={})=>{
 const checks=[],run=code=>win.webContents.executeJavaScript(code);
 async function check(name,code){fs.writeFileSync(path.join(directory,'progress.json'),JSON.stringify({checks,pending:name}));const result=await run(`(async()=>{const a=window.__cadTest,assert=(v,m)=>{if(!v)throw Error(m)};${code}})()`);checks.push(name);return result;}
 win.setSize(1440,1000);
 await check('Native CAD fixture in Easy Tinker, analytic curved bodies and independent STEP source',`
  await a.resetProject();a.workbenchUI.setMode('easy');a.workbenchUI.setDomain('cad');
  await a.execute({kind:'batch',commands:Array.from({length:36},(_,i)=>({op:'create',type:i%3?'cylinder':'roundbox',size:[18,18,12],pos:[(i%9-4)*24,(Math.floor(i/9)-2)*24,6],name:'CAD '+i}))});await a.settled();
  window.__cadPerf={};const p=a.getModel();assert(p.nodes.length===36,'fixture count');a.select([{rootId:p.nodes[0].id,path:[]}]);
 `);
 const pipeline=await check('CAD selection, pure translation, rotation and scale preserve exact Undo and project quality',`
  window.__measureCadPipeline=async()=>{const measurements=[],original=a.serialize(),quality=JSON.stringify(a.getQuality()),project=a.getModel(),id=project.nodes[0].id;
  const selection=[];for(let i=0;i<13;i++){const t=performance.now();a.select([]);a.select([{rootId:id,path:[]}]);if(i>=3)selection.push(performance.now()-t);}
  for(const operation of ['move','rotate','scale'])for(let i=0;i<5;i++){
   const before=a.serialize(),undo=a.undoDepth(),p=a.getModel(),beforeBreps=p.nodes.map(n=>n.brep.data),stages=[];
   const originals={};for(const method of ['display','describe']){originals[method]=a.controller[method];a.controller[method]=async(...args)=>{const start=performance.now();try{return await originals[method](...args);}finally{stages.push({stage:method,ms:performance.now()-start});}};}
   const start=performance.now();try{await a.mutate(p=>{const n=p.nodes.find(n=>n.id===id),m=n.transform;if(operation==='move'){m[12]+=3;m[13]+=2;}else if(operation==='rotate'){const x=[...m],angle=(37+i*9)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);for(let j=0;j<3;j++){m[j*4]=c*x[j*4]-s*x[j*4+1];m[j*4+1]=s*x[j*4]+c*x[j*4+1];}}else {const factor=1.02+i*.01;m[0]*=factor;m[1]*=factor;m[2]*=factor;}},'CAD benchmark '+operation);await a.settled();}finally{for(const method of Object.keys(originals))a.controller[method]=originals[method];}
   const ms=performance.now()-start,after=a.serialize(),next=a.getModel();assert(a.undoDepth()===undo+1,'single Undo');assert(next.nodes.every((n,k)=>n.brep.data===beforeBreps[k]),'transform altered local BRep');
   if(i)measurements.push({operation,ms,stages});await a.actions.undo();await a.settled();assert(a.serialize()===before,'exact Undo');await a.actions.redo();await a.settled();assert(a.serialize()===after,'exact Redo');await a.actions.undo();await a.settled();
  }assert(a.serialize()===original,'final project');assert(JSON.stringify(a.getQuality())===quality,'quality preserved');return {selection,measurements};};return window.__measureCadPipeline();
 `);
 const transport=await check('Repeated unchanged CAD display and transport preserve every triangle and native geometry',`
  const before=a.serialize(),revision=a.controller.revision();a.controller.measureTransport(true);let data;
  for(let i=0;i<3;i++){const result=await a.controller.display();const json=JSON.stringify(result.meshes);if(data)assert(json===data,'display changed');data=json;}
  const result=a.controller.transportState();a.controller.measureTransport(false);assert(a.serialize()===before&&a.controller.revision()===revision,'display mutated project');return result;
 `);
 const imported=await check('Twelve imported native STEP spheres: precise display, arbitrary rotations and scale with exact Undo/Redo',`
  await a.resetProject();a.workbenchUI.setMode('easy');a.workbenchUI.setDomain('cad');
  await a.importFile(new File([${JSON.stringify(require('./cad-mini-performance-fixture.cjs'))}],'analytic-sphere.step'));await a.settled();
  await a.mutate(p=>{const source=p.nodes[0];p.nodes=Array.from({length:12},(_,i)=>{const n=structuredClone(source);n.id=i?crypto.randomUUID():source.id;n.name='STEP sphere '+i;n.transform=[1,0,0,0,0,1,0,0,0,0,1,0,i%4*100,Math.floor(i/4)*100,40,1];return n;});},'STEP fixture copies');await a.settled();
  const quality=a.getQuality();quality.display={deflection:.004,angleDegrees:4};await a.setQuality(quality);await a.settled();a.select([{rootId:a.getModel().nodes[0].id,path:[]}]);assert(a.getModel().nodes.every(n=>n.source==='step'),'native STEP sources');return window.__measureCadPipeline();
 `);
 const colored=await check('Colored bored CAD group: root movement rotation and scaling retain source history and material colors',`
  await a.resetProject();await a.execute({kind:'batch',commands:[{op:'create',type:'box',size:[60,40,6],pos:[0,0,3]},{op:'create',type:'cylinder',size:[20,20,20],pos:[20,0,10]},{op:'create',type:'cylinder',size:[5,5,30],pos:[0,0,5]}]});await a.settled();
  await a.mutate(p=>{p.nodes[0].color='#dd6633';p.nodes[1].color='#3377cc';p.nodes[2].solid=false;});a.select(a.getModel().nodes.map(n=>({rootId:n.id,path:[]})));await a.group();await a.settled();await a.mutate(p=>{p.nodes[0].multicolor=true;});await a.settled();a.select([{rootId:a.getModel().nodes[0].id,path:[]}]);a.view.fit();
  const before=JSON.stringify(a.getModel().nodes[0].children),colors=(await a.controller.display()).meshes.map(r=>r.color).sort();assert(colors.includes('#dd6633')&&colors.includes('#3377cc'),'material colors');const measurements=await window.__measureCadPipeline();assert(JSON.stringify(a.getModel().nodes[0].children)===before,'source history');assert(JSON.stringify((await a.controller.display()).meshes.map(r=>r.color).sort())===JSON.stringify(colors),'material colors preserved');return measurements;
 `);
 if(directory)fs.writeFileSync(path.join(directory,'cad-tinker-performance.png'),(await win.webContents.capturePage()).toPNG());
 return {ok:true,checks,metrics:{pipeline,transport,imported,colored}};
};
