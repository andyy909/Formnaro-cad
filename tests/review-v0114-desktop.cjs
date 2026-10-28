const {app,BrowserWindow,session,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'work/review-v0114-desktop');fs.mkdirSync(directory,{recursive:true});const profile=fs.mkdtempSync(path.join(directory,'profile-'));app.setPath('userData',profile);app.setPath('sessionData',profile);
app.whenReady().then(async()=>{
 const checks=[],errors=[],external=[],win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{offscreen:true,contextIsolation:true,sandbox:true,backgroundThrottling:false,preload:path.join(root,'preload.cjs'),additionalArguments:['--formnaro-portable-data','--formnaro-error-log']}});
 session.defaultSession.webRequest.onBeforeRequest((d,cb)=>{if(/^https?:/i.test(d.url))external.push(d.url);cb({cancel:/^https?:/i.test(d.url)});});
 const js=code=>win.webContents.executeJavaScript(code),pause=()=>new Promise(r=>setTimeout(r,50));
 async function until(code){for(let i=0;i<1000;i++){if(await js(code))return;await pause();}throw Error('Timeout '+code);}
 const dataPath=path.join(profile,'Daten'),legacyAIFile=path.join(profile,'ai-settings.json');fs.mkdirSync(path.join(dataPath,'Fehlerprotokolle'),{recursive:true});
 fs.writeFileSync(legacyAIFile,JSON.stringify({config:{...require('../backend/ai-provider.cjs').DEFAULT_CONFIG,model:'review-legacy-model',bridgeEnabled:false}}));
 require('../backend/program-storage.cjs').installProgramStorage(win,{directory:dataPath,legacyAIFile,cadOnly:true});
 // Execute the actual application callsite, including its marker predicate.
 const setup=fs.readFileSync(path.join(root,'electron.cjs'),'utf8').split('\n').find(line=>line.includes("require('./backend/desktop-ai.cjs').installDesktopAI"));
 vm.runInNewContext(setup,{require:name=>require(path.join(root,name)),win,dataPath,legacyAIFile,fs,path});
 require('../backend/layouts.cjs').installLayouts(win,{directory:path.join(profile,'Layouts')});
 win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message);});
 try{
  await win.loadFile(path.join(root,'dist/index.html'),{query:{test:'1'}});await until('!!window.__cadTest');await js('window.__cadTest.layoutUI.ready()');
  assert.equal(await js('(async()=>(await window.offlinecadDesktop.getAISettings()).model)()'),'review-legacy-model');checks.push('Markerless early-log folder retains the migrated AI model in the first in-memory settings');
  await js("(async()=>{const a=window.__cadTest;await a.execute({kind:'batch',commands:[{op:'create',type:'box',size:[10,10,10],as:'body'}]});await a.settled();a.select([{rootId:a.snapshot().nodes[0].id,path:[]}]);window.reviewBefore={model:a.serialize(),undo:a.undoDepth()};a.actions['cad-surface-fill']();})()");
  await until('!!window.__cadTest.advancedFreeCADUI.state()?.available');
  for(const key of ['Delete','Backspace','g','m','l','d','w','ArrowLeft'])await js(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true}));void 0`);
  for(const key of ['z','d','g','o'])await js(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},ctrlKey:true,bubbles:true}));void 0`);
  assert(await js("window.__cadTest.serialize()===window.reviewBefore.model&&window.__cadTest.undoDepth()===window.reviewBefore.undo&&!!window.__cadTest.advancedFreeCADUI.state()"));checks.push('Open surface editor blocks destructive and Ctrl shortcuts before a preview exists');
  assert(await js("(()=>{try{window.__cadTest.workbenchUI.setMode('fusion');return false;}catch(e){return /abschließen/.test(e.message);}})()"));checks.push('Workbench changes are blocked until the surface editor closes');
  await js("window.__cadTest.advancedFreeCADUI.close();window.__cadTest.workbenchUI.setMode('fusion');void 0");
  const css=await js("[getComputedStyle(document.querySelector('.fusion-menu-panel')).borderTopStyle,getComputedStyle(document.querySelector('.fusion-tabs button[aria-selected=true]')).borderBottomWidth]");assert.equal(css[0],'solid');assert.equal(css[1],'3px');checks.push('Fusion dropdown border and active tab underline have valid computed CSS');
  for(const attribute of ['cad-surface-transition','cad-surface-sew','cad-surface-relief'])assert(await js(`(()=>{const a=window.__cadTest;a.select([]);return [...document.querySelectorAll('[data-action="${attribute}"]')].every(b=>b.disabled);})()`));
  assert(await js("[...document.querySelectorAll('[data-action=\"cad-surface-fill\"]')].every(b=>!b.disabled)"));checks.push('Surface source tools disable without CAD selection; independent surface creation stays available');
  await js("(()=>{const a=window.__cadTest,old=a.workbenchUI.sync;a.workbenchUI.sync=(...args)=>{window.reviewLanguageSync=(window.reviewLanguageSync||0)+1;return old(...args);};a.ui.settings.open();const e=document.getElementById('settings-language');e.value='en';e.dispatchEvent(new Event('change'));})()");
  assert(await js("window.reviewLanguageSync===1&&window.__cadTest.getSettings().language==='en'"));
  await js("document.getElementById('settings-language').value='de';document.getElementById('settings-language').dispatchEvent(new Event('change'));document.getElementById('settings-done').click();void 0");checks.push('Language changes rebuild the Fusion workbench immediately');
  const sketch={version:4,kind:'profile',variables:[{name:'width',value:'10'}],dimensions:{height:'2'},constraints:[],elements:[{id:'curve',type:'bspline',start:['0','0'],control1:['0','10'],control2:['width','10'],end:['width','0'],construction:false},{id:'base',type:'line',start:['width','0'],end:['0','0'],construction:false},{id:'helper-circle',type:'circle',center:[20,20],diameter:'4',construction:true},{id:'helper-arc',type:'arc',start:[20,0],through:[22,2],end:[24,0],construction:true}],loops:[{id:'outer',role:'outer',elements:['curve','base']}]};
  await js(`window.__cadTest.sketchUI.openImported({sketch:${JSON.stringify(sketch)},name:'Review sketch'});void 0`);
  await until("document.querySelectorAll('#sketch-board circle.construction').length===1&&document.querySelectorAll('#sketch-board path.construction').length===1");checks.push('Construction circle and arc are drawn as real SVG curves');
  await js("(()=>{const s=document.getElementById('sketch-profile-element');s.value='curve';s.dispatchEvent(new Event('change'));})()");
  assert(await js("document.getElementById('sketch-trim').disabled&&document.getElementById('sketch-extend').disabled&&![...document.getElementById('sketch-edit-cutter').options].some(o=>o.value==='curve')"));checks.push('B-splines are excluded from unsupported trim targets and cutters');
  await pause();await pause();fs.writeFileSync(path.join(directory,'fusion-sketch.png'),(await win.webContents.capturePage()).toPNG());
  const open=structuredClone(sketch);open.elements=open.elements.filter(e=>e.id!=='base');open.loops[0].elements=['curve'];
  await js(`document.getElementById('sketch-cancel').click();window.__cadTest.sketchUI.openImported({sketch:${JSON.stringify(open)},name:'Formula draft'});document.getElementById('sketch-profile-role').value='outer';document.getElementById('sketch-profile-shape').value='line';void 0`);
  for(const point of [[10,0],[10,-5]]){const p=await js(`(()=>{const b=document.getElementById('sketch-board'),p=b.createSVGPoint();p.x=${point[0]};p.y=${-point[1]};const q=p.matrixTransform(b.getScreenCTM());return {x:Math.round(q.x),y:Math.round(q.y)};})()`);for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,...p,button:'left',clickCount:1});await pause();}
  await js("(()=>{const e=document.querySelector('[data-profile-field=end0]');e.value='width';e.dispatchEvent(new Event('input'));document.getElementById('sketch-profile-close').click();})()");
  assert.equal(await js('window.__cadTest.sketchUI.state().sketch.elements.length'),5);
  assert(await js("window.__cadTest.sketchUI.state().sketch.elements.at(-1).start[0]==='width'"));checks.push('Closing an open formula-driven chain adds a symbolic closing line');
  const fixed=structuredClone(sketch);fixed.constraints=[{id:'fixed-curve',type:'fixed',refs:[{element:'curve'}],value:{start:[0,0],control1:[0,10],control2:[10,10],end:[10,0]}}];
  await js(`document.getElementById('sketch-cancel').click();window.__cadTest.sketchUI.openImported({sketch:${JSON.stringify(fixed)},name:'Fixed spline'});document.getElementById('sketch-profile-element').value='curve';document.getElementById('sketch-profile-element').dispatchEvent(new Event('change'));void 0`);
  assert(await js("document.querySelector('[data-profile-control-add]').disabled&&document.querySelector('[data-profile-control-remove]').disabled"));checks.push('Whole-element fixed B-splines retain the control structure');
  await js("document.getElementById('sketch-cancel').click();window.__cadTest.cancel();window.__cadTest.controller.dispose();window.__cadTest.view.dispose();void 0");
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify({ok:true,checks,errors,external,isolatedProfile:true},null,2));console.log(JSON.stringify({ok:true,checks}));app.exit(0);
 }catch(error){fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify({ok:false,error:error.stack,checks,errors,external,isolatedProfile:true},null,2));fs.writeFileSync(path.join(directory,'failed.png'),(await win.webContents.capturePage()).toPNG());console.error(error.stack);app.exit(1);}
});
