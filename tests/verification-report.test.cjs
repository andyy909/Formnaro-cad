const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {writeVerificationReport}=require('../backend/verification-report.cjs');
const electronSource=fs.readFileSync(path.join(__dirname,'..','electron.cjs'),'utf8');
const CALL="require('./backend/verification-report.cjs').writeVerificationReport(";
function temporary(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-verification-report-'));
  t.after(()=>{assert.equal(path.dirname(fs.realpathSync(root)),fs.realpathSync(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});});
  return root;
}
test('Report bytes equal the historical JSON.stringify output including indentation and Unicode',t=>{
  const root=temporary(t),file=path.join(root,'bericht.json'),payload={ok:true,checks:[{id:'Größe',value:19.6},{id:'Loch Ä',value:null}],nested:{version:'0.142.0-r1',flags:[true,false]},message:'Prüfung bestanden'};
  writeVerificationReport(file,payload);
  const bytes=fs.readFileSync(file);
  assert.deepEqual(bytes,Buffer.from(JSON.stringify(payload,null,2),'utf8'));
  assert.equal(bytes.toString('utf8').endsWith('\n'),false);
  assert.match(bytes.toString('utf8'),/^\{\n {2}"ok": true,\n {2}"checks": \[\n {4}\{\n {6}"id": "Größe",/);
});
test('Synchronous writer keeps the property order of the built payload',t=>{
  const root=temporary(t),file=path.join(root,'order.json'),result={checks:[],ok:true},payload={...result,expectedErrors:[],errors:[],external:[],electronVersion:'44.10.0',appVersion:'0.142.0',isolatedProfile:true};
  writeVerificationReport(file,payload);
  const text=fs.readFileSync(file,'utf8');
  assert.match(text,/^\{\n {2}"checks": \[\],\n {2}"ok": true,/);
  assert.match(text,/"expectedErrors": \[\],\n {2}"errors": \[\],\n {2}"external": \[\],\n {2}"electronVersion": "44.10.0",\n {2}"appVersion": "0.142.0",\n {2}"isolatedProfile": true/);
  assert.deepEqual(JSON.parse(text),payload);
});
test('Repeated writes replace the report exactly and never mutate the payload',t=>{
  const root=temporary(t),file=path.join(root,'rewrite.json'),first={ok:false,error:'Start timeout'},second={ok:true,checks:[1,2,3]},snapshot=JSON.parse(JSON.stringify(second));
  writeVerificationReport(file,first);assert.deepEqual(fs.readFileSync(file),Buffer.from(JSON.stringify(first,null,2)));
  writeVerificationReport(file,second);assert.deepEqual(fs.readFileSync(file),Buffer.from(JSON.stringify(second,null,2)));
  assert.deepEqual(second,snapshot);
  assert.equal(fs.readdirSync(root).length,1);
});
test('Write failures reach the caller synchronously before any window or process teardown',t=>{
  const root=temporary(t),missing=path.join(root,'fehlt','bericht.json');
  assert.throws(()=>writeVerificationReport(missing,{ok:true}),error=>error instanceof Error&&error.code==='ENOENT');
  assert.equal(fs.existsSync(missing),false);
  assert.equal(fs.readdirSync(root).length,0);
});
const MIGRATED = [
  'maintenanceVerifyArg',
  'speechVerifyArg',
  'fnpackVerifyArg',
  'assemblyVerifyArg',
  'jointsVerifyArg',
  'sketchConstraintsVerifyArg',
  'linkedContoursVerifyArg',
  'parametersVerifyArg',
  'modelingContextVerifyArg',
  'reconstructionVerifyArg',
  'pythonVerifyArg',
  'autoDimensionsVerifyArg',
  'u05VerifyArg',
  'k08VerifyArg',
  'drawingsVerifyArg',
];
test('electron.cjs loads the helper lazily only inside the verification branch',()=>{
  assert.equal(electronSource.split(CALL).length-1,MIGRATED.length,`${MIGRATED.length} verification branches write through the helper`);
  const branch=electronSource.indexOf('if(verifyPath){');
  assert.notEqual(branch, -1, 'electron.cjs guards the verification branch');
  for(let at=electronSource.indexOf(CALL);at>=0;at=electronSource.indexOf(CALL,at+1))assert.ok(at>branch,'helper call stays inside the verification branch');
  assert.doesNotMatch(electronSource,/^(?:const|let|var)\s[^\n=]*=\s*require\('\.\/backend\/verification-report\.cjs'\)/m);
  const lines = electronSource.split(/\r?\n/);
  for (const flag of MIGRATED) {
    const start = lines.findIndex(line => line.trimStart().startsWith('if(' + flag + '){'));
    assert.notEqual(start, -1, flag + ' has a verification branch');
    const opening = lines[start];
    const indent = opening.slice(0, opening.length - opening.trimStart().length);
    const end = opening.endsWith('}') ? start + 1 : lines.findIndex((line, index) => index > start && line === indent + '}') + 1;
    assert.ok(end > start, flag + ' closes its branch');
    const body = lines.slice(start, end).join('\n');
    assert.equal(body.split(CALL).length - 1, 1, flag + ' writes through the helper');
    assert.doesNotMatch(body, /fs\.writeFileSync\(\s*verifyPath\b/, flag + ' no longer writes inline');
  }
});
