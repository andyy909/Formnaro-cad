import * as THREE from 'three';
import {createNode,SHAPES,validateProject,renewIds,encodeProject} from './model.js';
import {worldManifold,localManifold} from './engine/geometry.js';
import {validateAIResultChecks,resolveAIResultTarget,aiCheckFailure} from './ai-core/cad-ai-result-checks.js';
const fail=(message,code='MINI_AI_COMMAND')=>{throw Object.assign(Error(message),{code});};
const own=(value,allowed)=>{if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(k=>!allowed.includes(k)))fail('Fehlende oder unbekannte Befehlsfelder.');};
export function createMiniAITools(run){
 function target(project,value,aliases={},editable=false){
  if(typeof value==='string'&&value.startsWith('$'))value=Object.hasOwn(aliases,value.slice(1))?aliases[value.slice(1)]:null;
  if(value&&typeof value==='object'){own(value,['rootId','path']);if(!Array.isArray(value.path)||value.path.length)fail('Quellen zuerst ausdrücklich auflösen.');value=value.rootId;}
  const node=project.nodes.find(n=>n.id===value);if(!node)fail('Zielteil fehlt. Aktuelle Szene lesen.');
  if(editable&&(node.locked||node.hidden))fail('Gesperrte oder ausgeblendete Teile bleiben erhalten.');return node;
 }
 async function scene(project){
  validateProject(project);const bounds=await run('bounds',project.nodes),objects=[];
  for(let i=0;i<project.nodes.length;i++){
   const n=project.nodes[i],data=(await run('render',[n]))[0].data,b=bounds[i];
   objects.push({id:n.id,target:{rootId:n.id,path:[]},kind:'mesh',type:n.type,name:n.name,color:n.color,size:n.size,pos:n.pos,rot:n.rot,mirror:n.mirror,params:n.params,solid:n.solid,hidden:n.hidden,locked:n.locked,notes:n.notes,folder:n.folder,sourceIds:n.children?.map(c=>c.id)??[],worldBounds:{min:b.min,max:b.max,size:b.min.map((v,k)=>b.max[k]-v),center:b.min.map((v,k)=>(b.max[k]+v)/2)},objectType:data.raw?'rawMesh':'closedMesh',volume:data.volume==null?null:data.volume*n.size.reduce((a,b)=>a*b,1),triangles:data.triangles.length/3});
  }return {objects};
 }
 async function query(project,engine,kind,options={}){
  own(options,kind==='resources'?[]:['id']);
  if(engine==='app'&&kind==='resources')return {shapes:SHAPES.map(s=>s[0]),automaticRepair:true};
  const n=target(project,options.id);
  if(engine==='app'&&kind==='bounds')return (await scene({...project,nodes:[n]})).objects[0].worldBounds;
  if(engine==='mesh'&&kind==='inspectSolid'){const m=worldManifold(n);try{return {volume:m.volume(),triangles:m.numTri(),solids:m.decompose().map(p=>{p.delete();return 1;}).length};}finally{m.delete();}}
  if(engine==='mesh'&&kind==='inspect'&&n.mesh){const {inspectMiniMesh}=await import('./repair.js'),r=inspectMiniMesh(n.mesh);return {counts:r.counts,components:r.report.componentCount,triangles:r.report.triangles,limitations:r.report.limitations};}
  if(engine==='mesh'&&kind==='inspect'){const m=localManifold(n);try{const {meshData}=await import('./engine/geometry.js'),{inspectMiniMesh}=await import('./repair.js'),r=inspectMiniMesh(meshData(m));return {counts:r.counts,components:r.report.componentCount,triangles:r.report.triangles,limitations:r.report.limitations};}finally{m.delete();}}
  fail('Diese Modellabfrage ist nicht verfügbar.');
 }
 async function checks(project,input,aliases){
  const list=validateAIResultChecks(input),s=await scene(project),results=[];
  for(let index=0;index<list.length;index++){
   const c=list[index];if(!['size','bounds','volume','solids','clearance'].includes(c.kind))fail('Diese Ergebnisprüfung ist in Mini nicht verfügbar.');
   const o=resolveAIResultTarget(s,c.target,aliases),n=target(project,o.id),tolerance=c.tolerance??.01;let actual;
   if(c.kind==='size')actual=c.space==='edit'?n.size:o.worldBounds.size;
   if(c.kind==='bounds')actual=o.worldBounds[c.edge];
   if(c.kind==='volume'){if(o.volume==null)fail('Rohnetz besitzt kein geprüftes Materialvolumen.');actual=o.volume;}
   if(c.kind==='solids')actual=(await query(project,'mesh','inspectSolid',{id:n.id})).solids;
   if(c.kind==='clearance'){
    const length=Math.hypot(...c.to.map((v,k)=>v-c.from[k])),radius=c.diameter/2-tolerance;
    // Inscribed polygon with enough segments; test a slightly smaller corridor,
    // and publish the tolerance instead of claiming an exact analytic cylinder.
    const h=createNode('cylinder',128);h.size=[radius*2/Math.cos(Math.PI/128),radius*2/Math.cos(Math.PI/128),length];h.pos=c.from.map((v,k)=>(v+c.to[k])/2);
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...c.to).sub(new THREE.Vector3(...c.from)).normalize()),e=new THREE.Euler().setFromQuaternion(q,'ZYX');h.rot=[e.x,e.y,e.z].map(v=>v*180/Math.PI);
    const body=worldManifold(n),cutter=worldManifold(h);let common;try{common=body.intersect(cutter);if(common.status()!=='NoError')fail('Korridor konnte nicht geprüft werden.');actual=Math.max(0,common.volume());}finally{common?.delete();cutter.delete();body.delete();}
   }
   const expected=c.kind==='clearance'?0:c.expected,passed=Array.isArray(expected)?actual.every((v,k)=>Math.abs(v-expected[k])<=tolerance):Math.abs(actual-expected)<=(c.kind==='solids'?0:c.kind==='clearance'?1e-7:tolerance);
   if(!passed)throw aiCheckFailure(c,index+1,actual);
   results.push({...c,target:o.target,actual,expected,tolerance,passed:true});
  }return {version:1,checks:results,scope:'Nur angegebene Anforderungen; Netz- und Float32-Toleranzen gelten.'};
 }
 async function batch(project,commands,inputChecks=[]){
  validateProject(project);if(!Array.isArray(commands)||!commands.length||commands.length>200||JSON.stringify(commands).length>200000)fail('1–200 kompakte Modellbefehle erforderlich.');
  const p=structuredClone(project),aliases={},changes=[],warnings=[],report=[];
  for(const c of commands){
   const fields={create:['type','size','pos','rot','params','name','color','solid','segments','as'],update:['target','set'],duplicate:['target','offset','as'],delete:['target'],group:['targets','operation','as'],ungroup:['target'],repair:['target'],floor:['target']};
   if(!c||!Object.hasOwn(fields,c.op))fail('Unbekannter Mini-Modellbefehl.');own(c,['op',...fields[c.op]]);let result;
   if(c.as!==undefined&&(typeof c.as!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(c.as)||Object.hasOwn(aliases,c.as)))fail('Eindeutigen Alias verwenden.');
   if(c.op==='create'){result=createNode(c.type,c.segments??64);for(const k of fields.create.filter(k=>!['as','type','segments'].includes(k)))if(c[k]!==undefined)result[k]=structuredClone(c[k]);if(c.params)result.params={...createNode(c.type).params,...c.params};if(c.segments!==undefined&&(!Number.isInteger(c.segments)||c.segments<12||c.segments>128))fail('12 bis 128 Segmente verwenden.');p.nodes.push(result);}
   else if(c.op==='group'){
    if(!Array.isArray(c.targets)||c.targets.length<2||c.targets.length>200||!['union','intersection'].includes(c.operation??'union'))fail('Mindestens zwei unterschiedliche Teile und gültige Gruppenoperation erforderlich.');
    const nodes=c.targets.map(t=>target(p,t,aliases,true));if(new Set(nodes).size!==nodes.length)fail('Doppeltes Gruppenziel.');
    result=await run('group',{nodes,operation:c.operation??'union'});p.nodes=p.nodes.filter(n=>!nodes.includes(n));p.nodes.push(result);
   }else{
    const n=target(p,c.target,aliases,true),i=p.nodes.indexOf(n);
    if(c.op==='update'){own(c.set,['name','color','size','pos','rot','mirror','solid','params','notes','folder']);Object.assign(n,structuredClone(c.set));result=n;}
    if(c.op==='delete')p.nodes.splice(i,1);
    if(c.op==='duplicate'){result=renewIds(structuredClone(n));const offset=c.offset??[10,10,0];if(!Array.isArray(offset)||offset.length!==3||offset.some(v=>!Number.isFinite(v)))fail('Drei endliche Versatzwerte erforderlich.');result.pos=result.pos.map((v,k)=>v+offset[k]);p.nodes.push(result);}
    if(c.op==='ungroup'){const parts=await run('ungroup',n);p.nodes.splice(i,1,...parts);}
    if(c.op==='floor'){const b=(await run('bounds',[n]))[0];n.pos[2]-=b.min[2];result=n;}
    if(c.op==='repair'){const fixed=await run('repair',n);p.nodes[i]=fixed.node;result=fixed.node;report.push(fixed.report);if(fixed.status==='healthy')warnings.push(n.name+': bereits geschlossen; keine Reparatur erforderlich.');}
   }
   if(c.as)aliases[c.as]=result.id;encodeProject(p);await run('render',p.nodes);changes.push({op:c.op,id:result?.id});
  }
  return {project:p,aliases,changes,warnings,report,scene:await scene(p),verification:await checks(p,inputChecks,aliases)};
 }
 return async(job,payload)=>{
  if(job==='ai-scene')return scene(payload.project);
  if(job==='ai-query')return query(payload.project,payload.engine,payload.kind,payload.options);
  if(job==='ai-batch')return batch(payload.project,payload.commands,payload.checks);
  fail('Unbekannter Mini-KI-Auftrag.');
 };
}
