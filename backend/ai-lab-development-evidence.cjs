const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {sourceManifest}=require('./ai-test-lab-source.cjs');
const {writeLabFile}=require('./ai-lab-storage.cjs');
const {writeTaskAtomicSync}=require('./ai-task-atomic.cjs');
const {selectScope,exportPackage,sanitize}=require('./ai-lab-review-data.cjs');
const {caseIds}=require('../ai/lab-development-check.json');
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

function createDevelopmentEvidence(directory,readSource=()=>sourceManifest().hash){
 const name=id=>{
  if(typeof id!=='string'||!uuid.test(id))throw Error('Ungültiger Entwicklungscheck.');
  return path.join(directory,'Entwicklungscheck-'+id+'.json');
 };
 const read=id=>JSON.parse(fs.readFileSync(name(id),'utf8'));
 function recent(){
  const files=fs.readdirSync(directory).filter(file=>/^Entwicklungscheck-[a-f0-9-]{36}\.json$/.test(file));
  files.sort((a,b)=>fs.statSync(path.join(directory,b)).mtimeMs-fs.statSync(path.join(directory,a)).mtimeMs);
  const report=files.length?read(files[0].slice('Entwicklungscheck-'.length,-5)):null;
  return report?{...report,compatible:report.sourceHash===readSource()}:null;
 }
 function save(report){
  const file=name(report?.id);
  if(!Array.isArray(report.phases)||report.phases.length>3||typeof report.setup?.modeler?.model!=='string'){
   throw Error('Ungültiger Entwicklungsbericht.');
  }
  const sourceHash=readSource();
  const previous=fs.existsSync(file)?read(report.id):null;
  if(previous&&previous.sourceHash!==sourceHash)throw Error('Fortsetzen benötigt denselben Programmstand.');
  if(previous&&JSON.stringify(previous.setup)!==JSON.stringify(report.setup))throw Error('Das Modell und die Stufen bleiben für diesen Entwicklungscheck fest.');
  const bytes=JSON.stringify({format:'FormnaroDevelopmentCheck',...report,sourceHash},null,2);
  if(bytes.length>65536)throw Error('Entwicklungsbericht ist zu groß.');
  writeLabFile(file,bytes);
 }
 async function exportReport(id){
  const report=read(id);
  const selected=[];
  for(const phase of report.phases){
   if(!['low','high','max'].includes(phase.effort)||!phase.caseIds.every(caseId=>caseIds.includes(caseId)))throw Error('Ungültige Versuchsstufe.');
   for(const outcome of phase.outcomes){
    if(!outcome.runId)continue;
    if(!uuid.test(outcome.runId))throw Error('Ungültiges Versuchsprotokoll.');
    const record=JSON.parse(fs.readFileSync(path.join(directory,'run-'+outcome.runId+'.json'),'utf8'));
    if(record.id!==outcome.runId||record.spec.seriesName!=='Entwicklungscheck · '+id+' · '+phase.effort||record.spec.caseId!==outcome.caseId){
     throw Error('Versuch gehört nicht zu diesem Entwicklungscheck.');
    }
    selected.push(record);
   }
  }
  const completion={planned:report.phases.reduce((count,phase)=>count+phase.caseIds.length,0),status:report.status};
  const scope=selectScope(directory,selected,{ids:selected.map(record=>record.id),completion});
  // Link the stage evidence without changing the existing external ZIP format.
  scope.manifests=scope.manifests.map(manifest=>({...manifest,developmentCheck:report}));
   const {developmentFindings,findingsMarkdown}=await import('../ai/lab-development-findings.mjs');
  const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
  const findings=sanitize(developmentFindings(report,selected));
  const additions=[
   {name:'Entwicklungsbefunde.json',data:Buffer.from(JSON.stringify(findings,null,2))},
   {name:'Entwicklungsbefunde.md',data:Buffer.from(findingsMarkdown(findings))},
   {name:'AUSWERTUNG-SCHEMA.json',data:fs.readFileSync(path.join(__dirname,'../ai/lab-development-review-schema.json'))},
  ];
  const {zipSync,unzipSync}=require('fflate');
  const stage=fs.mkdtempSync(path.join(directory,'.development-export-'));
  try{
   for(const record of selected){
    const files=new Set(['model-'+record.id+'.ocad']);
    for(const attempt of record.practiceAttempts??[]){
     const name=attempt.modelFile;
     if(typeof name==='string'&&new RegExp('^model-'+record.id+'-attempt-[1-9][0-9]?\\.ocad$').test(name))files.add(name);
    }
    for(const file of files){
     const source=path.join(directory,file);
     if(fs.existsSync(source))fs.copyFileSync(source,path.join(stage,file));
    }
   }
   const exported=exportPackage({directory:stage,scope});
   const entries=unzipSync(fs.readFileSync(exported.path));
   for(const {name,data} of additions)entries[name]=data;
   const baseManifest=entries['Manifest.json'];
   const manifest={
    format:'FormnaroDevelopmentFindingsManifest',
    version:1,
    createdAt:new Date().toISOString(),
    entries:additions.map(({name,data})=>({name,bytes:data.length,sha256:hash(data)})),
    baseManifest:{name:'Manifest.json',bytes:baseManifest.length,sha256:hash(baseManifest)},
   };
   entries['Befunde-Manifest.json']=Buffer.from(JSON.stringify(manifest,null,2));
   const zip=zipSync(entries,{level:6});
   const target=path.join(directory,path.basename(exported.path));
   writeTaskAtomicSync(target,zip);
   return {...exported,path:target,bytes:zip.length,sha256:hash(zip),files:Object.keys(entries).length};
  }finally{
   if(path.dirname(fs.realpathSync(stage))===fs.realpathSync(directory))fs.rmSync(stage,{recursive:true,force:true,maxRetries:3,retryDelay:30});
  }
 }
 return {recent,save,exportReport};
}

