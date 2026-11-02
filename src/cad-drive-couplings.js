import {cadPoint,inverseCadMatrix,multiplyCadMatrices} from './cad-affine.js';
import {expandGearMotion} from './cad-gear-couplings.js';

const fail=(message,code='DRIVE_INVALID')=>{throw Object.assign(Error('Antrieb: '+message),{code});};
const near=(a,b)=>Math.abs(a-b)<=1e-7+Number.EPSILON*128*Math.max(1,Math.abs(a),Math.abs(b));
const rad=Math.PI/180,deg=180/Math.PI;
function fields(o,keys){if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).some(k=>!keys.includes(k)))fail('Ungültige Kopplungsfelder.');}
function joint(data,id,kind){const j=data.joints.find(j=>j.id===id);if(!j||j.kind!==kind)fail('Passendes bestehendes '+kind+'-Gelenk wählen.');return j;}
const members=c=>c.kind==='screw'?[c.rotary,c.linear]:[c.table,c.swivel,c.extension];
function expandAffine(affine,changes){try{return expandGearMotion(affine,changes,new Map());}catch(error){if(error.code==='GEAR_CONFLICT')fail('Widersprüchliche lineare Antriebsbeziehungen.','DRIVE_CONFLICT');throw error;}}
function linearGears(data){return [...(data.gears??[]),...(data.drives??[]).filter(c=>c.kind==='screw').map(c=>({jointA:c.rotary,jointB:c.linear,teethA:c.lead,teethB:360,axisSign:c.direction,kind:'internal',phase:c.phase}))];}
function frame(project,j){const n=project.nodes.find(n=>n.id===j.parentId);if(!n)fail('Träger fehlt.');return multiplyCadMatrices(n.transform,j.parentFrame);}

function actuatorValues(c,table,previous){
 const a=(table-c.referenceTable)*rad,arm=[c.arm[0]*Math.cos(a)-c.arm[1]*Math.sin(a),c.arm[0]*Math.sin(a)+c.arm[1]*Math.cos(a)],v=arm.map((x,k)=>x-c.base[k]),length=Math.hypot(...v);
 if(length<1e-7)fail('Zusammengefallene Anschlusspunkte.','DRIVE_SINGULAR');
 let swivel=c.referenceSwivel+c.swivelSign*(Math.atan2(v[1],v[0])-c.referenceAngle)*deg;
 swivel+=360*Math.round(((previous.get(c.swivel)??c.referenceSwivel)-swivel)/360);
 return new Map([[c.table,table],[c.swivel,swivel],[c.extension,c.referenceExtension+c.extensionSign*(length-c.referenceLength)]]);
}
function inverseTable(c,extension,current,data){
 const length=c.referenceLength+(extension-c.referenceExtension)/c.extensionSign,r=Math.hypot(...c.arm),b=Math.hypot(...c.base),cos=(r*r+b*b-length*length)/(2*r*b);
 if(length<=0||Math.abs(cos)>1+1e-10)fail('Angeforderter Auszug ist unerreichbar.','DRIVE_UNREACHABLE');
 const angle=Math.acos(Math.max(-1,Math.min(1,cos))),offset=Math.atan2(c.base[1],c.base[0])-Math.atan2(c.arm[1],c.arm[0]),limit=joint(data,c.table,'revolute').limits,previous=current.get(c.table),candidates=[];
 for(const sign of [-1,1]){const seed=c.referenceTable+(offset+sign*angle)*deg;for(let n=Math.ceil((limit.min-seed)/360);n<=Math.floor((limit.max-seed)/360);n++){
  const value=seed+n*360;if(candidates.some(x=>near(x,value)))continue;
  try{const pose=actuatorValues(c,value,current),expanded=expandAffine(linearGears(data),[...pose].map(([jointId,value])=>({jointId,value})));if(expanded.every(v=>{const j=data.joints.find(j=>j.id===v.jointId);return v.value>=j.limits.min&&v.value<=j.limits.max;}))candidates.push(value);}catch(error){if(error.code!=='DRIVE_CONFLICT')throw error;}
 }}
 candidates.sort((a,b)=>Math.abs(a-previous)-Math.abs(b-previous));
 if(!candidates.length)fail('Keine Lösung innerhalb der Tischgrenzen.','DRIVE_UNREACHABLE');
 if(candidates.length>1&&near(Math.abs(candidates[0]-previous),Math.abs(candidates[1]-previous)))fail('Mehrdeutiger Tischwinkel; Tisch direkt antreiben.','DRIVE_AMBIGUOUS');
 return candidates[0];
}

