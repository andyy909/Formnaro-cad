import {meshColorsEnabled} from './mesh-appearance.js';
import {cadGeometryDigest} from './cad-geometry-digest.js';
import {normalizeGeometryPayloads} from './cad-geometry-ref.js';

const object=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Object.keys(v).some(k=>!keys.includes(k)))throw Error('Ungültige Teileigenschaften.');};
const text=v=>{if(typeof v!=='string'||!v.trim()||v.length>120)throw Error('Material-/Gruppenname mit 1–120 Zeichen erforderlich.');return v.trim();};
export function validatePartProperties(value){
 object(value,['version','material','surfaces']);if(value.version!==1)throw Error('Unbekannte Teileigenschaftsversion.');
 const out={version:1};
 if(value.material!==undefined){object(value.material,['name','densityGcm3']);const d=value.material.densityGcm3;if(d!==null&&(!Number.isFinite(d)||d<.000001||d>1000))throw Error('Dichte ausdrücklich zwischen 0,000001 und 1000 g/cm³ eingeben oder offen lassen.');out.material={name:text(value.material.name),densityGcm3:d};}
 if(value.surfaces!==undefined){
  const s=value.surfaces;object(s,['geometryDigest','kind','groups']);if(!/^[a-f0-9]{64}$/.test(s.geometryDigest)||!['cad','mesh'].includes(s.kind)||!Array.isArray(s.groups)||s.groups.length>100)throw Error('Ungültige Flächengruppen.');
  const used=new Set(),names=new Set();let count=0;
  const groups=s.groups.map(g=>{object(g,['name','color','faceIds']);const name=text(g.name);if(names.has(name)||!/^#[a-f0-9]{6}$/i.test(g.color)||!Array.isArray(g.faceIds)||!g.faceIds.length||(count+=g.faceIds.length)>50000)throw Error('Ungültige oder doppelte Flächengruppe.');names.add(name);const faceIds=g.faceIds.map(i=>{if(!Number.isSafeInteger(i)||i<(s.kind==='cad'?1:0)||i>(s.kind==='cad'?40000:1999999)||used.has(i))throw Error('Flächenindizes müssen eindeutig sein.');used.add(i);return i;});return {name,color:g.color.toLowerCase(),faceIds};});
  out.surfaces={kind:s.kind,geometryDigest:s.geometryDigest,groups};
 }
 return out;
}
/** Local payload identity survives placement, styling and FNPACK materialization.
 * Native face numbering is accepted only on this exact unchanged BRep. */
export function partSurfaceDigest(node){return cadGeometryDigest(JSON.stringify(normalizeGeometryPayloads(node.kind==='cad'?node.brep:node.mesh,cadGeometryDigest)));}
export const partSourceColorsEnabled=node=>node.kind==='cad'?!!node.multicolor&&!!node.children?.length:node.kind==='mesh'&&meshColorsEnabled(node);
export function partSurfaceState(node){const s=node.metadata?.partProperties?.surfaces,current=!s||s.kind===node.kind&&s.geometryDigest===partSurfaceDigest(node);return {stored:!!s,current,active:!!s&&current&&!partSourceColorsEnabled(node),groups:s?.groups.length??0};}
export const hasCurrentPartSurfaceGroups=node=>!!node.metadata?.partProperties?.surfaces?.groups.length&&partSurfaceState(node).active;
export function partFaceColors(node){
 const base=node.kind==='cad'&&node.source==='step'?(node.metadata?.stepFaceColors??[]):[],s=node.metadata?.partProperties?.surfaces;
 if(!s||!partSurfaceState(node).active)return base;
 const colors=new Map(base.map(f=>[f.faceIndex,{...f}]));for(const g of s.groups)for(const faceIndex of g.faceIds)colors.set(faceIndex,{faceIndex,color:g.color,opacity:node.opacity??1,name:g.name});return [...colors.values()];
}
export function paintPartFaces(node,{name,color,faceIds}){
 if(!['cad','mesh'].includes(node.kind))throw Error('Ein CAD- oder Netzteil wählen.');
 if(partSourceColorsEnabled(node))throw Error('Für eigene Flächengruppen zuerst Quellenfarben für dieses Teil ausdrücklich abschalten. Die bisherigen Farbbereiche bleiben erhalten.');
 const prior=node.metadata?.partProperties??{version:1},old=prior.surfaces;
 const groups=old&&partSurfaceState(node).current?structuredClone(old.groups):[];
 const selected=new Set(faceIds);for(const g of groups)g.faceIds=g.faceIds.filter(i=>!selected.has(i));
 const remaining=groups.filter(g=>g.faceIds.length&&g.name!==name),same=groups.find(g=>g.name===name);
 const next=validatePartProperties({...prior,surfaces:{kind:node.kind,geometryDigest:partSurfaceDigest(node),groups:[...remaining,{name,color,faceIds:[...new Set([...(same?.faceIds??[]),...faceIds])]}]}});
 node.metadata={...node.metadata,partProperties:next};return node;
}
/** Export independent triangle regions; positions/indices stay in the supplied
 * world frame. Colors are presentation, never evidence of material density. */
export function splitPartSurfaceMesh(node,mesh){
 const styles=partFaceColors(node);if(!styles.length)return [{name:node.name,color:node.color,opacity:node.opacity??1,mesh}];
 const lookup=new Map(styles.map(s=>[s.faceIndex,s])),native=node.kind==='cad',faceByTriangle=new Map();
 if(native)for(let i=0;i<(mesh.faceGroups?.length??0);i+=3)for(let j=mesh.faceGroups[i];j<mesh.faceGroups[i]+mesh.faceGroups[i+1];j+=3)faceByTriangle.set(j/3,mesh.faceGroups[i+2]);
 const groups=new Map();
 for(let i=0;i<mesh.triangles.length;i+=3){const style=lookup.get(native?faceByTriangle.get(i/3):i/3),color=style?.color??node.color??'#8294aa',opacity=style?.opacity??node.opacity??1,name=style?.name??node.name,key=JSON.stringify([name,color,opacity]);let part=groups.get(key);if(!part){part={name,color,opacity,mesh:{vertices:[],triangles:[]},remap:new Map()};groups.set(key,part);}for(const v of mesh.triangles.slice(i,i+3)){let index=part.remap.get(v);if(index===undefined){index=part.mesh.vertices.length/3;part.remap.set(v,index);part.mesh.vertices.push(...mesh.vertices.slice(v*3,v*3+3));}part.mesh.triangles.push(index);}}
 return [...groups.values()].map(({remap,...part})=>part);
}
export function validateExplosion(value){
 if(value===null)return null;object(value,['version','distance','parts']);if(value.version!==1||!Number.isFinite(value.distance)||value.distance<0||value.distance>1000||!Array.isArray(value.parts)||value.parts.length>500)throw Error('Ungültige Explosionsansicht.');
 const ids=new Set();const parts=value.parts.map(p=>{object(p,['id','direction']);if(typeof p.id!=='string'||!p.id||p.id.length>200||ids.has(p.id)||!Array.isArray(p.direction)||p.direction.length!==3||p.direction.some(v=>!Number.isFinite(v))||Math.abs(Math.hypot(...p.direction)-1)>1e-8)throw Error('Ungültige Explosionsrichtung.');ids.add(p.id);return {id:p.id,direction:[...p.direction]};});return {version:1,distance:value.distance,parts};
}
export function explosionOffsets(explosion,project){const state=validateExplosion(explosion),ids=new Set(project.nodes.map(n=>n.id));return state?.parts.filter(p=>ids.has(p.id)).map(p=>({id:p.id,offset:p.direction.map(v=>v*state.distance)}))??[];}
export function summarizeParts(rows){
 const complete=rows.length>0&&rows.every(r=>Number.isFinite(r.massG)&&r.massG>0&&r.centerMm?.every(Number.isFinite)),knownMassG=rows.reduce((s,r)=>s+(Number.isFinite(r.massG)?r.massG:0),0);
 return {rows,complete,knownMassG,totalMassG:complete?knownMassG:null,centerMm:complete?[0,1,2].map(k=>rows.reduce((s,r)=>s+r.centerMm[k]*r.massG,0)/knownMassG):null,scope:'Summe der aufgeführten fertigen Teile; Überlappungen werden nicht vereinigt. Homogene Dichte je Teil, keine aus Farbe geschätzten Werkstoffe.'};
}
export function partsCsv(summary){
 const cell=v=>{let s=v===null||v===undefined?'':String(v);if(typeof v==='string'&&/^\s*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const rows=[['Teil-ID','Name','Materialgruppe','Anzahl','Dichte g/cm³','Volumen mm³','Masse g','Schwerpunkt X mm','Schwerpunkt Y mm','Schwerpunkt Z mm','Status'],...summary.rows.map(r=>[r.id,r.name,r.material??'',1,r.densityGcm3,r.volumeMm3,r.massG,...(r.centerMm??[null,null,null]),r.status])];return '\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n')+'\r\n';
}
