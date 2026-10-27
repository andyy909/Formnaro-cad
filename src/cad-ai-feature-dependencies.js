import {cadSelectionContext} from './cad-interface-state.js';
import {evaluateCadProjectParameters,createCadProjectParameters,cadProjectParameterLiteral} from './cad-project-parameters-data.js';
import {buildCadDependencyGraph,cadDependencyAffected,cadDependencyNodeId} from './cad-dependency-graph.js';

export const cadAIFeatureTargetKey=t=>JSON.stringify([t.rootId,t.path]);
const key=cadAIFeatureTargetKey,fieldKey=b=>key(b.target)+'/'+b.field;
const fail=(message,code='AI_FEATURE_DEPENDENCY_INVALID')=>{throw Object.assign(Error('Merkmalsabhängigkeiten: '+message),{code});};
const close=(a,b)=>Math.abs(a-b)<=Math.max(1e-8,Math.abs(b)*1e-10);

// Exact affine arithmetic over one explicitly determined free input. Constants
// and formulas are retained; several possible inputs or nonlinear inverses are
// diagnosed instead of silently replacing a formula with the requested number.
function affineExpression(value,resolve){
 const text=String(value).replaceAll('−','-'),tokens=text.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/]/g)??[];if(tokens.join('')!==text.replace(/\s/g,''))fail('Ungültige Parameterformel.');let at=0,depth=0;
 const add=(a,b,sign=1)=>[a[0]+sign*b[0],a[1]+sign*b[1]];
 function atom(){if(++depth>32)fail('Parameterformel zu tief.');const t=tokens[at++];let v;if(t==='+'||t==='-'){v=atom();if(t==='-')v=v.map(n=>-n);}else if(t==='('){v=sum();if(tokens[at++]!==')')fail('Klammer fehlt.');}else if(/^[A-Za-z_]/.test(t??'')){if(tokens[at]==='('){at++;const x=sum();if(tokens[at++]!==')'||!['sind','cosd'].includes(t)||x[0]!==0)fail('Diese Winkelformel benötigt eine ausdrückliche Wahl ihres freien Ausgangsmaßes.','AI_FEATURE_PARAMETER_FORMULA');v=[0,(t==='sind'?Math.sin:Math.cos)(x[1]*Math.PI/180)];}else v=resolve(t);}else if(t!==undefined&&/^(?:\d|\.)/.test(t))v=[0,Number(t)];else fail('Unvollständige Parameterformel.');depth--;return v;}
 function product(){let v=atom();while(['*','/'].includes(tokens[at])){const op=tokens[at++],b=atom();if(op==='*'){if(v[0]!==0&&b[0]!==0)fail('Nichtlineares Maß: freies Ausgangsmaß ausdrücklich wählen.','AI_FEATURE_PARAMETER_FORMULA');v=[v[0]*b[1]+b[0]*v[1],v[1]*b[1]];}else{if(b[0]!==0||b[1]===0)fail('Mehrdeutige oder nichtlineare Maßumkehr. Freies Ausgangsmaß wählen.','AI_FEATURE_PARAMETER_FORMULA');v=v.map(n=>n/b[1]);}}return v;}
 function sum(){let v=product();while(['+','-'].includes(tokens[at])){const op=tokens[at++];v=add(v,product(),op==='+'?1:-1);}return v;}
 const result=sum();if(at!==tokens.length||result.some(n=>!Number.isFinite(n)))fail('Parameterformel nicht eindeutig auswertbar.');return result;
}
function parameterInput(evaluation,parameterId,wanted){
 const data=evaluation.data,variant=data.variants.find(v=>v.id===data.activeVariantId),defs=new Map(data.parameters.map(p=>[p.id,p.value])),byName=new Map(data.parameters.map(p=>[p.name,p.id]));for(const p of variant?.values??[])defs.set(p.parameterId,p.value);
 const leaves=new Set(),visited=new Set();function collect(id){if(visited.has(id))return;visited.add(id);if(cadProjectParameterLiteral(defs.get(id))!==null)leaves.add(id);else for(const source of evaluation.dependencies[id])collect(source);}collect(parameterId);
 if(leaves.size!==1)fail('Das gewählte Maß hat '+leaves.size+' freie Parametereingänge. Den gewünschten freien Eingang ausdrücklich auswählen.','AI_FEATURE_PARAMETER_AMBIGUOUS');const inputId=[...leaves][0],memo=new Map();
 function read(id){if(memo.has(id))return memo.get(id);const value=id===inputId?[1,0]:affineExpression(defs.get(id),name=>read(byName.get(name)));memo.set(id,value);return value;}const [a,b]=read(parameterId);if(a===0)fail('Das freie Ausgangsmaß beeinflusst dieses Ergebnis nicht eindeutig.','AI_FEATURE_PARAMETER_FORMULA');const value=(wanted-b)/a;if(!Number.isFinite(value)||Math.abs(value)>100000)fail('Abgeleitetes Ausgangsmaß außerhalb des zulässigen Bereichs.');return {parameterId:inputId,value};
}

