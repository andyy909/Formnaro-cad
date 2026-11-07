const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');

const click=id=>({kind:'ui',action:'click',target:'ui:id:'+id});
const tool=name=>({kind:'ui',action:'click',target:'ui:tool:'+name});
const target=name=>({kind:'ui',action:'click',target:name});
const enter=(action,id,value)=>({kind:'ui',action,target:'ui:id:'+id,value:String(value)});
const menu=target('menu:cad'),select=(...targets)=>({kind:'select',targets});
const close=(actual,expected)=>assert(Math.abs(actual-expected)<.001,`${actual} differs from ${expected}`);
const sameVector=(actual,expected)=>{
 assert.equal(actual.length,expected.length);
 actual.forEach((value,index)=>close(value,expected[index]));
};

const mirrorSketch={version:2,kind:'profile',variables:[],dimensions:{height:'8'},
 elements:[
  {id:'bottom',type:'line',start:[-15,-12],end:[15,-12]},
  {id:'right',type:'line',start:[15,-12],end:[15,12]},
  {id:'top',type:'line',start:[15,12],end:[-15,12]},
  {id:'left',type:'line',start:[-15,12],end:[-15,-12]},
  {id:'bore',type:'circle',center:[7,0],diameter:4}
 ],loops:[{id:'outside',role:'outer',elements:['bottom','right','top','left']},{id:'opening',role:'hole',elements:['bore']}]};

const box=(name,size,pos)=>({op:'create',type:'box',name,size,pos});
const settings={
 holder:{actions:[
  select('existing-1'),target('view:top'),menu,tool('drill'),
  enter('choose','cad-ref-filter','face-centroid'),{kind:'face',target:'existing-1',side:'top'},
  click('cad-drill-through'),enter('set','cad-drill-diameter',4),enter('set','cad-drill-depth',5),
  click('cad-ref-preview'),click('cad-ref-apply')
 ]},
 shell:{commands:[box('Schalenteil',[30,24,14],[55,0,7])],actions:[
  select('existing-1'),target('view:top'),menu,tool('cad-shell'),
  {kind:'face',target:'existing-1',side:'top'},enter('set','cad-modeling-thickness',3),
  click('cad-modeling-preview'),click('cad-modeling-apply')
 ]},
 align:{commands:[box('Ausrichten A',[10,8,6],[-32,25,8]),box('Ausrichten B',[18,12,14],[28,-30,12])],actions:[
  select('existing-1','existing-2'),tool('align'),click('align-x-center'),click('align-close')
 ]},
 mirror:{commands:[{op:'sketch',name:'Außermittige Bohrung',sketch:mirrorSketch}],actions:[
  select('existing-1'),tool('mirror'),click('mirror-x')
 ]},
 pattern:{commands:[box('Musterursprung',[10,8,6],[40,-20,5])],actions:[
  select('existing-1'),tool('array'),enter('choose','array-kind','line'),enter('choose','array-space','world'),
  enter('set','array-count',4),enter('set','array-step-0',18),click('array-apply')
 ]},
 motion:{actions:[90,360].map(value=>({kind:'model',commands:[
  {op:'joint',action:'move',values:[{jointId:'$existing-2',value}]}
 ]}))}
};
const toolPrompts={
 shell:'Zeig mir, wie ich den ausgewählten Quader von oben aushöhle. Die Wände und der Boden sollen 3 mm dick sein.',
 align:'Zeig mir, wie ich beide ausgewählten Teile auf ihre gemeinsame X-Mitte ausrichte. Y und Z sollen unverändert bleiben.',
 mirror:'Zeig mir, wie ich die ausgewählte Platte um ihre eigene Mitte entlang Welt-X spiegle. Behalte Größe und Lage der Platte bei.',
 pattern:'Zeig mir aus dem ausgewählten Teil ein lineares Muster mit insgesamt vier Teilen einschließlich des Originals und 18 mm Schritt entlang Welt-X.',
 motion:'Zeig mir am ausgewählten fertigen Spindelantrieb eine Umdrehung. Stelle als sichtbaren Zwischenstand 90 Grad und dann 360 Grad ein. Bewege nur den Antriebsregler der Spindel. Der Schlitten soll über die bestehende Schraubkopplung mitlaufen.'
};

