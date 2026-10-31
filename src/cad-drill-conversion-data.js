import {cadIdentity} from './cad-affine.js';
import {reparentCadProjectParameterReferences} from './cad-project-parameters-references.js';
import {reparentCadContourLinks} from './cad-linked-contours-data.js';
import {cadSelectionContext} from './cad-interface-state.js';
import {evaluateCadProjectParameters,refreshCadProjectParameterCorrespondence} from './cad-project-parameters-data.js';
import {CAD_DRILL_SCALAR_FIELDS} from './cad-drill-parameter-fields.js';

const fail=message=>{throw Object.assign(Error(message),{code:'INVALID_CAD_DRILL_CONVERSION'});};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/** Preserve the authored CSG tree. Former cutters become inactive source
 * definitions; the explicit drill recipe is the only active replacement cut. */
export function prepareCadDrillConversionStock(legacy,{makeId=()=>crypto.randomUUID(),target={rootId:legacy.id,path:[]}}={}){
 if(!legacy.solid||legacy.suppressed||legacy.source!=='group'||legacy.drill||legacy.finish||legacy.partition||legacy.extraction||legacy.modeling)fail('Eine aktive alte Bohrgruppe ohne geschützte Nachbearbeitung wählen.');
 const stock=structuredClone(legacy),suppressedIds=[];stock.id=makeId();stock.transform=cadIdentity();
 // These attributes still belong to the retained result-root, with their
 // original IDs/coordinates. Do not duplicate marking identities in the stock.
 delete stock.annotations;delete stock.metadata;delete stock.geometryIdentity;
 stock.name=(legacy.name+' · ursprüngliche Quellen').slice(0,200);
 function strip(node){
  if(node.source!=='group'||node.drill)return;
  if(node.finish||node.partition||node.extraction||node.modeling||!['union','intersection'].includes(node.operation))fail('Geschützte Bearbeitungsquellen benötigen eine eigene ausdrückliche Zuordnung.');
  const active=node.children.filter(child=>!child.suppressed),positive=active.filter(child=>child.solid);
  if(positive.length!==1)fail('Die alte Bohrkonstruktion benötigt je Gruppenebene genau eine aktive positive Quelle.');
  for(const child of active)if(!child.solid){child.suppressed=true;suppressedIds.push(child.id);}
  strip(positive[0]);
 }
 strip(stock);
 if(!suppressedIds.length)fail('Die gewählte alte Gruppe enthält keine aktiven Bohrwerkzeuge.');
 return {stock,suppressedIds,target:structuredClone(target),moves:legacy.children.map(child=>({from:{rootId:target.rootId,path:[...target.path,child.id]},to:{rootId:target.rootId,path:[...target.path,stock.id,child.id]}}))};
}

/** Only the inserted address component moves. Result-root references retain
 * their identity and topology receipts are never renewed merely by moving. */
export function reparentCadDrillConversionReferences(project,previous,rootId,stockId,moves){
 const moved=target=>{const move=moves.find(move=>target?.rootId===move.from.rootId&&target.path?.length>=move.from.path.length&&move.from.path.every((part,i)=>part===target.path[i]));return move?{rootId:move.to.rootId,path:[...move.to.path,...target.path.slice(move.from.path.length)]}:target;};
 if(project.projectParameters)project.projectParameters=reparentCadProjectParameterReferences(project,moves);
 if(project.contourLinks)project.contourLinks=reparentCadContourLinks(project,moves,{previousProject:previous});
 const reference=project.workplane.reference;if(reference?.objectId===rootId)reference.topology.origin={...reference.topology.origin,...moved(reference.topology.origin)};
 for(const item of project.featureReferences?.items??[]){item.target=moved(item.target);if(item.origin)item.origin.target=moved(item.origin.target);}
 function visit(node){for(const step of node.finish?.steps??[])for(const edge of step.edges){const next=moved(edge.origin);if(!same(next,edge.origin))edge.origin={...edge.origin,...next};}for(const child of node.children??[])visit(child);}
 for(const node of project.nodes)visit(node);
 return project;
}

