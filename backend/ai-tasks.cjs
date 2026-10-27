// Private local task journal. Loading never executes a program or applies CAD.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {writeTaskAtomicSync}=require('./ai-task-atomic.cjs');
const FORMAT='Formnaro-AITask',MAX_RECORD=128*1024*1024;
const error=(message,code='AI_TASK_STORE_INVALID')=>Object.assign(Error(message),{code,feedback:{retryable:false}});
const need=(ok,message,code)=>{if(!ok)throw error(message,code);};
const plain=x=>x&&Object.getPrototypeOf(x)===Object.prototype;
const idOK=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const copy=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>Array.isArray(value)?value.map(canonical):plain(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
function basisData(value,modelBinding){
 need(plain(value)&&Object.keys(value).sort().join(',')==='blocks,project,selection,version'&&value.version===1&&plain(value.project)&&plain(value.blocks)&&Object.keys(value.blocks).length<=20000&&Array.isArray(value.selection)&&value.selection.length<=500,'Ungültige gespeicherte Auftragsbasis.');
 need(Object.entries(value.blocks).every(([key,text])=>/^[a-f0-9]{64}$/.test(key)&&typeof text==='string'&&hash(text)===key),'Auftragsgeometrie wurde verändert.','AI_TASK_BASIS_INVALID');
 need(hash(JSON.stringify(canonical(value.project)))===modelBinding.projectDigest&&hash(JSON.stringify(canonical(value.selection)))===modelBinding.selectionDigest,'Auftragsbasis passt nicht zum gespeicherten Modellbezug.','AI_TASK_BASIS_INVALID');return copy(value);
}
function binding(value){
 need(plain(value)&&Object.keys(value).sort().join(',')==='projectDigest,referenceDigest,revision,selectionDigest','Ungültiger Modellbezug des KI-Auftrags.');
 need(typeof value.revision==='string'&&value.revision.length>0&&value.revision.length<=200&&['projectDigest','referenceDigest','selectionDigest'].every(k=>/^[a-f0-9]{64}$/.test(value[k])),'Ungültige Revision oder Referenzprüfsumme.');return {revision:value.revision,projectDigest:value.projectDigest,referenceDigest:value.referenceDigest,selectionDigest:value.selectionDigest};
}
function requirements(value){
 need(plain(value)&&Object.keys(value).sort().join(',')==='assumptions,checks,objective,protectedTargets,purpose','Ungültige Auftragsvorgaben.');
 need(['technical','generative'].includes(value.purpose)&&typeof value.objective==='string'&&value.objective.trim().length>0&&value.objective.length<=10000,'Ziel und Qualitätsart des Auftrags fehlen.');
 need(Array.isArray(value.assumptions)&&value.assumptions.length<=64&&value.assumptions.every(s=>typeof s==='string'&&s.length<=2000)&&Array.isArray(value.checks)&&value.checks.length<=32&&Array.isArray(value.protectedTargets)&&value.protectedTargets.length<=500,'Ungültige Annahmen, Schutzbereiche oder Prüfungen.');
 for(const target of value.protectedTargets)need(plain(target)&&Object.keys(target).sort().join(',')==='path,rootId'&&typeof target.rootId==='string'&&target.rootId.length>0&&target.rootId.length<=200&&Array.isArray(target.path)&&target.path.length<=12&&target.path.every(x=>typeof x==='string'&&x.length>0&&x.length<=200),'Ungültiger geschützter Teil.');return copy(value);
}
function inputData(value){
 need(plain(value)&&Object.keys(value).every(k=>['prompt','images','history','chat','photoReferences','featureReferences','usageTaskId'].includes(k)),'Nur Auftragsinhalt speichern; Zugangsdaten und Anbieterkonfiguration bleiben getrennt.');
 need(typeof value.prompt==='string'&&value.prompt.length<=10000,'Ungültiger gespeicherter Auftrag.');return copy(value);
}
function progress(value,maxSteps,purpose){
 need(plain(value)&&value.version===1&&value.maxSteps===maxSteps&&value.purpose===purpose&&Number.isSafeInteger(value.usedSteps)&&value.usedSteps>=0&&value.usedSteps<=maxSteps,'Gespeichertes Arbeitsschrittbudget ist ungültig.');
}
function createAITaskStore({directory,write=writeTaskAtomicSync,maxTasks=40,maxBytes=512*1024*1024}={}){
 need(typeof directory==='string'&&path.isAbsolute(directory),'Ein lokaler Auftragsordner ist erforderlich.');directory=path.resolve(directory);const owned=new Map();let db;
 const processAlive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}};
 function database(){if(!db){root();const target=path.join(directory,'coordination.sqlite');if(fs.existsSync(target))need(fs.lstatSync(target).isFile()&&!fs.lstatSync(target).isSymbolicLink(),'Ungültige Koordinationsdatei.');db=new DatabaseSync(target,{timeout:1000});db.exec('CREATE TABLE IF NOT EXISTS leases (id TEXT PRIMARY KEY, pid INTEGER NOT NULL, token TEXT NOT NULL)');}return db;}
 const row=id=>database().prepare('SELECT pid,token FROM leases WHERE id=?').get(id);
 const leases={has(id){const r=row(id);return !!r&&processAlive(r.pid);},get(id){const r=row(id);return r?.pid===process.pid&&r.token===owned.get(id)?r.token:undefined;},set(id,token){database().prepare('INSERT OR REPLACE INTO leases (id,pid,token) VALUES (?,?,?)').run(id,process.pid,token);owned.set(id,token);},delete(id){database().prepare('DELETE FROM leases WHERE id=?').run(id);owned.delete(id);}};
 const file=id=>{need(idOK(id),'Ungültige Auftragskennung.');return path.join(directory,id+'.json');};
 function root(){fs.mkdirSync(directory,{recursive:true});need(!fs.lstatSync(directory).isSymbolicLink()&&fs.statSync(directory).isDirectory(),'Der Auftragsordner darf kein Verweis sein.');}
 function files(){root();return fs.readdirSync(directory).filter(n=>idOK(n.slice(0,-5))&&n.endsWith('.json'));}
 function bytes(target){const stat=fs.lstatSync(target);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=MAX_RECORD,'Auftragsdatei ist ungültig oder zu groß.');return fs.readFileSync(target,'utf8');}
 function read(id,provider){
  root();let wrapper;try{wrapper=JSON.parse(bytes(file(id)));}catch(e){if(e.code==='ENOENT')throw error('Der gespeicherte KI-Auftrag fehlt.','AI_TASK_NOT_FOUND');throw error('KI-Auftrag konnte nicht gelesen werden. Die Datei bleibt unverändert.','AI_TASK_CORRUPT');}
  const r=wrapper?.record;
  need(plain(wrapper)&&Object.keys(wrapper).sort().join(',')==='record,sha256'&&plain(r)&&wrapper.sha256===hash(JSON.stringify(r))&&r.format===FORMAT&&r.version===1&&r.id===id,'Prüfsumme des KI-Auftrags stimmt nicht.','AI_TASK_CORRUPT');
  need(r.providerId===provider,'Der Auftrag gehört zu einem anderen KI-Anbieter.','AI_TASK_PROVIDER_MISMATCH');
  need(Number.isSafeInteger(r.generation)&&r.generation>=1&&['ready','running','interrupted','review','stopped','applied','discarded'].includes(r.status)&&Number.isSafeInteger(r.maxSteps)&&r.maxSteps>=7&&r.maxSteps<=80,'Ungültiger gespeicherter Auftragszustand.','AI_TASK_CORRUPT');binding(r.binding);requirements(r.requirements);inputData(r.input);if(r.basis)basisData(r.basis,r.binding);if(r.checkpoint)progress(r.checkpoint.progress,r.maxSteps,r.requirements.purpose);return r;
 }
 function save(record){
  root();const target=file(record.id),text=JSON.stringify({record,sha256:hash(JSON.stringify(record))});need(Buffer.byteLength(text)<=MAX_RECORD,'Auftragszustand ist zu groß.');
  const names=files();let total=0;for(const name of names){const p=path.join(directory,name),stat=fs.lstatSync(p);need(stat.isFile()&&!stat.isSymbolicLink(),'Ungültiger Verweis im Auftragsordner.');if(p!==target)total+=stat.size;}
  need(names.includes(record.id+'.json')||names.length<maxTasks,'Der Auftragsordner ist voll. Einen alten Auftrag entfernen.','AI_TASK_QUOTA');need(total+Buffer.byteLength(text)<=maxBytes,'Nicht genug Platz im Auftragsbudget. Vorhandene Aufträge bleiben erhalten.','AI_TASK_QUOTA');write(target,text);return copy(record);
 }
 const exposed=r=>({...copy(r),status:r.status==='running'&&!leases.has(r.id)?'interrupted':r.status});
 function current(args,provider){const r=read(args.id,provider);need(args.generation===r.generation,'Der Auftrag wurde zwischenzeitlich geändert. Liste neu laden.','AI_TASK_STALE');need(JSON.stringify(binding(args.binding))===JSON.stringify(binding(r.binding)),'Modellstand, Auswahl oder Referenzen passen nicht mehr zum Auftrag.','STALE_REVISION');return r;}
 function leased(args,provider){const r=current(args,provider);need(typeof args.lease==='string'&&leases.get(r.id)===args.lease,'Der Auftrag läuft nicht in dieser Fortsetzung.','AI_TASK_LEASE_REQUIRED');return r;}
 function update(r,status){return {...r,status,generation:r.generation+1,updatedAt:new Date().toISOString()};}
 function request(args,provider){
   need(plain(args)&&typeof provider==='string'&&provider.length>0&&provider.length<=500,'Ungültiger KI-Auftragsbefehl.');
   const fields={list:['action'],read:['action','id'],start:['action','binding','requirements','input','maxSteps','basis'],claim:['action','id','generation','binding'],inspect:['action','id','generation','binding'],release:['action','id','generation','binding','lease'],checkpoint:['action','id','generation','binding','lease','value'],finish:['action','id','generation','binding','lease','status'],resolve:['action','id','generation','binding','status'],remove:['action','id','generation']};
   need(fields[args.action]&&Object.keys(args).every(k=>fields[args.action].includes(k)),'Unbekannter Auftragsbefehl oder nicht erlaubte Felder.');
   if(args.action==='list')return files().flatMap(name=>{let r;try{r=read(name.slice(0,-5),provider);}catch(e){if(e.code==='AI_TASK_PROVIDER_MISMATCH')return [];return [{id:name.slice(0,-5),status:'corrupt',error:'Auftragsdatei beschädigt; nichts wird ausgeführt.'}];}return [{id:r.id,generation:r.generation,status:exposed(r).status,objective:r.requirements.objective,purpose:r.requirements.purpose,updatedAt:r.updatedAt,usedSteps:r.checkpoint?.progress.usedSteps??0,maxSteps:r.maxSteps}];}).sort((a,b)=>(b.updatedAt??'').localeCompare(a.updatedAt??''));
   if(args.action==='read')return exposed(read(args.id,provider));
   if(args.action==='start'){
    const maxSteps=args.maxSteps;need(Number.isSafeInteger(maxSteps)&&maxSteps>=7&&maxSteps<=80,'Ungültiges Arbeitsschrittbudget.');const now=new Date().toISOString();
    const modelBinding=binding(args.binding);return save({format:FORMAT,version:1,id:crypto.randomUUID(),providerId:provider,binding:modelBinding,requirements:requirements(args.requirements),input:inputData(args.input),...(args.basis?{basis:basisData(args.basis,modelBinding)}:{}),maxSteps,generation:1,status:'ready',createdAt:now,updatedAt:now,checkpoint:null});
   }
   if(args.action==='remove'){const r=read(args.id,provider);need(args.generation===r.generation,'Der Auftrag wurde geändert.','AI_TASK_STALE');need(!leases.has(r.id),'Laufenden Auftrag zuerst stoppen.','BUSY');fs.unlinkSync(file(r.id));leases.delete(r.id);return {removed:true};}
   if(args.action==='resolve'){const r=current(args,provider);need(!leases.has(r.id),'Laufenden Auftrag zuerst stoppen.','BUSY');need(['review','stopped','interrupted','ready'].includes(r.status)&&['applied','discarded'].includes(args.status),'Nur eine beendete Vorschau übernehmen oder verwerfen.','AI_TASK_FINISHED');need(args.status!=='applied'||r.checkpoint?.candidate?.project,'Gespeicherte Modellvorschau fehlt.');return save(update(r,args.status));}
   if(args.action==='release'){file(args.id);need(typeof args.lease==='string'&&leases.get(args.id)===args.lease,'Der Auftrag läuft nicht in dieser Fortsetzung.','AI_TASK_LEASE_REQUIRED');leases.delete(args.id);return {released:true};}
   if(args.action==='inspect'){const r=current(args,provider);need(!leases.has(r.id),'Dieser Auftrag wird bereits bearbeitet.','BUSY');need(['review','stopped','interrupted','running'].includes(r.status)&&r.checkpoint?.candidate?.project,'Keine wiederherstellbare Modellvorschau vorhanden.','AI_TASK_FINISHED');const saved=save(update(r,'running')),lease=crypto.randomUUID();leases.set(r.id,lease);return {...saved,lease};}
   if(args.action==='claim'){
    const r=current(args,provider);need(!leases.has(r.id),'Dieser Auftrag wird bereits fortgesetzt.','BUSY');need(['ready','interrupted','running','review'].includes(r.status),'Diesen abgeschlossenen oder gestoppten Auftrag nicht erneut ausführen.','AI_TASK_FINISHED');need(!r.checkpoint?.progress.stop&&(r.checkpoint?.progress.usedSteps??0)<r.maxSteps,'Der Auftrag ist gestoppt oder sein Budget erschöpft.','AI_TASK_FINISHED');
    const saved=save(update(r,'running')),lease=crypto.randomUUID();leases.set(r.id,lease);return {...saved,lease};
   }
   if(args.action==='checkpoint'){
    const r=leased(args,provider);need(plain(args.value)&&Object.keys(args.value).every(k=>['phase','candidateSettled','binding','progress','taskEvidence','evidenceCheckpoint','requiredChecks','requiredChecksLocked','photoState','analysisResults','correction','lastResult','candidate','counters','workspace'].includes(k)),'Ungültiger Zwischenstand; keine Zugangsdaten oder Anbieterkonfiguration speichern.');progress(args.value.progress,r.maxSteps,r.requirements.purpose);need(args.value.progress.usedSteps>=(r.checkpoint?.progress.usedSteps??0),'Ein Fortsetzen darf verbrauchte Arbeitsschritte nicht zurücksetzen.','AI_TASK_BUDGET_REWIND');return save({...update(r,'running'),checkpoint:copy(args.value)});
   }
   const r=leased(args,provider);need(['interrupted','review','stopped','applied','discarded'].includes(args.status),'Ungültiger Abschlusszustand.');const saved=save(update(r,args.status));leases.delete(r.id);return saved;
 }
 return {
  request(args,provider){
   const connection=database();let started=false;
   try{connection.exec('BEGIN IMMEDIATE');started=true;const result=request(args,provider);connection.exec('COMMIT');return result;}
   catch(e){if(started){try{connection.exec('ROLLBACK');}catch{}}if(e.errcode===5||/database is locked/i.test(e.message))throw error('Ein anderer Prozess aktualisiert gerade die KI-Aufträge. Erneut versuchen.','BUSY');throw e;}
  },
  close(){if(db){need(owned.size===0,'Laufende Aufträge vor dem Schließen abschließen.','BUSY');db.close();db=null;}}
 };
}
module.exports={createAITaskStore};