async function measureShell(node,bounds){
 const {default:load}=await import('../cad-kernel-build/runtime/formnaro_cad.js');
 const {createCadService}=await import('../src/cad-service.js');
 const {createCadPrecisionNative}=await import('../src/cad-precision-native.js');
 const oc=await load({print:()=>{},printErr:()=>{}}),service=createCadService({oc});
 try{
  const native=createCadPrecisionNative({oc,service}),{min,max,center}=bounds;
  const report=native.wallThickness({node,samples:[
   {point:[max[0],center[1],center[2]],normal:[1,0,0]},
   {point:[center[0],min[1],center[2]],normal:[0,-1,0]},
   {point:[center[0],center[1],min[2]],normal:[0,0,-1]}
  ]});
  assert.equal(report.samplesComplete,true);
  sameVector(report.samples.map(sample=>sample.thickness),[3,3,3]);
  return report.samples;
 }finally{service.dispose();}
}

async function measureHolder(node){
 const {default:load}=await import('../cad-kernel-build/runtime/formnaro_cad.js');
 const {readCadBrep,transformCad,cadRayHits}=await import('../src/cad-native-kernel.js');
 const oc=await load({print:()=>{},printErr:()=>{}}),source=readCadBrep(oc,node.brep.data);
 let world;
 try{
  world=transformCad(oc,source,node.transform);
  const ray=(origin,direction)=>cadRayHits(oc,world,{origin,direction,far:40})[0]?.point;
  const top=ray([40,0,30],[0,0,-1])?.[2];
  const floor=ray([35,0,30],[0,0,-1])?.[2];
  const radii=[1,-1].map(sign=>Math.abs(ray([35,0,1],[sign,0,0])?.[0]-35));
  close(top,4);close(floor,-1);sameVector(radii,[2,2]);
  const volume=node.stats.volume;
  close(volume,40*20*8-Math.PI*4*5);
  return {top,floor,radii,volume};
 }finally{world?.delete();source.delete();}
}

