import {planCadAIScalarFeatureOperation} from './cad-ai-feature-plan.js';
import {prepareFreeCADRerun} from './cad-freecad-rerun.js';
import {buildCadDependencyGraph,cadDependencyAffected,cadDependencyNodeId} from './cad-dependency-graph.js';
import {planCadAIFeatureDependencies} from './cad-ai-feature-dependencies.js';
import {hasGeometryRefs,sameDeferredGeometry} from './cad-geometry-ref.js';
import {cadProjectRevision} from './cad-project.js';
import {flags} from './organization.js';
import {planCadProjectParameters} from './cad-project-parameters-data.js';
import {planCadParameterPatterns} from './cad-linked-pattern-update-data.js';
import {planCadContourLinks} from './cad-linked-contours-data.js';
/** Range-read scope for an actual user request, independent of the display
 * set. Unknown global queries deliberately require all their input geometry. */
export function fnpackRequestRoots(project,request,{getDisplayIds=()=>null}={}){
 const roots=project.nodes.map(n=>n.id),all=()=>roots;
 if(request.job==='display')return request.ids??getDisplayIds(project)??all();
 if(request.job==='query'&&request.query?.kind==='scene')return getDisplayIds(project)??all();
 if(request.job==='query'&&['fontInfo','fontLibrary','sketchOffset'].includes(request.query?.kind))return [];
 if(['exportModel','exportMeshes','exportStep'].includes(request.job))return (request.options?.ids??all()).filter(id=>{const node=project.nodes.find(n=>n.id===id),nativeOnly=request.job!=='exportModel'||request.options?.format==='step';return node&&!flags(node,project).hidden&&!node.suppressed&&(node.kind==='cad'?node.solid:!nativeOnly&&node.kind==='mesh'&&node.meshRole!=='hole');});
 if(request.job==='rebuild')return project.nodes.filter(n=>{const old=request.baseline?.nodes.find(b=>b.id===n.id);return JSON.stringify(n)!==JSON.stringify(old)&&!sameDeferredGeometry(old,n);}).map(n=>n.id);
 const operation=request.operation;
 if(request.job==='command'&&operation?.kind==='featureEdits'&&project.projectParameters?.version===2){const prepared=planCadAIScalarFeatureOperation(project,operation);if(prepared){const keys=new Set(prepared.freecadTargets.map(target=>JSON.stringify([target.rootId,target.path]))),inputs=prepared.plan.data.freecad.filter(run=>keys.has(JSON.stringify([run.target.rootId,run.target.path]))).flatMap(run=>run.inputs.map(input=>input.target.rootId));return [...new Set([...prepared.plan.targets.map(target=>target.rootId),...inputs,...(project.drawings?.sheets??[]).flatMap(sheet=>sheet.views.filter(view=>prepared.plan.drawingViews.some(d=>d.sheetId===sheet.id&&d.viewId===view.id)).flatMap(view=>view.sourceIds))])];}}
 if(request.job==='command'&&operation?.kind==='freecadBoundRerun'){
  const prepared=prepareFreeCADRerun(project,operation.request),plan=prepared.coordinated,keys=new Set(plan.freecadTargets.map(t=>JSON.stringify([t.rootId,t.path]))),inputs=plan.data.freecad.filter(run=>keys.has(JSON.stringify([run.target.rootId,run.target.path]))).flatMap(run=>run.inputs.map(input=>input.target.rootId));
  return [...new Set([...plan.targets.map(t=>t.rootId),...inputs,...(project.drawings?.sheets??[]).flatMap(sheet=>sheet.views.filter(view=>plan.drawingViews.some(d=>d.sheetId===sheet.id&&d.viewId===view.id)).flatMap(view=>view.sourceIds))])];
 }
 if(request.job==='command'&&operation?.kind==='freecadReplacement'){const plan=planCadAIFeatureDependencies(project,[],{targets:[operation.target]}),keys=new Set(plan.targets.map(t=>JSON.stringify([t.rootId,t.path]))),inputs=(project.projectParameters?.freecad??[]).filter(run=>keys.has(JSON.stringify([run.target.rootId,run.target.path]))).flatMap(run=>run.inputs.map(input=>input.target.rootId));return [...new Set([...plan.targets.map(t=>t.rootId),...inputs,...(project.drawings?.sheets??[]).flatMap(s=>s.views.filter(v=>plan.drawingViews.some(d=>d.sheetId===s.id&&d.viewId===v.id)).flatMap(v=>v.sourceIds))])];}
 if(request.job==='command'&&['projectParameters','associativeUpdate'].includes(operation?.kind)){
  const parameters=operation.data??project.projectParameters,wanted=new Set(parameters?planCadProjectParameters(project,parameters,{variantId:operation.variantId}).affectedRootIds:[]);
  if(parameters&&operation.kind==='projectParameters'&&project.linkedPatterns?.patterns.length){const plan=planCadParameterPatterns(project,parameters,{variantId:operation.variantId});for(const pattern of plan.patterns){wanted.add(pattern.sourceId);for(const item of pattern.instances)if(!pattern.excluded.includes(item.index))wanted.add(item.id);}}
  if(parameters?.version===2){const plan=planCadProjectParameters(project,parameters,{variantId:operation.variantId}),graph=buildCadDependencyGraph(project,{projectParameters:plan.data}),seeds=plan.changedBindings.map(b=>cadDependencyNodeId('binding',b.id));for(const state of plan.changedStates)if(state.geometryChanged)seeds.push(cadDependencyNodeId('geometry',state.target));const downstream=seeds.length?cadDependencyAffected(graph,seeds):[],needed=new Set(downstream.map(n=>n.id)),parents=new Map();for(const edge of graph.edges){const list=parents.get(edge.to)??[];list.push(edge.from);parents.set(edge.to,list);}const pending=downstream.filter(n=>n.kind==='freecadRun'||n.kind==='drawingView').map(n=>n.id);for(let i=0;i<pending.length;i++)for(const id of parents.get(pending[i])??[])if(!needed.has(id)){needed.add(id);pending.push(id);}for(const node of graph.nodes)if(needed.has(node.id)&&node.target)wanted.add(node.target.rootId);for(const node of downstream)if(node.kind==='drawingView')for(const id of project.drawings?.sheets.find(s=>s.id===node.sheetId)?.views.find(v=>v.id===node.viewId)?.sourceIds??[])wanted.add(id);}
  if(operation.kind==='associativeUpdate'||project.contourLinks?.links.length){const plan=planCadContourLinks(project,project.contourLinks,{projectParameters:parameters,allowPendingParameters:true}),selected=operation.linkIds?new Set(operation.linkIds):null;for(const link of plan.changedLinks)if(!selected||selected.has(link.id)){wanted.add(link.source.rootId);wanted.add(link.target.rootId);}for(const id of plan.affectedIds)wanted.add(id);}
  if(operation.drawingSheetIds?.length)for(const sheet of (operation.drawingsDraft??project.drawings)?.sheets??[])if(operation.drawingSheetIds.includes(sheet.id))for(const view of sheet.views)for(const id of view.sourceIds)wanted.add(id);
  return [...wanted];
 }
 if(request.job==='command'&&operation?.kind==='batch'&&operation.commands?.some(c=>c.op==='script'))return all();
 const byId=new Map(),byName=new Map();function index(node,root){byId.set(node.id,root);const matches=byName.get(node.name)??new Set();matches.add(root);byName.set(node.name,matches);node.children?.forEach(n=>index(n,root));}project.nodes.forEach(n=>index(n,n.id));
 const found=new Set();let explicit=false;
 const selectors=['target','targets','rootId','nodeId','id','ids','leftId','rightId','parentId','childId','sourceId','sourceIds'];
 function visit(value,key=''){
  if(typeof value==='string'){if(!selectors.includes(key))return;if(byId.has(value))found.add(byId.get(value));else if(byName.has(value))for(const root of byName.get(value))found.add(root);return;}
  if(Array.isArray(value)){if(value.length&&typeof value[0]==='number')return;for(const item of value)visit(item,key);return;}
  if(value&&typeof value==='object')for(const [field,item]of Object.entries(value)){if(selectors.includes(field))explicit=true;visit(item,field);}
 }
 visit(request.operation??request.query?.options??request.node??request);
 if(found.size)return [...found];
 if(request.job==='command'&&['importStepAssembly','importStep','freecadImportStep','importStlHousing'].includes(request.operation?.kind))return [];
 if(request.job==='command'&&request.operation?.kind==='batch'&&request.operation.commands?.every(c=>c.op==='create'))return [];
 return explicit?[]:all();
}
export function withFnpackGeometry(worker,{resolveProject,getProject,getDisplayIds}={}){
 return {...worker,async run(request,options={}){
  const original=request.project??getProject?.();if(!original||!hasGeometryRefs(original)&&!hasGeometryRefs(request.node)&&!hasGeometryRefs(request.baseline))return worker.run(request,options);
  const roots=fnpackRequestRoots(original,request,{getDisplayIds}),project=await resolveProject(original,roots,{signal:options.signal}),baseline=request.baseline?await resolveProject(request.baseline,roots.filter(id=>request.baseline.nodes.some(n=>n.id===id)),{signal:options.signal}):undefined;
  const prepared={...request,...(request.project?{project}:{}),...(baseline?{baseline}:{}),...(request.node&&hasGeometryRefs(request.node)?{node:project.nodes.find(n=>n.id===request.node.id)}:{})};
  const revision=cadProjectRevision(baseline??project),result=await worker.run(prepared,{...options,revision});
  if(request.job==='query'&&options.revision!==undefined&&result&&typeof result==='object'&&typeof result.revision==='string')return {...result,revision:options.revision};return result;
 }};
}