export function expandDriveMotion(data,changes,current){
 const affine=linearGears(data),values=new Map();
 const put=(id,value)=>{if(!Number.isFinite(value))fail('Nicht endlicher Bewegungswert.');if(values.has(id)&&!near(values.get(id),value))fail('Widersprüchliche Antriebswerte.','DRIVE_CONFLICT');const fresh=!values.has(id);values.set(id,value);return fresh;};
 for(const c of changes){if(values.has(c.jointId))fail('Antrieb nur einmal angeben.');put(c.jointId,c.value);}
 const nonlinear=(data.drives??[]).filter(c=>c.kind==='actuator');
 for(let round=0;round<=data.joints.length;round++){
  let added=false;
  for(const change of expandAffine(affine,[...values].map(([jointId,value])=>({jointId,value}))))added=put(change.jointId,change.value)||added;
  for(const c of nonlinear){
   if(!members(c).some(id=>values.has(id)))continue;
   if(!values.has(c.table)&&!values.has(c.extension))fail('Tischwinkel oder Auszug antreiben; Schwenkwinkel allein ist nicht eindeutig.','DRIVE_AMBIGUOUS');
   const table=values.has(c.table)?values.get(c.table):inverseTable(c,values.get(c.extension),current,data);
   for(const [id,value]of actuatorValues(c,table,current))added=put(id,value)||added;
  }
  if(!added)return [...values].map(([jointId,value])=>({jointId,value}));
 }
 fail('Kopplungsauflösung nicht konvergent.','DRIVE_CONFLICT');
}

