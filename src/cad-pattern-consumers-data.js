import {buildCadDependencyGraph,cadDependencyAffected,cadDependencyNodeId} from './cad-dependency-graph.js';
import {cadSelectionContext} from './cad-interface-state.js';
import {freeCADSourceDigest} from './cad-freecad-source.js';
import {isFreeCADParameterField} from './cad-freecad-parameter-data.js';
import {validateCadProjectParameterTarget,validateCadProjectParameters,evaluateCadProjectParameters} from './cad-project-parameters-data.js';
import {planCadReferenceRebind} from './cad-reference-rebind-data.js';

const key=t=>JSON.stringify([t.rootId,t.path]);
const plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
const fail=(message,code='PATTERN_CONSUMER_REASSIGN_REQUIRED')=>{throw Object.assign(Error(message),{code});};
const fields=(v,names)=>{if(!plain(v)||Object.keys(v).some(name=>!names.includes(name)))fail('Ungültige gemeinsame Muster-Bezugszuordnung.');};
const address=value=>validateCadProjectParameterTarget(value);
const unavailable=context=>context.locked||context.hidden||context.sourceGeometryReadonly||context.chain.some(node=>node.suppressed);
function ray(value){fields(value,['origin','direction','near','far','tolerance']);const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=200000);if(!vector(value.origin)||!vector(value.direction)||Math.hypot(...value.direction)<1e-10)fail('Einen endlichen freien Konturflächenstrahl wählen.');for(const name of ['near','far','tolerance'])if(value[name]!==undefined&&(!Number.isFinite(value[name])||value[name]<0))fail('Ungültiger Konturstrahlbereich.');if(value.far!==undefined&&value.far<=(value.near??0))fail('Ungültiger Konturstrahlbereich.');return structuredClone(value);}

/** Explicit addresses own identity. A sourcePath names a current template
 * child, never a child ordinal or a guessed corresponding surface. */
