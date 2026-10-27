const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
exports.runToolbarChecks=async({win,js,pause,check,proof})=>{
  async function capture(name){win.showInactive();await pause(200);fs.writeFileSync(path.join(proof,name),(await win.webContents.capturePage()).toPNG());win.hide();}
  const snap=()=>js('window.__mini.snapshot()'),depth=()=>js('window.__mini.history().past'),settled=()=>js('window.__mini.settled()');
  async function click(id){const point=await js(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);win.webContents.sendInputEvent({type:'mouseMove',...point});win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});await pause(70);await settled();}
  await js('window.__mini.actions.selectAll()');
  await check('familiar toolbar order, real loaded icons, accessible names and 1000px fit',async()=>{
    const expected=['copy','paste','duplicate','delete','undo','redo','show-all','visibility-tool','group','ungroup','align-tool','mirror-tool','place','measure','drop','repair','import','export'];
    assert.deepEqual(await js(`Array.from(document.querySelectorAll('.command-bar button')).map(e=>e.id)`),expected);
    assert.equal(await js(`Array.from(document.querySelectorAll('.command-bar .tool')).every(e=>e.title&&e.getAttribute('aria-label')&&e.querySelector('img')?.complete&&e.querySelector('img').naturalWidth>0)`),true);
    win.setSize(1000,760);await pause(150);assert.equal(await js(`document.documentElement.scrollWidth<=innerWidth&&document.getElementById('export').getBoundingClientRect().right<=innerWidth`),true);
    await capture('toolbar-1000.png');win.setSize(1440,960);await pause(150);
  });
  await check('trusted copy and paste duplicate multiple parts with one reversible transaction',async()=>{
    const before=await snap(),undo=await depth();await click('copy');assert.deepEqual(await snap(),before);assert.equal(await depth(),undo);await click('paste');const after=await snap();assert.equal(after.nodes.length,before.nodes.length*2);assert.equal(await depth(),undo+1);
    const originals=new Set(before.nodes.map(n=>n.id));after.nodes.slice(before.nodes.length).forEach((n,i)=>{assert(!originals.has(n.id));assert.deepEqual(n.params,before.nodes[i].params);assert.deepEqual(n.size,before.nodes[i].size);assert.deepEqual(n.pos,before.nodes[i].pos.map((v,k)=>v+(k<2?10:0)));});
    await js('window.__mini.actions.undo()');assert.deepEqual(await snap(),before);await js('window.__mini.actions.selectAll()');
    await js(`document.getElementById('project-name').addEventListener('keydown',e=>e.preventDefault(),{once:true});document.getElementById('project-name').focus()`);win.webContents.sendInputEvent({type:'keyDown',keyCode:'V',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'V',modifiers:['control']});await pause(80);assert.equal((await snap()).nodes.length,before.nodes.length);await js(`document.getElementById('project-name').blur()`);
  });
  await check('mirror axis menu reflects actual pair bounds and undo restores sources',async()=>{
    const before=await snap(),undo=await depth(),bounds=await js(`window.__mini.request('bounds',window.__mini.snapshot().nodes)`),center=(Math.min(...bounds.map(b=>b.min[0]))+Math.max(...bounds.map(b=>b.max[0])))/2;
    await click('mirror-tool');await js(`document.querySelector('[data-mirror="0"]').click()`);await settled();assert.equal(await depth(),undo+1);const after=await js(`window.__mini.request('bounds',window.__mini.snapshot().nodes)`);
    after.forEach((b,i)=>{assert(Math.abs(b.min[0]-(2*center-bounds[i].max[0]))<1e-5);assert(Math.abs(b.max[0]-(2*center-bounds[i].min[0]))<1e-5);});await js('window.__mini.actions.undo()');assert.deepEqual(await snap(),before);await js('window.__mini.actions.selectAll()');
  });
  await check('ruler measures combined world bounds without model or undo changes',async()=>{
    const before=await snap(),undo=await depth();await click('measure');assert.equal(await js(`document.getElementById('measure-menu').hidden`),false);const bounds=await js(`window.__mini.request('bounds',window.__mini.snapshot().nodes)`),values=await js(`Array.from(document.querySelectorAll('#measurement dd')).map(e=>e.textContent)`);assert.equal(values.length,3);values.forEach((v,i)=>assert.equal(v,(Math.max(...bounds.map(b=>b.max[i]))-Math.min(...bounds.map(b=>b.min[i]))).toLocaleString('de-DE',{maximumFractionDigits:3})+' mm'));
    assert.deepEqual(await snap(),before);assert.equal(await depth(),undo);await capture('measure-menu.png');
  });
  await check('Escape closes toolbar menu and restores trigger focus without clearing selection',async()=>{
    const ids=await js('window.__mini.selected()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await pause(50);assert.equal(await js(`document.getElementById('measure-menu').hidden`),true);assert.equal(await js('document.activeElement.id'),'measure');assert.deepEqual(await js('window.__mini.selected()'),ids);
    await click('align-tool');assert.equal(await js(`document.getElementById('align-tool').getAttribute('aria-expanded')`),'true');await click('mirror-tool');assert.equal(await js(`document.getElementById('align-menu').hidden`),true);assert.equal(await js(`document.getElementById('mirror-menu').hidden`),false);await click('mirror-tool');assert.equal(await js(`document.getElementById('mirror-menu').hidden`),true);
  });
  await check('visibility dropdown and lightbulb hide and restore selection transactionally',async()=>{
    const before=await snap(),undo=await depth();await click('visibility-tool');await click('hide-selected');assert((await snap()).nodes.every(n=>n.hidden));assert.equal(await depth(),undo+1);await click('show-all');assert.deepEqual(await snap(),before);await js('window.__mini.actions.undo()');assert((await snap()).nodes.every(n=>n.hidden));await js('window.__mini.actions.redo()');assert.deepEqual(await snap(),before);
  });
  await check('relocated group and ungroup controls retain parametric source parts',async()=>{
    await js('window.__mini.actions.selectAll()');const before=await snap();await click('group');const group=await snap();assert.equal(group.nodes.length,1);assert.equal(group.nodes[0].children.length,before.nodes.length);await click('ungroup');assert.equal((await snap()).nodes.length,before.nodes.length);await js('window.__mini.actions.undo();');await js('window.__mini.actions.undo();');assert.deepEqual(await snap(),before);await js('window.__mini.actions.selectAll()');
  });
};
