const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const helper=require('../backend/practice-files-verification.cjs');
const mainSource=fs.readFileSync(path.join(__dirname,'..','backend','practice-verification.cjs'),'utf8');
const helperSource=fs.readFileSync(path.join(__dirname,'..','backend','practice-files-verification.cjs'),'utf8');
const ROOT='parent-root-1',REV=7,PRIVATE_STL='solid isolated-mesh-marker\nendsolid isolated-mesh-marker\n';
const PRIVATE_STL_BASE64=Buffer.from(PRIVATE_STL).toString('base64');
const FIRST_CHECKS=[
 'Normal chat stages explicit photo and STL files and starts the isolated practice',
 'Simulated provider receives the photo and both descriptors, with no STL payload or parent IDs'
];
const ADOPTION_CHECKS=[
 'Adoption preview identifies photos and preserves the parent until confirmed',
 'One Undo step transfers the original photo and calibration, and Redo restores it'
];
const EXPECTED_CHECKS={
 '1':[...FIRST_CHECKS,'Child opens the real photo dialog and closes it without saving'],
 adopt:[...FIRST_CHECKS,'Photo saved in the child with no body selected in the parent',...ADOPTION_CHECKS],
 recover:[...FIRST_CHECKS,'Photo saved in the child with no body selected in the parent',
  'Failed photo save reports actual fields and a JPEG from the retained child window',
  'Second provider plan uses the still-open dialog and existing alias without repeating successful actions',
  ...ADOPTION_CHECKS]
};
const click=id=>({kind:'ui',action:'click',target:'ui:id:'+id});
const set=(id,value)=>({kind:'ui',action:'set',target:'ui:id:'+id,value:String(value)});
const point=(x,y)=>[set('photo-point-x',x),set('photo-point-y',y),click('photo-add-point')];
const calibrate=[set('photo-mm',50),...point(4,4),...point(24,4),click('photo-save')];
const EXPECTED_ACTIONS={
 '1':[[click('practice-file-1'),click('photo-cancel')]],
 adopt:[[click('practice-file-1'),...calibrate]],
 recover:[[{kind:'shape',type:'box',as:'work'},click('practice-file-1'),click('photo-save')],
  [...calibrate,{kind:'select',targets:['work']},{kind:'set',field:'size-0',value:44}]]
};

const CRC_TABLE=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer)crc=CRC_TABLE[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function pngChunk(type,data){
 const typeBytes=Buffer.from(type,'latin1'),length=Buffer.alloc(4),crc=Buffer.alloc(4);
 length.writeUInt32BE(data.length,0);crc.writeUInt32BE(crc32(Buffer.concat([typeBytes,data])),0);
 return Buffer.concat([length,typeBytes,data,crc]);
}
function createPhotoPng(){
 const width=40,height=30,header=Buffer.alloc(13);
 header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;header[10]=0;header[11]=0;header[12]=0;
 const raw=Buffer.alloc(height*(1+width*3));
 for(let y=0;y<height;y++){
  const row=y*(1+width*3);raw[row]=0;
  for(let x=0;x<width;x++){const at=row+1+x*3;raw[at]=x*6%256;raw[at+1]=y*8%256;raw[at+2]=(x+y)%256;}
 }
 return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),pngChunk('IHDR',header),pngChunk('IDAT',zlib.deflateSync(raw)),pngChunk('IEND',Buffer.alloc(0))]);
}
const PNG_BYTES=createPhotoPng();
const PNG='data:image/png;base64,'+PNG_BYTES.toString('base64');
const JPEG_BASE64=Buffer.concat([Buffer.from([0xff,0xd8]),Buffer.alloc(2098,0x11)]).toString('base64');
const JPEG_URL='data:image/jpeg;base64,'+JPEG_BASE64;

function temporary(t,prefix){
 let root;
 try{root=fs.mkdtempSync(path.join(os.tmpdir(),prefix));}
 catch(error){
  if(!['EPERM','EACCES','ENOENT'].includes(error.code))throw error;
  const fallback=path.join(__dirname,'..','work','tmp');
  fs.mkdirSync(fallback,{recursive:true});
  root=fs.mkdtempSync(path.join(fallback,prefix));
 }
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 return root;
}

