import {prepareFreeCADRerun} from './cad-freecad-rerun.js';
import {freeCADTargetKey} from './cad-freecad-parameter-data.js';
import {cadSelectionContext} from './cad-interface-state.js';
import {updateCadAssociative} from './cad-linked-contours-native.js';

// The primary program participates in the same ordered native pass as all
// changed scalar inputs and subsequent programs. It is never run twice.
export async function rerunBoundFreeCADNative(project,operation,{oc,service,editRecipe,freecadRun}={}){
 if(Object.keys(operation).some(key=>!['kind','request'].includes(key)))throw Error('Unbekannte Felder des gebundenen Programm-Neulaufs.');
 const prepared=prepareFreeCADRerun(project,operation.request),plan=prepared.coordinated;if(!plan)throw Error('Der Neulauf benötigt eine vorhandene globale FreeCAD-Parameterbindung.');
 const target=prepared.context.target,result=await updateCadAssociative(project,{kind:'associativeUpdate',data:plan.data},{oc,service,editRecipe,freecadRun,freecadRequest:{target,rerunTargets:prepared.rerunTargets,parameters:prepared.parameters,bindingIds:plan.bindingIds,targets:plan.targets}}),runs=result.report.freecad??[],primary=runs.find(run=>freeCADTargetKey(run.target)===freeCADTargetKey(target));
 if(!primary)throw Error('Der bestätigte primäre Programm-Neulauf fehlt.');
 const sources=plan.targets.filter(t=>freeCADTargetKey(t)!==freeCADTargetKey(target)).map(t=>({target:t,name:cadSelectionContext(project,t).node.name})),review={...plan.review,sources,drawingViews:plan.drawingViews,requiresAcceptance:!!(plan.review.requiresAcceptance||sources.length||result.warnings.length||prepared.inputRebindings.length)};
 return {...result,selectedTargets:[target],report:{...result.report,freecad:{...primary,changes:[],dependentChanges:[],parameterChanges:prepared.parameterChanges,replacesNative:prepared.replacesNative},freecadInputRebindings:prepared.inputRebindings,freecadFollowups:runs.filter(run=>run!==primary),freecadDependencies:review},changes:[{op:'freecadDocument',target}]};
}
