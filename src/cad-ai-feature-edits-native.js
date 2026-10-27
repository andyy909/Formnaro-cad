import {planCadAIScalarFeatureOperation} from './cad-ai-feature-plan.js';
import {assertCadAISpatialInputsCurrent,preserveCadAISpatialDependencies} from './cad-ai-feature-structure-native.js';
import {cadProjectSnapshot} from './cad-project.js';
import {cadSelectionContext} from './cad-interface-state.js';
import {cadSourceGeometryDigest} from './cad-geometry-digest.js';
import {cadProjectParameterCatalog} from './cad-project-parameters-catalog.js';
import {createCadAIReferencesNative} from './cad-ai-feature-references-native.js';
import {validateCadAIReferences} from './cad-ai-feature-references.js';
import {listCadEdgesNative,cadEdgesCorrespondNative} from './cad-finish-native.js';
import {readCadEdgeDomainNative} from './cad-finish-native.js';
import {cadGeometryDigest} from './cad-geometry-digest.js';
import {writeCadBrep,readCadBrep} from './cad-native-kernel.js';
import {uniqueCadEdgesNative,transformCadGeometryAffineNative} from './cad-edge-display-native.js';
import {planCadAIFeatureDependencies} from './cad-ai-feature-dependencies.js';
import {updateCadAssociative} from './cad-linked-contours-native.js';
import {evaluateCadProjectParameters,cadProjectParameterProblems} from './cad-project-parameters-data.js';
import {cadContourLinkProblems} from './cad-linked-contours-data.js';
import {cadJointProblems} from './cad-joints-data.js';
import {projectCadFaceAnchorNative} from './cad-topology-native.js';

const fail=(message,code='AI_FEATURE_EDIT_INVALID')=>{throw Object.assign(Error('Gezielte Änderung: '+message),{code});};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b)),key=t=>JSON.stringify([t.rootId,t.path]);
const only=(v,keys)=>{if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).some(k=>!keys.includes(k)))fail('Unbekannte Bearbeitungsfelder.');};
const within=(a,b)=>a.rootId===b.rootId&&b.path.every((id,k)=>a.path[k]===id)&&a.path.length>=b.path.length;
const aborted=signal=>{if(signal?.aborted)throw Object.assign(Error('Merkmalsänderung abgebrochen.'),{name:'AbortError',code:'ABORTED'});};

function assertJointScope(before,after){const previous=cadJointProblems(before),changed=cadJointProblems(after).filter(p=>!previous.some(old=>old.jointId===p.jointId&&old.code===p.code));if(changed.length)fail('Die Änderung verändert einen Gelenkbezug. Das betroffene Bezugssystem zuerst ausdrücklich neu zuordnen.','AI_FEATURE_JOINT_REASSIGN_REQUIRED');}


