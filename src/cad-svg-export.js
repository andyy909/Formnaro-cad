import {cadIdentity} from './cad-affine.js';
import {cadPermanentlyVisible} from './cad-isolation.js';
import {commonFrame} from './common-tool-operations.js';
import {mergeProjectedSvg} from './mesh-contours.js';
import {projectObjectType} from './project-objects.js';

/** The normal file dialog and local automation use the same confirmed mixed
 * projection. Temporary viewport isolation never changes production scope. */
export async function exportCadProjectSvg(controller,{ids,quality={deflection:.01,angleDegrees:5}}={}){
 controller.assertExportReady?.({ids,format:'svg'});
 const revision=controller.revision(),project=controller.readSnapshot?.()??controller.snapshot(),check=()=>{if(controller.revision()!==revision)throw Object.assign(Error('Projekt während des SVG-Exports geändert. Erneut exportieren.'),{code:'STALE_REVISION'});};
 if(ids!==undefined&&(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>typeof id!=='string'||!project.nodes.some(n=>n.id===id))||new Set(ids).size!==ids.length))throw Error('Vorhandene Teile für SVG eindeutig auswählen.');
 if(!quality||Object.keys(quality).some(key=>!['deflection','angleDegrees'].includes(key))||!Number.isFinite(quality.deflection)||quality.deflection<1e-7||quality.deflection>10||quality.angleDegrees!==undefined&&(!Number.isFinite(quality.angleDegrees)||quality.angleDegrees<=0||quality.angleDegrees>90))throw Error('Ungültige SVG-Projektionsqualität.');
 const frame=project.coordinateMode==='plane'?commonFrame(project):cadIdentity(),visible=project.nodes.filter(n=>cadPermanentlyVisible(n,project)&&(!ids||ids.includes(n.id))),native=visible.filter(n=>n.kind==='cad'&&n.solid),meshes=visible.filter(n=>n.kind==='mesh'&&n.meshRole!=='hole'),outputs=[];
 const unsuitable=meshes.filter(node=>projectObjectType(node)!=='closedMesh');
 if(unsuitable.length)throw Object.assign(Error('SVG benötigt geschlossene, gültige Netzteile. Offene oder beschädigte Netze sind enthalten: '+unsuitable.slice(0,3).map(node=>node.name).join(', ')+(unsuitable.length>3?' …':'')+'. Für SVG nur geeignete Teile auswählen und „Ausgewählte Teile“ verwenden.'),{code:'SVG_OPEN_MESH'});
 if(native.length){outputs.push((await controller.query('svgProjection',{ids:native.map(n=>n.id),frame,tolerance:quality.deflection})).svg);check();}
 if(meshes.length){try{outputs.push((await controller.meshQuery('toolsQuery',{kind:'svg',ids:meshes.map(n=>n.id),options:{frame}})).svg);}catch(error){if(/NotManifold/i.test(error.message??'')&&!/STALE|ABORT|CANCEL/.test(error.code??''))throw Object.assign(Error('Mindestens ein Netz ist für SVG kein gültiger geschlossener Körper. Die Netzteile prüfen oder nur geeignete Teile mit „Ausgewählte Teile“ exportieren.'),{code:'SVG_INVALID_MESH',cause:error});throw error;}check();}
 if(!outputs.length)throw Error('Keine sichtbaren Materialteile für SVG.');check();return {svg:mergeProjectedSvg(outputs),revision};
}