function installDevelopmentEvidence(win,directory,ipcMain=require('electron').ipcMain){
 const store=createDevelopmentEvidence(directory);
 let program;
 const supplemental=require('./ai-lab-supplemental-evidence.cjs').createSupplementalEvidence(directory,{
  provenance:()=>program??={version:require('electron').app.getVersion(),sourceHash:sourceManifest().hash},
 });
 ipcMain.handle('cad-ai:development-evidence',async(event,value)=>{
  try{
   if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Ungültiges Laborfenster.');
   if(value?.action==='practice-window'&&typeof value.show==='boolean'){
    if(value.show)delete process.env.FORMNARO_LAB_HIDE_PRACTICE;
    else process.env.FORMNARO_LAB_HIDE_PRACTICE='1';
    return {ok:true,value:value.show};
   }
   if(value?.action==='guided-result'){
    if(!/^[a-f0-9-]{36}$/.test(value.id))throw Error('Ungültiger Lauf.');
    const record=JSON.parse(fs.readFileSync(path.join(directory,'run-'+value.id+'.json'),'utf8'));
    if(record.spec?.workflow!=='practice')throw Error('Kein Vorführlauf.');
    const events=record.events.filter(e=>!e.role||e.role==='modeler');
    const requests=events.filter(e=>e.type==='request').length;
    const {tokenEvents}=await import('../ai/lab-token-totals.mjs');
    const tokens=tokenEvents(requests,events.filter(e=>e.type==='usage'));
    const modelPath=path.join(directory,'model-'+value.id+'.ocad');
    const modelStat=value.visual===true?fs.lstatSync(modelPath,{throwIfNoEntry:false}):null;
    const model= modelStat?.isFile()&&modelStat.size<=2*1024*1024?fs.readFileSync(modelPath,'utf8'):null;
    return {ok:true,value:{id:record.id,...(model?{model}:{}),outcome:require('./ai-lab-benchmark.cjs').classifyBenchmarkTrial(record),
      requests, tokens, elapsedMs:record.elapsedMs}};
   }
   if(value?.action==='supplement-save')return {ok:true,value:supplemental.save(value.report)};
   if(value?.action==='supplement-chart-data')return {ok:true,value:supplemental.chartRows()};
   if(value?.action==='supplement-read')return {ok:true,value:supplemental.read(value.id)};
   if(value?.action==='supplement-recent')return {ok:true,value:supplemental.recent()};
   if(value?.action==='supplement-completed')return {ok:true,value:supplemental.completed()};
   if(value?.action==='supplement-export'){
    const {data,filename,reports}=supplemental.exportData(value.id);
    const {canceled,filePath}=await require('electron').dialog.showSaveDialog(win,{
     title:'Benchmark-Paket speichern',defaultPath:filename,filters:[{name:'Benchmark-Paket',extensions:['zip']}],
    });
    if(canceled||!filePath)return {ok:true,value:{saved:false}};
    const target=path.extname(filePath).toLowerCase()==='.zip'?filePath:filePath+'.zip';
    writeTaskAtomicSync(target,Buffer.from(data));
    return {ok:true,value:{saved:true,path:target,reports}};
   }
   if(value?.action==='supplement-clear'){supplemental.clear();return {ok:true,value:null};}
   if(value?.action==='recent')return {ok:true,value:store.recent()};
   if(value?.action==='save'){store.save(value.report);return {ok:true,value:null};}
   if(value?.action==='export')return {ok:true,value:await store.exportReport(value.id)};
   throw Error('Unbekannte Laboraktion.');
  }catch(error){return {ok:false,error:error.message};}
 });
 win.once('closed',()=>ipcMain.removeHandler('cad-ai:development-evidence'));
}

module.exports={createDevelopmentEvidence,installDevelopmentEvidence};