function assertCollectedScope(before,after,targets,plan,freecad=[]){
 const metadataFields=new Map(),derivedMarks=new Set();for(const run of freecad){const context=cadSelectionContext(before,run.target),archive=context.node.metadata.freecadSource.documentBase64;for(const node of context.chain){derivedMarks.add(node.id);if(node.id===context.node.id)metadataFields.set(node.id,['freecadSource','stepFaceColors']);else if(node.metadata?.freecadSource?.documentBase64===archive)metadataFields.set(node.id,['freecadSource']);}}
 const roots=new Set(targets.map(t=>t.rootId)),selected=new Set(targets.map(key)),ancestors=new Set();for(const t of targets)for(let k=0;k<t.path.length;k++)ancestors.add(key({rootId:t.rootId,path:t.path.slice(0,k)}));
 const metadata=p=>Object.fromEntries(Object.entries(p).filter(([k])=>!['nodes','version',...(plan?['projectParameters','contourLinks','drawings']:[]),...(roots.has(before.workplane.reference?.objectId)?['workplane']:[])].includes(k)));
 if(!same(metadata(before),metadata(after))||!same(before.nodes.map(n=>n.id),after.nodes.map(n=>n.id)))fail('Unbeteiligte Projekteinstellungen oder Teile wurden verändert.','AI_FEATURE_SCOPE_VIOLATION');
 function visit(a,b,target){if(!b||a.id!==b.id)fail('Quellenbaum wurde außerhalb des gewählten Merkmals verändert.','AI_FEATURE_SCOPE_VIOLATION');const k=key(target),omit=['brep','stats','children',...(selected.has(k)?['recipe','transform','modeling','constructionBudget']:[])],own=n=>{const out=Object.fromEntries(Object.entries(n).filter(([field])=>!omit.includes(field)));if(metadataFields.has(n.id)){delete out.geometryIdentity;out.metadata=Object.fromEntries(Object.entries(n.metadata??{}).filter(([field])=>!metadataFields.get(n.id).includes(field)));}if(derivedMarks.has(n.id))out.annotations=n.annotations?.map(mark=>Object.fromEntries(Object.entries(mark).filter(([field])=>!['status','reason','normal','faceSignature'].includes(field))));return out;};
  if(!selected.has(k)&&!ancestors.has(k)){if(!same(a,b))fail('Unbeteiligte Quelle wurde verändert.','AI_FEATURE_SCOPE_VIOLATION');return;}
  if(!same(own(a),own(b))||!same((a.children??[]).map(n=>n.id),(b.children??[]).map(n=>n.id)))fail('Quelleneigenschaften außerhalb der erlaubten Änderung verändert.','AI_FEATURE_SCOPE_VIOLATION');
  for(let i=0;i<(a.children?.length??0);i++)visit(a.children[i],b.children[i],{rootId:target.rootId,path:[...target.path,a.children[i].id]});
 }
 before.nodes.forEach((n,i)=>visit(n,after.nodes[i],{rootId:n.id,path:[]}));
 if(plan){
  const omit=(value,fields)=>value&&Object.fromEntries(Object.entries(value).filter(([k])=>!fields.includes(k)));
  if(!same(omit(before.projectParameters?plan.data:undefined,['applied']),omit(after.projectParameters,['applied'])))fail('Parameterdefinitionen außerhalb des abgeleiteten Maßplans geändert.','AI_FEATURE_SCOPE_VIOLATION');
  for(const input of before.projectParameters?.applied?.inputs??[])if(!plan.parameterBindingIds.includes(input.bindingId)&&!same(input,after.projectParameters?.applied?.inputs.find(i=>i.bindingId===input.bindingId)))fail('Unbeteiligter Parameterbezug geändert.','AI_FEATURE_SCOPE_VIOLATION');
  const links=p=>p.contourLinks?.links.map(link=>plan.contourIds.includes(link.id)?omit(link,['snapshot']):link);if(!same(links(before),links(after)))fail('Unbeteiligter Konturbezug geändert.','AI_FEATURE_SCOPE_VIOLATION');
  const drawings=p=>p.drawings?.sheets.map(sheet=>({...sheet,views:sheet.views.map(view=>plan.drawingViews.some(v=>v.sheetId===sheet.id&&v.viewId===view.id)?omit(view,['projection','position']):view),annotations:sheet.annotations.map(a=>plan.drawingViews.some(v=>v.sheetId===sheet.id&&v.viewId===a.viewId)?omit(a,['curveIds','curveReferences','sourceSignatures','unresolved']):a)}));if(!same(drawings(before),drawings(after)))fail('Unbeteiligte Zeichnungsdaten geändert.','AI_FEATURE_SCOPE_VIOLATION');
 }
 return {unrelatedSourcesExact:true,affectedRootIds:[...roots]};
}

/** Typed local edits only. The chat supplies reference IDs and scalar values;
 * captured references and permissions are supplied by the local editor. */
