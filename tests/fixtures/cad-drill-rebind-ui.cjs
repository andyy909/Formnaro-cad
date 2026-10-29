const Module=require('node:module'),path=require('node:path'),assert=require('node:assert/strict'),original=Module._load;
Module._load=function(request,parent,isMain){
 if(request==='./backend/maintenance-verification.cjs')return {verifyMaintenance:async win=>{
  const js=code=>win.webContents.executeJavaScript(code),pause=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
  async function waitFor(code){for(let i=0;i<200;i++){if(await js(code))return;await pause(30);}throw Error('Timeout: '+code);}
  async function clickWorld(point){await js("window.__cadTest.view.setView('top')");await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const p=await js('window.__cadTest.view.projectPoint('+JSON.stringify(point)+')'),x=Math.round(p.x),y=Math.round(p.y);assert(await js('document.elementFromPoint('+x+','+y+')===window.__cadTest.view.canvas'));for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,x,y,button:'left',clickCount:1});await pause(100);}
  await js(`(async()=>{const a=window.__cadTest;await a.resetProject();await a.controller.execute({kind:'create',recipe:{type:'box',size:[40,20,8]},options:{id:'body'}});await a.controller.execute({kind:'tool',name:'previewDrill',options:{id:'body',resultId:'bore',reference:{ray:{origin:[0,0,30],direction:[0,0,-1]}},associative:true,kind:'counterbore',diameter:4,headDiameter:8,headDepth:1}});a.controller.apply(await a.controller.previewProjectParameters({version:1,parameters:[{id:'height',name:'height',value:8}],bindings:[{id:'b-height',parameterId:'height',target:{rootId:'bore',path:['body']},field:'size.2'}],variants:[],activeVariantId:null}));a.select([{rootId:'bore',path:[]}]);await a.settled();a.view.fit();a.tools.referenceUI.openRebind();window.__before=a.serialize();document.querySelector('[data-rebind-entry]').click();})()`);
  await waitFor('window.__cadTest.view.groups.sources.children.length===1');checks.push('original source displayed for entry selection');
  await js('(async()=>{const a=window.__cadTest,q=a.getQuality();q.display.deflection=.04;await a.setQuality(q);await a.settled();})()');
  assert(await js('window.__cadTest.view.groups.sources.children.length===0&&window.__cadTest.tools.referenceUI.isActive()'));checks.push('real quality change refreshed display without changing geometry');
  // This visible annular counterbore floor is below the original entry face.
  // It must not silently select an invisible point on the original source.
  await clickWorld([-3,0,3]);
  assert(await js("document.querySelector('[data-rebind-count]').textContent.startsWith('0 Zuordnung')&&window.__cadTest.serialize()===window.__before"));checks.push('native mouse click on finished counterbore floor does not assign original entry');
  await js("document.querySelector('[data-rebind-entry]').click()");await waitFor('window.__cadTest.view.groups.sources.children.length===1');await clickWorld([-3,0,4]);
  assert(await js("document.querySelector('[data-rebind-count]').textContent.includes('1 vollständig')"));checks.push('restarting source selection accepts visible original-source mouse hit');
  await js("document.querySelector('[data-rebind-preview]').click()");await waitFor("document.querySelector('[data-rebind-apply]')?.disabled===false");assert(await js('window.__cadTest.serialize()===window.__before'));await js('window.__cadTest.tools.referenceUI.close()');checks.push('restarted source pick builds valid unconfirmed preview');
  return {ok:true,checks,selectionMethod:'native Electron mouse events on visible source and counterbore floor; dialog DOM inputs'};
 }};
 return original.apply(this,arguments);
};
require(path.resolve(__dirname,'../../electron.cjs'));
