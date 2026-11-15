const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(process.env.FORMNARO_FEATURE_OUTPUT||'work/cad-ai-chat/direct-feature');
fs.mkdirSync(root,{recursive:true});
const profile=fs.mkdtempSync(path.join(root,'profile-'));
app.setPath('userData',profile);app.setPath('sessionData',profile);
app.whenReady().then(async()=>{
 const requests=[],checks=[],errors=[],hits=[];
 const mock=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url==='/v1/models')return res.end(JSON.stringify({data:[{id:'mock-feature-model',input_modalities:['text']}]}));
  try{
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const body=JSON.parse(Buffer.concat(chunks));requests.push(body);
   const user=Array.isArray(body.input)?body.input.at(-1).content[0].text:body.input;
   const scene=JSON.parse(user.split('Current scene (data):\n')[1].split('\nUser task:\n')[0]);
   const contractText=body.instructions.split('Contract:\n')[1].split('\n')[0];
   const contract=JSON.parse(contractText),ref=contract.featureScope?.references?.[0];
   assert.deepEqual(ref?.fields,[{field:'diameter',value:5,unit:'mm'}]);
   assert.equal(ref.surface.center[1],-14);
   assert.match(contract.featureScope.rule,/minBottom only for a known blind bore/);
   assert.equal((Array.isArray(body.input)?body.input:[]).flatMap(t=>Array.isArray(t?.content)?t.content:[]).filter(x=>x.type==='input_image').length,0);
   const answer={revision:scene.revision,label:'Gewählte Bohrung Ø7',commands:[{op:'feature',referenceId:ref.id,field:'diameter',value:7}]};
   res.end(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}]}));
  }catch(e){errors.push(e.message);res.statusCode=400;res.end(JSON.stringify({error:{message:e.message}}));}
 });
 await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
 session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:/^https?:/i.test(d.url)}));
 const win=new BrowserWindow({show:false,width:1500,height:950,webPreferences:{offscreen:true,contextIsolation:true,sandbox:true,backgroundThrottling:false,preload:path.resolve('preload.cjs'),additionalArguments:['--formnaro-portable-data']}});
 const backend=path.resolve(process.env.FORMNARO_CHAT_BACKEND||'backend');
 require(path.join(backend,'program-storage.cjs')).installProgramStorage(win,{directory:path.join(profile,'Daten'),cadOnly:true});
 require(path.join(backend,'desktop-ai.cjs')).installDesktopAI(win,{settingsFile:path.join(profile,'Daten/ai-settings.json')});
 require(path.join(backend,'projects.cjs')).installProjects(win,{directory:path.join(profile,'Projekte')});
 require(path.join(backend,'layouts.cjs')).installLayouts(win,{directory:path.join(profile,'Layouts')});
 const run=code=>win.webContents.executeJavaScript(code),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(condition){
  for(let i=0;i<300;i++){if(await run(condition))return;await sleep(70);}
  throw Error('Timeout: '+condition+' | '+await run("document.getElementById('ai-chat-status')?.textContent+' | '+document.querySelector('[data-ref-status]')?.textContent"));
 }
 function mouse(p){for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,x:Math.round(p.x),y:Math.round(p.y),button:'left',clickCount:1});}
 async function click(selector){
  const p=await run(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing control');e.scrollIntoView({block:'nearest'});await new Promise(requestAnimationFrame);const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  mouse(p);await sleep(70);
 }
 async function poseForBore(y){
  await run(`(async()=>{
   const v=window.__cadTest.view;
   v.restoreView({projection:'perspective',position:[120,${y},50],target:[25,${y},4.3],up:[0,0,1],zoom:1});
   await v.renderReady();
  })()`);
 }
 async function clickBore(y){
  const point=await run(`(async()=>{
   const v=window.__cadTest.view;
   const p=v.projectPoint([25,${y},4.5]),e=document.elementFromPoint(p.x,p.y);
   const h=v.visualHit({clientX:p.x,clientY:p.y});
   return {...p,overlay:e?.id||e?.className?.toString(),canvas:e===v.canvas,hit:h?.object?.userData?.rootId,world:h?.point?.toArray()};
  })()`);
  hits.push(point);assert(point.canvas&&point.hit,JSON.stringify(point));
  mouse(point);
 }
 try{
  await win.loadFile(path.resolve(process.env.FORMNARO_CHAT_ENTRY||'work/cad-v011/native-app/index.html'),{query:{test:'1'}});
  await until('!!window.__cadTest');
  await run("document.querySelector('#empty-hint button[data-welcome-dismiss]')?.click();");
  await run(`window.offlinecadDesktop.saveAISettings({config:{protocol:'responses',baseUrl:'http://127.0.0.1:${mock.address().port}/v1',model:'mock-feature-model',rememberKey:false,bridgeEnabled:false},key:'mock-only-key'})`);
  await run('window.__cadTest.aiUI.chat.refreshModels()');
  await until("!document.getElementById('ai-chat-send').disabled");
  const before=await run(`(async()=>{
   const t=window.__cadTest;
   const commands=[{op:'create',type:'box',name:'Halter',size:[80,40,5],pos:[0,0,2.5],as:'body'},...[-14,14].map((y,i)=>({op:'create',type:'cylinder',name:i?'Obere Bohrung':'Untere Bohrung',size:[5,5,10],pos:[25,y,2.5],solid:false,as:'hole'+i})),{op:'group',targets:['$body','$hole0','$hole1'],name:'Halter mit zwei Bohrungen'}];
   await t.execute({kind:'batch',commands});t.select([]);await t.settled();
   return t.getModel().nodes;
  })()`);
  await poseForBore(14);
  await click('#ai-chat-pick-feature');
  await until("window.__cadTest.featureUI.state()?.picking==='auto'");
  await clickBore(14);
  await until("!document.querySelector('[data-ref-candidate]').hidden");
  assert.match(await run("document.querySelector('[data-ref-measure]').textContent"),/5\.0000/);
  assert.match(await run("document.querySelector('[data-ref-bore-position]').textContent"),/Y 14/);
  assert.deepEqual((await run('window.__cadTest.getModel()')).nodes,before);
  await click('[data-ref-candidate-cancel]');
  await until("window.__cadTest.featureUI.state()?.picking==='auto'");
  await click('[data-ref-close]');
  await poseForBore(-14);
  await click('#ai-chat-pick-feature');
  await until("window.__cadTest.featureUI.state()?.picking==='auto'");
  await clickBore(-14);
  await until("!document.querySelector('[data-ref-candidate]').hidden");
  assert.match(await run("document.querySelector('[data-ref-bore-position]').textContent"),/Y -14/);
  await click('[data-ref-save-attach]');
  await until("document.querySelector('#ai-chat-feature-references [data-ai-feature-ref]')&&document.getElementById('ai-feature-panel').hidden");
  assert.equal(requests.length,0);
  const attached=(await run('window.__cadTest.aiUI.chat.state()')).featureReferences[0];
  assert.equal(attached.kind,'bore');assert.equal(attached.origin.target.rootId,before[0].id);assert.equal(attached.selector.surface.center[1],-14);
  assert.deepEqual((await run('window.__cadTest.getModel()')).nodes,before);
  checks.push('Pick and confirm one of two similar bores without a provider call or a geometry edit');
  await click('#ai-chat-prompt');win.webContents.insertText('Diese Bohrung auf 7 mm vergrößern.');
  await click('#ai-chat-send');
  await until("!document.getElementById('ai-chat-proposal').hidden&&!document.getElementById('ai-chat-send').disabled");
  assert.deepEqual((await run('window.__cadTest.getModel()')).nodes,before);
  await click('#ai-chat-apply');
  await until("document.getElementById('ai-chat-proposal').hidden&&!document.getElementById('ai-chat-send').disabled");
  const changed=(await run('window.__cadTest.getModel()')).nodes[0];
  const native=await run(`(async()=>{
   const c=window.__cadTest.controller, ids=[c.snapshot().nodes[0].id];
   const diameters=[];
   for(const y of [-14,14]){
    const picked=await c.query('featureReference',{action:'pick',kind:'auto',ids,ray:{origin:[25,y,2.5],direction:[1,0,0],far:8}});
    diameters.push(picked.reference.selector.surface.diameter);
   }
   return diameters;
  })()`);
  assert.deepEqual(native,[7,5]);
  const bore=(n,y)=>n.children.find(c=>c.recipe?.type==='cylinder'&&c.transform[13]===y);
  assert.deepEqual(bore(changed,-14).recipe.size.slice(0,2),[7,7]);
  assert.deepEqual(bore(changed,-14).transform,bore(before[0],-14).transform);
  assert.deepEqual(bore(changed,14),bore(before[0],14));
  await run('window.__cadTest.actions.undo()');await run('window.__cadTest.settled()');
  assert.deepEqual((await run('window.__cadTest.getModel()')).nodes,before);
  assert.equal(requests.length,1);assert.deepEqual(errors,[]);
  checks.push('Scoped preview and explicit Apply change only the confirmed bore with exact Undo');
  fs.writeFileSync(path.join(root,'result.json'),JSON.stringify({passed:true,checks,requests:requests.length},null,2));
 }catch(e){
  fs.writeFileSync(path.join(root,'result.json'),JSON.stringify({passed:false,error:e.stack,checks,errors,hits,status:await run("({busy:document.body.dataset.cadBusy,source:window.__cadTest.sourceDisplayState(),picking:window.__cadTest.featureUI.state(),mode:window.__cadTest.view.getMode()})")},null,2));
  console.error(e.stack);process.exitCode=1;
 }finally{mock.closeAllConnections();mock.close();win.close();app.quit();}
});
