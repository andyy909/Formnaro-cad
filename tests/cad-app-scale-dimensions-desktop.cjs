const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const output=path.resolve(__dirname,'../work/cad-scale-dimensions',process.env.FORMNARO_SCALE_LABEL||'current');fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(output,'profile-'));app.setPath('userData',profile);app.setPath('sessionData',profile);
app.whenReady().then(async()=>{
 const errors=[],external=[];session.defaultSession.webRequest.onBeforeRequest((d,cb)=>{if(/^https?:/i.test(d.url)){external.push(d.url);cb({cancel:true});}else cb({});});
 const win=new BrowserWindow({show:false,width:1500,height:950,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}}),run=async code=>{
  const reply=await win.webContents.executeJavaScript(`(async()=>{try{return {ok:true,value:await (${code})};}catch(error){return {ok:false,error:error.stack??error.message};}})()`);
  if(!reply.ok)throw Error(reply.error);
  return reply.value;
 };
 win.webContents.on('console-message',d=>{if(d.level==='error')errors.push(d.message);});win.webContents.debugger.attach('1.3');let pressed=false;
 async function mouse(type,p){if(type==='mousePressed')pressed=true;if(type==='mouseReleased')pressed=false;await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,x:Math.round(p.x),y:Math.round(p.y),button:pressed||type==='mouseReleased'?'left':'none',buttons:pressed?1:0,clickCount:1});}
 async function checkLive(){return run(`(async()=>{const a=window.__cadTest;await a.view.renderReady();const b=window.scaleBefore,o=document.querySelector('.cad-scale-dimensions'),labels=[...o.querySelectorAll('.cad-scale-dimension')];if(!o.checkVisibility()||labels.length!==3||labels.some(e=>!e.checkVisibility()||!e.textContent.includes('mm')))throw Error('Live dimensions missing');if(a.serialize()!==b.model||a.undoDepth()!==b.undo)throw Error('Pointer preview changed CAD/history');const rect=a.view.canvas.getBoundingClientRect(),rs=labels.map(e=>e.getBoundingClientRect());if(rs.some(r=>r.left<rect.left||r.right>rect.right||r.top<rect.top||r.bottom>rect.bottom))throw Error('Dimension label outside viewport');if(rs.some((r,i)=>rs.some((s,j)=>i!==j&&r.left<s.right&&r.right>s.left&&r.top<s.bottom&&r.bottom>s.top)))throw Error('Dimension labels overlap '+JSON.stringify(labels.map((e,i)=>({text:e.textContent,rect:rs[i].toJSON()}))));return labels.map(e=>Number(e.dataset.value));})()`);}
 async function setup(kind,axis=null,sign=1){return run(`(async()=>{const a=window.__cadTest;await a.resetProject();let target;if(${JSON.stringify(kind)}==='source'){await a.loadDemo();const root=a.getModel().nodes[0],hole=root.children.find(n=>!n.solid);target={rootId:root.id,path:[hole.id]};}else{const id=await a.addShape('box');target={rootId:id,path:[]};if(${JSON.stringify(kind)}==='affine')await a.mutate(p=>{const n=p.nodes.find(n=>n.id===id);n.transform[0]=-1.2;n.transform[4]=.35;n.transform[9]=.2;});}a.select([target]);await a.settled();a.view.setView(${JSON.stringify(kind)}==='box'?'iso':'top');a.view.fit();await new Promise(r=>setTimeout(r,100));const item=a.getScene().objects.find(n=>n.id===(target.path.at(-1)||target.rootId));window.scaleBefore={model:a.serialize(),undo:a.undoDepth(),revision:a.controller.revision(),target};const axis=${JSON.stringify(axis)},sign=${JSON.stringify(sign)},handle=axis===2?a.getHeightHandle():axis===null?a.getHandles().find(h=>h.kind==='corner'&&h.corner[0]===1&&h.corner[1]===1):a.getHandles().find(h=>h.kind==='side'&&h.axes[0]===axis&&h.corner[axis]===sign);if(!handle)throw Error('Separate scale grip missing');window.scaleBefore.corner=handle.corner;window.scaleBefore.matrix=item.worldMatrix;window.scaleBefore.bounds=item.localBounds;const p=a.projectPoint(handle.point),q=axis===null?p:a.projectPoint(handle.point.map((v,k)=>v+item.worldMatrix[axis*4+k]*item.localBounds.size[axis]*.3*sign));return {p,delta:axis===null?null:Math.hypot(q.x-p.x,q.y-p.y)>4?{x:q.x-p.x,y:q.y-p.y}:{x:0,y:-36},sizes:item.localBounds.size.map((v,k)=>v*Math.hypot(item.transform[k*4],item.transform[k*4+1],item.transform[k*4+2]))};})()`);}
 try{
  await win.loadFile(path.resolve(process.env.FORMNARO_SCALE_APP_ENTRY||path.join(__dirname,'../work/cad-v011/native-app/index.html')),{query:{test:'1'}});
  await run(`new Promise((resolve,reject)=>{let n=0;const t=setInterval(()=>{if(window.__cadTest){clearInterval(t);resolve();}else if(window.__cadError||n++>3000){clearInterval(t);reject(Error(window.__cadError||'Start timeout'));}},20);})`);
  const cases=[];
  for(const kind of ['box','affine','source']){
   const {p,sizes}=await setup(kind);await mouse('mouseMoved',p);await mouse('mousePressed',p);const initial=await checkLive();if(initial.some((v,k)=>Math.abs(v-sizes[k])>1e-8))throw Error('Initial size mismatch');
   const end={x:p.x+38,y:p.y-29};await mouse('mouseMoved',end);const live=await checkLive();if(live[2]!==initial[2])throw Error('XY corner changed height');if(live.every((v,k)=>v===initial[k]))throw Error('Dimensions not updated while dragging');
   if(!await run("document.querySelector('.cad-scale-preview-status').checkVisibility()"))throw Error('Drag preview status is missing');
   if(kind==='box'){
    await run('(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);})()');await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await new Promise(r=>setTimeout(r,120));fs.writeFileSync(path.join(output,'live-light.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
    await run(`(()=>{document.body.dataset.theme='dark';window.__cadTest.view.setTheme(true);})()`);await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await new Promise(r=>setTimeout(r,120));fs.writeFileSync(path.join(output,'live-dark.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
   }
   await mouse('mouseReleased',end);
   const committed=await run(`(async()=>{const a=window.__cadTest,b=window.scaleBefore,start=performance.now();while(a.controller.revision()===b.revision){if(performance.now()-start>15000)throw Error('Scale did not commit');await new Promise(r=>setTimeout(r,10));}await a.settled();if(a.undoDepth()!==b.undo+1)throw Error('Scale is not one Undo');if(document.querySelector('.cad-scale-dimensions').checkVisibility())throw Error('Overlay remained after release');const item=a.getScene().objects.find(n=>n.id===(b.target.path.at(-1)||b.target.rootId)),sizes=item.localBounds.size.map((v,k)=>v*Math.hypot(item.transform[k*4],item.transform[k*4+1],item.transform[k*4+2]));await a.actions.undo();if(a.serialize()!==b.model)throw Error('Undo changed originals');return sizes;})()`);
   if(committed.some((v,k)=>Math.abs(v-live[k])>1e-7))throw Error('Live label differs from committed CAD dimension');cases.push({kind,initial,live,committed,oneUndo:true});
  }
  for(const kind of ['box','affine','source'])for(const axis of [0,1,2])for(const sign of axis===2?[1]:[-1,1]){
   const {p,sizes,delta}=await setup(kind,axis,sign);await mouse('mouseMoved',p);await mouse('mousePressed',p);await checkLive();
   const end={x:p.x+delta.x,y:p.y+delta.y};await mouse('mouseMoved',end);const live=await checkLive();
   if(Math.abs(live[axis]-sizes[axis])<.1||live.some((v,k)=>k!==axis&&v!==sizes[k]))throw Error('Axis grip changed wrong dimensions '+JSON.stringify({kind,axis,sign,sizes,live}));
   await mouse('mouseReleased',end);
   await run(`(async()=>{const a=window.__cadTest,b=window.scaleBefore,start=performance.now();while(a.controller.revision()===b.revision){if(performance.now()-start>15000)throw Error('Single-axis scale did not commit');await new Promise(r=>setTimeout(r,10));}await a.settled();const item=a.getScene().objects.find(n=>n.id===(b.target.path.at(-1)||b.target.rootId)),sizes=item.localBounds.size.map((v,k)=>v*Math.hypot(item.transform[k*4],item.transform[k*4+1],item.transform[k*4+2]));if(sizes.some((v,k)=>Math.abs(v-${JSON.stringify(live)}[k])>1e-7))throw Error('Single axis live/commit mismatch');const anchor=b.bounds.min.map((v,k)=>k===2||b.corner[k]===1?v:b.bounds.max[k]),point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[4+k]*p[1]+m[8+k]*p[2]+m[12+k]),before=point(b.matrix,anchor),after=point(item.worldMatrix,anchor);if(after.some((v,k)=>Math.abs(v-before[k])>1e-8))throw Error('Opposite edge or bottom moved');if(a.undoDepth()!==b.undo+1)throw Error('Single axis scale not one Undo');await a.actions.undo();if(a.serialize()!==b.model)throw Error('Single axis Undo changed original');})()`);
   cases.push({kind,axis,sign,initial:sizes,live,otherAxesUnchanged:true,anchorFixed:true,undoExact:true});
  }
  for(const cancel of ['escape','pointercancel']){
   const {p}=await setup('affine');await mouse('mouseMoved',p);await mouse('mousePressed',p);await mouse('mouseMoved',{x:p.x+27,y:p.y-31});await checkLive();
   if(cancel==='escape')await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});else await run(`window.__cadTest.view.canvas.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1}))`);
   await mouse('mouseReleased',p);await run(`(async()=>{const a=window.__cadTest,b=window.scaleBefore;await a.settled();if(a.serialize()!==b.model||a.undoDepth()!==b.undo||document.querySelector('.cad-scale-dimensions').checkVisibility())throw Error('Cancel changed original or kept overlay');})()`);
  }
  const {p,sizes}=await setup('box');
  const open=async()=>{await mouse('mouseMoved',p);await mouse('mousePressed',p);await mouse('mouseReleased',p);};
  await open();
  await run(`(async()=>{
   const a=window.__cadTest,b=window.scaleBefore,dialog=document.getElementById('modal'),input=document.getElementById('corner-size-0'),notice=document.querySelector('.cad-scale-preview-status');
   if(!dialog.open||!input)throw Error('Corner click no longer opens dimension input');
   const matrix=()=>JSON.stringify(a.view.groups.bodies.children.map(mesh=>mesh.matrix.toArray())),before=matrix();
   input.value=String(${sizes[0]+7});input.dispatchEvent(new Event('input',{bubbles:true}));
   await a.view.renderReady();
   if(notice.hidden||matrix()===before||a.serialize()!==b.model||a.undoDepth()!==b.undo)throw Error('Numeric preview did not stay visual and provisional');
   const closed=new Promise(resolve=>dialog.addEventListener('close',resolve,{once:true}));
   dialog.close();
   await Promise.race([closed,new Promise((_resolve,reject)=>setTimeout(()=>reject(Error('Numeric dialog did not dispatch close')),2000))]);
   await a.view.renderReady();
   if(!notice.hidden||matrix()!==before||a.serialize()!==b.model||a.undoDepth()!==b.undo)throw Error('Closing numeric preview did not restore its original display '+JSON.stringify({hidden:notice.hidden,viewRestored:matrix()===before,modelRestored:a.serialize()===b.model,undo:a.undoDepth()}));
  })()`);
  await open();
  await run(`(async()=>{
   const a=window.__cadTest,b=window.scaleBefore,input=document.getElementById('corner-size-0'),notice=document.querySelector('.cad-scale-preview-status');
   const original=a.controller.preview,calls=[];
   let release;
   a.controller.preview=async(...args)=>{
    calls.push(args[1].project.nodes[0].transform[0]);
    const result=await original(...args);
    if(calls.length===1)await new Promise(resolve=>release=resolve);
    return result;
   };
   const set=value=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));};
   const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
   try{
    for(let i=1;i<=5;i++)set(${sizes[0]}+i);
    await a.view.renderReady();
    if(calls.length||notice.hidden||a.serialize()!==b.model)throw Error('Early preview mutated model or started native work before debounce');
    for(let i=0;i<150&&!release;i++)await wait(20);
    if(calls.length!==1||!release)throw Error('Settled input did not start one native preview');
    const camera=a.view.viewState().position;
    document.querySelector('[data-view="front"]').click();
    if(a.view.viewState().position.every((value,k)=>value===camera[k]))throw Error('Camera action was blocked by numeric preview');
    document.querySelector('[data-action="sketch-on-part"]').click();
    if(a.sketchUI.state())throw Error('Surface action used the provisional display');
    for(let i=6;i<=9;i++)set(${sizes[0]}+i);
    await wait(220);
    if(calls.length!==1)throw Error('Queued inputs started parallel native previews');
    release();
    for(let i=0;i<150&&(calls.length<2||notice.textContent!=='Vorschau bereit');i++)await wait(20);
    if(calls.length!==2||notice.textContent!=='Vorschau bereit'||a.serialize()!==b.model||a.undoDepth()!==b.undo)throw Error('Latest native preview was not ready without commit');
    document.getElementById('corner-apply').click();
    for(let i=0;i<150&&a.controller.revision()===b.revision;i++)await wait(20);
    await a.settled();await wait(80);
    const actual=a.getScene().objects.find(item=>item.id===b.target.rootId),width=actual.localBounds.size[0]*Math.hypot(...actual.transform.slice(0,3));
    if(!notice.hidden||a.undoDepth()!==b.undo+1||Math.abs(width-(${sizes[0]}+9))>1e-7||calls.length!==2)throw Error('Numeric Apply did not reuse the latest prepared candidate');
    await a.actions.undo();
    if(a.serialize()!==b.model)throw Error('Numeric Apply Undo changed the original');
   }finally{release?.();a.controller.preview=original;}
  })()`);
  for(const interrupt of ['undo','project','close']){
   const {p,sizes}=await setup('box');
   await mouse('mouseMoved',p);await mouse('mousePressed',p);await mouse('mouseReleased',p);
   await run(`(async()=>{
    const a=window.__cadTest,original=a.controller.preview,paint=a.view.setPreview;
    let release,published=0;
    a.controller.preview=async(...args)=>{const proposal=await original(...args);await new Promise(resolve=>release=resolve);return proposal;};
    a.view.setPreview=(...args)=>{published++;return paint(...args);};
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    try{
     const input=document.getElementById('corner-size-0');
     input.value=String(${sizes[0]+5});input.dispatchEvent(new Event('input',{bubbles:true}));
     for(let i=0;i<150&&!release;i++)await wait(20);
     if(!release)throw Error('No delayed candidate');
     const action=${JSON.stringify(interrupt)};
     if(action==='undo')await a.actions.undo();
     else if(action==='project')await a.resetProject();
     else document.getElementById('modal-close').click();
     for(let i=0;i<100&&document.querySelector('.cad-corner-dialog[open]');i++)await wait(20);
     const revision=a.controller.revision(),model=a.serialize(),depth=a.undoDepth();
     release();await wait(180);await a.settled();await a.view.renderReady();
     if(published||!document.querySelector('.cad-scale-preview-status').hidden||a.controller.revision()!==revision||a.serialize()!==model||a.undoDepth()!==depth)throw Error('Stale scale result after '+action+' '+JSON.stringify({published,hidden:document.querySelector('.cad-scale-preview-status').hidden,revision:a.controller.revision(),expected:revision,modelMatches:a.serialize()===model,depth:a.undoDepth(),expectedDepth:depth}));
    }finally{release?.();a.controller.preview=original;a.view.setPreview=paint;}
   })()`);
  }
  if(errors.length||external.length)throw Error(JSON.stringify({errors,external}));const result={ok:true,cases,escape:true,pointercancel:true,clickDimensions:true,errors,external};fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.exit(0);
 }catch(error){fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:false,error:error.message,errors,external},null,2));console.error(error.stack);app.exit(1);}
});
