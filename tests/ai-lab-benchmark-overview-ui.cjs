// Real renderer, preload and lab IPC with the v13 sample receipts. No provider calls.
// Usage: npm run build && electron tests/ai-lab-benchmark-overview-ui.cjs <app root> <output dir>
const {app,BrowserWindow,ipcMain,session}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]??path.join(__dirname,'..')),out=path.resolve(process.argv[3]??path.join(root,'work','benchmark-overview-ui'));
const profile=path.join(out,'profile'),data=path.join(out,'data'),directory=path.join(data,'KI-Diagnose');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(profile,{recursive:true});fs.mkdirSync(directory,{recursive:true});
app.setPath('userData',profile);app.setPath('sessionData',profile);
const pause=ms=>new Promise(r=>setTimeout(r,ms)),networkRequests=[];
global.fetch=async url=>{networkRequests.push(String(url));throw Error('Network forbidden in this local UI verification');};
app.whenReady().then(async()=>{
 let win;try{
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{if(/^https?:/i.test(details.url))networkRequests.push(details.url);callback({cancel:/^https?:/i.test(details.url)});});
  win=new BrowserWindow({show:false,width:1500,height:1000,webPreferences:{offscreen:true,contextIsolation:true,sandbox:true,backgroundThrottling:false,preload:path.join(root,'preload.cjs'),additionalArguments:['--formnaro-portable-data']}});
  require(path.join(root,'backend/program-storage.cjs')).installProgramStorage(win,{directory:data,cadOnly:true});
  require(path.join(root,'backend/layouts.cjs')).installLayouts(win,{directory:path.join(out,'Layouts')});
  require(path.join(root,'backend/desktop-ai.cjs')).installDesktopAI(win,{settingsFile:path.join(data,'ai-settings.json')});
  require(path.join(root,'backend/ai-lab-development-evidence.cjs')).installDevelopmentEvidence(win,directory,ipcMain);
  ipcMain.handle('cad-speech:online-status',()=>({ok:true,value:{hasKey:false}}));ipcMain.handle('cad-speech:status',()=>({ok:true,value:{available:false}}));
  const js=s=>win.webContents.executeJavaScript(s),until=async(code,label=code)=>{for(let i=0;i<400;i++){if(await js(code))return;await pause(50);}throw Error('Timeout: '+label);};
  await win.loadFile(path.join(root,'dist/index.html'),{query:{test:'1'}});await until('!!window.__cadTest','renderer ready');
  await js("document.documentElement.dataset.theme='dark'");
  const open="document.querySelector('#ai-diagnostic-open').click();document.querySelector('#ai-diagnostics [data-tab=benchmark]').click()";
  await js(open);
  await until("!!document.querySelector('[data-overview-empty]')",'empty hint');
  assert.equal(await js("document.querySelectorAll('[data-benchmark-overview] svg').length"),0);
  await until("document.querySelector('[data-overview-status]').textContent===''",'empty store loaded');await pause(500);
  assert.equal(await js("getComputedStyle(document.querySelector('[data-overview-plan]').parentElement).display"),'none');
  fs.writeFileSync(path.join(out,'overview-empty.png'),(await win.webContents.capturePage()).toPNG());
  const {sampleReports}=await import(require('node:url').pathToFileURL(path.join(root,'tests/fixtures/lab-benchmark-v13-sample.mjs')).href);
  for(const report of sampleReports())fs.writeFileSync(path.join(directory,'Zusatzpruefung-'+report.id+'.json'),JSON.stringify(report));
  await js("document.querySelector('#ai-diagnostics [data-tab=plan]').click();document.querySelector('#ai-diagnostics [data-tab=benchmark]').click()");
  await until("!!document.querySelector('[data-overview-landscape]')",'overview rendered');
  const text=await js("document.querySelector('[data-benchmark-overview]').textContent");
  assert.match(text,/25 Aufgaben · 8 Läufe/);assert.match(text,/GPT-6\.2 Sol löst am meisten, DeepSeek Flash High am günstigsten/);
  assert.equal(await js("document.querySelectorAll('[data-benchmark-overview] .lab-ov-cell').length"),200);
  // Capture every block at full height by expanding the dialog's scroll area.
  const height=await js("(()=>{const d=document.querySelector('#ai-diagnostics');const b=d.querySelector('.lab-body');const o=d.querySelector('[data-benchmark-overview]');b.scrollTop=o.offsetTop-b.offsetTop-12;return Math.ceil(o.getBoundingClientRect().height)+260;})()");
  win.setContentSize(1500,Math.min(Math.max(height+600,1000),5200));await js("(()=>{const d=document.querySelector('#ai-diagnostics');d.style.height=d.style.maxHeight='calc(100vh - 40px)';})()");await pause(400);
  await js("(()=>{const d=document.querySelector('#ai-diagnostics');const b=d.querySelector('.lab-body');const o=d.querySelector('[data-benchmark-overview]');b.scrollTop=o.offsetTop-b.offsetTop-12;})()");await pause(300);
  fs.writeFileSync(path.join(out,'overview-dark.png'),(await win.webContents.capturePage()).toPNG());
  win.setContentSize(1500,1000);await pause(300);
  await js("(()=>{const b=document.querySelector('#ai-diagnostics .lab-body');b.scrollTop=0;})()");await pause(200);
  fs.writeFileSync(path.join(out,'overview-tab.png'),(await win.webContents.capturePage()).toPNG());
  assert.ok(networkRequests.every(url=>new URL(url).hostname==='www.ecb.europa.eu'),JSON.stringify(networkRequests));
  const result={passed:true,checks:['empty hint without charts','v13 sample receipts rendered live from the lab store','headline and 25x8 landscape','dark screenshots'],screenshots:['overview-empty.png','overview-dark.png','overview-tab.png']};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  win.destroy();app.quit();
 }catch(error){console.error(error);try{if(win)fs.writeFileSync(path.join(out,'failure.png'),(await win.webContents.capturePage()).toPNG());}catch{}app.exit(1);}
});
