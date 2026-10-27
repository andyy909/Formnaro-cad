import {cadSelectionContext} from './cad-interface-state.js';
import {cloneCadSources} from './cad-source-clone.js';
import {multiplyCadMatrices} from './cad-affine.js';
import {captureCadContourSourceClosure,copyCadContourLinks,remapCadContourLinks,validateCadContourLinks} from './cad-linked-contours-data.js';
import {captureCadProjectParameterClipboard} from './cad-project-parameters-clipboard.js';
import {copyCadProjectParameterReferences} from './cad-project-parameters-references.js';
import {mergeCadProjectParameters,stampCadProjectParameters} from './cad-project-parameters-data.js';
import {remapCadJoints,validateCadJoints} from './cad-joints-data.js';

const within=(target,family)=>target.rootId===family.rootId&&target.path.length>=family.path.length&&family.path.every((id,index)=>target.path[index]===id);
function families(targets){return targets.filter((target,index)=>!targets.some((family,other)=>other!==index&&within(target,family)&&(target.path.length>family.path.length||other<index))).map(target=>structuredClone(target));}
function worldNode(project,target){const context=cadSelectionContext(project,target),node=structuredClone(context.node);node.transform=[...context.world];delete node.suppressed;return node;}

// The original frozen project is a private read reference. It keeps exact source
// addresses available for correspondence; clipboard data is never persisted.
export function captureCadLinkedClipboard(project,targets,{scope}={}){
 const selected=families(targets),nodes=selected.map(target=>worldNode(project,target)),closure=captureCadContourSourceClosure(project,selected);
 const closureNodes=closure.nodes.map(node=>structuredClone(node));
 return {scope,project,targets:selected,nodes,sourceParameters:project.projectParameters?structuredClone(project.projectParameters):undefined,parameterData:captureCadProjectParameterClipboard(project,selected),closure:{...closure,nodes:closureNodes,parameterData:captureCadProjectParameterClipboard(project,closure.targets)}};
}

// Mutates only the transaction's private draft. All source/link/parameter limits
// are checked before that transaction can publish a common single undo step.
export function insertCadLinkedClipboard(draft,clipboard,{scope,offset=[10,10,0]}={}){
 const sameProject=scope!==undefined&&scope===clipboard.scope,source=sameProject?clipboard:clipboard.closure,mapping=new Map(),copies=[],delta=[1,0,0,0,0,1,0,0,0,0,1,0,...offset,1];
 for(const original of source.nodes){const node=cloneCadSources(original,{mapping});node.layerId=draft.activeLayerId;node.folderId=draft.activeFolderId;node.transform=multiplyCadMatrices(delta,node.transform);draft.nodes.push(node);copies.push(node);}
 const routes=source.targets.map((from,index)=>({from,to:{rootId:copies[index].id,path:[]}}));
 let importParameters=!sameProject;if(sameProject&&clipboard.sourceParameters){const prior=draft.projectParameters;try{for(const route of routes)draft.projectParameters=copyCadProjectParameterReferences(draft,{...route,mapping,sourceData:clipboard.sourceParameters});}catch(error){if(error.code!=='PARAMETER_COPY_GRAPH_MISMATCH')throw error;draft.projectParameters=prior;importParameters=true;}}
 if(importParameters&&source.parameterData){const prior=draft.projectParameters,merged=mergeCadProjectParameters(prior,source.parameterData,{nodeIds:mapping}).data;draft.projectParameters=merged;try{draft.projectParameters=stampCadProjectParameters(draft,merged);}catch(error){if(!['PARAMETER_RESULT_MISMATCH','LOST_PARAMETER_TARGET','LOST_PARAMETER_FIELD','PARAMETER_TARGET_NOT_LITERAL'].includes(error.code))throw error;if(prior?.applied)draft.projectParameters.applied=structuredClone(prior.applied);}}
 if(sameProject&&clipboard.project.contourLinks){for(const route of routes)draft.contourLinks=copyCadContourLinks(draft,{...route,routes,mapping,previousProject:clipboard.project,sourceData:clipboard.project.contourLinks});}
 else if(source.contourLinks?.links.length){const previousProject={...clipboard.project,nodes:source.nodes,contourLinks:source.contourLinks},remapped=remapCadContourLinks(source.contourLinks,mapping,{previousProject,project:draft}).data;draft.contourLinks=validateCadContourLinks({version:1,links:[...(draft.contourLinks?.links??[]),...remapped.links]});}
 if(clipboard.project.joints){const copied=remapCadJoints(clipboard.project.joints,mapping);if(copied.joints.length)draft.joints=validateCadJoints({version:1,bases:[...new Set([...(draft.joints?.bases??[]),...copied.bases])],joints:[...(draft.joints?.joints??[]),...copied.joints]});}
 const targets=clipboard.nodes.map(node=>({rootId:mapping.get(node.id),path:[]}));
 return {targets,mapping,sameProject,addedSources:sameProject?0:source.addedTargets.length};
}
