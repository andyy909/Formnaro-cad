const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=path.resolve(__dirname,'../work/cad-v011/app-browser');fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(output,'isolated-profile-'));app.setPath('userData',profile);app.setPath('sessionData',profile);
app.whenReady().then(async()=>{
 const errors=[],external=[],downloads=[];session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{if(/^https?:/i.test(details.url)){external.push(details.url);callback({cancel:true});}else callback({});});
 session.defaultSession.on('will-download',(event,item)=>{const name=item.getFilename();downloads.push(name);item.setSavePath(path.join(output,name));});
 const win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
 const run=code=>win.webContents.executeJavaScript(code);
 try{
  await win.loadFile(path.resolve(__dirname,'../work/cad-v011/native-app/index.html'),{query:{test:'1'}});
  await run(`new Promise((resolve,reject)=>{const start=performance.now();const timer=setInterval(()=>{if(window.__cadError){clearInterval(timer);reject(Error(window.__cadError));}else if(window.__cadTest){clearInterval(timer);resolve(true);}else if(performance.now()-start>60000){clearInterval(timer);reject(Error('Native app start timed out'));}},20);})`);
  const result=await run(`(async()=>{const api=window.__cadTest,check=(value,message)=>{if(!value)throw Error(message);};let ticks=0;const timer=setInterval(()=>ticks++,10);const click=action=>document.querySelector('[data-action="'+action+'"]')?.click();
   check(document.querySelectorAll('.shape-tile[data-type]').length===23,'23 native palette items');
   await api.loadDemo();const demo=api.getModel(),root=demo.nodes[0];check(demo.version===5&&root.children.length===5,'native source tree');const native=api.getScene().objects.find(value=>value.id===root.id);check(Math.abs(native.volume-(60*40*6-4*Math.PI*2.5**2*6))<1e-5,'exact bored plate volume');
   const history=api.undoDepth(),confirmed=api.serialize(),revision=api.controller.revision();const proposal=await api.access.preview({revision,label:'Browser preview',commands:[{op:'create',type:'sphere',size:[10,10,10],as:'sphere'}]});check(api.serialize()===confirmed&&api.undoDepth()===history,'preview cannot alter confirmed save');await api.access.apply({previewId:proposal.previewId,revision});check(api.undoDepth()===history+1,'AI apply one Undo');await api.actions.undo();check(api.serialize()===confirmed,'AI Undo exact');await api.actions.redo();check(api.getModel().nodes.length===2,'AI redo');await api.actions.undo();
   const id=await api.addShape('tube');api.select([{rootId:id,path:[]}]);await api.changeParameter('wall',7);let cylinder=api.getModel().nodes.find(value=>value.id===id);check(cylinder.recipe.params.wall===7,'native inspector bore edit');
   await api.mutate(draft=>{const node=draft.nodes.find(value=>value.id===id);node.transform[4]+=.3;node.transform[0]*=-1;},'Affine test');cylinder=api.getModel().nodes.find(value=>value.id===id);check(cylinder.transform[4]!==0,'shear persisted');const ray=await api.controller.query('rayPick',{ids:[id],ray:{origin:[0,0,100],direction:[0,0,-1],far:200}});check(ray===null,'native bore ray excludes display hit');
   const qualityBefore=api.controller.revision();await api.setQuality({...api.getQuality(),display:{deflection:.08,angleDegrees:18}});check(api.controller.revision()===qualityBefore,'display quality does not modify model');
   await api.actions['workplane-top']();check(api.getModel().workplane.origin[2]>0,'native plane top');await api.actions['reset-plane']();api.select([{rootId:id,path:[]}]);await api.duplicate();check(api.selection().length===1,'native duplicate selects fresh source');await api.actions.undo();api.select([{rootId:root.id,path:[]},{rootId:id,path:[]}]);await api.group();
   clearInterval(timer);return {ready:true,palette:23,version:api.getModel().version,volume:native.volume,ticks,worker:api.controller.state().worker,cache:api.renderCacheState()};})()`);
  assert.ok(result.ready);if(errors.length||external.length)throw Error('Unexpected errors/network: '+JSON.stringify({errors,external}));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({...result,errors,external,downloads},null,2));fs.writeFileSync(path.join(output,'app.png'),(await win.webContents.capturePage()).toPNG());process.stdout.write(JSON.stringify(result)+'\n');app.exit(0);
 }catch(error){fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ready:false,error:error.message,errors,external},null,2));fs.writeFileSync(path.join(output,'failed.png'),(await win.webContents.capturePage()).toPNG());process.stderr.write(error.stack+'\n');app.exit(1);}
});
