const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');

async function verifyScaleAcceptance(win,{directory,fixtureDirectory,files}){
 const checks=[],metrics={};
 const run=async code=>{
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const a=window.__cadTest,b=window.__scaleAcceptance;
   try{return {ok:true,value:await(async()=>{${code}})()};}catch(error){return {ok:false,error:error.stack};}
  })()`);
  if(!result.ok)throw Error(result.error);
  return result.value;
 };
 const tap=async({x,y})=>{
  for(const type of ['mouseMoved','mousePressed','mouseReleased']){
   await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,x:Math.round(x),y:Math.round(y),button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:1});
  }
  await run("if(!document.querySelector('.cad-corner-dialog[open] #corner-size-0'))throw Error('Corner input did not open');");
 };
 win.webContents.debugger.attach('1.3');
 try{
  for(const name of ['step-spheres','colored-bored-group']){
   fs.writeFileSync(path.join(directory,'scale-progress.json'),JSON.stringify({name,checks}));
   files.save=path.join(fixtureDirectory,name+'.ocad');
   const original=files.save,hash=()=>createHash('sha256').update(fs.readFileSync(original)).digest('hex'),originalHash=hash();
   const position=await run(`
    await a.openProject();await a.settled();a.workbenchUI.setMode('normal');
    const root=a.getModel().nodes[0].id,target={rootId:root,path:[]};
    a.select([target]);a.view.setView('iso');a.view.fit([target]);await a.view.renderReady();
    const width=async()=> (await a.controller.query('bounds',{targets:[target]})).size[0];
    const meshWidth=group=>{
     let min=Infinity,max=-Infinity;
     for(const mesh of group.children){
      if(mesh.userData.rootId!==root)continue;
      mesh.updateMatrixWorld(true);
      const m=mesh.matrixWorld.elements,v=mesh.geometry.attributes.position.array;
      for(let i=0;i<v.length;i+=3){const x=m[0]*v[i]+m[4]*v[i+1]+m[8]*v[i+2]+m[12];min=Math.min(min,x);max=Math.max(max,x);}
     }
     return max-min;
    };
    const point=()=>a.projectPoint(a.getHandles().find(h=>h.kind==='corner'&&h.corner[0]===1&&h.corner[1]===1).point);
    window.__scaleAcceptance={root,target,width,meshWidth,point,beforeWidth:await width(),revision:a.controller.revision(),model:a.serialize(),undo:a.undoDepth()};
    return point();
   `);
   await tap(position);
   await run(`
    const input=document.getElementById('corner-size-0');
    input.value=String(b.beforeWidth+2);input.dispatchEvent(new Event('input',{bubbles:true}));await a.view.renderReady();
    document.getElementById('modal-close').click();await a.view.renderReady();
    if(a.serialize()!==b.model||a.undoDepth()!==b.undo||!document.querySelector('.cad-scale-preview-status').hidden)throw Error('Aborting scale did not restore confirmation');
   `);
   await tap(await run('return b.point();'));
   const scaled=await run(`
    const input=document.getElementById('corner-size-0'),notice=document.querySelector('.cad-scale-preview-status'),requested=b.beforeWidth+5,start=performance.now();
    input.value=String(requested);input.dispatchEvent(new Event('input',{bubbles:true}));
    await a.view.renderReady();
    const feedbackMs=performance.now()-start,provisionalWidth=b.meshWidth(a.view.groups.bodies);
    if(notice.hidden||notice.textContent!=='Vorschau – wird berechnet'||a.serialize()!==b.model||a.undoDepth()!==b.undo)throw Error('First response was not a provisional display');
    while(notice.textContent!=='Vorschau bereit'){
     if(performance.now()-start>30000)throw Error('Exact preview deadline');
     await new Promise(r=>setTimeout(r,15));
    }
    await a.view.renderReady();
    const exactMs=performance.now()-start,previewWidth=b.meshWidth(a.view.groups.preview);
    if(a.controller.revision()!==b.revision||a.undoDepth()!==b.undo)throw Error('Exact preview committed prematurely');
    document.getElementById('corner-apply').click();
    while(a.controller.revision()===b.revision){if(performance.now()-start>35000)throw Error('Exact commit deadline');await new Promise(r=>setTimeout(r,15));}
    await a.settled();
    const actual=await b.width(),displayWidth=b.meshWidth(a.view.groups.bodies),revision=a.controller.revision(),model=a.serialize();
    if(a.undoDepth()!==b.undo+1||Math.abs(actual-requested)>1e-6)throw Error('Independent native width or Undo mismatch');
    for(const candidate of [provisionalWidth,previewWidth,displayWidth]){
     if(!Number.isFinite(candidate)||Math.abs(candidate-actual)>.03)throw Error('Display width differs from independent native width: '+JSON.stringify({candidate,actual}));
    }
    b.after={actual,revision,model};
    await a.actions.undo();if(a.serialize()!==b.model)throw Error('Undo changed base bytes');
    await a.actions.redo();if(a.serialize()!==model)throw Error('Redo changed scaled bytes');
    return {requested,actual,provisionalWidth,previewWidth,displayWidth,feedbackMs,exactMs,revision};
   `);
   files.save=path.join(directory,name+'-scaled.ocad');
   const saved=await run("return a.save({saveAs:true,format:'ocad'});");
   assert(saved.saved);
   const exported=await run(`
    await a.openProject();await a.settled();
    if(a.serialize()!==b.after.model||Math.abs(await b.width()-b.after.actual)>1e-6)throw Error('Reopen changed confirmed scaled geometry');
    const result=await a.controller.exportModel({format:'step',ids:[b.root]});
    const base=a.getModel(),ids=new Set(base.nodes.map(node=>node.id));
    const imported=await a.controller.preview({kind:'importStepAssembly',bytes:new Uint8Array(result.data),options:{id:crypto.randomUUID(),name:'Export verification',layerId:base.activeLayerId,folderId:base.activeFolderId}},{label:'Verify exported dimensions'});
    let exportedWidth;
    try{
     const scene=await a.controller.describe(imported.project),added=scene.objects.filter(item=>!item.target.path.length&&!ids.has(item.id));
     exportedWidth=Math.max(...added.map(item=>item.worldBounds.max[0]))-Math.min(...added.map(item=>item.worldBounds.min[0]));
     if(!Number.isFinite(exportedWidth)||Math.abs(exportedWidth-b.after.actual)>1e-4)throw Error('Reimported STEP does not retain scaled width: '+exportedWidth);
    }finally{a.controller.discard(imported.previewId);}
    if(a.serialize()!==b.after.model)throw Error('Export altered the confirmed project');
    return {bytes:Array.from(result.data),exportedWidth};
   `);
   const step=Buffer.from(exported.bytes);
   assert(step.subarray(0,64).toString().includes('ISO-10303-21'));
   fs.writeFileSync(path.join(directory,name+'-scaled.step'),step);
   assert.equal(hash(),originalHash);
   metrics[name]={...scaled,stepBytes:step.length,exportedWidth:exported.exportedWidth,originalHash};
   checks.push(name+' immediate preview, exact view, cancel, commit, Undo/Redo, physical OCAD reopen and STEP export');
  }
  return {ok:true,checks,metrics};
 }finally{if(win.webContents.debugger.isAttached())win.webContents.debugger.detach();}
}
module.exports={verifyScaleAcceptance};
