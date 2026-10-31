import {isFreeCADParameterField,freeCADParameterKey,freeCADTargetKey} from './cad-freecad-parameter-data.js';
import {buildFreeCADParametersNative} from './cad-freecad-parameters-native.js';
import {solveSketchConstraints} from './sketch-constraints-solver.js';
import {cadProjectSnapshot} from './cad-project.js';
import {cadIdentity,cadPoint,multiplyCadMatrices,resizeCadAtCorner} from './cad-affine.js';
import {cadSelectionContext,cadFormLocalDimensions,cadInterfaceLocalBounds} from './cad-interface-state.js';
import {cadSketchRecipe} from './cad-sketch.js';
import {validateCadModelingOperation} from './cad-modeling-data.js';
import {validateCadDrillPattern} from './cad-drill-pattern.js';
import {isCadDrillScalarField} from './cad-drill-parameter-fields.js';
import {validateAssociativeBoxDrill} from './cad-associative-drill.js';
import {validateAssociativeStepDrill} from './cad-step-drill.js';
import {cadProjectParameterCatalog,cadParameterLiteral} from './cad-project-parameters-catalog.js';
import {planCadProjectParameters,stampCadProjectParameters} from './cad-project-parameters-data.js';

const translation=p=>[1,0,0,0,0,1,0,0,0,0,1,0,...p,1],approximate=new Set(['heart','gear','thread','nut']),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Preserve a 2e-7mm topology reserve as well as the bounded curve error. The
// theoretical 2e-7mm total minimum leaves only OCCT's nominal confusion value
// for topology and is not constructible for ordinary native gear seams.
const REFINEMENT_BUDGET=4e-7;
const aborted=signal=>{if(signal?.aborted)throw Object.assign(Error('Projektmaße abgebrochen.'),{name:'AbortError',code:'ABORTED'});};
function sketchSlot(sketch,field){
 if(field.startsWith('sketch.constraints.')){const relation=sketch.constraints?.find(c=>'sketch.constraints.'+c.id+'.value'===field);if(!relation||!['length','distance','radius','angle'].includes(relation.type))throw Error('Skizzenbedingungsmaß fehlt.');return {object:relation,key:'value'};}
 if(field.startsWith('sketch.variables.')){const variable=sketch.variables.find(v=>v.name===field.slice(17));if(!variable)throw Error('Das gebundene Skizzenmaß fehlt.');return {object:variable,key:'value'};}
 if(field.startsWith('sketch.dimensions.'))return {object:sketch.dimensions,key:field.slice(18)};
 const match=field.match(/^sketch\.elements\.(.+)\.(diameter|start|through|end|center|control(?:[1-9]|1[0-4]))(?:\.([01]))?$/),element=match&&sketch.elements?.find(e=>e.id===match[1]);if(!element)throw Error('Das gebundene Skizzenelement fehlt.');
 if(match[2]==='diameter'&&match[3]===undefined)return {object:element,key:'diameter'};if(match[2]!=='diameter'&&match[3]!==undefined&&Array.isArray(element[match[2]]))return {object:element[match[2]],key:Number(match[3])};throw Error('Unbekanntes Skizzenmaß.');
}
/** Shared collected binding builder, also used by retained personal templates.
 * Recipes are edited together; one bottom-up pass constructs native geometry.
 * Pos/size use fresh bounds and preserve full affine maps and corner anchors. */
