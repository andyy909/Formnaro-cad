import {prepareConstrainedSketch} from './sketch-constraints-solver.js';
import {Matrix4,Quaternion,Vector3} from 'three';
import {flags} from './organization.js';
import {projectObjectGeometryDigest} from './project-objects.js';
import {profileFromLegacy} from './sketch-profile.js';
import {resolveCadSketch} from './cad-sketch.js';
const point=v=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000);
export function prepareSketchAttachment(project,operation){
 if(!operation||Object.keys(operation).some(k=>!['kind','type','targetId','reference','sketch','mode','overlap','name'].includes(k)))throw Error('Unbekannte Skizzen-Anbauoption.');
 const {targetId,reference,mode,overlap=.02,name}=operation,n=project.nodes.find(n=>n.id===targetId),state=n&&flags(n,project);
 if(!n||!['cad','mesh'].includes(n.kind)||n.kind==='cad'&&!n.solid||n.kind==='mesh'&&n.meshRole==='hole'||state.hidden||state.locked)throw Error('Ein sichtbares, entsperrtes Materialteil auswählen.');
 if(!['add','cut'].includes(mode)||!Number.isFinite(overlap)||overlap<0||overlap>1)throw Error('Hinzufügen oder Ausschneiden und Kontaktüberlappung 0–1 mm wählen.');
 if(!reference||Object.keys(reference).some(k=>!['point','normal','geometryDigest'].includes(k))||!point(reference.point)||!point(reference.normal)||Math.hypot(...reference.normal)<1e-10||reference.geometryDigest!==projectObjectGeometryDigest(n))throw Error('Die gewählte Fläche gehört zu einem anderen Modellstand. Neu wählen.');
 if(name!==undefined&&(typeof name!=='string'||name.length>200))throw Error('Ungültiger Teilname.');
 let sketch=structuredClone(prepareConstrainedSketch(operation.sketch)),resolved=resolveCadSketch(sketch);if(sketch.version===1)sketch=profileFromLegacy(sketch,resolved);
 sketch.dimensions.height='('+sketch.dimensions.height+')+'+overlap;resolved=resolveCadSketch(sketch);
 const normal=new Vector3(...reference.normal).normalize(),direction=normal.clone().multiplyScalar(mode==='cut'?-1:1),origin=new Vector3(...reference.point).addScaledVector(normal,mode==='cut'?overlap:-overlap),frame=new Matrix4().compose(origin,new Quaternion().setFromUnitVectors(new Vector3(0,0,1),direction),new Vector3(1,1,1)).toArray();
 return {engine:n.kind,target:n,sketch:resolved.sketch,frame,mode,overlap,requestedDepth:resolved.height-overlap,name:name??(mode==='cut'?'Skizzen-Ausschnitt':'Skizzen-Anbau'),sourceId:targetId,sourceDigest:reference.geometryDigest};
}
export function checkSketchAttachment(before,after,prepared){
 if(![before.volume,after.volume].every(v=>Number.isFinite(v)&&v>0)||!Number.isInteger(before.solids)||!Number.isInteger(after.solids)||after.solids<1)throw Error('Anbau benötigt geprüfte geschlossene Materialkörper.');
 const delta=after.volume-before.volume,epsilon=Math.max(1e-7,before.volume*1e-9);
 if(prepared.mode==='add'&&(delta<=epsilon||after.solids>before.solids))throw Error('Der Ansatz muss das vorhandene Teil berühren und Material hinzufügen. Kontaktüberlappung oder Kontur prüfen.');
 if(prepared.mode==='cut'&&delta>=-epsilon)throw Error('Der Ausschnitt trifft das vorhandene Material nicht. Richtung und Tiefe prüfen.');
 return {tool:'sketchAttachment',mode:prepared.mode,sourceId:prepared.sourceId,engine:prepared.engine,volumeBefore:before.volume,volumeAfter:after.volume,changedVolume:delta,solidsBefore:before.solids,solidsAfter:after.solids,requestedDepth:prepared.requestedDepth,contactOverlap:prepared.overlap,retainedSketchVersion:prepared.sketch.version,sourcePreserved:true};
}
export function attachmentNativeCommands(prepared){return [{op:'sketch',as:'attachmentTool',sketch:prepared.sketch,frame:prepared.frame,solid:prepared.mode!=='cut',name:('Skizze – '+prepared.name).slice(0,200)},{op:'group',targets:[prepared.sourceId,'$attachmentTool'],as:'attachment',operation:'union',name:prepared.name}];}
export function attachmentMeshOperations(prepared){const toolId=crypto.randomUUID();return [{type:'mesh-create-source',shape:'sketch',sketch:prepared.sketch,frame:prepared.frame,id:toolId,name:('Skizze – '+prepared.name).slice(0,200)},{type:'mesh-group',ids:[prepared.sourceId,toolId],operation:prepared.mode==='cut'?'difference':'union'}];}
