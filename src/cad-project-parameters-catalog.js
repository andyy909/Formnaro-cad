import {FREECAD_PARAMETER_PREFIX} from './cad-freecad-parameter-data.js';
import {SCHEMAS} from './parameters.js';
import {cadSelectionContext,cadFormLocalDimensions,cadInterfaceLocalBounds} from './cad-interface-state.js';
import {cadPoint} from './cad-affine.js';

// This catalog reads retained values only: no worker, geometry construction or
// expression rewriting occurs while opening the parameter editor.
export const cadParameterLiteral=value=>(typeof value==='number'&&Number.isFinite(value))||(typeof value==='string'&&/^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\s*$/.test(value)&&Number.isFinite(Number(value)));
const localFields=['width','depth','diameter','height'];
const numeric=value=>cadParameterLiteral(value)?Number(value):null;
export function cadProjectParameterCatalog(project,{targets}={}){
 if(targets===undefined)targets=(project.nodes??[]).filter(n=>n.kind==='cad').map(n=>({rootId:n.id,path:[]}));
 if(!Array.isArray(targets)||targets.length>500)throw Error('Höchstens 500 Parameterziele auswählen.');
 return targets.map(target=>{
  const context=cadSelectionContext(project,target),{node}=context,fields=[],driven=project.contourLinks?.links.some(link=>link.target.rootId===target.rootId&&JSON.stringify(link.target.path)===JSON.stringify(target.path)),blocked=context.locked?'Objekt, Quelle oder Container ist gesperrt.':context.sourceGeometryReadonly?'Diese erhaltene Geometriequelle ist geschützt.':node.kind!=='cad'?'Projektmaße benötigen native CAD-Teile.':null;
  const add=(field,label,value,{unit='mm',literal=true,reason}={})=>{if(driven&&field.startsWith('sketch.elements.'))reason='Diese Kontur folgt ihrer Quelle. Ein freies Quellmaß binden oder die Verknüpfung lösen; die Zielhöhe bleibt bearbeitbar.';const bindable=!blocked&&!reason&&(!literal||cadParameterLiteral(value));fields.push({field,label,value:numeric(value)??value,unit,bindable,...(!bindable?{reason:blocked??reason??'Abgeleitete Formel erhalten. Stattdessen das freie Ausgangsmaß binden.'}:{})});};
  if(node.kind==='cad'){
   const sizes=cadFormLocalDimensions(node),bounds=cadInterfaceLocalBounds(node),center=cadPoint(node.transform,bounds.min.map((v,k)=>(v+bounds.max[k])/2));
   for(let k=0;k<3;k++){add('size.'+k,['Objektbreite','Objekttiefe','Objekthöhe'][k],sizes[k]);add('pos.'+k,(target.path.length?'Lokaler Mittelpunkt ':'Welt-Mittelpunkt ')+['X','Y','Z'][k],center[k]);}
   if(node.source==='step'&&(node.metadata?.freecadSource?.script||node.metadata?.freecadSource?.plan)){const source=node.metadata.freecadSource;for(const [key,value]of Object.entries((source.script??source.plan).parameters??{}))if(typeof value==='number'&&Number.isFinite(value)&&key.length&&key.length<=260&&!/[\x00-\x1f]/.test(key)&&!['__proto__','constructor','prototype'].includes(key))add(FREECAD_PARAMETER_PREFIX+key,'FreeCAD-Programmparameter '+key,value,{unit:''});}
   if(node.source==='native'){
    for(const field of SCHEMAS[node.recipe?.type]??[])if(!field.options&&field.key!=='edgeSteps'&&typeof node.recipe.params?.[field.key]==='number')add('params.'+field.key,field.label??field.key,node.recipe.params[field.key],{unit:field.unit??'mm'});
    const sketch=node.recipe?.sketch;if(sketch){
     for(const relation of sketch.constraints??[])if(['length','distance','radius','angle'].includes(relation.type))add('sketch.constraints.'+relation.id+'.value','Skizzenbedingung '+relation.type,relation.value,{unit:relation.type==='angle'?'°':'mm'});
     for(const variable of sketch.variables??[])add('sketch.variables.'+variable.name,'Skizzenmaß '+variable.name,variable.value);
     for(const key of localFields)if(sketch.dimensions?.[key]!==undefined)add('sketch.dimensions.'+key,'Skizze '+({width:'Breite',depth:'Tiefe',diameter:'Durchmesser',height:'Extrusionshöhe'}[key]),sketch.dimensions[key]);
     if([2,3].includes(sketch.version))for(const [index,element] of (sketch.elements??[]).entries()){
      const label='Konturelement '+(index+1);
      if(element.diameter!==undefined)add('sketch.elements.'+element.id+'.diameter',label+' · Durchmesser',element.diameter);
      for(const key of ['start','through','end','center'])if(Array.isArray(element[key]))for(let axis=0;axis<2;axis++)add('sketch.elements.'+element.id+'.'+key+'.'+axis,label+' · '+({start:'Anfang',through:'Bogenpunkt',end:'Ende',center:'Mittelpunkt'}[key])+' '+['X','Y'][axis],element[key][axis]);
     }
    }
   }
   if(node.source==='modeling'){
    const model=node.modeling;
    if(model.kind==='face-offset')add('modeling.offset','Flächenversatz',model.offset);
    if(model.kind==='shell')add('modeling.thickness','Wandstärke',model.thickness);
    if(model.kind==='sweep')for(const key of ['length','radius','angle'])if(model.path?.[key]!==undefined)add('modeling.path.'+key,({length:'Sweep-Pfadlänge',radius:'Sweep-Biegeradius',angle:'Sweep-Biegewinkel'}[key]),model.path[key],{unit:key==='angle'?'°':'mm'});
   }
  }
  return {target:{rootId:target.rootId,path:[...target.path]},label:node.name??node.id,fields};
 });
}

export function cadProjectParameterField(project,target,field){const record=cadProjectParameterCatalog(project,{targets:[target]})[0],property=record.fields.find(f=>f.field===field);if(!property)throw Error('Das gebundene native Maß fehlt oder ist nicht numerisch.');if(!property.bindable)throw Error(property.reason);return property;}