export async function buildCadBoundSubset(input,bindings,{service,editRecipe,signal,allowLockedTemplate=false,states=[],dependentTargets=[],deferredContourTargets=[],nodeOrder,beforeNode,freecadRun,freecadData,freecadTargets=[],freecadProgramParameters=[]}={}){
 if(typeof service?.rebuildSubset!=='function'||typeof editRecipe!=='function'||!Array.isArray(bindings))throw Error('Gezielter nativer Maßaufbau fehlt.');
 aborted(signal);const baseline=cadProjectSnapshot(input),draft=cadProjectSnapshot(input),edits=new Map(),touched=new Set(),geometry=new Set(),roots=new Set(),before=service.constructionState(),freecadReports=[],freecadWarnings=[],freecadMetadata=new Map();
 const deferredProfiles=new Set(deferredContourTargets.map(target=>JSON.stringify([target.rootId,target.path])));
 const geometryReasons=new Map();
 function invalidate(id,reason){geometry.add(id);const reasons=geometryReasons.get(id)??new Set();reasons.add(reason);geometryReasons.set(id,reasons);}
 function touch(context,{build=false}={}){if(context.node.kind!=='cad')return;roots.add(context.root.id);for(const node of context.chain)touched.add(node.id);const reason=(build?'source:':'effect:')+context.node.id;if(build)invalidate(context.node.id,reason);for(const parent of context.chain.slice(0,-1))invalidate(parent.id,reason);}
 function unchangedSource(id){const reason='source:'+id;for(const [target,reasons]of geometryReasons){reasons.delete(reason);if(!reasons.size){geometryReasons.delete(target);geometry.delete(target);}}}
 for(const binding of bindings){
  aborted(signal);if(!Number.isFinite(binding.value))throw Error('Das Projektmaß muss endlich sein.');const original=cadSelectionContext(baseline,binding.target),context=cadSelectionContext(draft,binding.target),node=context.node,templateMesh=allowLockedTemplate&&['mesh','referenceMesh'].includes(node.kind)&&/^(?:size|pos)\.[012]$/.test(binding.field),property=templateMesh?{bindable:true}:cadProjectParameterCatalog(baseline,{targets:[binding.target]})[0].fields.find(f=>f.field===binding.field);
  if(!property||node.kind!=='cad'&&!templateMesh||original.sourceGeometryReadonly||original.locked&&!allowLockedTemplate||!property.bindable&&!(allowLockedTemplate&&original.locked))throw Error(property?.reason??'Das gebundene native Maß fehlt.');
  let edit=edits.get(node.id);if(!edit){edit={target:binding.target,nodeId:node.id,original:original.node,params:{},size:new Map(),pos:new Map(),sketch:null,modeling:null};edits.set(node.id,edit);}
  if(/^size\.[012]$/.test(binding.field)){edit.size.set(Number(binding.field.at(-1)),binding.value);touch(context);}
  else if(/^pos\.[012]$/.test(binding.field)){edit.pos.set(Number(binding.field.at(-1)),binding.value);touch(context);}
  else if(isFreeCADParameterField(binding.field)){edit.freecad??={};edit.freecad[freeCADParameterKey(binding.field)]=binding.value;touch(context);}
  else if(binding.field.startsWith('params.')){edit.params[binding.field.slice(7)]=binding.value;touch(context,{build:true});}
  else if(binding.field.startsWith('drill.pattern.')){edit.drillPattern??=structuredClone(node.drill.pattern);const parts=binding.field.slice(14).split('.');if(parts.length===1)edit.drillPattern[parts[0]]=binding.value;else edit.drillPattern[parts[0]][Number(parts[1])]=binding.value;touch(context,{build:true});}
  else if(isCadDrillScalarField(binding.field)){edit.drillScalars??={};edit.drillScalars[binding.field.slice(6)]=binding.value;touch(context,{build:true});}
  else if(binding.field.startsWith('sketch.elements.')&&deferredProfiles.has(JSON.stringify([binding.target.rootId,binding.target.path]))){edit.deferredProfile=true;touch(context,{build:true});}
  else if(binding.field.startsWith('sketch.')){edit.sketch??=structuredClone(node.recipe.sketch);const slot=sketchSlot(edit.sketch,binding.field);if(!slot.object||!cadParameterLiteral(slot.object[slot.key]))throw Error('Abgeleitete Skizzenformel erhalten. Das freie Ausgangsmaß binden.');slot.object[slot.key]=String(binding.value);touch(context,{build:true});}
  else if(binding.field.startsWith('modeling.')){edit.modeling??=structuredClone(node.modeling);if(binding.field.startsWith('modeling.path.'))edit.modeling.path[binding.field.slice(14)]=binding.value;else edit.modeling[binding.field.slice(9)]=binding.value;touch(context,{build:true});}
  else throw Error('Unbekanntes gebundenes Maß.');
 }
 for(const edit of edits.values()){
  const node=cadSelectionContext(draft,edit.target).node;
  if(Object.keys(edit.params).length){const recipe=await editRecipe({...node,locked:false},{params:edit.params});aborted(signal);if(!same(recipe,node.recipe)){node.recipe=recipe;edit.preserveMinimum=true;}}
  if(edit.sketch){if(edit.sketch.version>=3){const result=solveSketchConstraints(edit.sketch,{signal});if(!result.ok)throw Object.assign(Error(result.message),{code:result.code,conflicts:result.conflicts});edit.sketch=result.sketch;}const recipe=cadSketchRecipe(edit.sketch);if(!same(recipe,node.recipe))node.recipe=recipe;}
  if(edit.modeling){const {sourceSignature,...operation}=edit.modeling;node.modeling={version:1,...validateCadModelingOperation(operation),...(sourceSignature?{sourceSignature}:{})};}
  if(edit.drillPattern||edit.drillScalars){const drill={...node.drill,...edit.drillScalars,...(edit.drillPattern?{pattern:validateCadDrillPattern(edit.drillPattern)}:{})};node.drill=drill.version===3?validateAssociativeStepDrill(drill):validateAssociativeBoxDrill(drill);}
 }
 // Reapplying an unchanged control removes only that control's own reason.
 // A descendant, placement or deferred contour may still require this ancestor.
 for(const edit of edits.values()){const node=cadSelectionContext(draft,edit.target).node;if(!edit.deferredProfile&&['recipe','modeling','drill'].every(key=>same(node[key],edit.original[key])))unchangedSource(node.id);}
 // Only unknown final resizes need this persisted strict budget. Ordinary
 // source edits retain their existing construction tolerance and geometry.
 for(const edit of edits.values())if(edit.size.size){
  const context=cadSelectionContext(draft,edit.target);
  function refine(node,chain,protectedSource=false){
   if(node.source==='native'&&approximate.has(node.recipe?.type)&&(node.constructionBudget===undefined||node.constructionBudget>REFINEMENT_BUDGET)){if(protectedSource)throw Error('Die geschützte Originalquelle erlaubt keine erforderliche Genauigkeitsänderung.');node.constructionBudget=REFINEMENT_BUDGET;geometry.add(node.id);for(const parent of [...chain,node])touched.add(parent.id);for(const parent of chain)geometry.add(parent.id);}
   for(const child of node.children??[])refine(child,[...chain,node],protectedSource||node.source==='extraction'||!!node.modeling?.sourceSignature);
  }
  refine(context.node,context.chain.slice(0,-1));
 }
 for(const state of states){const context=cadSelectionContext(draft,state.target);if(context.locked)throw Error('Das Varianten-Ziel ist gesperrt.');if(state.geometryChanged){if(state.suppressed!==undefined)context.node.suppressed=state.suppressed;touch(context);for(const parent of context.chain.slice(0,-1))geometry.add(parent.id);}}
 for(const target of dependentTargets){const context=cadSelectionContext(draft,target);if(context.locked||context.sourceGeometryReadonly)throw Error('Das abhängige native Ziel ist gesperrt.');touch(context,{build:true});}
 function place(node){
  const edit=edits.get(node.id);if(!edit)return node;
  if(edit.preserveMinimum){const offset=edit.original.stats.bounds.min.map((v,k)=>v-node.stats.bounds.min[k]);node.transform=multiplyCadMatrices(node.transform,translation(offset));}
  if(edit.size.size){const size=cadFormLocalDimensions(node);for(const [axis,value]of edit.size)size[axis]=value;node.transform=resizeCadAtCorner(node,size).transform;}
  if(edit.pos.size){const bounds=cadInterfaceLocalBounds(node),center=cadPoint(node.transform,bounds.min.map((v,k)=>(v+bounds.max[k])/2));for(const [axis,value]of edit.pos)node.transform[12+axis]+=value-center[axis];}
  return node;
 }
 const freecadIds=new Set(freecadTargets.map(t=>t.path.at(-1)??t.rootId));
 async function prepareNode(node,context){
  if(beforeNode)node=await beforeNode(node,context)??node;
  if(freecadIds.has(node.id)){
   const original=cadSelectionContext(baseline,context.target),program=node.metadata.freecadSource.script??node.metadata.freecadSource.plan,oldArchive=node.metadata.freecadSource.documentBase64;
   const built=await buildFreeCADParametersNative(node,context,{data:freecadData,parameters:{...(program.parameters??{}),...(freecadProgramParameters.find(entry=>freeCADTargetKey(entry.target)===freeCADTargetKey(context.target))?.parameters??{}),...(edits.get(node.id)?.freecad??{})},service,oc:service.kernel,run:freecadRun});
   node=built.node;freecadReports.push({...built.report,target:context.target});for(const parent of original.chain.slice(0,-1))if(parent.metadata?.freecadSource?.documentBase64===oldArchive)freecadMetadata.set(parent.id,node.metadata.freecadSource);
   if(built.report.replacesNative)freecadWarnings.push('Programm-Neulauf an '+node.name+' ersetzt die nativen Dokumentänderungen seit dem letzten Skript-/Planlauf.');
   if(built.pendingColors)freecadWarnings.push(built.pendingColors+' Flächenfarben an '+node.name+' ausdrücklich neu zuordnen. Originalwerte bleiben gespeichert.');
  }
  if(freecadMetadata.has(node.id))node={...node,metadata:{...node.metadata,freecadSource:freecadMetadata.get(node.id)}};
  return node;
 }
 let project=draft;
 if(roots.size)project=await service.rebuildSubset(draft,{baseline,rootIds:[...roots],touchedIds:[...touched],geometryIds:[...geometry],signal,afterNode:place,nodeOrder,beforeNode:prepareNode});
 for(const edit of edits.values()){const node=cadSelectionContext(project,edit.target).node;if(node.kind!=='cad'){place(node);service.validateReferenceBounds(node);}}
 for(const state of states){const node=cadSelectionContext(project,state.target).node;if(state.hidden!==undefined)node.hidden=state.hidden;if(state.suppressed!==undefined)node.suppressed=state.suppressed;}
 aborted(signal);const counts=Object.fromEntries(Object.entries(service.constructionState().counts).map(([id,n])=>[id,n-(before.counts[id]??0)]).filter(([,n])=>n>0));if(Object.values(counts).some(n=>n>1))throw Error('Ein betroffenes Teil wurde während derselben Maßaktualisierung mehrfach konstruiert.');
 const stateChangedIds=[...new Set(states.map(state=>state.target.rootId))];return {project:cadProjectSnapshot(project),report:{affectedIds:[...new Set([...roots,...stateChangedIds])],stateChangedIds,rebuiltIds:[...new Set([...geometry,...freecadReports.map(r=>r.target.path.at(-1)??r.target.rootId)])],constructedIds:Object.keys(counts),counts,...(freecadReports.length?{freecad:freecadReports,freecadCounts:Object.fromEntries(freecadReports.map(r=>[r.target.path.at(-1)??r.target.rootId,1])),requiresFreeCADAcceptance:freecadWarnings.length>0,freecadWarnings}:{})}};
}