export const CAD_DRILL_CONVERSION_BINDING_FIELDS=Object.freeze(CAD_DRILL_SCALAR_FIELDS.map(item=>item.field));
export function remapCadDrillConversionBindings(project,target,entries,suppressedIds){
 if(!Array.isArray(entries)||entries.length>500)fail('Bestehende Werkzeugbindungen ausdrücklich auswählen.');
 if(!entries.length)return [];
 const data=structuredClone(project.projectParameters);if(!data)fail('Keine gespeicherten Werkzeugbindungen vorhanden.');
 const selected=new Set(),fields=new Set(),inactive=new Set(suppressedIds),drill=cadSelectionContext(project,target).node.drill,evaluation=evaluateCadProjectParameters(data),mapped=[];
 for(const entry of entries){
  if(!entry||Object.getPrototypeOf(entry)!==Object.prototype||Object.keys(entry).some(key=>!['bindingId','field'].includes(key))||typeof entry.bindingId!=='string'||!CAD_DRILL_CONVERSION_BINDING_FIELDS.includes(entry.field)||selected.has(entry.bindingId)||fields.has(entry.field))fail('Jede vorhandene Werkzeugbindung und jedes neue Bohrungsmaß höchstens einmal ausdrücklich zuordnen.');
  const binding=data.bindings.find(binding=>binding.id===entry.bindingId);if(!binding)fail('Die ausgewählte Werkzeugbindung fehlt.');
  const context=cadSelectionContext(project,binding.target),within=binding.target.rootId===target.rootId&&binding.target.path.length>target.path.length&&target.path.every((part,i)=>part===binding.target.path[i]);
  if(!within||!context.chain.some(node=>inactive.has(node.id)))fail('Nur Bindungen an die erhaltenen stillgelegten Werkzeuge dieses Bohrmerkmals neu zuordnen.');
  const value=evaluation.bindings.find(item=>item.id===binding.id)?.value,actual=drill[entry.field.slice(6)];
  if(!Number.isFinite(value)||Math.abs(value-actual)>Math.max(1e-8,Math.abs(value)*Number.EPSILON*64))fail('Der aktive Parameterwert muss dem ausdrücklich bestätigten neuen Bohrungsmaß entsprechen.');
  if(data.bindings.some(other=>other.id!==binding.id&&same(other.target,target)&&other.field===entry.field))fail('Dieses Bohrungsmaß besitzt bereits eine andere gespeicherte Bindung.');
  mapped.push({bindingId:binding.id,from:{target:structuredClone(binding.target),field:binding.field},to:{target:structuredClone(target),field:entry.field}});binding.target=structuredClone(target);binding.field=entry.field;selected.add(binding.id);fields.add(entry.field);
 }
 project.projectParameters=refreshCadProjectParameterCorrespondence(project,data,{bindingIds:[...selected]});return mapped;
}

export function cadDrillConversionCandidates(project,rootId){
 const root=project.nodes.find(node=>node.id===rootId),items=[];if(!root)return items;
 function visit(node,path){
  const target={rootId,path:[...path]},context=cadSelectionContext(project,target);
  if(!context.locked&&!context.hidden&&!context.sourceGeometryReadonly&&!context.chain.some(node=>node.suppressed)&&!context.chain.slice(0,-1).some(node=>node.source!=='group'||node.drill||node.finish||node.partition||node.extraction||node.modeling))try{
   const plan=prepareCadDrillConversionStock(node,{target,makeId:()=> 'conversion-stock-catalog'});let source=node,sourcePath=[...path];
   while(source.source==='group'){const child=source.drill?source.children?.[0]:source.children?.find(child=>child.solid&&!child.suppressed);if(!child)break;source=child;sourcePath.push(source.id);}
   if(source.source==='step'||source.source==='native'&&(source.recipe?.type==='box'||source.recipe?.type==='cylinder'&&source.recipe.size[0]===source.recipe.size[1]&&(!source.recipe.params?.edgeSize||source.recipe.params?.edgeStyle==='none')))items.push({target,label:context.chain.map(node=>node.name).join(' / '),source:{rootId,path:sourcePath},suppressedIds:plan.suppressedIds});
  }catch{/* Unsupported source trees remain available through their own editors. */}
  for(const child of node.children??[])visit(child,[...path,child.id]);
 }
 visit(root,[]);return items;
}