export function planCadPatternConsumers(project,patterns,{data=project.projectParameters,consumerBindings}={}){
 if(consumerBindings===null)fail('Gemeinsame Bezugszuordnungen dürfen nicht null sein.');const request=consumerBindings??{};fields(request,['sources','freecadInputs','referenceBindings','contours']);for(const name of ['sources','freecadInputs','contours'])if(request[name]===null)fail('Vorhandene Bezugslisten dürfen nicht null sein.');
 const copies=new Set(patterns.flatMap(pattern=>pattern.instances.map(item=>item.id))),byCopy=new Map(patterns.flatMap(pattern=>pattern.instances.map(item=>[item.id,pattern])));
 const sources=request.sources??[];if(!Array.isArray(sources)||sources.length>500)fail('Höchstens 500 kopierte Quellen ausdrücklich zuordnen.');
 const seen=new Set(),sourceBindings=sources.map(binding=>{fields(binding,['target','sourcePath']);const target=address(binding.target),pattern=byCopy.get(target.rootId);if(!pattern||!target.path.length||seen.has(key(target)))fail('Jede verlorene kopierte Kindquelle einmal ausdrücklich zuordnen.');seen.add(key(target));const source=address({rootId:pattern.sourceId,path:binding.sourcePath});const selected=cadSelectionContext(project,source);if(selected.node.kind!=='cad'||unavailable(selected))fail('Eine vorhandene, sichtbare und entsperrte Vorlagenquelle ausdrücklich wählen.');return {target,source};});
 let parameterData=data&&structuredClone(data);const inputs=request.freecadInputs??[];if(!Array.isArray(inputs)||inputs.length>32)fail('Höchstens 32 gespeicherte Programme ausdrücklich zuordnen.');
 const inputTargets=new Set();for(const binding of inputs){fields(binding,['target','sourceDigest','inputs']);const target=address(binding.target),selected=cadSelectionContext(project,target),saved=selected.node.metadata?.freecadSource,config=parameterData?.freecad?.find(run=>key(run.target)===key(target));if(!saved||!config||!parameterData.bindings.some(b=>key(b.target)===key(target)&&isFreeCADParameterField(b.field))||unavailable(selected)||inputTargets.has(key(target)))fail('Ein vorhandenes, global gebundenes und entsperrtes Programm einmal wählen.');inputTargets.add(key(target));if(binding.sourceDigest!==freeCADSourceDigest(saved.documentBase64))fail('Die gespeicherte FreeCAD-Quelle wurde geändert. Neu lesen.','STALE_REVISION');if(!Array.isArray(binding.inputs)||binding.inputs.length!==config.inputs.length)fail('Alle gespeicherten FreeCAD-Eingabenamen unverändert bestätigen.');const names=new Set();const next=binding.inputs.map(input=>{fields(input,['name','target']);const previous=config.inputs.find(old=>old.name===input.name);if(typeof input.name!=='string'||names.has(input.name)||!previous)fail('Alle gespeicherten FreeCAD-Eingabenamen unverändert bestätigen.');names.add(input.name);const current=address(input.target),retained=key(current)===key(previous.target);if(!sourceBindings.some(mapping=>key(mapping.target)===key(current))){const context=cadSelectionContext(project,current);if(!['cad','mesh','referenceMesh'].includes(context.node.kind)||!retained&&unavailable(context))fail('Eine aktuelle sichtbare und entsperrte neue Programmeingabe wählen.');}return {name:input.name,target:current};});config.inputs=next;}
 if(parameterData)parameterData=validateCadProjectParameters(parameterData);
 const contours=request.contours??[];if(!Array.isArray(contours)||contours.length>32)fail('Höchstens 32 Konturflächen ausdrücklich neu wählen.');const contourIds=new Set(),contourLinks=project.contourLinks&&structuredClone(project.contourLinks),contourBindings=contours.map(binding=>{fields(binding,['id','source','ray']);const link=contourLinks?.links.find(link=>link.id===binding.id);if(!link||contourIds.has(binding.id))fail('Jede vorhandene Kontur einmal ausdrücklich neu zuordnen.');contourIds.add(binding.id);const source=binding.source===undefined?link.source:address(binding.source);if(!sourceBindings.some(mapping=>key(mapping.target)===key(source))){const context=cadSelectionContext(project,source);if(context.node.kind!=='cad'||unavailable(context))fail('Eine aktuelle sichtbare und entsperrte Konturquelle wählen.');}link.source=source;return {id:link.id,source,ray:ray(binding.ray)};});
 const staged={...project,...(parameterData?{projectParameters:parameterData}:{}),...(contourLinks?{contourLinks}:{})},graph=buildCadDependencyGraph(staged),seeds=contourBindings.map(binding=>cadDependencyNodeId('contour',binding.id));
 for(const node of graph.nodes)if(node.target&&copies.has(node.target.rootId)&&['geometry','worldFrame','localPose'].includes(node.kind))seeds.push(node.id);
 for(const run of parameterData?.freecad??[])if(inputTargets.has(key(run.target))||run.inputs.some(input=>copies.has(input.target.rootId)))seeds.push(cadDependencyNodeId('freecadRun',run.target));
 const known=new Set(graph.nodes.map(node=>node.id)),affected=seeds.length?cadDependencyAffected(graph,[...new Set(seeds)].filter(id=>known.has(id))):[];
 const freecadTargets=affected.filter(node=>node.kind==='freecadRun').map(node=>node.target);if(freecadTargets.some(target=>copies.has(target.rootId)))fail('Ein eigenständig bearbeitetes Programmziel innerhalb einer Musterkopie zuerst lösen.');
 const targets=affected.filter(node=>node.kind==='geometry'&&!node.missing&&!copies.has(node.target.rootId)).map(node=>node.target),targetRoots=new Set(targets.map(target=>target.rootId)),rootIds=new Set([...copies,...targetRoots]);
 const featureIds=(project.featureReferences?.items??[]).filter(ref=>rootIds.has(ref.target.rootId)||rootIds.has(ref.origin?.target.rootId)).map(ref=>ref.id),jointIds=(project.joints?.joints??[]).filter(joint=>rootIds.has(joint.parentId)||rootIds.has(joint.childId)).map(joint=>joint.id);
 if(request.referenceBindings!==undefined)planCadReferenceRebind(project,request.referenceBindings);
 const required=new Set(affected.filter(node=>['freecadRun','contour','drawingView'].includes(node.kind)).map(node=>node.id)),parents=new Map();for(const edge of graph.edges){const list=parents.get(edge.to)??[];list.push(edge.from);parents.set(edge.to,list);}const queue=[...required];for(let i=0;i<queue.length;i++)for(const id of parents.get(queue[i])??[])if(!required.has(id)){required.add(id);queue.push(id);}
 const requiredRootIds=[...new Set([...patterns.map(pattern=>pattern.sourceId),...copies,...graph.nodes.filter(node=>required.has(node.id)&&node.target).map(node=>node.target.rootId),...(request.referenceBindings?planCadReferenceRebind(project,request.referenceBindings).geometryRootIds:[])])];
 return {copyRootIds:[...copies],targetRootIds:[...targetRoots],targets,freecadTargets,linkIds:affected.filter(node=>node.kind==='contour').map(node=>node.linkId),drawingViews:affected.filter(node=>node.kind==='drawingView').map(({sheetId,viewId})=>({sheetId,viewId})),featureIds,jointIds,sourceBindings,contourBindings,parameterData,referenceBindings:request.referenceBindings,requiredRootIds};
}