export async function updateCadProjectParameters(project,data,{service,editRecipe,signal,variantId,dependentTargets=[]}={}){
 aborted(signal);const plan=planCadProjectParameters(project,data,{variantId});if(plan.problems.length)throw Object.assign(Error(plan.problems[0].message),{code:plan.problems[0].code,problems:plan.problems});
 const affected=new Set();for(const binding of plan.changedBindings)for(const node of cadSelectionContext(project,binding.target).chain)affected.add(node.id);for(const state of plan.changedStates)if(state.geometryChanged)for(const node of cadSelectionContext(project,state.target).chain)affected.add(node.id);
 for(const target of dependentTargets)for(const node of cadSelectionContext(project,target).chain)affected.add(node.id);
 // Reapply unchanged size/position controls on rebuilt targets/ancestors after
 // intrinsic recipe edits, without touching unrelated bound sibling sources.
 const bindings=plan.evaluation.bindings.filter(binding=>affected.has(binding.target.path.at(-1)??binding.target.rootId)),result=await buildCadBoundSubset(project,bindings,{service,editRecipe,signal,states:plan.changedStates,dependentTargets});result.project.projectParameters=stampCadProjectParameters(result.project,plan.data,{variantId});result.project=cadProjectSnapshot(result.project);return {...result,report:{...result.report,metadataOnly:dependentTargets.length?false:plan.metadataOnly,staleBindingIds:plan.staleBindingIds}};
}
