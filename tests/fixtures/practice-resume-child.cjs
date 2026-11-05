// Isolated acceptance entry. No production credentials or provider requests.
const {app,BrowserWindow,ipcMain,session}=require('electron'),path=require('node:path');
const source=path.resolve(__dirname,'../..'),directory=process.env.FORMNARO_PRACTICE_DIRECTORY;app.setPath('userData',path.join(directory,'profile'));app.setPath('sessionData',path.join(directory,'profile'));
global.fetch=async()=>{throw Error('No cloud inference in this fixture');};
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:true,width:1450,height:950,webPreferences:{contextIsolation:true,sandbox:true,backgroundThrottling:false,preload:path.join(source,'preload.cjs'),additionalArguments:['--formnaro-portable-data','--formnaro-practice',...(process.env.FORMNARO_RESUME_CONVERTER?['--formnaro-stl-converter']:[])]}}),run=code=>win.webContents.executeJavaScript(code),errors=[];
 session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:/^https?:/.test(d.url)}));win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message);});
 const domain=process.env.FORMNARO_RESUME_DOMAIN;
 if(domain)win.once('close',()=>process.connected&&process.send({type:'fixture-close',converterPid:converter?.state()?.pid??null}));
 const converter=domain==='stl'?require('../../backend/stl-converter.cjs').installStlConverter(win,{
  directory:process.env.FORMNARO_RESUME_CONVERTER,tempRoot:directory,waitForClose:true
 }):null;
 let trigger,focusLosses=0;
 win.on('blur',()=>focusLosses++);
 win.webContents.on('dom-ready',()=>{
  if(domain==='sketch')void run(`document.addEventListener('pointermove',event=>{
   if(!event.isTrusted||!event.target?.closest('#sketch-board'))return;
   const observed=window.__practiceDragEvents??={moves:0,held:0};
   observed.moves++;
   if(!(event.buttons&1))return;
   observed.held++;
   if(!window.__practiceDragNotified){window.__practiceDragNotified=true;console.log('FIXTURE_SKETCH_DRAG');}
  },true)`);
  if(domain==='stl')void run(`document.addEventListener('click',event=>{
   if(event.isTrusted&&event.target?.closest('#converter-run'))console.log('FIXTURE_CONVERT_START');
  },true)`);
 });
 function interrupt(extra={}){
  win.blur();
  process.send({type:'fixture-interrupt',domain,...extra});
 }
 win.webContents.on('console-message',event=>{
  if(event.message==='FIXTURE_SKETCH_DRAG')interrupt();
  if(event.message==='FIXTURE_CONVERT_START'&&!trigger){
   trigger=setInterval(()=>{
    const job=converter.state();
    if(!job?.pid)return;
    clearInterval(trigger);
    interrupt({pid:job.pid});
   },10);
   trigger.unref();
  }
 });
 win.on('closed',()=>clearInterval(trigger));
 if(domain)app.once('window-all-closed',()=>{
  const report={type:'fixture-cleanup',converterActive:!!converter?.state(),
   converterDirectories:require('node:fs').readdirSync(directory).filter(name=>name.startsWith('formnaro-stl-'))};
  if(process.connected)process.send(report,()=>app.quit());
  else app.quit();
 });
 require('../../backend/program-storage.cjs').installProgramStorage(win,{directory:path.join(directory,'data'),cadOnly:true});require('../../backend/desktop-ai.cjs').installDesktopAI(win,{settingsFile:path.join(directory,'data/ai-settings.json')});require('../../backend/layouts.cjs').installLayouts(win,{directory:path.join(directory,'layouts')});
 ipcMain.handle('cad-speech:status',()=>({ok:true,value:{available:false}}));ipcMain.handle('cad-speech:online-status',()=>({ok:true,value:{hasKey:false}}));require('../../backend/practice-child.cjs').installPracticeChild(win);
 if(process.env.FORMNARO_TYPE_PAUSE==='1')win.webContents.on('dom-ready',()=>{void run("window.__typingInterrupted=false;document.addEventListener('input',e=>{if(e.target?.id==='size-0'&&e.target.value==='4'&&!window.__typingInterrupted){window.__typingInterrupted=true;console.log('FIXTURE_PAUSE_NUMERIC');}},true);");});
 win.webContents.on('console-message',e=>{if(e.message==='FIXTURE_PAUSE_NUMERIC')for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,x:700,y:350,button:'left',clickCount:1});});
 process.on('message',async m=>{if(m?.type!=='fixture')return;try{
  let value;
  if(m.action==='observe')value=await run(`(()=>{const t=window.__cadTest,q=id=>document.getElementById(id),visible=n=>!!n?.getClientRects().length;return {ready:!!t,count:t?.snapshot().nodes.length,revision:t?.controller.revision(),caption:q('practice-caption')?.textContent,pause:q('practice-pause')?.textContent,overlay:visible(q('practice-overlay')),bar:visible(q('practice-session')),chat:visible(q('ai-chat')),welcomeVisible:visible(q('empty-hint')),title:document.title,typing:window.__typingInterrupted,size:t?.snapshot().nodes[0]?t.snapshot().nodes[0].stats.bounds.max.map((v,k)=>(v-t.snapshot().nodes[0].stats.bounds.min[k])*Math.hypot(...t.snapshot().nodes[0].transform.slice(4*k,4*k+3))):null,undo:t?.undoDepth()}})()`);
  else if(m.action==='domain-state')value={
   ...(await run(`(()=>{const a=window.__cadTest,q=id=>document.getElementById(id);
    if(!a)return {booting:true,caption:q('practice-caption')?.textContent};
    const {sketch,running}=a.sketchUI.state()??{};
    return {draft:sketch??null,drawing:!!running,converter:a.functionsUI.state(),
     drag:!!window.__practiceDragNotified,dragEvents:window.__practiceDragEvents??null,paused:q('practice-pause')?.textContent,revision:a.controller.revision(),
     nodes:a.snapshot().nodes.map(({kind,stats})=>({kind,stats})),undo:a.undoDepth(),
     caption:q('practice-caption')?.textContent};})()`)),
   focused:win.isFocused(),focusLosses,converterPid:converter?.state()?.pid??null,errors:errors.filter(message=>!/WebGL.*CONTEXT_LOST/.test(message))
  };
  else if(m.action==='outside'||m.action==='resume'||m.action==='end'||m.action==='parent'){
   const id={resume:'practice-pause',end:'practice-end',parent:'practice-main'}[m.action];const p=await run(id?`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`:`(()=>{const r=document.querySelector('#canvas-host canvas').getBoundingClientRect();return {x:r.x+r.width*.5,y:r.y+r.height*.2}})()`);
   win.show();win.focus();for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,x:Math.round(p.x),y:Math.round(p.y),button:'left',clickCount:1});value=true;
  }else if(m.action==='focus'){win.show();win.focus();value=true;}
  else if(m.action==='escape'){win.show();win.focus();for(const type of ['keyDown','keyUp'])win.webContents.sendInputEvent({type,keyCode:'Escape'});value=true;}
  else if(m.action==='capture'){await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');require('node:fs').writeFileSync(m.file,(await win.webContents.capturePage()).toPNG());value=true;}
  else throw Error('Unknown fixture command');
  if(process.connected)process.send({type:'fixture-reply',id:m.id,value,errors});
 }catch(error){if(process.connected)process.send({type:'fixture-reply',id:m.id,error:error.message});}});
 await win.loadFile(path.join(source,'dist/index.html'),{query:{practice:'1',test:'1'}});win.show();win.focus();
});app.on('window-all-closed',()=>{if(!process.env.FORMNARO_RESUME_DOMAIN)app.quit();});
