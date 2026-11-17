const {app,BrowserWindow,session}=require('electron');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {once}=require('node:events'),{installNavigationGuard}=require('../backend/navigation-guard.cjs');
const output=process.env.OFFLINECAD_TEST_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-smoke-'));
fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(output,'profile-'));
app.setPath('userData',profile);app.setPath('sessionData',profile);
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.on('window-all-closed',()=>app.quit());
const watchdog=setTimeout(()=>{console.error('Desktop smoke timed out');app.exit(1);},120000);
app.whenReady().then(async()=>{
  const errors=[],requests=[],downloads=[];
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{
    const external=/^https?:/.test(details.url);if(external)requests.push(details.url);callback({cancel:external});
  });
  session.defaultSession.on('will-download',(_event,item)=>{
    item.setSavePath(path.join(output,item.getFilename()));
    const record={file:item.getSavePath(),state:null};downloads.push(record);item.once('done',(_e,state)=>{record.state=state;});
  });
  const win=new BrowserWindow({show:false,width:1500,height:950,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
  try{
    const entry=path.resolve(__dirname,'../dist/index.html'),query={test:'1'};
    installNavigationGuard(win,{entry,query});
    await win.loadFile(entry,{query});
    await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
      const start=performance.now(),timer=setInterval(()=>{
        if(window.__cadError||performance.now()-start>60000){clearInterval(timer);reject(Error(window.__cadError||'Startup timeout'));}
        else if(window.__cadReady&&window.__cadTest){clearInterval(timer);resolve();}
      },20);
    })`);
    await win.webContents.executeJavaScript('window.__cadTest.resetProject()');
    const current=win.webContents.getURL(),target=new URL(current);
    target.searchParams.set('blocked','1');
    const willNavigate=once(win.webContents,'will-navigate');
    await win.webContents.executeJavaScript('location.assign('+JSON.stringify(target.href)+')');
    const [navigation,url]=await willNavigate;
    assert.equal(url??navigation.url,target.href);
    assert.equal(navigation.defaultPrevented,true);
    assert.equal(win.webContents.getURL(),current);
    const result=await win.webContents.executeJavaScript(`(async()=>{
      const api=window.__cadTest,check=(value,message)=>{if(!value)throw Error(message);};
      document.querySelector('.shape-tile[data-type="box"]').click();
      await api.settled();
      check(api.getModel().nodes.length===1,'Palette creates one native box after blocked navigation');
      const box=api.getModel().nodes[0];check(box.kind==='cad'&&box.brep.data,'Native source and BRep');
      const before=api.serialize(),depth=api.undoDepth();
      const proposal=await api.access.preview({revision:api.controller.revision(),commands:[{op:'create',type:'sphere',size:[10,10,10],as:'sphere'}]});
      check(api.serialize()===before&&api.undoDepth()===depth,'Preview leaves project and Undo unchanged');
      await api.access.apply({previewId:proposal.previewId,revision:api.controller.revision()});await api.settled();
      check(api.getModel().nodes.length===2&&api.undoDepth()===depth+1,'Apply commits one Undo');
      await api.actions.undo();check(api.serialize()===before,'Undo restores exact project');
      await api.actions.redo();check(api.getModel().nodes.length===2,'Redo restores second body');
      await api.loadDemo();await api.settled();
      const demo=api.getModel(),group=demo.nodes[0],expected=60*40*6-4*Math.PI*2.5**2*6;
      check(group.children.length===5&&Math.abs(group.stats.volume-expected)<1e-5,'Native bored plate volume and sources');
      const encoded=api.serialize();await api.resetProject();await api.openFile(new File([encoded],'smoke.ocad'));await api.settled();
      check(api.serialize()===encoded,'Active project loader roundtrip');
      await api.exportModel('stl');await api.exportModel('3mf');await api.exportModel('obj');
      check(document.querySelector('canvas').width>0,'Viewport exists');
      return {nativeVolume:group.stats.volume,children:group.children.length,previewApplyUndoRedo:true,projectRoundtrip:true};
    })()`);
    const deadline=Date.now()+10000;while((downloads.length<3||downloads.some(item=>!item.state))&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
    assert.equal(downloads.length,3);for(const item of downloads)assert.equal(item.state,'completed');const files=downloads.map(item=>item.file);
    for(const file of files)assert.ok(fs.statSync(file).size>100,file);
    assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'desktop.png'),(await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,result,exports:files.map(file=>path.basename(file)),rendererErrors:errors,networkRequests:requests.length},null,2));
    console.log(JSON.stringify({ok:true,result,exportCount:files.length,rendererErrors:errors,networkRequests:requests.length}));
    clearTimeout(watchdog);win.close();
  }catch(error){console.error(error.stack);console.error('Renderer:',errors);clearTimeout(watchdog);app.exit(1);}
});