export function validateDriveCouplings(drives,data){
 if(!Array.isArray(drives)||drives.length>256)fail('Höchstens 256 Antriebskopplungen.');
 const ids=new Set((data.gears??[]).map(g=>g.id));
 for(const c of drives){
  fields(c,c?.kind==='screw'?['id','name','kind','rotary','linear','lead','direction','phase']:['id','name','kind','table','swivel','extension','arm','base','referenceTable','referenceSwivel','referenceExtension','referenceAngle','referenceLength','swivelSign','extensionSign','planeOffset']);
  if(!['screw','actuator'].includes(c.kind)||typeof c.id!=='string'||!c.id.trim()||c.id.length>200||ids.has(c.id)||typeof c.name!=='string'||!c.name.trim()||c.name.length>200)fail('Eindeutige Kennung und Name erforderlich.');ids.add(c.id);
  if(c.kind==='screw'){
   const a=joint(data,c.rotary,'revolute'),b=joint(data,c.linear,'prismatic');
   if(!Number.isFinite(c.lead)||c.lead<1e-6||c.lead>100000||![1,-1].includes(c.direction)||!Number.isFinite(c.phase)||Math.abs(c.phase)>1e8)fail('Vorschub und Drehsinn ungültig.');
   if(!near(b.value,a.value*c.lead*c.direction/360+c.phase))fail('Schraubtrieb-Nullstellung passt nicht.','DRIVE_PHASE');
  }else{
   joint(data,c.table,'revolute');joint(data,c.swivel,'revolute');joint(data,c.extension,'prismatic');if(c.planeOffset!==undefined&&(!Number.isFinite(c.planeOffset)||Math.abs(c.planeOffset)>100000))fail('Ungültige Mechanikebene.');if(new Set(members(c)).size!==3)fail('Drei verschiedene Gelenke wählen.');
   if(![c.arm,c.base].every(p=>Array.isArray(p)&&p.length===2&&p.every(x=>Number.isFinite(x)&&Math.abs(x)<=100000))||Math.hypot(...c.arm)<1e-7||Math.hypot(...c.base)<1e-7||!['referenceTable','referenceSwivel','referenceExtension','referenceAngle','referenceLength'].every(k=>Number.isFinite(c[k])&&Math.abs(c[k])<=100000)||c.referenceLength<1e-7||![1,-1].includes(c.swivelSign)||![1,-1].includes(c.extensionSign))fail('Ungültige ebene Anschlussgeometrie.');
   const current=new Map(data.joints.map(j=>[j.id,j.value]));for(const [id,value]of actuatorValues(c,current.get(c.table),current))if(!near(value,current.get(id)))fail('Gespeicherte Antriebsstellung passt nicht.','DRIVE_PHASE');
  }
 }
 const complete={...data,drives};
 // Reuse the affine graph's loop proof (gear tooth integers are irrelevant here).
 const affine=linearGears(complete),graph=new Map();for(const g of affine){for(const [a,b]of [[g.jointA,g.jointB],[g.jointB,g.jointA]]){const list=graph.get(a)??[];list.push(b);graph.set(a,list);}}
 for(const c of drives.filter(c=>c.kind==='actuator'))for(const a of members(c)){const list=graph.get(a)??[];list.push(...members(c).filter(b=>b!==a));graph.set(a,list);}
 const visited=new Set();for(const root of graph.keys()){if(visited.has(root))continue;const queue=[root],component=new Set([root]);for(let i=0;i<queue.length;i++)for(const id of graph.get(queue[i])??[])if(!component.has(id)){component.add(id);queue.push(id);}component.forEach(id=>visited.add(id));if(drives.filter(c=>c.kind==='actuator'&&component.has(c.table)).length>1)fail('Nur eine nichtlineare Beziehung pro Antrieb.','DRIVE_CONFLICT');}
 // Independent seeds expose incompatible affine loops, even at a zero pose.
 for(const id of graph.keys()){
  const zero=expandAffine(affine,[{jointId:id,value:0}]);
  const one=expandAffine(affine,[{jointId:id,value:1}]);
  if(zero.length!==one.length)fail('Ungültige Kopplung.');
 }
 return structuredClone(drives);
}

