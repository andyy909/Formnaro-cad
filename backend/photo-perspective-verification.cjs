const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
exports.verifyPhotoPerspective=async(win,{directory})=>{
 const js=s=>win.webContents.executeJavaScript(s),wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
 const check=(v,label)=>{assert(v,label);checks.push(label);fs.writeFileSync(path.join(directory,'perspective-progress.json'),JSON.stringify({checks},null,2));};
 const until=async code=>{const start=Date.now();while(Date.now()-start<45000){if(await js(code))return;await wait(40);}throw Error('Perspective timeout: '+code+'; '+await js("document.getElementById('ai-chat-status')?.textContent"));};
 async function click(selector){const p=await js("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");if(!e)throw Error('Missing element');e.scrollIntoView({block:'nearest'});const b=e.getBoundingClientRect(),top=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);if(e.disabled||!b.width||!b.height||!(top===e||e.contains(top)))throw Error('Unreachable element');return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};})()");for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,...p,button:'left',clickCount:1});await wait(35);}
 async function set(id,value,event='input'){await js("(()=>{const e=document.getElementById("+JSON.stringify(id)+");e.value="+JSON.stringify(value)+";e.dispatchEvent(new Event("+JSON.stringify(event)+"));})()");}
 async function point(p){await set('photo-point-x',p[0]);await set('photo-point-y',p[1]);await click('#photo-add-point');}
 const shot=async name=>{await wait(120);fs.writeFileSync(path.join(directory,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 // Independent analytic plane->pixel transform, not the production solver.
 const original=([x,y])=>[(10*x+y+80)/(.004*x+.001*y+1),(.6*x+9*y+50)/(.004*x+.001*y+1)];
 const corners=[[0,0],[40,0],[40,30],[0,30]].map(original),outline=[[4,4],[36,4],[36,26],[4,26]].map(original),hole=[[16,12],[24,12],[24,18],[16,18]].map(original);
 try{
  win.setSize(1400,960);await js('window.__cadTest.aiUI.chat.open();void 0');await until("!document.getElementById('ai-chat-new').disabled");
  await click('#ai-chat-tools > summary');await until("document.getElementById('ai-chat-tools').open");
  const before=await js('window.__cadTest.controller.serialize()'),nodes=await js('JSON.stringify(window.__cadTest.controller.snapshot().nodes)'),undo=await js('window.__cadTest.undoDepth()');
  await js("(()=>{window.__photoReady=false;const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,600,400);for(const [points,color]of "+JSON.stringify([[outline,'#777'],[hole,'#fff']])+"){x.beginPath();points.forEach((p,i)=>i?x.lineTo(...p):x.moveTo(...p));x.closePath();x.fillStyle=color;x.fill();}c.toBlob(async b=>{await window.__cadTest.aiUI.chat.addImages([new File([b],'Perspektivplatte.png',{type:'image/png'})]);window.__photoReady=true;});})()");await until('window.__photoReady');
  await click('#ai-chat-attachments .photo-measure-button');await until("document.getElementById('photo-assistant')?.open");
  await set('photo-calibration-mode','perspective','change');await set('photo-rectangle-width','40');await set('photo-rectangle-height','30');await set('photo-pick-error','.25');await set('photo-ref-error','.02');
  for(const p of corners)await point(p);
  check(await js("document.getElementById('photo-calibration-status').textContent.includes('Geschätzte')"),'Four independent projected corners produce a usable planar calibration');
  await set('photo-measure-name','Quermaß');await click('[data-mode="measure"]');await point(outline[0]);await point(outline[1]);
  await click('[data-mode="outline"]');for(const p of outline)await point(p);await click('#photo-finish');
  check(!await js("document.getElementById('photo-status').classList.contains('ai-error')"),'Confirmed original-pixel contour lies inside calibrated plane');
  await click('[data-mode="hole"]');for(const p of hole)await point(p);await click('#photo-finish');
  await click('#photo-rectify');check(await js("!document.getElementById('photo-rectified-panel').hidden&&document.getElementById('photo-rectified-image').complete"),'Rectified view renders original pixels in linked plane');
  await shot('perspective-plane-light');
  await click('#photo-suggest');check(await js("!document.getElementById('photo-accept-suggestion').disabled"),'Local Sobel proposal requires a separate explicit confirmation');
  await click('#photo-save');check(await js("document.getElementById('photo-assistant').open&&document.getElementById('photo-status').textContent.includes('Kantenvorschlag zuerst')"),'An unconfirmed contour cannot be saved or sent to AI');
  await click('#photo-discard-suggestion');await click('#photo-save');await until("!document.getElementById('photo-assistant')");
  const r=await js('window.__cadTest.aiUI.chat.state().photoReferences[0]');check(r.version===2&&r.perspective.points.length===4&&r.dimensions[0].points.every((p,i)=>p.every((v,k)=>Math.abs(v-outline[i][k])<1e-8)),'Original point identities survive UI editing without raster coordinate replacement');
  check(await js('window.__cadTest.controller.serialize()')===before,'Calibration and suggestions leave original confirmed project exact');
  await click('#ai-chat-attachments .photo-project-save');await until("!document.getElementById('ai-chat-send').disabled");
  const project=await js('window.__cadTest.controller.snapshot()');check(project.version===19&&project.photos?.items.length===1,'Explicit project save embeds original image, digest, provenance and perspective metadata');
  check(await js('JSON.stringify(window.__cadTest.controller.snapshot().nodes)')===nodes&&await js('window.__cadTest.undoDepth()')===undo+1,'Project photo save changes no geometry and owns exactly one Undo');
  const saved=await js('window.__cadTest.controller.serialize()');await js('window.__cadTest.actions.undo()');await js('window.__cadTest.settled()');check(await js('window.__cadTest.controller.serialize()')===before,'Photo Undo restores the complete previous project byte-exactly');
  await js('window.__cadTest.actions.redo()');await js('window.__cadTest.settled()');check(await js('window.__cadTest.controller.serialize()')===saved,'Photo Redo restores the complete embedded reference');
  const recovered=await js('(async()=>{const a=window.__cadTest;if(!await a.recovery.write(a.serializeWorkspace(),{version:19}))throw Error("Photo recovery write failed");const p=await a.recovery.load(v=>a.controller.verify(v));return p.photos;})()');assert.deepEqual(recovered,project.photos);check(true,'Actual recovery storage preserves embedded originals and planar calibration');
  fs.writeFileSync(path.join(directory,'synthetic-reference.ocad'),saved);
  const disk=fs.readFileSync(path.join(directory,'synthetic-reference.ocad'),'utf8');await js('window.__cadTest.controller.open('+JSON.stringify(disk)+')');await js('window.__cadTest.settled()');
  check(await js('window.__cadTest.controller.serialize()')===saved,'A real disk .ocad roundtrip preserves original bytes, markers and calibration');
  await click('#ai-chat-new');await click('#ai-chat-project-photos');check(await js("document.querySelectorAll('.photo-project-row').length")===1,'Project references remain available after a new provider chat');
  await shot('project-photos-light');await click('.photo-project-row button');await until("!document.getElementById('photo-project-dialog')");
  const restored=await js('window.__cadTest.aiUI.chat.state().photoReferences[0]');assert.deepEqual(restored,r);check(true,'Reattaching a saved photo restores exact editable marks and reference provenance');
  await click('#ai-chat-attachments .photo-measure-button');await until("document.getElementById('photo-assistant')?.open");await set('photo-calibration-mode','perspective','change');await click('#photo-suggest');await click('#photo-accept-suggestion');
  check(!await js("document.getElementById('photo-status').classList.contains('ai-error')")&&await js("document.getElementById('photo-accept-suggestion').disabled"),'Explicit contour confirmation promotes a valid editable proposal');
  await js("document.documentElement.dataset.theme='dark';void 0");win.setSize(840,740);await wait(100);await click('#photo-rectify');await shot('perspective-plane-small-dark');
  check(await js("(()=>{const r=document.getElementById('photo-assistant').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})()"),'Perspective editor fits a small window and dark theme');
  await click('#photo-cancel');assert.deepEqual(await js('window.__cadTest.aiUI.chat.state().photoReferences[0]'),r);check(true,'Cancelling a confirmed local edit preserves the prior attached reference');
  check(await js('window.__cadTest.controller.serialize()')===saved,'Cancelled dialog and chat attachment do not modify project geometry or references');
  win.setSize(1400,960);
  for(const mode of ['easy','solid','fusion','normal']){
   await js('window.__cadTest.workbenchUI.setMode('+JSON.stringify(mode)+');void 0');await click('#photo-project-open');
   check(await js("document.querySelectorAll('.photo-project-row').length")===1,'Stored project photo is reachable in '+mode+' mode');await click('#photo-project-dialog>button:last-child');
   check(await js('window.__cadTest.controller.serialize()')===saved,'Switching '+mode+' mode preserves photo bytes and source geometry');
  }
  await js("window.__cadTest.workbenchUI.setMode('easy');void 0");await click('#photo-project-open');
  const originalImage=project.photos.items[0].image;
  await js("(()=>{const raw=atob("+JSON.stringify(originalImage.dataUrl.split(',')[1])+");const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(raw,c=>c.charCodeAt(0))],'Direktes-Projektfoto.png',{type:'image/png'}));const e=document.querySelector('#photo-project-dialog input[type=file]');e.files=transfer.files;e.dispatchEvent(new Event('change'));})()");await until("document.getElementById('photo-assistant')?.open");
  await set('photo-note','Direkt hinzugefügte synthetische Rechteckreferenz');await click('#photo-save');await until("!document.getElementById('photo-assistant')&&!document.querySelector('#photo-project-dialog>button').disabled");
  check((await js('window.__cadTest.controller.snapshot()')).photos.items[0].reference.perspective.note==='Direkt hinzugefügte synthetische Rechteckreferenz','Direct file input edits and persists an existing calibrated original without requiring a chat');
  await click('#photo-project-dialog>button:last-child');await js('window.__cadTest.actions.undo()');await js('window.__cadTest.settled()');check(await js('window.__cadTest.controller.serialize()')===saved,'Direct photo addition owns one exact Undo and preserves the assembly');
  await js("window.__cadTest.workbenchUI.setMode('normal');void 0");
  await click('#ai-chat-project-photos');await js("(()=>{const b=[...document.querySelectorAll('.photo-project-row button')].find(b=>b.textContent==='Aus Projekt entfernen');b.id='photo-remove-test';})()");await click('#photo-remove-test');await until("!document.querySelector('.photo-project-row')");check(!(await js('window.__cadTest.controller.snapshot()')).photos,'Removing the last reference removes only the project photo field');
  await click('#photo-project-dialog>button:last-child');await js('window.__cadTest.actions.undo()');await js('window.__cadTest.settled()');check(await js('window.__cadTest.controller.serialize()')===saved,'Removal Undo restores exact original photo bytes');
  await shot('perspective-final');fs.writeFileSync(path.join(directory,'perspective-proof.json'),JSON.stringify({checks,cloudRequests:0,independentProjection:{corners,outline,hole},diskRoundtrip:true},null,2));return checks;
 }catch(e){await shot('perspective-failed');throw e;}
};
