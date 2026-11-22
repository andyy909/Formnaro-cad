const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const os = require('node:os');

exports.verifyU05 = async function verifyU05(win, { directory, files, baseline = false }) {
  const pause = (ms = 60) => new Promise(resolve => setTimeout(resolve, ms));
  const js = code => win.webContents.executeJavaScript('(async()=>{const a=window.__cadTest;'+code+'})()');
  const val = JSON.stringify;
  const checks = [];
  const record = (name,data={}) => {
    checks.push({name,...data});
    fs.writeFileSync(path.join(directory,'Fortschritt.json'),JSON.stringify(checks,null,2));
  };
  const shot = async name => fs.writeFileSync(path.join(directory,name+'.png'),(await win.webContents.capturePage()).toPNG());
  async function until(expr,label) {
    for(let i=0;i<220;i++){if(await js('return ('+expr+');')) return; await pause(45);}
    const state=await js("return {tools:a.tools.state(),selection:a.selection(),toast:document.querySelector('#toast')?.textContent,menu:document.querySelector('#cad-context-menu')?.textContent,focus:document.activeElement?.outerHTML.slice(0,160)}");
    throw Error(label+' '+val(state));
  }
  function input(type,p,opts={}) {
    win.webContents.sendInputEvent({type,x:Math.round(p.x),y:Math.round(p.y),...opts});
  }
  async function mouse(p,button='left') {
    input('mouseMove',p);
    input('mouseDown',p,{button,clickCount:1});
    input('mouseUp',p,{button,clickCount:1});
    await pause();
  }
  async function click(selector) {
    const pt=await js("const e=document.querySelector("+val(selector)+");if(!e||e.disabled)throw Error('Not actionable: '+"+val(selector)+"); e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!e.contains(document.elementFromPoint(x,y)))throw Error('Obscured: '+"+val(selector)+");return {x,y};");
    await mouse(pt);
  }
  async function key(keyCode) {
    win.webContents.sendInputEvent({type:'keyDown',keyCode});
    win.webContents.sendInputEvent({type:'keyUp',keyCode});
    await pause();
  }
  async function type(text) {
    await win.webContents.insertText(text);
    await pause();
  }
  async function resize(width,height) {
    win.setMinimumSize(760,600);
    win.setSize(width,height);
    await until('Math.abs(innerWidth-'+width+')<=2','Window width '+width+' (actual '+await js('return innerWidth;')+')');
    await pause(100);
  }
  async function saveFixture(name) {
    const file=path.join(directory,name);
    files.save=file;
    assert.ok((await js("return a.save({saveAs:true,format:'ocad'});")).saved);
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  async function add(id,type,size,position,parameters) {
    const recipe={type,size,...(parameters?{params:parameters}:{})};
    await js('await a.execute({kind:"create",recipe:'+val(recipe)+',options:{id:'+val(id)+'}});');
    if(position.some(Boolean))
      await js('await a.execute({kind:"batch",commands:[{op:"transform",target:'+val(id)+',translate:'+val(position)+'}]});');
  }
  async function frame(view) {
    await js('a.view.setView('+val(view)+');a.view.fit();await a.view.renderReady();');
  }
  async function point(world) {
    return js("const p=a.view.projectPoint("+val(world)+");const e=document.elementFromPoint(p.x,p.y);if(e!==a.view.canvas)throw Error('Viewport point '+JSON.stringify({p,element:e?.outerHTML.slice(0,100)}));return p;");
  }
  const selection = () => js('return a.selection().map(t=>t.rootId);');
  const model = () => js('return {text:a.serialize(),undo:a.undoDepth(),revision:a.controller.revision()};');

  try {
    await until('!!a && !!window.__cadReady','Renderer ready');
    await resize(1500,950);
    win.webContents.focus();
    await js('await a.layoutUI.ready();await a.resetProject();await a.settled();');
    let plates, platesHash, denseHash;
    const loadFixture=async name=>{
      files.save=path.join(directory,name);
      await js('await a.resetProject();await a.settled();await a.openProject();await a.settled();');
      assert.equal(await js('return a.activeProjectFile().name;'),name);
      return createHash('sha256').update(fs.readFileSync(files.save)).digest('hex');
    };
    if (fs.existsSync(path.join(directory,'Dichte-Auswahl.ocad'))) {
      platesHash=await loadFixture('Zweiplatten.ocad');
      plates=await js('return a.getModel();');
      denseHash=await loadFixture('Dichte-Auswahl.ocad');
    } else {
      for (const [id,z] of [['front',12],['rear',0],['hidden',22]]) {
        await add(id,'box',id==='rear'?[34,22,4]:[38,26,4],[0,0,z]);
      }
      await js("await a.mutate(p=>{for(const node of p.nodes)node.name=node.id==='front'?'Platte vorn':node.id==='rear'?'Platte hinten':'Platte verborgen';p.nodes.find(n=>n.id==='hidden').hidden=true;},'Auswahlprüfszene');await a.settled();");
      platesHash=await saveFixture('Zweiplatten.ocad');
      plates=await js('return a.getModel();');
      // Build the same scene on both revisions, with the same display quality.
      for(let i=0;i<12;i++) await add('dense-'+i,'torus',[44,44,8],[60+(i%3)*54,-54+Math.floor(i/3)*52,9],{wall:8});
      for(let i=0;i<3;i++) await add('dense-hidden-'+i,'torus',[44,44,8],[60,-54,22+i*9],{wall:8});
      await js("await a.mutate(p=>{for(const n of p.nodes)if(n.id.startsWith('dense-hidden-'))n.hidden=true;},'Verborgene dichte Körper');await a.settled();");
      denseHash=await saveFixture('Dichte-Auswahl.ocad');
    }
    await frame('top');
    const measurement=await js([
      'const v=a.view, meshes=v.groups.bodies.children, quality=a.getQuality().display;',
      'const at=p=>{const r=v.projectPoint(p);return {clientX:r.x,clientY:r.y};};',
      'const hitAt=at([60,-34,13]), counts={};',
      'const now=fn=>{const start=performance.now();const result=fn();return {ms:performance.now()-start,result};};',
      'const normal=()=>v.visualHit(hitAt)?.object.userData.rootId;',
      'const cold=now(normal);',
      'const warm=fn=>Array.from({length:12},()=>now(()=>{for(let i=0;i<64;i++)fn();}).ms/64);',
      'const warmNormal=warm(normal);',
      'const warmOther=v.visualTargets?warm(()=>v.visualTargets(hitAt)):null;',
      'const originals=meshes.map(m=>[m,m.raycast]);',
      'let rayProto, originalTriangle, activeId;',
      'for(const [mesh,fn] of originals)mesh.raycast=function(caster,...rest){',
      '  activeId=this.userData.rootId;',
      '  if(!rayProto){rayProto=Object.getPrototypeOf(caster.ray);originalTriangle=rayProto.intersectTriangle;',
      '    rayProto.intersectTriangle=function(...args){counts[activeId]=(counts[activeId]||0)+1;return originalTriangle.apply(this,args);};}',
      '  return fn.call(this,caster,...rest);',
      '};',
      'let hitCounts, missCounts, hit;',
      'try{hit=normal();hitCounts={...counts};for(const k of Object.keys(counts))delete counts[k];',
      '  v.setView("front");',
      '  v.visualHit(at([60,-54,28]));missCounts={...counts};',
      '} finally {if(rayProto)rayProto.intersectTriangle=originalTriangle;for(const [mesh,fn] of originals)mesh.raycast=fn;}',
      'return {quality,width:innerWidth,height:innerHeight,canvas:[v.canvas.clientWidth,v.canvas.clientHeight],',
      '  sceneParts:a.getModel().nodes.length,displayTriangles:meshes.reduce((n,m)=>n+(m.geometry.index?.count??0)/3,0),',
      '  cold,warmNormal,warmOther,hit,hitCounts,missCounts};',
    ].join('\n'));
    assert.equal(measurement.hit,'dense-0');
    assert.ok((measurement.hitCounts['dense-0']??0)>0);
    assert.ok(!Object.keys(measurement.hitCounts).some(id=>id.startsWith('dense-hidden-')));
    assert.equal(measurement.missCounts['dense-0']??0,0);
    if (!baseline) {
      await frame('top');
      const denseClick=await point([60,-34,13]);
      await mouse(denseClick,'right');
      await until("!!document.querySelector('[data-context-action=pick-other]')",'Dense scene selection menu');
      await js("window.u05MenuTiming=null;document.querySelector('[data-context-action=pick-other]').addEventListener('click',()=>{const start=performance.now();const observer=new MutationObserver(()=>{if(document.querySelector('[data-pick-root]')){observer.disconnect();window.u05MenuTiming=performance.now()-start;}});observer.observe(document.getElementById('cad-context-menu'),{childList:true,subtree:true});},{capture:true,once:true});");
      await click('[data-context-action=pick-other]');
      await until('Number.isFinite(window.u05MenuTiming)','Dense scene list populated');
      measurement.openListMs=await js('return window.u05MenuTiming;');
      measurement.listRoots=await js("return Array.from(document.querySelectorAll('[data-pick-root]'),button=>button.dataset.pickRoot);");
      assert.ok(measurement.listRoots.includes('dense-0'));
      await key('Escape');
    }
    record('U04/U05-03 · Normales Picking und bewusste Tiefenliste', {
      denseHash,platesHash,...measurement,
      machine:{processor:os.cpus()[0].model,memory:os.totalmem(),os:os.release(),electron:process.versions.electron},
    });
    if (baseline) return {ok:true,checks};

    await js('await a.controller.open('+val(plates)+');await a.settled();');
    await click('[data-workbench-mode=solid]');
    await frame('top');
    const center=await point([3,4,14]);
    await mouse(center);
    assert.deepEqual(await selection(),['front']);
    await js("a.select([{rootId:'rear',path:[]}]);");
    await mouse(center,'right');
    await until("!!document.querySelector('[data-context-action=pick-other]')",'Other selection command');
    await click('[data-context-action=pick-other]');
    const getCandidateRoots=()=>js("return Array.from(document.querySelectorAll('[data-pick-root]'),n=>n.dataset.pickRoot);");
    assert.deepEqual(await getCandidateRoots(),['front','rear']);
    assert.deepEqual(await selection(),['rear']);
    const rearButton=await js("const n=document.querySelector('[data-pick-root=rear]');const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};");
    input('mouseMove',rearButton);
    await until("a.view.groups.pickHighlight.children[0]?.userData.rootId==='rear'",'Highlight for the rear candidate');
    await shot('U02-Andere-auswaehlen');
    await key('Escape');
    assert.deepEqual(await selection(),['rear']);
    assert.equal(await js('return a.view.groups.pickHighlight.children.length;'),0);
    await mouse(center);
    await mouse(center,'right');
    await click('[data-context-action=pick-other]');
    await click('[data-pick-root=rear]');
    assert.deepEqual(await selection(),['rear']);
    await js("await a.actions.isolate();await a.settled();");
    await mouse(center,'right');
    await click('[data-context-action=pick-other]');
    assert.deepEqual(await getCandidateRoots(),['rear']);
    await key('Escape');
    await js("await a.actions['end-isolation']();await a.settled();");
    record('U02 · Normaler Klick, Tiefe, Fokus, Escape, Sichtumfang',{normal:'front',other:['front','rear'],isolated:['rear'],afterEscape:'rear'});

    await js("a.select([{rootId:'front',path:[]}]);a.view.canvas.focus();");
    const beforeTool=await model();
    await key('S');
    const direct = await js("return Array.from(document.querySelectorAll('#solid-shortcuts [data-solid-shortcut]'),n=>n.dataset.solidShortcut);");
    assert.deepEqual(direct,['extrude','cut','round','measure']);
    assert.ok(await js("return document.activeElement.matches('#solid-shortcuts input');"));
    await type('Verrundung');
    assert.equal(await js("return document.querySelector('#solid-shortcuts [data-command-result]').dataset.commandResult;"),'round');
    await key('Down');
    assert.equal(await js("return document.activeElement.dataset.commandResult;"),'round');
    await key('Up');
    assert.ok(await js("return document.activeElement.matches('#solid-shortcuts input');"));
    await shot('U01-Solid-Verrundung');
    assert.deepEqual(await model(),beforeTool);
    await key('Enter');
    await until("a.tools.practiceEdgeState()?.edges.length>0",'Native edge tool via search');
    assert.equal(await js("return document.querySelector('[data-pick-kind=edge]').textContent;"),'Kante wählen');
    const edgeAt=await point([2,10.8,2]);
    await mouse(edgeAt,'right');
    await click('[data-context-action=pick-other]');
    await until("!!document.querySelector('[data-pick-root=rear]:not(:disabled)')",'Rear native edge candidate');
    await shot('U05-Kante-hintere-Platte');
    await click('[data-pick-root=rear]');
    await until("a.tools.practiceEdgeState()?.nodeId==='rear'&&a.tools.practiceEdgeState().selected.length===1",'Rear edge selected');
    const selectedEdge=await js('const s=a.tools.practiceEdgeState();return s.edges.find(e=>e.edgeToken===s.selected[0]).reference;');
    await click('[data-edge-preview]');
    await until("!document.querySelector('[data-edge-apply]')?.disabled&&!!a.tools.state()?.preview",'Native fillet preview');
    const proof=await js("const p=a.controller.getPreview(a.tools.state().preview).project;return {rear:p.nodes.find(n=>n.id==='rear').finish.steps[0],front:!!p.nodes.find(n=>n.id==='front').finish};");
    assert.equal(proof.rear.kind,'round');
    assert.equal(proof.rear.amount,1);
    assert.equal(proof.rear.edges.length,1);
    assert.equal(proof.rear.edges[0].origin.rootId,'rear');
    assert.deepEqual(proof.rear.edges[0].anchor,selectedEdge.anchor);
    assert.equal(proof.front,false);
    await shot('U05-Verrundung-Vorschau');
    await click('[data-edge-close]');
    assert.deepEqual(await model(),beforeTool);
    record('U05-01 · Verrundung der hinteren Platte und Abbruch',{selectedEdge,amount:proof.rear.amount,unchanged:true});

    await js("a.select([{rootId:'rear',path:[]}]);");
    await click('#solid-panel-features [data-action=drill]');
    await until("a.tools.referenceUI.state()?.kind==='drill'",'Drill tool');
    assert.equal(await js("return document.querySelector('[data-pick-kind=face]').textContent;"),'Fläche wählen');
    await frame('top');
    await mouse(await point([3,4,14]),'right');
    await click('[data-context-action=pick-other]');
    await until("!!document.querySelector('[data-pick-root=rear]:not(:disabled)')",'Native face selectable');
    await click('[data-pick-root=rear]');
    await click('[data-ref-preview]');
    await until("!document.querySelector('[data-ref-apply]')?.disabled&&!!a.tools.referenceUI.state()?.preview",'Native drill preview');
    assert.equal(await js("return a.tools.referenceUI.state().target.id;"),'rear');
    await click('[data-ref-close]');
    assert.deepEqual(await model(),beforeTool);
    await js("a.select([{rootId:'rear',path:[]}]);await a.actions['assembly-only']();await a.settled();");
    await click('#solid-panel-features [data-action=drill]');
    await frame('top');
    await mouse(await point([3,4,14]),'right');
    await click('[data-context-action=pick-other]');
    await until("!!document.querySelector('[data-pick-root=front]:disabled')",'Display-only frame');
    assert.match(await js("return document.querySelector('[data-pick-root=front]').textContent;"),/Nur Rahmen/);
    const stale = await js("const revision=a.controller.revision(); const previous=document.querySelector('[data-pick-root=rear]'); window.u05OldCandidate=previous;await a.mutate(p=>{p.nodes.find(n=>n.id==='front').name='Platte vorn geändert';},'Änderung während der Auswahl');await a.settled();return {revision,after:a.controller.revision()};");
    assert.notEqual(stale.revision,stale.after);
    await until("!document.querySelector('#cad-context-menu')&&!a.tools.referenceUI.state()", 'Stale menu closed');
    const afterMutation=await model();
    await js("window.u05OldCandidate?.click();await a.settled();");
    assert.deepEqual(await model(),afterMutation);
    await js("await a.actions.undo();await a.settled();await a.actions['assembly-all']();await a.settled();");
    record('U03 · Native Bohrfläche, Anzeigerahmen und Revisionswechsel',{drillBody:'rear',frameDisabled:true,...stale});

    await resize(1000,800);
    await js("a.ui.settings.open();const e=document.getElementById('settings-language');e.value='en';e.dispatchEvent(new Event('change'));document.getElementById('modal').close();a.view.canvas.focus();");
    await until("document.documentElement.lang==='en'",'English UI');
    await key('S');
    await type('Fillet');
    assert.equal(await js("return document.querySelector('#solid-shortcuts [data-command-result=round]').textContent;"),'Fillet');
    assert.ok(await js("const n=document.getElementById('solid-shortcuts'),r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;"));
    await shot('U05-Englisch-schmal');
    await key('Down');
    assert.equal(await js("return document.activeElement.dataset.commandResult;"),'round');
    await key('Enter');
    await until("a.tools.practiceEdgeState()?.edges.length>0",'English fillet opens from the keyboard');
    assert.equal(await js("return document.querySelector('[data-pick-kind=edge]').textContent;"),'Select edge');
    await click('[data-edge-close]');
    await js('a.view.canvas.focus();');
    await key('S');
    await key('Escape');
    assert.ok(await js("return !document.getElementById('solid-shortcuts')&&document.activeElement===a.view.canvas;"));
    await js('a.select([]);a.view.canvas.focus();');
    await key('S');
    await type('Fillet');
    assert.ok(await js("return document.querySelector('[data-command-result=round]').disabled;"));
    await key('Enter');
    assert.ok(await js("return !!document.getElementById('solid-shortcuts')&&!a.tools.state();"));
    await key('Escape');
    await js("a.select([{rootId:'rear',path:[]}]);a.workbenchUI.solid.selectManager('properties');document.getElementById('size-0').focus();");
    await key('S');
    assert.ok(await js("return !document.getElementById('solid-shortcuts')&&document.activeElement.id==='size-0';"));
    await js("a.ui.settings.open();document.getElementById('settings-language').focus();");
    await key('S');
    assert.ok(await js("return !document.getElementById('solid-shortcuts')&&document.getElementById('modal').open;"));
    await js("document.getElementById('modal').close();a.workbenchUI.setMode('fusion');a.view.canvas.focus();");
    await key('S');
    assert.ok(await js("return document.getElementById('fusion-search')&&!document.getElementById('solid-shortcuts');"));
    await type('Fillet');
    assert.ok(await js("return !!document.querySelector('#fusion-search [data-command-result=round]');"));
    await key('Escape');
    await js("a.workbenchUI.setMode('solid');a.workbenchUI.solid.selectManager('model');");
    await frame('top');
    const drag=await point([3,4,14]);
    const camera=await js('return a.view.camera().quaternion.toArray();');
    input('mouseMove',drag);
    input('mouseDown',drag,{button:'right',clickCount:1});
    for(let i=1;i<=5;i++){input('mouseMove',{x:drag.x+i*9,y:drag.y-i*6},{button:'right'});await pause(20);}
    input('mouseUp',{x:drag.x+45,y:drag.y-30},{button:'right',clickCount:1});
    await pause(180);
    assert.ok(await js("return !document.querySelector('#cad-context-menu');"));
    assert.notDeepEqual(await js('return a.view.camera().quaternion.toArray();'),camera);
    await frame('top');
    const empty=await js("const r=a.view.canvas.getBoundingClientRect();for(const y of [.8,.66,.25])for(const x of [.85,.8,.7,.2]){const p={x:r.x+x*r.width,y:r.y+y*r.height};if(document.elementFromPoint(p.x,p.y)===a.view.canvas&&!a.view.visualHit({clientX:p.x,clientY:p.y}))return p;}throw Error('No empty point found');");
    await mouse(empty);
    assert.deepEqual(await selection(),[]);
    assert.deepEqual(await model(),beforeTool);
    record('U01/U05-02/04 · Tastatur, zwei Sprachen, Fokus, deaktivierter Befehl und Bedienregressionen',{widths:[1500,1000],languages:['de','en'],fusion:true,rightDrag:true,emptyClick:true});
    return {ok:true,checks};
  } catch(error) {
    await shot('Fehlerzustand').catch(()=>{});
    throw error;
  }
};