exports.verifyPracticeTool=async function verifyPracticeTool({js,directory,variant,before,parentSnapshot,checks}){
 const {commands,actions:steps}=settings[variant];
 const motionBatch=variant==='motion'&&process.env.FORMNARO_VERIFY_PRACTICE_MOTION_BATCH==='1';
 const actions=motionBatch?[{kind:'model',commands:steps.flatMap(step=>step.commands)}]:steps;
 const live=process.env.FORMNARO_VERIFY_PRACTICE_LIVE==='tool'&&!!toolPrompts[variant];
 let fixture,ids;
 if(variant==='holder'){
  const file=process.env.FORMNARO_VERIFY_PRACTICE_HOLDER_FIXTURE;
  assert(file,'Supply the historical halter.ocad fixture');
  fixture=JSON.parse(fs.readFileSync(file,'utf8'));
  ids=[fixture.nodes.reduce((right,node)=>node.transform[12]>right.transform[12]?node:right).id];
 }else if(variant==='motion'){
  const file=process.env.FORMNARO_VERIFY_PRACTICE_MOTION_FIXTURE;
  assert(file,'Supply the historical gelenke.ocad fixture');
  const {applyCadJointRequest}=await import('../src/cad-joints-data.js');
  fixture=JSON.parse(fs.readFileSync(file,'utf8'));
  ids=['base','spindle','slide'];
  if(!fixture.joints.drives?.length)applyCadJointRequest(fixture,{action:'drive-create',drive:{
   id:'exercise-screw',kind:'screw',name:'Schraubtrieb',rotary:'rotary',linear:'linear',lead:4,direction:1
  }});
 }else{
  fixture=await js(`(async()=>{
   const controller=window.__cadTest.controller;
   const candidate=await controller.preview({kind:'batch',commands:${JSON.stringify(commands)}});
   try{return candidate.project;}finally{controller.discard(candidate.previewId);}
  })()`);
  ids=commands.map(command=>fixture.nodes.find(node=>node.name===command.name).id);
 }
 const {parseCadProject,serializeCadProject}=await import('../src/cad-project.js');
 const input=serializeCadProject(fixture);
 fixture=parseCadProject(input);
 fs.writeFileSync(path.join(directory,'fixture.ocad'),input);
 const fixtureSha256=createHash('sha256').update(input).digest('hex');
 const {runPracticeLive,practiceComparisonPolicy}=require('./practice-vibe-verification.cjs');
 const quality=variant==='motion'?practiceComparisonPolicy([
  {id:'rotation',source:'Vorgegebene volle Umdrehung',check:{kind:'jointValue',target:'$existing-2',jointKind:'revolute',expected:360,tolerance:.001}},
  {id:'advance',source:'Vorhandener Schraubtrieb mit 4 mm Steigung',check:{kind:'jointValue',target:'$existing-3',jointKind:'prismatic',expected:4,tolerance:.001}},
  {id:'slide-size',source:'Unveränderte Abmessungen des Schlittens',check:{kind:'size',target:'$existing-3',space:'worldAxes',expected:[12,18,8],tolerance:.001}}
 ],['rotation','advance']):undefined;
 const envelope={plan:{version:1,title:'Sichtbare Werkzeugübung '+variant,actions},quality,
  projectCopy:{revision:before.state.revision,project:fixture,selection:ids.map(rootId=>({rootId,path:[]}))}};
 let expectedParent=before,result;
 if(live){
  await js(`(async()=>{
   const a=window.__cadTest;a.clearPreview();await a.controller.open(${JSON.stringify(fixture)});await a.settled();
   a.select(${JSON.stringify(envelope.projectCopy.selection)});
  })()`);
  expectedParent=await js(parentSnapshot);
  result=await runPracticeLive({js,directory,prompt:toolPrompts[variant],quality});
 }else result=await js(`window.offlinecadDesktop.startPractice(${JSON.stringify(envelope)})`);
 fs.writeFileSync(path.join(directory,'tool-steps.json'),JSON.stringify(result,null,2));
 assert.equal(result.ok,true,result.reason);
 if(!live)assert.equal(result.steps.length,actions.length);
 if(quality&&!live)assert(result.report.quality?.items.every(item=>item.status==='passed'),'Every fixed motion criterion must run and pass');
 const project=await js(`window.offlinecadDesktop.practiceProjectResult({action:'read',id:${JSON.stringify(result.resultRef)}})`);
 const scene=await js(`window.__cadTest.controller.describe(${JSON.stringify(project)})`);
 const baselineScene=await js(`window.__cadTest.controller.describe(${JSON.stringify(fixture)})`);
 const node=(id,value=project)=>value.nodes.find(part=>part.id===id);
 const bounds=(id,value=scene)=>value.objects.find(part=>part.id===id).worldBounds;
 const id=ids[0],added=project.nodes.filter(part=>!node(part.id,fixture));
 const actual=node(id)??(variant==='holder'&&added.length===1?added[0]:null),prior=node(id,fixture);
 assert(actual,'Expected a resulting native body');
 const b=bounds(actual.id),initial=bounds(id,baselineScene);
 assert.deepEqual(project.nodes.filter(part=>node(part.id,fixture)&&!ids.includes(part.id)),fixture.nodes.filter(part=>!ids.includes(part.id)));
 let measurements;
 if(variant==='holder'){
  assert.equal(project.nodes.length,2);
  assert.equal(actual.stats.solids,1);
  sameVector(b.size,[40,20,8]);
  const face=result.steps.find(step=>step.kind==='face');
  sameVector(face.point,[35,0,4]);
  sameVector(face.normal,[0,0,1]);
  measurements=await measureHolder(actual);
 }else if(variant==='shell'){
  assert.equal(actual.modeling.kind,'shell');
  assert.equal(actual.stats.solids,1);
  assert.equal(added.length,0);
  assert(result.steps.some(step=>step.kind==='face'&&step.normal[2]>.99999));
  sameVector(b.size,[30,24,14]);
  close(actual.stats.volume,30*24*14-24*18*11);
  measurements={size:b.size,volume:actual.stats.volume,wallSamples:await measureShell(actual,b)};
 }else if(variant==='align'){
  const initialBounds=ids.map(part=>bounds(part,baselineScene));
  const commonCenter=(Math.min(...initialBounds.map(box=>box.min[0]))+Math.max(...initialBounds.map(box=>box.max[0])))/2;
  assert.equal(added.length,0);
  ids.forEach((part,index)=>{
   const after=bounds(part),start=initialBounds[index];
   close(after.center[0],commonCenter);
   sameVector(after.center.slice(1),start.center.slice(1));
   sameVector(after.size,start.size);
  });
  measurements={centers:ids.map(part=>bounds(part).center),commonCenter};
 }else if(variant==='mirror'){
  assert.equal(added.length,0);
  sameVector(b.size,initial.size);
  sameVector(b.center,initial.center);
  close(actual.stats.volume,prior.stats.volume);
  const measure=(project,bounds)=>js(`(async()=>{
   const controller=window.__cadTest.controller,preview=await controller.restoreAITaskCandidate(${JSON.stringify(project)});
   const [x,y,z]=${JSON.stringify(bounds.center)};
   try{
    const test=offset=>controller.checkPreview(preview.previewId,[{kind:'clearance',target:${JSON.stringify(id)},
     from:[x+offset,y,z-5],to:[x+offset,y,z+5],diameter:3.99,tolerance:.001}],{collectFailures:true});
    return [(await test(7)).passed,(await test(-7)).passed];
   }finally{controller.discard(preview.previewId);}
  })()`);
  measurements={prior:await measure(fixture,initial),mirrored:await measure(project,b)};
  assert.deepEqual(measurements,{prior:[true,false],mirrored:[false,true]});
 }else if(variant==='pattern'){
  assert.equal(added.length,3);
  assert.deepEqual(actual,prior);
  const ordered=[...added].sort((a,b)=>bounds(a.id).center[0]-bounds(b.id).center[0]);
  const centers=ordered.map(part=>bounds(part.id).center);
  centers.forEach((center,index)=>sameVector(center,[initial.center[0]+18*(index+1),...initial.center.slice(1)]));
  ordered.forEach(part=>{
   sameVector(bounds(part.id).size,initial.size);
   close(part.stats.volume,prior.stats.volume);
  });
  measurements={original:initial.center,centers};
 }else{
  assert.equal(added.length,0);
  assert.equal(result.report.driveCount,1);
  assert.deepEqual(project.joints.drives,fixture.joints.drives);
  const getValues=step=>Object.fromEntries(step.jointValues.map(({id,value})=>[id,value]));
  const motionSteps=(live?result.attempts.flatMap(attempt=>attempt.steps??[]):result.steps)
   .flatMap(step=>step.motionStates??(step.jointValues?[step]:[]));
  const intermediate=motionSteps.map(getValues).find(value=>value.rotary===90),final=getValues(motionSteps.at(-1));
  assert.deepEqual(intermediate,{rotary:90,linear:1});
  assert.deepEqual(final,{rotary:360,linear:4});
  if(motionBatch)assert.deepEqual(motionSteps.map(step=>step.persisted),[false,true]);
  assert.deepEqual(project.joints.joints.map(({id,value})=>({id,value})),[{id:'rotary',value:360},{id:'linear',value:4}]);
  assert.deepEqual(project.joints.joints.map(({value,...joint})=>joint),fixture.joints.joints.map(({value,...joint})=>joint));
  assert.deepEqual(actual,prior);
  const spindle=node('spindle').transform,slide=node('slide').transform;
  sameVector(spindle,node('spindle',fixture).transform);
  const displacement=slide.slice(12,15).map((value,index)=>value-node('slide',fixture).transform[index+12]);
  sameVector(displacement,[4,0,0]);
  measurements={drive:project.joints.drives[0],intermediate,final,displacement};
 }
 const after=await js(parentSnapshot);
 for(const key of ['serialized','previewId'])assert.equal(after[key],expectedParent[key],key);
 for(const key of ['selection','visiblePreviewRoots'])assert.deepEqual(after[key],expectedParent[key],key);
 for(const key of ['undo','redo','previews','revision'])assert.equal(after.state[key],expectedParent.state[key],key);
 checks.push('Visible Formnaro actions are completed in the separate window',
  'Independent native measurement confirms the expected geometry or motion and the main project stays unchanged');
 const output=serializeCadProject(project);
 parseCadProject(output);
 fs.writeFileSync(path.join(directory,'verified.ocad'),output);
 return {ok:true,variant,checks,measurements,fixtureSha256,...(result.report.quality?{quality:result.report.quality}:{})};
};

