const Module=require('node:module'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),load=Module._load;
const root=path.resolve(__dirname,'../..');
Module._load=function(request,parent,isMain){
 if(request==='./backend/maintenance-verification.cjs')return {verifyMaintenance:async win=>{
  const dir=path.dirname(process.argv.find(v=>v.startsWith('--verify-maintenance=')).split('=').slice(1).join('=')),js=code=>win.webContents.executeJavaScript(code),checks=[],observations=[];
  await js(`(async()=>{const a=window.__cadTest,c=a.controller;await a.resetProject();await c.execute({kind:'create',recipe:{type:'box',size:[40,30,8]},options:{id:'body',name:'Grundplatte'}});await c.execute({kind:'tool',name:'previewDrill',options:{id:'body',resultId:'bore',reference:{ray:{origin:[0,0,30],direction:[0,0,-1]}},associative:true,diameter:4}});for(let i=0;i<13;i++)await c.execute({kind:'create',recipe:{type:'box',size:[10,10,5]},options:{id:'part-'+i,name:'Teil '+i}});await a.settled();window.__sidebarBefore=a.serialize();window.__sidebarUndo=a.undoDepth();})()`);
  for(const mode of ['solid','fusion','normal','solid','normal','solid']){
   await js(`document.querySelector('[data-workbench-mode=${mode}]').click()`);
   await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
   const value=await js(`(()=>{const list=document.getElementById('object-list'),section=list.closest('.sidebar-object-section'),footer=section.querySelector('.sidebar-bottom'),tip=document.querySelector('.solid-tip');const rect=n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}};return {mode:${JSON.stringify(mode)},list:rect(list),section:rect(section),footer:rect(footer),tip:tip?rect(tip):null,sectionStyle:section.getAttribute('style'),sectionCss:{display:getComputedStyle(section).display,flex:getComputedStyle(section).flex,height:getComputedStyle(section).height},listOverflow:getComputedStyle(list).overflow,children:list.children.length}})()`);
   value.lastRowBottom=await js('document.getElementById("object-list").lastElementChild.getBoundingClientRect().bottom');
   observations.push(value);
   fs.writeFileSync(path.join(dir,'observations.json'),JSON.stringify(observations,null,2));
   if(value.list.bottom>value.footer.top+1||value.listOverflow==='visible'&&value.lastRowBottom>value.footer.top+1){fs.writeFileSync(path.join(dir,'overlap.png'),(await win.webContents.capturePage()).toPNG());throw Error('Object list overlaps footer in '+mode+': '+JSON.stringify(value));}
   if(value.tip&&value.footer.bottom>value.tip.top+1)throw Error('Footer overlaps Solid hint');
   checks.push(mode+' object list, footer and hint do not overlap');
   if(mode==='solid'){await js("document.querySelector('[data-solid-manager-panel=model]').scrollTop=100000");await js('new Promise(r=>requestAnimationFrame(r))');fs.writeFileSync(path.join(dir,'solid-fixed.png'),(await win.webContents.capturePage()).toPNG());}
  }
  await js("window.__cadTest.select([{rootId:'bore',path:[]}]);window.__cadTest.settled()");
  await js("document.querySelector('[data-workbench-mode=normal]').click()");
  await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  await js("{const chat=document.getElementById('ai-chat');if(!chat.classList.contains('collapsed'))document.getElementById('ai-chat-toggle').click();document.getElementById('history-drill').scrollIntoView({block:'start'});}");
  await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  assert(await js("!document.getElementById('history-drill').hidden&&document.getElementById('history-operation-row').hidden"),'drill inspector explains feature and hides ordinary group operation');checks.push('associative hole inspector explains the protected construction');
  fs.writeFileSync(path.join(dir,'hole-explanation.png'),(await win.webContents.capturePage()).toPNG());
  await js("document.getElementById('history-drill-edit').click()");
  assert.equal(await js('window.__cadTest.tools.referenceUI.state()?.kind'),'editDrill');checks.push('inspector edit button opens existing hole editor');
  await js('window.__cadTest.tools.referenceUI.close()');
  assert(await js('window.__cadTest.serialize()===window.__sidebarBefore&&window.__cadTest.undoDepth()===window.__sidebarUndo'),'switching modes and opening the explanation/editor must preserve model and Undo');checks.push('mode switches and hole editor preserve model and Undo');
  await js("(async()=>{const a=window.__cadTest;await a.execute({kind:'batch',commands:[{op:'group',targets:['part-0','part-1'],as:'ordinary'}]});const n=a.controller.snapshot().nodes.find(n=>n.children?.some(c=>c.id==='part-0'));a.select([{rootId:n.id,path:[]}]);await a.settled();})()");
  assert(await js("document.getElementById('history-drill').hidden&&!document.getElementById('history-operation-row').hidden"),'ordinary CSG group must keep its group-operation controls');checks.push('ordinary groups retain their operation selector without a hole hint');
  fs.writeFileSync(path.join(dir,'fixed.png'),(await win.webContents.capturePage()).toPNG());
  return {ok:true,checks};
 }};
 return load.apply(this,arguments);
};
require(path.join(root,'electron.cjs'));
