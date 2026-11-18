const fs=require('node:fs');
const path=require('node:path');
const {writeLabFile}=require('./ai-lab-storage.cjs');
const cases=new Set(require('../ai/lab-supplemental-cases.json').map(test=>test.id));
const receipt=/^Zusatzpruefung-[a-f0-9-]{36}\.json$/;
const statuses=new Set(['passed','failed','error','cancelled']);

function createSupplementalEvidence(directory){
 const paths=()=>fs.readdirSync(directory).filter(name=>receipt.test(name)).map(name=>path.join(directory,name));
 return {
  save(report){
   if(!report||!/^[a-f0-9-]{36}$/.test(report.id??'')||!['completed','cancelled','interrupted'].includes(report.status)||
      !Array.isArray(report.caseIds)||!report.caseIds.length||report.caseIds.some(id=>!cases.has(id))||
      new Set(report.caseIds).size!==report.caseIds.length||
      !Array.isArray(report.results)||report.results.length>report.caseIds.length||
      (report.status==='completed'&&report.results.length!==report.caseIds.length)||
      report.results.some((row,i)=>row?.id!==report.caseIds[i]||!statuses.has(row.status))){
    throw Error('Ungültiges Ergebnis der Zusatzprüfung.');
   }
   const bytes=JSON.stringify({...report,format:'FormnaroSupplementalLabCheck',version:1},null,2);
   if(Buffer.byteLength(bytes)>262144)throw Error('Das Protokoll der Zusatzprüfung ist zu groß.');
   const file=path.join(directory,'Zusatzpruefung-'+report.id+'.json');
   writeLabFile(file,bytes);
   return {path:file};
  },
  recent(){
   const file=paths().sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs)[0];
   return file?{path:file,report:JSON.parse(fs.readFileSync(file,'utf8'))}:null;
  },
  clear(){for(const file of paths())fs.rmSync(file,{force:true});},
 };
}
module.exports={createSupplementalEvidence};
