import {photoEvidence,PHOTO_VIEWS} from './cad-photo-data.js';
import {loadPhotoImage,preparePerspectiveComparison,comparePhotoProjection} from './cad-photo-images.js';
import {photoMetricReference,analyzePhotoSet,photoSetDigest} from './cad-photo-multiview-data.js';
import {nativePhotoSetDimensions,photoSetNativeChecks} from './cad-photo-multiview-build.js';
import {photoTrianglesForIds} from './cad-photo-preview.js';

export async function reviewPhotoSet({plan,items,geometry}){
 const reports=[];
 for(const selection of plan.views){
  const item=items.find(i=>i.reference.imageId===selection.imageId);if(!item)throw Error('Das Original einer zugeordneten Ansicht fehlt.');
  const evidence=photoEvidence(item.reference),source=await loadPhotoImage(item.image.dataUrl),prepared=await preparePerspectiveComparison(evidence,source),axes=PHOTO_VIEWS[selection.view],dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0);
  const photoOrigin=evidence.version===2?photoMetricReference(item.reference).map(selection.origin):selection.origin;
  reports.push(comparePhotoProjection(prepared.reference,prepared.image,geometry,{registration:{photoOrigin,modelOrigin:[dot(plan.placement,axes.right),-dot(plan.placement,axes.up)]}}));
 }
 return reports;
}
export async function reviewStoredPhotoSet(controller,plan,{revision=controller.revision(),signal}={}){
 const current=()=>{if(signal?.aborted)throw Object.assign(Error('Ansichtsprüfung abgebrochen.'),{code:'ABORTED'});if(controller.revision()!==revision)throw Object.assign(Error('Projekt während der Ansichtsprüfung geändert.'),{code:'STALE_REVISION'});};current();
 const project=controller.snapshot(),analysis=analyzePhotoSet(project.photos?.items??[],plan);if(!analysis.canBuild)throw Object.assign(Error(analysis.issues.map(i=>i.message).join('\n')),{code:'PHOTO_SET_INCOMPLETE'});
 const root=project.nodes.find(n=>n.id===plan.result?.rootId);if(!root)throw Error('Die verknüpfte CAD-Variante fehlt. Eine neue Variante berechnen.');
 controller.assertExportReady({format:'step',ids:[root.id]});
 const display=await controller.display(project,undefined,{ids:[root.id]}),geometry=photoTrianglesForIds(project,display,[root.id]);current();
 const scene=await controller.describe(project),native=nativePhotoSetDimensions(scene,root.id,plan),reports=await reviewPhotoSet({plan,items:project.photos.items,geometry});current();
 const extra=[];for(const check of photoSetNativeChecks(plan,root.id)){try{const measured=await controller.query('aiResultChecks',{checks:[check]});extra.push(measured.checks[0]);}catch(e){if(/STALE|ABORT|CANCEL/.test(e.code??''))throw e;extra.push({kind:check.kind,passed:false,error:{code:e.code,message:e.message}});}current();}
 const nativeExtras={passed:extra.every(r=>r.passed),checks:extra};
 return {readOnly:true,revision,photoReconstructionReview:{passed:native.passed&&root.stats.solids===1&&nativeExtras.passed&&reports.every(r=>r.matches),native,solids:{passed:root.stats.solids===1},nativeExtras,views:reports,planChanged:plan.result.planDigest!==photoSetDigest(plan)}};
}