function setEnv(t,name,value){
 const previous=process.env[name];
 if(value===undefined)delete process.env[name];else process.env[name]=value;
 t.after(()=>{if(previous===undefined)delete process.env[name];else process.env[name]=previous;});
}

function guardFetch(t){
 const hostFetch=global.fetch;
 const unexpectedFetch=async()=>{throw Error('Unexpected host fetch in a Files-Chat verifier test');};
 global.fetch=unexpectedFetch;
 t.after(()=>{global.fetch=hostFetch;});
 return unexpectedFetch;
}

function clone(value){return JSON.parse(JSON.stringify(value));}

function snapshot(){
 return {
  serialized:JSON.stringify({nodes:[{id:ROOT,type:'box',size:[40,30,6]},{id:'neighbour-root-1',type:'cylinder',size:[1,2,3]}]}),
  state:{undo:3,redo:0,previews:2,revision:REV},
  selection:[{rootId:ROOT,path:[]}],
  previewId:'preview-parent-1',
  visiblePreviewRoots:[{id:'preview-node-1',geometry:'geometry-1',root:null}]
 };
}

async function invoke(args){
 const fetchBefore=global.fetch;
 let result,error;
 try{result=await helper.verifyPracticeFilesChat(args);}
 catch(caught){error=caught;}
 return {result,error,fetchBefore,fetchAfter:global.fetch};
}

