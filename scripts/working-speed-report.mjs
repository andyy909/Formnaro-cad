import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const median=values=>{const a=values.toSorted((a,b)=>a-b);return (a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2;};
export function workingSpeedReport({sourceReport,packagedReport,out,work,baselineFile='work/speed-audit-20261023/app-baseline.json',version='0.80.0',baselineVersion='0.79.0',ratioLimit=1.5,absoluteLimitMs=20,includePreviousEvidence=true,deferPotentialSlowdown=false}){
 if(typeof deferPotentialSlowdown!=='boolean')throw Error('Deferred performance decisions require an explicit boolean.');
 const baseline=JSON.parse(fs.readFileSync(baselineFile,'utf8'));
 if(sha(baseline.report)!==baseline.sha256||!baseline.identity.unchangedProductBundle)throw Error('Baseline report differs');
 const before=JSON.parse(fs.readFileSync(baseline.report,'utf8')),rows=[];
 for(const [mode,file]of [['source',sourceReport],['packaged',packagedReport]]){
  const after=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!after.ok||after.errors.length||after.external.length||after.checks.length<11)throw Error('Incomplete working-speed report');
  function add(task,b,a,{sample='median'}={}){if(!Number.isFinite(b)||!Number.isFinite(a)||b<=0||a<0)throw Error('Invalid timing '+task);rows.push({mode,task,beforeMs:b,afterMs:a,ratio:a/b,sample,materialSlowdown:a>b*ratioLimit&&a-b>absoluteLimitMs});}
  for(const fixture of ['pipeline','imported','colored']){
   const b=before.metrics.cad[fixture],a=after.metrics.cad[fixture];
   for(const operation of ['move','rotate','scale'])add('cad.'+fixture+'.'+operation,median(b.measurements.filter(r=>r.operation===operation).map(r=>r.ms)),median(a.measurements.filter(r=>r.operation===operation).map(r=>r.ms)));
   add('cad.'+fixture+'.selection',median(b.selection),median(a.selection));
  }
  for(const fixture of ['dense','many'])add('mesh.'+fixture+'.selection',median(before.metrics.mesh[fixture].selectionPairMs),median(after.metrics.mesh[fixture].selectionPairMs));
  for(const operation of ['move','rotate','scale'])add('mesh.dense.'+operation,before.metrics.mesh.transforms.find(r=>r.name===operation).ms,after.metrics.mesh.transforms.find(r=>r.name===operation).ms,{sample:'single checked operation'});
  add('mesh.dense.refresh20',before.metrics.mesh.dense.refresh20Ms,after.metrics.mesh.dense.refresh20Ms,{sample:'one batch of20'});
  add('sketch128.zoom',before.metrics.sketch.millisecondsPerEvent,after.metrics.sketch.millisecondsPerEvent);
  add('sketch128.preview',before.metrics.sketch.previewMs,after.metrics.sketch.previewMs,{sample:'single native preview'});
  add('project.serializeParse',median(before.metrics.operations.projectRoundTripMs),median(after.metrics.operations.projectRoundTripMs));
  for(const key of ['duplicateMs','undoMs'])add('project.'+key,median(before.metrics.operations.duplicateUndo.map(r=>r[key])),median(after.metrics.operations.duplicateUndo.map(r=>r[key])));
  add('cad.group6',before.metrics.operations.group6Ms,after.metrics.operations.group6Ms,{sample:'single six-part group'});
 }
 const evidence=[];
 for(const file of ['work/speed-audit-20261023/mesh/selection-benchmark.json','work/speed-audit-20261023/ui/sketch-compare.json','work/speed-audit-20261023/cad/finer-reuse-benchmark.json'])if(includePreviousEvidence&&fs.existsSync(file)){const destination=path.join(out,path.basename(file));fs.copyFileSync(file,destination);evidence.push({file:destination,sha256:sha(file)});}
 const report={version,threshold:{ratioLimit,absoluteLimitMs},baseline:{version:baselineVersion,...baseline},sourceReport:{file:sourceReport,sha256:sha(sourceReport)},packagedReport:{file:packagedReport,sha256:sha(packagedReport)},comparisons:rows,materialSlowdown:rows.some(r=>r.materialSlowdown),...(deferPotentialSlowdown?{decisionDeferred:true}:{}),evidence,limits:(deferPotentialSlowdown?'Initial observations only; a release requires separate alternating paired repetition evidence. Potential outliers remain recorded and are not cleared by this report. ':'')+'Local synthetic workflows on one machine, run sequentially. Baseline identity and executable hashes are recorded. Only requested test workflows run; the ordinary user profile is not opened. Native quality and source/Undo assertions retained. Microbenchmarks exclude topology setup/transport/UI as stated. Wheel handler includes synchronous DOM work, excludes paint/GPU/input delivery. Single-operation samples are not statistical performance guarantees. No general FPS, startup, RAM or large-file speed promise.'};
 fs.writeFileSync(path.join(out,'Leistungspruefung.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(work,'performance.json'),JSON.stringify(report,null,2));
 const final=rows.filter(r=>r.mode==='packaged'),text=['Formnaro '+version+' · Arbeitsgeschwindigkeit','Vorher '+baselineVersion+' / Nachher echte '+version+'-EXE; gleiche synthetische Aufgaben.','',...final.map(r=>r.task+': '+r.beforeMs.toFixed(2)+' -> '+r.afterMs.toFixed(2)+' ms ('+r.sample+')'),'','Grenzen: '+report.limits,'','Aufwendige native CAD-Tessellierung und Farbaufteilungen bleiben aufwendig. Keine Konstruktion oder Exportgenauigkeit wurde reduziert.'];fs.writeFileSync(path.join(out,'Leistungspruefung.txt'),text.join('\n')+'\n');
 if(report.materialSlowdown&&!deferPotentialSlowdown)throw Error('Potential material slowdown: '+rows.filter(r=>r.materialSlowdown).map(r=>r.mode+'/'+r.task).join(', '));
 return {file:path.join(out,'Leistungspruefung.json'),sha256:sha(path.join(out,'Leistungspruefung.json')),comparisons:rows.length,materialSlowdown:report.materialSlowdown,...(deferPotentialSlowdown?{decisionDeferred:true}:{})};
}