export function createDriveCoupling(project,data,input){
 fields(input,input?.kind==='screw'?['id','name','kind','rotary','linear','lead','pitch','starts','direction']:['id','name','kind','table','swivel','extension','attachment']);
 const c={id:input.id??crypto.randomUUID(),name:input.name??(input.kind==='screw'?'Schraubtrieb':'Schwenkbarer Spindelantrieb'),kind:input.kind};
 if(input.kind==='screw'){
  const a=joint(data,input.rotary,'revolute'),b=joint(data,input.linear,'prismatic');
  if(input.lead!==undefined&&(input.pitch!==undefined||input.starts!==undefined)||input.lead===undefined&&(!Number.isFinite(input.pitch)||!Number.isSafeInteger(input.starts)||input.starts<1||input.starts>100))fail('Entweder Vorschub oder Steigung und Gangzahl angeben.');
  Object.assign(c,{rotary:a.id,linear:b.id,lead:input.lead??input.pitch*input.starts,direction:input.direction??1});c.phase=b.value-a.value*c.lead*c.direction/360;
 }else if(input.kind==='actuator'){
  const table=joint(data,input.table,'revolute'),swivel=joint(data,input.swivel,'revolute'),extension=joint(data,input.extension,'prismatic');
  if(table.parentId!==swivel.parentId||extension.parentId!==swivel.childId)fail('Tisch und Schwenkantrieb benötigen denselben Träger; Auszug muss direkt am Schwenkantrieb hängen.','DRIVE_SUPPORT');
  if(!Array.isArray(input.attachment)||input.attachment.length!==3||input.attachment.some(x=>!Number.isFinite(x)||Math.abs(x)>100000))fail('Tischanschluss in Welt-mm angeben.');
  const t=frame(project,table),s=frame(project,swivel),e=frame(project,extension),inverse=inverseCadMatrix(t),arm=cadPoint(inverse,input.attachment),base=cadPoint(inverse,s.slice(12,15)),dot=t.slice(8,11).reduce((n,x,k)=>n+x*s[8+k],0),v=arm.map((x,k)=>x-base[k]),length=Math.hypot(...v);
  const along=e.slice(8,11).reduce((n,x,k)=>n+x*(input.attachment[k]-s[12+k])/length,0);
  const end=project.nodes.find(n=>n.id===extension.childId),endFrame=multiplyCadMatrices(end.transform,extension.childFrame);
  if(Math.abs(arm[2]-base[2])>1e-6||Math.abs(Math.abs(dot)-1)>1e-7||Math.abs(Math.abs(along)-1)>1e-7||Math.hypot(...input.attachment.map((x,k)=>x-endFrame[12+k]))>1e-6)fail('Achsen/Anschlüsse müssen dieselbe Ebene und dieselbe Antriebslinie besitzen; Auszug-Bezug am Tischanschluss wählen.','DRIVE_GEOMETRY');
  Object.assign(c,{table:table.id,swivel:swivel.id,extension:extension.id,arm:arm.slice(0,2),base:base.slice(0,2),referenceTable:table.value,referenceSwivel:swivel.value,referenceExtension:extension.value,referenceAngle:Math.atan2(v[1],v[0]),referenceLength:length,...(Math.abs(base[2])>1e-7?{planeOffset:base[2]}:{}),swivelSign:dot<0?-1:1,extensionSign:along<0?-1:1});
 }else fail('Schraubtrieb oder ebener Spindelantrieb wählen.');
 return validateDriveCouplings([...(data.drives??[]),c],data);
}

export function driveGeometryProblems(project,data){
 const problems=[];
 for(const c of (data.drives??[]).filter(c=>c.kind==='actuator'))try{
  const table=joint(data,c.table,'revolute'),swivel=joint(data,c.swivel,'revolute'),extension=joint(data,c.extension,'prismatic');
  if(table.parentId!==swivel.parentId||extension.parentId!==swivel.childId)fail('Antriebsträger geändert.','DRIVE_SUPPORT');
  const t=frame(project,table),s=frame(project,swivel),e=frame(project,extension),b=cadPoint(inverseCadMatrix(t),s.slice(12,15)),theta=(table.value-c.referenceTable)*rad,point=[c.arm[0]*Math.cos(theta)-c.arm[1]*Math.sin(theta),c.arm[0]*Math.sin(theta)+c.arm[1]*Math.cos(theta),c.planeOffset??0],world=cadPoint(t,point),end=project.nodes.find(n=>n.id===extension.childId),f=multiplyCadMatrices(end.transform,extension.childFrame),axis=t.slice(8,11).reduce((n,x,k)=>n+x*s[8+k],0),length=Math.hypot(...world.map((x,k)=>x-s[12+k])),along=e.slice(8,11).reduce((n,x,k)=>n+x*(world[k]-s[12+k])/length,0);
  if(!near(b[0],c.base[0])||!near(b[1],c.base[1])||!near(b[2],c.planeOffset??0)||!near(axis,c.swivelSign)||!near(along,c.extensionSign)||world.some((x,k)=>!near(x,f[12+k])))fail('Gespeicherte Anschlüsse oder Achsen geändert; Kopplung ausdrücklich erneuern.','DRIVE_GEOMETRY');
 }catch(error){problems.push({code:error.code,message:error.message,jointId:c.id});}
 return problems;
}

export function remapDriveCouplings(drives,mapping){return (drives??[]).filter(c=>members(c).every(id=>mapping.has(id))).map(c=>{const result={...structuredClone(c),id:crypto.randomUUID()};for(const key of c.kind==='screw'?['rotary','linear']:['table','swivel','extension'])result[key]=mapping.get(c[key]);return result;});}
export const driveJointIds=members;