exports.verifyHolderChat=async function verifyHolderChat({js,directory,checks,live=false}){
 const verifyPersistence=process.env.FORMNARO_VERIFY_PRACTICE_ROUNDTRIP==='1';
 const fixtureBytes=fs.readFileSync(process.env.FORMNARO_VERIFY_PRACTICE_HOLDER_FIXTURE);
 const fixture=JSON.parse(fixtureBytes.toString('utf8')),fixtureSha256=createHash('sha256').update(fixtureBytes).digest('hex');
 const right=fixture.nodes.find(node=>node.transform[12]>0),left=fixture.nodes.find(node=>node.transform[12]<0);
 const {practiceLiveConfig,recordPracticeProvider,practiceComparisonPolicy}=require('./practice-vibe-verification.cjs');
 const config=live?practiceLiveConfig():{protocol:'chat',agentSteps:7,rememberKey:false,bridgeEnabled:false,
  baseUrl:'http://127.0.0.1:9197/v1',model:'local-holder-fixture'};
 const quality=live?practiceComparisonPolicy([
  {id:'bore',source:'Referenzbohrung von Z4 bis Z−1 am oberen Flächenmittelpunkt',check:{kind:'bore',target:'$new',from:[35,0,4],to:[35,0,-1],diameter:4,minWall:.1,tolerance:.001}},
  {id:'solids',source:'Ein Volumenkörper am rechten Halter',check:{kind:'solids',target:'$new',expected:1}},
  {id:'volume',source:'Analytisches Haltervolumen nach der Bohrung',check:{kind:'volume',target:'$new',expected:40*20*8-Math.PI*4*5,tolerance:.001}}
 ],['bore']):undefined;
 await js(`(async()=>{
  const a=window.__cadTest;
  a.clearPreview();
  await a.controller.open(${JSON.stringify(fixture)});
  await a.settled();
  a.select([{rootId:${JSON.stringify(right.id)},path:[]}]);
  a.view.setView('top');
  ${quality?`a.setPracticeQuality(${JSON.stringify(quality)});`:''}
  const saved=await window.offlinecadDesktop.saveAISettings({config:${JSON.stringify(config)},key:${JSON.stringify(live?'':'local-fixture')}});
  if(${live}&&saved.authMode==='api-key'&&!saved.hasKey)throw Error('The existing DeepSeek credential could not be used in the isolated test.');
 })()`);
 const snapshot="(()=>{const a=window.__cadTest;return {revision:a.controller.revision(),undo:a.undoDepth(),serialized:a.serialize()};})()";
 const original=await js(snapshot),originalFetch=global.fetch;
 let requestCount=0,fixtureFailure,adopted,forwarded;
 if(!live)global.fetch=async(url,options)=>{
  try{
   assert.equal(new URL(url).host,'127.0.0.1:9197');
   const reply=value=>new Response(JSON.stringify(value));
   if(String(url).endsWith('/models'))return reply({data:[{id:config.model,input_modalities:['text','image']}]});
   const wire=JSON.parse(options.body),system=wire.messages[0].content;
   let answer;
   switch(++requestCount){
    case 1:
     assert.match(system,/"alias":"existing-1","name":"Halter"/);
     assert(!JSON.stringify(wire).includes(right.id)&&!JSON.stringify(wire).includes(left.id));
     answer={revision:original.revision,assistant:{kind:'practice',plan:{version:1,title:'Rechtes Sackloch',actions:settings.holder.actions}},
      message:'Bohrung im Übungsfenster vorgeführt.'};
     break;
    case 2:
     assert.match(system,/"actions":\[[^\]]*"confirmed"/);
     answer={revision:adopted.revision,view:'confirmed'};
     break;
    case 3:{
     const match=system.match(/"viewFeedback":(\{[^{}]+\})/);
     assert(match,'The confirmed image needs its own transport metadata');
     const provenance=JSON.parse(match[1]);
     assert.deepEqual(provenance,{action:'confirmed',status:'completed',source:'confirmed-model',revision:adopted.revision,applied:true});
     const image=wire.messages.at(-1).content.find(part=>part.type==='image_url'&&part.image_url.url.startsWith('data:image/png;base64,'));
     assert(image,'The real confirmed-model PNG reaches the provider');
     forwarded=image.image_url.url.split(',')[1];
     const png=Buffer.from(forwarded,'base64');
     assert(png.length>2000&&png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
     fs.writeFileSync(path.join(directory,'confirmed-model.png'),png);
     fs.writeFileSync(path.join(directory,'confirmed-provenance.json'),JSON.stringify(provenance,null,2));
     answer={message:'Bild des bestätigten Halters erhalten.'};
     break;
    }
    default:throw Error('Unexpected additional provider round');
   }
   return reply({choices:[{message:{content:JSON.stringify(answer)}}]});
  }catch(error){fixtureFailure=error;throw error;}
 };
 async function until(expression,{stopOnChatIdle=false}={}){
  const deadline=Date.now()+(live?300000:120000);
  let sawBusy=false;
  while(!await js(expression)){
   if(fixtureFailure)throw fixtureFailure;
   if(stopOnChatIdle){
    const busy=await js('window.__cadTest.aiUI.isBusy()');
    if(sawBusy&&!busy&&!await js(expression))throw Error(await js("document.getElementById('ai-chat-status').textContent")||expression);
    sawBusy ||= busy;
   }
   if(Date.now()>deadline){
    const status=await js("document.getElementById('ai-chat-status').textContent");
    throw Object.assign(Error('Zeitlimit des Haltertests erreicht.'+(status?' Letzter Status: '+status:'')),{code:'PRACTICE_VERIFICATION_TIMEOUT'});
   }
   await new Promise(resolve=>setTimeout(resolve,100));
  }
 }
 const send=(prompt,practice=false)=>js(`(()=>{
  document.getElementById('ai-chat-practice-from-project').checked=${practice};
  document.getElementById('ai-chat-prompt').value=${JSON.stringify(prompt)};
  document.getElementById('ai-chat-form').requestSubmit();
 })()`);
 const provider=live?recordPracticeProvider(directory):null;
 try{
  if(live)await js(`(()=>{
   const assistant=window.__cadTest.programAssistant,execute=assistant.execute,accept=assistant.acceptPractice;
   window.__holderPracticeSteps=[];
   assistant.execute=async function(step,options){
    const entry={kind:step.kind,actions:step.plan?.actions,startedMs:performance.now()};window.__holderPracticeSteps.push(entry);
    try{
     const result=await execute.call(this,step,options);
     entry.report=result?.report;entry.ok=result?.ok;entry.reason=result?.reason;entry.hasResult=!!result?.resultRef;
     if(result?.image){
      const bytes=Uint8Array.from(atob(result.image),c=>c.charCodeAt(0));
      const hash=await crypto.subtle.digest('SHA-256',bytes);
      entry.imageSha256=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
     }
     return result;
    }finally{
     entry.elapsedMs=Math.round(performance.now()-entry.startedMs);
    }
   };
   assistant.acceptPractice=async function(...args){
    const result=await accept.apply(this,args);
    window.__holderPracticeSteps.push({kind:'accept-advisory',report:result?.report,ok:result?.ok,hasResult:!!result?.resultRef});
    return result;
   };
  })()`);
  await js('window.__cadTest.aiUI.chat.refreshModels()');
  await until("!document.getElementById('ai-chat-send').disabled");
  await send(live?'Zeig mir nur am rechten Halter eine Sacklochbohrung Ø4, 5 mm tief, von oben im Mittelpunkt seiner oberen Fläche.':'Zeig mir nur am rechten Halter eine Sacklochbohrung Ø4, 5 mm tief.',true);
  await until("!!document.getElementById('ai-chat-practice-review')&&!window.__cadTest.aiUI.isBusy()",{stopOnChatIdle:live});
  assert.deepEqual(await js(snapshot),original);
  await js("document.getElementById('ai-chat-practice-review').click()");
  await until("!!window.__cadTest.activePreview()&&!window.__cadTest.aiUI.isBusy()");
  const preview=await js('window.__cadTest.activePreview()');
  const candidateNodes=await js(`window.__cadTest.controller.getPreview(${JSON.stringify(preview.previewId)}).project.nodes`);
  assert.equal(candidateNodes.length,fixture.nodes.length);
  const candidateGeometry=await measureHolder(candidateNodes.find(node=>node.id!==left.id));
  const previewImage=await js(`window.__cadTest.access.dispatch('screenshot',${JSON.stringify(preview)})`);
  assert.equal(previewImage.applied,false);
  assert.equal(previewImage.revision,original.revision);
  fs.writeFileSync(path.join(directory,'preview.png'),Buffer.from(previewImage.dataBase64,'base64'));
  assert.equal(await js(`window.__cadTest.access.confirmedScreenshot(${JSON.stringify(original.revision)}).catch(error=>error.code)`),'BUSY');
  assert.deepEqual(await js(snapshot),original);
  await js("document.getElementById('cad-ai-preview-apply').click()");
  await until("document.getElementById('cad-ai-preview-banner').hidden&&!window.__cadTest.aiUI.isBusy()");
  adopted=await js(snapshot);
  assert.notEqual(adopted.revision,original.revision);
  assert.equal(adopted.undo,original.undo+1);
  const project=JSON.parse(adopted.serialized);
  assert.equal(project.nodes.length,fixture.nodes.length);
  assert.deepEqual(project.nodes.find(node=>node.id===left.id),JSON.parse(original.serialized).nodes.find(node=>node.id===left.id));
  const geometry=await measureHolder(project.nodes.find(node=>node.id!==left.id));
  assert.deepEqual(geometry,candidateGeometry);
  assert.equal(await js(`window.__cadTest.access.dispatch('screenshot',${JSON.stringify(preview)}).catch(error=>error.code)`),'STALE_REVISION');
  fs.writeFileSync(path.join(directory,'adopted-geometry.json'),JSON.stringify({
   revision:adopted.revision,fixtureSha256,geometry,leftUnchanged:true,undoSteps:adopted.undo-original.undo,
   previewInvalidated:true
  },null,2));
  await js(`(()=>{
   const a=window.__cadTest,capture=a.access.confirmedScreenshot;
   a.access.confirmedScreenshot=async revision=>{
    const image=await capture(revision),rect=a.view.canvas.getBoundingClientRect();
    const locate=x=>{
     const center=a.projectPoint([x,0,4]),edge=a.projectPoint([x+3,0,4]);
     return {x:(center.x-rect.left)/rect.width,y:(center.y-rect.top)/rect.height,r:Math.abs(edge.x-center.x)/rect.width};
    };
    window.__holderImageProof={image,spots:[locate(-35),locate(35)]};
    return image;
   };
  })()`);
  const firstImageRound=provider?.rounds.length??0;
  await send(live?'Rufe mit der Ansichtsanfrage confirmed ein Bild des bestätigten Modells nach der Übernahme ab. Ist die Sacklochbohrung links oder rechts im erhaltenen Bild? Verwende BOHRUNG_LINKS oder BOHRUNG_RECHTS.':'Zeig und prüfe das übernommene Ergebnis anhand eines Bilds vom bestätigten Modell.');
  if(live){
   await until("!window.__cadTest.aiUI.isBusy()&&!!window.__holderImageProof",{stopOnChatIdle:true});
   const imageRounds=provider.rounds.slice(firstImageRound),captured=(await js('window.__holderImageProof')).image;
   const captureHash=createHash('sha256').update(Buffer.from(captured.dataBase64,'base64')).digest('hex');
   const carrier=imageRounds.find(round=>round.images.some(image=>image.sha256===captureHash));
   assert(carrier,'The actual confirmed-model PNG reached the provider transport');
   const answer=imageRounds.at(-1)?.response??'';
   assert.match(answer,/BOHRUNG_RECHTS/);assert.doesNotMatch(answer,/BOHRUNG_LINKS/);
   assert(provider.valid(),'The transport trace verifies the requested model and High setting');
   const childImages=await js('window.__holderPracticeSteps.flatMap(step=>step.imageSha256?[step.imageSha256]:[])');
   assert(childImages.every(hash=>provider.rounds.slice(0,firstImageRound).some(round=>round.images.some(image=>image.sha256===hash))),'Each actual correction image reached the provider transport');
   forwarded=captured.dataBase64;
   fs.writeFileSync(path.join(directory,'confirmed-model.png'),Buffer.from(forwarded,'base64'));
   fs.writeFileSync(path.join(directory,'confirmed-provenance.json'),JSON.stringify({source:'confirmed-model',revision:captured.revision,applied:captured.applied,round:carrier.round},null,2));
  }else{
   await until("!window.__cadTest.aiUI.isBusy()&&document.getElementById('ai-chat-log').textContent.includes('Bild des bestätigten Halters erhalten.')");
   assert.equal(requestCount,3);
  }
  const {image:actual,spots}=await js('window.__holderImageProof');
  const hash=value=>createHash('sha256').update(Buffer.from(value,'base64')).digest('hex');
  const imageSha256=hash(forwarded);
  assert.equal(hash(actual.dataBase64),imageSha256,'Provider received the bytes of this exact capture');
  assert.notEqual(hash(previewImage.dataBase64),imageSha256);
  const {nativeImage}=require('electron'),png=nativeImage.createFromBuffer(Buffer.from(forwarded,'base64'));
  const {width,height}=png.getSize(),pixels=png.toBitmap();
  const contrast=spot=>{
   const cx=Math.round(spot.x*width),cy=Math.round(spot.y*height),r=Math.max(2,Math.round(spot.r*width));
   assert(cx-r>=0&&cx+r<width&&cy-r>=0&&cy+r<height,'Holder center is visible');
   let min=255,max=0;
   for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++){
    const i=(y*width+x)*4,value=(pixels[i]+pixels[i+1]+pixels[i+2])/3;
    min=Math.min(min,value);max=Math.max(max,value);
   }
   return max-min;
  };
  const [leftContrast,rightContrast]=spots.map(contrast);
  assert(rightContrast>leftContrast+10,`Only the right image region has a bore outline (left ${leftContrast}, right ${rightContrast})`);
  assert.deepEqual(await js(snapshot),adopted);
  fs.writeFileSync(path.join(directory,'verified.ocad'),adopted.serialized);
  let persistence;
  if(verifyPersistence){
   await js('window.__cadTest.actions.undo()');
   assert.deepEqual(await js(snapshot),original);
   await js('window.__cadTest.actions.redo()');
   assert.deepEqual(await js(snapshot),adopted);
   await js('window.__cadTest.settled()');
   const saved=await js(`window.__cadTest.save({automation:true,expectedRevision:window.__cadTest.controller.revision(),filename:'adopted-holder.ocad',format:'ocad'})`);
   assert(saved.saved);
   const bytes=fs.readFileSync(saved.file.path);
   await js(`window.__cadTest.openFile(new File([${JSON.stringify(bytes.toString('utf8'))}],'adopted-holder.ocad'))`);
   await js('window.__cadTest.settled()');
   const reopened=await js(snapshot);
   assert.equal(reopened.serialized,adopted.serialized);
   const reopenedProject=JSON.parse(reopened.serialized);
   assert.deepEqual(await measureHolder(reopenedProject.nodes.find(node=>node.id!==left.id)),geometry);
   persistence={undo:true,redo:true,reopened:true,savedSha256:createHash('sha256').update(bytes).digest('hex')};
   checks.push('Undo restores the full original, Redo restores the approved change and the saved, reopened project retains the measured bore');
  }
  checks.push('The normal chat visibly drills the copied right holder and explicit adoption creates one undo step',
   'The preview image is separate and its old reference is rejected after adoption',
   'The provider receives the exact actual confirmed viewport PNG and the new model revision');
  return {ok:true,checks,geometry,requests:provider?.rounds.length??requestCount,revision:adopted.revision,imageSha256,leftContrast,rightContrast,fixtureSha256,
   ...(persistence?{persistence}:{}),
   ...(quality?{quality:await js('window.__holderPracticeSteps.map(step=>step.report?.quality).filter(Boolean).at(-1)')}:{}),
   ...(live?{provider:config.authMode==='mistral-vibe'?'mistral-vibe':'deepseek-api',model:config.model,
    requestedEffort:config.mistralReasoningEffort??config.reasoningEffort}:{} )};
 }finally{
  global.fetch=originalFetch;
  if(live){
   provider.stop();
   const ui=await js(`({steps:window.__holderPracticeSteps,chat:document.getElementById('ai-chat-log').innerText,status:document.getElementById('ai-chat-status').textContent,usage:document.getElementById('ai-chat-usage').textContent,observedAtMs:performance.now()})`).catch(()=>null);
   fs.writeFileSync(path.join(directory,'live-ui.json'),JSON.stringify(ui,null,2));
  }
 }
};
