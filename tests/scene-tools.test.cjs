const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=process.env.OFFLINECAD_TEST_OUTPUT||fs.mkdtempSync(path.join(require('node:os').tmpdir(),'offlinecad-scene-'));
fs.mkdirSync(output,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(output,'scene-profile-')));
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1500,height:950,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});
  const errors=[],requests=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
  session.defaultSession.webRequest.onBeforeRequest((details,cb)=>{if(/^https?:/.test(details.url))requests.push(details.url);cb({cancel:/^https?:/.test(details.url)});});
  const evaluate=async code=>{await win.webContents.executeJavaScript("new Promise((resolve,reject)=>{let count=0;const timer=setInterval(()=>{const a=window.__cadTest;if(!a||(!a.edits.state()?.closing&&(!a.calculations.isBusy()||a.edits.isActive()))){clearInterval(timer);resolve();}else if(count++>15000){clearInterval(timer);reject(Error('Async completion timeout'));}},20);})");return win.webContents.executeJavaScript(code.includes("await ")&&!code.trim().startsWith("(async")?"(async()=>{"+code+"})()":code);};
  const pause=()=>new Promise(resolve=>setTimeout(resolve,100));
  const mouseClick=async(point)=>{win.webContents.sendInputEvent({type:'mouseMove',...point});win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});await pause();};
  const buttonPoint=selector=>evaluate(`(async()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
  const typeField=async(selector,value)=>{await mouseClick(await buttonPoint(selector));await win.webContents.insertText(value);win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await pause();};
  const near=(a,b,label)=>assert.ok(Math.abs(a-b)<.001,`${label}: ${a} vs ${b}`);
  try{
    await win.loadFile(path.join(__dirname,'../dist/index.html'),{query:{test:'1'}});
    await evaluate(`new Promise((resolve,reject)=>{let i=0;const t=setInterval(async()=>{if(window.__cadReady){clearInterval(t);resolve();}else if(window.__cadError||i++>120){clearInterval(t);reject(new Error(window.__cadError||'Timeout'));}},100);})`);
    await evaluate(`(async()=>{const api=window.__cadTest;api.restore({nodes:[],bed:[200,200],planeZ:0,name:'Maße am Modell'});api.addShape('box');const s=api.snapshot();s.nodes[0].size=[30,20,10];s.nodes[0].pos=[0,0,5];api.restore(s);api.select([s.nodes[0].id]);api.actions.fit();})()`);
    await pause();
    const corner=await evaluate(`(async()=>{const api=window.__cadTest,h=api.getHandles().find(h=>h.kind==='size'&&h.corner[0]===-1&&h.corner[1]===-1);return api.projectPoint(h.point);})()`);
    await mouseClick(corner);
    assert.ok(await evaluate(`!!window.__cadTest.dimensionState()`),'Clicking a corner must expose dimension inputs');
    assert.equal(await evaluate(`document.querySelectorAll('.dimension-field input').length`),3);
    await typeField('.dimension-field[data-axis="0"] input','42,5');
    let model=await evaluate(`window.__cadTest.snapshot()`),node=model.nodes[0];near(node.size[0],42.5,'On-model width');near(node.pos[0]+node.size[0]/2,15,'Opposite X edge stays fixed');near(node.pos[2]-node.size[2]/2,0,'Bottom stays fixed');
    await typeField('.dimension-field[data-axis="2"] input','15');model=await evaluate(`window.__cadTest.snapshot()`);node=model.nodes[0];near(node.size[2],15,'On-model height');near(node.pos[2]-node.size[2]/2,0,'Height keeps bottom fixed');
    await evaluate(`window.__cadTest.actions.undo()`);near((await evaluate(`window.__cadTest.snapshot()`)).nodes[0].size[2],10,'Undo dimension');
    await evaluate(`window.__cadTest.actions.redo();window.__cadTest.select([window.__cadTest.snapshot().nodes[0].id]);`);
    const corner2=await evaluate(`(async()=>{const api=window.__cadTest;return api.projectPoint(api.getHandles().find(h=>h.kind==='size'&&h.corner[0]===-1&&h.corner[1]===-1).point);})()`);await mouseClick(corner2);
    await new Promise(resolve=>setTimeout(resolve,350));fs.writeFileSync(path.join(output,'dimension-controls.png'),(await win.webContents.capturePage()).toPNG());
    // Merely focusing/leaving a rounded display must preserve the full stored precision.
    await evaluate(`(async()=>{const api=window.__cadTest,s=api.snapshot();s.nodes[0].size[0]=42.500123;api.restore(s);api.select([s.nodes[0].id]);})()`);
    await mouseClick(await evaluate(`(async()=>{const api=window.__cadTest;return api.projectPoint(api.getHandles().find(h=>h.kind==='size'&&h.corner[0]===-1&&h.corner[1]===-1).point);})()`));
    await mouseClick(await buttonPoint('.dimension-field[data-axis="0"] input'));win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await pause();
    assert.equal((await evaluate(`window.__cadTest.snapshot()`)).nodes[0].size[0],42.500123,'No-op focus/blur must not round the model');
    await evaluate(`(async()=>{const api=window.__cadTest,s=api.snapshot(),a=s.nodes[0];a.name='Feste Referenz';a.size=[40,30,10];a.pos=[-35,15,5];const b=structuredClone(a);b.id='moving-b';b.name='Teil B';b.size=[10,12,8];b.pos=[35,-20,4];const c=structuredClone(a);c.id='moving-c';c.name='Teil C';c.size=[16,8,6];c.pos=[10,-35,3];s.nodes=[a,b,c];s.name='Ausrichten am Referenzobjekt';api.restore(s);api.select(s.nodes.map(n=>n.id));api.actions.fit();})()`);
    await mouseClick(await buttonPoint('[data-action="align"]'));
    assert.equal(await evaluate(`document.querySelectorAll('.align-marker').length`),9);
    // Pick the reference on the 3D surface, preserving the multi-selection.
    await mouseClick(await evaluate(`window.__cadTest.projectPoint([-35,15,10])`));
    const refId=await evaluate(`window.__cadTest.snapshot().nodes[0].id`);
    assert.equal(await evaluate(`window.__cadTest.alignmentReference()`),refId,'Clicked object becomes fixed reference');
    assert.ok(await evaluate(`document.getElementById('selected-count').textContent==='3'`),'Reference click must preserve the full selection');
    const initial=(await evaluate(`window.__cadTest.snapshot()`)).nodes[0].pos;
    await mouseClick(await buttonPoint('.align-marker[data-axis="0"][data-edge="1"]'));
    await mouseClick(await buttonPoint('.align-marker[data-axis="1"][data-edge="2"]'));
    model=await evaluate(`window.__cadTest.snapshot()`);assert.deepEqual(model.nodes[0].pos,initial,'Reference must not move');
    for(const n of model.nodes.slice(1)){near(n.pos[0],-35,'X center at reference');near(n.pos[1]+n.size[1]/2,30,'Y max at reference');}
    await new Promise(resolve=>setTimeout(resolve,350));fs.writeFileSync(path.join(output,'alignment-controls.png'),(await win.webContents.capturePage()).toPNG());
    // Reset reference and align the entire selection without moving an implicit anchor.
    await mouseClick(await buttonPoint('.align-banner button:first-of-type'));
    assert.equal(await evaluate(`window.__cadTest.alignmentReference()`),null);
    await mouseClick(await buttonPoint('.align-marker[data-axis="2"][data-edge="0"]'));
    model=await evaluate(`window.__cadTest.snapshot()`);model.nodes.forEach(n=>near(n.pos[2]-n.size[2]/2,0,'Whole selection Z min'));
    await mouseClick(await buttonPoint('.align-banner button:last-of-type'));
    assert.ok(await evaluate(`document.querySelector('.align-markers').hidden`),'Finish exits alignment');
    assert.equal(requests.length,0);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,cornerDimensions:true,decimalComma:true,fixedOppositeCorner:true,dimensionUndoRedo:true,referenceObjectClick:true,nineAlignmentMarkers:true,wholeSelectionAlignment:true,networkRequests:requests.length},null,2));app.exit(0);
  }catch(error){console.error(error.stack);console.error(errors);fs.writeFileSync(path.join(output,'scene-failure.png'),(await win.webContents.capturePage()).toPNG());app.exit(1);}
});
