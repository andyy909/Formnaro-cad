const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
exports.verifyCompact=async function(win,{directory},mode){
 const checks=[],run=code=>win.webContents.executeJavaScript(code);
 const frame=()=>run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 async function proof(name,code){try{await run(`(async()=>{const a=window.__cadTest,check=(v,m)=>{if(!v)throw Error(m)};${code}})()`);checks.push(name);}catch(e){fs.writeFileSync(path.join(directory,'failed.png'),(await win.webContents.capturePage()).toPNG());throw e;}}
 fs.mkdirSync(directory,{recursive:true});win.setMinimumSize(700,600);
 await run('window.__cadTest.layoutUI.ready()');await run('window.__cadTest.settled()');
 await proof('Save model, undo and original layout before mode switches',`window.compactBaseline=a.serialize();window.compactUndo=a.undoDepth();window.compactLayout=JSON.stringify(a.layoutUI.state());a.workbenchUI.setMode('${mode}');`);
 for(const theme of ['light','dark']){
  await run(`window.__cadTest.ui.settings.open();document.getElementById('settings-theme').value='${theme}';document.getElementById('settings-theme').dispatchEvent(new Event('change'));document.getElementById('modal').close()`);
  for(const [width,height]of [[1920,1000],[1280,800],[1000,700],[760,650]]){
   win.setSize(width,height);await frame();await new Promise(r=>setTimeout(r,180));
   await proof(`${mode} ${theme} ${width}: top menu, compact header and accessible controls`,`
    const nav=document.querySelector('.${mode}-menubar'),header=document.querySelector('body>header'),r=nav.getBoundingClientRect(),h=header.getBoundingClientRect();
    check(nav===document.body.firstElementChild,'menu not first');check(r.top===0&&r.bottom<=h.top+1,'menu not at top');
    check(h.height<=(innerWidth<850?140:120),'header too tall '+h.height);check(document.querySelector('main').getBoundingClientRect().top<=(innerWidth<850?330:300),'too much chrome');
    const buttons=[...document.querySelectorAll('header .file-actions button, #workbench-mode button')].filter(e=>e.getClientRects().length);
    for(const e of buttons){const b=e.getBoundingClientRect();check(b.left>=0&&b.right<=innerWidth+1,'clipped '+e.textContent);}
    const row=document.querySelector('.cad-command-row'),quick=row.firstElementChild,tabs=row.lastElementChild,q=quick.getBoundingClientRect(),tr=tabs.getBoundingClientRect();
    check(q.right<=tr.left+1&&Math.abs(q.top-tr.top)<10,'quick actions and tabs not side by side');
    if(innerWidth>1100){const project=header.querySelector('.project').getBoundingClientRect(),files=header.querySelector('.file-actions').getBoundingClientRect(),m=document.getElementById('workbench-mode').getBoundingClientRect();check(files.left>=project.right&&files.right<=m.left,'file actions not between name and modes');check(h.height<=80,'wide header not one row');}
    for(const id of ['ai-open','photo-project-open','ai-feature-open','freecad-document-open'])check(!document.getElementById(id).closest('header'),'secondary action still in header '+id);
    const modeButton=document.querySelector('#workbench-mode [data-workbench-mode=fusion]');check(modeButton.textContent==='Fusion','old mode label');
    check(document.querySelector('#viewport').clientWidth>350,'viewport too narrow');
    check(a.serialize()===window.compactBaseline&&a.undoDepth()===window.compactUndo,'model changed');
   `);
   await run(`document.querySelector('.${mode}-menubar summary').click()`);await frame();
   await proof(`${mode} ${theme} ${width}: menu opens within window`, `const p=document.querySelector('.${mode}-menu[open] .${mode}-menu-panel'),r=p.getBoundingClientRect();check(r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,'menu clipped');for(const d of document.querySelectorAll('.${mode}-menubar details'))d.open=false;`);
   await frame();await run('window.__cadTest.view.renderReady()');await new Promise(r=>setTimeout(r,100));
   fs.writeFileSync(path.join(directory,`${mode}-${theme}-${width}.png`),(await win.webContents.capturePage()).toPNG());
  }
 }
 await proof('Secondary menu entries route to their existing controls',`
  const menu=document.querySelector('.${mode}-menu[data-${mode}-menu=extras]');
  for(const [id,label] of [['ai-open','KI-Werkstatt'],['photo-project-open','Projektfotos'],['ai-feature-open','KI-Merkmalsbezüge'],['freecad-document-open','FreeCAD-Merkmale']]){
   const original=document.getElementById(id),entry=[...menu.querySelectorAll('button')].find(b=>b.textContent===label);check(original&&entry,'missing menu entry '+label);
   let calls=0;const intercept=e=>{e.stopImmediatePropagation();e.preventDefault();calls++;};original.addEventListener('click',intercept,true);menu.open=true;entry.click();original.removeEventListener('click',intercept,true);check(calls===1,'wrong dispatch '+label);
  }
 `);
 if(mode==='fusion')await proof('Fusion group menus retain compact command rows',`const d=document.querySelector('.fusion-group-menu');d.open=true;const b=d.querySelector('.fusion-command');check(b.getBoundingClientRect().height<=40,'group menu rows too tall');d.open=false;`);
 await proof('All tabs, settings label, repeated mode transitions and original docking',`
  for(const b of document.querySelectorAll('[data-${mode}-tab]')){b.click();check(b.getAttribute('aria-selected')==='true','tab');}
  a.ui.settings.open();check(document.getElementById('settings-tab-fusion').textContent==='Fusion','settings name');document.getElementById('modal').close();
  for(const next of ['normal','easy','fusion','solid','normal','${mode}'])a.workbenchUI.setMode(next);
  check(document.querySelectorAll('.solid-menubar,.fusion-menubar').length===1,'leaked menu');
  a.workbenchUI.setMode('normal');check(!document.querySelector('.solid-menubar,.fusion-menubar'),'menu not removed');
  check(document.querySelector('.left-panel #object-list')&&document.querySelector('.right-panel #inspector'),'docking not restored');
  check(a.serialize()===window.compactBaseline&&a.undoDepth()===window.compactUndo,'model changed');check(JSON.stringify(a.layoutUI.state())===window.compactLayout,'saved layout changed');
 `);
 return {ok:true,checks};
};
