const fs=require('node:fs');
const path=require('node:path');
const {sourceManifest}=require('./ai-test-lab-source.cjs');
const {writeLabFile}=require('./ai-lab-storage.cjs');
const {selectScope,exportPackage}=require('./ai-lab-review-data.cjs');
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
 function exportReport(id){
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
  return exportPackage({directory,scope});
 }
 return {recent,save,exportReport};
}

function installDevelopmentEvidence(win,directory,ipcMain=require('electron').ipcMain){
 const store=createDevelopmentEvidence(directory);
 const supplemental=require('./ai-lab-supplemental-evidence.cjs').createSupplementalEvidence(directory);
 ipcMain.handle('cad-ai:development-evidence',async(event,value)=>{
  try{
   if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Ungültiges Laborfenster.');
   if(value?.action==='practice-window'&&typeof value.show==='boolean'){
    if(value.show)delete process.env.FORMNARO_LAB_HIDE_PRACTICE;
    else process.env.FORMNARO_LAB_HIDE_PRACTICE='1';
    return {ok:true,value:value.show};
   }
   if(value?.action==='supplement-save')return {ok:true,value:supplemental.save(value.report)};
   if(value?.action==='supplement-recent')return {ok:true,value:supplemental.recent()};
   if(value?.action==='supplement-clear'){supplemental.clear();return {ok:true,value:null};}
   if(value?.action==='recent')return {ok:true,value:store.recent()};
   if(value?.action==='save'){store.save(value.report);return {ok:true,value:null};}
   if(value?.action==='export')return {ok:true,value:store.exportReport(value.id)};
   throw Error('Unbekannte Laboraktion.');
  }catch(error){return {ok:false,error:error.message};}
 });
 win.once('closed',()=>ipcMain.removeHandler('cad-ai:development-evidence'));
}

module.exports={createDevelopmentEvidence,installDevelopmentEvidence};
