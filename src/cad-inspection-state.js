import {cadGeometryDigest} from './cad-geometry-digest.js';
import {normalizeGeometryPayloads} from './cad-geometry-ref.js';
import {isCadProjectReadView} from './cad-project.js';
const fail=message=>{throw Object.assign(Error('Prüfstand: '+message),{code:'INSPECTION_INVALID'});};
function plain(v,depth=0){if(depth>16)fail('Daten zu tief.');if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<=10000)return;if(Array.isArray(v)){if(v.length>10000)fail('Liste zu lang.');v.forEach(x=>plain(x,depth+1));return;}if(!v||Object.getPrototypeOf(v)!==Object.prototype)fail('Einfache Prüfdaten erforderlich.');for(const [k,x]of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(k))fail('Ungültiger Schlüssel.');plain(x,depth+1);}}
function object(v,keys){if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).some(k=>!keys.includes(k)))fail('Ungültige Felder.');}
const text=v=>typeof v==='string'&&v.trim()&&v.length<=500;
function validateReportScope(r){
 for(const key of ['complete','passed'])if(r[key]!==undefined&&!(key==='passed'&&r[key]===null)&&typeof r[key]!=='boolean')fail('Ungültiger Prüfstatus.');
 if(r.values!==undefined&&(!Array.isArray(r.values)||r.values.length>256||r.values.some(v=>!v||typeof v!=='object'||!text(v.jointId)||!Number.isFinite(v.value))))fail('Ungültige gespeicherte Gelenkwerte.');
 const pair=p=>p&&typeof p==='object'&&text(p.leftId)&&text(p.rightId)&&p.leftId!==p.rightId&&(p.minimumDistance===undefined||Number.isFinite(p.minimumDistance)&&p.minimumDistance>=0&&p.minimumDistance<=100000)&&(p.allowContact===undefined||typeof p.allowContact==='boolean')&&(p.tolerance===undefined||Number.isFinite(p.tolerance)&&p.tolerance>=0&&p.tolerance<=0.01);
 if(r.pairs!==undefined&&(!Array.isArray(r.pairs)||r.pairs.length>16||r.pairs.some(p=>!pair(p))))fail('Ungültige gespeicherte Prüfpaare.');
 if((r.leftId!==undefined||r.rightId!==undefined)&&!pair(r))fail('Ungültiges gespeichertes Prüfpaar.');
 if(r.methods!==undefined&&(!Array.isArray(r.methods)||r.methods.length>16||r.methods.some(m=>!m||typeof m.method!=='string')))fail('Ungültige gespeicherte Messmethoden.');
 for(const key of ['from','to','step','uncheckedFrom'])if(r[key]!==undefined&&r[key]!==null&&!Number.isFinite(r[key]))fail('Ungültiger gespeicherter Bewegungsbereich.');
 for(const key of ['checkedSamples','requestedSamples','uncheckedSamples'])if(r[key]!==undefined&&(!Number.isSafeInteger(r[key])||r[key]<0))fail('Ungültiger gespeicherter Stichprobenumfang.');
 if(r.failures!==undefined&&!Array.isArray(r.failures))fail('Ungültige gespeicherte Fundstellen.');
 for(const key of ['message','scope'])if(r[key]!==undefined&&typeof r[key]!=='string')fail('Ungültige gespeicherte Prüfbeschreibung.');
}
export const emptyInspection=()=>({version:1,limitations:[],checks:[]});
export function validateInspection(value){
 object(value,['version','limitations','checks']);if(value.version!==1||!Array.isArray(value.limitations)||value.limitations.length>100||!Array.isArray(value.checks)||value.checks.length>50||JSON.stringify(value).length>2000000)fail('Höchstens 100 Einschränkungen und 50 Prüfstände (2 MB).');const ids=new Set();
 for(const n of value.limitations){object(n,['id','kind','rootIds','note']);if(!text(n.id)||ids.has(n.id)||!['simplified-geometry','missing-coupling','other'].includes(n.kind)||!text(n.note)||!Array.isArray(n.rootIds)||n.rootIds.length>500||n.rootIds.some(x=>!text(x))||new Set(n.rootIds).size!==n.rootIds.length)fail('Eindeutige Einschränkung, Teile und Erläuterung erforderlich.');ids.add(n.id);}
 for(const n of value.checks){object(n,['id','checkedRevision','basisKey','kind','report']);if(!text(n.id)||ids.has(n.id)||!['jointPose','motionRange'].includes(n.kind)||!/^[0-9a-f]{16}$/.test(n.checkedRevision)||!/^([0-9a-f]{64})$/.test(n.basisKey))fail('Ungültiger Prüfbeleg.');ids.add(n.id);plain(n.report);if(!n.report||typeof n.report!=='object'||Array.isArray(n.report))fail('Prüfbericht fehlt.');validateReportScope(n.report);}
 return structuredClone(value);
}
function canonical(value,root=false){if(Array.isArray(value))return value.map(v=>canonical(v));if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>k!=='geometryIdentity'&&(!root||!['inspection','version','workspace'].includes(k))).map(k=>[k,canonical(value[k])]));return value;}
/** Normalize resident and deferred geometry to the same content hashes.
 * Inspection metadata and file format do not invalidate their own basis. */