/** Kernel-free plan, derived solely from human-selected targets and existing
 * scalar/contour/drawing edges. A model cannot supply a dependency target list. */
export function planCadAIFeatureDependencies(project,controls,{targets=controls.map(b=>b.target)}={}){
 const baseline=evaluateCadProjectParameters(project.projectParameters??createCadProjectParameters()),data=structuredClone(baseline.data),requested=new Map(),inputs=new Map(),direct=[];
 for(const control of controls){const k=fieldKey(control);if(!Number.isFinite(control.value)||requested.has(k)&&!close(requested.get(k),control.value))fail('Widersprüchliche Maße für dieselbe Quelle.');requested.set(k,control.value);const binding=baseline.bindings.find(b=>fieldKey(b)===k);if(binding){if(close(binding.value,control.value))continue;const input=parameterInput(baseline,binding.parameterId,control.value),previous=inputs.get(input.parameterId);if(previous!==undefined&&!close(previous,input.value))fail('Die ausgewählten Maße widersprechen ihrem gemeinsamen Projektparameter.','AI_FEATURE_PARAMETER_CONFLICT');inputs.set(input.parameterId,input.value);}else if(!control.intrinsic)direct.push({target:control.target,field:control.field,value:control.value});}
 for(const [id,value]of inputs){if(close(baseline.values[id],value))continue;if(data.activeVariantId===null)data.parameters.find(p=>p.id===id).value=value;else{const variant=data.variants.find(v=>v.id===data.activeVariantId),entry=variant.values.find(p=>p.parameterId===id);if(entry)entry.value=value;else variant.values.push({parameterId:id,value});}}
 const evaluated=evaluateCadProjectParameters(data),changedBindings=evaluated.bindings.filter(b=>!close(b.value,baseline.bindings.find(old=>old.id===b.id).value)),parameterChanges=data.parameters.flatMap(p=>{const old=baseline.values[p.id],value=evaluated.values[p.id];return close(old,value)?[]:[{id:p.id,name:p.name,before:old,value,directInput:inputs.has(p.id),variantId:data.activeVariantId}];});
 for(const control of controls){const binding=evaluated.bindings.find(b=>fieldKey(b)===fieldKey(control));if(binding&&!close(binding.value,control.value))fail('Die erhaltene Parameterformel bestätigt das gewünschte Maß nicht.','AI_FEATURE_PARAMETER_CONFLICT');}
 const graph=buildCadDependencyGraph(project,{projectParameters:data}),seeds=new Set();for(const t of targets){seeds.add(cadDependencyNodeId('geometry',t));seeds.add(cadDependencyNodeId('localPose',t));}for(const b of changedBindings)seeds.add(cadDependencyNodeId('binding',b.id));const affected=cadDependencyAffected(graph,[...seeds]),contours=affected.filter(n=>n.kind==='contour'),drawingViews=affected.filter(n=>n.kind==='drawingView'),uniqueTargets=new Map(targets.map(t=>[key(t),structuredClone(t)]));for(const b of changedBindings)uniqueTargets.set(key(b.target),b.target);for(const link of contours)uniqueTargets.set(key(link.target),link.target);
 // Retain affine controls on reconstructed ancestors and dependent profiles.
 const nodeIds=new Set(affected.filter(n=>n.kind==='geometry').map(n=>n.target.path.at(-1)??n.target.rootId)),bindings=evaluated.bindings.filter(b=>changedBindings.some(c=>c.id===b.id)||nodeIds.has(b.target.path.at(-1)??b.target.rootId));
 for(const b of bindings)uniqueTargets.set(key(b.target),b.target);const targetsResult=[...uniqueTargets.values()];for(const t of targetsResult){const c=cadSelectionContext(project,t);if(c.locked||c.hidden||c.sourceGeometryReadonly)fail('Eine notwendige abhängige Quelle ist gesperrt, ausgeblendet oder geometrisch geschützt.','AI_FEATURE_DEPENDENCY_LOCKED');}
 const selected=new Set(targets.map(key)),sources=targetsResult.filter(t=>!selected.has(key(t))).map(t=>({target:t,name:cadSelectionContext(project,t).node.name})),review={version:1,parameters:parameterChanges,sources,contours:contours.map(n=>({id:n.linkId,source:n.source,target:n.target,name:cadSelectionContext(project,n.target).node.name})),drawingViews:drawingViews.map(n=>({sheetId:n.sheetId,viewId:n.viewId}))};review.requiresAcceptance=!!(parameterChanges.length||sources.length||contours.length||drawingViews.length);
 return {data,bindings:direct,parameterBindingIds:bindings.map(b=>b.id),changedBindings,targets:targetsResult,selectedTargets:targets,contourIds:contours.map(n=>n.linkId),drawingViews:review.drawingViews,review};
}