/** Only the validated consumer records disappear from the materializer's
 * reference guard. Every other section/reference remains fully visible. */
export function cadPatternConsumerReferenceScope(project,plan){
 if(!plan)return project;const copy=structuredClone(project),runs=new Set(plan.freecadTargets.map(key));
 if(copy.projectParameters?.freecad)for(const run of copy.projectParameters.freecad)if(runs.has(key(run.target)))run.inputs=[];
 if(copy.featureReferences)copy.featureReferences.items=copy.featureReferences.items.filter(ref=>!plan.featureIds.includes(ref.id));
 if(copy.joints){copy.joints.joints=copy.joints.joints.filter(joint=>!plan.jointIds.includes(joint.id));copy.joints.bases=copy.joints.bases.filter(id=>!plan.copyRootIds.includes(id)&&!plan.targetRootIds.includes(id));copy.joints.gears=(copy.joints.gears??[]).filter(gear=>copy.joints.joints.some(joint=>joint.id===gear.jointA)&&copy.joints.joints.some(joint=>joint.id===gear.jointB));}
 return copy;
}

/** Private first phase excludes consumers whose final inputs do not exist
 * until after materialization. Preserve their old receipts for final checks. */
export function cadPatternConsumerParameterPhase(project,data,plan){
 const keys=new Set(plan.targets.map(key)),without=value=>{if(!value)return value;const result=structuredClone(value),removed=new Set(result.bindings.filter(binding=>keys.has(key(binding.target))).map(binding=>binding.id));result.bindings=result.bindings.filter(binding=>!removed.has(binding.id));if(result.freecad)result.freecad=result.freecad.filter(run=>!keys.has(key(run.target)));if(result.applied)result.applied.inputs=result.applied.inputs.filter(input=>!removed.has(input.bindingId));if(result.baseStates)result.baseStates=result.baseStates.filter(state=>!keys.has(key(state.target)));for(const variant of result.variants)variant.states=variant.states.filter(state=>!keys.has(key(state.target)));return validateCadProjectParameters(result);};
 return {project:{...project,...(project.projectParameters?{projectParameters:without(project.projectParameters)}:{})},data:without(data)};
}

/** Called only on newly generated clones, with their exact source-ID map. */
export function mapCadPatternConsumerSources(project,plan,mappings){
 const resolve=target=>{const binding=plan.sourceBindings.find(entry=>key(entry.target)===key(target));if(!binding)return target;const mapping=mappings.find(entry=>entry.rootId===target.rootId);if(!mapping)fail('Die ausdrücklich gewählte Musterposition entfällt. Quelle neu zuordnen.');const path=binding.source.path.map(id=>mapping.ids.get(id));if(path.some(id=>!id))fail('Die ausdrücklich gewählte Vorlagenquelle fehlt in der neuen Kopie.');return {rootId:target.rootId,path};};
 const data=project.projectParameters&&structuredClone(project.projectParameters);if(data?.freecad)for(const run of data.freecad)for(const input of run.inputs)input.target=resolve(input.target);if(data)project.projectParameters=validateCadProjectParameters(data);
 const contourBindings=plan.contourBindings.map(binding=>({...binding,source:resolve(binding.source)}));for(const link of project.contourLinks?.links??[])link.source=contourBindings.find(binding=>binding.id===link.id)?.source??resolve(link.source);
 for(const ref of project.featureReferences?.items??[]){ref.target=resolve(ref.target);if(ref.origin)ref.origin.target=resolve(ref.origin.target);}
 const referenceBindings=plan.referenceBindings&&structuredClone(plan.referenceBindings);for(const binding of referenceBindings?.features??[]){binding.target=resolve(binding.target);if(binding.originTarget)binding.originTarget=resolve(binding.originTarget);}
 return {project,referenceBindings,contourBindings};
}

export function cadPatternConsumerBindings(project,plan){const wanted=new Set(plan.targets.map(key));return project.projectParameters?evaluateCadProjectParameters(project.projectParameters).bindings.filter(binding=>wanted.has(key(binding.target))):[];}