function localHarness({variant,before,fail}){
 const recovery=variant==='recover';
 const practiceFiles=[{target:'ui:id:practice-file-1',name:'Foto.png',kind:'photo'},{target:'ui:id:practice-file-2',name:'Netz.stl',kind:'stl'}];
 const observations={scripts:[],requests:0,models:0,modelUrls:[],chats:[],replies:[],completionStates:[],stagedSnapshots:[],
  fileListCounts:[],snapshotCalls:0,snapshots:[],serializeCalls:[],undoDepths:[],reviewScripts:0,applyScripts:0,
  undoActions:0,redoActions:0,describes:0,describeResult:null,appliedSerialized:null,staged:false,completed:false};
 let config,applied=false,undoTaken=false,reviewOpen=false;
 const serialize=()=>!applied?before.serialized:(undoTaken?before.serialized:observations.appliedSerialized);
 const undoDepth=()=>!applied?before.state.undo:(undoTaken?before.state.undo:before.state.undo+1);
 const completes=actions=>{
  const save=actions.some(action=>action.kind==='ui'&&action.action==='click'&&action.target==='ui:id:photo-save');
  const measurement=actions.some(action=>action.kind==='ui'&&action.action==='set'&&action.target==='ui:id:photo-mm');
  return !save||measurement;
 };
 const send=async body=>{
  const url=config.baseUrl+'/chat/completions';
  const response=await global.fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const {choices}=await response.json();
  const reply=JSON.parse(choices[0].message.content);
  observations.requests++;observations.chats.push({url,body});observations.replies.push(reply);
  return reply;
 };
 const apply=()=>{
  const originals=JSON.parse(before.serialized).nodes,added={id:'practice-work-1',type:'box',size:[44,10,20]};
  observations.appliedSerialized=JSON.stringify({nodes:recovery?[...originals,added]:originals,
   photos:{items:[{image:{dataUrl:PNG},reference:{scale:{points:[[4,4],[24,4]]}}}]}});
  applied=true;undoTaken=false;reviewOpen=false;
 };
 const js=async script=>{
  observations.scripts.push(script);
  if(script.includes("createElement('canvas')"))return PNG;
  if(script.startsWith('window.offlinecadDesktop.saveAISettings({config:')){
   const prefix='window.offlinecadDesktop.saveAISettings({config:';
   config=JSON.parse(script.slice(prefix.length,script.lastIndexOf(",key:'local-fixture'})")));
   assert.equal(config.baseUrl,'http://127.0.0.1:9197/v1');
   assert.equal(config.model,'local-practice-fixture');
   return undefined;
  }
  if(script==='window.__cadTest.aiUI.chat.refreshModels()'){
   observations.models++;
   const url=config.baseUrl+'/models';observations.modelUrls.push(url);
   const response=await global.fetch(url);
   assert.deepEqual(await response.json(),{data:[{id:config.model,input_modalities:['text','image']}]});
   return undefined;
  }
  if(script.includes('ai-chat-practice-file-input')){
   observations.staged=true;observations.stagedSnapshots.push(true);
   assert(script.includes(PNG.split(',')[1]),'the staging program embeds the exact selected photo PNG');
   assert(script.includes('Foto.png'));
   assert(script.includes('Netz.stl'));
   return undefined;
  }
  if(script.includes('ai-chat-practice-from-project')){
   const missingPhotoDescriptor=fail==='missing-photo-descriptor';
   const system=JSON.stringify({practiceFiles:missingPhotoDescriptor?[{target:'ui:id:practice-file-2',name:'Netz.stl',kind:'stl'}]:practiceFiles,revision:before.state.revision});
   const firstReply=await send({model:config.model,stream:false,messages:[{role:'system',content:system},
    {role:'user',content:[{type:'text',text:'Zeig mir das Foto im Übungsfenster.'},{type:'image_url',image_url:{url:PNG}}]}]});
   const actions=firstReply.assistant.plan.actions;
   const done=completes(actions)&&String(firstReply.message??'').includes('Dateiübung abgeschlossen.');
   observations.completionStates.push(done);
   if(done){observations.staged=false;observations.completed=true;return undefined;}
   const failed=actions.find(action=>action.kind==='ui'&&action.action==='click'&&action.target==='ui:id:photo-save');
   const correction={kind:'practice-correction',failedAction:{index:3,kind:'ui',target:failed?failed.target:'ui:id:photo-save'},
    confirmedCount:2,exerciseRevision:'0123456789abcdef',fields:[{target:'ui:id:photo-point-x',value:'4'},{target:'ui:id:photo-point-y',value:'4'}],modelImage:'attached'};
   const continuationSystem=JSON.stringify({practiceFiles,selectable:['work'],revision:before.state.revision});
   const continuationReply=await send({model:config.model,stream:false,messages:[{role:'system',content:continuationSystem},
    {role:'user',content:[{type:'text',text:JSON.stringify(correction)},{type:'image_url',image_url:{url:PNG}},{type:'image_url',image_url:{url:JPEG_URL}}]}]});
   const continuationActions=continuationReply.assistant.plan.actions;
   const continuationDone=completes(continuationActions)&&String(continuationReply.message??'').includes('Dateiübung abgeschlossen.');
   observations.completionStates.push(continuationDone);
   if(continuationDone){observations.staged=false;observations.completed=true;}
   return undefined;
  }
  if(script.includes("document.querySelectorAll('#ai-chat-practice-file-list button').length===2")){
   if(fail==='adapter')throw Error('File list adapter failed');
   return observations.staged;
  }
  if(script.includes("document.querySelectorAll('#ai-chat-practice-file-list button').length")){
   const count=observations.staged?2:0;observations.fileListCounts.push(count);return count;
  }
  if(script.includes("document.getElementById('ai-chat-log').textContent.includes('Dateiübung abgeschlossen.')"))return observations.completed;
  if(script==='PARENT_SNAPSHOT'){
   observations.snapshotCalls++;
   if(fail==='parent-changed'){
    const changed=clone(before);changed.serialized=JSON.stringify({nodes:[{id:ROOT,type:'box',size:[41,30,6]}]});
    observations.snapshots.push(changed);return changed;
   }
   const after=clone(before);observations.snapshots.push(after);return after;
  }
  if(script.includes('ai-chat-practice-review')){observations.reviewScripts++;reviewOpen=true;return undefined;}
  if(script.includes("document.getElementById('cad-ai-preview-banner').hidden"))return script.startsWith('!')?reviewOpen:!reviewOpen;
  if(script.includes("document.getElementById('ai-chat-proposal').textContent"))return 'Geändert · Fotos';
  if(script==='window.__cadTest.serialize()'){const value=serialize();observations.serializeCalls.push(value);return value;}
  if(script==='window.__cadTest.undoDepth()'){const value=undoDepth();observations.undoDepths.push(value);return value;}
  if(script.includes('cad-ai-preview-apply')){observations.applyScripts++;apply();return undefined;}
  if(script==='window.__cadTest.controller.describe()'){
   observations.describes++;
   const originals=JSON.parse(before.serialized).nodes;
   observations.describeResult={objects:[...originals.map(node=>({id:node.id,worldBounds:{size:node.size}})),
    {id:'practice-work-1',worldBounds:{size:[44,10,20]}}]};
   return observations.describeResult;
  }
  if(script==='window.__cadTest.actions.undo()'){observations.undoActions++;undoTaken=true;assert.equal(undoDepth(),before.state.undo);return undefined;}
  if(script==='window.__cadTest.actions.redo()'){observations.redoActions++;undoTaken=false;assert.equal(undoDepth(),before.state.undo+1);return undefined;}
  if(script.includes("document.getElementById('ai-chat-status')"))return '';
  throw Error('Unexpected renderer script in the local files fixture: '+script);
 };
 return {js,observations};
}

