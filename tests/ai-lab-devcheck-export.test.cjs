const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const fixture=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','development-check',name+'.json'),'utf8'));
const sha256=data=>crypto.createHash('sha256').update(data).digest('hex');
test('Der Entwicklungscheck-Export schreibt Befunde, Kurzbericht, Schema und Manifest ins ZIP',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-devcheck-export-'));
 t.after(()=>{const resolved=fs.realpathSync(directory);assert.equal(path.dirname(resolved),fs.realpathSync(os.tmpdir()));assert.match(path.basename(resolved),/^formnaro-devcheck-export-/);fs.rmSync(resolved,{recursive:true,force:true});});
 const order=['advanced-01','advanced-02','advanced-05','advanced-07','drill'];
 const records=order.map(fixture);
 records[0].finalMessage='Can you check C:/private-devcheck/layout.step?';
 const file='model-'+records[0].id+'.ocad';
 const retry='model-'+records[0].id+'-attempt-1.ocad';
 records[0].practiceAttempts=[{modelFile:retry}];
 for(const name of [file,retry])fs.writeFileSync(path.join(directory,name),'{"fixture":true}');
 for(const record of records)fs.writeFileSync(path.join(directory,'run-'+record.id+'.json'),JSON.stringify(record));
 const id='f14586d9-dfd7-48f6-8869-f7309ca43f20';
 const report={format:'FormnaroDevelopmentCheck',id,model:'deepseek-flash',setup:{modeler:{model:'deepseek-flash'},levels:['low']},sourceHash:'f60b86cb1234567890',status:'completed',phases:[{effort:'low',caseIds:order,outcomes:[
  {caseId:'advanced-01',runId:records[0].id,status:'blocked',reason:'needs-input'},
  {caseId:'advanced-02',runId:records[1].id,status:'passed',firstTry:false},
  {caseId:'advanced-05',runId:records[2].id,status:'passed',firstTry:false},
  {caseId:'advanced-07',runId:records[3].id,status:'passed',firstTry:true},
  {caseId:'drill',runId:records[4].id,status:'passed',firstTry:true},
 ]}]};
 fs.writeFileSync(path.join(directory,'Entwicklungscheck-'+id+'.json'),JSON.stringify(report));
 const result=await require('../backend/ai-lab-development-evidence.cjs').createDevelopmentEvidence(directory).exportReport(id);
 assert.ok(fs.existsSync(result.path),'ZIP existiert');
 const zipBytes=fs.readFileSync(result.path);
 assert.equal(result.bytes,zipBytes.length);
 assert.equal(result.sha256,sha256(zipBytes));
 const {unzipSync}=require('fflate');
 const entries=unzipSync(zipBytes);
 for(const name of ['Entwicklungsbefunde.json','Entwicklungsbefunde.md','AUSWERTUNG-SCHEMA.json','Befunde-Manifest.json'])assert.ok(entries[name],name+' fehlt im ZIP');
 assert.equal(result.files,Object.keys(entries).length);
 const findings=JSON.parse(Buffer.from(entries['Entwicklungsbefunde.json']).toString('utf8'));
 assert.equal(findings.format,'FormnaroDevelopmentFindings');
 assert.equal(findings.runs.length,5);
 assert.equal(findings.patterns.length,1);
 const markdown=Buffer.from(entries['Entwicklungsbefunde.md']).toString('utf8');
 assert.match(markdown,/## Muster über Aufgaben/);
 assert.doesNotMatch(markdown,/private-devcheck/);
 assert.doesNotMatch(JSON.stringify(findings),/private-devcheck/);
 assert.match(markdown,/lokaler Pfad entfernt/);
 assert.doesNotThrow(()=>JSON.parse(Buffer.from(entries['AUSWERTUNG-SCHEMA.json']).toString('utf8')));
 const manifest=JSON.parse(Buffer.from(entries['Befunde-Manifest.json']).toString('utf8'));
 assert.deepEqual(manifest.entries.map(entry=>entry.name),['Entwicklungsbefunde.json','Entwicklungsbefunde.md','AUSWERTUNG-SCHEMA.json']);
 for(const entry of manifest.entries){
  const data=Buffer.from(entries[entry.name]);
  assert.equal(entry.bytes,data.length,entry.name+' Bytes');
  assert.equal(entry.sha256,sha256(data),entry.name+' SHA-256');
 }
 assert.equal(manifest.baseManifest.name,'Manifest.json');
 assert.equal(manifest.baseManifest.sha256,sha256(Buffer.from(entries['Manifest.json'])),'Hash des ursprünglichen Manifest.json');
 const base=JSON.parse(Buffer.from(entries['Manifest.json']).toString('utf8'));
 assert.equal(base.format,'FormnaroExternalLabReview');
 for(const record of records)assert.ok(entries['Protokolle/run-'+record.id+'.json'],'altes Protokoll '+record.id);
 assert.ok(entries['Ergebnisuebersicht.json']&&entries['Serienplaene.json']&&entries['AUFTRAG-EXTERN.md'],'alte Einträge bleiben erhalten');
 for(const name of [file,retry])assert.ok(entries['Modelle/'+name],name+' survives staging');
 assert.ok(!fs.readdirSync(directory).some(name=>name.startsWith('.development-export-')));
 const readFile=fs.readFileSync;
 t.mock.method(fs,'readFileSync',(file,...args)=>{
  if(typeof file==='string'&&file.endsWith('lab-development-review-schema.json'))throw new Error('Simulated missing export schema');
  return readFile(file,...args);
 });
 await assert.rejects(require('../backend/ai-lab-development-evidence.cjs').createDevelopmentEvidence(directory).exportReport(id),/Simulated missing export schema/);
 const exports=fs.readdirSync(directory).filter(name=>name.startsWith('Externes-Pruefpaket-')||name.endsWith('.tmp'));
 assert.deepEqual(exports,[path.basename(result.path)]);
});