export async function editCadAIFeaturesNative(input,operation,{oc,service,router,editRecipe,signal,freecadRun}={}){
 only(operation,['kind','references','edits']);if(operation.kind!=='featureEdits')fail('Merkmalsänderung erwartet.');
 const references=validateCadAIReferences(operation.references).items;if(!Array.isArray(operation.edits)||!operation.edits.length||operation.edits.length>32)fail('Eine bis 32 gezielte Änderungen angeben.');
 const baseline=cadProjectSnapshot(input),query=createCadAIReferencesNative({oc,service}),resolved=new Map(),edits=[],seen=new Set();aborted(signal);
 for(const edit of operation.edits){only(edit,['referenceId','field','value']);if(typeof edit.referenceId!=='string'||typeof edit.field!=='string'||edit.field.length>300||!Number.isFinite(edit.value)||Math.abs(edit.value)>100000)fail('Bezug, numerisches Feld und endlichen Wert angeben.');const ref=references.find(r=>r.id===edit.referenceId);if(!ref)fail('Der Auftrag verweist auf kein lokal gewähltes Merkmal.','AI_FEATURE_REFERENCE_REQUIRED');
  let result=resolved.get(ref.id);if(!result){result=query(baseline,{action:'resolve',reference:ref});resolved.set(ref.id,result);}if(!result.state.editable)fail(result.state.reason,'AI_FEATURE_LOCKED');
  const target=ref.origin?.target??ref.target,id=key(target)+'/'+edit.field;if(seen.has(id))fail('Dasselbe Merkmalmaß darf nur einmal gesetzt werden.');seen.add(id);edits.push({...edit,ref,resolved:result,target});
 }
 const spatial=edits.filter(e=>e.field.startsWith('face.')||e.field.startsWith('edge.'));
 if(spatial.length){
  if(edits.length!==1)fail('Eine neue Flächen- oder Kantenoperation verändert die Topologie. Danach weitere Bezüge neu bestätigen.');const e=spatial[0],node=baseline.nodes.find(n=>n.id===e.ref.target.rootId);if(e.value===0||Math.abs(e.value)<.01||Math.abs(e.value)>1000)fail('Flächen-/Kantenmaß: 0,01 bis 1000 mm.');
  assertCadAISpatialInputsCurrent(baseline,node.id);const constructionBefore={...service.constructionState().counts};
  let result;
  if(e.field==='face.offset'&&e.ref.kind==='face')result=await router.run(baseline,{kind:'batch',commands:[{op:'modeling',target:node.id,operation:{kind:'face-offset',faceIndex:e.resolved.native.faceIndex,offset:e.value}}]},{baseline});
  else if(['edge.round','edge.chamfer'].includes(e.field)&&e.ref.kind==='edge'&&e.value>0){const shape=readCadBrep(oc,node.brep.data),worldShape=service.worldShape(node);let reference,worldEdges=[];try{worldEdges=uniqueCadEdgesNative(oc,worldShape);const selected=worldEdges.filter(edge=>cadGeometryDigest(writeCadBrep(oc,edge))===e.ref.selector.signature);if(selected.length!==1)fail('Die Kante ist nicht mehr eindeutig.');const records=listCadEdgesNative(oc,shape,{origin:{rootId:node.id,path:[]}}),matches=records.filter(record=>{const domain=readCadEdgeDomainNative(oc,record.reference.anchor.edgeDomain);let world;try{world=transformCadGeometryAffineNative(oc,domain,node.transform);return cadEdgesCorrespondNative(oc,world,selected[0]);}finally{world?.delete();domain.delete();}});if(matches.length!==1)fail('Die lokale Quellenkante ist nicht mehr eindeutig.');reference=matches[0].reference;}finally{worldEdges.forEach(edge=>edge.delete());worldShape.delete();shape.delete();}
   result=await router.run(baseline,{kind:'finish',target:node.id,step:{id:crypto.randomUUID(),kind:e.field==='edge.round'?'round':'chamfer',amount:e.value,edges:[reference]}},{baseline});
  }else fail('Dieser Flächen-/Kantenauftrag passt nicht zum gewählten Bezug.');
  aborted(signal);result=await preserveCadAISpatialDependencies(baseline,result,{rootId:node.id,field:e.field,oc,service,editRecipe,signal,constructionBefore});const candidate=cadProjectSnapshot(result.project);assertJointScope(baseline,candidate);for(const n of baseline.nodes)if(n.id!==node.id&&!same(n,candidate.nodes.find(x=>x.id===n.id)))fail('Unbeteiligtes Teil wurde verändert.','AI_FEATURE_SCOPE_VIOLATION');
  const changed=candidate.nodes.find(n=>n.id===node.id);if(e.field==='face.offset'&&(changed?.children?.length!==1||cadSourceGeometryDigest(changed.children[0])!==cadSourceGeometryDigest(node)))fail('Die ursprüngliche Flächenquelle wurde nicht vollständig erhalten.','AI_FEATURE_SCOPE_VIOLATION');
  if(e.field==='face.offset'){const selector=e.ref.selector,point=selector.point.map((v,k)=>v+selector.normal[k]*e.value),shape=service.worldShape(changed);try{const matches=projectCadFaceAnchorNative(oc,shape,{point,normal:selector.normal});if(matches.length!==1)fail('Der native Flächenversatz ist am gewählten Punkt nicht eindeutig bestätigt.','AI_FEATURE_NATIVE_MISMATCH');const actual=matches[0].point.reduce((sum,v,k)=>sum+(v-selector.point[k])*selector.normal[k],0);if(Math.abs(actual-e.value)>1e-6)fail('Der native Flächenversatz weicht vom beauftragten Maß ab.','AI_FEATURE_NATIVE_MISMATCH');result.report.native=[{referenceId:e.ref.id,kind:'face-offset',expected:e.value,actual,passed:true}];}finally{shape.delete();}}
  return {...result,report:{...(result.report??{}),featureEdits:[{referenceId:e.ref.id,name:e.ref.name,field:e.field,value:e.value}],affectedIds:[node.id],unrelatedSourcesExact:true}};
 }
 const bindings=[],bores=new Map(),targets=[];
 for(const e of edits){const context=cadSelectionContext(baseline,e.target);targets.push(e.target);
  if(e.field==='diameter'){
   if(e.ref.kind!=='bore'||!e.ref.origin||e.resolved.candidates.find(c=>key(c.target)===key(e.target))?.ambiguous)fail('Bohrung zuerst einer eindeutigen oder ausdrücklich gewählten Quelle zuordnen.','AI_FEATURE_ORIGIN_REQUIRED');
   const node=context.node;if(node.source!=='native'||node.recipe?.type!=='cylinder'||node.solid||!Array.isArray(node.recipe.size)||Math.abs(node.recipe.size[0]-node.recipe.size[1])>1e-7||e.value<.1||e.value>10000)fail('Durchmesseränderung benötigt einen nativen runden Zylinder als Bohrungsquelle.');
   const ratio=e.value/e.ref.selector.surface.diameter,recipe=structuredClone(node.recipe);recipe.size[0]*=ratio;recipe.size[1]*=ratio;bores.set(node.id,{...e,recipe});for(let axis=0;axis<2;axis++){const field=cadProjectParameterCatalog(baseline,{targets:[e.target]})[0].fields.find(f=>f.field==='size.'+axis);bindings.push({target:e.target,field:field.field,value:field.value*ratio,intrinsic:true});}
  }else{
   if(e.ref.selector)fail('Ein numerisches Konstruktionsmaß benötigt einen ausdrücklich gewählten Quellen-/Skizzenbezug.');const field=cadProjectParameterCatalog(baseline,{targets:[e.target]})[0].fields.find(f=>f.field===e.field);if(!field?.bindable)fail(field?.reason??'Dieses native Maß ist nicht bearbeitbar.');bindings.push({target:e.target,field:e.field,value:e.value});
  }
 }
 if(bindings.some(b=>!b.intrinsic&&bores.has(b.target.path.at(-1)??b.target.rootId)))fail('Bohrungsdurchmesser und weitere Maße derselben Quelle getrennt bestätigen.');
 const plan=planCadAIFeatureDependencies(baseline,bindings,{targets});
 const authority=baseline.projectParameters?.version===2?planCadAIScalarFeatureOperation(baseline,operation):null,unresolved=[];if(authority&&!same(authority.bindings,bindings))fail('Die native Maßauflösung widerspricht dem bestätigten skalaren Auftrag.','AI_FEATURE_SCOPE_VIOLATION');
 const staleLinks=cadContourLinkProblems(baseline).filter(p=>plan.contourIds.includes(p.linkId));if(staleLinks.length)fail('Eine notwendige Kontur ist bereits veraltet. Zuerst bewusst aktualisieren oder neu zuordnen.','AI_FEATURE_DEPENDENCY_STALE');
 const controls=[...evaluateCadProjectParameters(plan.data).bindings.filter(b=>plan.parameterBindingIds.includes(b.id)),...bindings],recipes=new Map([...bores].map(([id,b])=>[id,b.recipe]));
 // Reconstruct symmetric cylinder size controls intrinsically as well. This
 // preserves analytic cylinders on other sources sharing the same parameter.
 for(const t of plan.targets){const node=cadSelectionContext(baseline,t).node;if(recipes.has(node.id)||node.source!=='native'||node.recipe?.type!=='cylinder')continue;const xy=[0,1].map(axis=>controls.find(b=>key(b.target)===key(t)&&b.field==='size.'+axis));if(xy.some(v=>!v))continue;const fields=cadProjectParameterCatalog(baseline,{targets:[t]})[0].fields,ratios=xy.map((b,k)=>b.value/fields.find(f=>f.field==='size.'+k).value);if(Math.abs(ratios[0]-ratios[1])>1e-9)continue;const recipe=structuredClone(node.recipe);recipe.size[0]*=ratios[0];recipe.size[1]*=ratios[1];recipes.set(node.id,recipe);}
 const result=await updateCadAssociative(baseline,{kind:'associativeUpdate',...(baseline.projectParameters?{data:plan.data}:{}),updateIds:[],drawingSheetIds:[...new Set(plan.drawingViews.map(v=>v.sheetId))]},{oc,service,editRecipe,signal,freecadRun,boundSubset:{...plan,programParameters:authority?.programParameters??[],seedTargets:targets,beforeNode:node=>recipes.has(node.id)?{...node,recipe:recipes.get(node.id)}:node,onRefreshError:(error,link)=>{if(error.code!=='CONTOUR_REBIND_REQUIRED'||!authority?.freecadContourIds.includes(link.id))return false;unresolved.push({kind:'contour',linkId:link.id,message:'Konturbezug '+link.id+' ausdrücklich neu zuordnen: '+error.message});return true;}}});aborted(signal);
 assertJointScope(baseline,result.project);
 if(cadProjectParameterProblems(result.project).some(p=>plan.parameterBindingIds.includes(p.bindingId))||cadContourLinkProblems(result.project).some(p=>plan.contourIds.includes(p.linkId)&&!unresolved.some(item=>item.linkId===p.linkId)))fail('Die notwendige Parameter- oder Konturfolge wurde nicht vollständig bestätigt.','AI_FEATURE_DEPENDENCY_MISMATCH');
 const preservation=assertCollectedScope(baseline,result.project,plan.targets,plan,result.report.freecad??[]),native=[];
 for(const bore of bores.values()){
  const s=bore.ref.selector.surface,p=bore.ref.selector.point,delta=p.map((v,k)=>v-s.center[k]),height=delta.reduce((n,v,k)=>n+v*s.axis[k],0),origin=s.center.map((v,k)=>v+height*s.axis[k]),direction=p.map((v,k)=>v-origin[k]);
  const measured=query(result.project,{action:'pick',kind:'bore',ids:[bore.ref.target.rootId],ray:{origin,direction,far:20000}}),actual=measured.reference.selector.surface;
  const centers=actual.center.map((v,k)=>v-s.center[k]),axial=centers.reduce((n,v,k)=>n+v*s.axis[k],0),axisShift=Math.hypot(...centers.map((v,k)=>v-axial*s.axis[k])),axisDot=Math.abs(actual.axis.reduce((n,v,k)=>n+v*s.axis[k],0));
  if(Math.abs(actual.diameter-bore.value)>1e-6||axisShift>1e-7||axisDot<1-1e-8||!measured.candidates.some(c=>key(c.target)===key(bore.target)))fail('Die native Nachprüfung bestätigt Durchmesser und erhaltene Bohrungsachse nicht.','AI_FEATURE_NATIVE_MISMATCH');
  native.push({referenceId:bore.ref.id,kind:'bore-diameter',expected:bore.value,actual:actual.diameter,passed:true});
 }
 if(result.report.freecad?.length){
  if(baseline.workplane.reference&&!result.project.workplane.reference)unresolved.push({kind:'workplane',message:'Die bisherige Arbeitsebenenfläche wurde geändert. Lage und Ausrichtung bleiben erhalten; Fläche ausdrücklich neu wählen.'});
  const affectedRoots=new Set(plan.targets.map(target=>target.rootId));function marks(node,old){for(const mark of node.annotations??[])if(old?.annotations?.some(previous=>previous.id===mark.id&&previous.status!==mark.status)&&!['current','valid'].includes(mark.status))unresolved.push({kind:'annotation',message:'Flächenmarkierung '+mark.id+' an '+node.name+' ausdrücklich neu zuordnen.'});for(const child of node.children??[])marks(child,old?.children?.find(n=>n.id===child.id));}for(const root of result.project.nodes)if(affectedRoots.has(root.id))marks(root,baseline.nodes.find(n=>n.id===root.id));
  for(const view of plan.drawingViews){const sheet=result.project.drawings.sheets.find(sheet=>sheet.id===view.sheetId);for(const mark of sheet.annotations)if(mark.viewId===view.viewId&&mark.unresolved)unresolved.push({kind:'drawing',message:'Zeichnungsmaß '+mark.id+' ausdrücklich neu zuordnen. Der ursprüngliche Bezug bleibt gespeichert.'});}
 }
 const warnings=[...new Set([...(result.warnings??[]),...unresolved.map(item=>item.message)])],review={...plan.review,freecad:(result.report.freecad??[]).map(run=>({...run,name:cadSelectionContext(result.project,run.target).node.name})),unresolvedReferences:unresolved,requiresAcceptance:!!(plan.review.requiresAcceptance||warnings.length||result.report.freecad?.length)};
 return {...result,aliases:{},changes:edits.map(e=>({op:'feature',referenceId:e.ref.id,field:e.field,value:e.value})),warnings,report:{...result.report,...preservation,featureDependencies:review,featureEdits:edits.map(e=>({referenceId:e.ref.id,name:e.ref.name,target:e.target,field:e.field,value:e.value})),native}};
}
