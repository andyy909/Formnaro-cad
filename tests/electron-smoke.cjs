const {app,BrowserWindow,session}=require('electron');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const testOutput=process.env.OFFLINECAD_TEST_OUTPUT || fs.mkdtempSync(path.join(require('node:os').tmpdir(),'offlinecad-test-'));
fs.mkdirSync(testOutput,{recursive:true});
app.setPath('userData',path.join(testOutput,'profile'));
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.whenReady().then(async()=>{
  const errors=[],requests=[];
  session.defaultSession.webRequest.onBeforeRequest((details,cb)=>{if(/^https?:/.test(details.url))requests.push(details.url);cb({cancel:/^https?:/.test(details.url)});});
  const win=new BrowserWindow({show:false,width:1500,height:950,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.webContents.on('console-message',(_e,_level,message)=>{if(_level===3)errors.push(message);});
  session.defaultSession.on('will-download',(_e,item)=>item.setSavePath(path.join(testOutput,item.getFilename())));
  try{
    await win.loadFile(path.join(__dirname,'../dist/index.html'),{query:{test:'1'}});
    await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{let count=0;const interval=setInterval(async()=>{if(window.__cadReady){clearInterval(interval);resolve(true);}else if(window.__cadError||count++>150){clearInterval(interval);reject(new Error(window.__cadError||'Timeout'));}},100);})`);
    const result=await win.webContents.executeJavaScript(`(async()=>{
      const api=window.__cadTest,assert=(v,message)=>{if(!v)throw new Error(message);};
      api.restore({nodes:[],bed:[200,200],planeZ:0,name:'Test'});
      document.querySelector('.shape-tile').click();assert(api.snapshot().nodes.length===1,'Shape click');
      document.getElementById('size-0').value=30;document.getElementById('size-0').dispatchEvent(new Event('change'));await api.settled();assert(api.snapshot().nodes[0].size[0]===30,'Numeric dimension');
      document.getElementById('hole-btn').click();await api.settled();assert(!api.snapshot().nodes[0].solid,'Hole toggle');
      document.getElementById('solid-btn').click();await api.settled();api.actions.undo();assert(!api.snapshot().nodes[0].solid,'Undo');api.actions.redo();assert(api.snapshot().nodes[0].solid,'Redo');
      api.loadDemo();const before=api.volume();assert(api.snapshot().nodes[0].children.length===5,'Demo reversible group');
      api.ungroup();assert(api.snapshot().nodes.length===5,'Ungroup');api.select(api.snapshot().nodes.map(n=>n.id));await api.group();assert(Math.abs(api.volume()-before)<.01,'Regroup volume');
      api.mirror(0);assert(Math.abs(api.volume()-before)<.01,'Mirror volume');api.duplicate();assert(api.snapshot().nodes.length===2,'Duplicate');
      api.select(api.snapshot().nodes.map(n=>n.id));api.align(0,1);api.drop();assert(api.bounds().min[2]>=-.001,'Drop to plane');
      const save=JSON.parse(JSON.stringify(api.snapshot()));api.restore(save);assert(api.snapshot().nodes.length===2,'Project roundtrip');
      api.select([api.snapshot().nodes[0].id]);api.actions.delete();api.actions.undo();assert(api.snapshot().nodes.length===2,'Delete undo');
      api.restore({nodes:[],bed:[200,200],planeZ:0,name:'Test'});api.addShape('text');assert(api.volume()>0,'Text solid');
      api.loadDemo();api.select([api.snapshot().nodes[0].id]);await api.exportModel('3mf',false);await api.exportModel('stl',false);await api.exportModel('obj',false);
      return {volume:api.volume(),objects:api.snapshot().nodes.length,canvas:document.querySelector('canvas').width,ready:window.__cadReady};
    })()`);
    await new Promise(resolve=>setTimeout(resolve,1500));
    const points=await win.webContents.executeJavaScript(`({start:window.__cadTest.projectPoint([12,-5,6]),end:window.__cadTest.projectPoint([22,-5,6])})`);
    win.webContents.sendInputEvent({type:'mouseMove',...points.start});
    win.webContents.sendInputEvent({type:'mouseDown',...points.start,button:'left',clickCount:1});
    win.webContents.sendInputEvent({type:'mouseMove',...points.end});
    win.webContents.sendInputEvent({type:'mouseUp',...points.end,button:'left',clickCount:1});
    await new Promise(resolve=>setTimeout(resolve,200));
    const moved=await win.webContents.executeJavaScript(`window.__cadTest.snapshot().nodes[0].pos`);
    assert.ok(Math.abs(moved[0])>1,'Dragging the model must move it');
    await win.webContents.executeJavaScript(`window.__cadTest.actions.undo()`);
    const importChecks=await win.webContents.executeJavaScript(`(async()=>{
      const input=document.getElementById('import-file'),api=window.__cadTest;
      const svg='<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H20V10H0Z" fill="red"/></svg>';
      const dt=new DataTransfer();dt.items.add(new File([svg],'rectangle.svg',{type:'image/svg+xml'}));input.files=dt.files;const pending=input.onchange();while(!document.getElementById('import-apply'))await new Promise(r=>setTimeout(r,20));document.getElementById('import-apply').click();await pending;
      let data=api.snapshot();if(data.nodes.length!==2)throw new Error('SVG import failed');
      if(data.nodes[1].size.some((v,i)=>Math.abs(v-[20,10,3][i])>.001))throw new Error('SVG dimensions');
      const imported=data.nodes[1];api.restore({nodes:[imported],bed:[200,200],planeZ:0,name:'Import test'});if(Math.abs(api.volume()-600)>.01)throw new Error('SVG outward winding / volume');api.restore(data);
      api.actions.undo();
      return {svg:true};
    })()`);
    const formats={};
    for(const extension of ['3mf','stl','obj']){const file=path.join(testOutput,'Montageplatte.'+extension);assert.ok(fs.statSync(file).size>100);formats[extension]=fs.statSync(file).size;}
    await win.webContents.executeJavaScript(`window.__cadTest.select([window.__cadTest.snapshot().nodes[0].id]);window.__cadTest.actions.fit()`);
    await new Promise(resolve=>setTimeout(resolve,300));
    const screenshot=await win.webContents.capturePage();fs.writeFileSync(path.join(testOutput,'offlinecad-desktop.png'),screenshot.toPNG());
    assert.equal(requests.length,0,'Unexpected online dependency');
    assert.equal(errors.length,0,errors.join('\n'));
    console.log(JSON.stringify({ok:true,result,mouseDrag:moved,importChecks,exportBytes:formats,networkRequests:requests.length,rendererErrors:errors},null,2));app.exit(0);
  }catch(e){console.error(e.stack);console.error('Renderer:',errors);app.exit(1);}
});
