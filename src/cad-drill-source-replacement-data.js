import {cadSelectionContext} from './cad-interface-state.js';
import {inverseCadMatrix,multiplyCadMatrices} from './cad-affine.js';
import {cadGeometryDigest} from './cad-geometry-digest.js';
import {cadProjectParameterProblems} from './cad-project-parameters-data.js';
import {cadLinkedPatternProblems} from './cad-linked-pattern-data.js';
import {reparentCadContourLinks} from './cad-linked-contours-data.js';
import {cadDrillSourceBranch} from './cad-drill-source-branch.js';

const key=target=>JSON.stringify([target.rootId,target.path]);
const fail=(message,code='CAD_DRILL_SOURCE_REPLACEMENT_INVALID')=>{throw Object.assign(Error(message),{code});};
export function remapCadDrillStockParameters(data,plan){
 if(!data||key(plan.previousStockTarget)===key(plan.stockTarget))return data;
 const next=structuredClone(data),target=value=>key(value)===key(plan.previousStockTarget)?structuredClone(plan.stockTarget):value;
 for(const binding of next.bindings)binding.target=target(binding.target);
 for(const variant of next.variants)for(const state of variant.states)state.target=target(state.target);
 for(const state of next.baseStates??[])state.target=target(state.target);
 for(const run of next.freecad??[]){run.target=target(run.target);for(const input of run.inputs)input.target=target(input.target);}
 return next;
}
/** Prepare only explicitly selected stock geometry. Original candidate remains
 * independent. Existing stock-slot identity and authored decorations survive;
 * its construction recipe/document comes from the new chosen source. */
export function prepareCadDrillSourceReplacement(input,id,request,bindings){
 if(!request||Object.getPrototypeOf(request)!==Object.prototype||Object.keys(request).some(k=>!['path','source'].includes(k))||!request.source||!Array.isArray(request.path??[]))fail('Bohrungszweig und vorhandene Ersatzquelle ausdrücklich wählen.');
 const project=structuredClone(input),selected=cadSelectionContext(project,{rootId:id,path:request.path??[]}),source=cadSelectionContext(project,request.source);
 if(selected.locked||selected.hidden||selected.sourceGeometryReadonly||!selected.node.drill)fail('Einen editierbaren aktiven Bohrungszweig wählen.');
 if(source.locked||source.hidden||source.chain.some(n=>n.suppressed)||source.node.kind!=='cad'||!source.node.solid)fail('Eine sichtbare aktuelle CAD-Ersatzquelle wählen.');
 const node=source.node,version=node.source==='native'&&node.recipe?.type==='box'?1:node.source==='native'&&node.recipe?.type==='cylinder'&&node.recipe.size[0]===node.recipe.size[1]?2:node.source==='step'?3:null;
 if(!version||node.children)fail('Eine native Quader-/Kreiszylinderquelle oder eine einzelne STEP-Quelle wählen.');
 for(const pattern of project.linkedPatterns?.patterns??[])if(pattern.sourceId===source.root.id||pattern.instances.some(i=>i.id===source.root.id)){const problems=cadLinkedPatternProblems(project,pattern);if(problems.length)fail(problems[0].message,problems[0].code);}
 const sourceProblems=cadProjectParameterProblems(project).filter(p=>p.target&&key(p.target)===key(source.target));if(sourceProblems.length)fail('Maße der Ersatzquelle zuerst ausdrücklich aktualisieren.');
 const branch=cadDrillSourceBranch(project,selected.target),chainPath=branch.rootTarget.path,drills=branch.drills;
 for(const entry of drills)if(!bindings.some(binding=>JSON.stringify(binding.path??[])===JSON.stringify(entry.target.path)))fail('Beim Quellenersatz alle Bohrungen dieses Zweigs und gegebenenfalls ihre Zielflächen ausdrücklich neu wählen.');
 if(version===3&&drills.some(entry=>entry.drill.pattern))fail('STEP-Ersatzquellen unterstützen keine Bohrungsmuster. Das Muster vorher ausdrücklich bearbeiten oder lösen.');
 const bottom=drills.at(-1),stockParent=cadSelectionContext(project,branch.stockParentTarget).node,current=branch.stockNode,stockPath=branch.stockTarget.path,parentWorld=branch.stockParentWorld;
 const allIds=new Set();function ids(n){allIds.add(n.id);for(const child of n.children??[])ids(child);}project.nodes.forEach(ids);
 const previousStockTarget={rootId:id,path:[...stockPath]};
 let stockId=current?.id??bottom.drill.sourceId;
 if(!current&&allIds.has(stockId)){const prefix='drill-stock-'+cadGeometryDigest(JSON.stringify([id,chainPath,source.target])).slice(0,32);stockId=prefix;let suffix=1;while(allIds.has(stockId))stockId=prefix+'-'+suffix++;}
 const stockTarget={rootId:id,path:[...stockPath.slice(0,-1),stockId]},oldNode=current?structuredClone(current):null,stock={...structuredClone(current??node),id:stockId,kind:'cad',solid:true,source:node.source,transform:multiplyCadMatrices(inverseCadMatrix(parentWorld),source.world),brep:structuredClone(node.brep),stats:structuredClone(node.stats)};
 for(const field of ['children','operation','finish','partition','extraction','modeling','drill','geometryIdentity','recipe','constructionBudget','annotations'])delete stock[field];
 if(node.recipe)stock.recipe=structuredClone(node.recipe);if(node.constructionBudget!==undefined)stock.constructionBudget=node.constructionBudget;if(current?.annotations)stock.annotations=structuredClone(current.annotations);
 const metadata=structuredClone(current?.metadata??node.metadata??{});for(const field of ['freecadSource','parametricSource','importedFile','plugin','photoReconstruction','stepFaceColors']){delete metadata[field];if(node.metadata?.[field]!==undefined)metadata[field]=structuredClone(node.metadata[field]);}if(Object.keys(metadata).length)stock.metadata=metadata;else delete stock.metadata;
 if(current)stockParent.children=stockParent.children.map(child=>child.id===current.id?stock:child);else stockParent.children=[stock];
 for(const entry of drills){const drillNode=cadSelectionContext(project,entry.target).node;drillNode.drill={...drillNode.drill,sourceId:drillNode.children[0].id,boxId:stockId};}
 const plan={project,sourceTarget:source.target,sourceNode:structuredClone(node),stockTarget,previousStockTarget,oldNode,version,drills,requiredRootIds:[id,source.target.rootId]};
 if(project.projectParameters)project.projectParameters=remapCadDrillStockParameters(project.projectParameters,plan);
 if(key(previousStockTarget)!==key(stockTarget)&&project.contourLinks)project.contourLinks=reparentCadContourLinks(project,[{from:previousStockTarget,to:stockTarget}],{previousProject:input});
 return plan;
}