const basisCache=new WeakMap();
export function inspectionBasis(project){let value=isCadProjectReadView(project)?basisCache.get(project):undefined;if(!value){const {inspection,workspace,version,...model}=project;value=cadGeometryDigest(JSON.stringify(canonical(normalizeGeometryPayloads(model,cadGeometryDigest),true)));if(isCadProjectReadView(project))basisCache.set(project,value);}return value;}
export function inspectionStatus(project){
 const state=validateInspection(project.inspection??emptyInspection()),basis=inspectionBasis(project),checks=state.checks.map(c=>({id:c.id,kind:c.kind,checkedRevision:c.checkedRevision,status:c.basisKey===basis?'current':'stale',complete:c.report.complete??true,passed:c.report.passed??null,scope:c.report.scope??c.report.message??'Only the recorded pairs and sampled poses.',...(c.kind==='motionRange'?{checkedSamples:c.report.checkedSamples,requestedSamples:c.report.requestedSamples,from:c.report.from,to:c.report.to,jointId:c.report.jointId}:{}),failureCount:c.report.failures?.length??(c.report.intersects?1:0)}));
 checks.forEach((check,i)=>{const r=state.checks[i].report;Object.assign(check,{pairs:r.pairs??[{leftId:r.leftId,rightId:r.rightId,minimumDistance:r.minimumDistance,allowContact:r.allowContact,tolerance:r.tolerance}],values:r.values??[],methods:r.methods??[{method:r.method}],step:r.step,uncheckedSamples:r.uncheckedSamples??0,uncheckedFrom:r.uncheckedFrom??null});});
 return {version:1,basisKey:basis,limitations:state.limitations,checks,hasCurrentChecks:checks.some(c=>c.status==='current'),hasStaleChecks:checks.some(c=>c.status==='stale'),functionProven:false,scope:'Stored measurements and declared limitations only; absence of joint problems is not a general function or manufacturing proof.'};
}
export function editInspection(project,request,lookup){
 object(request,['action','reportId','limitation','id']);const state=validateInspection(project.inspection??emptyInspection());
 if(request.action==='record'){
  if(Object.keys(request).some(k=>!['action','reportId'].includes(k)))fail('Prüfkennung erforderlich.');const record=lookup(request.reportId);if(!record||record.basisKey!==inspectionBasis(project))throw Object.assign(Error('Prüfung fehlt oder gehört zu einem anderen Modellstand.'),{code:'STALE_INSPECTION'});
  state.checks=state.checks.filter(c=>c.id!==record.id);state.checks.push(record);
 }else if(request.action==='limitation'){
  if(Object.keys(request).some(k=>!['action','limitation'].includes(k)))fail('Einschränkung erforderlich.');const limitation={...request.limitation,id:request.limitation?.id??crypto.randomUUID()};if(limitation.rootIds?.some(id=>!project.nodes.some(n=>n.id===id)))fail('Vorhandene Teile ausdrücklich wählen.');state.limitations=state.limitations.filter(n=>n.id!==limitation.id);state.limitations.push(limitation);
 }else if(request.action==='remove'){
  if(Object.keys(request).some(k=>!['action','id'].includes(k))||!text(request.id))fail('Vorhandene Kennung erforderlich.');state.checks=state.checks.filter(c=>c.id!==request.id);state.limitations=state.limitations.filter(c=>c.id!==request.id);
 }else fail('record, limitation oder remove wählen.');
 project.inspection=validateInspection(state);return {metadataOnly:true,affectedIds:[],constructedIds:[],counts:{},inspection:inspectionStatus(project)};
}
export const INSPECTION_COMMAND_SCHEMAS=[
 {type:'object',additionalProperties:false,required:['op','action','reportId'],properties:{op:{const:'inspection'},action:{const:'record'},reportId:{type:'string',minLength:1,maxLength:500}}},
 {type:'object',additionalProperties:false,required:['op','action','limitation'],properties:{op:{const:'inspection'},action:{const:'limitation'},limitation:{type:'object',additionalProperties:false,required:['kind','rootIds','note'],properties:{id:{type:'string',minLength:1,maxLength:500},kind:{enum:['simplified-geometry','missing-coupling','other']},rootIds:{type:'array',maxItems:500,uniqueItems:true,items:{type:'string'}},note:{type:'string',minLength:1,maxLength:500}}}}},
 {type:'object',additionalProperties:false,required:['op','action','id'],properties:{op:{const:'inspection'},action:{const:'remove'},id:{type:'string',minLength:1,maxLength:500}}}
];
