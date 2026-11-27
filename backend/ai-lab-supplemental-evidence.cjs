const fs=require('node:fs');
const path=require('node:path');
const {writeLabFile}=require('./ai-lab-storage.cjs');
const {frontierChartRow}=require('../ai/lab-frontier-chart-data.mjs');
const {benchmarkRunsFromReports}=require('../ai/lab-benchmark-overview.mjs');
const cases=new Set(require('../ai/lab-supplemental-cases.json').map(test=>test.id));
const receipt=/^Zusatzpruefung-[a-f0-9-]{36}\.json$/;
const maxReportBytes=1572864;
const receiptByteLimit=report=>report.simpleRun?.kind==='stl-challenge'?maxReportBytes:['detailed','cad-fitting-skill'].includes(report.simpleRun?.kind)?524288:262144;
const statuses=new Set(['passed','failed','error','cancelled']);

function createSupplementalEvidence(directory, { provenance } = {}){
 const paths=()=>fs.readdirSync(directory).filter(name=>receipt.test(name)).map(name=>path.join(directory,name));
 const settled=run=>['finished','incomplete'].includes(run?.status);
 const groupId=report=>report.simpleRun?.id??report.campaign??report.id;
 const end=report=>report.endedAt??report.startedAt??'';
 function records(){
  return paths().flatMap(file=>{
   try{
    const stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.size>maxReportBytes)return [];
    const report=JSON.parse(fs.readFileSync(file,'utf8'));
    if(stat.size>receiptByteLimit(report))return [];
    return report?.id===path.basename(file).slice('Zusatzpruefung-'.length,-5)&&Array.isArray(report.results)?[report]:[];
   }catch(error){
    if(error instanceof SyntaxError||error.code==='ENOENT')return [];
    throw error;
   }
  });
 }
 return {
  save(report){
   if(!report||!/^[a-f0-9-]{36}$/.test(report.id??'')||!['completed','cancelled','interrupted'].includes(report.status)||
      !Array.isArray(report.caseIds)||!report.caseIds.length||report.caseIds.some(id=>report.campaign && ['Plattengrenze','Vorführgrenze','Fotogrenze','Zeichnungsgrenze','STL-Grenze'].includes(report.benchmark?.id) ? !/^ladder-[1-9][0-9]{0,4}-[1-8]$/.test(id) : report.benchmark?.id==='Plattengrenze' ? !/^plate-frontier-[1-9][0-9]{0,4}-[ab]$/.test(id) : !cases.has(id))||
      new Set(report.caseIds).size!==report.caseIds.length||
      !Array.isArray(report.results)||report.results.length>report.caseIds.length||
      (report.status==='completed'&&report.results.length!==report.caseIds.length&&
        !(report.simpleRun&&report.stopAfterSuccess===true&&report.results.at(-1)?.status==='passed'))||
      report.results.some((row,i)=>row?.id!==report.caseIds[i]||!statuses.has(row.status))){
    throw Error('Ungültiges Ergebnis der Zusatzprüfung.');
   }
   const bytes=JSON.stringify({...report,format:'FormnaroSupplementalLabCheck',version:1,...(provenance?{program:provenance()}:{})},null,2);
   if(Buffer.byteLength(bytes)>receiptByteLimit(report))throw Error('Das Protokoll der Zusatzprüfung ist zu groß.');
   const file=path.join(directory,'Zusatzpruefung-'+report.id+'.json');
   writeLabFile(file,bytes);
   return {path:file};
  },
  recent(){
   const file=paths().sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs)[0];
   return file?{path:file,report:JSON.parse(fs.readFileSync(file,'utf8'))}:null;
  },
  read(id){
   if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)) throw Error('Ungültiges Benchmark-Protokoll.');
   const file=path.join(directory,'Zusatzpruefung-'+id+'.json');
   const stat=fs.lstatSync(file,{throwIfNoEntry:false});
   return stat?.isFile()&&stat.size<=maxReportBytes?{path:file,report:JSON.parse(fs.readFileSync(file,'utf8'))}:null;
  },
  completed(){
   const seen=new Set();
   return records().sort((a,b)=>end(b).localeCompare(end(a))).flatMap(report=>{
    const id=groupId(report);
    if(seen.has(id))return [];
    if(report.simpleRun?!settled(report.simpleRun):report.status==='cancelled')return [];
    seen.add(id);
    const run=report.simpleRun, budget=['compact','detailed'].includes(run?.kind)&&Number.isFinite(run.priceLimitEUR)&&
      run.plan?.domains&&Array.isArray(run.efforts)&&Array.isArray(run.domains)&&Number.isFinite(run.elapsedMs)
      ? {eur:run.priceLimitEUR,basis:run.priceBudgetBasis??'api',version:run.plan.version,efforts:run.efforts,
         stages:Object.values(run.plan.domains).reduce((sum,area)=>sum+(area.tasks?.length??0),0),
         solved:run.efforts.map(effort=>run.domains.reduce((sum,area)=>sum+(area.results?.[effort]?.solvedStages??0),0)),
         elapsedMs:run.elapsedMs,tokens:run.tokens,exchangeRate:run.exchangeRate,priceStopReason:run.priceStopReason}
      : null;
    return [{id:report.id, model:report.connection?.model??run?.model,
      provider:report.connection?.providerId,label:run?.plan?.label??(run?.kind==='detailed'?'Ausführlicher Vergleichslauf (v14)':run?.kind==='compact'?'Standardtest':report.benchmark?.label??'Zusatzprüfung'),
      endedAt:end(report),...(budget?{budget}:{})}];
   });
  },
  exportData(id){
   if(typeof id!=='string'||!receipt.test('Zusatzpruefung-'+id+'.json'))throw Error('Ungültiger Benchmark.');
   const all=records();
   const selected=all.find(report=>report.id===id);
   if(!selected)throw Error('Das Benchmark-Protokoll fehlt.');
   const group=all.filter(report=>groupId(report)===groupId(selected))
     .sort((a,b)=>(a.startedAt??'').localeCompare(b.startedAt??''));
   const latest=group.findLast(report=>settled(report.simpleRun))??group.at(-1);
   if(latest.simpleRun&&!settled(latest.simpleRun))throw Error('Der Benchmark läuft noch oder wurde abgebrochen.');
   return require('./ai-lab-supplemental-package.cjs').buildSupplementalPackage(directory,latest,group);
  },
  chartRows(){
   return paths().flatMap(file=>{
    try{
     const stat=fs.lstatSync(file);
     if(!stat.isFile()||stat.size>maxReportBytes)return [];
     const row=frontierChartRow(JSON.parse(fs.readFileSync(file,'utf8')));
     return row?[row]:[];
    }catch(error){
     if(error instanceof SyntaxError||error.code==='ENOENT')return [];
     throw error;
    }
   });
  },
  benchmarkRuns(){return benchmarkRunsFromReports(records());},
  clear(){for(const file of paths())fs.rmSync(file,{force:true});},
 };
}
module.exports={createSupplementalEvidence};
