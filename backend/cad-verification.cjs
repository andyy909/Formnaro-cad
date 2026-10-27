const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process'),{createHash}=require('node:crypto');

function bridgeRequest(descriptor,method,args){
  const address=new URL(descriptor.url);
  assert.equal(address.protocol,'http:');assert.equal(address.hostname,'127.0.0.1');assert.ok(address.port);assert.equal(address.pathname,'/');assert.equal(address.username,'');assert.equal(address.password,'');
  const body=args===undefined?null:Buffer.from(JSON.stringify(args));
  return new Promise((resolve,reject)=>{
    const request=http.request({hostname:'127.0.0.1',port:address.port,path:'/v1/'+method,method:body?'POST':'GET',headers:{Authorization:'Bearer '+descriptor.token,...(body?{'Content-Type':'application/json','Content-Length':body.length}:{})}},response=>{
      const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>32*1024*1024){response.destroy();reject(Error('Verification API output exceeds budget'));}else chunks.push(chunk);});response.on('end',()=>{try{resolve({status:response.statusCode,value:JSON.parse(Buffer.concat(chunks))});}catch{reject(Error('Verification bridge returned invalid JSON'));}});response.on('error',reject);
    });request.setTimeout(45000,()=>request.destroy(Error('Verification bridge timeout')));request.on('error',reject);request.end(body);
  });
}
function runAdapter(script,connection,requests,{python='python'}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(python,[script,'--connection',connection,'--mcp'],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}}),out=[],err=[];let size=0;
    const timer=setTimeout(()=>{child.kill();reject(Error('Isolated MCP verification timeout'));},60000);
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){child.kill();reject(Error('MCP verification response exceeds budget'));}else out.push(chunk);});child.stderr.on('data',chunk=>err.push(chunk));child.on('error',error=>{clearTimeout(timer);reject(Error('Python MCP adapter unavailable: '+error.code));});
    child.on('close',code=>{clearTimeout(timer);if(code!==0){reject(Error('Isolated MCP verification failed; inspect the local adapter'));return;}try{resolve(Buffer.concat(out).toString('utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse));}catch{reject(Error('MCP verification returned invalid protocol JSON'));}});
    child.stdin.end(requests.map((request,index)=>JSON.stringify({jsonrpc:'2.0',id:index+1,...request})).join('\n')+'\n');
  });
}

// Runtime-side factory so the identical verifier can run against a packaged
// EXE. It only accepts Electron's dedicated --verify-local profile and folders.
async function verifyNativeCad(win,app,outputPath,{python='python',adapterPath=path.resolve(__dirname,'../scripts/offlinecad_ai.py')}={}){
  const output=path.resolve(outputPath),root=path.dirname(output),profile=path.join(root,'offlinecad-verification-profile');
  assert.equal(app.getPath('userData'),profile,'Native proof requires its isolated verification profile');assert.equal(app.getPath('sessionData'),profile);assert.equal(app.getName(),'Formnaro');
  const js=code=>win.webContents.executeJavaScript(code),report={nativeCad:true,application:'Formnaro',appVersion:app.getVersion(),isolatedProfile:true,checks:[]};
  // Node can read app.asar, while the actual external Python interpreter
  // cannot. Materialize this exact public CLI only in the isolated fixture.
  const adapterBytes=fs.readFileSync(adapterPath),fixtureAdapter=path.join(root,'native-verification-offlinecad-ai.py');fs.writeFileSync(fixtureAdapter,adapterBytes);report.mcpAdapterSha256=createHash('sha256').update(adapterBytes).digest('hex');assert.equal(createHash('sha256').update(fs.readFileSync(fixtureAdapter)).digest('hex'),report.mcpAdapterSha256);
  const result=await js(`(async()=>{
    const a=window.__cadTest,assert=(value,message)=>{if(!value)throw Error(message);};
    assert(a?.controller&&a.ui&&a.tools&&a.view&&a.access,'Native CAD application/test API missing');
    assert(window.offlinecadDesktop&&typeof window.offlinecadDesktop.saveFile==='function','Original native preload missing');
    const storage=a.storage.info();assert(storage.cadOnly===true,'Portable store is not CAD-only');
    for(const key of ['offlinecad-library-v1','offlinecad-autosave-v1','offlinecad-autosave-v2','offlinecad-autosave-v3','offlinecad-autosave-v4'])assert(a.storage.getItem(key)===null,'Legacy mesh data became readable');
    await a.resetProject();await a.loadDemo();await a.settled();
    let project=a.snapshot(),group=project.nodes[0],hole=group.children.find(node=>!node.solid),before=group.stats.volume,undo=a.undoDepth();
    assert(project.format==='OfflineCAD'&&project.version===5,'Native format-5 schema missing');
    assert(group.kind==='cad'&&group.children.length===5&&group.brep.triangulation===false,'Editable native source group missing');
    const request={revision:a.controller.revision(),label:'Isolated CAD source bore change',commands:[{op:'update',target:{rootId:group.id,path:[hole.id]},set:{size:[8,8,10]}}]},proposal=await window.offlinecadAutomation.preview(request);
    assert(a.snapshot().nodes[0].stats.volume===before,'Native preview committed early');
    await window.offlinecadAutomation.apply({previewId:proposal.previewId,revision:proposal.revision});await a.settled();
    assert(a.snapshot().nodes[0].stats.volume<before-150&&a.undoDepth()===undo+1,'Source edit did not rebuild atomically');
    await a.actions.undo();await a.settled();assert(Math.abs(a.snapshot().nodes[0].stats.volume-before)<1e-7,'Native source Undo failed');await a.actions.redo();await a.settled();
    project=a.snapshot();const revision=a.controller.revision(),volume=project.nodes[0].stats.volume,encoded=a.controller.serialize(),settings=a.getQuality();
    await a.setQuality({...settings,display:{deflection:.035,angleDegrees:12}});await a.settled();assert(a.controller.revision()===revision&&a.controller.serialize()===encoded&&a.snapshot().nodes[0].stats.volume===volume,'Display quality changed native state');
    await a.controller.open(encoded,{label:'Isolated saved CAD reopen'});await a.settled();assert(a.controller.serialize()===encoded,'CAD save/open altered original sources');
    let rejected=false;try{await a.controller.open(JSON.stringify({format:'OfflineCAD',version:4,nodes:[]}));}catch{rejected=true;}assert(rejected&&a.controller.serialize()===encoded,'Legacy project accepted or changed confirmed model');
    assert(JSON.parse(a.storage.getItem('offlinecad-autosave-v7')||'{}').version===5,'Ordinary format5 project in CAD7 autosave missing');
    a.select([{rootId:group.id,path:[]}]);await a.settled();
    const context=await window.offlinecadAutomation.context(),scene=await window.offlinecadAutomation.scene();
    assert(context.projectVersion===11&&context.supportedProjectVersions.includes(5)&&context.supportedProjectVersions.includes(8)&&context.version===${JSON.stringify(app.getVersion())}&&context.requestSchema&&context.exportSchema&&Object.keys(context.endpoints).length===7,'Native context/schema/routes missing');
    assert(scene.revision===a.controller.revision()&&!JSON.stringify(scene).includes('triangles'),'Compact native scene contains display arrays or stale revision');
    assert(typeof a.actions.edges==='function'&&typeof a.actions['general-fit']==='function'&&typeof a.actions.section==='function'&&typeof a.actions.inspect==='function','Native tool actions missing');
    assert(scene.objects.filter(o=>o.kind==='cad').every(o=>o.measures?.editSize?.length===3&&o.measures.worldAxisSize.every(Number.isFinite)&&o.sizeToWorldAxisFactors.every(v=>v>0)&&o.worldAxisDirections.length===3),'Prepared native axis measures missing');
    const step=await window.offlinecadAutomation.export({format:'step',ids:[group.id]}),decoded=atob(step.dataBase64);assert(decoded.startsWith('ISO-10303-21;')&&decoded.includes('MANIFOLD_SOLID_BREP')&&!decoded.includes('TESSELLATED'),'Direct native STEP missing');
    const stl=await window.offlinecadAutomation.export({format:'stl',ids:[group.id],quality:{deflection:.01,angleDegrees:5}});assert(atob(stl.dataBase64).startsWith('solid '),'Independent CAD STL export missing');
    return {projectVersion:project.version,nodes:project.nodes.length,sourceCount:group.children.length,volume,revision:a.controller.revision(),storageDirectory:storage.directory,contextVersion:context.version,quality:a.getQuality(),model:JSON.parse(a.controller.serialize())};
  })()`);
  assert.equal(result.storageDirectory,path.join(root,'portable-data'));Object.assign(report,{projectVersion:result.projectVersion,nodes:result.nodes,sourceCount:result.sourceCount,volume:result.volume,contextVersion:result.contextVersion});
  report.checks.push('native-preload-and-cad-interface','portable-cad-only-store','schema5-no-triangulation','editable-group-source-preview-apply-undo-redo','display-quality-invariance','saved-cad-reopen','legacy-format-rejection','cad-autosave5','compact-cad-scene-context-and-tool-actions','direct-step-and-independent-stl-export');
  fs.writeFileSync(path.join(root,'native-verification-model.ocad'),JSON.stringify(result.model,null,2)+'\n');
  const originalSettings=await js('window.offlinecadDesktop.getAISettings()');assert.equal(originalSettings.hasKey,false,'Isolated proof must not contain a provider key');
  let descriptor;
  try{
    await js(`(async()=>{const settings=await window.offlinecadDesktop.getAISettings();return window.offlinecadDesktop.saveAISettings({config:{...settings,rememberKey:false,bridgeEnabled:true},clearKey:true});})()`);
    const connection=path.join(profile,'ai-bridge.json');descriptor=JSON.parse(fs.readFileSync(connection,'utf8'));assert.equal(descriptor.application,'Formnaro');assert.equal(descriptor.apiVersion,1);if(typeof descriptor.token!=='string'||!/^[0-9a-f]{64}$/.test(descriptor.token))throw Error('Isolated bridge descriptor has an invalid authentication field');
    const context=await bridgeRequest(descriptor,'context'),scene=await bridgeRequest(descriptor,'scene');assert.equal(context.status,200);assert.equal(context.value.projectVersion,11);assert.deepEqual(context.value.supportedProjectVersions,[5,7,8,9,10,11]);assert.equal(scene.status,200);
    const hole=scene.value.objects.find(node=>!node.solid),before=await js('window.__cadTest.controller.serialize()'),preview=await bridgeRequest(descriptor,'preview',{revision:scene.value.revision,label:'Isolated HTTP native bore',commands:[{op:'update',target:hole.target,set:{size:[7,7,10]}}]});
    assert.equal(preview.status,200);assert.equal(await js('window.__cadTest.controller.serialize()'),before);
    const applied=await bridgeRequest(descriptor,'apply',{previewId:preview.value.previewId,revision:preview.value.revision});assert.equal(applied.status,200,'HTTP CAD apply failed');assert.equal(applied.value.applied,true,'HTTP CAD apply was not acknowledged');assert.equal(applied.value.alreadyApplied,false,'First HTTP CAD apply was marked as a repetition');
    const repeated=await bridgeRequest(descriptor,'apply',{previewId:preview.value.previewId,revision:preview.value.revision});assert.equal(repeated.status,200,'Idempotent HTTP CAD apply failed');assert.equal(repeated.value.alreadyApplied,true,'Repeated HTTP CAD apply lacks an explicit idempotency acknowledgement');
    const after=await bridgeRequest(descriptor,'scene'),changedHole=after.value.objects.find(node=>!node.solid);assert.ok(Math.abs(changedHole.localBounds.size[0]*Math.hypot(...changedHole.worldMatrix.slice(0,3))-7)<1e-8,'HTTP apply changed a different source bore transform');assert.ok(Math.abs(changedHole.worldBounds.size[0]-7)<1e-6,'HTTP source bore does not match its native CAD bounds');
    await js('window.__cadTest.actions.undo()');await js('window.__cadTest.settled()');assert.equal(await js('window.__cadTest.controller.serialize()'),before);
    const stale=await bridgeRequest(descriptor,'preview',{revision:scene.value.revision,commands:[{op:'transform',target:scene.value.objects[0].id,translate:[1,0,0]}]});assert.equal(stale.status,200);
    await js('window.__cadTest.actions.duplicate()');await js('window.__cadTest.settled()');const staleReply=await bridgeRequest(descriptor,'apply',{previewId:stale.value.previewId,revision:stale.value.revision});assert.equal(staleReply.status,409);assert.equal(staleReply.value.code,'STALE_REVISION','Structured native conflict code was lost across the original contextBridge');await js('window.__cadTest.actions.undo()');await js('window.__cadTest.settled()');
    const requests=[{method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'formnaro-native-verification',version:'0.11.0'}}},{method:'tools/list'},{method:'tools/call',params:{name:'offlinecad_context',arguments:{}}},{method:'tools/call',params:{name:'offlinecad_scene',arguments:{}}}];
    const replies=await runAdapter(fixtureAdapter,connection,requests,{python});assert.equal(replies.length,4);assert.equal(replies[0].result.serverInfo.name,'offlinecad-local');
    const tools=replies[1].result.tools;assert.deepEqual(tools.map(tool=>tool.name).sort(),['offlinecad_context','offlinecad_scene','offlinecad_project','offlinecad_screenshot','offlinecad_preview','offlinecad_apply','offlinecad_export','offlinecad_assembly'].sort());
    assert.deepEqual(tools.find(tool=>tool.name==='offlinecad_export').inputSchema.properties.format.enum,['step','stl','obj','3mf','gltf','glb','svg']);assert.equal(replies[2].result.isError,false);assert.equal(JSON.parse(replies[2].result.content[0].text).projectVersion,9);assert.equal(replies[3].result.isError,false);
    report.checks.push('real-loopback-http-context-preview-apply-native-undo','stale-http-apply-rejected','actual-python-mcp-toolnames-and-live-cad-schema');
  }finally{
    // Original fixture provider fields are retained; no provider request/key is
    // needed. No descriptor, bearer token or credential enters reports/logs.
    await js(`window.offlinecadDesktop.saveAISettings({config:${JSON.stringify({...originalSettings,bridgeEnabled:false,rememberKey:false})},clearKey:true})`);
  }
  report.ui=await require('./cad-ui-verification.cjs').verifyCadUi(win,app,outputPath);report.checks.push(...report.ui.checks);
  const exchange=await require('./exchange-verification.cjs').verifyExchange(win,{cad:true});report.exchange={ok:exchange.ok,checks:exchange.checks};report.checks.push(...exchange.checks);
  const png=(await win.webContents.capturePage()).toPNG();fs.writeFileSync(output.replace(/\.json$/i,'.png'),png);
  report.localBridgeDisabled=!(await js('window.offlinecadDesktop.getAISettings()')).bridge.enabled;assert.equal(report.localBridgeDisabled,true);report.ok=true;
  return report;
}
module.exports={verifyNativeCad};
