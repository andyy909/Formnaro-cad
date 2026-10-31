import {buildCadDependencyGraph,cadDependencyAffected,cadDependencyNodeId} from './cad-dependency-graph.js';
import {planCadProjectParameters,createCadProjectParameters} from './cad-project-parameters-data.js';
import {planCadContourLinks} from './cad-linked-contours-data.js';

/** Host authority follows the same explicit contour/parameter dependency
 * seeds. An unrelated missing program must not block a local source repair. */
export function planCadAssociativeFreeCAD(project,operation){
 const parameters=planCadProjectParameters(project,operation.data??project.projectParameters??createCadProjectParameters(),{variantId:operation.variantId}),links=operation.links??project.contourLinks,contours=planCadContourLinks(project,links,{projectParameters:parameters.data,allowPendingParameters:true}),graph=buildCadDependencyGraph({...project,...(operation.drawingsDraft?{drawings:operation.drawingsDraft}:{})},{projectParameters:parameters.data,contourLinks:links}),known=new Set(graph.nodes.map(node=>node.id)),seeds=[],full=operation.data!==undefined||operation.variantId!==undefined;
 for(const id of new Set([...(operation.updateIds??(full||operation.drawingSheetIds?.length?[]:contours.changedLinks.map(link=>link.id))),...(operation.rebindIds??[])]))seeds.push(cadDependencyNodeId('contour',id));
 for(const edit of operation.edits??[])seeds.push(cadDependencyNodeId('geometry',edit.target));
 if(operation.create?.targetId)seeds.push(cadDependencyNodeId('geometry',{rootId:operation.create.targetId,path:[]}));
 const needed=new Set(seeds.filter(id=>known.has(id))),parents=new Map();for(const edge of graph.edges){const list=parents.get(edge.to)??[];list.push(edge.from);parents.set(edge.to,list);}
 for(const sheet of (operation.drawingsDraft??project.drawings)?.sheets??[])if(operation.drawingSheetIds?.includes(sheet.id))for(const view of sheet.views)for(const rootId of view.sourceIds)needed.add(cadDependencyNodeId('geometry',{rootId,path:[]}));
 const queue=[...needed];for(let index=0;index<queue.length;index++)for(const parent of parents.get(queue[index])??[])if(!needed.has(parent)){needed.add(parent);queue.push(parent);}
 for(const link of contours.changedLinks){const id=cadDependencyNodeId('contour',link.id);if(needed.has(id))seeds.push(id);}
 for(const binding of parameters.changedBindings){const id=cadDependencyNodeId('binding',binding.id);if(full||needed.has(id))seeds.push(id);}
 for(const state of parameters.changedStates)if(state.geometryChanged){const id=cadDependencyNodeId('geometry',state.target);if(full||needed.has(id))seeds.push(id);}
 const downstream=cadDependencyAffected(graph,[...new Set(seeds)].filter(id=>known.has(id)));
 const required=new Set([...needed,...downstream.map(node=>node.id)]),pending=[...required];for(let index=0;index<pending.length;index++)for(const parent of parents.get(pending[index])??[])if(!required.has(parent)){required.add(parent);pending.push(parent);}
 const requiredRootIds=[...new Set([...graph.nodes.filter(node=>required.has(node.id)&&node.target).map(node=>node.target.rootId),operation.create?.source?.rootId].filter(id=>project.nodes.some(node=>node.id===id)))];
 return {data:parameters.data,variantId:operation.variantId,freecadTargets:downstream.filter(node=>node.kind==='freecadRun').map(node=>node.target),requiredRootIds};
}
