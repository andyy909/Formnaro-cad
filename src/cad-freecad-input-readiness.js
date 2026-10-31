import {planCadProjectParameters} from './cad-project-parameters-data.js';
import {planCadContourLinks} from './cad-linked-contours-data.js';
import {assertCadLinkedPatternCopyReady} from './cad-linked-pattern-data.js';
import {cadDependencyNodeId,cadDependencyAffected} from './cad-dependency-graph.js';
import {freeCADTargetKey,isFreeCADParameterField} from './cad-freecad-parameter-data.js';

// Never stamp a fresh program receipt from an old upstream result. This check
// precedes all native jobs and permits only updates in the derived run scope.
export function assertFreeCADInputReadiness(project,{data,graph,inputTargets,freecadTargets=[],bindingIds=[]}){
 const fail=message=>{throw Object.assign(Error('FreeCAD-Eingabe zuerst aktualisieren oder ausdrücklich in den gemeinsamen Neulauf aufnehmen. '+message),{code:'FREECAD_RERUN_STALE_INPUT'});};
 const parents=new Map();for(const edge of graph.edges){const list=parents.get(edge.to)??[];list.push(edge.from);parents.set(edge.to,list);}
 const needed=new Set(),queue=inputTargets.flatMap(target=>['geometry','worldFrame'].map(kind=>cadDependencyNodeId(kind,target)));for(let i=0;i<queue.length;i++){const id=queue[i];if(needed.has(id))continue;needed.add(id);queue.push(...parents.get(id)??[]);}
 const scheduled=new Set(freecadTargets.map(freeCADTargetKey)),bindings=new Set(bindingIds),parameters=planCadProjectParameters(project,data),stale=new Set(parameters.staleBindingIds);
 for(const binding of parameters.evaluation.bindings)if(needed.has(cadDependencyNodeId('binding',binding.id))&&stale.has(binding.id)&&!bindings.has(binding.id)&&!(isFreeCADParameterField(binding.field)&&scheduled.has(freeCADTargetKey(binding.target))))fail('Die Eingabe enthält ein veraltetes oder verlorenes Projektmaß: '+binding.id+'.');
 for(const state of parameters.changedStates)if(state.geometryChanged&&needed.has(cadDependencyNodeId('geometry',state.target)))fail('Der Variantenstatus der Eingabe ist noch nicht übernommen.');
 const seeds=[...freecadTargets.map(target=>cadDependencyNodeId('freecadRun',target)),...bindingIds.map(id=>cadDependencyNodeId('binding',id))],effects=cadDependencyAffected(graph,seeds),updating=new Set(effects.filter(node=>node.kind==='contour').map(node=>node.linkId));
 if(effects.some(node=>node.kind==='pattern'&&needed.has(node.id)))fail('Eine gewählte Körpermusterkopie würde durch diesen Neulauf veralten. Das Muster zuerst gesondert aktualisieren oder die Eingabe ausdrücklich lösen.');
 if(project.contourLinks?.links.length){const contours=planCadContourLinks(project,project.contourLinks,{projectParameters:data,allowPendingParameters:true}),required=new Set(graph.nodes.filter(node=>node.kind==='contour'&&needed.has(node.id)).map(node=>node.linkId));for(const problem of contours.problems)if(!problem.linkId||required.has(problem.linkId))fail(problem.message);for(const link of contours.changedLinks)if(required.has(link.id)&&!updating.has(link.id))fail('Die gewählte Kontur ist veraltet: '+link.id+'.');}
 const ids=[...new Set(graph.nodes.filter(node=>node.target&&needed.has(node.id)).map(node=>node.target.rootId))];try{assertCadLinkedPatternCopyReady({...project,projectParameters:data},ids);}catch(error){fail(error.message);}
}
