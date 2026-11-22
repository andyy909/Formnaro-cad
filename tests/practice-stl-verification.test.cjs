const test=require('node:test');
const { writeEmptyBenchmarkManifests } = require('./fixtures/portable-benchmark-manifests.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const stl=require('../backend/practice-stl-verification.cjs');
const mainSource=fs.readFileSync(path.join(__dirname,'..','backend','practice-verification.cjs'),'utf8');
const click=id=>({kind:'ui',action:'click',target:'ui:id:'+id});

function temporary(t,prefix){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),prefix));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 return root;
}

test('open STL variant reports the converter diagnostic without touching the parent project',async t=>{
 const directory=temporary(t,'formnaro-practice-stl-');
 const snapshot=()=>({serialized:'{"nodes":[]}',state:{undo:3,redo:1,previews:5,revision:7},selection:[],previewId:'preview-1',visiblePreviewRoots:[{id:'root-1',geometry:'geometry-1',root:null}]});
 const before=snapshot(),calls=[];
 let qualityInput;
 const js=async script=>{
  calls.push(script);
  if(script.includes('startPractice'))return {ok:false,reason:'The mesh is not watertight and closed.'};
  if(script!=='PARENT_SNAPSHOT_SCRIPT')throw new Error('Unexpected renderer script while the STL run is open');
  return snapshot();
 };
 const result=await stl.verifyPracticeStl({js,directory,checks:[],before,parentSnapshot:'PARENT_SNAPSHOT_SCRIPT',liveDomain:undefined,livePractice:()=>{throw new Error('Live practice must not run for the local open variant');},comparisonPolicy:(criteria,selected)=>{qualityInput={criteria,selected};return undefined;},variant:'open'});
 assert.deepEqual(Object.keys(result).sort(),['checks','diagnostic','ok']);
 assert.equal(result.ok,true);
 assert.deepEqual(result.checks,['Known open STL is rejected with a real converter diagnostic','The failed run yields no adoptable project result and preserves the parent']);
 assert.equal(result.diagnostic,'The mesh is not watertight and closed.');
 assert.equal(calls.length,2,'startPractice and exactly one parent snapshot');
 assert.equal(calls[1],'PARENT_SNAPSHOT_SCRIPT');
 assert.deepEqual(fs.readdirSync(directory),['stl-steps.json'],'the failed run writes only its step report');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'stl-steps.json'),'utf8')),{ok:false,reason:'The mesh is not watertight and closed.'});
 const script=calls[0];
 assert.deepEqual(JSON.parse(script.match(/plan:(\{.*?\}),quality:/s)[1]).actions,[click('practice-file-1'),click('converter-repair'),click('converter-run')]);
 const base64=script.match(/base64:"([^"]+)"/)[1];
 assert.equal(createHash('sha256').update(Buffer.from(base64,'base64')).digest('hex'),'5d205f773e6e823f4fe9adcc8b182ea2bea61d059a84e21d2fd43861581cf4ff','open STL fixture bytes');
 assert.deepEqual(qualityInput.selected,['solids','size']);
 assert.deepEqual(qualityInput.criteria.map(item=>item.id),['solids','size','volume']);
 assert.deepEqual(qualityInput.criteria.map(item=>item.check.expected),[1,[20,12,6],1440]);
 assert(script.includes('quality:undefined,projectCopy:{revision,project,selection:[]}'),'the comparison policy result is forwarded unchanged and the live revision/project are materialized in the renderer');
});

test('The extracted module exports exactly verifyPracticeStl',()=>{
 assert.deepEqual(Object.keys(stl),['verifyPracticeStl']);
 assert.equal(typeof stl.verifyPracticeStl,'function');
 assert.equal(stl.verifyPracticeStl.length,1);
});

test('The main practice file keeps the STL gate and delegates to the extracted module',()=>{
 assert(mainSource.includes("if(['1','multi','open'].includes(process.env.FORMNARO_VERIFY_PRACTICE_STL)){"));
 assert(mainSource.includes("return require('./practice-stl-verification.cjs').verifyPracticeStl({js,directory,checks,before,parentSnapshot,liveDomain,livePractice,comparisonPolicy,variant:process.env.FORMNARO_VERIFY_PRACTICE_STL});"));
 assert.equal(mainSource.includes('STL im Konverter prüfen und übernehmen'),false,'the STL plan lives in the extracted module');
 assert.equal(fs.readFileSync(path.join(__dirname,'..','backend','practice-stl-verification.cjs'),'utf8').includes('STL im Konverter prüfen und übernehmen'),true);
});

test('The portable package filter drops the new STL verification file name',async t=>{
 const root=temporary(t,'formnaro-stl-portable-'),source=path.join(root,'source'),stage=path.join(root,'stage');
 for(const directory of ['backend','ai','licenses','dist'])fs.mkdirSync(path.join(source,directory),{recursive:true});
 for(const file of ['electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.writeFileSync(path.join(source,file),'');
 for(const name of ['practice-verification.cjs','practice-stl-verification.cjs','practice-fixture.cjs','practice-runner.cjs'])fs.writeFileSync(path.join(source,'backend',name),name);
 writeEmptyBenchmarkManifests(source);
 const {copyPortableApp}=await import('../scripts/portable-runtime-policy.mjs');
 copyPortableApp(source,stage);
 assert.deepEqual(fs.readdirSync(path.join(stage,'backend')).sort(),['practice-runner.cjs']);
});
