const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const photo=require('../backend/practice-photo-verification.cjs');
const mainSource=fs.readFileSync(path.join(__dirname,'..','backend','practice-verification.cjs'),'utf8');
const moduleSource=fs.readFileSync(path.join(__dirname,'..','backend','practice-photo-verification.cjs'),'utf8');

function temporary(t,prefix){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),prefix));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 return root;
}

function withVariant(t,name,value){
 const previous=process.env[name];
 process.env[name]=value;
 t.after(()=>{if(previous===undefined)delete process.env[name];else process.env[name]=previous;});
}

test('The extracted module exports exactly the two practice photo entry points',()=>{
 assert.deepEqual(Object.keys(photo).sort(),['verifyPracticeMultiview','verifyPracticePhoto']);
 assert.equal(typeof photo.verifyPracticeMultiview,'function');
 assert.equal(typeof photo.verifyPracticePhoto,'function');
 assert.equal(photo.verifyPracticeMultiview.length,1);
 assert.equal(photo.verifyPracticePhoto.length,1);
});

test('The main practice file keeps both gates and delegates to the extracted module',()=>{
 assert(mainSource.includes("if(['prepared','files','conflict','unscaled'].includes(process.env.FORMNARO_VERIFY_PRACTICE_MULTIVIEW)){"));
 assert(mainSource.includes("if(['1','perspective'].includes(process.env.FORMNARO_VERIFY_PRACTICE_PHOTO)){"));
 assert(mainSource.includes("require('./practice-photo-verification.cjs').verifyPracticeMultiview({js,directory,checks,before,parentSnapshot,liveDomain,livePractice,comparisonPolicy})"));
 assert(mainSource.includes("require('./practice-photo-verification.cjs').verifyPracticePhoto({js,directory,checks,before,parentSnapshot,liveDomain,livePractice,comparisonPolicy})"));
 assert.equal(mainSource.includes('PHOTO_SET_LABELS'),false,'view labels live in the extracted module');
 assert.equal(mainSource.includes('photo-rectify'),false,'photo calibration lives in the extracted module');
 assert(moduleSource.includes('PHOTO_SET_LABELS'));
 assert(moduleSource.includes('photo-rectify'));
});

test('The neighbouring practice gates remain untouched',()=>{
 for(const flag of ['FORMNARO_VERIFY_PRACTICE_STL','FORMNARO_VERIFY_PRACTICE_QUALITY','FORMNARO_VERIFY_PRACTICE_COPY','FORMNARO_VERIFY_PRACTICE_SKETCH','FORMNARO_VERIFY_PRACTICE_DRAWING','FORMNARO_VERIFY_PRACTICE_FILES_CHAT'])
  assert(mainSource.includes(flag),flag);
});

test('The portable package filter drops the extracted photo verification module',async t=>{
 const root=temporary(t,'formnaro-photo-portable-'),source=path.join(root,'source'),stage=path.join(root,'stage');
 for(const directory of ['backend','ai','licenses','dist'])fs.mkdirSync(path.join(source,directory),{recursive:true});
 for(const file of ['electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.writeFileSync(path.join(source,file),'');
 for(const name of ['practice-verification.cjs','practice-photo-verification.cjs','practice-stl-verification.cjs','practice-runner.cjs','practice-files.cjs'])
  fs.writeFileSync(path.join(source,'backend',name),name);
 for(const suite of ['benchmark-core-v1.json','benchmark-advanced-v2.json'])fs.writeFileSync(path.join(source,'ai',suite),JSON.stringify({dependencies:[]}));
 const {copyPortableApp}=await import('../scripts/portable-runtime-policy.mjs');
 copyPortableApp(source,stage);
 assert.deepEqual(fs.readdirSync(path.join(stage,'backend')).sort(),['practice-files.cjs','practice-runner.cjs']);
});

test('The extracted multiview branch keeps the unscaled diagnosis contract',async t=>{
 withVariant(t,'FORMNARO_VERIFY_PRACTICE_MULTIVIEW','unscaled');
 const directory=temporary(t,'formnaro-practice-multiview-');
 const snapshot=()=>({serialized:'{"nodes":[]}',state:{undo:0,redo:0,previews:0,revision:1},selection:[],visiblePreviewRoots:[]});
 const before=snapshot(),checks=[],calls=[],policyCalls=[];
 const js=async script=>{
  calls.push(script);
  if(script==='PARENT_SNAPSHOT')return snapshot();
  if(script.includes('startPractice'))return {ok:false,reason:'Ohne Referenzmaß kann der Maßstab nicht bestimmt werden.',steps:[{target:'ui:id:practice-file-1'},{target:'ui:id:photo-points'}],resultRef:undefined};
  throw Error('Unerwartetes Renderer-Skript');
 };
 const result=await photo.verifyPracticeMultiview({js,directory,checks,before,parentSnapshot:'PARENT_SNAPSHOT',liveDomain:undefined,livePractice:()=>{throw Error('Live-Pfad darf nicht laufen');},comparisonPolicy:(criteria,selected)=>{policyCalls.push({criteria,selected});return {criteria,selected};}});
 assert.deepEqual(Object.keys(result).sort(),['checks','diagnostic','ok','variant']);
 assert.equal(result.ok,true);
 assert.equal(result.variant,'unscaled');
 assert.match(result.diagnostic,/Referenzmaß/);
 assert.deepEqual(result.checks,['Visible native dialog reports the missing scale or incompatible views, with no adoptable CAD result']);
 assert.equal(calls.length,2,'one practice call and one parent snapshot');
 assert.equal(calls[1],'PARENT_SNAPSHOT');
 assert.deepEqual(fs.readdirSync(directory),['multiview-steps.json']);
 assert.equal(policyCalls.length,1);
 assert.deepEqual(policyCalls[0].selected,['size','opening']);
});
