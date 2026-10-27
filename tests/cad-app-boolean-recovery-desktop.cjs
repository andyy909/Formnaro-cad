const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=path.resolve(process.env.FORMNARO_BOOLEAN_OUTPUT||'work/boolean-fix/ui');fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(output,'profile-'));app.setPath('userData',profile);app.setPath('sessionData',profile);
app.whenReady().then(async()=>{
 const checks=[],errors=[],external=[];
 session.defaultSession.webRequest.onBeforeRequest((d,cb)=>{if(/^https?:/.test(d.url))external.push(d.url);cb({cancel:/^https?:/.test(d.url)});});
 const win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{offscreen:true,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 win.webContents.on('console-message',d=>{if(d.level==='error')errors.push(d.message);});
 const run=code=>win.webContents.executeJavaScript(code);
 try{
  await win.loadFile(path.resolve(process.env.FORMNARO_BOOLEAN_ENTRY||'work/cad-v011/native-app/index.html'),{query:{test:'1'}});
  await run(`new Promise((resolve,reject)=>{const start=performance.now(),t=setInterval(()=>{if(window.__cadError){clearInterval(t);reject(Error(window.__cadError));}else if(window.__cadTest){clearInterval(t);resolve();}else if(performance.now()-start>60000){clearInterval(t);reject(Error('Start timeout'));}},20);})`);
  for(const [action,volume,hole]of [['group',1500,false],['intersect',500,false],['group',500,true]]){
   const result=await run(`(async()=>{
    const a=window.__cadTest;await a.resetProject();await a.execute({kind:'batch',commands:[{op:'create',type:'box',size:[10,10,10],pos:[0,0,5],as:'a'},{op:'create',type:'box',size:[10,10,10],pos:[5,0,5],solid:${!hole},as:'b'}]});await a.settled();
    const before=a.serialize(),undo=a.undoDepth();a.select(a.getModel().nodes.map(n=>({rootId:n.id,path:[]})));document.querySelector('[data-action="${action}"]').click();
    const start=performance.now();while(a.getModel().nodes.length!==1){if(performance.now()-start>60000)throw Error('First action did not finish');await new Promise(r=>setTimeout(r,20));}await a.settled();
    const group=a.getModel().nodes[0];if(Math.abs(group.stats.volume-${volume})>1e-6||a.undoDepth()!==undo+1||group.children.length!==2)throw Error('Geometry/history mismatch');
    document.querySelector('[data-action="undo"]').click();await a.settled();if(a.serialize()!==before)throw Error('Undo did not restore exact inputs');document.querySelector('[data-action="redo"]').click();await a.settled();if(Math.abs(a.getModel().nodes[0].stats.volume-${volume})>1e-6)throw Error('Redo mismatch');return {volume:${volume},firstClick:true,oneUndo:true};
   })()`);checks.push({action,hole,...result});console.log(action+(hole?' hole':'')+' first click passed');
  }
  if(process.env.FORMNARO_BOOLEAN_PRIVATE_PROJECT){
   const saved=JSON.parse(fs.readFileSync(process.env.FORMNARO_BOOLEAN_PRIVATE_PROJECT,'utf8')),project=saved.project??saved;
   await run(`window.__cadTest.controller.open(${JSON.stringify(project)}).then(()=>window.__cadTest.settled())`);
   const result=await run(`(async()=>{
    const a=window.__cadTest,p=a.getModel(),body=p.nodes.find(n=>n.source==='group'),holes=p.nodes.filter((n,i)=>[4,5].includes(i)),before=a.serialize(),undo=a.undoDepth(),others=p.nodes.filter(n=>![body.id,...holes.map(h=>h.id)].includes(n.id));
    a.select([body,...holes].map(n=>({rootId:n.id,path:[]})));const started=performance.now();document.querySelector('[data-action="group"]').click();
    while(a.getModel().nodes.length!==p.nodes.length-2){if(performance.now()-started>180000)throw Error('Complex first click did not finish');await new Promise(r=>setTimeout(r,40));}await a.settled();
    const after=a.getModel(),group=after.nodes.find(n=>n.source==='group');if(!group||group.children.length!==3||a.undoDepth()!==undo+1||!group.brep.data.includes('Triangulations 0')||group.stats.volume<=0)throw Error('Complex native result mismatch');
    if(JSON.stringify(after.nodes.filter(n=>others.some(o=>o.id===n.id)))!==JSON.stringify(others))throw Error('Unrelated models changed');
    const encoded=a.serialize(),ms=performance.now()-started,volume=group.stats.volume;
    document.querySelector('[data-action="undo"]').click();await a.settled();if(a.serialize()!==before)throw Error('Complex Undo mismatch');document.querySelector('[data-action="redo"]').click();await a.settled();if(a.serialize()!==encoded)throw Error('Complex Redo mismatch');
    await a.controller.open(JSON.parse(encoded));await a.settled();if(Math.abs(a.getModel().nodes.find(n=>n.source==='group').stats.volume-volume)>1e-6)throw Error('Complex reload mismatch');
    return {firstClick:true,oneUndo:true,reloaded:true,ms,volume};
   })()`);checks.push({action:'complex imported cut',...result});console.log('Complex imported first click, Undo, Redo and reload passed');
  }
  assert.equal(errors.length,0);assert.equal(external.length,0);
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,checks,errors,external},null,2));app.exit(0);
 }catch(error){fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:false,error:error.stack,checks,errors,external},null,2));console.error(error.stack);app.exit(1);}
});
