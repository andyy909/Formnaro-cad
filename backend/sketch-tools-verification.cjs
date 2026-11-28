const fs=require('node:fs'),path=require('node:path');
exports.verifySketchTools=async(win,{directory}={})=>{
 const checks=[],pause=()=>new Promise(r=>setTimeout(r,100)),run=code=>win.webContents.executeJavaScript(`(async()=>{const a=window.__cadTest,check=(v,m)=>{if(!v)throw Error(m)};${code}})()`);
 const field=(selector,value)=>run(`const e=document.querySelector(${JSON.stringify(selector)});check(e,'missing input '+${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input'));`);
 const choose=(id,value)=>run(`const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change'));`);
 async function proof(name,fn){fs.writeFileSync(path.join(directory,'tools-progress.json'),JSON.stringify({checks,pending:name}));if(typeof fn==='string')await run(fn);else await fn();checks.push(name);}
 async function mouse(x,y,drag){const locate=(x,y)=>run(`const b=document.getElementById('sketch-board'),p=b.createSVGPoint();p.x=${x};p.y=${-y};const q=p.matrixTransform(b.getScreenCTM());return {x:Math.round(q.x),y:Math.round(q.y)};`),p=await locate(x,y),end=drag?await locate(...drag):p;for(const type of ['mouseMove','mouseDown'])win.webContents.sendInputEvent({type,...p,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseMove',...end,button:'left'});win.webContents.sendInputEvent({type:'mouseUp',...end,button:'left',clickCount:1});await pause();}
 const direct=async(key,text)=>{await field('[data-direct-dimension='+key+']',text);await run(`document.querySelector('[data-apply-dimension=${key}]').click();`);};
 async function newPlate(){await run(`a.sketchUI.open();`);await field('[data-sketch-dimension=width]','60');await field('[data-sketch-dimension=depth]','40');await field('[data-sketch-dimension=height]','3');await run(`document.getElementById('sketch-profile-enable').click();document.getElementById('sketch-expand').click();`);}
 await proof('direct length and angle fields preserve formulas and shared endpoints without model commits',async()=>{await run(`await a.resetProject();a.workbenchUI.setMode('normal');window.toolsBefore=a.serialize();`);await newPlate();const id=await run(`return a.sketchUI.state().sketch.elements[0].id;`);await choose('sketch-profile-element',id);await direct('length','breite+30');await direct('angle','0');await run(`const s=a.sketchUI.state().sketch;check(s.elements[0].end[0]===s.elements[1].start[0],'shared endpoint disconnected');check(s.elements[0].end[0].includes('breite+30'),'length formula lost');await a.sketchUI.preview();const p=a.controller.getPreview(a.sketchUI.state().preview).project;check(Math.abs(p.nodes[0].stats.volume-7800)<1e-4,'dimension volume');check(a.serialize()===window.toolsBefore,'dimension committed');document.getElementById('sketch-cancel').click();`);});
 await proof('circle radius is directly editable with its center anchored',async()=>{await newPlate();await mouse(-15,0,[-13,0]);await direct('radius','3');await run(`const e=a.sketchUI.state().sketch.elements.at(-1);check(e.type==='circle'&&Number(e.center[0])===-15&&Number(e.center[1])===0,'center moved');check(e.diameter==='2*(3)','radius not stored');window.toolsHole=a.sketchUI.state().sketch.loops.at(-1).id;`);});
 await proof('mirror creates a second independent opening and source draft Undo restores the first',async()=>{await choose('sketch-edit-loop',await run('return window.toolsHole;'));await choose('sketch-mirror-axis','y');await run(`document.getElementById('sketch-mirror').click();check(a.sketchUI.state().sketch.loops.length===3,'mirror missing');const ids=a.sketchUI.state().sketch.elements.map(e=>e.id);check(new Set(ids).size===ids.length,'mirror reused IDs');document.getElementById('sketch-undo').click();check(a.sketchUI.state().sketch.loops.length===2,'draft mirror undo');document.getElementById('sketch-redo').click();await a.sketchUI.preview();const p=a.controller.getPreview(a.sketchUI.state().preview).project;check(Math.abs(p.nodes[0].stats.volume-3*(2400-18*Math.PI))<1e-4,'mirrored holes volume');await a.sketchUI.apply();await a.settled();window.toolsOriginalNode=JSON.stringify(a.getModel().nodes[0]);window.toolsOriginalId=a.getModel().nodes[0].id;`);});
 await proof('whole-sketch mirror is a new native body and keeps the saved original exactly',async()=>{await run(`a.select([{rootId:window.toolsOriginalId,path:[]}]);await a.settled();a.sketchUI.open(true);`);await choose('sketch-edit-loop','');await run(`document.getElementById('sketch-mirror').click();check(document.getElementById('sketch-as-copy').checked,'copy mode absent');await a.sketchUI.preview();const depth=a.undoDepth();await a.sketchUI.apply();await a.settled();check(a.getModel().nodes.length===2,'copy overwrote original');check(JSON.stringify(a.getModel().nodes[0])===window.toolsOriginalNode,'original changed');check(a.undoDepth()===depth+1,'copy Undo');await a.actions.undo();await a.settled();check(a.getModel().nodes.length===1&&JSON.stringify(a.getModel().nodes[0])===window.toolsOriginalNode,'copy undo changed original');`);});
 await proof('native worker offset creates a 2mm inner contour while preserving its original',async()=>{await newPlate();const loopId=await run(`return a.sketchUI.state().sketch.loops[0].id;`);await choose('sketch-edit-loop',loopId);await run(`document.getElementById('sketch-offset').click();const end=Date.now()+30000;while(document.getElementById('sketch-offset').disabled){if(Date.now()>end)throw Error('offset timeout');await new Promise(r=>setTimeout(r,40));}check(a.sketchUI.state().sketch.loops.length===2,'offset missing '+document.getElementById('sketch-message').textContent);await a.sketchUI.preview();const p=a.controller.getPreview(a.sketchUI.state().preview).project;check(Math.abs(p.nodes.at(-1).stats.volume-1152)<1e-4,'offset wall volume');check(JSON.stringify(a.getModel().nodes[0])===window.toolsOriginalNode,'offset changed source model');`);});
 await proof('offset is saved as editable geometry and commits as one shared Undo',async()=>{await run(`const depth=a.undoDepth();await a.sketchUI.apply();await a.settled();check(a.undoDepth()===depth+1,'offset undo');const p=a.getModel();check(p.nodes.at(-1).recipe.sketch.loops.length===2,'offset source missing');check(p.version===10,'offset format');window.toolsOffsetId=p.nodes.at(-1).id;`);const data=await run(`const r=await a.controller.exportModel({format:'step',ids:[window.toolsOffsetId]});return typeof r.data==='string'?r.data:Array.from(new Uint8Array(r.data));`);fs.writeFileSync(path.join(directory,'tools-offset.step'),typeof data==='string'?data:Buffer.from(data));await run(`await a.actions.undo();await a.settled();check(a.getModel().nodes.length===1,'offset undo model');`);});
 await proof('trim uses a drawn construction boundary and rejects open contour extrusion',async()=>{await newPlate();await choose('sketch-profile-shape','construction');await mouse(0,-30,[0,30]);const ids=await run(`const s=a.sketchUI.state().sketch;return [s.elements[0].id,s.elements.at(-1).id,s.elements[1].id];`);await choose('sketch-profile-element',ids[0]);await choose('sketch-edit-cutter',ids[1]);await run(`document.getElementById('sketch-trim').click();const e=a.sketchUI.state().sketch.elements[0];check(Math.abs(Number(e.end[0]))<1e-6,'trim intersection');let rejected=false;try{await a.sketchUI.preview();}catch{rejected=true;}check(rejected&&document.getElementById('sketch-apply').disabled,'open trim extruded');`);await choose('sketch-edit-cutter',ids[2]);await run(`document.getElementById('sketch-extend').click();check(Number(a.sketchUI.state().sketch.elements[0].end[0])===30,'extend intersection');await a.sketchUI.preview();check(!document.getElementById('sketch-apply').disabled,'extended contour not closed');`);});
 await proof('changing copy mode invalidates an existing proposal and cancel retains confirmed geometry',`const before=a.serialize();document.getElementById('sketch-as-copy').checked=true;document.getElementById('sketch-as-copy').dispatchEvent(new Event('change'));check(document.getElementById('sketch-apply').disabled&&!a.sketchUI.state().preview,'copy retained stale preview');document.getElementById('sketch-edit-tools').open=true;window.toolsCaptureBefore=before;`);
 win.showInactive();await pause();fs.writeFileSync(path.join(directory,'sketch-edit-tools.png'),(await win.webContents.capturePage()).toPNG());win.hide();await run(`document.getElementById('sketch-cancel').click();check(a.serialize()===window.toolsCaptureBefore,'cancel changed model');`);
 await proof('direct line tool previews the next snapped segment and ends an open draft without committing',async()=>{
  await run(`
   a.sketchUI.open();
   const dialog=document.getElementById('modal'),original=JSON.stringify(a.sketchUI.state().sketch);
   check(dialog.dataset.sketchMode==='simple','new sketch did not start in the simple mode');
   check(!document.getElementById('sketch-open-relations').getClientRects().length,'advanced tools visible in simple mode');
   document.querySelector('[data-sketch-mode-choice="advanced"]').click();
   check(JSON.stringify(a.sketchUI.state().sketch)===original,'mode switch changed the simple sketch');
   check(document.getElementById('sketch-open-relations').getClientRects().length,'advanced relationship action missing');
   document.querySelector('[data-sketch-quick-tool="line"]').click();
   check(document.querySelector('[data-sketch-quick-tool="line"]').getAttribute('aria-pressed')==='true','line tool not active');
   check(document.getElementById('sketch-profile-role').value==='outer','new line begins the outside contour');
   document.getElementById('sketch-point-snap').click();
  `);
  await field('#sketch-grid','5');
  await mouse(-20,-10);
  const aim=await run(`
   const board=document.getElementById('sketch-board'),point=board.createSVGPoint();
   point.x=10;point.y=10;
   const screen=point.matrixTransform(board.getScreenCTM());
   return {x:Math.round(screen.x),y:Math.round(screen.y)};
  `);
  win.webContents.sendInputEvent({type:'mouseMove',...aim});
  await pause();
  await run(`
   const board=document.getElementById('sketch-board'),line=board.querySelector('.sketch-line-preview');
   check(line&&Number(line.getAttribute('x2'))===10,'snapped line preview missing');
   check(board.querySelector('.sketch-snap-guide')?.dataset.kind==='grid','grid snap indicator missing');
   const {width,height}=board.getBoundingClientRect(),box=board.viewBox.baseVal;
   check(Math.abs(box.width/box.height-width/height)<.01,'sketch viewport letterboxed');
  `);
  await mouse(10,-10);
  await run(`
   const sketch=a.sketchUI.state().sketch,line=sketch.elements[0];
   check(sketch.elements.length===1&&line.end.map(Number).join(',')==='10,-10','line did not honor the grid');
   document.getElementById('sketch-profile-finish-open').click();
   const remaining=JSON.stringify(a.sketchUI.state().sketch);
   document.querySelector('[data-sketch-mode-choice="simple"]').click();
   check(document.getElementById('modal').dataset.sketchMode==='simple','simple mode switch failed');
   check(JSON.stringify(a.sketchUI.state().sketch)===remaining,'simple mode discarded the open contour');
   document.querySelector('[data-sketch-mode-choice="advanced"]').click();
   check(JSON.stringify(a.sketchUI.state().sketch)===remaining,'advanced mode changed the existing contour');
   document.getElementById('sketch-show-grid').click();
   check(!document.querySelector('#sketch-board .grid'),'raster visibility control failed');
   check(document.getElementById('sketch-grid-snap').checked,'hiding the raster disabled snapping');
   check(document.getElementById('sketch-apply').disabled,'open line draft became committable');
   document.getElementById('sketch-cancel').click();
  `);
 });
 await proof('canvas trim and extend select the clicked line end and actual cutter',async()=>{
  await newPlate();
  await choose('sketch-profile-shape','construction');
  await mouse(0,-30,[0,30]);
  await run(`
   window.unmovedLineStart=JSON.stringify(a.sketchUI.state().sketch.elements[0].start);
   document.getElementById('sketch-profile-canvas-trim').click();
  `);
  await mouse(20,-20);
  await mouse(0,-10);
  await run(`
   const line=a.sketchUI.state().sketch.elements[0];
   check(JSON.stringify(line.start)===window.unmovedLineStart&&Number(line.end[0])===0,'canvas trim moved the wrong line end');
   document.getElementById('sketch-profile-canvas-extend').click();
  `);
  await mouse(-3,-20);
  await mouse(30,0);
  await run(`
   check(Number(a.sketchUI.state().sketch.elements[0].end[0])===30,'canvas extend missed the chosen boundary');
   await a.sketchUI.preview();
   check(!document.getElementById('sketch-apply').disabled,'extended contour remained open');
   document.getElementById('sketch-cancel').click();
  `);
 });
 await proof('drawing dimensions stay on the canvas and accept exact values after release',async()=>{
  const locate=(x,y)=>run(`
   const board=document.getElementById('sketch-board'),p=board.createSVGPoint();p.x=${x};p.y=${-y};
   const q=p.matrixTransform(board.getScreenCTM());return {x:Math.round(q.x),y:Math.round(q.y)};
  `);
  await run(`
   a.sketchUI.open();
   document.querySelector('[data-sketch-mode-choice=advanced]').click();
   document.querySelector('[data-sketch-quick-tool=rectangle]').click();
  `);
  await pause();
  const start=await locate(-15,-10),end=await locate(10,5);
  for(const type of ['mouseMove','mouseDown']) win.webContents.sendInputEvent({type,...start,button:'left',clickCount:1});
  win.webContents.sendInputEvent({type:'mouseMove',...end,button:'left'});
  await pause();
  await run(`
   const x=document.querySelector('[data-sketch-canvas-dimension=x]'),y=document.querySelector('[data-sketch-canvas-dimension=y]');
   check(x?.textContent==='X 25 mm'&&y?.textContent==='Y 15 mm','live measurements incorrect');
   check(!x.hasAttribute('data-editable'),'live annotation blocked drawing');
  `);
  win.webContents.sendInputEvent({type:'mouseUp',...end,button:'left',clickCount:1});
  await pause();
  const label=await run(`
   const x=document.querySelector('[data-sketch-canvas-dimension=x][data-editable]');
   check(x?.textContent==='X 25 mm','released annotation not editable');
   const b=x.getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};
  `);
  for(const type of ['mouseMove','mouseDown','mouseUp']) win.webContents.sendInputEvent({type,...label,button:'left',clickCount:1});
  await pause();
  await run(`
   const input=document.querySelector('.sketch-dimension-entry:popover-open input');
   check(input===document.activeElement,'value entry not focused');input.value='32,5';input.form.requestSubmit();
  `);
  await pause();
  await run(`
   const sketch=a.sketchUI.state().sketch;
   check(Number(sketch.elements[0].end[0])-Number(sketch.elements[0].start[0])===32.5,'exact edited width missing');
   check(document.querySelector('[data-sketch-canvas-dimension=x]').textContent==='X 32,5 mm','edited annotation incorrect');
  `);
  fs.writeFileSync(path.join(directory,'sketch-canvas-measurement.png'),(await win.webContents.capturePage()).toPNG());
 });
 await proof('contour move retains editable axis measures and one undo step, then aligns to the origin',async()=>{
  await run(`document.querySelector('[data-sketch-quick-tool=move]').click();`);
  await mouse(-15,-10,[-12,-6]);
  await run(`
   const s=a.sketchUI.state().sketch;
   const label=key=>document.querySelector('[data-sketch-canvas-dimension='+key+']');
   check(label('dx')?.textContent==='ΔX +3 mm'&&label('dy')?.textContent==='ΔY +4 mm','move displacement missing');
   check(s.elements[0].start.map(Number).join(',')==='-12,-6','contour did not move');
   const set=async(key,value)=>{
    label(key).dispatchEvent(new MouseEvent('click',{bubbles:true}));
    const entry=document.querySelector('.sketch-dimension-entry:popover-open');
    check(entry,'displacement entry missing');
    entry.querySelector('input').value=value;
    entry.requestSubmit();
    await Promise.resolve();
   };
   const before=a.sketchUI.state().interaction.history.undo;
   await set('dx','+2');
   await set('dy','5');
   check(a.sketchUI.state().sketch.elements[0].start.map(Number).join(',')==='-10,-5','exact displacement missing');
   check(a.sketchUI.state().interaction.history.undo===before,'corrections created another Undo entry');
   await set('dx','3');
   await set('dy','4');
   document.querySelector('[data-sketch-quick-tool=align]').click();
   document.querySelector('.sketch-align-controls select').value='x';
  `);
  await mouse(-12,-6);
  await run(`check(document.querySelector('#sketch-board .sketch-align-anchor'),'alignment source not marked');`);
  await mouse(0,0);
  await run(`
   const s=a.sketchUI.state().sketch;
   check(s.elements[0].start.map(Number).join(',')==='0,-6','X reference alignment incorrect');
   document.getElementById('sketch-undo').click();
   check(a.sketchUI.state().sketch.elements[0].start.map(Number).join(',')==='-12,-6','alignment undo failed');
   document.getElementById('sketch-cancel').click();
  `);
 });
 await proof('a three-point bore becomes a scalable, editable circle with a fixed center',async()=>{
  await newPlate();
  await run(`document.querySelector('[data-sketch-quick-tool=circle3]').click();`);
  await choose('sketch-profile-role','hole');
  for(const point of [[5,0],[0,5],[-5,0]])await mouse(...point);
  await run(`
   const hole=a.sketchUI.state().sketch.elements.at(-1);
   check(hole.type==='circle'&&hole.center.map(Number).join(',')==='0,0'&&Number(hole.diameter)===10,'three-point bore');
   document.querySelector('[data-sketch-quick-tool=scale]').click();
  `);
  await mouse(5,0,[10,0]);
  await run(`
   const label=document.querySelector('[data-sketch-canvas-dimension=diameter][data-editable]');
   const dragDiameter=Number(label?.textContent.match(/Ø ([0-9,]+) mm/)?.[1].replace(',','.'));
   check(Math.abs(dragDiameter-20)<0.35,'diameter after dragging');
   label.dispatchEvent(new MouseEvent('click',{bubbles:true}));
   const entry=document.querySelector('.sketch-dimension-entry:popover-open');
   entry.querySelector('input').value='24';
   entry.requestSubmit();
   await new Promise(resolve=>setTimeout(resolve,25));
   check(document.querySelector('[data-sketch-canvas-dimension=diameter]').textContent==='Ø 24 mm','edit diameter');
   check(a.sketchUI.state().sketch.elements.at(-1).center.map(Number).join(',')==='0,0','circle center moved');
   document.getElementById('sketch-undo').click();
   check(Number(a.sketchUI.state().sketch.elements.at(-1).diameter)===10,'scale undo');
   document.getElementById('sketch-cancel').click();
  `);
 });
 return {checks};
};