async function runFixture(t,variant,options={}){
 const directory=temporary(t,'formnaro-files-'+variant+'-');
 const before=snapshot(),checks=[];
 const harness=localHarness({variant,before,fail:options.fail});
 const outcome=await invoke({js:harness.js,directory,checks,before,parentSnapshot:'PARENT_SNAPSHOT',variant});
 return {directory,before,checks,outcome,observations:harness.observations};
}

function assertRendererPrograms(observations,{review}){
 for(const script of observations.scripts){
  if(script==='PARENT_SNAPSHOT')continue;
  assert.doesNotThrow(()=>new vm.Script(script),'renderer program compiles: '+script);
 }
 assert(observations.scripts.some(script=>script.includes('ai-chat-practice-file-input')),'the staging program was executed');
 assert(observations.scripts.some(script=>script.includes('ai-chat-practice-from-project')),'the submit program was executed');
 if(review){
  assert(observations.scripts.some(script=>script.includes('ai-chat-practice-review')),'the review program was executed');
  assert(observations.scripts.some(script=>script.includes('cad-ai-preview-apply')),'the apply program was executed');
 }
}

test('The extracted files helper exports exactly the one-argument entry point and imports only node builtins',()=>{
 assert.deepEqual(Object.keys(helper),['verifyPracticeFilesChat']);
 assert.equal(typeof helper.verifyPracticeFilesChat,'function');
 assert.equal(helper.verifyPracticeFilesChat.length,1);
 assert(helperSource.includes('async function verifyPracticeFilesChat({js,directory,checks,before,parentSnapshot,variant}){'));
 assert.equal(helperSource.includes('process.env.FORMNARO_VERIFY_PRACTICE_FILES_CHAT'),false,'the helper takes the effective variant as an argument');
 assert.deepEqual([...helperSource.matchAll(/require\((['"])([^'"]+)\1\)/g)].map(match=>match[2]),['node:fs','node:path','node:assert/strict']);
 assert.equal((helperSource.match(/require\(/g)||[]).length,3);
 assert(helperSource.includes('module.exports={verifyPracticeFilesChat};'));
});

test('The dispatcher keeps the files gate, delegates exactly once with the effective variant and keeps the shared prelude',()=>{
 const gate="if(['1','adopt','recover'].includes(process.env.FORMNARO_VERIFY_PRACTICE_FILES_CHAT)){";
 assert(mainSource.includes(gate));
 assert(mainSource.includes("return require('./practice-files-verification.cjs').verifyPracticeFilesChat({js,directory,checks,before,parentSnapshot,variant:process.env.FORMNARO_VERIFY_PRACTICE_FILES_CHAT});"));
 assert.equal(mainSource.split('variant:process.env.FORMNARO_VERIFY_PRACTICE_FILES_CHAT').length-1,1,'the effective variant is delegated exactly once');
 assert.equal(mainSource.split("require('./practice-files-verification.cjs').verifyPracticeFilesChat(").length-1,1);
 const normalized=mainSource.replace(/\r\n/g,'\n'),lines=normalized.split('\n');
 const delegation=lines.findIndex(line=>line.includes("require('./practice-files-verification.cjs').verifyPracticeFilesChat({"));
 assert(delegation>=0);
 assert.equal(lines[delegation+1].trim(),'}','the files gate closes after the delegation');
 assert.equal(lines[delegation+2].trim(),'if(drawingCase){','the drawing case follows immediately');
 for(const marker of ['parent-preview-before.png','const before=await js(parentSnapshot);','Button must be disabled while busy'])
  assert(mainSource.includes(marker),marker);
});

test('The neighbouring practice gates and the drawing case remain in the dispatcher',()=>{
 for(const gate of [
  "if(['1','multi','open'].includes(process.env.FORMNARO_VERIFY_PRACTICE_STL)){",
  "if(['prepared','files','conflict','unscaled'].includes(process.env.FORMNARO_VERIFY_PRACTICE_MULTIVIEW)){",
  "if(['1','perspective'].includes(process.env.FORMNARO_VERIFY_PRACTICE_PHOTO)){",
  "if(['off','report','enforce','all','reject','freecad','freecad-unavailable'].includes(process.env.FORMNARO_VERIFY_PRACTICE_QUALITY)){",
  "if(['chat','adopt','stale','lost','uncertain'].includes(process.env.FORMNARO_VERIFY_PRACTICE_COPY)){",
  "if(['draft','draft-edit'].includes(process.env.FORMNARO_VERIFY_PRACTICE_SKETCH)){"
 ])assert(mainSource.includes(gate),gate);
 assert(mainSource.includes('const drawingVariant=process.env.FORMNARO_VERIFY_PRACTICE_DRAWING;'));
 assert(mainSource.includes('if(drawingCase){'));
});

test('The files-specific fixtures and assertions moved into the extracted helper',()=>{
 for(const marker of ['Foto.png','Netz.stl','correction-window.jpg','unexpected-correction.txt','Geändert · Fotos',
  'ai-chat-practice-file-input','Zeig mir das Foto im Übungsfenster.','The body created before the failure still exists and is 44 mm wide']){
  assert(helperSource.includes(marker),'the helper owns: '+marker);
  assert.equal(mainSource.includes(marker),false,'the dispatcher no longer owns: '+marker);
 }
});

test('The portable package filter drops the extracted files verification module',async t=>{
 const root=temporary(t,'formnaro-files-portable-'),source=path.join(root,'source'),stage=path.join(root,'stage');
 for(const directory of ['backend','ai','licenses','dist'])fs.mkdirSync(path.join(source,directory),{recursive:true});
 for(const file of ['electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.writeFileSync(path.join(source,file),'');
 for(const name of ['practice-verification.cjs','practice-files-verification.cjs','practice-quality-verification.cjs','practice-stl-verification.cjs','practice-runner.cjs','practice-files.cjs'])fs.writeFileSync(path.join(source,'backend',name),name);
 for(const suite of ['benchmark-core-v1.json','benchmark-advanced-v2.json'])fs.writeFileSync(path.join(source,'ai',suite),JSON.stringify({dependencies:[]}));
 const {copyPortableApp}=await import('../scripts/portable-runtime-policy.mjs');
 copyPortableApp(source,stage);
 assert.deepEqual(fs.readdirSync(path.join(stage,'backend')).sort(),['practice-files.cjs','practice-runner.cjs']);
 assert.equal(fs.existsSync(path.join(stage,'backend','practice-files-verification.cjs')),false,'the extracted files module is not shipped');
});

for(const variant of ['1','adopt','recover']){
 const recovery=variant==='recover';
 test(`Local files fixture ${variant} drives the real helper through the installed fetch and protects the parent`,async t=>{
  assert.equal(PNG.startsWith('data:image/png;base64,'),true);
  assert.equal(PNG_BYTES.subarray(1,4).toString('latin1'),'PNG');
  assert.equal(PNG_BYTES.readUInt32BE(16),40);
  assert.equal(PNG_BYTES.readUInt32BE(20),30);
  assert.equal(JPEG_BASE64.length>2000,true);
  const fetchBefore=guardFetch(t);
  const run=await runFixture(t,variant);
  assert.equal(run.outcome.error,undefined,run.outcome.error&&run.outcome.error.message);
  assert.equal(run.outcome.fetchAfter,fetchBefore,'global.fetch is restored to the exact previous function');
  assert.equal(run.outcome.fetchAfter.toString(),fetchBefore.toString());
  const result=run.outcome.result,observations=run.observations;
  assert.deepEqual(Object.keys(result).sort(),['checks','ok','requests']);
  assert.equal(result.ok,true);
  assert.equal(result.checks,run.checks,'the helper returns the aggregated checks array itself');
  assert.deepEqual(result.checks,EXPECTED_CHECKS[variant]);
  assert.equal(result.requests,recovery?2:1);
  assert.equal(observations.requests,result.requests);
  assert.equal(observations.models,1,'exactly one /models answer');
  assert.deepEqual(observations.modelUrls,['http://127.0.0.1:9197/v1/models']);
  assert.equal(observations.chats.length,recovery?2:1);
  assert(observations.chats.every(chat=>chat.url==='http://127.0.0.1:9197/v1/chat/completions'&&chat.url.endsWith('/chat/completions')));
  const firstBody=JSON.stringify(observations.chats[0].body);
  assert(firstBody.includes(PNG),'the first chat body carries the exact photo PNG');
  assert.equal(firstBody.includes('isolated-mesh-marker'),false);
  assert.equal(firstBody.includes(PRIVATE_STL_BASE64),false);
  assert.equal(firstBody.includes(ROOT),false);
  for(let index=0;index<(recovery?2:1);index++){
   assert.equal(observations.replies[index].revision,run.before.state.revision);
   assert.equal(observations.replies[index].assistant.kind,'practice');
   assert.deepEqual(observations.replies[index].assistant.plan.actions,EXPECTED_ACTIONS[variant][index]);
   assert.equal(observations.replies[index].message,'Dateiübung abgeschlossen.');
  }
  assert.deepEqual(observations.completionStates,recovery?[false,true]:[true]);
  if(recovery){
   const continuation=observations.chats[1];
   assert(continuation.body.messages[0].content.includes('"selectable":["work"]'));
   assert(JSON.stringify(continuation.body).includes(PNG));
   assert(JSON.stringify(continuation.body).includes(JPEG_URL));
  }
  assert.equal(observations.stagedSnapshots[0],true,'staging is visible before submit');
  assert.deepEqual(observations.fileListCounts,[0],'the staged file list is empty after completion');
  assert.equal(observations.snapshotCalls,1);
  assert.deepEqual(observations.snapshots[0],run.before,'the parent snapshot stays unchanged');
  assert.deepEqual(observations.snapshots[0],snapshot());
  assertRendererPrograms(observations,{review:variant!=='1'});
  if(variant==='1'){
   assert.equal(observations.reviewScripts,0);
   assert.equal(observations.applyScripts,0);
   assert.equal(observations.describes,0);
   assert.equal(observations.serializeCalls.length,0);
   for(const name of ['correction-window.jpg','correction-feedback.txt','unexpected-correction.txt'])assert.equal(fs.existsSync(path.join(run.directory,name)),false,name);
  }else{
   assert.equal(observations.reviewScripts,1);
   assert.equal(observations.applyScripts,1);
   const originals=JSON.parse(run.before.serialized).nodes,added={id:'practice-work-1',type:'box',size:[44,10,20]};
   assert.deepEqual(JSON.parse(observations.appliedSerialized),{nodes:recovery?[...originals,added]:originals,
    photos:{items:[{image:{dataUrl:PNG},reference:{scale:{points:[[4,4],[24,4]]}}}]}});
   assert.equal(observations.serializeCalls.length,4);
   assert.equal(observations.serializeCalls[0],run.before.serialized);
   assert.equal(observations.serializeCalls[1],observations.appliedSerialized);
   assert.equal(observations.serializeCalls[2],run.before.serialized);
   assert.equal(observations.serializeCalls[3],observations.appliedSerialized);
   assert.deepEqual(observations.undoDepths,[run.before.state.undo,run.before.state.undo+1]);
   assert.equal(observations.undoActions,1);
   assert.equal(observations.redoActions,1);
   assert.equal(observations.describes,recovery?1:0);
   if(recovery){
    assert(observations.describeResult.objects.some(object=>object.id==='practice-work-1'&&object.worldBounds.size[0]===44));
    const jpg=fs.readFileSync(path.join(run.directory,'correction-window.jpg'));
    assert(jpg.length>2000);
    assert.equal(jpg[0],0xff);
    assert.equal(jpg[1],0xd8);
    const feedback=fs.readFileSync(path.join(run.directory,'correction-feedback.txt'),'utf8');
    assert.match(feedback,/failedAction/);
    assert.match(feedback,/photo-point/);
    assert.match(feedback,/0123456789abcdef/);
    assert.equal(fs.existsSync(path.join(run.directory,'unexpected-correction.txt')),false);
   }else for(const name of ['correction-window.jpg','correction-feedback.txt','unexpected-correction.txt'])assert.equal(fs.existsSync(path.join(run.directory,name)),false,name);
  }
 });
}

test('The explicit variant argument binds the run even while the environment names recover',async t=>{
 const fetchBefore=guardFetch(t);
 setEnv(t,'FORMNARO_VERIFY_PRACTICE_FILES_CHAT','recover');
 const run=await runFixture(t,'1');
 assert.equal(process.env.FORMNARO_VERIFY_PRACTICE_FILES_CHAT,'recover');
 assert.equal(run.outcome.error,undefined,run.outcome.error&&run.outcome.error.message);
 assert.equal(run.outcome.fetchAfter,fetchBefore);
 assert.equal(run.outcome.fetchAfter.toString(),fetchBefore.toString());
 assert.equal(run.outcome.result.requests,1);
 assert.deepEqual(run.outcome.result.checks,EXPECTED_CHECKS['1']);
 assert.equal(run.observations.replies.length,1);
 for(const name of ['correction-window.jpg','correction-feedback.txt','unexpected-correction.txt'])assert.equal(fs.existsSync(path.join(run.directory,name)),false,name);
});

test('An absent environment still lets the explicit recover variant drive the continuation',async t=>{
 const fetchBefore=guardFetch(t);
 setEnv(t,'FORMNARO_VERIFY_PRACTICE_FILES_CHAT',undefined);
 const run=await runFixture(t,'recover');
 assert.equal(process.env.FORMNARO_VERIFY_PRACTICE_FILES_CHAT,undefined);
 assert.equal(run.outcome.error,undefined,run.outcome.error&&run.outcome.error.message);
 assert.equal(run.outcome.fetchAfter,fetchBefore);
 assert.equal(run.outcome.fetchAfter.toString(),fetchBefore.toString());
 assert.equal(run.outcome.result.requests,2);
 assert.deepEqual(run.outcome.result.checks,EXPECTED_CHECKS.recover);
 assert.equal(run.observations.replies.length,2);
 assert(fs.existsSync(path.join(run.directory,'correction-window.jpg')));
 assert(fs.existsSync(path.join(run.directory,'correction-feedback.txt')));
 assert.equal(fs.existsSync(path.join(run.directory,'unexpected-correction.txt')),false);
});

test('A provider request without the photo descriptor rejects the real helper and still restores fetch exactly',async t=>{
 const fetchBefore=guardFetch(t);
 const run=await runFixture(t,'1',{fail:'missing-photo-descriptor'});
 assert(run.outcome.error,'the helper assertion must reject the missing photo descriptor');
 assert.equal(run.outcome.error.code,'ERR_ASSERTION');
 assert.match(run.outcome.error.message,/Foto\.png/);
 assert.equal(run.outcome.fetchAfter,fetchBefore);
 assert.equal(run.outcome.fetchAfter.toString(),fetchBefore.toString());
 assert.equal(run.observations.requests,0,'the rejected request never receives a chat answer');
});

test('A later renderer adapter failure rejects the run and still restores fetch exactly',async t=>{
 const fetchBefore=guardFetch(t);
 const run=await runFixture(t,'1',{fail:'adapter'});
 assert(run.outcome.error,'the adapter failure must reject the run');
 assert.match(run.outcome.error.message,/File list adapter failed/);
 assert.equal(run.outcome.fetchAfter,fetchBefore);
 assert.equal(run.outcome.fetchAfter.toString(),fetchBefore.toString());
 assert.equal(run.observations.stagedSnapshots[0],true);
});

test('A parent project that changes during the run rejects with ERR_ASSERTION and still restores fetch exactly',async t=>{
 const fetchBefore=guardFetch(t);
 const run=await runFixture(t,'1',{fail:'parent-changed'});
 assert(run.outcome.error);
 assert.equal(run.outcome.error.code,'ERR_ASSERTION');
 assert.equal(run.outcome.fetchAfter,fetchBefore);
 assert.equal(run.outcome.fetchAfter.toString(),fetchBefore.toString());
 assert.equal(run.observations.snapshotCalls,1);
 assert.notDeepEqual(run.observations.snapshots[0],run.before);
});
