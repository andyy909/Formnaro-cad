import {meshSurfaceHit} from './mesh-surface.js';
import * as THREE from 'three';
import {makeMeshWorkplane} from './mesh-workplane.js';
import {cadPermanentlyVisible} from './cad-isolation.js';
import './cad-tools.css';

/** Shared surface picker: CAD hits remain native; mesh hits refer to exact saved
 * triangles. A display buffer is a picking hint, never the stored plane source. */
export function createCadWorkplaneUI({controller,view,prepare=()=>{},applyProposal,toast=()=>{}}){
  const panel=document.createElement('section');panel.id='cad-workplane-tool';panel.className='edge-tool-panel';panel.hidden=true;panel.setAttribute('aria-label','Arbeitsebene wählen');view.canvas.parentElement.append(panel);
  const overlay=new THREE.Group();overlay.name='workplane-preview';view.scene.add(overlay);let active=null,generation=0;
  const $=id=>panel.querySelector('#'+id),message=text=>{$('workplane-preview-status').textContent=text;};
  function clearOverlay(){for(const child of [...overlay.children]){child.geometry?.dispose();child.material?.dispose();overlay.remove(child);}view.invalidate?.('workplane-preview');}
  function draw(plane){clearOverlay();const q=new THREE.Quaternion(...plane.orientation),surface=new THREE.Mesh(new THREE.PlaneGeometry(45,45),new THREE.MeshBasicMaterial({color:'#f7b64b',transparent:true,opacity:.24,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));surface.position.fromArray(plane.origin);surface.quaternion.copy(q);surface.renderOrder=30;overlay.add(surface);const axes=new THREE.AxesHelper(22);axes.position.fromArray(plane.origin);axes.quaternion.copy(q);axes.renderOrder=31;overlay.add(axes);view.invalidate?.('workplane-preview');}
  function discard(){if(active?.preview)controller.discard(active.preview.previewId);if(active)active.preview=null;clearOverlay();}
  function close(){if(!active)return false;const own=active;active=null;generation++;if(own.busy)controller.cancel();if(own.preview)controller.discard(own.preview.previewId);clearOverlay();panel.hidden=true;view.setInteraction(null);return true;}
  function current(s,token){return active===s&&generation===token&&controller.revision()===s.revision;}
  function exactMeshHit(node,faceIndex,ray){
    const hit=meshSurfaceHit(node,ray);if(!hit)throw Error('Keine eindeutige gespeicherte Netzfläche getroffen. Erneut innerhalb der Fläche klicken.');return {plane:makeMeshWorkplane(node,hit.triangleIndex,hit.point),distance:hit.distance};
  }
  async function pick(ray,event,hit){
    const s=active;if(!s||s.busy)return;const token=generation;s.busy=true;discard();$('workplane-preview-apply').disabled=true;message('Fläche wird geprüft …');
    try{
      const project=controller.readSnapshot(),visible=project.nodes.filter(node=>cadPermanentlyVisible(node,project)&&view.allows(node.id)),ids=visible.filter(n=>n.kind==='cad'&&n.solid!==false).map(n=>n.id),node=visible.find(n=>n.id===hit?.object?.userData.rootId);let meshHit;
      if(node&&node.kind!=='cad'&&Number.isSafeInteger(hit.faceIndex))meshHit=exactMeshHit(node,hit.faceIndex,ray);
      // Hidden/ambiguous CAD faces behind the nearest mesh cannot affect its
      // selection. Query only the segment that could actually win the pick;
      // native ambiguity in front of that mesh must still be reported.
      const nativeRay=meshHit?{...ray,far:Math.min(ray.far??1e9,Math.max(0,meshHit.distance-1e-7))}:ray;
      const native=ids.length&&(nativeRay.far??1e9)>(nativeRay.near??0)?await controller.query('rayPick',{ray:nativeRay,ids}):null;if(!current(s,token))return;
      const nativeDistance=native?new THREE.Vector3(...ray.origin).distanceTo(new THREE.Vector3(...native.point)):Infinity;
      if(native&&(!meshHit||nativeDistance<meshHit.distance-1e-7)){
        const proposal=await controller.preview({kind:'tool',name:'previewWorkplane',options:{ray,ids:[native.objectId]}},{revision:s.revision,label:'CAD-Arbeitsebene setzen'});if(!current(s,token)){controller.discard(proposal.previewId);return;}s.busy=false;
        await applyProposal(proposal);close();toast('Arbeitsebene an CAD-Fläche gesetzt.');return;
      }
      if(!meshHit)throw Error('Eine sichtbare CAD- oder Netzfläche innerhalb der Arbeitsfläche anklicken.');
      const draft=controller.snapshot();draft.workplane=meshHit.plane;const proposal=await controller.preview(undefined,{project:draft,revision:s.revision,label:'Arbeitsebene an Netzfläche'});
      if(!current(s,token)){controller.discard(proposal.previewId);return;}s.preview=proposal;s.referenceKind='mesh';draw(proposal.project.workplane);message('Netzflächen-Vorschau. Die Ebene folgt diesem Teil. Übernehmen oder eine andere Fläche wählen.');$('workplane-preview-apply').disabled=false;
    }catch(error){if(current(s,token)){discard();message(error.message);}}
    finally{if(current(s,token))s.busy=false;}
  }
  async function apply(){const s=active;if(!s?.preview||s.busy||controller.revision()!==s.revision)return;const proposal=s.preview;s.busy=false;await applyProposal(proposal);close();toast('Arbeitsebene an Netzfläche gesetzt.');}
  function open(){prepare();close();active={revision:controller.revision(),busy:false,preview:null,referenceKind:null};generation++;panel.innerHTML='<strong>Arbeitsebene wählen</strong><p>Eine sichtbare CAD-, Netz- oder Vorlagenfläche anklicken. Auch offene Netze sind möglich.</p><p>CAD-Flächen werden beim Anklicken gesetzt. Bei Netzflächen die Vorschau prüfen und übernehmen.</p><p id="workplane-preview-status" role="status">Fläche in der Arbeitsfläche anklicken.</p><div class="edge-actions"><button id="workplane-preview-apply" class="primary" disabled>Übernehmen</button><button id="workplane-preview-cancel">Abbrechen</button></div>';panel.hidden=false;$('workplane-preview-cancel').onclick=close;$('workplane-preview-apply').onclick=()=>{void apply().catch(error=>{if(active)message(error.message);});};view.setInteraction(pick);return state();}
  function state(){return active?{revision:active.revision,busy:active.busy,hasPreview:!!active.preview,referenceKind:active.referenceKind}:null;}
  return {open,close,escape:close,state,apply,revisionChanged:()=>{if(active&&active.revision!==controller.revision())close();},dispose:()=>{close();clearOverlay();overlay.removeFromParent();panel.remove();}};
}
